import { basename } from "node:path";
import type {
  BindingInfo,
  ContractPoint,
  MigrationHint,
  NavEdge,
  PropertyGridObjectSource,
  RuntimeLayoutHint,
  RuntimeControlBinding,
  RuntimeItemSource,
  RuntimeTabNavigator,
  RuntimeValueSource,
  RuntimeVisibilityGroup,
  VisualColumn,
  VisualControl,
  VisualForm,
} from "../ir/types.js";
import { stripComments } from "./designerParser.js";

export type CodeMethodInfo = {
  ownerType?: string;
  name: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  calledSymbols: string[];
  propertyReads: string[];
  assignedSymbols: string[];
  constructedTypes: string[];
  awaitedCalls: string[];
  valueWrites: NonNullable<MigrationHint["valueWrites"]>;
  bodyStart: number;
  bodyEnd: number;
};

export type CodeFieldInfo = {
  ownerType: string;
  name: string;
  typeName: string;
  sourceFile: string;
  line: number;
};

export type CodeBehindInfo = {
  fields: CodeFieldInfo[];
  methods: CodeMethodInfo[];
  handlers: MigrationHint[];
  navigations: NavEdge[];
  bindings: BindingInfo[];
  layoutHints: RuntimeLayoutHint[];
  visibilityGroups: RuntimeVisibilityGroup[];
  controlBindings: Array<Omit<RuntimeControlBinding, "triggerControlName" | "triggerEvent">>;
  tabNavigators: RuntimeTabNavigator[];
  itemHints: Array<{ controlName: string; source: RuntimeItemSource }>;
  appearanceHints: Array<{ controlName: string; property: "image" | "imageKey"; value: string }>;
  propertyGridHints: Array<{ controlName: string; source: PropertyGridObjectSource }>;
  valueHints: Array<{ controlName: string; source: RuntimeValueSource }>;
  gridColumnHints: Array<{ controlName: string; column: VisualColumn }>;
  menuItemHints: Array<{ controlName: string; text: string; handler?: string }>;
};

const CS_KEYWORDS = new Set([
  "if",
  "for",
  "foreach",
  "while",
  "switch",
  "using",
  "return",
  "lock",
  "catch",
  "get",
  "set",
  "sizeof",
  "typeof",
  "nameof",
  "new",
]);

// C# identifier fragment that also matches non-ASCII (CJK/accented) names.
// JS \w is ASCII-only; used for handler/control NAMES (types stay ASCII).
const IDENT = "[A-Za-z_\\u0080-\\uFFFF][\\w\\u0080-\\uFFFF]*";
// Event handler signature: `... void Name(object sender, ... EventArgs ...)`.
// Allow C# 8+ nullable annotations (`object? sender`, `EventArgs? e`).
const HANDLER_RE = new RegExp(
  `(?:private|protected|public|internal)?\\s*(?:async\\s+)?(?:void|Task)\\s+(${IDENT})\\s*\\(\\s*object\\??\\s+\\w+\\s*,\\s*[A-Za-z_][\\w.]*(?:EventArgs|Args)\\??\\b[^)]*\\)`, "g");
const METHOD_DECL_RE = /^\s*(?:(?:public|private|protected|internal|static|virtual|override|sealed|async|new|partial|extern|unsafe)\s+)+(?:(?:[A-Za-z_][\w.<>,?\[\]]*)\s+)?([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:where\s+[^{]+)?\{/gm;
// Method invocation inside a body: `Foo(`, `a.b.Foo(`, `_a?.Foo(`, or generic `Foo<T>(`.
const CALL_RE = /(?<![.\w])([A-Za-z_]\w*(?:(?:\.|\?\.)[A-Za-z_]\w*)*)\s*(?:<[^<>()]*>)?\s*\(/g;
const PROPERTY_READ_RE = /(?<![.\w])((?:this\.)?[A-Za-z_]\w*(?:(?:\.|\?\.)[A-Za-z_]\w*)+)\b(?!\s*(?:<[^<>()]*>)?\s*\()/g;
const ASSIGNED_SYMBOL_RE = /(?<![=!<>.\w])((?:this\.)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:\+\+|--|(?:\?\?|<<|>>|[+\-*/%&|^])?=(?!=|>))/g;
const CONSTRUCTED_TYPE_RE = /\bnew\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s*<[^;{}()]+>)?\s*(?=\(|\{|\[)/g;
const AWAITED_CALL_RE = /\bawait\s+((?:this\.)?[A-Za-z_]\w*(?:(?:\.|\?\.)[A-Za-z_]\w*)*)\s*(?:<[^<>()]*>)?\s*\(/g;
const TYPE_DECL_RE = /\b(?:class|record|struct)\s+([A-Za-z_]\w*)\b[^{;]*\{/g;
const FIELD_DECL_RE = /^\s*(?:(?:public|private|protected|internal|static|readonly|volatile|new|const)\s+)*((?:global::)?[A-Za-z_]\w*(?:(?:\.|::)[A-Za-z_]\w*)*(?:\s*<[^;={}()]+>)?(?:\[\])?\??)\s+([A-Za-z_]\w*)\s*(?:=[^;]*)?;/gm;
// Navigation: `new SomeForm(...).Show()` / `.ShowDialog()` or `x.Show(`/`x.ShowDialog(`.
const NEW_SHOW_RE = /new\s+([A-Z]\w*)\s*\([^;]*?\)\s*\.\s*(Show|ShowDialog)\s*\(/g;
const VAR_SHOW_RE = /([A-Za-z_]\w*)\s*\.\s*(Show|ShowDialog)\s*\(/g;
// `var f = new DetailForm(` or `DetailForm f = new DetailForm(` → [var, Type].
const VAR_ASSIGN_NEW_RE = /(?:var|[A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*=\s*new\s+([A-Z]\w*)\s*\(/g;
// Framework dialogs that are not navigable forms.
const NON_FORM_DIALOGS = new Set(["MessageBox", "MsgBox"]);
// Message-box helper classes are not navigable forms. Covers MessageBox,
// MessageBoxes (gitextensions), CustomMessageBox, etc., plus MsgBox.
function isMessageBoxLike(name: string): boolean {
  return NON_FORM_DIALOGS.has(name) || /messagebox/i.test(name);
}
// Bindings.
const DATASOURCE_RE = /([A-Za-z_]\w*)\s*\.\s*DataSource\s*=\s*(?:this\.)?([A-Za-z_][\w.]*)/g;
const NEW_BINDINGSOURCE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s+BindingSource\s*\(/g;
// x.DataBindings.Add("Prop", source, "Field")
const DATABINDINGS_RE =
  /([A-Za-z_]\w*)\s*\.\s*DataBindings\s*\.\s*Add\s*\(\s*"([^"]*)"\s*,\s*(?:this\.)?([A-Za-z_][\w.]*)\s*(?:,\s*"([^"]*)")?/g;
// x.DataBindings.Add(new Binding("Prop", source, "Field")) — the object overload.
const DATABINDINGS_NEW_RE =
  /([A-Za-z_]\w*)\s*\.\s*DataBindings\s*\.\s*Add\s*\(\s*new\s+Binding\s*\(\s*"([^"]*)"\s*,\s*(?:this\.)?([A-Za-z_][\w.]*)\s*(?:,\s*"([^"]*)")?/g;
const CS_EXPR_KEYWORDS = new Set(["typeof", "new", "null", "nameof", "sizeof", "default"]);
const PANEL_PARENT_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Parent\s*=\s*(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Panel([12])\b/g;
const RUNTIME_IMAGE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(ImageKey|Image)\s*=\s*([^;]+);/g;
const IMAGELIST_ADD_RESOURCE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Images\s*\.\s*Add\s*\(\s*(?:[A-Za-z_]\w*\.)*Resources\.([A-Za-z_]\w*)\s*\)/g;
const IMAGELIST_ASSIGN_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*ImageList\s*=\s*(?:this\.)?([A-Za-z_]\w*)\s*;/g;
const NEW_TABPAGE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s+TabPage\b/g;
const ADD_TABPAGE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(?:Controls|TabPages)\s*\.\s*Add\s*\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)/g;
const TAB_NAVIGATOR_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*TabControl)\s*=\s*(?:this\.)?([A-Za-z_]\w*)\s*;/g;
const VISIBLE_ASSIGN_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Visible\s*=\s*(true|false)\s*;/g;
const TABPAGE_REMOVE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*TabPages\s*\.\s*Remove\s*\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)\s*;/g;
const CONTROL_STATE_BINDING_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(Enabled|ReadOnly|Visible)\s*=\s*(!\s*)?(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(Checked|Enabled|ReadOnly|Visible)\s*;/g;
const ADD_ENUM_ITEMS_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*AddEnums\s*<\s*([A-Za-z_][\w.]*)\s*>\s*\(/g;
const ADD_RANGE_ENUM_DESCRIPTIONS_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*AddRange\s*\(\s*(?:[A-Za-z_][\w.]*\.)?(Get(?:Localized)?EnumDescriptions)\s*<\s*([A-Za-z_][\w.]*)\s*>\s*\(\s*\)\s*(?:\.\s*ToArray\s*\(\s*\))?\s*\)/g;
const ADD_RANGE_ENUM_NAMES_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*AddRange\s*\(\s*(?:System\s*\.\s*)?Enum\s*\.\s*GetNames\s*\(\s*typeof\s*\(\s*([A-Za-z_][\w.]*)\s*\)\s*\)\s*(?:\.\s*ToArray\s*\(\s*\))?\s*\)/g;
const ADD_RANGE_ITEMS_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*AddRange\s*\(/g;
const ADD_LIST_ITEMS_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*AddList\s*\(/g;
const GENERIC_SEQUENCE_RE = /(?:List|IList|IEnumerable|IReadOnlyList|ICollection|IReadOnlyCollection|Collection|ObservableCollection|BindingList|HashSet)\s*<\s*([A-Za-z_][\w.]*)\s*>\??\s+([A-Za-z_]\w*)/g;
const SELECTED_OBJECT_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*SelectedObject\s*=\s*([^;]+);/g;
const CAST_LIST_ITEM_RE = /\(\s*([A-Z][\w.]*)\s*\)\s*(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\[/g;
const ADD_NEW_LIST_ITEM_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*Add\s*\(\s*new\s+([A-Z][\w.]*)\b/g;
const TYPED_VARIABLE_RE = /\b([A-Z][\w.]*)\s+([A-Za-z_]\w*)\s*=\s*(?!>)/g;
const FOREACH_VARIABLE_RE = /\bforeach\s*\(\s*([A-Z][\w.]*)\s+([A-Za-z_]\w*)\s+in\b/g;
const ADD_VARIABLE_LIST_ITEM_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\.\s*Add\s*\(\s*([A-Za-z_]\w*)\s*\)/g;
const MEMBER_TYPE_RE = /\b(?:public|private|protected|internal)\s+(?:(?:static|readonly|volatile|new|required)\s+)*([A-Z][\w.]*(?:\s*<[^;{}=]+>)?\??(?:\[\])?)\s+([A-Za-z_]\w*)\s*(?=\{|=|;)/g;
const RUNTIME_VALUE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(Text|Checked|Enabled|ReadOnly|PlaceholderText|WatermarkText|CueBannerText|ToolTipText|SelectedIndex|SelectedItem|Value)\s*=\s*([^;]+);/g;
const WATERMARK_CALL_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(?:SetWatermark|SetCueBanner|SetPlaceholder(?:Text)?)\s*\(/g;
const TOOLTIP_CALL_RE = new RegExp(`(?:this\\.)?${IDENT}\\s*\\.\\s*SetToolTip\\s*\\(`, "g");

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

function labelFromRuntimeTabName(name: string): string {
  const value = name.replace(/^_+/, "").replace(/TabPage$/i, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return value ? value[0].toUpperCase() + value.slice(1) : "Runtime tab";
}

function parseCodeLiteral(expression: string): string | number | boolean | undefined {
  const value = expression.trim();
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^(?:string\.)?Empty$/.test(value)) return "";
  const verbatim = value.match(/^@"((?:""|[^"])*)"$/s);
  if (verbatim) return verbatim[1].replace(/""/g, '"');
  const quoted = value.match(/^"((?:\\.|[^"\\])*)"$/s);
  if (quoted) {
    try {
      return JSON.parse(`"${quoted[1]}"`) as string;
    } catch {
      return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  const numeric = value.match(/^(-?\d+(?:\.\d+)?)(?:[fFdDmMlLuU]+)?$/);
  return numeric ? Number(numeric[1]) : undefined;
}

function methodAt(methods: CodeMethodInfo[], index: number): CodeMethodInfo | undefined {
  return methods.find((method) => index >= method.lineStart && index <= method.lineEnd);
}

function isConditionalAssignment(source: string, method: CodeMethodInfo, assignmentIndex: number, includeDeferred = true): boolean {
  const stack = [false];
  let statementStart = method.bodyStart + 1;
  for (let index = method.bodyStart + 1; index < assignmentIndex; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipCodeQuoted(source, index, char);
      continue;
    }
    if (char === "{") {
      const prefix = source.slice(statementStart, index);
      const deferredOrConditional = includeDeferred
        ? /\b(?:if|else|switch|for|foreach|while|do|catch)\b|=>|\bdelegate\b/.test(prefix)
        : /\b(?:if|else|switch|for|foreach|while|do|catch)\b/.test(prefix);
      stack.push(stack[stack.length - 1] || deferredOrConditional);
      statementStart = index + 1;
    } else if (char === "}") {
      if (stack.length > 1) stack.pop();
      statementStart = index + 1;
    } else if (char === ";") {
      statementStart = index + 1;
    }
  }
  const trailingStatement = source.slice(statementStart, assignmentIndex);
  const trailingPattern = includeDeferred
    ? /\b(?:if|else|for|foreach|while)\s*\(|=>|\bdelegate\b/
    : /\b(?:if|else|for|foreach|while)\s*\(/;
  return stack[stack.length - 1] || trailingPattern.test(trailingStatement);
}

function skipCodeQuoted(source: string, quoteIndex: number, quote: string): number {
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

// Find the method body `{...}` starting at/after `fromIndex`; return [bodyStart, bodyEnd, endLine].
function matchBody(source: string, fromIndex: number): { start: number; end: number } | null {
  let i = source.indexOf("{", fromIndex);
  if (i === -1) return null;
  const start = i;
  let depth = 0;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      // Skip over the string/char literal so its braces don't affect depth.
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

type CodeTypeSpan = { name: string; start: number; bodyStart: number; end: number };

function codeTypeSpans(source: string): CodeTypeSpan[] {
  const spans: CodeTypeSpan[] = [];
  TYPE_DECL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TYPE_DECL_RE.exec(source)) !== null) {
    const body = matchBody(source, match.index);
    if (!body) continue;
    spans.push({ name: match[1], start: match.index, bodyStart: body.start, end: body.end });
  }
  return spans;
}

function ownerSpanAt(spans: CodeTypeSpan[], index: number): CodeTypeSpan | undefined {
  return spans
    .filter((span) => index > span.bodyStart && index < span.end)
    .sort((left, right) => right.bodyStart - left.bodyStart)[0];
}

function ownerTypeAt(spans: CodeTypeSpan[], index: number): string | undefined {
  return ownerSpanAt(spans, index)?.name;
}

function isDirectTypeMember(source: string, span: CodeTypeSpan, index: number): boolean {
  let depth = 1;
  for (let cursor = span.bodyStart + 1; cursor < index; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'") {
      cursor = skipCodeQuoted(source, cursor, character);
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
  }
  return depth === 1;
}

function shortDeclaredType(typeName: string): string {
  const withoutGlobal = typeName.replace(/^global::/, "").replace(/\?$/, "").replace(/\[\]$/, "").trim();
  const outer = withoutGlobal.split("<", 1)[0].trim();
  return outer.split(/\.|::/).pop() ?? outer;
}

function extractDeclaredFields(
  source: string,
  sourceFile: string,
  spans: CodeTypeSpan[],
  methods: CodeMethodInfo[],
): CodeFieldInfo[] {
  const fields: CodeFieldInfo[] = [];
  FIELD_DECL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FIELD_DECL_RE.exec(source)) !== null) {
    const ownerSpan = ownerSpanAt(spans, match.index);
    if (!ownerSpan || !isDirectTypeMember(source, ownerSpan, match.index)) continue;
    const ownerType = ownerSpan.name;
    if (methods.some((method) => match!.index > method.bodyStart && match!.index < method.bodyEnd)) continue;
    fields.push({
      ownerType,
      typeName: shortDeclaredType(match[1]),
      name: match[2],
      sourceFile,
      line: lineOf(source, match.index),
    });
  }
  return fields;
}

function matchingDelimiter(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function callArguments(source: string, openParen: number, closeParen: number): string[] {
  const output: string[] = [];
  let start = openParen + 1;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = openParen + 1; index < closeParen; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < closeParen && source[index] !== quote) {
        if (source[index] === "\\") index += 1;
        index += 1;
      }
      continue;
    }
    if (char === "(") round += 1;
    else if (char === ")") round = Math.max(0, round - 1);
    else if (char === "[") square += 1;
    else if (char === "]") square = Math.max(0, square - 1);
    else if (char === "{") curly += 1;
    else if (char === "}") curly = Math.max(0, curly - 1);
    else if (char === "," && round === 0 && square === 0 && curly === 0) {
      output.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  output.push(source.slice(start, closeParen).trim());
  return output.filter(Boolean);
}

function firstCallArgument(source: string, openParen: number, closeParen: number): string {
  return callArguments(source, openParen, closeParen)[0] ?? "";
}

function visibleAssignments(body: string): { hidden: string[]; shown: string[]; removedTabs: string[] } {
  const hidden = new Set<string>();
  const shown = new Set<string>();
  VISIBLE_ASSIGN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VISIBLE_ASSIGN_RE.exec(body)) !== null) {
    const target = match[2] === "false" ? hidden : shown;
    const opposite = match[2] === "false" ? shown : hidden;
    target.add(match[1]);
    opposite.delete(match[1]);
  }
  const removedTabs = new Set<string>();
  TABPAGE_REMOVE_RE.lastIndex = 0;
  while ((match = TABPAGE_REMOVE_RE.exec(body)) !== null) {
    removedTabs.add(match[2]);
    hidden.add(match[2]);
    shown.delete(match[2]);
  }
  return { hidden: [...hidden], shown: [...shown], removedTabs: [...removedTabs] };
}

function extractVisibilityGroups(source: string, sourceFile: string): RuntimeVisibilityGroup[] {
  const groups: RuntimeVisibilityGroup[] = [];
  const seen = new Set<string>();
  const ifPattern = /\bif\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = ifPattern.exec(source)) !== null) {
    const openParen = source.indexOf("(", match.index);
    const closeParen = matchingDelimiter(source, openParen, "(", ")");
    if (closeParen === -1) continue;
    let cursor = closeParen + 1;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    if (source[cursor] !== "{") continue;
    const trueBody = matchBody(source, cursor);
    if (!trueBody || trueBody.start !== cursor) continue;
    cursor = trueBody.end + 1;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    const whenTrue = visibleAssignments(source.slice(trueBody.start + 1, trueBody.end));
    let whenFalse: ReturnType<typeof visibleAssignments> = { hidden: [], shown: [], removedTabs: [] };
    if (source.startsWith("else", cursor)) {
      cursor += 4;
      while (/\s/.test(source[cursor] || "")) cursor += 1;
      // An `else if` is a separate state tree, not a two-way visibility switch.
      if (source.startsWith("if", cursor) || source[cursor] !== "{") continue;
      const falseBody = matchBody(source, cursor);
      if (!falseBody || falseBody.start !== cursor) continue;
      whenFalse = visibleAssignments(source.slice(falseBody.start + 1, falseBody.end));
    } else if (whenTrue.removedTabs.length === 0) {
      // One-sided Visible assignments are too ambiguous to pick as a preview
      // state. TabPages.Remove is structurally unambiguous: the opposite branch
      // retains the page already declared by the Designer.
      continue;
    }
    const trueHidden = whenTrue.hidden.filter((name) => !whenFalse.hidden.includes(name));
    const falseHidden = whenFalse.hidden.filter((name) => !whenTrue.hidden.includes(name));
    const removesTab = whenTrue.removedTabs.length > 0 || whenFalse.removedTabs.length > 0;
    if (!removesTab && (trueHidden.length === 0 || falseHidden.length === 0)) continue;
    if (trueHidden.length === 0 && falseHidden.length === 0) continue;
    const all = [...new Set([...trueHidden, ...falseHidden])].sort();
    const key = all.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const condition = source.slice(openParen + 1, closeParen).replace(/\s+/g, " ").trim();
    const trueShown = [...new Set([...whenTrue.shown, ...falseHidden])];
    const falseShown = [...new Set([...whenFalse.shown, ...trueHidden])];
    // A removed tab is an optional surface whose data/config prerequisite is
    // unresolved during a UI-first migration. Prefer the source-proven minimal
    // surface, but preserve both branches in neutral IR.
    const defaultVariant = removesTab && trueHidden.length === 0 && falseHidden.length > 0 ? 1 : 0;
    groups.push({
      condition,
      defaultVariant,
      variants: [
        { label: condition || "condition true", hiddenControls: trueHidden, shownControls: trueShown },
        { label: condition ? `not (${condition})` : "condition false", hiddenControls: falseHidden, shownControls: falseShown },
      ],
      sourceFile,
      line: lineOf(source, match.index),
    });
  }
  return groups;
}

function normalizeControlStateProperty(value: string): RuntimeControlBinding["sourceProperty"] {
  return value.charAt(0).toLowerCase() + value.slice(1) as RuntimeControlBinding["sourceProperty"];
}

function extractControlBindings(
  source: string,
  sourceFile: string,
  methods: CodeMethodInfo[],
  handlers: MigrationHint[],
): CodeBehindInfo["controlBindings"] {
  const bindings: CodeBehindInfo["controlBindings"] = [];
  const seen = new Set<string>();
  CONTROL_STATE_BINDING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONTROL_STATE_BINDING_RE.exec(source)) !== null) {
    const line = lineOf(source, match.index);
    const handler = methodAt(methods, line)?.name ?? enclosingHandler(handlers, line);
    if (!handler) continue;
    const targetProperty = normalizeControlStateProperty(match[2]);
    const sourceProperty = normalizeControlStateProperty(match[5]);
    const key = `${handler}|${match[1]}|${targetProperty}|${match[4]}|${sourceProperty}|${Boolean(match[3])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bindings.push({
      handler,
      targetControlName: match[1],
      targetProperty,
      sourceControlName: match[4],
      sourceProperty,
      ...(match[3] ? { negated: true } : {}),
      sourceFile,
      line,
    });
  }
  return bindings;
}

function extractCalledSymbols(body: string): string[] {
  const symbols = new Set<string>();
  let m: RegExpExecArray | null;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(body)) !== null) {
    const symbol = normalizeConditionalAccess(m[1]);
    const tail = symbol.split(".").pop() ?? symbol;
    if (CS_KEYWORDS.has(tail)) continue;
    symbols.add(symbol);
  }
  return [...symbols].sort();
}

function extractMethodEvidence(body: string): Pick<CodeMethodInfo, "propertyReads" | "assignedSymbols" | "constructedTypes" | "awaitedCalls"> {
  return {
    propertyReads: extractRegexSymbols(body, PROPERTY_READ_RE),
    assignedSymbols: extractRegexSymbols(body, ASSIGNED_SYMBOL_RE),
    constructedTypes: extractRegexSymbols(body, CONSTRUCTED_TYPE_RE),
    awaitedCalls: extractRegexSymbols(body, AWAITED_CALL_RE),
  };
}

function extractRegexSymbols(body: string, pattern: RegExp): string[] {
  const values = new Set<string>();
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) values.add(normalizeConditionalAccess(match[1]));
  return [...values].sort();
}

function normalizeConditionalAccess(symbol: string): string {
  return symbol.replaceAll("?.", ".");
}

function splitCodeArguments(source: string): string[] {
  const output: string[] = [];
  let depth = 0;
  let start = 0;
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ("(<[".includes(char)) depth += 1;
    else if (")>]".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) { output.push(source.slice(start, index).trim()); start = index + 1; }
  }
  output.push(source.slice(start).trim());
  return output.filter(Boolean);
}

function constructorArguments(expression: string, typeName: string): string[] | undefined {
  const match = new RegExp(`\\bnew\\s+(?:[A-Za-z_]\\w*\\.)*${typeName}\\s*\\(`).exec(expression);
  if (!match) return undefined;
  const open = expression.indexOf("(", match.index);
  let depth = 0;
  let quote = "";
  for (let index = open; index < expression.length; index += 1) {
    const char = expression[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return splitCodeArguments(expression.slice(open + 1, index));
  }
  return undefined;
}

function displayLiteral(expression: string, stringConstants: ReadonlyMap<string, string> = new Map()): string | undefined {
  const literal = parseCodeLiteral(expression);
  if (typeof literal === "string") return literal;
  const strings = [...expression.matchAll(/"((?:\\.|[^"\\])*)"/g)];
  if (strings.length > 0) return strings[strings.length - 1][1].replace(/\\"/g, '"');
  const named = expression.match(/nameof\s*\(\s*([A-Za-z_]\w*)\s*\)/)?.[1];
  if (named) return named;
  const identifier = expression.trim().match(/^([A-Za-z_]\w*)$/)?.[1];
  if (identifier && stringConstants.has(identifier)) return stringConstants.get(identifier);
  const referencedConstant = [...expression.matchAll(/\b([A-Za-z_]\w*)\b/g)]
    .map((match) => match[1]).reverse().find((name) => stringConstants.has(name));
  return referencedConstant ? stringConstants.get(referencedConstant) : undefined;
}

function extractGridColumnHints(source: string): CodeBehindInfo["gridColumnHints"] {
  const hints: CodeBehindInfo["gridColumnHints"] = [];
  const variables = new Map<string, { headerText: string; width?: number }>();
  const stringConstants = new Map([...source.matchAll(/\bconst\s+string\s+([A-Za-z_]\w*)\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g)]
    .map((match) => [match[1], match[2].replace(/\\"/g, '"')] as const));
  const seen = new Set<string>();
  for (const statementMatch of source.matchAll(/[^;]+;/g)) {
    const statement = statementMatch[0];
    const assignment = statement.match(/(?:GridColumn|var)?\s*([A-Za-z_]\w*)\s*=\s*(new\s+(?:[A-Za-z_]\w*\.)*GridColumn\s*\([\s\S]*)/);
    if (assignment) {
      const args = constructorArguments(assignment[2], "GridColumn");
      const headerText = args?.[0] ? displayLiteral(args[0], stringConstants) : undefined;
      if (headerText) {
        const widthValue = args?.[1] ? parseCodeLiteral(args[1]) : undefined;
        variables.set(assignment[1], { headerText, ...(typeof widthValue === "number" ? { width: widthValue } : {}) });
      }
    }
    const add = statement.match(/(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Columns\s*\.\s*Add\s*\(([\s\S]*)\)\s*;/);
    if (!add) continue;
    const inlineArgs = constructorArguments(add[2], "GridColumn");
    const inlineHeader = inlineArgs?.[0] ? displayLiteral(inlineArgs[0], stringConstants) : undefined;
    const inlineWidth = inlineArgs?.[1] ? parseCodeLiteral(inlineArgs[1]) : undefined;
    const variable = add[2].trim().match(/^([A-Za-z_]\w*)$/)?.[1];
    const value = inlineHeader
      ? { headerText: inlineHeader, ...(typeof inlineWidth === "number" ? { width: inlineWidth } : {}) }
      : variable ? variables.get(variable) : undefined;
    if (!value) continue;
    const key = `${add[1]}|${value.headerText}|${value.width ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ controlName: add[1], column: {
      name: `${add[1]}RuntimeColumn${hints.filter((hint) => hint.controlName === add[1]).length + 1}`,
      headerText: value.headerText,
      ...(value.width !== undefined ? { width: value.width } : {}),
      kind: "GridColumn",
    } });
  }
  return hints;
}

function extractMenuItemHints(source: string): CodeBehindInfo["menuItemHints"] {
  const hints: CodeBehindInfo["menuItemHints"] = [];
  const variables = new Map<string, { text: string; handler?: string }>();
  const seen = new Set<string>();
  for (const statementMatch of source.matchAll(/[^;]+;/g)) {
    const statement = statementMatch[0];
    const assignment = statement.match(/(?:MenuItemOD|var)?\s*([A-Za-z_]\w*)\s*=\s*(new\s+(?:[A-Za-z_]\w*\.)*MenuItemOD\s*\([\s\S]*)/);
    if (assignment) {
      const args = constructorArguments(assignment[2], "MenuItemOD");
      const text = args?.[0] ? displayLiteral(args[0]) : undefined;
      if (text) variables.set(assignment[1], { text, ...(args?.[1]?.match(/^([A-Za-z_]\w*)$/)?.[1] ? { handler: args[1].trim() } : {}) });
    }
    const add = statement.match(/(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Add\s*\(([\s\S]*)\)\s*;/);
    if (!add) continue;
    const inlineArgs = constructorArguments(add[2], "MenuItemOD");
    const inlineText = inlineArgs?.[0] ? displayLiteral(inlineArgs[0]) : undefined;
    const variable = add[2].trim().match(/^([A-Za-z_]\w*)$/)?.[1];
    const value = inlineText
      ? { text: inlineText, ...(inlineArgs?.[1]?.match(/^([A-Za-z_]\w*)$/)?.[1] ? { handler: inlineArgs[1].trim() } : {}) }
      : variable ? variables.get(variable) : undefined;
    if (!value) continue;
    const key = `${add[1]}|${value.text}|${value.handler ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ controlName: add[1], ...value });
  }
  return hints;
}

function enclosingHandler(handlers: MigrationHint[], line: number): string | undefined {
  for (const h of handlers) {
    if (line >= h.lineStart && line <= h.lineEnd) return h.handler;
  }
  return undefined;
}

export function parseCodeBehind(source: string, sourcePath: string): CodeBehindInfo {
  const clean = stripComments(source);
  const file = basename(sourcePath);
  const typeSpans = codeTypeSpans(clean);

  const methods: CodeMethodInfo[] = [];
  let methodMatch: RegExpExecArray | null;
  METHOD_DECL_RE.lastIndex = 0;
  while ((methodMatch = METHOD_DECL_RE.exec(clean)) !== null) {
    const body = matchBody(clean, methodMatch.index);
    if (!body) continue;
    const bodySource = clean.slice(body.start, body.end + 1);
    methods.push({
      ownerType: ownerTypeAt(typeSpans, body.start),
      name: methodMatch[1],
      sourceFile: file,
      lineStart: lineOf(clean, methodMatch.index),
      lineEnd: lineOf(clean, body.end),
      calledSymbols: extractCalledSymbols(bodySource),
      ...extractMethodEvidence(bodySource),
      valueWrites: [],
      bodyStart: body.start,
      bodyEnd: body.end,
    });
    METHOD_DECL_RE.lastIndex = body.end + 1;
  }
  const classNames = [...clean.matchAll(/\b(?:class|record)\s+([A-Za-z_]\w*)\b/g)].map((match) => match[1]);
  for (const className of classNames) {
    const constructorPattern = new RegExp(`^\\s*${className}\\s*\\([^;{}]*\\)\\s*\\{`, "gm");
    let constructor: RegExpExecArray | null;
    while ((constructor = constructorPattern.exec(clean)) !== null) {
      const lineStart = lineOf(clean, constructor.index);
      if (methods.some((method) => method.name === className && method.lineStart === lineStart)) continue;
      const body = matchBody(clean, constructor.index);
      if (!body) continue;
      const bodySource = clean.slice(body.start, body.end + 1);
      methods.push({
        ownerType: ownerTypeAt(typeSpans, body.start) ?? className,
        name: className,
        sourceFile: file,
        lineStart,
        lineEnd: lineOf(clean, body.end),
        calledSymbols: extractCalledSymbols(bodySource),
        ...extractMethodEvidence(bodySource),
        valueWrites: [],
        bodyStart: body.start,
        bodyEnd: body.end,
      });
      constructorPattern.lastIndex = body.end + 1;
    }
  }
  methods.sort((a, b) => a.lineStart - b.lineStart);
  const fields = extractDeclaredFields(clean, file, typeSpans, methods);

  const handlers: MigrationHint[] = [];
  let m: RegExpExecArray | null;
  HANDLER_RE.lastIndex = 0;
  while ((m = HANDLER_RE.exec(clean)) !== null) {
    const name = m[1];
    const body = matchBody(clean, m.index);
    if (!body) continue;
    const bodySource = clean.slice(body.start, body.end + 1);
    handlers.push({
      handler: name,
      sourceFile: file,
      lineStart: lineOf(clean, m.index),
      lineEnd: lineOf(clean, body.end),
      calledSymbols: extractCalledSymbols(bodySource),
      ...extractMethodEvidence(bodySource),
    });
  }

  const navigations: NavEdge[] = [];
  const seenNav = new Set<string>();
  NEW_SHOW_RE.lastIndex = 0;
  while ((m = NEW_SHOW_RE.exec(clean)) !== null) {
    const target = m[1];
    if (isMessageBoxLike(target)) continue;
    const modal = m[2] === "ShowDialog";
    const key = `${target}|${modal}`;
    if (seenNav.has(key)) continue;
    seenNav.add(key);
    navigations.push({ target, modal, fromHandler: enclosingHandler(handlers, lineOf(clean, m.index)) });
  }
  // Map local variables to the Form type they were assigned: `var f = new DetailForm()`
  // or `DetailForm f = new DetailForm()`, so `f.ShowDialog()` resolves to DetailForm.
  const varType = new Map<string, string>();
  VAR_ASSIGN_NEW_RE.lastIndex = 0;
  while ((m = VAR_ASSIGN_NEW_RE.exec(clean)) !== null) {
    varType.set(m[1], m[2]);
  }
  VAR_SHOW_RE.lastIndex = 0;
  while ((m = VAR_SHOW_RE.exec(clean)) !== null) {
    const variable = m[1];
    if (variable === "this" || variable === "base" || isMessageBoxLike(variable)) continue;
    const target = varType.get(variable) ?? variable;
    if (isMessageBoxLike(target)) continue;
    const modal = m[2] === "ShowDialog";
    const key = `${target}|${modal}`;
    if (seenNav.has(key)) continue;
    seenNav.add(key);
    navigations.push({ target, modal, fromHandler: enclosingHandler(handlers, lineOf(clean, m.index)) });
  }

  const bindings: BindingInfo[] = [];
  const seenBinding = new Set<string>();
  const pushBinding = (b: BindingInfo) => {
    const key = `${b.controlName}|${b.boundProperty ?? ""}|${b.kind}`;
    if (seenBinding.has(key)) return;
    seenBinding.add(key);
    bindings.push(b);
  };
  DATASOURCE_RE.lastIndex = 0;
  while ((m = DATASOURCE_RE.exec(clean)) !== null) {
    let dataSource = m[2];
    // `x.DataSource = typeof(Customer)` → record the type argument, not "typeof".
    const head = dataSource.split(".")[0];
    if (CS_EXPR_KEYWORDS.has(head)) {
      const typeArg = clean.slice(m.index).match(/typeof\s*\(\s*([A-Za-z_][\w.]*)\s*\)/);
      dataSource = typeArg ? typeArg[1].split(".").pop()! : dataSource;
    }
    pushBinding({ controlName: m[1], dataSource, kind: "DataSource" });
  }
  NEW_BINDINGSOURCE_RE.lastIndex = 0;
  while ((m = NEW_BINDINGSOURCE_RE.exec(clean)) !== null) {
    pushBinding({ controlName: m[1], dataSource: m[1], kind: "BindingSource" });
  }
  for (const re of [DATABINDINGS_RE, DATABINDINGS_NEW_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(clean)) !== null) {
      const member = m[4] ? `${m[3]}.${m[4]}` : m[3];
      pushBinding({ controlName: m[1], dataSource: member, boundProperty: m[2], kind: "DataBinding" });
    }
  }

  const layoutHints: RuntimeLayoutHint[] = [];
  const seenLayoutHint = new Set<string>();
  PANEL_PARENT_RE.lastIndex = 0;
  while ((m = PANEL_PARENT_RE.exec(clean)) !== null) {
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    if (seenLayoutHint.has(key)) continue;
    seenLayoutHint.add(key);
    layoutHints.push({
      kind: "reparent",
      controlName: m[1],
      parentControlName: m[2],
      panel: Number(m[3]) as 1 | 2,
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
  }

  const runtimeTabs = new Map<string, { index: number }>();
  NEW_TABPAGE_RE.lastIndex = 0;
  while ((m = NEW_TABPAGE_RE.exec(clean)) !== null) runtimeTabs.set(m[1], { index: m.index });
  ADD_TABPAGE_RE.lastIndex = 0;
  while ((m = ADD_TABPAGE_RE.exec(clean)) !== null) {
    const created = runtimeTabs.get(m[2]);
    if (!created) continue;
    const key = `tab|${m[2]}|${m[1]}`;
    if (seenLayoutHint.has(key)) continue;
    seenLayoutHint.add(key);
    const label = labelFromRuntimeTabName(m[2]);
    layoutHints.push({
      kind: "add-tab",
      controlName: m[2],
      parentControlName: m[1],
      label,
      viewKind: /(?:console|terminal|shell)/i.test(`${m[2]} ${label}`) ? "terminal" : "placeholder",
      sourceFile: file,
      line: lineOf(clean, created.index),
    });
  }

  const appearanceHints: CodeBehindInfo["appearanceHints"] = [];
  const seenAppearanceHint = new Set<string>();
  RUNTIME_IMAGE_RE.lastIndex = 0;
  while ((m = RUNTIME_IMAGE_RE.exec(clean)) !== null) {
    const rhs = m[3].trim();
    const quoted = rhs.match(/^"([^"]+)"$/)?.[1];
    const member = rhs.match(/([A-Za-z_]\w*)\s*\)?\s*$/)?.[1];
    const value = quoted ?? member;
    if (!value || value === "null") continue;
    const property = m[2] === "ImageKey" ? "imageKey" : "image";
    const resourceExpression = /(?:^|\.)(?:Images|Resources)\s*\./.test(rhs);
    const namedExpression = /^nameof\s*\(/.test(rhs);
    const concrete = Boolean(quoted || resourceExpression || namedExpression || property === "imageKey" && !/^(?:image|icon)$/i.test(value));
    // `button.Image = image`, `selectedItem.Image` and `shell.Icon` describe a
    // runtime dependency, not an asset key. Treating their final member name as
    // an image would overwrite a concrete Designer fallback with "Image"/"Icon".
    if (!concrete) continue;
    const key = `${m[1]}|${property}|${value}`;
    if (seenAppearanceHint.has(key)) continue;
    seenAppearanceHint.add(key);
    appearanceHints.push({ controlName: m[1], property, value });
  }

  // Tree/list controls use ImageList.ImageIndex=0 when a node has no explicit
  // key. Preserve the first Resources-backed image as the control's neutral
  // fallback so code-generated navigation trees retain their default icon.
  const imageListDefaults = new Map<string, string>();
  IMAGELIST_ADD_RESOURCE_RE.lastIndex = 0;
  while ((m = IMAGELIST_ADD_RESOURCE_RE.exec(clean)) !== null) {
    if (!imageListDefaults.has(m[1])) imageListDefaults.set(m[1], m[2]);
  }
  IMAGELIST_ASSIGN_RE.lastIndex = 0;
  while ((m = IMAGELIST_ASSIGN_RE.exec(clean)) !== null) {
    const value = imageListDefaults.get(m[2]);
    if (!value) continue;
    const key = `${m[1]}|imageKey|${value}`;
    if (seenAppearanceHint.has(key)) continue;
    seenAppearanceHint.add(key);
    appearanceHints.push({ controlName: m[1], property: "imageKey", value });
  }

  for (const hint of layoutHints) {
    if (hint.kind !== "add-tab") continue;
    const image = appearanceHints.find((item) => item.controlName === hint.controlName && item.property === "imageKey");
    if (image) hint.imageKey = image.value;
  }

  const memberTypes = new Map<string, string>();
  MEMBER_TYPE_RE.lastIndex = 0;
  while ((m = MEMBER_TYPE_RE.exec(clean)) !== null) {
    memberTypes.set(m[2], m[1].replace(/\?$/, "").split(".").pop()!);
  }
  const valueHints: CodeBehindInfo["valueHints"] = [];
  RUNTIME_VALUE_RE.lastIndex = 0;
  while ((m = RUNTIME_VALUE_RE.exec(clean)) !== null) {
    const line = lineOf(clean, m.index);
    const method = methodAt(methods, line);
    if (!method) continue;
    const expression = m[3].trim();
    let normalized = expression;
    let negated = false;
    if (/^!\s*/.test(normalized)) {
      negated = true;
      normalized = normalized.replace(/^!\s*/, "");
    }
    while (/^\(\s*[A-Za-z_][\w.<>?]*\s*\)\s*/.test(normalized)) {
      normalized = normalized.replace(/^\(\s*[A-Za-z_][\w.<>?]*\s*\)\s*/, "");
    }
    const literalValue = parseCodeLiteral(normalized);
    const modelMatch = normalized.match(/^(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/);
    const modelType = modelMatch ? memberTypes.get(modelMatch[1]) : undefined;
    const property = ({
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
    } as const)[m[2] as "Text" | "Checked" | "Enabled" | "ReadOnly" | "PlaceholderText" | "WatermarkText" | "CueBannerText" | "ToolTipText" | "SelectedIndex" | "SelectedItem" | "Value"];
    valueHints.push({
      controlName: m[1],
      source: {
        property,
        expression,
        sourceFile: file,
        line,
        methodName: method.name,
        ...(modelType ? { modelType, memberPath: modelMatch![2].split(".") } : {}),
        ...(negated ? { negated: true } : {}),
        ...(isConditionalAssignment(clean, method, m.index) ? { conditional: true } : {}),
        ...(literalValue !== undefined ? { literalValue } : {}),
      },
    });
  }

  for (const method of methods) {
    method.valueWrites = valueHints
      .filter((hint) => hint.source.methodName === method.name)
      .map((hint) => ({
        controlName: hint.controlName,
        property: hint.source.property,
        expression: hint.source.expression,
        ...(hint.source.conditional ? { conditional: true } : {}),
        ...(hint.source.literalValue !== undefined ? { literalValue: hint.source.literalValue } : {}),
      }));
  }
  for (const handler of handlers) {
    const writes = valueHints
      .filter((hint) => hint.source.methodName === handler.handler)
      .map((hint) => ({
        controlName: hint.controlName,
        property: hint.source.property,
        expression: hint.source.expression,
        ...(hint.source.conditional ? { conditional: true } : {}),
        ...(hint.source.literalValue !== undefined ? { literalValue: hint.source.literalValue } : {}),
      }));
    if (writes.length > 0) handler.valueWrites = writes;
  }

  WATERMARK_CALL_RE.lastIndex = 0;
  while ((m = WATERMARK_CALL_RE.exec(clean)) !== null) {
    const line = lineOf(clean, m.index);
    const method = methodAt(methods, line);
    if (!method) continue;
    const openParen = clean.indexOf("(", m.index + m[0].length - 1);
    const closeParen = matchingDelimiter(clean, openParen, "(", ")");
    if (openParen < 0 || closeParen < 0) continue;
    const expression = firstCallArgument(clean, openParen, closeParen).trim();
    if (!expression) continue;
    const statementStart = Math.max(method.bodyStart, clean.lastIndexOf(";", m.index) + 1);
    const prefix = clean.slice(statementStart, m.index);
    const handleCreated = /\.\s*HandleCreated\s*\+=\s*[\s\S]*=>[\s\S]*$/.test(prefix);
    const literalValue = parseCodeLiteral(expression);
    valueHints.push({
      controlName: m[1],
      source: {
        property: "placeholderText",
        expression,
        sourceFile: file,
        line,
        methodName: method.name,
        ...(isConditionalAssignment(clean, method, m.index, !handleCreated) ? { conditional: true } : {}),
        ...(literalValue !== undefined ? { literalValue } : {}),
      },
    });
  }

  TOOLTIP_CALL_RE.lastIndex = 0;
  while ((m = TOOLTIP_CALL_RE.exec(clean)) !== null) {
    const line = lineOf(clean, m.index);
    const method = methodAt(methods, line);
    if (!method) continue;
    const openParen = clean.indexOf("(", m.index + m[0].length - 1);
    const closeParen = matchingDelimiter(clean, openParen, "(", ")");
    if (openParen < 0 || closeParen < 0) continue;
    const args = callArguments(clean, openParen, closeParen);
    const target = args[0]?.match(new RegExp(`^(?:this\\.)?(${IDENT})$`))?.[1];
    const expression = args[1]?.trim();
    if (!target || !expression) continue;
    const literalValue = parseCodeLiteral(expression);
    valueHints.push({
      controlName: target,
      source: {
        property: "toolTipText",
        expression,
        sourceFile: file,
        line,
        methodName: method.name,
        ...(isConditionalAssignment(clean, method, m.index) ? { conditional: true } : {}),
        ...(literalValue !== undefined ? { literalValue } : {}),
      },
    });
    TOOLTIP_CALL_RE.lastIndex = closeParen + 1;
  }

  const tabNavigators: RuntimeTabNavigator[] = [];
  const seenTabNavigator = new Set<string>();
  TAB_NAVIGATOR_RE.lastIndex = 0;
  while ((m = TAB_NAVIGATOR_RE.exec(clean)) !== null) {
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    if (seenTabNavigator.has(key)) continue;
    seenTabNavigator.add(key);
    tabNavigators.push({
      navigatorControlName: m[1],
      property: m[2],
      tabControlName: m[3],
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
  }

  // WinForms projects commonly populate list-like controls outside the
  // Designer. Keep that source as a neutral contract so a later project scan
  // can resolve enums without inventing demo data in a target renderer.
  const sequenceTypes = new Map<string, string>();
  GENERIC_SEQUENCE_RE.lastIndex = 0;
  while ((m = GENERIC_SEQUENCE_RE.exec(clean)) !== null) {
    sequenceTypes.set(m[2], m[1].split(".").pop()!);
  }

  const itemHints: CodeBehindInfo["itemHints"] = [];
  const seenItemHint = new Set<string>();
  const pushItemHint = (controlName: string, source: RuntimeItemSource) => {
    const key = `${controlName}|${source.kind}|${source.typeName ?? ""}|${source.expression}`;
    if (seenItemHint.has(key)) return;
    seenItemHint.add(key);
    itemHints.push({ controlName, source });
  };
  ADD_ENUM_ITEMS_RE.lastIndex = 0;
  while ((m = ADD_ENUM_ITEMS_RE.exec(clean)) !== null) {
    const declaredType = m[2];
    pushItemHint(m[1], {
      kind: "enum",
      typeName: declaredType.split(".").pop(),
      expression: `Items.AddEnums<${declaredType}>()`,
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
  }
  ADD_RANGE_ENUM_DESCRIPTIONS_RE.lastIndex = 0;
  while ((m = ADD_RANGE_ENUM_DESCRIPTIONS_RE.exec(clean)) !== null) {
    const helper = m[2];
    const declaredType = m[3];
    pushItemHint(m[1], {
      kind: "enum",
      typeName: declaredType.split(".").pop(),
      expression: `Items.AddRange(${helper}<${declaredType}>())`,
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
  }
  ADD_RANGE_ENUM_NAMES_RE.lastIndex = 0;
  while ((m = ADD_RANGE_ENUM_NAMES_RE.exec(clean)) !== null) {
    const declaredType = m[2];
    pushItemHint(m[1], {
      kind: "enum",
      typeName: declaredType.split(".").pop(),
      expression: `Items.AddRange(Enum.GetNames(typeof(${declaredType})))`,
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
  }
  ADD_LIST_ITEMS_RE.lastIndex = 0;
  while ((m = ADD_LIST_ITEMS_RE.exec(clean)) !== null) {
    const openParen = clean.indexOf("(", m.index);
    const closeParen = matchingDelimiter(clean, openParen, "(", ")");
    if (closeParen === -1) continue;
    const expression = firstCallArgument(clean, openParen, closeParen);
    const variable = expression.match(/^(?:this\.)?([A-Za-z_]\w*)$/)?.[1];
    const typeName = variable ? sequenceTypes.get(variable) : undefined;
    pushItemHint(m[1], {
      kind: "list",
      ...(typeName ? { typeName } : {}),
      expression: `Items.AddList(${expression})`,
      sourceFile: file,
      line: lineOf(clean, m.index),
    });
    ADD_LIST_ITEMS_RE.lastIndex = closeParen + 1;
  }
  ADD_RANGE_ITEMS_RE.lastIndex = 0;
  while ((m = ADD_RANGE_ITEMS_RE.exec(clean)) !== null) {
    const openParen = clean.indexOf("(", m.index);
    const closeParen = matchingDelimiter(clean, openParen, "(", ")");
    if (closeParen === -1) continue;
    const expression = firstCallArgument(clean, openParen, closeParen);
    // The specialized passes above retain the enum type and label semantics;
    // do not also record the same call as an untyped list contract.
    if (!/Get(?:Localized)?EnumDescriptions\s*</.test(expression)
      && !/(?:System\s*\.\s*)?Enum\s*\.\s*GetNames\s*\(/.test(expression)) {
      pushItemHint(m[1], {
        kind: "list",
        expression: `Items.AddRange(${expression})`,
        sourceFile: file,
        line: lineOf(clean, m.index),
      });
    }
    ADD_RANGE_ITEMS_RE.lastIndex = closeParen + 1;
  }

  // PropertyGrid schemas can often be recovered without executing business
  // code. First infer the item type flowing into a list, then preserve the
  // SelectedObject assignment as a neutral source contract for the wider
  // context scan to resolve.
  const variableTypes = new Map<string, string>();
  for (const expression of [TYPED_VARIABLE_RE, FOREACH_VARIABLE_RE]) {
    expression.lastIndex = 0;
    while ((m = expression.exec(clean)) !== null) variableTypes.set(m[2], m[1].split(".").pop()!);
  }
  const listItemTypes = new Map<string, string>();
  CAST_LIST_ITEM_RE.lastIndex = 0;
  while ((m = CAST_LIST_ITEM_RE.exec(clean)) !== null) listItemTypes.set(m[2], m[1].split(".").pop()!);
  ADD_NEW_LIST_ITEM_RE.lastIndex = 0;
  while ((m = ADD_NEW_LIST_ITEM_RE.exec(clean)) !== null) listItemTypes.set(m[1], m[2].split(".").pop()!);
  ADD_VARIABLE_LIST_ITEM_RE.lastIndex = 0;
  while ((m = ADD_VARIABLE_LIST_ITEM_RE.exec(clean)) !== null) {
    const typeName = variableTypes.get(m[2]);
    if (typeName) listItemTypes.set(m[1], typeName);
  }

  const propertyGridHints: CodeBehindInfo["propertyGridHints"] = [];
  const seenPropertyGrid = new Set<string>();
  SELECTED_OBJECT_RE.lastIndex = 0;
  while ((m = SELECTED_OBJECT_RE.exec(clean)) !== null) {
    const expression = m[2].trim();
    if (expression === "null") continue;
    const directType = expression.match(/^new\s+([A-Z][\w.]*)\b/)?.[1]
      ?? expression.match(/^\(\s*([A-Z][\w.]*)\s*\)/)?.[1];
    const listName = expression.match(/^(?:this\.)?([A-Za-z_]\w*)\s*\.\s*Items\s*\[/)?.[1];
    const variableName = expression.match(/^(?:this\.)?([A-Za-z_]\w*)$/)?.[1];
    const typeName = (directType ? directType.split(".").pop() : undefined)
      ?? (listName ? listItemTypes.get(listName) : undefined)
      ?? (variableName ? variableTypes.get(variableName) : undefined);
    const key = `${m[1]}|${typeName ?? ""}|${expression}`;
    if (seenPropertyGrid.has(key)) continue;
    seenPropertyGrid.add(key);
    propertyGridHints.push({
      controlName: m[1],
      source: {
        ...(typeName ? { typeName } : {}),
        expression,
        sourceFile: file,
        line: lineOf(clean, m.index),
      },
    });
  }

  const visibilityGroups = extractVisibilityGroups(clean, file);
  const controlBindings = extractControlBindings(clean, file, methods, handlers);
  const gridColumnHints = extractGridColumnHints(clean);
  const menuItemHints = extractMenuItemHints(clean);

  return { fields, methods, handlers, navigations, bindings, layoutHints, visibilityGroups, controlBindings, tabNavigators, itemHints, appearanceHints, propertyGridHints, valueHints, gridColumnHints, menuItemHints };
}

// Walk the form's control tree, attach migration hints to matching events,
// and accumulate the flat contractPoints list on form.support. Every wired event
// becomes a contract point so coverage is complete even when the handler is a
// lambda or the code-behind is missing (hint fields fall back to unknown).
export function attachMigrationHints(form: VisualForm, cb: CodeBehindInfo): void {
  const byName = new Map<string, MigrationHint>();
  for (const h of cb.handlers) byName.set(h.handler, h);

  const contractPoints: ContractPoint[] = [];

  const visit = (control: VisualControl): void => {
    for (const event of control.events) {
      const hint = byName.get(event.handler);
      if (hint) {
        event.migrationHint = hint;
        contractPoints.push({ ...hint, controlName: control.name, event: event.event });
      } else {
        // Lambda handler or handler method not found in code-behind — still a
        // contract point. Record with unresolved source so it is never dropped.
        const inline = event.handler.endsWith("_inline");
        contractPoints.push({
          handler: event.handler,
          sourceFile: inline ? "(inline lambda)" : "(handler not found)",
          lineStart: 0,
          lineEnd: 0,
          calledSymbols: [],
          controlName: control.name,
          event: event.event,
        });
      }
    }
    for (const child of control.children) visit(child);
  };

  for (const control of form.controls) visit(control);

  // Form-level events (this.Load, this.FormClosing, …) live on form.events.
  for (const event of form.events ?? []) {
    const hint = byName.get(event.handler);
    if (hint) {
      event.migrationHint = hint;
      contractPoints.push({ ...hint, controlName: form.name, event: event.event });
    } else {
      const inline = event.handler.endsWith("_inline");
      contractPoints.push({
        handler: event.handler,
        sourceFile: inline ? "(inline lambda)" : "(handler not found)",
        lineStart: 0,
        lineEnd: 0,
        calledSymbols: [],
        controlName: form.name,
        event: event.event,
      });
    }
  }

  form.support.contractPoints = contractPoints;
}
