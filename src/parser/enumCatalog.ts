import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { VisualControl } from "../ir/types.js";
import { stripComments } from "./designerParser.js";

const SKIPPED_DIRECTORIES = new Set([
  ".git", ".vs", ".idea", "bin", "obj", "node_modules", "packages", "TestResults", "artifacts", "dist",
]);

/**
 * Resolve code-behind item contracts against C# enum declarations found in a
 * wider project context. The original contract remains on the control even
 * when a type cannot be resolved, so target generators never have to invent
 * project-specific list data.
 */
export async function materializeRuntimeItems(controls: VisualControl[], contextPath: string): Promise<void> {
  const neededTypes = new Set<string>();
  const staticReferences = new Set<string>();
  visitControls(controls, (control) => {
    for (const source of control.itemSources ?? []) {
      if (source.typeName) neededTypes.add(shortTypeName(source.typeName));
      else {
        const reference = staticMemberReference(source.expression);
        if (reference) staticReferences.add(reference);
      }
    }
  });
  if (neededTypes.size === 0 && staticReferences.size === 0) return;

  const [catalog, staticLists] = await Promise.all([
    collectEnumMemberCatalog(contextPath, neededTypes),
    collectStaticListCatalog(contextPath, staticReferences),
  ]);
  const localizedTypes = collectLocalizedItemTypes(controls);
  const localizedLabels = localizedTypes.size > 0
    ? await collectLocalizedEnumLabels(contextPath, localizedTypes, catalog)
    : new Map<string, string>();
  visitControls(controls, (control) => {
    const resolved = (control.itemSources ?? []).flatMap((source) => {
      if (!source.typeName) {
        const reference = staticMemberReference(source.expression);
        return reference ? staticLists.get(reference) ?? [] : [];
      }
      const typeName = shortTypeName(source.typeName);
      const members = catalog.get(typeName) ?? [];
      if (/Enum\.GetNames\s*\(/.test(source.expression)) return members.map((member) => member.name);
      if (/GetLocalizedEnumDescriptions/.test(source.expression)) {
        return members.map((member) => localizedLabels.get(`${typeName}_${member.name}`) ?? member.label);
      }
      return members.map((member) => member.label);
    });
    if (resolved.length === 0) return;
    control.items = [...new Set([...(control.items ?? []), ...resolved])];
  });
}

type EnumMember = { name: string; label: string };
type PendingObjectCollection = { elementType: string; arguments: string[][] };

function staticMemberReference(expression: string): string | undefined {
  const argument = expression.match(/^Items\.AddRange\(([\s\S]*)\)$/)?.[1]?.trim();
  if (!argument) return undefined;
  const withoutMaterializer = argument.replace(/\.\s*ToArray\s*\(\s*\)\s*$/, "").trim();
  if (!/^(?:global::)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(withoutMaterializer)) return undefined;
  const parts = withoutMaterializer.replace(/^global::/, "").split(".");
  return `${parts.at(-2)}.${parts.at(-1)}`;
}

async function collectStaticListCatalog(
  contextPath: string,
  requestedReferences: ReadonlySet<string>,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (requestedReferences.size === 0) return result;
  const requested = new Map<string, Set<string>>();
  for (const reference of requestedReferences) {
    const [className, memberName] = reference.split(".");
    const members = requested.get(className) ?? new Set<string>();
    members.add(memberName);
    requested.set(className, members);
  }

  const files = await listCSharpFiles(resolve(contextPath));
  const requestedClasses = new Set(requested.keys());
  files.sort((a, b) => fileTypePriority(a, requestedClasses) - fileTypePriority(b, requestedClasses) || a.localeCompare(b));
  const pendingObjects = new Map<string, PendingObjectCollection>();
  for (let offset = 0; offset < files.length && result.size + pendingObjects.size < requestedReferences.size; offset += 24) {
    const batch = files.slice(offset, offset + 24);
    const sources = await Promise.all(batch.map(readTextOrEmpty));
    for (const source of sources) {
      for (const [className, memberNames] of requested) {
        for (const body of classBodies(source, className)) {
          for (const memberName of memberNames) {
            const key = `${className}.${memberName}`;
            if (result.has(key) || pendingObjects.has(key)) continue;
            const collection = parseStaticCollection(body, memberName);
            if (!collection) continue;
            if (collection.values) result.set(key, collection.values);
            else if (collection.pending) pendingObjects.set(key, collection.pending);
          }
        }
      }
    }
  }

  if (pendingObjects.size === 0) return result;
  const displayTypes = new Set([...pendingObjects.values()].map((item) => item.elementType));
  files.sort((a, b) => fileTypePriority(a, displayTypes) - fileTypePriority(b, displayTypes) || a.localeCompare(b));
  const displayParameterIndexes = new Map<string, number>();
  for (let offset = 0; offset < files.length && displayParameterIndexes.size < displayTypes.size; offset += 24) {
    const sources = await Promise.all(files.slice(offset, offset + 24).map(readTextOrEmpty));
    for (const source of sources) {
      for (const typeName of displayTypes) {
        if (displayParameterIndexes.has(typeName)) continue;
        const parameterIndex = displayConstructorParameterIndex(source, typeName);
        if (parameterIndex !== undefined) displayParameterIndexes.set(typeName, parameterIndex);
      }
    }
  }
  for (const [key, pending] of pendingObjects) {
    const parameterIndex = displayParameterIndexes.get(pending.elementType);
    if (parameterIndex === undefined) continue;
    const values = pending.arguments
      .map((args) => decodeCSharpStringLiteral(args[parameterIndex]))
      .filter((value): value is string => value !== undefined);
    if (values.length > 0) result.set(key, values);
  }
  return result;
}

function fileTypePriority(file: string, typeNames: ReadonlySet<string>): number {
  return typeNames.has(basename(file, extname(file))) ? 0 : 1;
}

async function readTextOrEmpty(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

function classBodies(source: string, className: string): string[] {
  const clean = stripComments(source);
  const bodies: string[] = [];
  const pattern = new RegExp(`\\b(?:class|record)\\s+${escapeRegExp(className)}\\b[^\\{;]*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean)) !== null) {
    const openBrace = clean.indexOf("{", match.index);
    const closeBrace = matchingBrace(clean, openBrace);
    if (closeBrace === -1) continue;
    bodies.push(clean.slice(openBrace + 1, closeBrace));
    pattern.lastIndex = closeBrace + 1;
  }
  return bodies;
}

function parseStaticCollection(
  classBody: string,
  memberName: string,
): { values?: string[]; pending?: PendingObjectCollection } | undefined {
  const sequenceType = "(?:List|IList|IReadOnlyList|IEnumerable|ICollection|IReadOnlyCollection|Collection|ObservableCollection|BindingList)";
  const declaration = new RegExp(
    `\\bstatic\\s+(?:readonly\\s+)?(string\\s*\\[\\]|${sequenceType}\\s*<\\s*([A-Za-z_][\\w.]*)\\s*>)\\s+${escapeRegExp(memberName)}\\b`,
  );
  const match = declaration.exec(classBody);
  if (!match) return undefined;
  const equals = classBody.indexOf("=", match.index + match[0].length);
  if (equals === -1 || equals - (match.index + match[0].length) > 256) return undefined;
  const openBrace = classBody.indexOf("{", equals);
  if (openBrace === -1 || openBrace - equals > 256) return undefined;
  const closeBrace = matchingBrace(classBody, openBrace);
  if (closeBrace === -1) return undefined;
  const initializer = classBody.slice(openBrace + 1, closeBrace);
  const elementType = match[2]?.split(".").pop();
  if (!elementType || elementType === "string") {
    const values = splitTopLevel(initializer)
      .map(decodeCSharpStringLiteral)
      .filter((value): value is string => value !== undefined);
    return values.length > 0 ? { values } : undefined;
  }
  const argumentsList = constructorArguments(initializer, elementType);
  return argumentsList.length > 0
    ? { pending: { elementType, arguments: argumentsList } }
    : undefined;
}

function constructorArguments(initializer: string, elementType: string): string[][] {
  const result: string[][] = [];
  const pattern = new RegExp(`\\bnew\\s+(?:[A-Za-z_]\\w*\\.)*${escapeRegExp(elementType)}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(initializer)) !== null) {
    const openParen = initializer.indexOf("(", match.index);
    const closeParen = matchingDelimiter(initializer, openParen, "(", ")");
    if (closeParen === -1) continue;
    result.push(splitTopLevel(initializer.slice(openParen + 1, closeParen)).map((value) => value.trim()));
    pattern.lastIndex = closeParen + 1;
  }
  return result;
}

function displayConstructorParameterIndex(source: string, typeName: string): number | undefined {
  for (const body of classBodies(source, typeName)) {
    const blockToString = /\boverride\s+string\s+ToString\s*\(\s*\)\s*\{[\s\S]*?\breturn\s+(?:this\.)?([A-Za-z_]\w*)\s*;/.exec(body);
    const expressionToString = /\boverride\s+string\s+ToString\s*\(\s*\)\s*=>\s*(?:this\.)?([A-Za-z_]\w*)\s*;/.exec(body);
    const displayProperty = blockToString?.[1] ?? expressionToString?.[1];
    if (!displayProperty) continue;
    const constructor = new RegExp(`\\b(?:public|internal|protected|private)\\s+${escapeRegExp(typeName)}\\s*\\(`, "g");
    let match: RegExpExecArray | null;
    while ((match = constructor.exec(body)) !== null) {
      const openParen = body.indexOf("(", match.index);
      const closeParen = matchingDelimiter(body, openParen, "(", ")");
      if (closeParen === -1) continue;
      const parameters = splitTopLevel(body.slice(openParen + 1, closeParen))
        .map((parameter) => parameter.match(/([A-Za-z_]\w*)\s*(?:=.*)?$/)?.[1]);
      const openBrace = body.indexOf("{", closeParen);
      if (openBrace === -1 || openBrace - closeParen > 128) continue;
      const closeBrace = matchingBrace(body, openBrace);
      if (closeBrace === -1) continue;
      const constructorBody = body.slice(openBrace + 1, closeBrace);
      for (let index = 0; index < parameters.length; index += 1) {
        const parameter = parameters[index];
        if (!parameter) continue;
        const assignment = new RegExp(`(?:this\\.)?${escapeRegExp(displayProperty)}\\s*=\\s*${escapeRegExp(parameter)}\\s*;`);
        if (assignment.test(constructorBody)) return index;
      }
      constructor.lastIndex = closeBrace + 1;
    }
  }
  return undefined;
}

function decodeCSharpStringLiteral(expression: string | undefined): string | undefined {
  if (!expression) return undefined;
  const value = expression.trim();
  const verbatim = value.match(/^@"((?:""|[^"])*)"$/s);
  if (verbatim) return verbatim[1].replace(/""/g, '"');
  const standard = value.match(/^"((?:\\.|[^"\\])*)"$/s);
  return standard ? unescapeCSharpString(standard[1]) : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectLocalizedItemTypes(controls: VisualControl[]): Set<string> {
  const types = new Set<string>();
  visitControls(controls, (control) => {
    for (const source of control.itemSources ?? []) {
      if (source.typeName && /GetLocalizedEnumDescriptions/.test(source.expression)) {
        types.add(shortTypeName(source.typeName));
      }
    }
  });
  return types;
}

export async function collectEnumCatalog(
  contextPath: string,
  requestedTypes: ReadonlySet<string>,
): Promise<Map<string, string[]>> {
  const entries = await collectEnumMemberCatalog(contextPath, requestedTypes);
  return new Map([...entries].map(([typeName, members]) => [typeName, members.map((member) => member.label)]));
}

export async function collectEnumMemberNames(
  contextPath: string,
  requestedTypes: ReadonlySet<string>,
): Promise<Map<string, string[]>> {
  const entries = await collectEnumMemberCatalog(contextPath, requestedTypes);
  return new Map([...entries].map(([typeName, members]) => [typeName, members.map((member) => member.name)]));
}

async function collectEnumMemberCatalog(
  contextPath: string,
  requestedTypes: ReadonlySet<string>,
): Promise<Map<string, EnumMember[]>> {
  const requested = new Set([...requestedTypes].map(shortTypeName));
  const catalog = new Map<string, EnumMember[]>();
  if (requested.size === 0) return catalog;

  const files = await listCSharpFiles(resolve(contextPath));
  // Enum-heavy files are common in legacy projects and cheap to prioritize.
  // Process in modest batches so large repositories do not retain every source
  // string in memory, while still avoiding one filesystem round trip per file.
  files.sort((a, b) => Number(!/enum/i.test(basename(a))) - Number(!/enum/i.test(basename(b))) || a.localeCompare(b));
  for (let offset = 0; offset < files.length && catalog.size < requested.size; offset += 24) {
    const batch = files.slice(offset, offset + 24);
    const sources = await Promise.all(batch.map(async (file) => {
      try {
        return await readFile(file, "utf8");
      } catch {
        return "";
      }
    }));
    for (const source of sources) {
      for (const [typeName, members] of parseEnumMembersByType(source, requested)) {
        if (!catalog.has(typeName)) catalog.set(typeName, members);
      }
    }
  }
  return catalog;
}

export function parseEnumDeclarations(
  source: string,
  requestedTypes?: ReadonlySet<string>,
): Map<string, string[]> {
  return new Map([...parseEnumMembersByType(source, requestedTypes)]
    .map(([typeName, members]) => [typeName, members.map((member) => member.label)]));
}

function parseEnumMembersByType(
  source: string,
  requestedTypes?: ReadonlySet<string>,
): Map<string, EnumMember[]> {
  const clean = stripComments(source);
  const result = new Map<string, EnumMember[]>();
  const enumPattern = /\benum\s+([A-Za-z_]\w*)\s*(?::\s*[A-Za-z_][\w.]*)?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = enumPattern.exec(clean)) !== null) {
    const typeName = match[1];
    if (requestedTypes && !requestedTypes.has(typeName)) continue;
    const openBrace = clean.indexOf("{", match.index);
    const closeBrace = matchingBrace(clean, openBrace);
    if (closeBrace === -1) continue;
    const labels = parseEnumMembers(clean.slice(openBrace + 1, closeBrace));
    if (labels.length > 0) result.set(typeName, labels);
    enumPattern.lastIndex = closeBrace + 1;
  }
  return result;
}

function parseEnumMembers(body: string): EnumMember[] {
  const members: EnumMember[] = [];
  for (const rawMember of splitTopLevel(body)) {
    const member = rawMember.replace(/^\s*#.*$/gm, "").trim();
    if (!member) continue;
    const description = descriptionLabel(member);
    const declaration = member.replace(/\[[\s\S]*?\]/g, " ").trim();
    const name = declaration.match(/^([A-Za-z_]\w*)/)?.[1];
    if (name) members.push({ name, label: description ?? name });
  }
  return members;
}

async function collectLocalizedEnumLabels(
  contextPath: string,
  localizedTypes: ReadonlySet<string>,
  enumCatalog: ReadonlyMap<string, EnumMember[]>,
): Promise<Map<string, string>> {
  const expectedKeys = new Set([...localizedTypes].flatMap((typeName) =>
    (enumCatalog.get(shortTypeName(typeName)) ?? []).map((member) => `${shortTypeName(typeName)}_${member.name}`)));
  const result = new Map<string, string>();
  if (expectedKeys.size === 0) return result;
  const files = (await listFilesWithExtension(resolve(contextPath), ".resx"))
    .filter((file) => !isCultureSpecificResx(file))
    .sort((a, b) => Number(basename(b) === "Resources.resx") - Number(basename(a) === "Resources.resx") || a.localeCompare(b));
  for (let offset = 0; offset < files.length; offset += 24) {
    const batch = files.slice(offset, offset + 24);
    const sources = await Promise.all(batch.map(async (file) => {
      try {
        return await readFile(file, "utf8");
      } catch {
        return "";
      }
    }));
    for (const source of sources) {
      for (const [key, value] of parseStringResources(source)) {
        if (expectedKeys.has(key) && !result.has(key)) result.set(key, value);
      }
    }
    if (result.size === expectedKeys.size) break;
  }
  return result;
}

function parseStringResources(source: string): Map<string, string> {
  const values = new Map<string, string>();
  const clean = source.replace(/<!--[\s\S]*?-->/g, "");
  const pattern = /<data\s+([^>]*)>[\s\S]*?<value(?:[^>]*)>([\s\S]*?)<\/value>[\s\S]*?<\/data>/g;
  for (const match of clean.matchAll(pattern)) {
    const key = match[1].match(/\bname="([^"]+)"/)?.[1];
    if (!key) continue;
    values.set(decodeXmlEntities(key), decodeXmlEntities(match[2].trim()));
  }
  return values;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, digits) => String.fromCodePoint(parseInt(digits, 16)))
    .replace(/&amp;/g, "&");
}

function isCultureSpecificResx(file: string): boolean {
  return /\.[a-z]{2}(?:-[A-Za-z]{2})?\.resx$/i.test(basename(file));
}

function descriptionLabel(member: string): string | undefined {
  const standard = member.match(/\[\s*(?:System\.ComponentModel\.)?Description(?:Attribute)?\s*\(\s*"((?:\\.|[^"\\])*)"\s*\)\s*\]/);
  if (standard) return unescapeCSharpString(standard[1]);
  const verbatim = member.match(/\[\s*(?:System\.ComponentModel\.)?Description(?:Attribute)?\s*\(\s*@"((?:""|[^"])*)"\s*\)\s*\]/);
  return verbatim?.[1].replace(/""/g, '"');
}

function unescapeCSharpString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function splitTopLevel(source: string): string[] {
  const result: string[] = [];
  let start = 0;
  let square = 0;
  let round = 0;
  let curly = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === "[") square += 1;
    else if (char === "]") square = Math.max(0, square - 1);
    else if (char === "(") round += 1;
    else if (char === ")") round = Math.max(0, round - 1);
    else if (char === "{") curly += 1;
    else if (char === "}") curly = Math.max(0, curly - 1);
    else if (char === "," && square === 0 && round === 0 && curly === 0) {
      result.push(source.slice(start, index));
      start = index + 1;
    }
  }
  result.push(source.slice(start));
  return result;
}

function matchingBrace(source: string, openBrace: number): number {
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index;
  }
  return -1;
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

export async function listCSharpFiles(inputPath: string): Promise<string[]> {
  return listFilesWithExtension(inputPath, ".cs");
}

async function listFilesWithExtension(inputPath: string, extension: string): Promise<string[]> {
  const info = await stat(inputPath);
  if (info.isFile()) return extname(inputPath).toLowerCase() === extension ? [inputPath] : [];
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        files.push(join(directory, entry.name));
      }
    }
  };
  await walk(inputPath);
  return files;
}

function visitControls(controls: VisualControl[], visitor: (control: VisualControl) => void): void {
  for (const control of controls) {
    visitor(control);
    visitControls(control.children, visitor);
  }
}

function shortTypeName(typeName: string): string {
  return typeName.replace(/^global::/, "").split(".").pop()!;
}
