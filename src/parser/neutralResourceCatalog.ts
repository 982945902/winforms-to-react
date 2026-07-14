import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Collect string values exposed through the generated neutral `Resources`
 * class. Culture-specific files are intentionally excluded, and a key is
 * returned only when every neutral Resources.resx file that declares it agrees
 * on the same value. This keeps static previews deterministic across projects
 * that contain several resource namespaces with colliding keys.
 */
export async function collectUniqueNeutralResourceStrings(root: string): Promise<Map<string, string>> {
  const paths: string[] = [];
  await collectResourceFiles(root, paths);

  const values = new Map<string, Set<string>>();
  await Promise.all(paths.map(async (path) => {
    const source = await readFile(path, "utf8");
    const pattern = /<data\s+([^>]*)>[\s\S]*?<value(?:[^>]*)>([\s\S]*?)<\/value>[\s\S]*?<\/data>/g;
    for (const match of source.matchAll(pattern)) {
      if (/ResXFileRef|System\.Drawing\.(?:Bitmap|Icon|Image)/i.test(match[1])) continue;
      const name = match[1].match(/\bname="([A-Za-z_]\w*)"/)?.[1];
      if (!name) continue;
      const bucket = values.get(name) ?? new Set<string>();
      bucket.add(decodeXml(match[2].trim()));
      values.set(name, bucket);
    }
  }));

  return new Map([...values].flatMap(([key, bucket]) =>
    bucket.size === 1 ? [[key, [...bucket][0]] as const] : [],
  ));
}

async function collectResourceFiles(root: string, output: string[]): Promise<void> {
  const info = await stat(root);
  if (info.isFile()) {
    if (/^Resources\.resx$/i.test(basename(root))) output.push(root);
    return;
  }
  const skip = new Set([".git", "node_modules", "bin", "obj", "dist", ".next"]);
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  await Promise.all(entries
    .filter((entry) => !entry.isDirectory() || !skip.has(entry.name))
    .map((entry) => collectResourceFiles(join(root, entry.name), output)));
  output.sort();
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, number) => String.fromCodePoint(parseInt(number, 16))).replace(/&amp;/g, "&");
}
