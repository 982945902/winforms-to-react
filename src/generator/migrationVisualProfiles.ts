import type { ProjectIR, VisualControl, VisualForm } from "../ir/types.js";
import { emptyWorkspacePreviewFixture, gitExtensionsWorkspaceFixture } from "./migrationVisualProfileFixtures.js";

type PageVisualProfile = "gitextensions-workspace" | "opendental";

const gitComponentAdapters: Record<string, string> = {
  TextEditorControl: "diff",
  RevisionDiffControl: "revision-diff",
  RevisionGridControl: "revision-grid",
  RepoObjectsTree: "repository-tree",
  CommitInfo: "commit-info",
  RevisionGpgInfoControl: "signature-info",
  InteractiveGitActionControl: "action-progress",
  FilterToolBar: "filter-toolbar",
  MenuStripEx: "menu-strip",
  ToolStripEx: "tool-strip",
};

const openDentalComponentAdapters: Record<string, string> = {
  GridOD: "data-grid",
  MenuOD: "menu-bar",
};

export function migrationComponentAdapters(project: ProjectIR): Record<string, string> {
  const hasWorkspaceProfile = project.pages.some((page) => detectPageProfile(page) === "gitextensions-workspace");
  const hasOpenDentalProfile = project.pages.some((page) => detectPageProfile(page) === "opendental");
  const entries: Array<[string, string]> = [];
  for (const component of project.components) {
    const adapter = hasWorkspaceProfile ? gitComponentAdapters[component.id] : undefined;
    const openDentalAdapter = hasOpenDentalProfile ? openDentalComponentAdapters[component.id] : undefined;
    const selected = adapter || openDentalAdapter;
    if (selected) entries.push([component.id, selected]);
  }
  return Object.fromEntries(entries);
}

export function migrationVisualProfilesTsx(project: ProjectIR): string {
  const pageProfiles = new Map<string, PageVisualProfile>();
  for (const page of project.pages) {
    const profile = detectPageProfile(page);
    if (profile) pageProfiles.set(page.name, profile);
  }

  const openDentalPageControls = project.pages
    .filter((page) => pageProfiles.get(page.name) === "opendental")
    .flatMap((page) => flattenControls(page.controls));
  const openDentalTypes = [...new Set(openDentalPageControls
    .map((control) => normalizeSourceType(control.sourceType))
    // OpenDental source commonly imports `OpenDental.UI` as `UI`, so Designer
    // declarations may retain either `UI.Button` or `OpenDental.UI.Button`.
    // Scope the short form to a page already identified by its FormODBase chain.
    .filter((typeName) => /^(?:OpenDental\.|UI\.)/.test(typeName)))]
    .sort();
  const hasWorkspaceProfile = [...pageProfiles.values()].includes("gitextensions-workspace");
  const hasOpenDentalProfile = [...pageProfiles.values()].includes("opendental");
  const componentAdapters = migrationComponentAdapters(project);
  const workspaceFixture = hasWorkspaceProfile ? gitExtensionsWorkspaceFixture() : emptyWorkspacePreviewFixture();
  const pageProfileDefinitions: Record<string, Record<string, unknown>> = {};
  if (hasWorkspaceProfile) pageProfileDefinitions["gitextensions-workspace"] = {
      layoutMode: "semantic", canvasMode: "workspace", presentationClass: "native-workspace-form",
      titleFromWorkspace: true, appIconImageKey: "GitLogo16", appIconFallback: "↗",
      keyboardShortcuts: true, treeRole: "file-status",
    };
  if (hasOpenDentalProfile) pageProfileDefinitions.opendental = {
      layoutMode: "fixed", canvasMode: "fixed-padded", presentationClass: "native-fixed-form native-od-form",
      titlebarClass: "native-od-titlebar",
    };
  const controlVisualClasses = openDentalTypes.map((typeName) => [typeName, {
    Button: typeName.endsWith(".Button") ? "native-od-button" : "",
    ComboBox: typeName.endsWith(".ComboBox") ? "native-od-combo" : "",
    GroupBox: typeName.endsWith(".GroupBox") ? "native-od-groupbox" : "",
    ListBox: typeName.endsWith(".ListBox") ? "native-od-list-box" : "",
    TabControl: typeName.endsWith(".TabControl") ? "native-od-tabs" : "",
  }]);

  const profileComponents = openDentalProfileComponents(openDentalTypes);
  return `import React from "react";

type Control = any;
export type ProfileVisualProps = {
  control: Control;
  style?: React.CSSProperties;
  text?: string;
  label?: string;
  items?: string[];
  selected?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const pageProfiles = new Map<string, string>(${JSON.stringify([...pageProfiles], null, 2)});
const controlProfiles = new Map<string, string>(${JSON.stringify(openDentalTypes.map((typeName) => [typeName, "opendental"]), null, 2)});
const componentAdapters = new Map<string, string>(${JSON.stringify(Object.entries(componentAdapters), null, 2)});
export const workspacePreviewFixture: any = ${JSON.stringify(workspaceFixture, null, 2)};

const pageProfileDefinitions: Record<string, any> = ${JSON.stringify(pageProfileDefinitions, null, 2)};
const controlVisualClasses = new Map<string, Record<string, string>>(${JSON.stringify(controlVisualClasses, null, 2)});

export function pageVisualProfile(page: any): any {
  return pageProfileDefinitions[pageProfiles.get(String(page?.name || "")) || ""] || {
    layoutMode: "fixed", canvasMode: "fixed", presentationClass: "native-fixed-form",
  };
}

export function controlVisualClass(control: Control, slot: string): string {
  return controlVisualClasses.get(normalizeSourceType(control?.sourceType))?.[slot] || "";
}

export function profileControlText(control: Control): string | undefined {
  return workspacePreviewFixture.controlText?.[String(control?.name || "")];
}

export function profileControlGlyph(control: Control): string {
  const name = String(control?.name || "");
  const entry = (workspacePreviewFixture.controlGlyphs || []).find((item: any) => new RegExp(item.pattern, "i").test(name));
  return entry?.glyph || "";
}

export function profileToolbarShowsText(control: Control): boolean {
  const name = String(control?.name || "");
  return (workspacePreviewFixture.toolbarTextPatterns || []).some((pattern: string) => new RegExp(pattern, "i").test(name));
}

export function pageUsesVisualProfile(page: any, profile: string): boolean {
  return pageProfiles.get(String(page?.name || "")) === profile;
}

export function controlUsesVisualProfile(control: Control, profile: string, typeName?: string): boolean {
  const sourceType = normalizeSourceType(control?.sourceType);
  return controlProfiles.get(sourceType) === profile
    && (!typeName || sourceType === typeName || sourceType.endsWith("." + typeName));
}

export function componentVisualAdapter(componentId: string, control: Control): string | undefined {
  const adapter = componentAdapters.get(componentId);
  if (adapter === "revision-diff" && /filetree/i.test(String(control?.name || ""))) return "file-tree";
  return adapter;
}

function normalizeSourceType(value: unknown): string {
  return String(value || "").replace(/^global::/, "");
}

${profileComponents.source}

const profileVisualComponents = new Map<string, React.ComponentType<ProfileVisualProps>>([
${profileComponents.entries}
]);

export function profileVisualComponent(control: Control): React.ComponentType<ProfileVisualProps> | undefined {
  return profileVisualComponents.get(normalizeSourceType(control?.sourceType));
}
`;
}

export function migrationVisualProfileStylesCss(project: ProjectIR): string {
  if (!project.pages.some((page) => detectPageProfile(page) === "opendental")) return "";
  return `
.native-od-form { font: 11px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.native-od-form .migration-canvas { border: 1px solid #000; background: #415e9a; }
.native-od-form .native-od-titlebar { position: relative; z-index: 4; flex: 0 0 25px; height: 25px; gap: 5px; padding-left: 4px; overflow: visible; color: #fff; background: #415e9a; border: 0; font: 11px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.native-od-form .native-od-titlebar .native-app-icon { flex-basis: 20px; width: 20px; height: 20px; margin-top: 1px; }
.native-od-form .native-od-titlebar .native-app-icon img { width: 20px; height: 20px; }
.native-od-form .native-od-titlebar .native-window-buttons { position: absolute; z-index: 5; top: 4px; right: 14px; height: 25px; margin: 0; }
.native-od-form .native-od-titlebar .native-window-buttons button { position: relative; width: 30px; height: 25px; color: #fff; background: transparent; font: 12px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.native-od-form .native-od-titlebar .native-window-buttons button:hover { color: #fff; background: #6880a3; }
.native-od-form .native-od-titlebar .native-window-buttons button[aria-label="Close"] { color: transparent; font-size: 0; }
.native-od-form .native-od-titlebar .native-window-buttons button[aria-label="Close"]:hover { background: #e81123; }
.native-od-form .native-od-titlebar .native-window-buttons button[aria-label="Close"]::before,
.native-od-form .native-od-titlebar .native-window-buttons button[aria-label="Close"]::after { position: absolute; top: 12px; left: 9px; width: 13px; height: 1.5px; content: ""; background: #fff; transform: rotate(45deg); }
.native-od-form .native-od-titlebar .native-window-buttons button[aria-label="Close"]::after { transform: rotate(-45deg); }
.native-od-form .native-window-body { padding: 0 4px 4px; background: #415e9a; }
.native-od-form .native-fixed-client { background: #fcfdfe; --wf-control-surface: #fcfdfe; }
.native-od-form .native-absolute-tab-page { --wf-control-surface: #f0f0f0; }
.native-od-form :is(.migration-label,.migration-check,.native-command-button.ant-btn,.native-icon-button.ant-btn,.migration-list,.native-tabs) { font: inherit; }
.native-od-form .native-od-button.ant-btn { padding: 0 3px; color: #000; border: 1px solid #1c5180; border-radius: 3px; background: linear-gradient(#fff,#e1e8eb); box-shadow: none; text-shadow: .5px .5px #fff; }
.native-od-form .native-od-button.ant-btn:hover,
.native-od-form .native-od-button.ant-btn:focus-visible { color: #000; border-color: #006ebe; background: linear-gradient(#fff,#e1e8eb); box-shadow: inset 0 0 0 .7px #006ebe; }
.native-od-form .native-od-button.ant-btn:active { background: linear-gradient(#fff,#afb9be); }
.native-od-form .native-od-button.ant-btn:disabled { color: #a1a192; border-color: #1c5180; background: linear-gradient(#fff,#e1e8eb); }
.native-od-form .native-od-groupbox { border: 0; border-radius: 4px; background: var(--wf-control-surface); box-shadow: inset 0 0 0 1px #c0c0c0; }
.native-od-form .native-od-groupbox > .migration-container-title { top: 1px; left: 5px; padding: 0; background: transparent; line-height: normal; }
.native-od-form .native-od-list-box { padding: 2px; border: 0; background: #fff; box-shadow: inset 0 0 0 1px #708090; }
.native-od-form .native-od-list-box .native-list-box-item { min-height: 13px; padding: 0; border: 0; line-height: 13px; }
.native-od-form .native-od-list-box .native-list-box-item.selected { color: #000; background: #bac7db; }
.native-od-form .native-od-list-box .native-list-box-item:not(.selected):hover { background: #e5effb; }
.native-od-form .native-od-combo.ant-select .ant-select-selector { border-color: #adadad !important; border-radius: 0 !important; background: #fff !important; }
.native-od-form .native-od-combo.ant-select:hover .ant-select-selector,
.native-od-form .native-od-combo.ant-select-focused .ant-select-selector { border-color: #0078d7 !important; background: #e5f1fb !important; }
.native-od-form .native-od-combo.ant-select-disabled .ant-select-selector { color: #6d6d6d !important; background: #ccc !important; }
.native-od-form .native-od-combo .ant-select-arrow { color: #141414; }
.native-od-form .native-od-tabs { border: 0; background: var(--wf-control-surface); }
.native-od-form .native-od-tabs::before { position: absolute; z-index: 0; top: 19px; right: 0; bottom: 0; left: 0; content: ""; border: 1px solid #c0c0c0; pointer-events: none; }
.native-od-form .native-od-tabs .native-tab-list { position: relative; z-index: 2; flex: 0 0 20px; align-items: flex-start; gap: 0; height: 20px; padding: 0 2px; border: 0; background: var(--wf-control-surface); overflow: visible; }
.native-od-form .native-od-tabs .native-tab-list button { min-width: 0; height: 17px; margin-top: 2px; padding: 0 4px; color: #000; border: 1px solid #c0c0c0; border-radius: 3px 3px 0 0; background: #f5f5f5; line-height: normal; }
.native-od-form .native-od-tabs .native-tab-list button:hover:not(:disabled) { background: #e5effb; }
.native-od-form .native-od-tabs .native-tab-list button.active { z-index: 3; height: 19px; margin: 0 -2px -1px; background: #aabee6; }
.native-od-form .native-od-tabs .native-tab-list button:disabled { color: #aaa; }
.native-od-form .native-od-tabs .native-absolute-tab-page { z-index: 1; margin: 1px 2px 2px; background: #f0f0f0; }
.native-od-checkbox { display: flex; align-items: center; gap: 3px; min-height: 0; padding: 0; color: #000; line-height: normal; cursor: default; }
.native-od-checkbox.check-right { flex-direction: row-reverse; }
.native-od-checkbox > input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; }
.native-od-checkbox .native-od-check-box { position: relative; flex: 0 0 12px; width: 12px; height: 12px; box-sizing: border-box; border: 1px solid #323232; background: #fff; }
.native-od-checkbox:hover .native-od-check-box { background: #d2efff; }
.native-od-checkbox > input:focus-visible + .native-od-check-box { outline: 1px dotted #111; outline-offset: 1px; }
.native-od-checkbox > input:checked + .native-od-check-box::after { position: absolute; top: 0; left: 3px; width: 4px; height: 8px; content: ""; border: solid #5a5a5a; border-width: 0 1.6px 1.6px 0; transform: rotate(45deg); }
.native-od-checkbox .native-od-check-box.indeterminate::after { position: absolute; inset: 2px; content: ""; background: #323232; }
.native-od-checkbox.disabled { color: #6d6d6d; }
.native-od-checkbox.disabled .native-od-check-box { border-color: #b4b4b4; background: #fff; }
.native-od-checkbox .native-od-check-text { min-width: 0; overflow: hidden; white-space: nowrap; }
.native-od-form .semantic-od-date-input { position: relative; min-height: 0; border: 0; background: transparent; }
.native-od-form .semantic-od-date-input input { position: absolute; top: 1px; left: 63px; width: 102px; height: 20px; padding: 1px 18px 1px 3px; border: 1px solid #8e969e; background: #fff; }
.native-od-form .semantic-od-date-input button { position: absolute; top: 2px; left: 148px; width: 16px; height: 18px; padding: 0; border: 0; background: #fff; }
.native-od-form .semantic-od-date-input button:hover:not(:disabled) { background: #dcdcdc; }
.native-od-form .semantic-od-date-input button:active:not(:disabled) { background: #c0c0c0; }
.native-od-form .semantic-od-date-input button span { display: block; color: #141414; font: 9px "Microsoft Sans Serif","Segoe UI",sans-serif; transform: translateY(-1px); }
.native-od-form .semantic-od-date-input input:disabled,
.native-od-form .semantic-od-date-input input[readonly] { color: #6d6d6d; background: #f0f0f0; }
.native-od-form .semantic-combo-input { appearance: none; padding-right: 18px; border-color: #adadad; background-color: #fff; background-image: linear-gradient(45deg,transparent 50%,#141414 50%),linear-gradient(135deg,#141414 50%,transparent 50%); background-position: calc(100% - 8px) 50%,calc(100% - 4px) 50%; background-repeat: no-repeat; background-size: 4px 4px,4px 4px; }
.native-od-form .semantic-combo-input:hover,
.native-od-form .semantic-combo-input:focus { border-color: #0078d7; background-color: #e5f1fb; outline: 0; }
.native-od-form .semantic-combo-input:disabled { color: #6d6d6d; background-color: #ccc; }
.native-od-form .semantic-od-clinic-picker { display: flex; width: 100%; height: 100%; min-height: 21px; color: #000; font: inherit; }
.native-od-form .semantic-od-clinic-label { flex: 0 0 37px; width: 37px; padding: 3px 0 0 2px; overflow: hidden; white-space: nowrap; }
.native-od-form .semantic-od-clinic-select { flex: 1 1 auto; min-width: 0; height: calc(100% - 1px); }
`;
}

function detectPageProfile(page: VisualForm): PageVisualProfile | undefined {
  if (page.name === "FormBrowse" && flattenControls(page.controls).some((control) =>
    control.componentRef && control.componentRef in gitComponentAdapters)) return "gitextensions-workspace";
  if (page.baseTypes?.includes("FormODBase") || flattenControls(page.controls).some((control) =>
    /^OpenDental\./.test(normalizeSourceType(control.sourceType)))) return "opendental";
  return undefined;
}

function openDentalProfileComponents(sourceTypes: string[]): { source: string; entries: string } {
  const has = (suffix: string) => sourceTypes.some((typeName) => typeName.endsWith(`.${suffix}`));
  const components: string[] = [];
  const entries: string[] = [];
  if (has("ODDatePicker")) {
    components.push(`function OpenDentalDateInput({ control, label }: ProfileVisualProps) {
  return <span className="semantic-date-input semantic-od-date-input"><input aria-label={label} defaultValue={String(control.text || "")}
    readOnly={control.appearance?.readOnly === true} disabled={control.appearance?.enabled === false} />
    <button type="button" disabled={control.appearance?.enabled === false || control.appearance?.readOnly === true} title="Open calendar" aria-label="Open calendar"><span aria-hidden="true">▾</span></button></span>;
}`);
    entries.push(...sourceTypes.filter((typeName) => typeName.endsWith(".ODDatePicker"))
      .map((typeName) => `  [${JSON.stringify(typeName)}, OpenDentalDateInput],`));
  }
  if (has("ComboBoxClinicPicker")) {
    components.push(`function OpenDentalClinicPicker({ control, label, items = [], selected = "" }: ProfileVisualProps) {
  const showLabel = control.properties?.ShowLabel !== false;
  const clinicLabel = control.properties?.IsMultiSelect === true ? "Clinics" : "Clinic";
  return <span className={"semantic-od-clinic-picker" + (showLabel ? " has-label" : "")}>
    {showLabel && <span className="semantic-od-clinic-label">{clinicLabel}</span>}
    <select className="semantic-combo-input semantic-od-clinic-select" aria-label={label} disabled={control.appearance?.enabled === false} defaultValue={selected}>
      <option value=""> </option>{items.map((item) => <option key={item} value={item}>{item}</option>)}</select>
  </span>;
}`);
    entries.push(...sourceTypes.filter((typeName) => typeName.endsWith(".ComboBoxClinicPicker"))
      .map((typeName) => `  [${JSON.stringify(typeName)}, OpenDentalClinicPicker],`));
  }
  if (has("CheckBox")) {
    components.push(`function OpenDentalCheckBox({ control, style, text = "", checked: controlledChecked, onCheckedChange }: ProfileVisualProps) {
  const initialState = String(control.appearance?.checkState || "");
  const [localChecked, setLocalChecked] = React.useState(control.appearance?.checked === true || /Checked|Indeterminate/i.test(initialState));
  const [indeterminate, setIndeterminate] = React.useState(/Indeterminate/i.test(initialState));
  const checked = controlledChecked ?? localChecked;
  const disabled = control.appearance?.enabled === false;
  const threeState = control.appearance?.threeState === true;
  const autoCheck = control.properties?.AutoCheck !== false;
  const right = control.appearance?.checkAlign?.horizontal === "Right";
  const toggle = () => {
    if (disabled || !autoCheck) return;
    if (!checked) { setLocalChecked(true); onCheckedChange?.(true); setIndeterminate(false); return; }
    if (threeState && !indeterminate) { setIndeterminate(true); return; }
    setLocalChecked(false); onCheckedChange?.(false); setIndeterminate(false);
  };
  return <label style={style} className={"migration-check native-od-checkbox" + (right ? " check-right" : "") + (disabled ? " disabled" : "")}>
    <input type="checkbox" checked={checked} disabled={disabled} tabIndex={control.properties?.TabStop === false ? -1 : 0}
      aria-checked={indeterminate ? "mixed" : checked} onChange={toggle} />
    <span className={"native-od-check-box" + (indeterminate ? " indeterminate" : "")} aria-hidden="true" />
    <span className="native-od-check-text">{text}</span>
  </label>;
}`);
    entries.push(...sourceTypes.filter((typeName) => typeName.endsWith(".CheckBox"))
      .map((typeName) => `  [${JSON.stringify(typeName)}, OpenDentalCheckBox],`));
  }
  return { source: components.join("\n\n"), entries: entries.join("\n") };
}

function flattenControls(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.children)]);
}

function normalizeSourceType(value: unknown): string {
  return String(value ?? "").replace(/^global::/, "");
}
