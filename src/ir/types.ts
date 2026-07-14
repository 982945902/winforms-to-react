export type VisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualSize = {
  width: number;
  height: number;
};

export type MigrationHint = {
  handler: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  calledSymbols: string[];
};

export type VisualEvent = {
  event: string;
  handler: string;
  migrationHint?: MigrationHint;
};

export type NavEdge = {
  target: string;
  modal: boolean;
  fromHandler?: string;
};

export type BindingInfo = {
  controlName: string;
  dataSource: string;
  boundProperty?: string;
  kind: string;
};

export type ContractPoint = MigrationHint & {
  controlName: string;
  event: string;
};

export type VisualColumn = {
  name: string;
  headerText?: string;
  width?: number;
  kind: string;
  // DataGridView column -> bound data field (a binding contract point).
  dataPropertyName?: string;
};

// TableLayoutPanel row/column sizing. SizeType: Absolute|Percent|AutoSize.
export type VisualTableSizing = {
  type: "Absolute" | "Percent" | "AutoSize";
  value?: number;
};

export type VisualTableLayout = {
  columns: VisualTableSizing[];
  rows: VisualTableSizing[];
  // Cell coordinates for each child control name: [column, row]
  cells: Record<string, [number, number]>;
  columnSpan?: Record<string, number>;
  rowSpan?: Record<string, number>;
};

// Normalized representation of System.Drawing.Font used by WinForms controls.
export type VisualFont = {
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  unit?: string;
};

// Normalized representation of System.Drawing.Color. CssColor is a CSS color
// string (named color, hex, rgb()) usable directly in style attributes.
export type VisualColor = {
  cssColor: string;
  name?: string;
};

// Horizontal/vertical content alignment derived from ContentAlignment enums
// (TopLeft/TopCenter/.../BottomRight) used by Label/Button/CheckBox/etc.
export type VisualContentAlignment = {
  horizontal: "Left" | "Center" | "Right";
  vertical: "Top" | "Middle" | "Bottom";
};

// BorderStyle: None/FixedSingle/Fixed3D mapped to a normalized enum.
export type VisualBorderStyle = "None" | "FixedSingle" | "Fixed3D";

// Normalized padding/margin box (Left/Top/Right/Bottom from WinForms).
export type VisualPadding = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Visual properties that WinForms Designer files commonly set and that the
// renderer can faithfully translate to CSS. Anything not enumerated here falls
// back to the generic `properties` bag.
export type VisualAppearance = {
  font?: VisualFont;
  foreColor?: VisualColor;
  backColor?: VisualColor;
  enabled?: boolean;
  visible?: boolean;
  borderStyle?: VisualBorderStyle;
  textAlign?: VisualContentAlignment;
  imageKey?: string;
  image?: string;
  padding?: VisualPadding;
  margin?: VisualPadding;
  rightToLeft?: boolean;
  maximumSize?: VisualSize;
  minimumSize?: VisualSize;
  flatStyle?: string;
  // Control state captured from Designer assignments.
  checked?: boolean;
  checkState?: string;
  threeState?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  passwordChar?: string;
  maxLength?: number;
  placeholderText?: string;
  dropDownStyle?: string;
  selectedIndex?: number;
  value?: string | number;
  minimum?: number;
  maximum?: number;
  increment?: number;
  format?: string;
  customFormat?: string;
  wordWrap?: boolean;
  scrollBars?: string;
  checkedBoxes?: boolean;
  style?: string;
  view?: string;
  mask?: string;
  imageLocation?: string;
  sizeMode?: string;
  // PrintPreviewControl
  rows?: number;
  zoom?: number;
  autoZoom?: boolean;
  // WebBrowser
  url?: string;
  checkAlign?: VisualContentAlignment;
  imageAlign?: VisualContentAlignment;
  appearanceStyle?: string;
};

export type RuntimeItemSource = {
  kind: "enum" | "list";
  typeName?: string;
  expression: string;
  sourceFile: string;
  line: number;
};

export type RuntimeValueProperty = "text" | "checked" | "enabled" | "readOnly" | "placeholderText" | "selectedIndex" | "selectedItem" | "value";

// A public property on a reusable UserControl can be a thin facade over one of
// its child controls (for example `Mode { set { combo.SelectedIndex =
// (int)value; } }`). Preserve that relationship once on the component
// definition so every host instance can supply its own value without cloning
// the component tree into each page.
export type ComponentPropertyBinding = {
  sourceProperty: string;
  targetControlName: string;
  targetProperty: RuntimeValueProperty | "visible";
  negated?: boolean;
  sourceFile: string;
  line: number;
};

// A control value reached by a statically proven parameterless UserControl
// constructor path. This is deliberately narrower than arbitrary C# execution:
// only source literals, unique Resources strings, colors, and constant
// if/switch branches are materialized.
export type ComponentInitializationDefault = {
  targetControlName: string;
  targetProperty: RuntimeValueProperty | "visible" | "foreColor" | "backColor";
  value: string | number | boolean | VisualColor;
  expression: string;
  sourceFile: string;
  line: number;
  methodName: string;
  condition?: string;
};

// A code-behind assignment performed during constructor/Load/Shown
// initialization. Model-backed values remain source contracts unless a
// literal or a configuration-class default can be proven from project context.
export type RuntimeValueSource = {
  property: RuntimeValueProperty;
  expression: string;
  sourceFile: string;
  line: number;
  methodName: string;
  modelType?: string;
  memberPath?: string[];
  negated?: boolean;
  conditional?: boolean;
  literalValue?: string | number | boolean;
  resolvedDefault?: string | number | boolean;
};

export type RuntimeAssetSource = {
  property: "image" | "imageKey";
  value: string;
  expression: string;
  sourceFile: string;
  line: number;
};

// Static metadata for a PropertyGrid.SelectedObject type. Values are limited
// to literals/defaults that can be proven from attributes, property
// initializers, or the parameterless constructor; runtime records are never
// invented by the migration preview.
export type PropertyGridField = {
  name: string;
  label: string;
  typeName: string;
  category?: string;
  description?: string;
  defaultValue?: string | number | boolean;
  password?: boolean;
  readOnly?: boolean;
  hasEditor?: boolean;
  instantiated?: boolean;
};

export type PropertyGridObjectSource = {
  typeName?: string;
  expression: string;
  sourceFile: string;
  line: number;
  fields?: PropertyGridField[];
};

export type VisualControl = {
  kind: string;
  name: string;
  // Declared C# type before inheritance normalization (for example
  // OpenDental.UI.Button -> kind Button). Exporters can select a shared visual
  // adapter without losing the neutral base-control role.
  sourceType?: string;
  text?: string;
  bounds?: VisualBounds;
  dock?: string;
  anchor?: string[];
  tabIndex?: number;
  autoSize?: boolean;
  appearance: VisualAppearance;
  properties: Record<string, unknown>;
  events: VisualEvent[];
  columns?: VisualColumn[];
  tableLayout?: VisualTableLayout;
  // FlowLayoutPanel flow direction (default LeftToRight).
  flowDirection?: string;
  wrapContents?: boolean;
  // SplitContainer: which child controls belong to Panel1 vs Panel2.
  panel1Children?: string[];
  panel2Children?: string[];
  // ToolStripContainer: child controls per panel.
  topToolStripChildren?: string[];
  bottomToolStripChildren?: string[];
  leftToolStripChildren?: string[];
  rightToolStripChildren?: string[];
  contentPanelChildren?: string[];
  orientation?: string;
  splitterDistance?: number;
  // TreeView nested node hierarchy.
  treeRootNodes?: string[];
  treeNodeTexts?: Record<string, string>; // Variable name -> display text          // Names of root-level tree nodes
  treeNodeChildren?: Record<string, string[]>; // Parent node name -> child node names
  items?: string[];
  // A control may be populated by more than one code-behind call. Preserve all
  // sources; resolved enum labels are materialized into `items` separately.
  itemSources?: RuntimeItemSource[];
  // Initialization-time code-behind assignments. Resolved defaults are
  // materialized separately so later backend migration keeps the dependency.
  runtimeValueSources?: RuntimeValueSource[];
  runtimeAssetSources?: RuntimeAssetSource[];
  // Code-behind SelectedObject assignment plus optional context-resolved type
  // metadata used by the native PropertyGrid preview.
  propertyGridSource?: PropertyGridObjectSource;
  customProperties?: Array<{ name: string; type: string }>;
  // Reference to a shared custom/UserControl definition in ProjectIR.
  // Compatibility conversion may still inline controls, but target exporters
  // preserve this reference so one component type is mapped exactly once.
  componentRef?: string;
  children: VisualControl[];
};

export type NormalizedLayoutRole = "content" | "toolbar" | "actions" | "status";

// Target-neutral layout semantics derived from WinForms container metadata.
// Nodes reference controls by name so component definitions remain shared and
// target generators do not need to duplicate or rewrite the control tree.
export type NormalizedLayoutNode = {
  id: string;
  kind: "control" | "split" | "stack" | "grid" | "tabs" | "layers" | "frame" | "empty";
  role?: NormalizedLayoutRole;
  controlName?: string;
  label?: string;
  axis?: "horizontal" | "vertical";
  ratio?: number;
  children?: NormalizedLayoutNode[];
  alternatives?: string[];
  columns?: string[];
  rows?: string[];
  selectedIndex?: number;
  runtimeTabs?: Array<{
    id: string;
    label: string;
    imageKey?: string;
    viewKind: "terminal" | "placeholder";
  }>;
  cells?: Array<{
    column: number;
    row: number;
    columnSpan?: number;
    rowSpan?: number;
    node: NormalizedLayoutNode;
  }>;
};

export type NormalizedLayoutPlan = {
  version: 1;
  strategy: "semantic-web";
  sourceSize?: VisualSize;
  root: NormalizedLayoutNode;
  diagnostics: {
    stateAlternatives: number;
    excludedPopups: string[];
    runtimeReparents?: Array<{ controlName: string; target: string }>;
    runtimeTabs?: Array<{ controlName: string; target: string; label: string }>;
  };
};

export type RuntimeReparentHint = {
  kind: "reparent";
  controlName: string;
  parentControlName: string;
  panel: 1 | 2;
  sourceFile: string;
  line: number;
};

export type RuntimeTabHint = {
  kind: "add-tab";
  controlName: string;
  parentControlName: string;
  label: string;
  imageKey?: string;
  viewKind: "terminal" | "placeholder";
  sourceFile: string;
  line: number;
};

export type RuntimeLayoutHint = RuntimeReparentHint | RuntimeTabHint;

export type RuntimeVisibilityVariant = {
  label: string;
  hiddenControls: string[];
  shownControls: string[];
};

export type RuntimeVisibilityGroup = {
  condition: string;
  defaultVariant: number;
  variants: RuntimeVisibilityVariant[];
  sourceFile: string;
  line: number;
};

// A narrow, source-proven UI dependency from a wired event handler, such as
// `details.Enabled = includeDetails.Checked`. This is presentation state, not
// migrated business logic: only direct control-property reads (optionally
// negated) are retained.
export type RuntimeControlStateProperty = "checked" | "enabled" | "readOnly" | "visible";

export type RuntimeControlBinding = {
  triggerControlName: string;
  triggerEvent: string;
  handler: string;
  sourceControlName: string;
  sourceProperty: RuntimeControlStateProperty;
  targetControlName: string;
  targetProperty: RuntimeControlStateProperty;
  negated?: boolean;
  sourceFile: string;
  line: number;
};

// Code-behind adapters such as ShareX TabToTreeView consume an existing
// TabControl and present its pages through a separate navigation surface.
// Preserve the relationship without depending on the custom control type.
export type RuntimeTabNavigator = {
  navigatorControlName: string;
  tabControlName: string;
  property: string;
  sourceFile: string;
  line: number;
};

export type EventStub = {
  controlName: string;
  event: string;
  handler: string;
};

export type ControlSupportStatus = "supported" | "degraded" | "unknown";

export type ControlCoverageByKind = {
  kind: string;
  count: number;
  status: ControlSupportStatus;
};

export type ControlCoverage = {
  total: number;
  supported: number;
  degraded: number;
  unknown: number;
  supportedPercent: number;
  previewablePercent: number;
  unknownPercent: number;
  byKind: ControlCoverageByKind[];
};

export type FormSupportSummary = {
  controlsConverted: number;
  supportedControls: string[];
  degradedControls: string[];
  unknownControls: string[];
  controlCoverage: ControlCoverage;
  eventStubs: EventStub[];
  contractPoints: ContractPoint[];
};

export type FormReportSummary = {
  name: string;
  title?: string;
  sourcePath: string;
  support: FormSupportSummary;
};

export type VisualForm = {
  kind: "Form";
  name: string;
  baseType?: string;
  baseTypes?: string[];
  sourcePath: string;
  support: FormSupportSummary;
  text?: string;
  clientSize?: VisualSize;
  autoScaleDimensions?: VisualSize;
  formBorderStyle?: string;
  startPosition?: string;
  windowState?: string;
  opacity?: number;
  acceptButton?: string;
  cancelButton?: string;
  icon?: string;
  backgroundImage?: string;
  maximizeBox?: boolean;
  minimizeBox?: boolean;
  controlBox?: boolean;
  controls: VisualControl[];
  layout?: NormalizedLayoutPlan;
  properties: Record<string, unknown>;
  events?: VisualEvent[];
  navigations?: NavEdge[];
  bindings?: BindingInfo[];
  runtimeLayoutHints?: RuntimeLayoutHint[];
  runtimeVisibilityGroups?: RuntimeVisibilityGroup[];
  runtimeControlBindings?: RuntimeControlBinding[];
  runtimeTabNavigators?: RuntimeTabNavigator[];
};

export type MigrationReport = {
  sourceFiles: string[];
  forms: FormReportSummary[];
  formsConverted: number;
  controlsConverted: number;
  supportedControls: string[];
  degradedControls: string[];
  unknownControls: string[];
  controlCoverage: ControlCoverage;
  eventStubs: EventStub[];
};

export type ParseResult = {
  form: VisualForm;
  controlsByName: Map<string, VisualControl>;
  report: MigrationReport;
};

export type ComponentDefinition = {
  id: string;
  typeName: string;
  sourcePath?: string;
  status: "resolved" | "external";
  clientSize?: VisualSize;
  controls: VisualControl[];
  propertyBindings?: ComponentPropertyBinding[];
  initializationDefaults?: ComponentInitializationDefault[];
  layout?: NormalizedLayoutPlan;
  instanceCount: number;
  support?: FormSupportSummary;
  bindings?: BindingInfo[];
};

export type ProjectAsset = {
  key: string;
  sourcePath?: string;
  contentBase64?: string;
  targetFileName: string;
};

export type ProjectIR = {
  schemaVersion: 1;
  sourceRoot: string;
  pages: VisualForm[];
  components: ComponentDefinition[];
  assets: ProjectAsset[];
  report: MigrationReport;
};
