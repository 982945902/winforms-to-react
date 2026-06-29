import type {
  ControlCoverage,
  ControlSupportStatus,
  EventStub,
  FormReportSummary,
  FormSupportSummary,
  MigrationReport,
  ParseResult,
  VisualAppearance,
  VisualBounds,
  VisualBorderStyle,
  VisualColor,
  VisualColumn,
  VisualContentAlignment,
  VisualControl,
  VisualFont,
  VisualForm,
  VisualPadding,
  VisualSize,
  VisualTableLayout,
  VisualTableSizing
} from "../ir/types.js";

export type ParseDesignerOptions = {
  sourcePath: string;
  baseKindMap?: Map<string, string>;
};

type MutableControl = VisualControl & {
  typeName: string;
};

type MutableColumn = VisualColumn & {
  typeName: string;
  properties: Record<string, unknown>;
};

function emptyAppearance(): VisualAppearance {
  return {};
}

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
  "PrintPreviewControl",
  "ProgressBar",
  "PropertyGrid",
  "PropertyGridExtended",
  "RadioButton",
  "RichTextBox",
  "SplitContainer",
  "Splitter",
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
  "UserControl",
  "VScrollBar",
  "WebBrowser",
  "ElementHost"
]);

const DEGRADED_CONTROLS = new Set([
  "Chart",
  "Control"
]);

const NON_CONTROL_KINDS = new Set([
  "BindingSource",
  "ColorDialog",
  "ComponentResourceManager",
  "Container",
  "ContextMenuStrip",
  "Cursor",
  "DataGridViewCellStyle",
  "ErrorProvider",
  "FolderBrowserDialog",
  "FontDialog",
  "Font",
  "HelpProvider",
  "ImageList",
  "ImageListStreamer",
  "ListViewItem",
  "ListViewGroup",
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
  "LinkArea",
  "TreeNode",
  "TreeNodeCompositeClickHandler",
  "ToolTip",
  "Timer",
  "NotifyIcon",
  "decimal"
]);

export function parseDesignerSource(source: string, options: ParseDesignerOptions): ParseResult {
  const stripped = stripComments(source);
  const className = findClassName(stripped) ?? stripDesignerSuffix(options.sourcePath);
  const fields = parseFieldTypes(stripped);
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
        appearance: emptyAppearance(),
        properties: {},
        events: [],
        children: []
      });
    }
  }

  for (const [name, typeName] of parseInstantiations(stripped, fields)) {
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
        appearance: emptyAppearance(),
        properties: {},
        events: [],
        children: []
      });
    }
  }

  const form: VisualForm = {
    kind: "Form",
    name: className,
    sourcePath: options.sourcePath,
    support: emptyFormSupport(),
    controls: [],
    properties: {}
  };

  applyPropertyAssignments(stripped, controls, columns, form);
  applyEvents(stripped, controls);
  applyColumns(stripped, controls, columns);
  applyListItems(stripped, controls);
  applyTableLayout(stripped, controls);
  applyControlHierarchy(stripped, controls, form);
  applyToolStripHierarchy(stripped, controls);
  applySplitContainer(stripped, controls);
  applyToolStripContainerPanels(stripped, controls);
  applyNestedControlProperties(stripped, controls);

  // Resolve custom control kinds to known WinForms base kinds so the renderer
  // and coverage report treat them as their base control (e.g. MyListView -> ListView).
  if (options.baseKindMap && options.baseKindMap.size > 0) {
    for (const control of controls.values()) resolveControlKind(control, options.baseKindMap);
  }

  applyImplicitDock(controls, form);

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

  const controlCoverage = buildControlCoverage(controlCounts);
  form.support = {
    controlsConverted: controls.size,
    supportedControls: [...supportedControls].sort(),
    degradedControls: [...degradedControls].sort(),
    unknownControls: [...unknownControls].sort(),
    controlCoverage,
    eventStubs
  };

  const report: MigrationReport = {
    sourceFiles: [options.sourcePath],
    forms: [formReportFromForm(form)],
    formsConverted: 1,
    controlsConverted: controls.size,
    supportedControls: form.support.supportedControls,
    degradedControls: form.support.degradedControls,
    unknownControls: form.support.unknownControls,
    controlCoverage,
    eventStubs
  };

  return {
    form: stripInternalForm(form),
    controlsByName: new Map([...controls.entries()].map(([name, control]) => [name, stripInternalControl(control)])),
    report
  };
}

function formReportFromForm(form: VisualForm): FormReportSummary {
  return {
    name: form.name,
    title: form.text,
    sourcePath: form.sourcePath,
    support: form.support
  };
}

function emptyFormSupport(): FormSupportSummary {
  return {
    controlsConverted: 0,
    supportedControls: [],
    degradedControls: [],
    unknownControls: [],
    controlCoverage: {
      total: 0,
      supported: 0,
      degraded: 0,
      unknown: 0,
      supportedPercent: 0,
      previewablePercent: 0,
      unknownPercent: 0,
      byKind: []
    },
    eventStubs: []
  };
}

function findClassName(source: string): string | null {
  return source.match(/\bpartial\s+class\s+([A-Za-z_]\w*)/)?.[1] ?? source.match(/\bclass\s+([A-Za-z_]\w*)/)?.[1] ?? null;
}

function stripDesignerSuffix(sourcePath: string): string {
  const fileName = sourcePath.split(/[\\/]/).pop() ?? "Form";
  return fileName.replace(/\.Designer\.cs$/i, "").replace(/\.cs$/i, "");
}

// Strip C# comments before regex scanning so commented-out Designer lines and
// block-comment headers are not mistaken for live assignments. String literals
// are preserved verbatim so semicolons or keywords inside them stay inert in
// later passes (those passes stop on statement boundaries, not on quotes).
function stripComments(source: string): string {
  let result = "";
  let i = 0;
  const length = source.length;
  while (i < length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i + 2);
      i = end === -1 ? length : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? length : end + 2;
      continue;
    }
    if (ch === "@" && next === "\"") {
      result += source.slice(i, i + 2);
      i += 2;
      while (i < length) {
        if (source[i] === "\"") {
          if (source[i + 1] === "\"") {
            result += "\"\"";
            i += 2;
            continue;
          }
          result += "\"";
          i += 1;
          break;
        }
        result += source[i];
        i += 1;
      }
      continue;
    }
    if (ch === "\"") {
      result += "\"";
      i += 1;
      while (i < length) {
        if (source[i] === "\\") {
          result += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (source[i] === "\"") {
          result += "\"";
          i += 1;
          break;
        }
        result += source[i];
        i += 1;
      }
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}

function parseFieldTypes(source: string): Map<string, string> {
  const fields = new Map<string, string>();
  const explicitPattern = /^\s*(?:private|protected|internal|public)\s+(?:global::)?([A-Za-z_][\w.<>]*)\s+([A-Za-z_]\w*)\s*;/gm;
  for (const match of source.matchAll(explicitPattern)) {
    fields.set(match[2], match[1]);
  }

  const implicitPattern = /^\s*(?:global::)?([A-Za-z_][\w.<>]*)\s+([A-Za-z_]\w*)\s*;/gm;
  for (const match of source.matchAll(implicitPattern)) {
    const kind = shortTypeName(match[1]);
    if (match[1].includes(".") || isKnownDesignerKind(kind)) {
      fields.set(match[2], match[1]);
    }
  }

  return fields;
}

function parseInstantiations(source: string, fields: Map<string, string>): Array<[string, string]> {
  const instances: Array<[string, string]> = [];
  const typedPattern = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s+(?:global::)?([A-Za-z_][\w.]*)\s*\(/g;
  for (const match of source.matchAll(typedPattern)) {
    instances.push([match[1], match[2]]);
  }

  const targetTypedPattern = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*new\s*\(\s*\)/g;
  for (const match of source.matchAll(targetTypedPattern)) {
    const declaredType = fields.get(match[1]);
    if (declaredType) instances.push([match[1], declaredType]);
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
    const rawValue = match[3];
    const control = controls.get(target);
    const column = columns.get(target);

    if (control) {
      const value = isVisualProperty(property) ? rawValue : parseValue(rawValue);
      assignControlProperty(control, property, value);
      consumedRanges.push([match.index, match.index + match[0].length]);
      continue;
    }

    if (column) {
      const value = parseValue(rawValue);
      assignColumnProperty(column, property, value);
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const formPropertyPattern = /(?:this\.)?([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  for (const match of source.matchAll(formPropertyPattern)) {
    if (consumedRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;

    const property = match[1];
    if (controls.has(property) || columns.has(property)) continue;

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
    case "Font":
      control.appearance.font = parseFont(value);
      break;
    case "ForeColor":
      control.appearance.foreColor = parseColor(value);
      break;
    case "BackColor":
      control.appearance.backColor = parseColor(value);
      break;
    case "Enabled":
      if (typeof value === "boolean") control.appearance.enabled = value;
      break;
    case "Visible":
      if (typeof value === "boolean") control.appearance.visible = value;
      break;
    case "BorderStyle":
      control.appearance.borderStyle = parseBorderStyle(value);
      break;
    case "TextAlign":
      control.appearance.textAlign = parseContentAlignment(value);
      break;
    case "ImageKey":
    case "ImageIndex":
      control.appearance.imageKey = String(value ?? "");
      break;
    case "Image":
      control.appearance.image = String(value ?? "");
      break;
    case "Padding":
      control.appearance.padding = parsePadding(value);
      break;
    case "Margin":
      control.appearance.margin = parsePadding(value);
      break;
    case "RightToLeft":
      control.appearance.rightToLeft = value === "Yes" || value === "Inherit";
      break;
    case "MaximumSize":
      control.appearance.maximumSize = toVisualSize(value);
      break;
    case "MinimumSize":
      control.appearance.minimumSize = toVisualSize(value);
      break;
    case "FlatStyle":
      control.appearance.flatStyle = String(value ?? "");
      break;
    case "FlowDirection":
      control.flowDirection = String(value ?? "");
      break;
    case "WrapContents":
      if (typeof value === "boolean") control.wrapContents = value;
      break;
    case "Orientation":
      control.orientation = String(value ?? "");
      break;
    case "SplitterDistance":
      if (typeof value === "number") control.splitterDistance = value;
      break;
    case "Checked":
      if (typeof value === "boolean") control.appearance.checked = value;
      break;
    case "ThreeState":
      if (typeof value === "boolean") control.appearance.threeState = value;
      break;
    case "ReadOnly":
      if (typeof value === "boolean") control.appearance.readOnly = value;
      break;
    case "Multiline":
      if (typeof value === "boolean") control.appearance.multiline = value;
      break;
    case "PasswordChar":
      control.appearance.passwordChar = String(value ?? "");
      break;
    case "UseSystemPasswordChar":
      if (value === true) control.appearance.passwordChar = "•";
      break;
    case "MaxLength":
      if (typeof value === "number") control.appearance.maxLength = value;
      break;
    case "DropDownStyle":
      control.appearance.dropDownStyle = String(value ?? "");
      break;
    case "SelectedIndex":
      if (typeof value === "number") control.appearance.selectedIndex = value;
      break;
    case "Value":
      control.appearance.value = typeof value === "number" ? value : String(value ?? "");
      break;
    case "Minimum":
      if (typeof value === "number") control.appearance.minimum = value;
      break;
    case "Maximum":
      if (typeof value === "number") control.appearance.maximum = value;
      break;
    case "Format":
      control.appearance.format = String(value ?? "");
      break;
    case "WordWrap":
      if (typeof value === "boolean") control.appearance.wordWrap = value;
      break;
    case "ScrollBars":
      control.appearance.scrollBars = String(value ?? "");
      break;
    case "CheckAlign":
      control.appearance.checkAlign = parseContentAlignment(value);
      break;
    case "ImageAlign":
      control.appearance.imageAlign = parseContentAlignment(value);
      break;
    case "Appearance":
      control.appearance.appearanceStyle = String(value ?? "");
      break;
    case "View":
      control.appearance.view = String(value ?? "");
      break;
    case "Mask":
      control.appearance.mask = String(value ?? "");
      break;
    case "ImageLocation":
      control.appearance.imageLocation = String(value ?? "");
      break;
    case "SizeMode":
      control.appearance.sizeMode = String(value ?? "");
      break;
    case "Rows":
      if (typeof value === "number") control.appearance.rows = value;
      break;
    case "Zoom":
      if (typeof value === "number") control.appearance.zoom = value;
      break;
    case "AutoZoom":
      if (typeof value === "boolean") control.appearance.autoZoom = value;
      break;
    case "Url":
      control.appearance.url = parseUri(value);
      break;
    case "BackgroundColor":
    case "GridColor":
      control.properties[property] = parseColor(value);
      break;
    default:
      control.properties[property] = value;
      break;
  }
}

function assignColumnProperty(column: MutableColumn, property: string, value: unknown) {
  switch (property) {
    case "HeaderText":
    case "Text":
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
    case "FormBorderStyle":
      form.formBorderStyle = String(value ?? "");
      break;
    case "StartPosition":
      form.startPosition = String(value ?? "");
      break;
    case "WindowState":
      form.windowState = String(value ?? "");
      break;
    case "Opacity":
      if (typeof value === "number") form.opacity = value;
      break;
    case "AcceptButton":
      form.acceptButton = String(value ?? "");
      break;
    case "CancelButton":
      form.cancelButton = String(value ?? "");
      break;
    case "Icon":
      form.icon = String(value ?? "");
      break;
    case "BackgroundImage":
      form.backgroundImage = String(value ?? "");
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

// Collect TableLayoutPanel row/column styles and cell coordinates. Designer
// emits RowStyles.Add/ColumnStyles.Add with RowStyle(SizeType.Percent, 50F) and
// Controls.Add(child, column, row).
function applyTableLayout(source: string, controls: Map<string, MutableControl>) {
  for (const control of controls.values()) {
    if (control.kind !== "TableLayoutPanel") continue;

    const colStyles = parseTableSizing(source, control.name, "ColumnStyles");
    const rowStyles = parseTableSizing(source, control.name, "RowStyles");
    const cells: Record<string, [number, number]> = {};
    const columnSpan: Record<string, number> = {};
    const rowSpan: Record<string, number> = {};

    const cellPattern = new RegExp(
      `(?:this\\.)?${control.name}\\.Controls\\.Add\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)`,
      "g"
    );
    for (const match of source.matchAll(cellPattern)) {
      cells[match[1]] = [Number(match[2]), Number(match[3])];
    }

    const spanPattern = new RegExp(
      `(?:this\\.)?${control.name}\\.SetColumnSpan\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*,\\s*(\\d+)\\s*\\)`,
      "g"
    );
    for (const match of source.matchAll(spanPattern)) {
      columnSpan[match[1]] = Number(match[2]);
    }
    const rowSpanPattern = new RegExp(
      `(?:this\\.)?${control.name}\\.SetRowSpan\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*,\\s*(\\d+)\\s*\\)`,
      "g"
    );
    for (const match of source.matchAll(rowSpanPattern)) {
      rowSpan[match[1]] = Number(match[2]);
    }

    if (colStyles.length || rowStyles.length || Object.keys(cells).length) {
      control.tableLayout = { columns: colStyles, rows: rowStyles, cells, columnSpan, rowSpan };
      // Add cell children as actual child control objects so the renderer can
      // find them via control.children. Controls.Add(child, col, row) is not
      // matched by the generic controlAddPattern (it only matches single-arg Add).
      const existing = new Set(control.children.map((c) => c.name));
      for (const childName of Object.keys(cells)) {
        const child = controls.get(childName);
        if (child && !existing.has(childName)) {
          control.children.push(child);
          existing.add(childName);
        }
      }
    }
  }
}

function parseTableSizing(source: string, controlName: string, collection: "ColumnStyles" | "RowStyles"): VisualTableSizing[] {
  const out: VisualTableSizing[] = [];
  // Single regex matching all RowStyle/ColumnStyle variants in source order:
  //   new RowStyle() -> {type:AutoSize}
  //   new RowStyle(SizeType.AutoSize) -> {type:AutoSize}
  //   new RowStyle(SizeType.Percent, 50F) -> {type:Percent, value:50}
  //   new RowStyle(SizeType.Absolute, 20F) -> {type:Absolute, value:20}
  const pattern = new RegExp(
    `(?:this\\.)?${controlName}\\.${collection}\\.Add\\(\\s*new\\s+(?:System\\.Windows\\.Forms\\.)?(?:Row|Column)Style\\s*\\(\\s*(?:(?:System\\.Windows\\.Forms\\.)?SizeType\\.)?(\\w+)?\\s*(?:,\\s*([\\d.]+)F?\\s*)?\\)`,
    "g"
  );
  for (const match of source.matchAll(pattern)) {
    const type = (match[1] ?? "AutoSize") as VisualTableSizing["type"];
    const value = match[2] != null ? Number(match[2]) : undefined;
    out.push({ type, value });
  }
  return out;
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
  const controlAddPattern = /(?:this\.)?([A-Za-z_]\w*)\.Controls\.Add\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)/g;
  for (const match of source.matchAll(controlAddPattern)) {
    const parent = controls.get(match[1]);
    const child = controls.get(match[2]);
    if (!parent || !child) continue;
    if (!parent.children.some((existing) => existing.name === child.name)) {
      parent.children.push(child);
    }
    childParents.set(child.name, parent.name);
  }

  const formAddPattern = /(?:^|[;\r\n])\s*(?:this\.)?Controls\.Add\(\s*(?:this\.)?([A-Za-z_]\w*)\s*\)/g;
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

// WinForms convention: MenuStrip without explicit Dock defaults to Top,
// StatusStrip defaults to Bottom. Apply implicit dock so the layout engine
// reserves space for them and Dock=Fill content doesn't overlap.
function applyImplicitDock(controls: Map<string, MutableControl>, form: VisualForm) {
  const all = [...controls.values()];
  // Also check form-level controls
  for (const list of [form.controls, all]) {
    for (const control of list) {
      if (control.dock) continue;
      if (control.kind === "MenuStrip") control.dock = "Top";
      else if (control.kind === "StatusStrip") control.dock = "Bottom";
    }
  }
}

function isToolStripContainerKind(kind: string): boolean {
  return kind === "MenuStrip" || kind === "ToolStrip" || kind === "StatusStrip" || kind.startsWith("ToolStrip");
}

// Capture nested property assignments like `this.grid.DefaultCellStyle.BackColor = ...`
// that the flat controlPropertyPattern misses. We normalize the common
// DataGridView style properties into control.properties so the renderer can
// consume them; visual properties (Font/ForeColor/BackColor) are routed to
// appearance when they apply to the control's own DefaultCellStyle.
function applyNestedControlProperties(source: string, controls: Map<string, MutableControl>) {
  const pattern = /(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  for (const match of source.matchAll(pattern)) {
    const target = match[1];
    const outer = match[2];
    const inner = match[3];
    const rawValue = match[4];
    const control = controls.get(target);
    if (!control) continue;

    const key = outer + "." + inner;
    if (outer === "DefaultCellStyle" || outer === "AlternatingRowsDefaultCellStyle"
        || outer === "ColumnHeadersDefaultCellStyle" || outer === "RowHeadersDefaultCellStyle"
        || outer === "SelectedCellsDefaultCellStyle") {
      if (inner === "Font") {
        control.properties[key] = parseFont(rawValue);
      } else if (inner === "ForeColor" || inner === "BackColor" || inner === "SelectionBackColor" || inner === "SelectionForeColor") {
        control.properties[key] = parseColor(rawValue);
      } else {
        control.properties[key] = parseValue(rawValue);
      }
    } else if (outer === "Columns" || outer === "Rows") {
      control.properties[key] = parseValue(rawValue);
    } else {
      control.properties[key] = parseValue(rawValue);
    }
  }
}

// SplitContainer exposes Panel1/Panel2 as nested Containers. Designer writes
// `this.split.Panel1.Controls.Add(this.child)` — collect which children belong
// to each panel so the renderer can lay them out as two regions.
function applySplitContainer(source: string, controls: Map<string, MutableControl>) {
  for (const control of controls.values()) {
    if (control.kind !== "SplitContainer") continue;

    const panel1: string[] = [];
    const panel2: string[] = [];
    const p1Pattern = new RegExp(
      `(?:this\\.)?${control.name}\\.Panel1\\.Controls\\.Add\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*\\)`,
      "g"
    );
    const p2Pattern = new RegExp(
      `(?:this\\.)?${control.name}\\.Panel2\\.Controls\\.Add\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*\\)`,
      "g"
    );
    for (const m of source.matchAll(p1Pattern)) panel1.push(m[1]);
    for (const m of source.matchAll(p2Pattern)) panel2.push(m[1]);

    if (panel1.length || panel2.length) {
      control.panel1Children = panel1;
      control.panel2Children = panel2;
      // Add panel children as actual child control objects so the renderer can
      // find them. Remove duplicates from the flat children list.
      const split = new Set([...panel1, ...panel2]);
      const existing = new Set(control.children.map((c) => c.name));
      for (const name of [...panel1, ...panel2]) {
        const child = controls.get(name);
        if (child && !existing.has(name)) {
          control.children.push(child);
          existing.add(name);
        }
      }
    }
  }
}

// ToolStripContainer exposes 4 edge panels (Top/Bottom/Left/Right) and a
// ContentPanel. Designer writes `this.tsc.TopToolStripPanel.Controls.Add(x)`
// and `this.tsc.ContentPanel.Controls.Add(y)`. Collect per-panel child lists so
// the renderer can place them in the correct region.
function applyToolStripContainerPanels(source: string, controls: Map<string, MutableControl>) {
  for (const control of controls.values()) {
    if (control.kind !== "ToolStripContainer") continue;

    const panels: Array<["topToolStripChildren" | "bottomToolStripChildren" | "leftToolStripChildren" | "rightToolStripChildren" | "contentPanelChildren", string]> = [
      ["topToolStripChildren", "TopToolStripPanel"],
      ["bottomToolStripChildren", "BottomToolStripPanel"],
      ["leftToolStripChildren", "LeftToolStripPanel"],
      ["rightToolStripChildren", "RightToolStripPanel"],
      ["contentPanelChildren", "ContentPanel"]
    ];
    const allNames: string[] = [];
    for (const [field, panelName] of panels) {
      const arr: string[] = [];
      const pat = new RegExp(
        `(?:this\\.)?${control.name}\\.${panelName}\\.Controls\\.Add\\(\\s*(?:this\\.)?([A-Za-z_]\\w*)\\s*\\)`,
        "g"
      );
      for (const m of source.matchAll(pat)) arr.push(m[1]);
      if (arr.length) {
        (control as MutableControl)[field] = arr;
        allNames.push(...arr);
      }
    }
    if (allNames.length) {
      // Add panel children as actual child control objects so the renderer can
      // find them via control.children. Remove from the flat children list any
      // that were already added (via Controls.Add) to avoid duplicates.
      const used = new Set(allNames);
      const existing = new Set(control.children.map((c) => c.name));
      for (const name of allNames) {
        const child = controls.get(name);
        if (child && !existing.has(name)) {
          control.children.push(child);
          existing.add(name);
        }
      }
    }
  }
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

const VISUAL_PROPERTIES = new Set([
  "Font",
  "ForeColor",
  "BackColor",
  "BorderStyle",
  "TextAlign",
  "ImageKey",
  "ImageIndex",
  "Image",
  "Padding",
  "Margin",
  "MaximumSize",
  "MinimumSize",
  "Url"
]);

function isVisualProperty(property: string): boolean {
  return VISUAL_PROPERTIES.has(property);
}

// Parse `new System.Drawing.Font(family, size[, style])` into a VisualFont.
// Accepts the raw right-hand side string from the Designer assignment.
function parseFont(value: unknown): VisualFont | undefined {
  const raw = String(value ?? "").trim();
  const m = raw.match(/new\s+(?:System\.Drawing\.)?Font\s*\(([\s\S]*?)\)/);
  if (!m) return undefined;

  const args = splitArgs(m[1]);
  if (args.length < 2) return undefined;
  const family = String(parseValue(args[0]));
  const sizeNum = Number(String(parseValue(args[1])).replace(/F$/i, ""));
  const font: VisualFont = { family, size: Number.isFinite(sizeNum) ? sizeNum : undefined };

  // Style can be a single enum or a bitwise OR of multiple FontStyle values.
  const styleArgs = args.slice(2).join("|");
  if (styleArgs) {
    const tails = styleArgs.split("|").map((part) => enumTail(part.trim()));
    const styleText = tails.join("|");
    if (styleText.includes("Bold")) font.bold = true;
    if (styleText.includes("Italic")) font.italic = true;
    if (styleText.includes("Underline")) font.underline = true;
    if (styleText.includes("Strikeout")) font.strikeout = true;
  }
  return font;
}

// Parse System.Drawing.Color. FromArgb / FromKnownColor / named member access.
function parseColor(value: unknown): VisualColor | undefined {
  if (value == null) return undefined;
  if (typeof value === "object" && "cssColor" in (value as Record<string, unknown>)) {
    return value as VisualColor;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const argb = raw.match(/(?:System\.Drawing\.)?Color\.FromArgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/);
  if (argb) {
    const a = argb[4] != null ? Number(argb[4]) : 255;
    const r = Number(argb[1]);
    const g = Number(argb[2]);
    const b = Number(argb[3]);
    if (a === 255) return { cssColor: `rgb(${r}, ${g}, ${b})` };
    return { cssColor: `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})` };
  }

  const known = raw.match(/(?:System\.Drawing\.)?Color\.FromKnownColor\s*\(\s*(?:System\.Drawing\.)?KnownColor\.([A-Za-z_]\w*)\s*\)/);
  if (known) {
    const name = known[1];
    return { cssColor: knownColorToCss(name) ?? `#${name}`, name };
  }

  const direct = raw.match(/(?:System\.Drawing\.)?Color\.([A-Za-z_]\w*)/);
  if (direct) {
    const name = direct[1];
    if (name === "Empty" || name === "Transparent") return { cssColor: "transparent", name };
    const css = knownColorToCss(name);
    if (css) return { cssColor: css, name };
  }

  // Bare known color name (already extracted by parseValue's enum matcher).
  const bare = knownColorToCss(raw);
  if (bare) return { cssColor: bare, name: raw };

  return { cssColor: raw };
}

// Parse ContentAlignment enum (TopLeft/TopCenter/.../BottomRight) into horizontal+vertical.
function parseContentAlignment(value: unknown): VisualContentAlignment | undefined {
  const text = String(value ?? "");
  const aligned = enumTail(text);
  const horizontal = aligned.includes("Left") ? "Left"
    : aligned.includes("Right") ? "Right"
    : "Center";
  const vertical = aligned.includes("Top") ? "Top"
    : aligned.includes("Bottom") ? "Bottom"
    : "Middle";
  return { horizontal, vertical };
}

// Parse BorderStyle (None/FixedSingle/Fixed3D) into a normalized enum.
function parseBorderStyle(value: unknown): VisualBorderStyle | undefined {
  const text = enumTail(String(value ?? ""));
  if (text === "None" || text === "FixedSingle" || text === "Fixed3D") return text;
  return undefined;
}

// Map System.Windows.Forms known colors to CSS color values for the common palette.
function knownColorToCss(name: string): string | undefined {
  const map: Record<string, string> = {
    Black: "#000000", White: "#ffffff", Red: "#ff0000", Green: "#008000",
    Blue: "#0000ff", Yellow: "#ffff00", Gray: "#808080", DarkGray: "#a9a9a9",
    LightGray: "#d3d3d3", Silver: "#c0c0c0", Transparent: "transparent",
    Control: "#f0f0f0", ControlDark: "#a0a0a0", ControlDarkDark: "#808080",
    ControlLight: "#e3e3e3", ControlLightLight: "#ffffff", ControlText: "#000000",
    Window: "#ffffff", WindowText: "#000000", Highlight: "#0078d7",
    HighlightText: "#ffffff", ActiveCaption: "#c9c9c9", ActiveCaptionText: "#000000",
    InactiveCaption: "#dcdcdc", InactiveCaptionText: "#000000", Desktop: "#000000",
    Info: "#ffffe1", InfoText: "#000000", Menu: "#f0f0f0", MenuText: "#000000",
    MenuBar: "#f0f0f0", MenuHighlight: "#0078d7", ButtonFace: "#f0f0f0",
    ButtonHighlight: "#ffffff", ButtonShadow: "#a0a0a0",
    GradientActiveCaption: "#c9c9c9", GradientInactiveCaption: "#dcdcdc",
    // Extended named colors
    AliceBlue: "#f0f8ff", AntiqueWhite: "#faebd7", Aqua: "#00ffff",
    Aquamarine: "#7fffd4", Azure: "#f0ffff", Beige: "#f5f5dc",
    Bisque: "#ffe4c4", BlanchedAlmond: "#ffebcd", BlueViolet: "#8a2be2",
    Brown: "#a52a2a", BurlyWood: "#deb887", CadetBlue: "#5f9ea0",
    Chartreuse: "#7fff00", Chocolate: "#d2691e", Coral: "#ff7f50",
    CornflowerBlue: "#6495ed", Cornsilk: "#fff8dc", Crimson: "#dc143c",
    Cyan: "#00ffff", DarkBlue: "#00008b", DarkCyan: "#008b8b",
    DarkGoldenrod: "#b8860b", DarkGreen: "#006400", DarkKhaki: "#bdb76b",
    DarkMagenta: "#8b008b", DarkOliveGreen: "#556b2f", DarkOrange: "#ff8c00",
    DarkOrchid: "#9932cc", DarkRed: "#8b0000", DarkSalmon: "#e9967a",
    DarkSeaGreen: "#8fbc8f", DarkSlateBlue: "#483d8b", DarkSlateGray: "#2f4f4f",
    DarkTurquoise: "#00ced1", DarkViolet: "#9400d3", DeepPink: "#ff1493",
    DeepSkyBlue: "#00bfff", DimGray: "#696969", DodgerBlue: "#1e90ff",
    Firebrick: "#b22222", FloralWhite: "#fffaf0", ForestGreen: "#228b22",
    Fuchsia: "#ff00ff", Gainsboro: "#dcdcdc", GhostWhite: "#f8f8ff",
    Gold: "#ffd700", Goldenrod: "#daa520", GreenYellow: "#adff2f",
    Honeydew: "#f0fff0", HotPink: "#ff69b4", IndianRed: "#cd5c5c",
    Indigo: "#4b0082", Ivory: "#fffff0", Khaki: "#f0e68c",
    Lavender: "#e6e6fa", LavenderBlush: "#fff0f5", LawnGreen: "#7cfc00",
    LemonChiffon: "#fffacd", LightBlue: "#add8e6", LightCoral: "#f08080",
    LightCyan: "#e0ffff", LightGoldenrodYellow: "#fafad2", LightGreen: "#90ee90",
    LightPink: "#ffb6c1", LightSalmon: "#ffa07a", LightSeaGreen: "#20b2aa",
    LightSkyBlue: "#87cefa", LightSlateGray: "#778899", LightSteelBlue: "#b0c4de",
    LightYellow: "#ffffe0", Lime: "#00ff00", LimeGreen: "#32cd32",
    Linen: "#faf0e6", Magenta: "#ff00ff", Maroon: "#800000",
    MediumAquamarine: "#66cdaa", MediumBlue: "#0000cd", MediumOrchid: "#ba55d3",
    MediumPurple: "#9370db", MediumSeaGreen: "#3cb371", MediumSlateBlue: "#7b68ee",
    MediumSpringGreen: "#00fa9a", MediumTurquoise: "#48d1cc", MediumVioletRed: "#c71585",
    MidnightBlue: "#191970", MintCream: "#f5fffa", MistyRose: "#ffe4e1",
    Moccasin: "#ffe4b5", NavajoWhite: "#ffdead", Navy: "#000080",
    OldLace: "#fdf5e6", Olive: "#808000", OliveDrab: "#6b8e23",
    Orange: "#ffa500", OrangeRed: "#ff4500", Orchid: "#da70d6",
    PaleGoldenrod: "#eee8aa", PaleGreen: "#98fb98", PaleTurquoise: "#afeeee",
    PaleVioletRed: "#db7093", PapayaWhip: "#ffefd5", PeachPuff: "#ffdab9",
    Peru: "#cd853f", Pink: "#ffc0cb", Plum: "#dda0dd", PowderBlue: "#b0e0e6",
    Purple: "#800080", RosyBrown: "#bc8f8f", RoyalBlue: "#4169e1",
    SaddleBrown: "#8b4513", Salmon: "#fa8072", SandyBrown: "#f4a460",
    SeaGreen: "#2e8b57", SeaShell: "#fff5ee", Sienna: "#a0522d",
    SkyBlue: "#87ceeb", SlateBlue: "#6a5acd", SlateGray: "#708090",
    Snow: "#fffafa", SpringGreen: "#00ff7f", SteelBlue: "#4682b4",
    Tan: "#d2b48c", Teal: "#008080", Thistle: "#d8bfd8", Tomato: "#ff6347",
    Turquoise: "#40e0d0", Violet: "#ee82ee", Wheat: "#f5deb3",
    Whitesmoke: "#f5f5f5", YellowGreen: "#9acd32",
    AppWorkspace: "#ababab", ScrollBar: "#c8c8c8", ActiveBorder: "#c0c0c0",
    InactiveBorder: "#d4d4d4", GrayText: "#808080", CaptionText: "#000000",
    HotTrack: "#0066cc", WindowFrame: "#cccccc"
  };
  return map[name];
}

// Parse `new System.Uri("https://...", System.UriKind.Absolute)` into a URL string.
function parseUri(value: unknown): string {
  const raw = String(value ?? "").trim();
  const m = raw.match(/new\s+(?:System\.)?Uri\s*\(\s*"([^"]+)"/);
  if (m) return m[1];
  return raw;
}

function toVisualSize(value: unknown): VisualSize | undefined {
  if (isRecord(value) && typeof value.width === "number" && typeof value.height === "number") {
    return { width: value.width, height: value.height };
  }
  return undefined;
}

// Parse `new System.Windows.Forms.Padding(all)` or `new Padding(l, t, r, b)`.
function parsePadding(value: unknown): VisualPadding | undefined {
  const raw = String(value ?? "").trim();
  const m = raw.match(/new\s+(?:System\.Windows\.Forms\.)?Padding\s*\(\s*([^)]*)\s*\)/);
  if (!m) return undefined;
  const args = m[1].split(",").map((s) => Number(String(parseValue(s.trim()))));
  if (args.length === 1) {
    return { left: args[0], top: args[0], right: args[0], bottom: args[0] };
  }
  if (args.length >= 4) {
    return { left: args[0], top: args[1], right: args[2], bottom: args[3] };
  }
  return undefined;
}

// Split a C# argument list on top-level commas, respecting parentheses and
// string literals. Used by parseFont and similar structured value parsers.
function splitArgs(source: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ",") {
      if (depth === 0) {
        args.push(current.trim());
        current = "";
        i += 1;
        continue;
      }
    } else if (ch === "@") {
      // verbatim string: @"..." with "" escapes
      current += ch;
      i += 1;
      if (source[i] === "\"") {
        current += source[i];
        i += 1;
        while (i < source.length) {
          current += source[i];
          if (source[i] === "\"") {
            if (source[i + 1] === "\"") { current += source[i + 1]; i += 2; continue; }
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
    } else if (ch === "\"") {
      current += ch;
      i += 1;
      while (i < source.length) {
        current += source[i];
        if (source[i] === "\\") { current += source[i + 1] ?? ""; i += 2; continue; }
        if (source[i] === "\"") { i += 1; break; }
        i += 1;
      }
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) args.push(current.trim());
  return args;
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
  // Accept any type with a namespace (custom controls like GitUI.RevisionGridControl)
  // or bare WinForms types. Non-visual components are filtered by NON_CONTROL_KINDS.
  return true;
}

function isKnownDesignerKind(kind: string): boolean {
  return SUPPORTED_CONTROLS.has(kind) || DEGRADED_CONTROLS.has(kind) || isColumnKind(kind);
}

function isColumnKind(kind: string): boolean {
  return (kind.startsWith("DataGridView") && kind.endsWith("Column")) || kind === "ColumnHeader";
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

// Resolve a custom control kind to a known WinForms base kind via the
// inheritance map (e.g. MyListView -> ListView). Returns the first known
// ancestor kind, or the original kind if no mapping exists.
function resolveBaseKind(kind: string, baseKindMap?: Map<string, string>): string {
  if (!baseKindMap) return kind;
  const seen = new Set<string>([kind]);
  let current = kind;
  for (let i = 0; i < 32; i += 1) {
    if (SUPPORTED_CONTROLS.has(current) || DEGRADED_CONTROLS.has(current)) return current;
    const base = baseKindMap.get(current);
    if (!base || seen.has(base)) break;
    seen.add(base);
    current = base;
  }
  // Heuristic: if the inheritance chain dead-ends at Control/Component, try to
  // infer the control kind from the class name (e.g. BlackStyleProgressBar ->
  // ProgressBar, FancyTextBox -> TextBox). Match the longest known kind that
  // appears as a substring of the class name to avoid Button matching ButtonBase.
  return inferKindFromName(kind);
}

// Infer a WinForms control kind from a class name by checking if any known
// control kind is a suffix or substring of the name. Prefers the longest match.
function inferKindFromName(name: string): string {
  let best: string | undefined;
  let bestLen = 0;
  for (const kind of SUPPORTED_CONTROLS) {
    if (name.includes(kind) && kind.length > bestLen) {
      best = kind;
      bestLen = kind.length;
    }
  }
  return best ?? name;
}

// Recursively replace control.kind with its resolved base kind, preserving
// the original kind in properties.originalKind for traceability.
function resolveControlKind(control: MutableControl, baseKindMap: Map<string, string>): void {
  let resolved = resolveBaseKind(control.kind, baseKindMap);
  // If still Control (degraded base), try name-based heuristic to get a more
  // specific supported kind (e.g. BlackStyleProgressBar -> ProgressBar).
  if (resolved === "Control") {
    const inferred = inferKindFromName(control.kind);
    if (inferred !== control.kind && inferred !== "Control") resolved = inferred;
  }
  // If completely unresolved (not a known kind and no inheritance mapping),
  // the control is a custom visual control that was instantiated and added to
  // the visual tree. Default to UserControl (the most common base for custom
  // WinForms controls with no explicit base class). This must NOT trigger for
  // controls that are already known supported/degraded kinds.
  if (!SUPPORTED_CONTROLS.has(resolved) && !DEGRADED_CONTROLS.has(resolved) && resolved === control.kind) {
    resolved = "UserControl";
  }
  if (resolved !== control.kind) {
    if (!control.properties.originalKind) control.properties.originalKind = control.kind;
    control.kind = resolved;
  }
  for (const child of control.children) resolveControlKind(child as MutableControl, baseKindMap);
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
