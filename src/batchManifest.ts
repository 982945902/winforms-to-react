import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type MigrationBatchManifest = {
  $schema?: string;
  id?: string;
  description?: string;
  source?: { repository?: string; revision?: string };
  actionContracts?: string | string[];
  files: string[];
};

export async function loadBatchManifest(manifestPath: string, inputRoot: string): Promise<{ manifest: MigrationBatchManifest; files: string[]; actionContractPaths: string[] }> {
  const root = resolve(inputRoot);
  const resolvedManifestPath = resolve(manifestPath);
  if (!(await stat(root)).isDirectory()) throw new Error("Batch input must be a project directory");
  const raw = JSON.parse(await readFile(resolvedManifestPath, "utf8")) as Partial<MigrationBatchManifest>;
  if (!Array.isArray(raw.files) || raw.files.length === 0) throw new Error("Batch manifest must contain a non-empty files array");

  const files: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.files) {
    if (typeof entry !== "string" || entry.trim() === "") throw new Error("Batch manifest file entries must be non-empty strings");
    if (isAbsolute(entry)) throw new Error(`Batch manifest paths must be relative: ${entry}`);
    if (!/\.designer\.cs$/i.test(entry)) throw new Error(`Batch manifest entry is not a Designer file: ${entry}`);
    const file = resolve(root, entry);
    const local = relative(root, file);
    if (local === ".." || local.startsWith("..") || isAbsolute(local)) throw new Error(`Batch manifest path escapes the project root: ${entry}`);
    if (seen.has(file)) continue;
    try {
      if (!(await stat(file)).isFile()) throw new Error(`Batch manifest file is not readable: ${entry}`);
    } catch {
      throw new Error(`Batch manifest file is not readable: ${entry}`);
    }
    seen.add(file);
    files.push(file);
  }
  const actionContractPaths: string[] = [];
  if (raw.actionContracts !== undefined) {
    const entries = typeof raw.actionContracts === "string" ? [raw.actionContracts] : raw.actionContracts;
    if (!Array.isArray(entries) || entries.length === 0) throw new Error("Batch manifest actionContracts must be a non-empty relative path or array");
    const manifestDir = dirname(resolvedManifestPath);
    const seenContracts = new Set<string>();
    for (const entry of entries) {
      if (typeof entry !== "string" || !entry.trim() || isAbsolute(entry)) {
        throw new Error("Batch manifest actionContracts entries must be non-empty relative paths");
      }
      const actionContractPath = resolve(manifestDir, entry);
      const local = relative(manifestDir, actionContractPath);
      if (local === ".." || local.startsWith("..") || isAbsolute(local)) throw new Error("Batch manifest actionContracts path escapes the manifest directory");
      if (seenContracts.has(actionContractPath)) throw new Error(`Duplicate batch ActionContract path: ${entry}`);
      try {
        if (!(await stat(actionContractPath)).isFile()) throw new Error();
      } catch {
        throw new Error(`Batch manifest actionContracts file is not readable: ${entry}`);
      }
      seenContracts.add(actionContractPath);
      actionContractPaths.push(actionContractPath);
    }
  }
  return { manifest: { ...raw, files: [...raw.files] } as MigrationBatchManifest, files, actionContractPaths };
}
