import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ComponentDefinition,
  ComponentInitializationDefault,
  RuntimeValueProperty,
  VisualColor,
  VisualControl,
} from "../ir/types.js";
import { stripComments } from "./designerParser.js";
import { collectUniqueNeutralResourceStrings } from "./neutralResourceCatalog.js";

type Resolved = string | number | boolean | null | VisualColor;

type Callable = {
  name: string;
  parameterCount: number;
  body: string;
  bodyOffset: number;
  bodyLine: number;
  sourceFile: string;
};

type ClassModel = {
  constructors: Callable[];
  methods: Map<string, Callable[]>;
  setters: Map<string, Callable>;
  initialValues: Map<string, Resolved>;
};

type SourceFile = { path: string; source: string };

/**
 * Materialize only constructor-time state that can be proven without running
 * project code. The evaluator follows a parameterless constructor, same-class
 * no-argument method calls, and property setters. It selects only constant
 * if/switch branches and resolves literals, unique Resources strings, and
 * System.Drawing colors. Unknown conditions and expressions are skipped.
 */
export async function materializeComponentInitializationDefaults(
  components: ComponentDefinition[],
  contextRoot: string,
): Promise<void> {
  const resolved = components.filter((component) => component.status === "resolved");
  if (resolved.length === 0) return;
  const paths = await collectContextFiles(contextRoot);
  const [sources, resourceValues] = await Promise.all([
    Promise.all(paths.map(async (path) => ({ path, source: await readFile(path, "utf8") }))),
    collectUniqueNeutralResourceStrings(contextRoot),
  ]);
  for (const component of resolved) {
    const model = buildClassModel(sources, component.typeName);
    const constructor = model.constructors.find((candidate) => candidate.parameterCount === 0);
    if (!constructor) continue;
    const interpreter = new ComponentInitializer(component, model, resourceValues);
    interpreter.run(constructor);
    const defaults = interpreter.defaults();
    if (defaults.length > 0) component.initializationDefaults = defaults;
  }
}

class ComponentInitializer {
  private readonly controls = new Map<string, VisualControl>();
  private readonly environment: Map<string, Resolved>;
  private readonly materialized = new Map<string, ComponentInitializationDefault>();
  private readonly callStack: string[] = [];

  constructor(
    private readonly component: ComponentDefinition,
    private readonly model: ClassModel,
    private readonly resources: ReadonlyMap<string, string>,
  ) {
    this.environment = new Map(model.initialValues);
    const visit = (controls: VisualControl[]) => controls.forEach((control) => {
      this.controls.set(control.name, control);
      visit(control.children);
    });
    visit(component.controls);
  }

  run(constructor: Callable): void {
    this.execute(constructor, []);
  }

  defaults(): ComponentInitializationDefault[] {
    return [...this.materialized.values()].sort((a, b) =>
      a.targetControlName.localeCompare(b.targetControlName)
      || a.targetProperty.localeCompare(b.targetProperty),
    );
  }

  private execute(callable: Callable, conditions: string[]): void {
    const callKey = `${callable.sourceFile}|${callable.name}|${callable.bodyOffset}`;
    if (this.callStack.length >= 16 || this.callStack.includes(callKey)) return;
    this.callStack.push(callKey);
    this.processBlock(callable.body, callable.bodyOffset, callable, conditions);
    this.callStack.pop();
  }

  private processBlock(body: string, offset: number, callable: Callable, conditions: string[]): void {
    let index = 0;
    while (index < body.length) {
      index = skipSpace(body, index);
      if (index >= body.length) break;
      if (startsWord(body, index, "if")) {
        const parsed = parseIf(body, index);
        if (!parsed) { index += 2; continue; }
        const decision = this.evaluateCondition(parsed.condition);
        if (decision !== undefined) {
          const selected = decision ? parsed.whenTrue : parsed.whenFalse;
          if (selected) {
            const label = decision ? parsed.condition.trim() : `!(${parsed.condition.trim()})`;
            this.processBlock(selected.body, offset + selected.start, callable, [...conditions, label]);
          }
        }
        index = parsed.end;
        continue;
      }
      if (startsWord(body, index, "switch")) {
        const parsed = parseSwitch(body, index);
        if (!parsed) { index += 6; continue; }
        const selectedValue = this.evaluate(parsed.expression);
        if (selectedValue !== undefined) {
          const selected = selectSwitchCase(parsed.body, parsed.bodyStart, selectedValue, (value) => this.evaluate(value));
          if (selected) {
            const label = selected.label === "default"
              ? `switch(${parsed.expression.trim()}) default`
              : `${parsed.expression.trim()} == ${selected.label}`;
            this.processBlock(selected.body, offset + selected.start, callable, [...conditions, label]);
          }
        }
        index = parsed.end;
        continue;
      }
      const end = findStatementEnd(body, index);
      if (end < 0) break;
      this.processStatement(body.slice(index, end), offset + index, callable, conditions);
      index = end + 1;
    }
  }

  private processStatement(statement: string, absoluteIndex: number, callable: Callable, conditions: string[]): void {
    const raw = statement.trim();
    if (!raw || /^(?:break|continue)$/.test(raw) || raw.startsWith("return ")) return;

    const watermark = findWatermarkCall(raw);
    if (watermark && this.controls.has(watermark.controlName)) {
      const value = this.evaluate(watermark.expression);
      if (typeof value === "string") {
        this.applyControl(
          watermark.controlName,
          "PlaceholderText",
          value,
          watermark.expression,
          callable,
          absoluteIndex + watermark.index,
          conditions,
        );
      }
      return;
    }

    const reset = raw.match(/^(?:this\.)?([A-Za-z_]\w*)\.ResetText\s*\(\s*\)$/);
    if (reset && this.controls.has(reset[1])) {
      this.applyControl(reset[1], "text", "", `${reset[1]}.ResetText()`, callable, absoluteIndex, conditions);
      return;
    }

    const call = raw.match(/^(?:this\.)?([A-Za-z_]\w*)\s*\(\s*\)$/);
    if (call && call[1] !== "InitializeComponent") {
      const method = this.model.methods.get(call[1])?.find((candidate) => candidate.parameterCount === 0);
      if (method) this.execute(method, conditions);
      return;
    }

    const declaration = raw.match(/^(?:var|[A-Za-z_][\w.<>?,\[\]]*)\s+([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
    if (declaration) {
      const value = this.evaluate(declaration[2]);
      if (value !== undefined) this.environment.set(declaration[1], value);
      return;
    }

    const assignment = splitAssignments(raw);
    if (!assignment) return;
    const value = this.evaluate(assignment.expression);
    if (value === undefined) return;
    for (const rawTarget of assignment.targets.reverse()) {
      const target = rawTarget.trim().replace(/^this\./, "");
      const controlMember = target.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
      if (controlMember && this.controls.has(controlMember[1])) {
        this.applyControl(controlMember[1], controlMember[2], value, assignment.expression, callable, absoluteIndex, conditions);
        continue;
      }
      if (!/^[A-Za-z_]\w*$/.test(target)) continue;
      this.environment.set(target, value);
      const setter = this.model.setters.get(target);
      if (setter) {
        const previous = this.environment.get("value");
        const hadPrevious = this.environment.has("value");
        this.environment.set("value", value);
        this.execute(setter, conditions);
        if (hadPrevious) this.environment.set("value", previous!);
        else this.environment.delete("value");
      }
    }
  }

  private applyControl(
    controlName: string,
    sourceProperty: string,
    value: Resolved,
    expression: string,
    callable: Callable,
    absoluteIndex: number,
    conditions: string[],
  ): void {
    const control = this.controls.get(controlName)!;
    const property = targetProperty(sourceProperty);
    if (!property) return;
    let normalized: ComponentInitializationDefault["value"] | undefined;
    switch (property) {
      case "text":
        if (value === null || isVisualColor(value)) return;
        normalized = String(value);
        control.text = normalized;
        break;
      case "placeholderText":
        if (value === null || isVisualColor(value)) return;
        normalized = String(value);
        control.appearance.placeholderText = normalized;
        break;
      case "toolTipText":
        if (value === null || isVisualColor(value)) return;
        normalized = String(value);
        control.appearance.toolTipText = normalized;
        break;
      case "checked":
      case "enabled":
      case "readOnly":
      case "visible":
        if (typeof value !== "boolean") return;
        normalized = value;
        control.appearance[property] = value;
        break;
      case "selectedIndex":
        if (typeof value !== "number" || !Number.isInteger(value)) return;
        normalized = value;
        control.appearance.selectedIndex = value;
        break;
      case "selectedItem": {
        if (value === null || isVisualColor(value)) return;
        normalized = String(value);
        const index = control.items?.indexOf(normalized) ?? -1;
        if (index >= 0) control.appearance.selectedIndex = index;
        else if (control.kind === "ComboBox") control.text = normalized;
        break;
      }
      case "value":
        if (typeof value !== "string" && typeof value !== "number") return;
        normalized = value;
        control.appearance.value = value;
        break;
      case "foreColor":
      case "backColor":
        if (!isVisualColor(value)) return;
        normalized = value;
        control.appearance[property] = value;
        break;
    }
    if (normalized === undefined) return;
    const sourceOffset = callable.bodyOffset + Math.max(0, absoluteIndex - callable.bodyOffset);
    const item: ComponentInitializationDefault = {
      targetControlName: controlName,
      targetProperty: property,
      value: normalized,
      expression: expression.trim(),
      sourceFile: callable.sourceFile,
      line: lineAtFile(callable, sourceOffset),
      methodName: callable.name,
      ...(conditions.length ? { condition: conditions.join(" && ") } : {}),
    };
    this.materialized.set(`${controlName}|${property}`, item);
  }

  private evaluateCondition(expression: string): boolean | undefined {
    const value = this.evaluate(expression);
    return typeof value === "boolean" ? value : undefined;
  }

  private evaluate(expression: string): Resolved | undefined {
    let raw = stripOuterParens(expression.trim());
    while (true) {
      const cast = raw.match(/^\([A-Za-z_][\w.<>?,\[\]]*\)\s*/);
      if (!cast || !raw.slice(cast[0].length).trim()) break;
      raw = stripOuterParens(raw.slice(cast[0].length).trim());
    }
    if (!raw) return undefined;
    const or = splitTopLevelOperator(raw, "||");
    if (or) {
      const left = this.evaluateCondition(or[0]);
      const right = this.evaluateCondition(or[1]);
      return left === true || right === true ? true : left === false && right === false ? false : undefined;
    }
    const and = splitTopLevelOperator(raw, "&&");
    if (and) {
      const left = this.evaluateCondition(and[0]);
      const right = this.evaluateCondition(and[1]);
      return left === false || right === false ? false : left === true && right === true ? true : undefined;
    }
    const comparison = splitComparison(raw);
    if (comparison) {
      const left = this.evaluate(comparison.left);
      const right = this.evaluate(comparison.right);
      if (left === undefined || right === undefined || isVisualColor(left) || isVisualColor(right)) return undefined;
      return comparison.operator === "==" ? left === right : left !== right;
    }
    if (raw.startsWith("!")) {
      const value = this.evaluateCondition(raw.slice(1));
      return value === undefined ? undefined : !value;
    }
    if (/^true$/i.test(raw)) return true;
    if (/^false$/i.test(raw)) return false;
    if (raw === "null") return null;
    if (/^(?:string\.)?Empty$/.test(raw)) return "";
    const quoted = raw.match(/^"((?:\\.|[^"\\])*)"$/s);
    if (quoted) return decodeCString(quoted[1]);
    if (/^-?\d+(?:\.\d+)?[fFdDmM]?$/.test(raw)) return Number(raw.replace(/[fFdDmM]$/, ""));
    const color = parseColor(raw);
    if (color) return color;
    const resource = raw.match(/(?:^|\.)(?:Properties\.)?Resources\.([A-Za-z_]\w*)$/)?.[1];
    if (resource) return this.resources.get(resource);
    const emptyCheck = raw.match(/^string\.IsNullOrEmpty\s*\(\s*([A-Za-z_]\w*)\s*\)$/);
    if (emptyCheck) {
      const value = this.environment.get(emptyCheck[1]);
      return value === null || value === "" ? true : typeof value === "string" ? false : undefined;
    }
    const identifier = raw.replace(/^this\./, "");
    if (/^[A-Za-z_]\w*$/.test(identifier)) return this.environment.get(identifier);
    const enumMember = raw.match(/^[A-Za-z_][\w.<>]*\.([A-Za-z_]\w*)$/)?.[1];
    return enumMember;
  }
}

function buildClassModel(sources: SourceFile[], componentType: string): ClassModel {
  const model: ClassModel = {
    constructors: [],
    methods: new Map(),
    setters: new Map(),
    initialValues: new Map(),
  };
  for (const sourceFile of sources) {
    const clean = stripComments(sourceFile.source);
    const classPattern = new RegExp(`\\bclass\\s+${escapeRegExp(componentType)}\\b`, "g");
    for (const classMatch of clean.matchAll(classPattern)) {
      const classOpen = clean.indexOf("{", classMatch.index! + classMatch[0].length);
      if (classOpen < 0) continue;
      const classClose = findMatching(clean, classOpen, "{", "}");
      if (classClose < 0) continue;
      const body = clean.slice(classOpen + 1, classClose);
      const bodyOffset = classOpen + 1;
      collectFields(body, model.initialValues);
      collectProperties(body, bodyOffset, sourceFile.path, clean, model);
      collectConstructors(body, bodyOffset, sourceFile.path, clean, componentType, model.constructors);
      collectMethods(body, bodyOffset, sourceFile.path, clean, model.methods);
    }
  }
  return model;
}

function collectFields(body: string, values: Map<string, Resolved>): void {
  const pattern = /\b(?:public|private|protected|internal)\s+(?:(?:static|readonly|volatile|new|required)\s+)*([A-Za-z_][\w.<>?,\[\]]*)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?;/g;
  for (const match of body.matchAll(pattern)) {
    if (braceDepthAt(body, match.index!) !== 0) continue;
    const type = match[1].replace(/\?$/, "");
    const expression = match[3]?.trim();
    const literal = expression ? simpleLiteral(expression) : /^bool$/i.test(type) ? false : undefined;
    if (literal !== undefined) values.set(match[2], literal);
  }
}

function collectProperties(body: string, bodyOffset: number, sourceFile: string, source: string, model: ClassModel): void {
  const pattern = /\bpublic\s+(?:(?:virtual|override|new)\s+)?([A-Za-z_][\w.<>?,\[\]]*)\s+([A-Za-z_]\w*)\s*\{/g;
  for (const match of body.matchAll(pattern)) {
    if (braceDepthAt(body, match.index!) !== 0) continue;
    const open = match.index! + match[0].lastIndexOf("{");
    const close = findMatching(body, open, "{", "}");
    if (close < 0) continue;
    const propertyBody = body.slice(open + 1, close);
    if (/^bool\??$/i.test(match[1]) && /\bget\s*;/.test(propertyBody) && /\bset\s*;/.test(propertyBody)) {
      model.initialValues.set(match[2], false);
    }
    const setter = /\bset\s*\{/.exec(propertyBody);
    if (!setter) continue;
    const setterOpen = open + 1 + setter.index + setter[0].lastIndexOf("{");
    const setterClose = findMatching(body, setterOpen, "{", "}");
    if (setterClose < 0) continue;
    model.setters.set(match[2], {
      name: `${match[2]}.set`,
      parameterCount: 1,
      body: body.slice(setterOpen + 1, setterClose),
      bodyOffset: bodyOffset + setterOpen + 1,
      bodyLine: lineAt(source, bodyOffset + setterOpen + 1),
      sourceFile,
    });
  }
}

function collectConstructors(body: string, bodyOffset: number, sourceFile: string, source: string, typeName: string, output: Callable[]): void {
  const pattern = new RegExp(`\\b${escapeRegExp(typeName)}\\s*\\(([^)]*)\\)\\s*\\{`, "g");
  for (const match of body.matchAll(pattern)) {
    if (braceDepthAt(body, match.index!) !== 0) continue;
    const open = match.index! + match[0].lastIndexOf("{");
    const close = findMatching(body, open, "{", "}");
    if (close < 0) continue;
    output.push({
      name: typeName,
      parameterCount: parameterCount(match[1]),
      body: body.slice(open + 1, close),
      bodyOffset: bodyOffset + open + 1,
      bodyLine: lineAt(source, bodyOffset + open + 1),
      sourceFile,
    });
  }
}

function collectMethods(body: string, bodyOffset: number, sourceFile: string, source: string, output: Map<string, Callable[]>): void {
  const pattern = /\b(?:public|private|protected|internal)\s+(?:(?:static|virtual|override|async|sealed|new|partial)\s+)*(?:void|[A-Za-z_][\w.<>?,\[\]]*)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:where\s+[^{]+)?\{/g;
  for (const match of body.matchAll(pattern)) {
    if (braceDepthAt(body, match.index!) !== 0) continue;
    const open = match.index! + match[0].lastIndexOf("{");
    const close = findMatching(body, open, "{", "}");
    if (close < 0) continue;
    const callable: Callable = {
      name: match[1],
      parameterCount: parameterCount(match[2]),
      body: body.slice(open + 1, close),
      bodyOffset: bodyOffset + open + 1,
      bodyLine: lineAt(source, bodyOffset + open + 1),
      sourceFile,
    };
    const bucket = output.get(callable.name) ?? [];
    bucket.push(callable);
    output.set(callable.name, bucket);
  }
}

function targetProperty(value: string): ComponentInitializationDefault["targetProperty"] | undefined {
  return ({
    Text: "text",
    Checked: "checked",
    Enabled: "enabled",
    ReadOnly: "readOnly",
    PlaceholderText: "placeholderText",
    WatermarkText: "placeholderText",
    CueBannerText: "placeholderText",
    ToolTipText: "toolTipText",
    SelectedIndex: "selectedIndex",
    SelectedItem: "selectedItem",
    Value: "value",
    Visible: "visible",
    ForeColor: "foreColor",
    BackColor: "backColor",
  } as const)[value as "Text"];
}

type IfParse = {
  condition: string;
  whenTrue: { body: string; start: number };
  whenFalse?: { body: string; start: number };
  end: number;
};

function parseIf(source: string, start: number): IfParse | undefined {
  const conditionOpen = source.indexOf("(", start + 2);
  if (conditionOpen < 0) return undefined;
  const conditionClose = findMatching(source, conditionOpen, "(", ")");
  if (conditionClose < 0) return undefined;
  const whenTrue = parseStatementBody(source, conditionClose + 1);
  if (!whenTrue) return undefined;
  let end = whenTrue.end;
  let whenFalse: IfParse["whenFalse"];
  const elseStart = skipSpace(source, end);
  if (startsWord(source, elseStart, "else")) {
    const parsed = parseStatementBody(source, elseStart + 4);
    if (parsed) { whenFalse = { body: parsed.body, start: parsed.start }; end = parsed.end; }
  }
  return {
    condition: source.slice(conditionOpen + 1, conditionClose),
    whenTrue: { body: whenTrue.body, start: whenTrue.start },
    ...(whenFalse ? { whenFalse } : {}),
    end,
  };
}

function parseSwitch(source: string, start: number): { expression: string; body: string; bodyStart: number; end: number } | undefined {
  const open = source.indexOf("(", start + 6);
  if (open < 0) return undefined;
  const close = findMatching(source, open, "(", ")");
  if (close < 0) return undefined;
  const blockOpen = source.indexOf("{", close + 1);
  if (blockOpen < 0) return undefined;
  const blockClose = findMatching(source, blockOpen, "{", "}");
  if (blockClose < 0) return undefined;
  return { expression: source.slice(open + 1, close), body: source.slice(blockOpen + 1, blockClose), bodyStart: blockOpen + 1, end: blockClose + 1 };
}

function selectSwitchCase(
  body: string,
  bodyStart: number,
  selected: Resolved,
  evaluate: (value: string) => Resolved | undefined,
): { label: string; body: string; start: number } | undefined {
  const labels: Array<{ label: string; start: number; contentStart: number }> = [];
  const pattern = /\b(case\s+([^:]+)|default)\s*:/g;
  for (const match of body.matchAll(pattern)) {
    if (braceDepthAt(body, match.index!) !== 0) continue;
    labels.push({ label: match[2]?.trim() ?? "default", start: match.index!, contentStart: match.index! + match[0].length });
  }
  let fallback: typeof labels[number] | undefined;
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (label.label === "default") { fallback = label; continue; }
    const value = evaluate(label.label);
    if (value !== undefined && !isVisualColor(value) && value === selected) {
      return { label: label.label, body: body.slice(label.contentStart, labels[index + 1]?.start ?? body.length), start: bodyStart + label.contentStart };
    }
  }
  if (!fallback) return undefined;
  const index = labels.indexOf(fallback);
  return { label: "default", body: body.slice(fallback.contentStart, labels[index + 1]?.start ?? body.length), start: bodyStart + fallback.contentStart };
}

function parseStatementBody(source: string, from: number): { body: string; start: number; end: number } | undefined {
  const start = skipSpace(source, from);
  if (source[start] === "{") {
    const close = findMatching(source, start, "{", "}");
    return close < 0 ? undefined : { body: source.slice(start + 1, close), start: start + 1, end: close + 1 };
  }
  const end = findStatementEnd(source, start);
  return end < 0 ? undefined : { body: source.slice(start, end + 1), start, end: end + 1 };
}

function splitAssignments(statement: string): { targets: string[]; expression: string } | undefined {
  const positions: number[] = [];
  let depth = 0;
  let quote = "";
  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ("([{<".includes(char)) depth += 1;
    else if (")]}>".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "=" && depth === 0 && statement[index - 1] !== "=" && statement[index + 1] !== "=" && statement[index + 1] !== ">"
      && !"!<>".includes(statement[index - 1] ?? "")) positions.push(index);
  }
  if (!positions.length) return undefined;
  const targets: string[] = [];
  let start = 0;
  for (const position of positions) {
    targets.push(statement.slice(start, position).trim());
    start = position + 1;
  }
  const expression = statement.slice(start).trim();
  return targets.every((target) => /^(?:this\.)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/.test(target)) && expression
    ? { targets, expression }
    : undefined;
}

function splitComparison(value: string): { left: string; right: string; operator: "==" | "!=" } | undefined {
  for (const operator of ["==", "!="] as const) {
    const split = splitTopLevelOperator(value, operator);
    if (split) return { left: split[0], right: split[1], operator };
  }
  return undefined;
}

function splitTopLevelOperator(value: string, operator: string): [string, string] | undefined {
  let depth = 0;
  let quote = "";
  for (let index = 0; index <= value.length - operator.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && value.slice(index, index + operator.length) === operator) {
      return [value.slice(0, index), value.slice(index + operator.length)];
    }
  }
  return undefined;
}

function findStatementEnd(source: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) return index;
  }
  return -1;
}

function stripOuterParens(value: string): string {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")") && findMatching(result, 0, "(", ")") === result.length - 1) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function parseColor(expression: string): VisualColor | undefined {
  const match = expression.match(/(?:System\.Drawing\.)?Color\.FromArgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!match) return undefined;
  return { cssColor: `rgb(${Number(match[1])}, ${Number(match[2])}, ${Number(match[3])})` };
}

function simpleLiteral(expression: string): Resolved | undefined {
  const raw = expression.trim();
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  if (raw === "null") return null;
  const quoted = raw.match(/^"((?:\\.|[^"\\])*)"$/s);
  if (quoted) return decodeCString(quoted[1]);
  if (/^-?\d+(?:\.\d+)?[fFdDmM]?$/.test(raw)) return Number(raw.replace(/[fFdDmM]$/, ""));
  const enumMember = raw.match(/^[A-Za-z_][\w.<>]*\.([A-Za-z_]\w*)$/)?.[1];
  return enumMember;
}

function isVisualColor(value: Resolved): value is VisualColor {
  return typeof value === "object" && value !== null && "cssColor" in value;
}

function parameterCount(source: string): number {
  if (!source.trim()) return 0;
  return splitArguments(source).length;
}

function splitArguments(source: string): string[] {
  const output: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ("(<[".includes(source[index])) depth += 1;
    else if (")>]".includes(source[index])) depth = Math.max(0, depth - 1);
    else if (source[index] === "," && depth === 0) { output.push(source.slice(start, index).trim()); start = index + 1; }
  }
  output.push(source.slice(start).trim());
  return output.filter(Boolean);
}

function findMatching(source: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote = "";
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === openChar) depth += 1;
    else if (char === closeChar && --depth === 0) return index;
  }
  return -1;
}

function braceDepthAt(source: string, end: number): number {
  let depth = 0;
  let quote = "";
  for (let index = 0; index < end; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function skipSpace(source: string, from: number): number {
  let index = from;
  while (/\s/.test(source[index] ?? "")) index += 1;
  return index;
}

function startsWord(source: string, index: number, word: string): boolean {
  return source.slice(index, index + word.length) === word
    && !/[A-Za-z0-9_]/.test(source[index - 1] ?? "")
    && !/[A-Za-z0-9_]/.test(source[index + word.length] ?? "");
}

async function collectContextFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const skip = new Set([".git", "node_modules", "bin", "obj", "dist", ".next"]);
  const walk = async (path: string): Promise<void> => {
    const info = await stat(path);
    if (info.isFile()) {
      if (path.endsWith(".cs")) result.push(path);
      return;
    }
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    await Promise.all(entries.filter((entry) => !entry.isDirectory() || !skip.has(entry.name)).map((entry) => walk(join(path, entry.name))));
  };
  await walk(root);
  result.sort();
  return result;
}

function findWatermarkCall(statement: string): { controlName: string; expression: string; index: number } | undefined {
  const pattern = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(?:SetWatermark|SetCueBanner|SetPlaceholder(?:Text)?)\s*\(/g;
  const match = pattern.exec(statement);
  if (!match) return undefined;
  const open = statement.indexOf("(", match.index + match[0].length - 1);
  const close = findMatching(statement, open, "(", ")");
  if (open < 0 || close < 0) return undefined;
  const expression = splitArguments(statement.slice(open + 1, close))[0];
  return expression ? { controlName: match[1], expression, index: match.index } : undefined;
}

function decodeCString(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function lineAtFile(callable: Callable, absoluteIndex: number): number {
  return callable.bodyLine
    + callable.body.slice(0, Math.max(0, absoluteIndex - callable.bodyOffset)).split("\n").length - 1;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
