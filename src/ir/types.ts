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

export type VisualControl = {
  kind: string;
  name: string;
  text?: string;
  bounds?: VisualBounds;
  dock?: string;
  anchor?: string[];
  tabIndex?: number;
  autoSize?: boolean;
  properties: Record<string, unknown>;
  events: VisualEvent[];
  columns?: VisualColumn[];
  items?: string[];
  children: VisualControl[];
};

export type VisualForm = {
  kind: "Form";
  name: string;
  sourcePath: string;
  text?: string;
  clientSize?: VisualSize;
  autoScaleDimensions?: VisualSize;
  controls: VisualControl[];
  properties: Record<string, unknown>;
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

export type MigrationReport = {
  sourceFiles: string[];
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
