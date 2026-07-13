import { basename } from "node:path";
import type {
  BindingInfo,
  ContractPoint,
  MigrationHint,
  NavEdge,
  RuntimeLayoutHint,
  VisualControl,
  VisualForm,
} from "../ir/types.js";
import { stripComments } from "./designerParser.js";

export type CodeBehindInfo = {
  handlers: MigrationHint[];
  navigations: NavEdge[];
  bindings: BindingInfo[];
  layoutHints: RuntimeLayoutHint[];
  appearanceHints: Array<{ controlName: string; property: "image" | "imageKey"; value: string }>;
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
// Method invocation inside a body: `Foo(`, `a.b.Foo(`, or generic `Foo<T>(`.
const CALL_RE = /(?<![.\w])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:<[^<>()]*>)?\s*\(/g;
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
const NEW_TABPAGE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s+TabPage\b/g;
const ADD_TABPAGE_RE = /(?:this\.)?([A-Za-z_]\w*)\s*\.\s*(?:Controls|TabPages)\s*\.\s*Add\s*\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)/g;

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

function extractCalledSymbols(body: string): string[] {
  const symbols = new Set<string>();
  let m: RegExpExecArray | null;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(body)) !== null) {
    const symbol = m[1];
    const tail = symbol.split(".").pop() ?? symbol;
    if (CS_KEYWORDS.has(tail)) continue;
    symbols.add(symbol);
  }
  return [...symbols].sort();
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

  const handlers: MigrationHint[] = [];
  let m: RegExpExecArray | null;
  HANDLER_RE.lastIndex = 0;
  while ((m = HANDLER_RE.exec(clean)) !== null) {
    const name = m[1];
    const body = matchBody(clean, m.index);
    if (!body) continue;
    handlers.push({
      handler: name,
      sourceFile: file,
      lineStart: lineOf(clean, m.index),
      lineEnd: lineOf(clean, body.end),
      calledSymbols: extractCalledSymbols(clean.slice(body.start, body.end + 1)),
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

  for (const hint of layoutHints) {
    if (hint.kind !== "add-tab") continue;
    const image = appearanceHints.find((item) => item.controlName === hint.controlName && item.property === "imageKey");
    if (image) hint.imageKey = image.value;
  }

  return { handlers, navigations, bindings, layoutHints, appearanceHints };
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
