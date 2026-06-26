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

export type VisualEvent = {
  event: string;
  handler: string;
};

export type VisualColumn = {
  name: string;
  headerText?: string;
  width?: number;
  kind: string;
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
  threeState?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  passwordChar?: string;
  maxLength?: number;
  dropDownStyle?: string;
  selectedIndex?: number;
  value?: string | number;
  minimum?: number;
  maximum?: number;
  format?: string;
  wordWrap?: boolean;
  scrollBars?: string;
  // ListView/TabControl view mode (Details/List/SmallIcon/LargeIcon/Tile).
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

export type VisualControl = {
  kind: string;
  name: string;
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
  items?: string[];
  children: VisualControl[];
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
  controls: VisualControl[];
  properties: Record<string, unknown>;
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
