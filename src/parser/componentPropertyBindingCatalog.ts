import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ComponentDefinition, ComponentPropertyBinding, RuntimeValueProperty, VisualControl } from "../ir/types.js";

const TARGET_PROPERTIES: Record<string, RuntimeValueProperty | "visible"> = {
  Text: "text",
  Checked: "checked",
  Enabled: "enabled",
  ReadOnly: "readOnly",
  PlaceholderText: "placeholderText",
  WatermarkText: "placeholderText",
  CueBannerText: "placeholderText",
  SelectedIndex: "selectedIndex",
  SelectedItem: "selectedItem",
  Value: "value",
  Visible: "visible",
};

type DerivedValue = { negated: boolean };

/**
 * Find direct public-property facades on resolved UserControls. Only
 * unconditional setter assignments whose right-hand side can be proven to be
 * `value` (optionally cast, negated, or passed through one field) are accepted.
 * Method calls and conditional branches deliberately remain contracts.
 */
export async function materializeComponentPropertyBindings(
  components: ComponentDefinition[],
  contextRoot: string,
): Promise<void> {
  const resolved = components.filter((component) => component.status === "resolved");
  if (resolved.length === 0) return;
  const sources = await collectCSharpSources(contextRoot);
  for (const component of resolved) {
    const controlNames = collectControlNames(component.controls);
    const bindings: ComponentPropertyBinding[] = [];
    for (const source of sources) {
      bindings.push(...parseComponentPropertyBindings(source.text, source.path, component.typeName, controlNames));
    }
    const unique = new Map<string, ComponentPropertyBinding>();
    for (const binding of bindings) {
      const key = `${binding.sourceProperty}|${binding.targetControlName}|${binding.targetProperty}`;
      if (!unique.has(key)) unique.set(key, binding);
    }
    const sorted = [...unique.values()].sort((a, b) =>
      a.sourceProperty.localeCompare(b.sourceProperty)
      || a.targetControlName.localeCompare(b.targetControlName)
      || a.targetProperty.localeCompare(b.targetProperty),
    );
    if (sorted.length > 0) component.propertyBindings = sorted;
  }
}

export function parseComponentPropertyBindings(
  source: string,
  sourceFile: string,
  componentType: string,
  controlNames: ReadonlySet<string>,
): ComponentPropertyBinding[] {
  const result: ComponentPropertyBinding[] = [];
  const classPattern = new RegExp(`\\bclass\\s+${escapeRegExp(componentType)}\\b`, "g");
  for (const classMatch of source.matchAll(classPattern)) {
    const classOpen = source.indexOf("{", classMatch.index! + classMatch[0].length);
    if (classOpen < 0) continue;
    const classClose = findMatchingBrace(source, classOpen);
    if (classClose < 0) continue;
    const classBody = source.slice(classOpen + 1, classClose);
    const propertyPattern = /\bpublic\s+(?:(?:virtual|override|new)\s+)?[A-Za-z_][\w.<>?,\[\]]*\s+([A-Za-z_]\w*)\s*\{/g;
    for (const propertyMatch of classBody.matchAll(propertyPattern)) {
      const sourceProperty = propertyMatch[1];
      const propertyOpen = classOpen + 1 + propertyMatch.index! + propertyMatch[0].lastIndexOf("{");
      const propertyClose = findMatchingBrace(source, propertyOpen);
      if (propertyClose < 0 || propertyClose > classClose) continue;
      const propertyBody = source.slice(propertyOpen + 1, propertyClose);
      const setterMatch = /\bset\s*\{/.exec(propertyBody);
      if (!setterMatch) continue;
      const setterOpen = propertyOpen + 1 + setterMatch.index + setterMatch[0].lastIndexOf("{");
      const setterClose = findMatchingBrace(source, setterOpen);
      if (setterClose < 0 || setterClose > propertyClose) continue;
      const setterBody = source.slice(setterOpen + 1, setterClose);
      const aliases = new Map<string, DerivedValue>();
      const assignmentPattern = /(?:this\.)?([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s*=\s*([^;]+);/g;
      for (const assignment of setterBody.matchAll(assignmentPattern)) {
        if (braceDepthAt(setterBody, assignment.index!) !== 0) continue;
        const left = assignment[1];
        const member = assignment[2];
        const derived = deriveFromValue(assignment[3], aliases);
        if (!derived) continue;
        if (!member) {
          aliases.set(left, derived);
          continue;
        }
        if (!controlNames.has(left)) continue;
        const targetProperty = TARGET_PROPERTIES[member];
        if (!targetProperty) continue;
        result.push({
          sourceProperty,
          targetControlName: left,
          targetProperty,
          ...(derived.negated ? { negated: true } : {}),
          sourceFile,
          line: lineAt(source, setterOpen + 1 + assignment.index!),
        });
      }
    }
  }
  return result;
}

function deriveFromValue(expression: string, aliases: ReadonlyMap<string, DerivedValue>): DerivedValue | undefined {
  let raw = expression.trim();
  let negated = false;
  if (raw.startsWith("!")) {
    negated = true;
    raw = raw.slice(1).trim();
  }
  // Remove harmless casts and grouping parentheses around `value`/a proven
  // alias. Complex calls, arithmetic, ternaries, and member access are not
  // accepted.
  while (true) {
    const cast = raw.match(/^\([A-Za-z_][\w.<>?,\[\]]*\)\s*/);
    if (!cast || !raw.slice(cast[0].length).trim()) break;
    raw = raw.slice(cast[0].length).trim();
  }
  while (raw.startsWith("(") && raw.endsWith(")") && balancedOuterParens(raw)) raw = raw.slice(1, -1).trim();
  if (raw === "value") return { negated };
  const alias = aliases.get(raw.replace(/^this\./, ""));
  return alias ? { negated: alias.negated !== negated } : undefined;
}

function collectControlNames(controls: VisualControl[]): Set<string> {
  const result = new Set<string>();
  const visit = (items: VisualControl[]) => items.forEach((control) => {
    result.add(control.name);
    visit(control.children);
  });
  visit(controls);
  return result;
}

async function collectCSharpSources(root: string): Promise<Array<{ path: string; text: string }>> {
  const paths: string[] = [];
  const skip = new Set([".git", "node_modules", "bin", "obj", "dist", ".next"]);
  const walk = async (path: string): Promise<void> => {
    const info = await stat(path);
    if (info.isFile()) {
      if (path.endsWith(".cs")) paths.push(path);
      return;
    }
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    await Promise.all(entries
      .filter((entry) => !entry.isDirectory() || !skip.has(entry.name))
      .map((entry) => walk(join(path, entry.name))));
  };
  await walk(root);
  return Promise.all(paths.sort().map(async (path) => ({ path, text: await readFile(path, "utf8") })));
}

function findMatchingBrace(source: string, open: number): number {
  let depth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (char === "\\") { i += 1; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return i;
  }
  return -1;
}

function braceDepthAt(source: string, end: number): number {
  let depth = 0;
  for (let i = 0; i < end; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function balancedOuterParens(value: string): boolean {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    else if (value[i] === ")" && --depth === 0) return i === value.length - 1;
  }
  return false;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
