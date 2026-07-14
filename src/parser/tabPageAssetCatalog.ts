import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { RuntimeAssetSource, VisualControl } from "../ir/types.js";
import { stripComments } from "./designerParser.js";
import { listCSharpFiles } from "./enumCatalog.js";

export type TabPageAssetRelation = {
  tabPageName: string;
  assetKey: string;
  source: RuntimeAssetSource;
};

/**
 * Resolve service-style WinForms navigation icons without executing the
 * registry. A relation is accepted only when the same class proves both its
 * config TabPage and a Resources-backed ServiceIcon/ServiceImage.
 */
export async function materializeTabPageAssets(controls: VisualControl[], contextPath: string): Promise<void> {
  const tabPages = new Map<string, VisualControl>();
  visitControls(controls, (control) => {
    if (control.kind === "TabPage") tabPages.set(control.name, control);
  });
  if (tabPages.size === 0) return;

  const catalog = await collectTabPageAssetCatalog(contextPath, new Set(tabPages.keys()));
  for (const [tabPageName, relation] of catalog) {
    const control = tabPages.get(tabPageName);
    if (!control) continue;
    if (!control.appearance.imageKey && !control.appearance.image) control.appearance.imageKey = relation.assetKey;
    const sources = control.runtimeAssetSources ?? [];
    if (!sources.some((source) => source.property === relation.source.property
      && source.value === relation.source.value && source.sourceFile === relation.source.sourceFile)) {
      sources.push(relation.source);
    }
    control.runtimeAssetSources = sources;
  }
}

export async function collectTabPageAssetCatalog(
  contextPath: string,
  requestedTabPages?: ReadonlySet<string>,
): Promise<Map<string, TabPageAssetRelation>> {
  const result = new Map<string, TabPageAssetRelation>();
  const files = await listCSharpFiles(resolve(contextPath));
  files.sort((a, b) => Number(!/(?:uploader|service)/i.test(basename(a)))
    - Number(!/(?:uploader|service)/i.test(basename(b))) || a.localeCompare(b));
  for (let offset = 0; offset < files.length; offset += 24) {
    const batch = files.slice(offset, offset + 24);
    const sources = await Promise.all(batch.map(async (file) => {
      try {
        return { file, source: await readFile(file, "utf8") };
      } catch {
        return { file, source: "" };
      }
    }));
    for (const { file, source } of sources) {
      for (const relation of parseTabPageAssetRelations(source, file)) {
        if (requestedTabPages && !requestedTabPages.has(relation.tabPageName)) continue;
        if (!result.has(relation.tabPageName)) result.set(relation.tabPageName, relation);
      }
    }
  }
  return result;
}

export function parseTabPageAssetRelations(source: string, sourcePath = "source.cs"): TabPageAssetRelation[] {
  const clean = stripComments(source);
  const result: TabPageAssetRelation[] = [];
  const classPattern = /\b(?:class|record)\s+[A-Za-z_]\w*\b[^\{;]*\{/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classPattern.exec(clean)) !== null) {
    const openBrace = clean.indexOf("{", classMatch.index);
    const closeBrace = matchingDelimiter(clean, openBrace, "{", "}");
    if (closeBrace === -1) continue;
    const body = clean.slice(openBrace + 1, closeBrace);
    const icon = expressionAsset(body) ?? blockAsset(body);
    const tab = expressionTabPage(body) ?? blockTabPage(body);
    if (icon && tab) {
      result.push({
        tabPageName: tab.name,
        assetKey: icon.key,
        source: {
          property: "imageKey",
          value: icon.key,
          expression: `${icon.expression}; ${tab.expression}`,
          sourceFile: basename(sourcePath),
          line: lineOf(clean, openBrace + 1 + Math.min(icon.index, tab.index)),
        },
      });
    }
    classPattern.lastIndex = closeBrace + 1;
  }
  return result;
}

function expressionAsset(body: string): { key: string; expression: string; index: number } | undefined {
  const match = /\b(?:public\s+)?(?:override\s+)?(?:[A-Za-z_]\w*\.)?(?:Icon|Image)\s+(?:ServiceIcon|ServiceImage)\s*=>\s*(?:[A-Za-z_]\w*\.)*Resources\.([A-Za-z_]\w*)\s*;/.exec(body);
  return match ? { key: match[1], expression: match[0].trim(), index: match.index } : undefined;
}

function blockAsset(body: string): { key: string; expression: string; index: number } | undefined {
  const match = /\b(?:public\s+)?(?:override\s+)?(?:[A-Za-z_]\w*\.)?(?:Icon|Image)\s+(?:ServiceIcon|ServiceImage)\s*\{[\s\S]*?\breturn\s+(?:[A-Za-z_]\w*\.)*Resources\.([A-Za-z_]\w*)\s*;[\s\S]*?\}/.exec(body);
  return match ? { key: match[1], expression: match[0].trim(), index: match.index } : undefined;
}

function expressionTabPage(body: string): { name: string; expression: string; index: number } | undefined {
  const match = /\b(?:public\s+)?(?:override\s+)?(?:[A-Za-z_]\w*\.)?TabPage\s+[A-Za-z_]\w*\s*\([^)]*\)\s*=>\s*(?:this\.)?[A-Za-z_]\w*\.([A-Za-z_]\w*)\s*;/.exec(body);
  return match ? { name: match[1], expression: match[0].trim(), index: match.index } : undefined;
}

function blockTabPage(body: string): { name: string; expression: string; index: number } | undefined {
  const match = /\b(?:public\s+)?(?:override\s+)?(?:[A-Za-z_]\w*\.)?TabPage\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{[\s\S]*?\breturn\s+(?:this\.)?[A-Za-z_]\w*\.([A-Za-z_]\w*)\s*;[\s\S]*?\}/.exec(body);
  return match ? { name: match[1], expression: match[0].trim(), index: match.index } : undefined;
}

function matchingDelimiter(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close && --depth === 0) return index;
  }
  return -1;
}

function skipQuoted(source: string, quoteIndex: number, quote: string): number {
  const verbatim = quote === '"' && source[quoteIndex - 1] === "@";
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    if (source[index] === quote) {
      if (verbatim && source[index + 1] === quote) {
        index += 1;
        continue;
      }
      return index;
    }
    if (!verbatim && source[index] === "\\") index += 1;
  }
  return source.length - 1;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

function visitControls(controls: VisualControl[], visitor: (control: VisualControl) => void): void {
  for (const control of controls) {
    visitor(control);
    visitControls(control.children, visitor);
  }
}
