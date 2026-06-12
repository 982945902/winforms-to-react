import type {
  ControlCoverage,
  ControlSupportStatus,
  EventStub,
  MigrationReport,
  ParseResult,
  VisualBounds,
  VisualColumn,
  VisualControl,
  VisualForm,
  VisualSize
} from "../ir/types.js";

export type ParseDesignerOptions = {
  sourcePath: string;
};

type MutableControl = VisualControl & {
  typeName: string;
};

type MutableColumn = VisualColumn & {
  typeName: string;
  properties: Record<string, unknown>;
};

const SUPPORTED_CONTROLS = new Set([
  "BindingNavigator",
  "Button",
  "CheckedListBox",
  "CheckBox",
  "ComboBox",
  "DataGridView",
  "DateTimePicker",
  "DomainUpDown",
  "FlowLayoutPanel",
  "GroupBox",
  "HScrollBar",
  "Label",
  "LinkLabel",
  "ListBox",
  "ListView",
  "MaskedTextBox",
  "MenuStrip",
  "MonthCalendar",
  "NumericUpDown",
  "Panel",
  "PictureBox",
  "ProgressBar",
  "RadioButton",
  "RichTextBox",
  "SplitContainer",
  "StatusStrip",
  "TabControl",
  "TabPage",
  "TableLayoutPanel",
  "TextBox",
  "ToolStrip",
  "ToolStripContainer",
  "ToolStripButton",
  "ToolStripComboBox",
  "ToolStripDropDownButton",
  "ToolStripLabel",
  "ToolStripMenuItem",
  "ToolStripProgressBar",
  "ToolStripSeparator",
  "ToolStripSplitButton",
  "ToolStripStatusLabel",
  "ToolStripTextBox",
  "TrackBar",
  "TreeView",
  "VScrollBar"
]);

const DEGRADED_CONTROLS = new Set([
  "Chart",
  "ErrorProvider",
  "PrintPreviewControl",
  "PropertyGrid",
  "PropertyGridExtended",
  "Timer",
  "ToolTip",
  "WebBrowser"
]);

const NON_CONTROL_KINDS = new Set([
  "BindingSource",
  "ColorDialog",
  "ComponentResourceManager",
  "Container",
  "ContextMenuStrip",
  "ColumnHeader",
  "Cursor",
  "FolderBrowserDialog",
  "FontDialog",
  "Font",
  "ImageList",
  "ImageListStreamer",
  "ListViewItem",
  "OpenFileDialog",
  "Padding",
  "PageSetupDialog",
  "Point",
  "PrintDialog",
  "PrintPreviewDialog",
  "SaveFileDialog",
  "Size",
  "SizeF",
  "String",
  "TreeNode",
  "decimal"
]);

export function parseDesignerSource(source: string, options: ParseDesignerOptions): ParseResult {
  const className = findClassName(source) ?? stripDesignerSuffix(options.sourcePath);
  const fields = parseFieldTypes(source);
  const controls = new Map<string, MutableControl>();
  const columns = new Map<string, MutableColumn>();

  for (const [name, typeName] of fields) {
    const kind = shortTypeName(typeName);
    if (isColumnKind(kind)) {
      columns.set(name, {
        kind,
        name,
        typeName,
        properties: {}
      });
      continue;
    }

    if (isDesignerComponentType(typeName)) {
      controls.set(name, {
        kind,
        name,
        typeName,
        properties: {},
        events: [],
        children: []
      });
    }
  }

  for (const [name, typeName] of parseInstantiations(source)) {
    const declaredType = fields.get(name);
    if (declaredType && !isDesignerComponentType(declaredType)) continue;

    const kind = shortTypeName(typeName);
    if (NON_CONTROL_KINDS.has(kind)) continue;

    if (isColumnKind(kind)) {
      if (!columns.has(name)) {
        columns.set(name, { kind, name, typeName, properties: {} });
      }
      continue;
    }

    if (!controls.has(name) && isDesignerComponentType(typeName)) {
      controls.set(name, {
        kind,
        name,
        typeName,
        properties: {},
        events: [],
        children: []
      });
    }
  }

  const form: VisualForm = {
    kind: "Form",
    name: className,
    controls: [],
    properties: {}
  };

  applyPropertyAssignments(source, controls, columns, form);
  applyEvents(source, controls);
  applyColumns(source, controls, columns);
  applyListItems(source, controls);
  applyControlHierarchy(source, controls, form);
  applyToolStripHierarchy(source, controls);

  if (form.controls.length === 0) {
    const childNames = new Set([...controls.values()].flatMap((control) => control.children.map((child) => child.name)));
    form.controls = [...controls.values()].filter((control) => !childNames.has(control.name));
  }

  const supportedControls = new Set<string>();
  const degradedControls = new Set<string>();
  const unknownControls = new Set<string>();
  const controlCounts = new Map<string, number>();
  const eventStubs: EventStub[] = [];

  for (const control of controls.values()) {
    const status = supportStatus(control.kind);
    controlCounts.set(control.kind, (controlCounts.get(control.kind) ?? 0) + 1);

    if (status === "supported") {
      supportedControls.add(control.kind);
    } else if (status === "degraded") {
      degradedControls.add(control.kind);
    } else {
      unknownControls.add(control.kind);
    }

    for (const event of control.events) {
      eventStubs.push({ controlName: control.name, event: event.event, handler: event.handler });
    }
  }

  const report: MigrationReport = {
    sourceFiles: [options.sourcePath],
    formsConverted: 1,
    controlsConverted: controls.size,
    supportedControls: [...supportedControls].sort(),
    degradedControls: [...degradedControls].sort(),
    unknownControls: [...unknownControls].sort(),
    controlCoverage: buildControlCoverage(controlCounts),
    eventStubs
  };

  return {
    form: stripInternalForm(form),
    controlsByName: new Map([...controls.entries()].map(([name, control]) => [name, stripInternalControl(control)])),
    report
  };
}

function findClassName(source: string): string | null {
  return source.match(/\bpartial\s+class\s+([A-Za-z_]\w*)/)?.[1] ?? source.match(/\bclass\s+([A-Za-z_]\w*)/)?.[1] ?? null;
}

function stripDesignerSuffix(sourcePath: string): string {
  const fileName = sourcePath.split(/[\\/]/).pop() ?? "Form";
  return fileName.replace(/\.Designer\.cs$/i, "").replace(/\.cs$/i, "");
}

function parseFieldTypes(source: string): Map<string, string> {
  const fields = new Map<string, string>();
  const pattern = /\b(?:private|protected|internal|public)\s+(?:global::)?([A-Za-z_][\w.<>]*)\s+([A-Za-z_]\w*)\s*;/g;
  for (const match of source.matchAll(pattern)) {
    fields.set(match[2], match[1]);
  }
  return fields;
}

function parseInstantiations(source: string): Array<[string, string]> {
  const instances: Array<[string, string]> = [];
  const pattern = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s+(?:global::)?([A-Za-z_][\w.]*)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    instances.push([match[1], match[2]]);
  }
  return instances;
}

function applyPropertyAssignments(
  source: string,
  controls: Map<string, MutableControl>,
  columns: Map<string, MutableColumn>,
  form: VisualForm
) {
  const controlPropertyPattern = /(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  const consumedRanges: Array<[number, number]> = [];

  for (const match of source.matchAll(controlPropertyPattern)) {
    const target = match[1];
    const property = match[2];
    const value = parseValue(match[3]);
    const control = controls.get(target);
    const column = columns.get(target);

    if (control) {
      assignControlProperty(control, property, value);
      consumedRanges.push([match.index, match.index + match[0].length]);
      continue;
    }

    if (column) {
      assignColumnProperty(column, property, value);
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const formPropertyPattern = /this\.([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  for (const match of source.matchAll(formPropertyPattern)) {
    if (consumedRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;

    const property = match[1];
    const value = parseValue(match[2]);
    assignFormProperty(form, property, value);
  }
}

function assignControlProperty(control: MutableControl, property: string, value: unknown) {
  switch (property) {
    case "Location":
      control.bounds = { ...(control.bounds ?? { x: 0, y: 0, width: 0, height: 0 }), ...(pointToBounds(value)) };
      break;
    case "Size":
      control.bounds = { ...(control.bounds ?? { x: 0, y: 0, width: 0, height: 0 }), ...(sizeToBounds(value)) };
      break;
    case "Text":
      control.text = typeof value === "string" ? value : String(value ?? "");
      break;
    case "Name":
      control.properties[property] = value;
      break;
    case "TabIndex":
      if (typeof value === "number") control.tabIndex = value;
      break;
    case "AutoSize":
      if (typeof value === "boolean") control.autoSize = value;
      break;
    case "Dock":
      if (typeof value === "string") control.dock = value;
      break;
    case "Anchor":
      control.anchor = Array.isArray(value) ? value.map(String) : [String(value)];
      break;
    default:
      control.properties[property] = value;
      break;
  }
}

function assignColumnProperty(column: MutableColumn, property: string, value: unknown) {
  switch (property) {
    case "HeaderText":
      column.headerText = typeof value === "string" ? value : String(value ?? "");
      break;
    case "Width":
      if (typeof value === "number") column.width = value;
      break;
    case "Name":
      column.properties[property] = value;
      break;
    default:
      column.properties[property] = value;
      break;
  }
}

function assignFormProperty(form: VisualForm, property: string, value: unknown) {
  switch (property) {
    case "ClientSize":
      form.clientSize = value as VisualSize;
      break;
    case "AutoScaleDimensions":
      form.autoScaleDimensions = value as VisualSize;
      break;
    case "Text":
      form.text = typeof value === "string" ? value : String(value ?? "");
      break;
    case "Name":
      form.properties[property] = value;
      break;
    default:
      form.properties[property] = value;
      break;
  }
}

function applyEvents(source: string, controls: Map<string, MutableControl>) {
  const constructorPattern = /(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\+=\s*new\s+[A-Za-z_][\w.]*\s*\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)/g;
  for (const match of source.matchAll(constructorPattern)) {
    const control = controls.get(match[1]);
    if (!control) continue;
    control.events.push({ event: match[2], handler: match[3] });
  }

  const directPattern = /(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\+=\s*(?:this\.)?([A-Za-z_]\w*)\s*;/g;
  for (const match of source.matchAll(directPattern)) {
    const control = controls.get(match[1]);
    if (!control) continue;
    if (control.events.some((event) => event.event === match[2] && event.handler === match[3])) continue;
    control.events.push({ event: match[2], handler: match[3] });
  }
}

function applyColumns(source: string, controls: Map<string, MutableControl>, columns: Map<string, MutableColumn>) {
  const pattern = /(?:this\.)?([A-Za-z_]\w*)\.Columns\.AddRange\(\s*new\s+[A-Za-z_][\w.]*\[\]\s*\{([\s\S]*?)\}\s*\);/g;
  for (const match of source.matchAll(pattern)) {
    const grid = controls.get(match[1]);
    if (!grid) continue;

    const refs = [...match[2].matchAll(/(?:this\.)?([A-Za-z_]\w*)/g)]
      .map((ref) => ref[1])
      .filter((name) => columns.has(name));
    grid.columns = refs.map((name) => stripInternalColumn(columns.get(name)!));
  }
}

function applyListItems(source: string, controls: Map<string, MutableControl>) {
  const addRangePattern = /(?:this\.)?([A-Za-z_]\w*)\.Items\.AddRange\(\s*new\s*(?:(?:(?:System\.)?(?:Object|String)|object|string)\s*)?\[\]\s*\{([\s\S]*?)\}\s*\);/g;
  for (const match of source.matchAll(addRangePattern)) {
    const control = controls.get(match[1]);
    if (!control || !isListLikeKind(control.kind)) continue;
    appendItems(control, extractStringLiterals(match[2]));
  }

  const addPattern = /(?:this\.)?([A-Za-z_]\w*)\.Items\.Add\(\s*(@?"(?:[^"\\]|\\.|"")*")\s*(?:,[^)]*)?\);/g;
  for (const match of source.matchAll(addPattern)) {
    const control = controls.get(match[1]);
    if (!control || !isListLikeKind(control.kind)) continue;
    appendItems(control, [String(parseValue(match[2]))]);
  }

  const treeNodes = parseTreeNodeTexts(source);
  const nodeAddRangePattern = /(?:this\.)?([A-Za-z_]\w*)\.Nodes\.AddRange\(\s*new\s+(?:[A-Za-z_][\w.]*\.)?TreeNode\[\]\s*\{([\s\S]*?)\}\s*\);/g;
  for (const match of source.matchAll(nodeAddRangePattern)) {
    const control = controls.get(match[1]);
    if (!control || control.kind !== "TreeView") continue;

    const items = [...match[2].matchAll(/(?:this\.)?([A-Za-z_]\w*)/g)]
      .map((ref) => treeNodes.get(ref[1]))
      .filter((item): item is string => typeof item === "string");
    appendItems(control, items);
  }
}

function parseTreeNodeTexts(source: string): Map<string, string> {
  const treeNodes = new Map<string, string>();
  const pattern = /(?:[A-Za-z_][\w.]*\.)?TreeNode\s+([A-Za-z_]\w*)\s*=\s*new\s+(?:[A-Za-z_][\w.]*\.)?TreeNode\s*\(\s*(@?"(?:[^"\\]|\\.|"")*")/g;
  for (const match of source.matchAll(pattern)) {
    treeNodes.set(match[1], String(parseValue(match[2])));
  }
  return treeNodes;
}

function extractStringLiterals(source: string): string[] {
  return [...source.matchAll(/@?"(?:[^"\\]|\\.|"")*"/g)].map((match) => String(parseValue(match[0])));
}

function appendItems(control: MutableControl, items: string[]) {
  if (items.length === 0) return;
  control.items = [...(control.items ?? []), ...items];
}

function isListLikeKind(kind: string): boolean {
  return kind === "CheckedListBox"
    || kind === "ComboBox"
    || kind === "DomainUpDown"
    || kind === "ListBox"
    || kind === "ListView"
    || kind === "ToolStripComboBox";
}

function applyControlHierarchy(source: string, controls: Map<string, MutableControl>, form: VisualForm) {
  const childParents = new Map<string, string>();
  const controlAddPattern = /(?:this\.)?([A-Za-z_]\w*)\.Controls\.Add\(\s*this\.([A-Za-z_]\w*)\s*\)/g;
  for (const match of source.matchAll(controlAddPattern)) {
    const parent = controls.get(match[1]);
    const child = controls.get(match[2]);
    if (!parent || !child) continue;
    if (!parent.children.some((existing) => existing.name === child.name)) {
      parent.children.push(child);
    }
    childParents.set(child.name, parent.name);
  }

  const formAddPattern = /this\.Controls\.Add\(\s*this\.([A-Za-z_]\w*)\s*\)/g;
  for (const match of source.matchAll(formAddPattern)) {
    const child = controls.get(match[1]);
    if (!child) continue;
    if (!form.controls.some((existing) => existing.name === child.name)) {
      form.controls.push(child);
    }
    childParents.set(child.name, form.name);
  }
}

function applyToolStripHierarchy(source: string, controls: Map<string, MutableControl>) {
  const pattern = /(?:this\.)?([A-Za-z_]\w*)\.(?:Items|DropDownItems)\.AddRange\(\s*new\s+[A-Za-z_][\w.]*\[\]\s*\{([\s\S]*?)\}\s*\);/g;
  for (const match of source.matchAll(pattern)) {
    const parent = controls.get(match[1]);
    if (!parent) continue;
    if (!isToolStripContainerKind(parent.kind)) continue;

    const refs = [...match[2].matchAll(/(?:this\.)?([A-Za-z_]\w*)/g)]
      .map((ref) => ref[1])
      .filter((name) => controls.has(name) && name !== parent.name);

    for (const ref of refs) {
      const child = controls.get(ref)!;
      if (!parent.children.some((existing) => existing.name === child.name)) {
        parent.children.push(child);
      }
    }
  }
}

function isToolStripContainerKind(kind: string): boolean {
  return kind === "MenuStrip" || kind === "ToolStrip" || kind === "StatusStrip" || kind.startsWith("ToolStrip");
}

function parseValue(raw: string): unknown {
  const value = raw.trim().replace(/\r?\n/g, " ");

  const point = value.match(/new\s+(?:System\.Drawing\.)?Point\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
  if (point) return { x: Number(point[1]), y: Number(point[2]) };

  const size = value.match(/new\s+(?:System\.Drawing\.)?Size\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
  if (size) return { width: Number(size[1]), height: Number(size[2]) };

  const sizeF = value.match(/new\s+(?:System\.Drawing\.)?SizeF\s*\(\s*(-?\d+(?:\.\d+)?)F?\s*,\s*(-?\d+(?:\.\d+)?)F?\s*\)/);
  if (sizeF) return { width: Number(sizeF[1]), height: Number(sizeF[2]) };

  if (value === "true") return true;
  if (value === "false") return false;

  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+(?:\.\d+)?F?$/.test(value)) return Number(value.replace(/F$/, ""));

  if (value.startsWith("\"") && value.endsWith("\"")) return parseCSharpString(value);
  if (value.startsWith("@\"") && value.endsWith("\"")) return value.slice(2, -1).replace(/""/g, "\"");

  if (value.includes("|")) {
    return value.split("|").map((part) => enumTail(part.trim()));
  }

  const enumMatch = value.match(/[A-Za-z_][\w.]*\.([A-Za-z_]\w*)$/);
  if (enumMatch) return enumMatch[1];

  return value;
}

function parseCSharpString(value: string): string {
  return value
    .slice(1, -1)
    .replace(/\\"/g, "\"")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function pointToBounds(value: unknown): Pick<VisualBounds, "x" | "y"> {
  if (isRecord(value) && typeof value.x === "number" && typeof value.y === "number") {
    return { x: value.x, y: value.y };
  }
  return { x: 0, y: 0 };
}

function sizeToBounds(value: unknown): Pick<VisualBounds, "width" | "height"> {
  if (isRecord(value) && typeof value.width === "number" && typeof value.height === "number") {
    return { width: value.width, height: value.height };
  }
  return { width: 0, height: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function enumTail(value: string): string {
  return (value.split(".").pop() ?? value).replace(/[^A-Za-z0-9_]+$/g, "");
}

function shortTypeName(typeName: string): string {
  return typeName.split(".").pop()?.replace(/[<>]/g, "") ?? typeName;
}

function isDesignerComponentType(typeName: string): boolean {
  const kind = shortTypeName(typeName);
  if (NON_CONTROL_KINDS.has(kind)) return false;
  if (isColumnKind(kind)) return false;
  if (SUPPORTED_CONTROLS.has(kind) || DEGRADED_CONTROLS.has(kind)) return true;
  if (typeName.includes("System.Drawing") || typeName.includes("System.ComponentModel")) return false;
  return typeName.includes("System.Windows.Forms") || !typeName.includes(".");
}

function isColumnKind(kind: string): boolean {
  return kind.startsWith("DataGridView") && kind.endsWith("Column");
}

function buildControlCoverage(controlCounts: Map<string, number>): ControlCoverage {
  let supported = 0;
  let degraded = 0;
  let unknown = 0;

  const byKind = [...controlCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => {
      const status = supportStatus(kind);
      if (status === "supported") supported += count;
      if (status === "degraded") degraded += count;
      if (status === "unknown") unknown += count;
      return { kind, count, status };
    });

  const total = supported + degraded + unknown;
  return {
    total,
    supported,
    degraded,
    unknown,
    supportedPercent: percentage(supported, total),
    previewablePercent: percentage(supported + degraded, total),
    unknownPercent: percentage(unknown, total),
    byKind
  };
}

function supportStatus(kind: string): ControlSupportStatus {
  if (SUPPORTED_CONTROLS.has(kind)) return "supported";
  if (DEGRADED_CONTROLS.has(kind)) return "degraded";
  return "unknown";
}

function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function stripInternalControl(control: MutableControl): VisualControl {
  const { typeName: _typeName, ...rest } = control;
  rest.children = rest.children.map((child) => stripInternalControl(child as MutableControl));
  return rest;
}

function stripInternalForm(form: VisualForm): VisualForm {
  return {
    ...form,
    controls: form.controls.map((control) => stripInternalControl(control as MutableControl))
  };
}

function stripInternalColumn(column: MutableColumn): VisualColumn {
  return {
    kind: column.kind,
    name: column.name,
    headerText: column.headerText,
    width: column.width
  };
}
