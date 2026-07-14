import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { PropertyGridField, VisualControl } from "../ir/types.js";
import { stripComments } from "./designerParser.js";
import { listCSharpFiles } from "./enumCatalog.js";

/** Resolve PropertyGrid.SelectedObject contracts against ordinary C# classes. */
export async function materializePropertyGridPreviews(controls: VisualControl[], contextPath: string): Promise<void> {
  const requested = new Set<string>();
  visitControls(controls, (control) => {
    const typeName = control.propertyGridSource?.typeName;
    if (typeName) requested.add(shortTypeName(typeName));
  });
  if (requested.size === 0) return;

  const catalog = await collectPropertyGridCatalog(contextPath, requested);
  visitControls(controls, (control) => {
    const source = control.propertyGridSource;
    if (!source?.typeName) return;
    const fields = catalog.get(shortTypeName(source.typeName));
    if (fields?.length) source.fields = fields;
  });
}

export async function collectPropertyGridCatalog(
  contextPath: string,
  requestedTypes: ReadonlySet<string>,
): Promise<Map<string, PropertyGridField[]>> {
  const requested = new Set([...requestedTypes].map(shortTypeName));
  const catalog = new Map<string, PropertyGridField[]>();
  if (requested.size === 0) return catalog;

  const files = await listCSharpFiles(resolve(contextPath));
  files.sort((a, b) => typeFilePriority(a, requested) - typeFilePriority(b, requested) || a.localeCompare(b));
  for (let offset = 0; offset < files.length && catalog.size < requested.size; offset += 24) {
    const sources = await Promise.all(files.slice(offset, offset + 24).map(async (file) => {
      try {
        return await readFile(file, "utf8");
      } catch {
        return "";
      }
    }));
    for (const source of sources) {
      for (const [typeName, fields] of parsePropertyGridDeclarations(source, requested)) {
        if (!catalog.has(typeName) && fields.length) catalog.set(typeName, fields);
      }
    }
  }
  return catalog;
}

export function parsePropertyGridDeclarations(
  source: string,
  requestedTypes?: ReadonlySet<string>,
): Map<string, PropertyGridField[]> {
  const clean = stripComments(source);
  const result = new Map<string, PropertyGridField[]>();
  const classPattern = /\bclass\s+([A-Za-z_]\w*)\b[^\{]*\{/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classPattern.exec(clean)) !== null) {
    const typeName = classMatch[1];
    if (requestedTypes && !requestedTypes.has(typeName)) continue;
    const openBrace = clean.indexOf("{", classMatch.index);
    const closeBrace = matchingDelimiter(clean, openBrace, "{", "}");
    if (closeBrace === -1) continue;
    const body = clean.slice(openBrace + 1, closeBrace);
    const fields = parseClassProperties(typeName, body);
    if (fields.length) result.set(typeName, fields);
    classPattern.lastIndex = closeBrace + 1;
  }
  return result;
}

function parseClassProperties(typeName: string, body: string): PropertyGridField[] {
  const fields: PropertyGridField[] = [];
  const propertyPattern = /((?:\s*\[[^\]]+\]\s*)*)\s*public\s+((?:(?:virtual|override|new|required|sealed|static)\s+)*)((?:[A-Za-z_]\w*\.)*[A-Za-z_]\w*(?:\s*<[^;{}=]+>)?\??(?:\[\])?)\s+([A-Za-z_]\w*)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = propertyPattern.exec(body)) !== null) {
    const attributes = match[1] ?? "";
    const modifiers = match[2] ?? "";
    const fieldType = match[3].replace(/\s+/g, " ").trim();
    const name = match[4];
    const openBrace = body.indexOf("{", match.index + match[0].lastIndexOf("{"));
    const closeBrace = matchingDelimiter(body, openBrace, "{", "}");
    if (closeBrace === -1) continue;
    propertyPattern.lastIndex = closeBrace + 1;
    if (/\bstatic\b/.test(modifiers) || attributeBoolean(attributes, "Browsable") === false) continue;

    const accessorBody = body.slice(openBrace + 1, closeBrace);
    const label = attributeString(attributes, "DisplayName") ?? name;
    const defaultArgument = attributeArgument(attributes, "DefaultValue");
    const field: PropertyGridField = {
      name,
      label,
      typeName: fieldType,
      ...(attributeString(attributes, "Category") ? { category: attributeString(attributes, "Category") } : {}),
      ...(attributeString(attributes, "Description") ? { description: attributeString(attributes, "Description") } : {}),
      ...(attributeBoolean(attributes, "PasswordPropertyText") === true ? { password: true } : {}),
      ...(attributeBoolean(attributes, "ReadOnly") === true || !/\bset\s*(?:;|\{)/.test(accessorBody) ? { readOnly: true } : {}),
      ...(attributeArgument(attributes, "Editor") !== undefined ? { hasEditor: true } : {}),
    };
    const attributeDefault = defaultArgument === undefined ? undefined : parseLiteral(defaultArgument);
    if (attributeDefault !== undefined) field.defaultValue = attributeDefault;

    const initializerEnd = body.indexOf(";", closeBrace + 1);
    const tail = initializerEnd === -1 ? "" : body.slice(closeBrace + 1, initializerEnd + 1);
    const initializer = tail.match(/^\s*=\s*([^;]+)\s*;/)?.[1];
    if (initializer !== undefined && /^new(?:\s+[A-Za-z_][\w.<>]*)?\s*\(/.test(initializer.trim())) {
      field.instantiated = true;
    }
    const initialValue = initializer === undefined ? undefined : parseLiteral(initializer);
    if (initialValue !== undefined) field.defaultValue = initialValue;
    fields.push(field);
  }

  const byName = new Map(fields.map((field) => [field.name, field]));
  const constructorPattern = new RegExp(`\\b(?:public|internal|protected)\\s+${escapeRegExp(typeName)}\\s*\\(\\s*\\)\\s*\\{`, "g");
  let constructor: RegExpExecArray | null;
  while ((constructor = constructorPattern.exec(body)) !== null) {
    const openBrace = body.indexOf("{", constructor.index);
    const closeBrace = matchingDelimiter(body, openBrace, "{", "}");
    if (closeBrace === -1) continue;
    const constructorBody = body.slice(openBrace + 1, closeBrace);
    for (const assignment of constructorBody.matchAll(/(?:this\.)?([A-Za-z_]\w*)\s*=\s*([^;]+);/g)) {
      const field = byName.get(assignment[1]);
      const value = parseLiteral(assignment[2]);
      if (field && /^new(?:\s+[A-Za-z_][\w.<>]*)?\s*\(/.test(assignment[2].trim())) field.instantiated = true;
      if (field && value !== undefined) field.defaultValue = value;
    }
    constructorPattern.lastIndex = closeBrace + 1;
  }
  return fields;
}

function attributeArgument(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:[A-Za-z_][\\w.]*\\.)?${escapeRegExp(name)}(?:Attribute)?\\s*\\(`, "i");
  const match = pattern.exec(attributes);
  if (!match) return undefined;
  const openParen = attributes.indexOf("(", match.index);
  const closeParen = matchingDelimiter(attributes, openParen, "(", ")");
  return closeParen === -1 ? undefined : attributes.slice(openParen + 1, closeParen).trim();
}

function attributeString(attributes: string, name: string): string | undefined {
  const argument = attributeArgument(attributes, name);
  if (argument === undefined) return undefined;
  const value = parseLiteral(argument);
  return typeof value === "string" ? value : undefined;
}

function attributeBoolean(attributes: string, name: string): boolean | undefined {
  const argument = attributeArgument(attributes, name);
  if (argument === undefined) return undefined;
  const value = parseLiteral(argument);
  return typeof value === "boolean" ? value : undefined;
}

function parseLiteral(expression: string): string | number | boolean | undefined {
  const value = expression.trim();
  if (!value || value === "null" || /^typeof\s*\(/.test(value)) return undefined;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^(?:System\.)?String\.Empty$/i.test(value)) return "";
  const verbatim = value.match(/^@"((?:""|[^"])*)"$/s);
  if (verbatim) return verbatim[1].replace(/""/g, '"');
  const quoted = value.match(/^"((?:\\.|[^"\\])*)"$/s);
  if (quoted) return unescapeCSharpString(quoted[1]);
  const numeric = value.match(/^(-?\d+(?:\.\d+)?)(?:[fFdDmMlLuU]+)?$/);
  if (numeric) return Number(numeric[1]);
  const member = value.match(/(?:^|\.)([A-Za-z_]\w*)\s*$/)?.[1];
  return member && !["new", "default"].includes(member) ? member : undefined;
}

function matchingDelimiter(source: string, openIndex: number, open: string, close: string): number {
  if (openIndex < 0) return -1;
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

function unescapeCSharpString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function visitControls(controls: VisualControl[], visit: (control: VisualControl) => void): void {
  for (const control of controls) {
    visit(control);
    visitControls(control.children, visit);
  }
}

function shortTypeName(typeName: string): string {
  return typeName.replace(/^global::/, "").split(".").pop()!;
}

function typeFilePriority(file: string, requested: ReadonlySet<string>): number {
  const base = basename(file).replace(/\.cs$/i, "");
  return requested.has(base) ? 0 : 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
