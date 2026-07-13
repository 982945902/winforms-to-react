import type { ProjectIR, VisualControl } from "./types.js";

export type TargetField = {
  name: string;
  label: string;
  kind: string;
  required: boolean;
};

export type TargetAction = {
  name: string;
  label: string;
  event: string;
  handler: string;
};

export type TargetTable = {
  name: string;
  columns: Array<{ name: string; label: string; dataField?: string }>;
};

export type TargetPage = {
  id: string;
  title: string;
  route: string;
  sourcePath: string;
  fields: TargetField[];
  actions: TargetAction[];
  tables: TargetTable[];
  componentRefs: string[];
  contractCount: number;
};

export type TargetManifest = {
  pages: TargetPage[];
  sharedComponents: Array<{
    id: string;
    status: "resolved" | "external";
    instanceCount: number;
    fields: TargetField[];
    actions: TargetAction[];
    tables: TargetTable[];
    componentRefs: string[];
    contractCount: number;
  }>;
  totals: {
    pages: number;
    fields: number;
    actions: number;
    tables: number;
    contracts: number;
    sharedComponentTypes: number;
    sharedComponentInstances: number;
    sharedComponentFields: number;
    sharedComponentActions: number;
    sharedComponentTables: number;
    sharedComponentContracts: number;
  };
};

const FIELD_KINDS = new Set([
  "TextBox", "RichTextBox", "MaskedTextBox", "ComboBox", "DateTimePicker",
  "NumericUpDown", "DomainUpDown", "CheckBox", "RadioButton", "TrackBar",
]);
const ACTION_KINDS = new Set([
  "Button", "LinkLabel", "ToolStripButton", "ToolStripDropDownButton",
  "ToolStripSplitButton", "ToolStripMenuItem",
]);

export function buildTargetManifest(project: ProjectIR): TargetManifest {
  const pages = project.pages.map((page) => {
    const { fields, actions, tables, componentRefs } = analyzeControls(page.controls);

    return {
      id: safeId(page.name),
      title: page.text ?? page.name,
      route: `/migration/${safeId(page.name)}`,
      sourcePath: page.sourcePath,
      fields,
      actions,
      tables,
      componentRefs,
      contractCount: page.support.contractPoints.length,
    };
  });

  const sharedComponents = project.components.map((component) => ({
    id: component.id,
    status: component.status,
    instanceCount: component.instanceCount,
    ...analyzeControls(component.controls),
    contractCount: component.support?.contractPoints.length ?? 0,
  }));

  return {
    pages,
    sharedComponents,
    totals: {
      pages: pages.length,
      fields: sum(pages, (page) => page.fields.length),
      actions: sum(pages, (page) => page.actions.length),
      tables: sum(pages, (page) => page.tables.length),
      contracts: sum(pages, (page) => page.contractCount),
      sharedComponentTypes: project.components.length,
      sharedComponentInstances: sum(project.components, (component) => component.instanceCount),
      sharedComponentFields: sum(sharedComponents, (component) => component.fields.length),
      sharedComponentActions: sum(sharedComponents, (component) => component.actions.length),
      sharedComponentTables: sum(sharedComponents, (component) => component.tables.length),
      sharedComponentContracts: sum(sharedComponents, (component) => component.contractCount),
    },
  };
}

function analyzeControls(root: VisualControl[]): {
  fields: TargetField[];
  actions: TargetAction[];
  tables: TargetTable[];
  componentRefs: string[];
} {
  const controls = flatten(root);
  const labels = new Map(
    controls
      .filter((control) => control.kind === "Label" && control.text)
      .map((control) => [stripPrefix(control.name, "lbl"), control.text!] as const),
  );
  const fields = controls
    .filter((control) => FIELD_KINDS.has(control.kind))
    .map((control) => ({
      name: control.name,
      label: labels.get(stripPrefix(control.name, "txt"))
        ?? labels.get(stripPrefix(control.name, "cmb"))
        ?? control.text
        ?? humanize(control.name),
      kind: control.kind,
      required: false,
    }));
  const actions = controls.flatMap((control) => {
    if (!ACTION_KINDS.has(control.kind)) return [];
    return control.events.map((event) => ({
      name: control.name,
      label: control.text ?? humanize(control.name),
      event: event.event,
      handler: event.handler,
    }));
  });
  const tables = controls
    .filter((control) => control.kind === "DataGridView" || control.kind === "ListView")
    .map((control) => ({
      name: control.name,
      columns: (control.columns ?? []).map((column) => ({
        name: column.name,
        label: column.headerText ?? humanize(column.name),
        dataField: column.dataPropertyName,
      })),
    }));
  const componentRefs = [...new Set(
    controls.map((control) => control.componentRef).filter((ref): ref is string => Boolean(ref)),
  )].sort();
  return { fields, actions, tables, componentRefs };
}

function flatten(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flatten(control.children)]);
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").toLowerCase();
}

function humanize(value: string): string {
  return value
    .replace(/^(btn|txt|cmb|lbl|chk|dgv|grid)/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim() || value;
}

function stripPrefix(value: string, prefix: string): string {
  return value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length).toLowerCase() : value.toLowerCase();
}

function sum<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}
