import type { ProjectIR } from "../ir/types.js";

export function componentRegistryTsx(project: ProjectIR): string {
  const entries = project.components
    .map((component) => `  ${JSON.stringify(component.id)}: createDefinitionAdapter(${JSON.stringify(component.id)}),`)
    .join("\n");
  return `import { createDefinitionAdapter } from "./MigrationSurface";

// One adapter registration per component TYPE. Every page instance references
// this registry; no per-form component copies are generated.
export const sharedComponentRegistry = {
${entries}
};
`;
}

export function migrationSurfaceTsx(projectIr: ProjectIR): string {
  const assetEntries = projectIr.assets
    .map((asset) => `  ${JSON.stringify(asset.key)}: new URL(${JSON.stringify(`../assets/${asset.targetFileName}`)}, import.meta.url).href,`)
    .join("\n");
  return `import React from "react";
import { Button, Checkbox, Input, InputNumber, Radio, Select, Tag } from "antd";
import project from "../generated/project.ir.json";
import { componentVisualAdapter, controlUsesVisualProfile, pageUsesVisualProfile, profileVisualComponent } from "./visualProfiles";

type Control = any;
type DefinitionAdapterProps = { control: Control; depth?: number; registry?: Record<string, React.ComponentType<DefinitionAdapterProps>> };
type LayoutNode = any;

const visualAssets: Record<string, string> = {
${assetEntries}
};

const definitions = new Map((project.components as any[]).map((item) => [item.id, item]));
const RuntimeVisibilityContext = React.createContext<ReadonlySet<Control>>(new Set());
const RuntimeTabNavigatorContext = React.createContext<ReadonlyMap<Control, Control>>(new Map());
const RuntimeControlIndexContext = React.createContext<ReadonlyMap<string, Control>>(new Map());
type RuntimeControlStateProperty = "checked" | "enabled" | "readOnly" | "visible";
type RuntimeControlStateContextValue = {
  index: ReadonlyMap<string, Control>;
  bindingsByTarget: ReadonlyMap<string, any[]>;
  getValue: (controlName: string, property: RuntimeControlStateProperty, fallbackControl?: Control, scope?: string) => boolean;
  setValue: (controlName: string, property: RuntimeControlStateProperty, value: boolean, scope?: string) => void;
};
const RuntimeControlStateContext = React.createContext<RuntimeControlStateContextValue>({
  index: new Map(), bindingsByTarget: new Map(), getValue: () => false, setValue: () => undefined,
});
const RuntimeControlScopeContext = React.createContext("page");
type RuntimeCoordinateSpace = { width?: number; height?: number };
const RuntimeCoordinateSpaceContext = React.createContext<RuntimeCoordinateSpace>({});
const previewPage: any = (project.pages as any[])[0];
const RuntimePageContext = React.createContext<any>(previewPage);
const previewFileName = String(previewPage?.sourcePath || "MigratedForm.cs").replace(/\\\\/g, "/").split("/").pop()?.replace(".Designer", "") || "MigratedForm.cs";
const previewFilePaths = [...new Set([
  ...(project.pages as any[]).map((item) => item.sourcePath),
  ...(project.components as any[]).map((item) => item.sourcePath),
].filter(Boolean).map((value) => String(value).replace(/\\\\/g, "/").split("/").slice(-2).join("/")))].slice(0, 6);

const previewRepository = {
  name: "gitextensions_5",
  branch: "tmp/reword1",
  path: "C:" + String.fromCharCode(92) + ["dev", "gc", "gitextensions_5"].join(String.fromCharCode(92)) + String.fromCharCode(92),
  version: "f0344e66 (tmp/go9-6)",
  dirtyCount: 1,
};

type PreviewRevision = {
  id: string;
  graph: "main" | "side" | "merge" | "status";
  refs: string[];
  subject: string;
  author: string;
  email: string;
  committer: string;
  date: string;
  hash: string;
  fullHash?: string;
  parent: string;
  artificial: boolean;
  statusIcon?: string;
};
const previewRevisions: PreviewRevision[] = [
  { id: "worktree", graph: "status", refs: ["Working directory"], subject: "+ 1", author: "", email: "", committer: "", date: "", hash: "", parent: "9f9d9cf", artificial: true, statusIcon: "RepoStateDirty" },
  { id: "index", graph: "status", refs: ["Commit index"], subject: "", author: "", email: "", committer: "", date: "", hash: "", parent: "9f9d9cf", artificial: true, statusIcon: "RepoStateStaged" },
  { id: "25f6b60", graph: "main", refs: ["tmp/reword1"], subject: "Show multirevision diff also with no HEAD (#9947)", author: "Gerhard Olsson", email: "6248932+gerhardol@users.noreply.github.com", committer: "GitHub", date: "2022-04-29 21:14:28", hash: "25f6b60", parent: "f3e5c63", artificial: false },
  { id: "9f9d9cf", graph: "side", refs: ["master", "upstream/master"], subject: "Show multi revision diff also with no HEAD (#9947)", author: "Gerhard Olsson", email: "6248932+gerhardol@users.noreply.github.com", committer: "GitHub", date: "2022-04-29 21:14:28", hash: "9f9d9cf", fullHash: "9f9d9cf7c1ee11777197f6131024c0abd17d0e00", parent: "f3e5c63", artificial: false },
  { id: "f3e5c63", graph: "merge", refs: [], subject: "Left panel: reverted menu icon scaling", author: "Holger Schmidt", email: "hschmidt@users.noreply.github.com", committer: "Holger Schmidt", date: "2022-04-29 13:06:57", hash: "f3e5c63", parent: "14471c3", artificial: false },
  { id: "14471c3", graph: "main", refs: [], subject: "Show no changes in grid for artificial commits", author: "Gerhard Olsson", email: "6248932+gerhardol@users.noreply.github.com", committer: "Gerhard Olsson", date: "2022-04-29 00:43:21", hash: "14471c3", parent: "18d7ac4", artificial: false },
  { id: "18d7ac4", graph: "main", refs: ["v4.2.0"], subject: "Improve revision grid layout", author: "GitExtensions", email: "team@gitextensions.org", committer: "GitExtensions", date: "2022-04-28 18:35:04", hash: "18d7ac4", parent: "b42c0f1", artificial: false },
  { id: "b42c0f1", graph: "main", refs: [], subject: "Refresh repository objects after fetch", author: "Contributor", email: "contributor@users.noreply.github.com", committer: "Contributor", date: "2022-04-28 10:17:39", hash: "b42c0f1", parent: "830c2e7", artificial: false },
];
type PreviewRuntimeState = {
  revision: PreviewRevision;
  setRevision: (revision: PreviewRevision) => void;
  selectedRevisionIds: string[];
  setSelectedRevisionIds: (value: string[] | ((current: string[]) => string[])) => void;
  revisionFilter: string;
  setRevisionFilter: (value: string) => void;
  branchFilter: string;
  setBranchFilter: (value: string) => void;
  revisionScope: string;
  setRevisionScope: (value: string) => void;
  firstParent: boolean;
  setFirstParent: (value: boolean | ((current: boolean) => boolean)) => void;
  leftPanelVisible: boolean;
  setLeftPanelVisible: (value: boolean | ((current: boolean) => boolean)) => void;
  splitViewVertical: boolean;
  setSplitViewVertical: (value: boolean | ((current: boolean) => boolean)) => void;
  runCommand: (label: string) => void;
};
const PreviewRuntimeContext = React.createContext<PreviewRuntimeState>({
  revision: previewRevisions[3], setRevision: () => undefined,
  selectedRevisionIds: [previewRevisions[3].id], setSelectedRevisionIds: () => undefined,
  revisionFilter: "", setRevisionFilter: () => undefined,
  branchFilter: "", setBranchFilter: () => undefined,
  revisionScope: "All branches", setRevisionScope: () => undefined,
  firstParent: false, setFirstParent: () => undefined,
  leftPanelVisible: true, setLeftPanelVisible: () => undefined,
  splitViewVertical: true, setSplitViewVertical: () => undefined,
  runCommand: () => undefined,
});

function PreviewRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [revision, setRevision] = React.useState(previewRevisions[3]);
  const [selectedRevisionIds, setSelectedRevisionIds] = React.useState([previewRevisions[3].id]);
  const [revisionFilter, setRevisionFilter] = React.useState("");
  const [branchFilter, setBranchFilter] = React.useState("");
  const [revisionScope, setRevisionScope] = React.useState("All branches");
  const [firstParent, setFirstParent] = React.useState(false);
  const [leftPanelVisible, setLeftPanelVisible] = React.useState(true);
  const [splitViewVertical, setSplitViewVertical] = React.useState(true);
  const [notice, setNotice] = React.useState("");
  const noticeTimer = React.useRef<number | null>(null);
  const runCommand = React.useCallback((label: string) => {
    setNotice(label);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);
  React.useEffect(() => () => { if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); }, []);
  return <PreviewRuntimeContext.Provider value={{ revision, setRevision, selectedRevisionIds, setSelectedRevisionIds, revisionFilter, setRevisionFilter, branchFilter, setBranchFilter, revisionScope, setRevisionScope, firstParent, setFirstParent, leftPanelVisible, setLeftPanelVisible, splitViewVertical, setSplitViewVertical, runCommand }}>
    {children}{notice && <div className="native-command-toast"><strong>Command</strong><span>{notice}</span><small>UI contract ready · backend not connected</small></div>}
  </PreviewRuntimeContext.Provider>;
}

function usePreviewRuntime() {
  return React.useContext(PreviewRuntimeContext);
}

export function createDefinitionAdapter(componentId: string) {
  return function DefinitionAdapter({ control, depth = 0, registry = {} }: DefinitionAdapterProps) {
    const parentControlScope = React.useContext(RuntimeControlScopeContext);
    const definition: any = definitions.get(componentId);
    if (!definition || depth > 8) {
      return <div className="migration-custom unresolved">
        <strong>{componentId}</strong>
        <span>共享组件待映射</span>
      </div>;
    }
    if (definition.status === "external") {
      const profileAdapter = componentVisualAdapter(componentId, control);
      if (profileAdapter === "git-diff") return <DiffPreview />;
      if (profileAdapter === "git-file-tree") return <FileTreePreview />;
      if (profileAdapter === "git-revision-diff") return <RevisionDiffPreview />;
      if (profileAdapter === "git-revision-grid") return <RevisionGridPreview />;
      if (profileAdapter === "git-repository-tree") return <RepositoryTreePreview />;
      if (profileAdapter === "git-commit-info") return <CommitInfoPreview />;
      if (profileAdapter === "git-gpg-info") return <GpgInfoPreview />;
      if (profileAdapter === "git-action") return <GitActionPreview control={control} />;
      if (profileAdapter === "git-filter-toolbar") return <FilterToolbarPreview />;
      if (profileAdapter === "git-menu-strip") return <NativeMenuBar controls={control.children || []} />;
      if (profileAdapter === "git-tool-strip") return <NativeToolStrip control={control} />;
      if (/(?:DatePicker|DateEdit|DateInput)$/i.test(componentId)) return <SemanticDateInput control={control} />;
      if (/(?:Phone|TextBox|TextEdit|MemoEdit)$/i.test(componentId)) return <SemanticTextInput control={control} />;
      if (/(?:ComboBox|Lookup|Picker|Selector)/i.test(componentId)) return <SemanticComboInput control={control} />;
      if (/(?:Warning|Validation|Integrity|ErrorIndicator)/i.test(componentId)) return <SemanticWarningIndicator control={control} />;
      return control.children?.length ? <div className="migration-custom external-inline">
        <div className="migration-inline-controls"><ControlTree controls={compactToolbarControls(control.children)} registry={registry} depth={depth + 1} normalized /></div>
      </div> : <div className="migration-custom native-external-surface"><strong>{humanizeType(componentId)}</strong><span>shared component preview</span></div>;
    }
    // A Designer-backed UserControl already owns a local coordinate system.
    // Keep it intact so one shared definition renders like the source at every
    // host instance; semantic page layout must not reorder its internal fields.
    const boundControls = applyComponentPropertyBindings(definition, control);
    return <div className="migration-custom resolved-component">
      <Tag className="component-type-tag" color="blue">{componentId}</Tag>
      <RuntimeControlScopeContext.Provider value={parentControlScope + "/" + control.name}><RuntimeControlIndexContext.Provider value={indexControls(boundControls)}><RuntimeCoordinateSpaceContext.Provider value={definition.clientSize || definition.layout?.sourceSize || {}}>
         <ControlTree controls={boundControls} registry={registry} depth={depth + 1} contextName={control.name} />
       </RuntimeCoordinateSpaceContext.Provider></RuntimeControlIndexContext.Provider></RuntimeControlScopeContext.Provider>
    </div>;
  };
}

function applyComponentPropertyBindings(definition: any, host: Control): Control[] {
  const bindings = definition.propertyBindings || [];
  if (!bindings.length) return definition.controls || [];
  const byTarget = new Map<string, any[]>();
  for (const binding of bindings) {
    const raw = componentHostValue(host, binding.sourceProperty);
    if (raw === undefined) continue;
    const list = byTarget.get(binding.targetControlName) || [];
    list.push({ ...binding, raw });
    byTarget.set(binding.targetControlName, list);
  }
  if (!byTarget.size) return definition.controls || [];
  const visit = (controls: Control[]): Control[] => controls.map((source) => {
    const targetBindings = byTarget.get(source.name) || [];
    const children = visit(source.children || []);
    if (!targetBindings.length && children === source.children) return source;
    let control = { ...source, children, appearance: { ...(source.appearance || {}) } };
    for (const binding of targetBindings) control = applyComponentBinding(control, binding);
    return control;
  });
  return visit(definition.controls || []);
}

function componentHostValue(host: Control, sourceProperty: string): unknown {
  if (Object.prototype.hasOwnProperty.call(host.properties || {}, sourceProperty)) return host.properties[sourceProperty];
  if (sourceProperty === "Text") return host.text;
  const appearanceKey = sourceProperty.charAt(0).toLocaleLowerCase() + sourceProperty.slice(1);
  if (Object.prototype.hasOwnProperty.call(host.appearance || {}, appearanceKey)) return host.appearance[appearanceKey];
  return undefined;
}

function applyComponentBinding(control: Control, binding: any): Control {
  let value = binding.raw;
  if (binding.negated) value = !componentBoolean(value);
  if (binding.targetProperty === "text") return { ...control, text: String(value ?? "") };
  if (binding.targetProperty === "selectedIndex" || binding.targetProperty === "selectedItem") {
    const numeric = Number(value);
    const matched = (control.items || []).findIndex((item: string) => item === String(value) || item.toLocaleLowerCase() === String(value).toLocaleLowerCase());
    const selectedIndex = matched >= 0 ? matched : Number.isFinite(numeric) ? numeric : control.appearance?.selectedIndex;
    return { ...control, appearance: { ...control.appearance, selectedIndex } };
  }
  const normalized = ["checked", "enabled", "readOnly", "visible"].includes(binding.targetProperty)
    ? componentBoolean(value)
    : value;
  return { ...control, appearance: { ...control.appearance, [binding.targetProperty]: normalized } };
}

function componentBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !/^(?:false|0|null|undefined)$/i.test(String(value).trim());
}

function defaultControlStateValue(control: Control | undefined, property: RuntimeControlStateProperty): boolean {
  const value = control?.appearance?.[property];
  if (value !== undefined) return componentBoolean(value);
  return property === "enabled" || property === "visible";
}

function RuntimeControlStateProvider({ page, index, children }: { page: any; index: ReadonlyMap<string, Control>; children: React.ReactNode }) {
  const [values, setValues] = React.useState<Record<string, boolean>>({});
  const bindingsByTarget = React.useMemo(() => {
    const result = new Map<string, any[]>();
    for (const binding of page.runtimeControlBindings || []) {
      const entries = result.get(binding.targetControlName) || [];
      entries.push(binding);
      result.set(binding.targetControlName, entries);
    }
    return result;
  }, [page]);
  const getValue = React.useCallback((controlName: string, property: RuntimeControlStateProperty, fallbackControl?: Control, scope = "page") => {
    const key = scope + ":" + controlName + "." + property;
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : defaultControlStateValue(fallbackControl || index.get(controlName), property);
  }, [index, values]);
  const setValue = React.useCallback((controlName: string, property: RuntimeControlStateProperty, value: boolean, scope = "page") => {
    const key = scope + ":" + controlName + "." + property;
    setValues((current) => current[key] === value ? current : { ...current, [key]: value });
  }, []);
  const context = React.useMemo(() => ({ index, bindingsByTarget, getValue, setValue }), [index, bindingsByTarget, getValue, setValue]);
  return <RuntimeControlStateContext.Provider value={context}>{children}</RuntimeControlStateContext.Provider>;
}

function applyRuntimeControlBindings(control: Control, state: RuntimeControlStateContextValue): Control {
  const bindings = state.bindingsByTarget.get(control.name) || [];
  if (!bindings.length) return control;
  const appearance = { ...(control.appearance || {}) };
  for (const binding of bindings) {
    let value = state.getValue(binding.sourceControlName, binding.sourceProperty);
    if (binding.negated) value = !value;
    appearance[binding.targetProperty] = value;
  }
  return { ...control, appearance };
}

function NativeCommandButton({ control, style, normalized, text }: { control: Control; style: React.CSSProperties; normalized: boolean; text: string }) {
  const controlIndex = React.useContext(RuntimeControlIndexContext);
  const { runCommand } = usePreviewRuntime();
  const host = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuName = typeof control.properties?.Menu === "string" && control.properties.Menu !== "null"
    ? control.properties.Menu : undefined;
  const linkedMenu = menuName ? controlIndex.get(menuName) : undefined;
  const menuItems = (linkedMenu?.children || []).filter((item: Control) => item.appearance?.visible !== false);
  const hasMenu = Boolean(menuName);
  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const iconOnly = normalized && control.kind.startsWith("ToolStrip") && !control.text;
  const glyph = controlButtonGlyph(control);
  const buttonClass = (iconOnly ? "native-icon-button" : "native-command-button") + buttonImageAlignmentClass(control)
    + (hasMenu ? " native-menu-command" : "") + (controlUsesVisualProfile(control, "opendental", "Button") ? " native-od-button" : "");
  const button = <Button style={hasMenu ? { width: "100%", height: "100%" } : style} size="small"
    disabled={control.appearance?.enabled === false} className={buttonClass}
    aria-haspopup={hasMenu ? "menu" : undefined} aria-expanded={hasMenu ? menuOpen : undefined}
    onClick={() => menuItems.length ? setMenuOpen((value) => !value) : runCommand(text || control.name)}
    title={text + (eventTitle(control) ? "\\n" + eventTitle(control) : "")}>
    {(controlIconUrl(control) || glyph) && <ControlIcon control={control} className="native-button-glyph" fallback={glyph} />}
    {!iconOnly && text && <span>{text}</span>}
    {hasMenu && <span className="native-menu-command-arrow" aria-hidden="true">▾</span>}
  </Button>;
  if (!hasMenu) return button;
  return <div ref={host} style={style} className="native-menu-button-host">
    {button}
    {menuOpen && linkedMenu && <LinkedControlMenu menu={linkedMenu} onClose={() => setMenuOpen(false)} />}
  </div>;
}

function LinkedControlMenu({ menu, onClose, nested = false }: { menu: Control; onClose: () => void; nested?: boolean }) {
  const { runCommand } = usePreviewRuntime();
  const items = (menu.children || []).filter((item: Control) => item.appearance?.visible !== false);
  const minWidth = Math.max(120, Number(menu.bounds?.width || 0));
  return <div className={"native-linked-menu" + (nested ? " nested" : "")} role="menu" style={{ minWidth }}>
    {items.map((item: Control) => {
      if (item.kind === "ToolStripSeparator") return <span className="native-linked-menu-separator" role="separator" key={item.name} />;
      const children = (item.children || []).filter((child: Control) => child.appearance?.visible !== false);
      const shortcut = String(item.properties?.ShortcutKeyDisplayString || item.properties?.ShortcutKeys || "");
      return <span className="native-linked-menu-item-host" key={item.name}>
        <button type="button" role="menuitem" disabled={item.appearance?.enabled === false}
          aria-haspopup={children.length ? "menu" : undefined}
          onClick={() => {
            if (children.length) return;
            onClose();
            const handler = item.events?.find((event: any) => event.event === "Click")?.handler;
            runCommand((displayText(item) || item.name) + (handler ? " → " + handler : ""));
            if (handler) window.dispatchEvent(new CustomEvent("wf-event", { detail: { control: item.name, handler } }));
          }}>
          {item.appearance?.checked === true && <span className="native-linked-menu-check">✓</span>}
          {(controlIconUrl(item) || item.appearance?.imageKey) && <ControlIcon control={item} className="menu-item-icon" />}
          <span className="native-linked-menu-label">{displayText(item) || humanizeType(item.name)}</span>
          {shortcut && <kbd>{shortcut}</kbd>}
          {children.length > 0 && <span className="native-linked-menu-arrow" aria-hidden="true">›</span>}
        </button>
        {children.length > 0 && <LinkedControlMenu menu={{ ...item, children }} onClose={onClose} nested />}
      </span>;
    })}
  </div>;
}

function SemanticDateInput({ control }: { control: Control }) {
  const ProfileVisual = profileVisualComponent(control);
  if (ProfileVisual) return <ProfileVisual control={control} label={humanizeType(control.name)} />;
  return <span className="semantic-date-input"><input aria-label={humanizeType(control.name)} defaultValue={String(control.text || "")}
    readOnly={control.appearance?.readOnly === true} disabled={control.appearance?.enabled === false} />
    <button type="button" disabled={control.appearance?.enabled === false || control.appearance?.readOnly === true} title="Open calendar" aria-label="Open calendar"><span aria-hidden="true">▾</span></button></span>;
}

function SemanticTextInput({ control }: { control: Control }) {
  const multiline = control.appearance?.multiline === true || Number(control.bounds?.height || 0) > 28 || /memo|notes/i.test(control.name);
  const common = { "aria-label": humanizeType(control.name), maxLength: Number(control.appearance?.maxLength || 0) || undefined,
    placeholder: control.appearance?.placeholderText, defaultValue: String(control.text || ""),
    readOnly: control.appearance?.readOnly === true, disabled: control.appearance?.enabled === false };
  return multiline ? <textarea className="semantic-text-input multiline" wrap={control.appearance?.wordWrap === false ? "off" : "soft"} {...common} />
    : <input className="semantic-text-input" type={control.appearance?.passwordChar ? "password" : "text"} {...common} />;
}

function SemanticComboInput({ control }: { control: Control }) {
  const items = [...(control.items || [])] as string[];
  const unassignedLabel = String(control.properties?.HqDescription || "Unassigned");
  if (control.properties?.IncludeUnassigned === true && !items.includes(unassignedLabel)) items.unshift(unassignedLabel);
  const selected = control.appearance?.selectedIndex >= 0 ? items[control.appearance.selectedIndex] : "";
  const ProfileVisual = profileVisualComponent(control);
  if (ProfileVisual) return <ProfileVisual control={control} label={humanizeType(control.name)} items={items} selected={selected} />;
  return <select className="semantic-combo-input" aria-label={humanizeType(control.name)} disabled={control.appearance?.enabled === false} defaultValue={selected}>
    <option value=""> </option>{items.map((item) => <option key={item} value={item}>{item}</option>)}</select>;
}

function SemanticWarningIndicator({ control }: { control: Control }) {
  return <span className="semantic-warning-indicator" role="img" aria-label={humanizeType(control.name)} title="Validation status">!</span>;
}

function DiffPreview({ filePath = previewFileName, revision }: { filePath?: string; revision?: PreviewRevision } = {}) {
  const { runCommand } = usePreviewRuntime();
  const [showWhitespace, setShowWhitespace] = React.useState(false);
  const [contextLines, setContextLines] = React.useState(12);
  const [showEntireFile, setShowEntireFile] = React.useState(false);
  const fileName = filePath.replace(/\\\\/g, "/").split("/").pop() || previewFileName;
  const body = /Designer/i.test(fileName) ? [
    { old: "112", next: "112", text: "         RevisionsSplitContainer.Panel2.Controls.Add(RevisionInfo);", kind: "plain" },
    { old: "113", next: "", text: "-        CommitInfoTabPage.Controls.Add(RevisionInfo);", kind: "removed" },
    { old: "", next: "113", text: "+        RevisionInfo.Dock = DockStyle.Fill;", kind: "added" },
    { old: "114", next: "114", text: "         RightSplitContainer.Panel1.Controls.Add(RevisionsSplitContainer);", kind: "plain" },
  ] : /RevisionGridControl/i.test(fileName) ? [
    { old: "418", next: "418", text: "     private void SetSelectedRevision(GitRevision revision)", kind: "plain" },
    { old: "419", next: "", text: "-        SelectedRevision = revision;", kind: "removed" },
    { old: "", next: "419", text: "+        SetSelectedRevision(revision, ensureVisible: true);", kind: "added" },
    { old: "420", next: "420", text: "     OnSelectionChanged(EventArgs.Empty);", kind: "plain" },
  ] : [
    { old: "114", next: "114", text: "     private void RefreshRevisions()", kind: "plain" },
    { old: "115", next: "", text: "-        RevisionGrid.RefreshRevisions();", kind: "removed" },
    { old: "", next: "115", text: "+        RevisionGrid.RefreshRevisions(keepSelection: true);", kind: "added" },
    { old: "116", next: "116", text: "     UpdateCommitDetails();", kind: "plain" },
  ];
  const context = [
    { old: "117", next: "117", text: "     RefreshGitStatusMonitor();", kind: "plain" },
    { old: "118", next: "118", text: "     RevisionGrid.Focus();", kind: "plain" },
    { old: "119", next: "119", text: " }", kind: "plain" },
    { old: "120", next: "120", text: "", kind: "plain" },
    { old: "121", next: "121", text: " private void UpdateCommitDetails()", kind: "plain" },
    { old: "122", next: "122", text: " {", kind: "plain" },
    { old: "123", next: "123", text: "     if (RevisionGrid.SelectedRevision is null)", kind: "plain" },
    { old: "124", next: "124", text: "     {", kind: "plain" },
    { old: "125", next: "125", text: "         RevisionInfo.Clear();", kind: "plain" },
    { old: "126", next: "126", text: "         return;", kind: "plain" },
    { old: "127", next: "127", text: "     }", kind: "plain" },
    { old: "128", next: "128", text: "", kind: "plain" },
    { old: "129", next: "129", text: "     RevisionInfo.SetRevision(RevisionGrid.SelectedRevision);", kind: "plain" },
    { old: "130", next: "130", text: "     revisionDiff.SetRevision(RevisionGrid.SelectedRevision);", kind: "plain" },
    { old: "131", next: "131", text: " }", kind: "plain" },
  ];
  const visibleContext = context.slice(0, showEntireFile ? context.length : contextLines);
  const contextSplit = Math.min(7, visibleContext.length);
  const lines = [
    { old: "", next: "", text: "diff --git a/" + filePath + " b/" + filePath, kind: "meta" },
    { old: "", next: "", text: "index " + (revision?.parent || "0625c07") + ".." + (revision?.hash || "working") + " 100644", kind: "meta" },
    { old: "", next: "", text: "--- a/" + filePath, kind: "header-removed" },
    { old: "", next: "", text: "+++ b/" + filePath, kind: "header-added" },
    { old: "", next: "", text: "@@ -112,20 +112,20 @@ private void RefreshRevisions()", kind: "hunk" },
    ...body,
    ...visibleContext.slice(0, contextSplit),
    ...(visibleContext.length > contextSplit ? [{ old: "", next: "", text: "@@ -126,6 +126,7 @@ private void UpdateCommitDetails()", kind: "hunk" }] : []),
    ...visibleContext.slice(contextSplit),
  ];
  return <div className="native-diff">
    <div className="native-diff-caption"><span>{fileName}</span><small>{revision?.hash ? revision.hash + " ↔ " + revision.parent : "Working tree"}</small></div>
    <div className="native-diff-toolbar"><button type="button" title="Decrease context lines" disabled={contextLines <= 1} onClick={() => setContextLines((value) => Math.max(1, value - 1))}><ControlIcon control={{ appearance: { imageKey: "NumberOfLinesDecrease" } }} className="diff-toolbar-icon" fallback="−" /></button><button type="button" title="Increase context lines" disabled={contextLines >= context.length} onClick={() => setContextLines((value) => Math.min(context.length, value + 1))}><ControlIcon control={{ appearance: { imageKey: "NumberOfLinesIncrease" } }} className="diff-toolbar-icon" fallback="+" /></button><span>{contextLines} context lines</span><i /><button type="button" title="Show entire file" className={showEntireFile ? "active" : ""} onClick={() => setShowEntireFile((value) => !value)}><ControlIcon control={{ appearance: { imageKey: "ShowEntireFile" } }} className="diff-toolbar-icon" fallback="▤" /></button><button type="button" title="Show whitespace" className={showWhitespace ? "active" : ""} onClick={() => setShowWhitespace((value) => !value)}><ControlIcon control={{ appearance: { imageKey: "ShowWhitespace" } }} className="diff-toolbar-icon" fallback="¶" /></button><button type="button" title="Diff settings" onClick={() => runCommand("Open diff settings")}><ControlIcon control={{ appearance: { imageKey: "Settings" } }} className="diff-toolbar-icon" fallback="⚙" /></button></div>
    <div className="native-diff-code">{lines.map((line, index) => <div className={"native-diff-line " + line.kind} key={index}>
      <span className="line-number">{line.old}</span><span className="line-number">{line.next}</span><code>{renderDiffText(line.text || " ", showWhitespace)}</code>
    </div>)}</div>
  </div>;
}

const diffKeywords = new Set(["class", "else", "if", "internal", "new", "private", "protected", "public", "return", "sealed", "this", "using", "var", "void"]);
const diffLiterals = new Set(["false", "null", "true"]);

function renderDiffText(text: string, showWhitespace: boolean): React.ReactNode {
  if (showWhitespace) return text.replace(/ /g, "·");
  if (text.trimStart().startsWith("//")) return <span className="syntax-comment">{text}</span>;
  return text.split(/([A-Za-z_][A-Za-z0-9_]*)/g).map((part, index) => diffKeywords.has(part)
    ? <span className="syntax-keyword" key={index}>{part}</span>
    : diffLiterals.has(part) ? <span className="syntax-literal" key={index}>{part}</span> : part);
}

function RevisionDiffPreview() {
  const files = [
    { status: "M", imageKey: "FileStatusModified", path: "GitUI/CommandsDialogs/FormBrowse.cs" },
    { status: "M", imageKey: "FileStatusModified", path: "GitUI/CommandsDialogs/FormBrowse.Designer.cs" },
    { status: "A", imageKey: "FileStatusAdded", path: "GitUI/UserControls/RevisionGridControl.cs" },
  ];
  const [selected, setSelected] = React.useState(files[0].path);
  const [query, setQuery] = React.useState("");
  const [filePaneRatio, setFilePaneRatio] = React.useState(.365);
  const splitHost = React.useRef<HTMLDivElement>(null);
  const splitDrag = React.useRef<{ start: number; width: number; ratio: number } | null>(null);
  const { revision, selectedRevisionIds } = usePreviewRuntime();
  const selectedRevisions = previewRevisions.filter((item) => selectedRevisionIds.includes(item.id));
  const visibleFiles = query.trim() ? files.filter((file) => file.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : files;
  const moveSplit = (event: PointerEvent) => { if (splitDrag.current) setFilePaneRatio(Math.min(.65, Math.max(.18, splitDrag.current.ratio + (event.clientX - splitDrag.current.start) / Math.max(1, splitDrag.current.width)))); };
  const stopSplit = () => { splitDrag.current = null; window.removeEventListener("pointermove", moveSplit); window.removeEventListener("pointerup", stopSplit); window.removeEventListener("pointercancel", stopSplit); };
  const startSplit = (event: React.PointerEvent<HTMLDivElement>) => { const rect = splitHost.current?.getBoundingClientRect(); if (!rect) return; event.preventDefault(); splitDrag.current = { start: event.clientX, width: rect.width, ratio: filePaneRatio }; window.addEventListener("pointermove", moveSplit); window.addEventListener("pointerup", stopSplit); window.addEventListener("pointercancel", stopSplit); };
  const splitPercent = Math.round(filePaneRatio * 1000) / 10;
  return <div ref={splitHost} className="native-revision-diff" style={{ gridTemplateColumns: splitPercent + "% 4px minmax(0,1fr)" }}>
    <div className="revision-diff-files"><div className="revision-diff-filter"><input aria-label="Filter changed files" placeholder="Filter files using a regular expression…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" onClick={() => query && setQuery("")}>{query ? "×" : "▾"}</button></div>
      <div className="revision-diff-summary">{selectedRevisions.length > 1
        ? "(" + files.length + ") Compare " + selectedRevisions.length + " revisions: " + (selectedRevisions[0].hash || selectedRevisions[0].refs[0]) + " ↔ " + (selectedRevisions[selectedRevisions.length - 1].hash || selectedRevisions[selectedRevisions.length - 1].refs[0])
        : "(" + files.length + ") Diff with " + (revision.hash || revision.refs[0]) + ": " + (revision.subject || "uncommitted changes") + " · parent " + revision.parent}</div>
      {visibleFiles.map((file) => <button type="button" key={file.path} className={selected === file.path ? "selected" : ""} onClick={() => setSelected(file.path)}>
        <ControlIcon control={{ appearance: { imageKey: file.imageKey } }} className="diff-file-status-image" fallback={file.status} /><span>{file.path}</span>
      </button>)}
      {visibleFiles.length === 0 && <div className="revision-diff-empty">No matching changed files</div>}</div>
    <div className="revision-diff-splitter" role="separator" aria-orientation="vertical" tabIndex={0} onPointerDown={startSplit} onDoubleClick={() => setFilePaneRatio(.365)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setFilePaneRatio((value) => Math.min(.65, Math.max(.18, value + (event.key === "ArrowRight" ? .025 : -.025)))); } }}><span /></div>
    <DiffPreview filePath={selected} revision={revision} />
  </div>;
}

function NativeMenuBar({ controls }: { controls: Control[] }) {
  const { runCommand, leftPanelVisible, setLeftPanelVisible, splitViewVertical, setSplitViewVertical } = usePreviewRuntime();
  const sourceItems = controls.filter((control) => control.kind === "ToolStripMenuItem");
  const byName = new Map(sourceItems.map((item) => [item.name, item]));
  const menu = (name: string, text: string, children: string[] = []) => {
    const item = byName.get(name);
    return item ? { ...item, text, children: item.children?.length ? item.children : children.map((label, index) => ({ name: name + "Virtual" + index, kind: "ToolStripMenuItem", text: label, children: [] })) }
      : { name, kind: "ToolStripMenuItem", text, children: children.map((label, index) => ({ name: name + "Virtual" + index, kind: "ToolStripMenuItem", text: label, children: [] })) };
  };
  const items = byName.has("repositoryToolStripMenuItem") ? [
    menu("fileToolStripMenuItem", "Start", ["Open repository…", "Clone repository…", "Exit"]),
    menu("repositoryToolStripMenuItem", "Repository"),
    menu("navigateRuntimeMenu", "Navigate", ["Back", "Forward", "Go to commit…"]),
    menu("viewRuntimeMenu", "View", ["Show left panel", "Show split view", "Refresh"]),
    menu("commandsToolStripMenuItem", "Commands"),
    menu("_repositoryHostsToolStripMenuItem", "GitHub"),
    menu("pluginsToolStripMenuItem", "Plugins"),
    menu("toolsToolStripMenuItem", "Tools", ["Settings", "Manage hotkeys"]),
    menu("helpToolStripMenuItem", "Help", ["About Git Extensions", "Documentation"]),
  ] : sourceItems.slice(0, 9);
  const [open, setOpen] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.name === open);
  const menuKey = (event: React.KeyboardEvent<HTMLButtonElement>, itemIndex: number) => {
    const buttons = menuRef.current?.querySelectorAll(":scope > button");
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (itemIndex + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
      (buttons?.[next] as HTMLButtonElement | undefined)?.focus();
      if (open) setOpen(items[next].name);
    } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault(); setOpen(items[itemIndex].name);
      window.requestAnimationFrame(() => (menuRef.current?.querySelector(".native-menu-dropdown button") as HTMLButtonElement | null)?.focus());
    } else if (event.key === "Escape") setOpen(null);
  };
  const dropdownKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll("button")) as HTMLButtonElement[];
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    else if (event.key === "Escape") { event.preventDefault(); const index = items.findIndex((item) => item.name === open); setOpen(null); (menuRef.current?.querySelectorAll(":scope > button")[index] as HTMLButtonElement | undefined)?.focus(); }
  };
  const activateChild = (child: Control) => {
    if (active?.name === "viewRuntimeMenu" && /Virtual0$/.test(child.name)) { setLeftPanelVisible((value) => !value); runCommand("Toggle left panel"); }
    else if (active?.name === "viewRuntimeMenu" && /Virtual1$/.test(child.name)) { setSplitViewVertical((value) => !value); runCommand("Toggle split view layout"); }
    else runCommand(displayText(child));
    setOpen(null);
  };
  const childChecked = (child: Control) => active?.name === "viewRuntimeMenu" && (/Virtual0$/.test(child.name) ? leftPanelVisible : /Virtual1$/.test(child.name) ? splitViewVertical : false);
  return <div ref={menuRef} className="native-menu-bar" onMouseLeave={() => setOpen(null)}>
    {items.map((item, itemIndex) => { const label = displayText(item); const key = label[0]?.toLocaleLowerCase(); return <button type="button" accessKey={key} aria-keyshortcuts={key ? "Alt+" + key.toLocaleUpperCase() : undefined} className={open === item.name ? "active" : ""} key={item.name}
      onClick={() => setOpen((value) => value === item.name ? null : item.name)} onKeyDown={(event) => menuKey(event, itemIndex)}>{label}</button>; })}
    {active?.children?.length > 0 && <div className="native-menu-dropdown" onKeyDown={dropdownKey} style={{ left: Math.max(3, items.findIndex((item) => item.name === open) * 58 + 3) }}>
      {active.children.slice(0, 12).map((child: Control) => child.kind === "ToolStripSeparator"
        ? <span className="context-separator" key={child.name} />
        : <button type="button" key={child.name} onClick={() => activateChild(child)}><span className="menu-check">{childChecked(child) ? "✓" : ""}</span><ControlIcon control={child} className="menu-item-icon" />{displayText(child)}{/refresh/i.test(displayText(child)) && <kbd>F5</kbd>}</button>)}
    </div>}
  </div>;
}

function NativeToolStrip({ control }: { control: Control }) {
  const { runCommand, setLeftPanelVisible, setSplitViewVertical } = usePreviewRuntime();
  const items = (control.children || []).filter((item: Control) => item.appearance?.visible !== false);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [toolbarRowWidth, setToolbarRowWidth] = React.useState(1406);
  const [open, setOpen] = React.useState<string | null>(null);
  const active = items.find((item: Control) => item.name === open);
  const mainStrip = /ToolStripMain/i.test(control.name);
  React.useEffect(() => {
    const row = hostRef.current?.closest(".layout-role-toolbar") || hostRef.current?.parentElement;
    if (!row || typeof ResizeObserver === "undefined") return;
    const update = () => setToolbarRowWidth(row.getBoundingClientRect().width);
    const observer = new ResizeObserver(update);
    observer.observe(row); update();
    return () => observer.disconnect();
  }, []);
  const limit = mainStrip && toolbarRowWidth < 1300 ? Math.min(16, items.length) : items.length;
  const visibleItems = items.slice(0, limit);
  const overflowItems = items.slice(limit);
  const dropdownItems = open === "__overflow" ? overflowItems : active?.children || [];
  const stripWidth = Number(control.bounds?.width || 0) || undefined;
  const renderedStripWidth = mainStrip ? Math.max(toolbarRowWidth >= 1300 ? 720 : 680, stripWidth || 0) : stripWidth;
  const toolbarItemText = (item: Control) => {
    if (/_NO_TRANSLATE_WorkingDir$/i.test(item.name)) return previewRepository.path;
    if (/branchSelect$/i.test(item.name)) return previewRepository.branch;
    if (/toolStripButtonCommit$/i.test(item.name)) return "Commit (" + previewRepository.dirtyCount + ")";
    return displayText(item);
  };
  const toolbarItemTitle = (item: Control) => String(item.properties?.ToolTipText || toolbarItemText(item));
  const toolbarVisualControl = (item: Control) => /_NO_TRANSLATE_WorkingDir$/i.test(item.name)
    ? { ...item, appearance: { ...item.appearance, imageKey: "DashboardFolderGit" } }
    : item;
  const activateItem = (item: Control) => {
    if (/^toggleLeftPanel$/i.test(item.name)) { setLeftPanelVisible((value) => !value); runCommand("Toggle left panel"); return; }
    if (/^toggleSplitViewLayout$/i.test(item.name)) { setSplitViewVertical((value) => !value); runCommand("Toggle split view layout"); return; }
    if (item.children?.length) setOpen((value) => value === item.name ? null : item.name);
    else runCommand(toolbarItemText(item));
  };
  if (items.length === 0 && /ToolStripScripts/i.test(control.name)) return <div className="native-tool-strip runtime-script-strip" style={{ width: "auto", minWidth: 118 }}>
    <button type="button" title="Open repository in Visual Studio Code" onClick={() => runCommand("Open in VS Code")}>
      <ControlIcon control={{ appearance: { imageKey: "Develop" } }} className="toolbar-glyph" fallback="&lt;/&gt;" /><span>Open in VS Code</span>
    </button>
  </div>;
  if (items.length === 0) return <div className="native-tool-strip" style={{ width: stripWidth }}><button type="button"><span className="toolbar-glyph">⚙</span>{control.text || humanizeType(control.name)}</button></div>;
  return <div ref={hostRef} className={mainStrip ? "native-tool-strip native-main-tool-strip" : "native-tool-strip"} style={{ width: renderedStripWidth }} onMouseLeave={() => setOpen(null)}>
    {visibleItems.map((item: Control) => item.kind === "ToolStripSeparator"
      ? <span className="native-toolbar-separator" key={item.name} />
      : <button type="button" key={item.name} title={toolbarItemTitle(item)} className={open === item.name ? "active" : ""} style={{ minWidth: Number(item.bounds?.width || 0) || undefined }}
          onClick={() => activateItem(item)}>
          <ControlIcon control={toolbarVisualControl(item)} className="toolbar-glyph" fallback={buttonGlyph(item.name) || "·"} />{toolbarShowsText(item) && <span>{toolbarItemText(item)}</span>}{item.kind.includes("Split") && <small>▾</small>}
        </button>)}
    {overflowItems.length > 0 && <button type="button" className={open === "__overflow" ? "active native-overflow-button" : "native-overflow-button"} title="More commands" onClick={() => setOpen((value) => value === "__overflow" ? null : "__overflow")}>»</button>}
    {dropdownItems.length > 0 && <div className="native-toolbar-dropdown" style={{ left: open === "__overflow" && renderedStripWidth ? Math.max(2, renderedStripWidth - 225) : Math.min(440, Math.max(2, items.findIndex((item: Control) => item.name === open) * 31)) }}>
      {dropdownItems.slice(0, 12).map((child: Control) => child.kind === "ToolStripSeparator"
        ? <span className="context-separator" key={child.name} />
        : <button type="button" key={child.name} onClick={() => { setOpen(null); runCommand(displayText(child)); }}><ControlIcon control={child} className="menu-item-icon" />{displayText(child)}</button>)}
    </div>}
  </div>;
}

function RepositoryTreePreview() {
  type RepoNode = { id: string; parent: string | null; imageKey: string; label: string; level: number; strong: boolean; muted?: boolean };
  const nodes: RepoNode[] = [
    { id: "submodules", parent: null, imageKey: "FolderSubmodule", label: "Submodules", level: 0, strong: true },
    { id: "repo", parent: "submodules", imageKey: "FolderSubmodule", label: "gitextensions_5 (tmp/reword1)", level: 1, strong: true },
    { id: "externals", parent: "repo", imageKey: "FolderOpen", label: "Externals", level: 2, strong: false },
    { id: "conemu", parent: "externals", imageKey: "FolderClosed", label: "conemu-inside", level: 3, strong: false },
    { id: "easyhook", parent: "externals", imageKey: "FolderClosed", label: "EasyHook", level: 3, strong: false },
    { id: "github", parent: "externals", imageKey: "FolderClosed", label: "Git.hub", level: 3, strong: false },
    { id: "texteditor", parent: "externals", imageKey: "FolderClosed", label: "ICSharpCode.TextEditor", level: 3, strong: false },
    { id: "branches", parent: null, imageKey: "FolderOpen", label: "Branches", level: 0, strong: true },
    { id: "tmp", parent: "branches", imageKey: "FolderOpen", label: "tmp", level: 1, strong: false },
    { id: "reword1", parent: "tmp", imageKey: "BranchLocal", label: "reword1", level: 2, strong: true },
    { id: "master", parent: "branches", imageKey: "BranchLocal", label: "master (0↑)", level: 1, strong: false },
    { id: "bugfix", parent: "branches", imageKey: "BranchLocal", label: "bugfix", level: 1, strong: false },
    { id: "feature", parent: "branches", imageKey: "BranchLocal", label: "feature", level: 1, strong: false },
    { id: "lazy", parent: "branches", imageKey: "BranchLocal", label: "lazyLoadIgnoredFiles_go (0↑)", level: 1, strong: false },
    { id: "remotes", parent: null, imageKey: "Remotes", label: "Remotes", level: 0, strong: true },
    { id: "origin", parent: "remotes", imageKey: "Remote", label: "origin", level: 1, strong: false },
    { id: "origin-master", parent: "origin", imageKey: "BranchRemote", label: "master", level: 2, strong: false },
    { id: "upstream", parent: "remotes", imageKey: "Remote", label: "upstream", level: 1, strong: false },
    { id: "upstream-master", parent: "upstream", imageKey: "BranchRemote", label: "master", level: 2, strong: false },
    { id: "inactive-remotes", parent: "remotes", imageKey: "Remote", label: "[Inactive]", level: 1, strong: false, muted: true },
    { id: "tags", parent: null, imageKey: "Tag", label: "Tags", level: 0, strong: true },
    { id: "v421", parent: "tags", imageKey: "Tag", label: "v4.2.1", level: 1, strong: false },
  ];
  const [selected, setSelected] = React.useState("reword1");
  const [query, setQuery] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set(["origin", "upstream", "tags"]));
  const treeRef = React.useRef<HTMLDivElement>(null);
  const views = [
    { title: "Repository tree", imageKey: "LayoutSidebarLeft", rootId: null },
    { title: "Branches", imageKey: "LayoutSidebarTopLeft", rootId: "branches" },
    { title: "Remotes", imageKey: "LayoutSidebarTopRight", rootId: "remotes" },
    { title: "Submodules", imageKey: "FolderSubmodule", rootId: "submodules" },
    { title: "Tags", imageKey: "Tag", rootId: "tags" },
  ];
  const [view, setView] = React.useState(views[0].title);
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const childrenOf = (id: string) => nodes.filter((item) => item.parent === id);
  const ancestorIds = (item: RepoNode) => { const result: string[] = []; let parent = item.parent; while (parent) { result.push(parent); parent = nodeById.get(parent)?.parent || null; } return result; };
  const viewRoot = views.find((item) => item.title === view)?.rootId || null;
  const inView = (item: RepoNode) => !viewRoot || item.id === viewRoot || ancestorIds(item).includes(viewRoot);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryPath = new Set<string>();
  if (normalizedQuery) nodes.filter((item) => item.label.toLocaleLowerCase().includes(normalizedQuery)).forEach((item) => { queryPath.add(item.id); ancestorIds(item).forEach((id) => queryPath.add(id)); });
  const visibleNodes = nodes.filter((item) => inView(item) && (normalizedQuery
    ? queryPath.has(item.id)
    : !ancestorIds(item).some((id) => collapsed.has(id))));
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const focusNode = (id: string) => window.requestAnimationFrame(() => (treeRef.current?.querySelector('[data-tree-id="' + id + '"]') as HTMLButtonElement | null)?.focus());
  const treeKey = (event: React.KeyboardEvent<HTMLButtonElement>, item: RepoNode, itemIndex: number) => {
    const children = childrenOf(item.id);
    const isCollapsed = collapsed.has(item.id);
    let target: RepoNode | undefined;
    if (event.key === "ArrowDown") target = visibleNodes[Math.min(visibleNodes.length - 1, itemIndex + 1)];
    else if (event.key === "ArrowUp") target = visibleNodes[Math.max(0, itemIndex - 1)];
    else if (event.key === "Home") target = visibleNodes[0];
    else if (event.key === "End") target = visibleNodes[visibleNodes.length - 1];
    else if (event.key === "ArrowRight" && children.length && isCollapsed) { toggle(item.id); event.preventDefault(); return; }
    else if (event.key === "ArrowRight" && children.length) target = children[0];
    else if (event.key === "ArrowLeft" && children.length && !isCollapsed) { toggle(item.id); event.preventDefault(); return; }
    else if (event.key === "ArrowLeft" && item.parent) target = nodeById.get(item.parent);
    else if ((event.key === "Enter" || event.key === " ") && children.length) { toggle(item.id); event.preventDefault(); return; }
    else return;
    event.preventDefault();
    if (target) { setSelected(target.id); focusNode(target.id); }
  };
  return <div className="native-repository-tree"><div className="repo-tree-view-toolbar">
    {views.map((item) => <button type="button" key={item.title} title={item.title} className={view === item.title ? "active" : ""} onClick={() => { setView(item.title); if (item.rootId) setSelected(item.rootId); }}><ControlIcon control={{ appearance: { imageKey: item.imageKey } }} className="repo-tree-view-icon" /></button>)}
  </div><div className="repo-tree-search"><input aria-label="Filter repository tree" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" title={query ? "Clear filter" : "Filter"} onClick={() => query && setQuery("")}>{query ? "×" : "⌕"}</button></div><div className="repo-tree-scroll">
    <div ref={treeRef} role="tree" aria-label={view}>{visibleNodes.map((item, itemIndex) => { const hasChildren = childrenOf(item.id).length > 0; const expanded = hasChildren && !collapsed.has(item.id); const treeStyle = { paddingLeft: 3 + item.level * 15, "--tree-rail-width": item.level * 15 + "px", "--tree-last-rail": 12 + Math.max(0, item.level - 1) * 15 + "px" } as React.CSSProperties; return <button type="button" role="treeitem" aria-level={item.level + 1} aria-expanded={hasChildren ? expanded : undefined} data-tree-id={item.id} className={(selected === item.id ? "selected " : "") + (hasChildren ? "group " : "") + (expanded ? "expanded " : "") + (item.strong ? "strong " : "") + (item.muted ? "muted " : "") + "level-" + item.level} style={treeStyle} key={item.id} onClick={() => setSelected(item.id)} onDoubleClick={() => hasChildren && toggle(item.id)} onKeyDown={(event) => treeKey(event, item, itemIndex)}><span aria-hidden="true" className="repo-tree-expander" onClick={(event) => { if (hasChildren) { event.stopPropagation(); toggle(item.id); } }} /><ControlIcon control={{ appearance: { imageKey: item.imageKey } }} className="repo-tree-node-icon" fallback="·" /><span className="repo-tree-label">{item.label}</span></button>; })}</div>
    {visibleNodes.length === 0 && <div className="repo-tree-empty">No matching repository objects</div>}
  </div></div>;
}

function RevisionGridPreview() {
  const { revision, setRevision, selectedRevisionIds, setSelectedRevisionIds, revisionFilter, branchFilter, revisionScope, firstParent, runCommand } = usePreviewRuntime();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const selectionAnchor = React.useRef(3);
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const commands = [
    { label: "Checkout revision…", imageKey: "Checkout", shortcut: "" },
    { label: "Create new branch…", imageKey: "BranchCreate", shortcut: "" },
    { label: "Cherry pick commit", imageKey: "CherryPick", shortcut: "" },
    { label: "Compare revisions", imageKey: "Diff", shortcut: "Ctrl+D" },
    { label: "Copy commit hash", imageKey: "CommitId", shortcut: "Ctrl+C" },
  ];
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, row: PreviewRevision) => {
    event.preventDefault();
    setRevision(row);
    if (!selectedRevisionIds.includes(row.id)) setSelectedRevisionIds([row.id]);
    const host = event.currentTarget.closest(".native-revision-grid")?.getBoundingClientRect();
    setMenu({
      x: Math.max(2, Math.min((host?.width || 440) - 224, event.clientX - (host?.left || 0))),
      y: Math.max(2, Math.min((host?.height || 240) - 146, event.clientY - (host?.top || 0))),
    });
  };
  const textFilter = revisionFilter.trim().toLocaleLowerCase();
  const refFilter = branchFilter.trim().toLocaleLowerCase();
  const visibleRevisions = previewRevisions.filter((row) => {
    const inScope = revisionScope === "All branches" || row.artificial || row.graph === "main" || row.refs.some((ref) => /master|reword1/i.test(ref));
    const matchesRef = !refFilter || row.refs.some((ref) => ref.toLocaleLowerCase().includes(refFilter));
    const searchable = [...row.refs, row.subject, row.author, row.hash, row.date].join(" ").toLocaleLowerCase();
    return inScope && (!firstParent || row.graph !== "side") && matchesRef && (!textFilter || searchable.includes(textFilter));
  });
  const selectRow = (event: React.MouseEvent<HTMLButtonElement>, row: PreviewRevision, rowIndex: number) => {
    setRevision(row);
    if (event.shiftKey) {
      const start = Math.min(selectionAnchor.current, rowIndex);
      const end = Math.max(selectionAnchor.current, rowIndex);
      setSelectedRevisionIds(visibleRevisions.slice(start, end + 1).map((item) => item.id));
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedRevisionIds((current) => current.includes(row.id) ? current.length > 1 ? current.filter((id) => id !== row.id) : current : [...current, row.id]);
      selectionAnchor.current = rowIndex;
    } else {
      setSelectedRevisionIds([row.id]);
      selectionAnchor.current = rowIndex;
    }
    setMenu(null);
  };
  const keyboardSelect = (event: React.KeyboardEvent<HTMLButtonElement>, rowIndex: number) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "a") { event.preventDefault(); setSelectedRevisionIds(visibleRevisions.map((item) => item.id)); runCommand("Select all visible revisions"); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "c") { event.preventDefault(); runCommand("Copy commit hash " + (visibleRevisions[rowIndex]?.hash || "working tree")); return; }
    if (event.key === "Escape") { event.preventDefault(); setSelectedRevisionIds([revision.id]); return; }
    let nextIndex = rowIndex;
    if (event.key === "ArrowDown") nextIndex = Math.min(visibleRevisions.length - 1, rowIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, rowIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = Math.max(0, visibleRevisions.length - 1);
    else return;
    event.preventDefault();
    const next = visibleRevisions[nextIndex];
    if (!next) return;
    setRevision(next);
    if (event.shiftKey) {
      const start = Math.min(selectionAnchor.current, nextIndex);
      const end = Math.max(selectionAnchor.current, nextIndex);
      setSelectedRevisionIds(visibleRevisions.slice(start, end + 1).map((item) => item.id));
    } else { setSelectedRevisionIds([next.id]); selectionAnchor.current = nextIndex; }
    window.requestAnimationFrame(() => (gridRef.current?.querySelector('[data-revision-id="' + next.id + '"]') as HTMLButtonElement | null)?.focus());
  };
  return <div ref={gridRef} className="native-revision-grid">
    {visibleRevisions.map((row, rowIndex) => <button type="button" aria-selected={selectedRevisionIds.includes(row.id)} data-revision-id={row.id} className={(selectedRevisionIds.includes(row.id) ? "selected " : "") + (revision.id === row.id ? "primary " : "") + (row.artificial ? "artificial" : "")} key={row.id} onClick={(event) => selectRow(event, row, rowIndex)} onKeyDown={(event) => keyboardSelect(event, rowIndex)} onContextMenu={(event) => openMenu(event, row)}>
      <RevisionGraph row={row} /><span className="revision-subject">{row.refs.map((ref) => <em className={revisionRefClass(ref)} key={ref}>{ref}</em>)}<span>{row.subject}</span></span><span className="revision-author">{row.author && <AuthorPortrait author={row.author} email={row.email} compact />}<span>{row.author}</span></span><span>{row.date}</span><code>{row.hash}</code>
    </button>)}
    {visibleRevisions.length === 0 && <div className="revision-grid-empty">No revisions match the current filters</div>}
    {menu && <div className="native-context-menu revision-context-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
      {commands.map((command, index) => <React.Fragment key={command.label}>{index === 3 && <span className="context-separator" />}<button type="button" onClick={() => { setMenu(null); runCommand(command.label); }}><ControlIcon control={{ appearance: { imageKey: command.imageKey } }} className="menu-item-icon" />{command.label}{command.shortcut && <kbd>{command.shortcut}</kbd>}</button></React.Fragment>)}
    </div>}
  </div>;
}

function RevisionGraph({ row }: { row: PreviewRevision }) {
  if (row.statusIcon) return <span className="revision-graph revision-status"><ControlIcon control={{ appearance: { imageKey: row.statusIcon } }} className="revision-status-icon" /></span>;
  return <svg className={"revision-graph graph-" + row.graph} viewBox="0 0 36 24" preserveAspectRatio="none" aria-hidden="true">
    <path className="graph-path graph-path-main" d="M14 0 V24" />
    {row.graph === "side" && <><path className="graph-path graph-path-side" d="M26 0 V24" /><path className="graph-path graph-path-branch" d="M14 0 C14 8 26 6 26 13" /></>}
    {row.graph === "merge" && <><path className="graph-path graph-path-side" d="M26 0 V8" /><path className="graph-path graph-path-branch" d="M26 7 C26 15 14 14 14 24" /></>}
    {row.graph === "main" ? <rect className="graph-node" x="10" y="8" width="8" height="8" /> : <circle className="graph-node" cx={row.graph === "side" ? 26 : 14} cy="12" r="4" />}
  </svg>;
}

function revisionRefClass(ref: string): string {
  if (/^(?:Working directory|Commit index)$/i.test(ref)) return "ref-state";
  if (/upstream|origin|remote/i.test(ref)) return "ref-remote";
  if (/^v?\\d+(?:\\.\\d+)+/i.test(ref)) return "ref-tag";
  return "ref-local";
}

function githubAvatarSource(email: string, compact: boolean): string | undefined {
  const match = email.trim().match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/i);
  if (!match) return undefined;
  return "https://avatars.githubusercontent.com/u/" + match[1] + "?v=4&s=" + (compact ? 40 : 160);
}

function AuthorPortrait({ author, email = "", compact = false }: { author: string; email?: string; compact?: boolean }) {
  const tone = [...author].reduce((total, character) => total + character.charCodeAt(0), 0) % 5;
  const source = githubAvatarSource(email, compact);
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => setAvatarFailed(false), [source]);
  return <span className={"author-portrait avatar-tone-" + tone + (compact ? " compact" : "")} role="img" aria-label={author}>
    {source && !avatarFailed ? <img src={source} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : <><i /><b /></>}
  </span>;
}

function CommitInfoPreview() {
  const { revision, selectedRevisionIds } = usePreviewRuntime();
  const author = revision.author || "Working directory";
  const title = revision.subject || revision.refs[0];
  return <div className="native-commit-info">
    {selectedRevisionIds.length > 1 && <div className="commit-selection-banner">{selectedRevisionIds.length} revisions selected · primary: <code>{revision.hash || revision.refs[0]}</code></div>}
    <div className="commit-info-header"><AuthorPortrait author={author} email={revision.email} /><dl><dt>Author</dt><dd><a>{author}{revision.email ? " <" + revision.email + ">" : ""}</a></dd><dt>Date</dt><dd>{revision.date ? "1 month ago (" + revision.date + ")" : "Not committed"}</dd><dt>Committer</dt><dd><a>{revision.committer || "Not committed"}</a></dd><dt>Commit hash</dt><dd><code>{revision.fullHash || revision.hash || "working tree"}</code></dd><dt>Parent</dt><dd><a><code>{revision.parent}</code></a></dd></dl></div>
    <div className="commit-message"><h3>{title}</h3>{revision.artificial && <p>Uncommitted repository changes.</p>}<small>Related links: <a>View on GitHub</a>{!revision.artificial && <>, <a>Issue 9947</a></>}</small></div>
  </div>;
}

function FileTreePreview() {
  type FileNode = { id: string; parent: string | null; name: string; path: string; folder: boolean; level: number };
  const files: FileNode[] = [
    { id: "src", parent: null, name: "src", path: "src", folder: true, level: 0 },
    { id: "commands", parent: "src", name: "CommandsDialogs", path: "src/CommandsDialogs", folder: true, level: 1 },
    { id: "browse", parent: "commands", name: "FormBrowse.cs", path: "GitUI/CommandsDialogs/FormBrowse.cs", folder: false, level: 2 },
    { id: "designer", parent: "commands", name: "FormBrowse.Designer.cs", path: "GitUI/CommandsDialogs/FormBrowse.Designer.cs", folder: false, level: 2 },
    { id: "grid", parent: "src", name: "RevisionGrid", path: "src/RevisionGrid", folder: true, level: 1 },
    { id: "grid-control", parent: "grid", name: "RevisionGridControl.cs", path: "GitUI/UserControls/RevisionGridControl.cs", folder: false, level: 2 },
    { id: "readme", parent: null, name: "README.md", path: "README.md", folder: false, level: 0 },
  ];
  const [selected, setSelected] = React.useState("browse");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"View" | "Blame">("View");
  const { revision } = usePreviewRuntime();
  const nodeById = new Map(files.map((item) => [item.id, item]));
  const ancestors = (item: FileNode) => { const result: string[] = []; let parent = item.parent; while (parent) { result.push(parent); parent = nodeById.get(parent)?.parent || null; } return result; };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryPath = new Set<string>();
  if (normalizedQuery) files.filter((item) => item.path.toLocaleLowerCase().includes(normalizedQuery)).forEach((item) => { queryPath.add(item.id); ancestors(item).forEach((id) => queryPath.add(id)); });
  const visibleFiles = files.filter((item) => normalizedQuery ? queryPath.has(item.id) : !ancestors(item).some((id) => collapsed.has(id)));
  const current = nodeById.get(selected) || files[2];
  const sourceByFile: Record<string, string[]> = {
    browse: ["using GitCommands;", "using GitUI.CommandsDialogs;", "", "public sealed partial class FormBrowse", "{", "    private void RefreshRevisions()", "    {", "        RevisionGrid.RefreshRevisions();", "    }", "}"],
    designer: ["partial class FormBrowse", "{", "    private SplitContainer MainSplitContainer;", "    private RevisionGridControl RevisionGrid;", "    private CommitInfo CommitInfo;", "", "    private void InitializeComponent()", "    {", "        RevisionGrid.Dock = DockStyle.Fill;", "    }", "}"],
    "grid-control": ["public sealed class RevisionGridControl : GitModuleControl", "{", "    public GitRevision? SelectedRevision { get; private set; }", "", "    public void RefreshRevisions(bool keepSelection)", "    {", "        // reload revision graph", "    }", "}"],
    readme: ["# Git Extensions", "", "Git Extensions is a graphical user interface for Git.", "", "This preview was reconstructed from WinForms metadata."],
  };
  const sourceLines = sourceByFile[current.id] || ["Folder: " + current.path, "", "Select a file to view its contents."];
  const toggleFolder = (id: string) => setCollapsed((value) => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <div className="native-file-tree-preview">
    <div className="native-file-tree-pane"><div className="file-tree-filter"><span>⌕</span><input aria-label="Filter files" placeholder="Filter files" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" onClick={() => setQuery("")}>{query ? "×" : "▾"}</button></div>
      <div className="file-tree-items" role="tree" aria-label="Commit file tree">{visibleFiles.map((file) => { const expanded = file.folder && !collapsed.has(file.id); return <button type="button" role="treeitem" aria-level={file.level + 1} aria-expanded={file.folder ? expanded : undefined} className={selected === file.id ? "selected" : ""} style={{ paddingLeft: 4 + file.level * 15 }} key={file.id} onClick={() => setSelected(file.id)} onDoubleClick={() => file.folder && toggleFolder(file.id)}>
        <span className="file-tree-expander" onClick={(event) => { if (file.folder) { event.stopPropagation(); toggleFolder(file.id); } }}>{file.folder ? expanded ? "⌄" : "›" : ""}</span><ControlIcon control={{ appearance: { imageKey: file.folder ? expanded ? "FolderOpen" : "FolderClosed" : "File" } }} className="file-tree-node-icon" fallback={file.folder ? "▣" : "▤"} /><span>{file.name}</span>
      </button>; })}{visibleFiles.length === 0 && <div className="file-tree-empty">No matching files</div>}</div></div>
    <div className="native-file-content"><div className="file-content-toolbar"><span>{current.path}</span><span className="file-view-mode"><button type="button" className={mode === "View" ? "active" : ""} onClick={() => setMode("View")}><ControlIcon control={{ appearance: { imageKey: "FileHistory" } }} className="file-mode-icon" fallback="▤" />View</button><button type="button" className={mode === "Blame" ? "active" : ""} onClick={() => setMode("Blame")}><ControlIcon control={{ appearance: { imageKey: "Blame" } }} className="file-mode-icon" fallback="◉" />Blame</button></span></div>
      <div className={"file-source-lines" + (mode === "Blame" ? " blame-mode" : "")}>{sourceLines.map((line, index) => <div key={index}>{mode === "Blame" && <><code className="blame-hash">{revision.hash || "working"}</code><code className="blame-author">{revision.author || "You"}</code></>}<span>{index + 1}</span><code>{line || " "}</code></div>)}</div></div>
  </div>;
}

function GpgInfoPreview() {
  const { revision, runCommand } = usePreviewRuntime();
  const verified = !revision.artificial;
  return <div className="native-gpg-info"><div className={"gpg-status " + (verified ? "verified" : "unsigned")}><ControlIcon control={{ appearance: { imageKey: verified ? "CommitSignatureOk" : "CommitSignatureWarning" } }} className="gpg-status-icon" fallback={verified ? "✓" : "!"} /><div><strong>{verified ? "Good signature" : "No signature"}</strong><span>{verified ? "This commit was signed and the signature was verified." : "Working tree and index revisions are not signed."}</span></div></div>
    <dl><dt>Commit</dt><dd><code>{revision.hash || "working tree"}</code></dd><dt>Signer</dt><dd>{verified ? revision.author + (revision.email ? " <" + revision.email + ">" : "") : "—"}</dd><dt>Key ID</dt><dd><code>{verified ? "0xF0A34E66C47B2A91" : "—"}</code></dd><dt>Algorithm</dt><dd>{verified ? "RSA / SHA-256" : "—"}</dd><dt>Verified</dt><dd>{verified ? revision.date : "—"}</dd></dl>
    <div className="gpg-actions"><button type="button" disabled={!verified} onClick={() => runCommand("Copy signing key fingerprint")}><ControlIcon control={{ appearance: { imageKey: "CopyToClipboard" } }} className="gpg-action-icon" fallback="▣" />Copy fingerprint</button><button type="button" disabled={!verified} onClick={() => runCommand("View raw commit signature")}><ControlIcon control={{ appearance: { imageKey: "Key" } }} className="gpg-action-icon" fallback="🔑" />View raw signature</button></div>
  </div>;
}

function GitActionPreview({ control }: { control: Control }) {
  const bisect = /bisect/i.test(control.name);
  return <div className="native-action-notice"><span className="native-spinner">◌</span><strong>{bisect ? "Bisect in progress" : "Git command in progress"}</strong><span>{bisect ? "Select good or bad revision to continue." : "The repository is being refreshed…"}</span><button type="button">Cancel</button></div>;
}

function FilterToolbarPreview() {
  const { revision, setRevision, setSelectedRevisionIds, revisionFilter, setRevisionFilter, branchFilter, setBranchFilter, revisionScope, setRevisionScope, firstParent, setFirstParent, runCommand } = usePreviewRuntime();
  const active = Boolean(revisionFilter || branchFilter || revisionScope !== "All branches");
  const [open, setOpen] = React.useState<"advanced" | "scope" | "branchType" | "revisionType" | null>(null);
  const [showReflog, setShowReflog] = React.useState(false);
  const [branchTypes, setBranchTypes] = React.useState(() => new Set(["Local"]));
  const [revisionTypes, setRevisionTypes] = React.useState(() => new Set(["Commit message"]));
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => setter((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  const resetFilters = () => { setBranchFilter(""); setRevisionFilter(""); setRevisionScope("All branches"); runCommand("Reset revision filters"); setOpen(null); };
  const toggleFirstParent = () => {
    const next = !firstParent;
    setFirstParent(next);
    if (next && revision.graph === "side") { setRevision(previewRevisions[2]); setSelectedRevisionIds([previewRevisions[2].id]); }
    runCommand(next ? "Show only first parent" : "Show all parents");
  };
  const scopeImage = revisionScope === "All branches" ? "BranchLocal" : "BranchFilter";
  return <div className={"native-filter-toolbar" + (active ? " filters-active" : "")} onMouseLeave={() => setOpen(null)}>
    <span className="filter-button-host"><button type="button" className="filter-split-button icon-only" title="Advanced filter" onClick={() => setOpen((value) => value === "advanced" ? null : "advanced")}><ControlIcon control={{ appearance: { imageKey: active ? "FunnelExclamation" : "FunnelPencil" } }} className="filter-toolbar-icon" fallback="⚱" /><small>▾</small></button>{open === "advanced" && <div className="native-filter-menu"><button type="button" onClick={() => { runCommand("Reset path filter"); setOpen(null); }}>Reset path filter</button><button type="button" onClick={resetFilters}>Reset revision filters</button><span className="context-separator" /><button type="button" onClick={() => { runCommand("Open advanced revision filter"); setOpen(null); }}>Advanced filter…</button></div>}</span>
    <button type="button" className={showReflog ? "filter-icon-button checked" : "filter-icon-button"} aria-pressed={showReflog} title="Show reflog" onClick={() => { setShowReflog((value) => !value); runCommand(showReflog ? "Hide reflog" : "Show reflog"); }}><ControlIcon control={{ appearance: { imageKey: "Book" } }} className="filter-toolbar-icon" /></button>
    <span className="filter-button-host"><button type="button" className="filter-split-button scope-button" title={revisionScope} onClick={() => setOpen((value) => value === "scope" ? null : "scope")}><ControlIcon control={{ appearance: { imageKey: scopeImage } }} className="filter-toolbar-icon" /><span>{revisionScope}</span><small>▾</small></button>{open === "scope" && <div className="native-filter-menu scope-menu">{["All branches", "Current branch", "Filtered branches"].map((item) => <button type="button" key={item} onClick={() => { setRevisionScope(item); setOpen(null); }}><span className="menu-check">{revisionScope === item ? "✓" : ""}</span><ControlIcon control={{ appearance: { imageKey: item === "All branches" ? "BranchLocal" : "BranchFilter" } }} className="menu-item-icon" />{item}</button>)}</div>}</span>
    <label className="filter-label" htmlFor="native-branch-filter">Branches:</label>
    <span className="filter-combo"><input id="native-branch-filter" aria-label="Branch filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} /><button type="button" title={branchFilter ? "Clear branch filter" : "Branch history"} onClick={() => branchFilter ? setBranchFilter("") : runCommand("Open branch filter history")}>{branchFilter ? "×" : "▾"}</button></span>
    <span className="filter-button-host"><button type="button" className="filter-split-button icon-only" title="Branch type" onClick={() => setOpen((value) => value === "branchType" ? null : "branchType")}><ControlIcon control={{ appearance: { imageKey: "EditFilter" } }} className="filter-toolbar-icon" /><small>▾</small></button>{open === "branchType" && <div className="native-filter-menu compact-menu">{["Local", "Remote", "Tag"].map((item) => <button type="button" key={item} onClick={() => toggleSet(setBranchTypes, item)}><span className="menu-check">{branchTypes.has(item) ? "✓" : ""}</span>{item}</button>)}</div>}</span>
    <span className="filter-separator" />
    <label className="filter-label" htmlFor="native-revision-filter">Filter:</label>
    <span className="filter-combo"><input id="native-revision-filter" aria-label="Revision filter" value={revisionFilter} onChange={(event) => setRevisionFilter(event.target.value)} /><button type="button" title={revisionFilter ? "Clear revision filter" : "Filter history"} onClick={() => revisionFilter ? setRevisionFilter("") : runCommand("Open revision filter history")}>{revisionFilter ? "×" : "▾"}</button></span>
    <span className="filter-button-host"><button type="button" className="filter-split-button icon-only" title="Filter type" onClick={() => setOpen((value) => value === "revisionType" ? null : "revisionType")}><ControlIcon control={{ appearance: { imageKey: "EditFilter" } }} className="filter-toolbar-icon" /><small>▾</small></button>{open === "revisionType" && <div className="native-filter-menu revision-type-menu">{["Commit message", "Committer", "Author", "Diff contains (SLOW)"].map((item) => <button type="button" key={item} onClick={() => toggleSet(setRevisionTypes, item)}><span className="menu-check">{revisionTypes.has(item) ? "✓" : ""}</span>{item}</button>)}</div>}</span>
    <button type="button" className={firstParent ? "filter-icon-button checked" : "filter-icon-button"} aria-pressed={firstParent} title="Show only first parent" onClick={toggleFirstParent}><ControlIcon control={{ appearance: { imageKey: "ShowOnlyFirstParent" } }} className="filter-toolbar-icon" /></button>
  </div>;
}

function ConsolePreview() {
  const { revision } = usePreviewRuntime();
  const prompt = previewRepository.path + ">";
  const [command, setCommand] = React.useState("");
  const [lines, setLines] = React.useState([
    "Microsoft Windows [Version 10.0.22631.4037]",
    "Git Extensions repository console",
    prompt + " git status --short",
    " M GitUI/CommandsDialogs/FormBrowse.cs",
    " M GitUI/CommandsDialogs/FormBrowse.Designer.cs",
  ]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    if (/^(?:cls|clear)$/i.test(value)) setLines([]);
    else if (/^git\\s+log/i.test(value)) setLines((current) => [...current, prompt + " " + value, (revision.hash || "working") + " " + (revision.subject || "Working directory")]);
    else if (/^git\\s+status/i.test(value)) setLines((current) => [...current, prompt + " " + value, "On branch " + previewRepository.branch, "Changes not staged for commit:", "  modified: GitUI/CommandsDialogs/FormBrowse.cs"]);
    else setLines((current) => [...current, prompt + " " + value, "Preview command captured; shell backend is not connected."]);
    setCommand("");
  };
  return <div className="native-console"><div className="console-toolbar"><span>Console · gitextensions_5</span><button type="button" onClick={() => setLines([])}>Clear</button></div><div className="console-output">
    {lines.map((line, index) => <div key={index}>{line || " "}</div>)}
    <form onSubmit={submit}><span>{prompt}</span><input aria-label="Repository console command" autoFocus value={command} onChange={(event) => setCommand(event.target.value)} spellCheck={false} /></form>
  </div></div>;
}

function NativeWindowFrame({ page, children }: { page: any; children: React.ReactNode }) {
  const { runCommand } = usePreviewRuntime();
  const gitPreview = pageUsesVisualProfile(page, "gitextensions-workspace");
  const openDentalPreview = pageUsesVisualProfile(page, "opendental");
  const title = gitPreview
    ? previewRepository.name + " (" + previewRepository.branch + ") - " + (page.text || "Git Extensions") + " " + previewRepository.version
    : String(page.text || page.name || "WinForms application");
  React.useEffect(() => {
    if (!gitPreview) return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "F5") { event.preventDefault(); runCommand("Refresh revisions (F5)"); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "l") {
        event.preventDefault();
        (document.querySelector('[aria-label="Revision filter"]') as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [gitPreview, runCommand]);
  const showMinimize = page.minimizeBox !== false;
  const showMaximize = page.maximizeBox !== false;
  const showClose = page.controlBox !== false;
  const pageIcon = visualAssets[String(page.properties?.migrationIconAssetKey || "")];
  return <>
    <div className={"native-window-titlebar" + (openDentalPreview ? " native-od-titlebar" : "")}>
      {gitPreview ? <ControlIcon control={{ appearance: { imageKey: "GitLogo16" } }} className="native-app-icon" fallback="↗" />
        : pageIcon ? <span className="native-app-icon"><img src={pageIcon} alt="" /></span>
        : <span className="native-app-icon native-generic-app-icon" aria-hidden="true" />}
      <strong>{title}</strong>
      {showMinimize || showMaximize || showClose ? <span className="native-window-buttons">{showMinimize && <button type="button" aria-label="Minimize" onClick={() => runCommand("Minimize window")}>—</button>}{showMaximize && <button type="button" aria-label="Maximize" onClick={() => runCommand("Maximize window")}>□</button>}{showClose && <button type="button" aria-label="Close" onClick={() => runCommand("Close window")}>×</button>}</span> : null}
    </div>
    <div className="native-window-body">{children}</div>
  </>;
}

export function MigrationSurface({ page, registry }: { page: any; registry: Record<string, React.ComponentType<DefinitionAdapterProps>> }) {
  const index = indexControls(page.controls);
  const defaultHiddenControls = new Set<Control>();
  const runtimeTabNavigators = new Map<Control, Control>();
  for (const group of page.runtimeVisibilityGroups || []) {
    const variant = group.variants?.[Number(group.defaultVariant || 0)];
    for (const name of variant?.hiddenControls || []) {
      const control = index.get(name);
      if (control) defaultHiddenControls.add(control);
    }
  }
  for (const binding of page.runtimeTabNavigators || []) {
    const navigator = index.get(binding.navigatorControlName);
    const sourceTabs = index.get(binding.tabControlName);
    if (!navigator || !sourceTabs) continue;
    runtimeTabNavigators.set(navigator, sourceTabs);
    defaultHiddenControls.add(sourceTabs);
  }
  const sourceWidth = Number(page.layout?.sourceSize?.width || 1180);
  const sourceHeight = Number(page.layout?.sourceSize?.height || 620);
  const fixedClientStyle = pageClientStyle(page);
  const gitPreview = pageUsesVisualProfile(page, "gitextensions-workspace");
  const openDentalPreview = pageUsesVisualProfile(page, "opendental");
  const canvasStyle = gitPreview
    ? { width: "100%", minWidth: Math.min(1406, Math.max(1180, sourceWidth)), height: "clamp(620px, calc(100vh - 2px), 725px)" }
    : openDentalPreview
      ? { width: sourceWidth + 10, minWidth: sourceWidth + 10, height: sourceHeight + 31 }
      : { width: sourceWidth + 2, minWidth: sourceWidth + 2, height: sourceHeight + 33 };
  const presentationClass = gitPreview ? "native-workspace-form" : openDentalPreview ? "native-fixed-form native-od-form" : "native-fixed-form";
  return <section className={"migration-page native-presentation " + presentationClass}>
    <header className="migration-page-header">
      <div><h2>{page.text || page.name}</h2><small>{page.sourcePath}</small></div>
      <div className="migration-badges">
        <Tag color="green">semantic layout</Tag>
        {page.layout?.diagnostics?.stateAlternatives > 0 && <Tag color="blue">{page.layout.diagnostics.stateAlternatives} state variants</Tag>}
        {page.layout?.diagnostics?.runtimeReparents?.length > 0 && <Tag color="cyan">{page.layout.diagnostics.runtimeReparents.length} runtime layout</Tag>}
        <Tag>{page.support.controlsConverted} controls</Tag>
        <Tag color="orange">{page.support.contractPoints.length} contracts</Tag>
      </div>
    </header>
    <div className="migration-canvas-scroll migration-layout-scroll">
      <div className="migration-canvas migration-layout-canvas" style={canvasStyle}>
        <RuntimePageContext.Provider value={page}><RuntimeControlIndexContext.Provider value={index}><RuntimeControlStateProvider page={page} index={index}><RuntimeTabNavigatorContext.Provider value={runtimeTabNavigators}><RuntimeVisibilityContext.Provider value={defaultHiddenControls}><PreviewRuntimeProvider><NativeWindowFrame page={page}>{gitPreview && page.layout?.root
            ? <LayoutNodeView node={page.layout.root} index={index} registry={registry} depth={0} />
            : <div className="native-fixed-client" style={fixedClientStyle}><RuntimeCoordinateSpaceContext.Provider value={{ width: sourceWidth, height: sourceHeight }}><ControlTree controls={page.controls} registry={registry} depth={0} /></RuntimeCoordinateSpaceContext.Provider></div>}</NativeWindowFrame></PreviewRuntimeProvider></RuntimeVisibilityContext.Provider></RuntimeTabNavigatorContext.Provider></RuntimeControlStateProvider></RuntimeControlIndexContext.Provider></RuntimePageContext.Provider>
      </div>
    </div>
  </section>;
}

function indexControls(controls: Control[]): Map<string, Control> {
  const index = new Map<string, Control>();
  const visit = (items: Control[]) => items.forEach((control) => { index.set(control.name, control); visit(control.children || []); });
  visit(controls);
  return index;
}

function pageClientStyle(page: any): React.CSSProperties {
  const style: React.CSSProperties & Record<string, string | number | undefined> = {};
  const backColor = page.properties?.BackColor?.cssColor;
  const foreColor = page.properties?.ForeColor?.cssColor;
  const font = page.properties?.Font || {};
  if (backColor) {
    style.background = backColor;
    style["--wf-control-surface"] = backColor;
  }
  if (foreColor) style.color = foreColor;
  if (font.family) style.fontFamily = font.family;
  if (Number(font.size) > 0) style.fontSize = Number(font.size) * 4 / 3;
  if (font.bold) style.fontWeight = 700;
  if (font.italic) style.fontStyle = "italic";
  return style;
}

function LayoutNodeView({ node, index, registry, depth, contextName }: { node: LayoutNode; index: Map<string, Control>; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; contextName?: string }) {
  const roleClass = node.role ? " layout-role-" + node.role : "";
  if (node.kind === "empty") return <div className={"layout-empty" + roleClass} />;
  if (node.kind === "control") {
    const control = index.get(node.controlName);
    return control ? <div className={"layout-control" + roleClass} data-control={control.name}><ControlNode control={control} registry={registry} depth={depth} normalized contextName={contextName} /></div> : null;
  }
  if (node.kind === "tabs") {
    return <TabLayoutNode node={node} index={index} registry={registry} depth={depth} contextName={contextName} roleClass={roleClass} />;
  }
  if (node.kind === "layers") {
    return <LayerLayoutNode node={node} index={index} registry={registry} depth={depth} contextName={contextName} roleClass={roleClass} />;
  }
  if (node.kind === "split") {
    return <SplitLayoutNode node={node} index={index} registry={registry} depth={depth} contextName={contextName} roleClass={roleClass} />;
  }
  if (node.kind === "stack") {
    const compact = ["toolbar", "actions", "status"].includes(node.role) || /flow/i.test(node.controlName || "");
    return <div className={"layout-stack axis-" + node.axis + roleClass} data-control={node.controlName}>
      {(node.children || []).map((child: LayoutNode) => <div className={"layout-child" + (child.role ? " layout-child-" + child.role : "")} style={{ flex: node.axis === "horizontal" && node.role === "toolbar" && /(?:filter|search)/i.test(child.controlName || "") ? "1 1 180px" : compact || node.axis === "vertical" && ["toolbar", "actions", "status"].includes(child.role) ? "0 0 auto" : "1 1 0" }} key={child.id}>
        <LayoutNodeView node={child} index={index} registry={registry} depth={depth} contextName={contextName} />
      </div>)}
    </div>;
  }
  if (node.kind === "grid") {
    const style = { gridTemplateColumns: (node.columns || ["1fr"]).join(" "), gridTemplateRows: (node.rows || ["1fr"]).join(" ") };
    return <div className={"layout-grid" + roleClass} style={style} data-control={node.controlName}>
      {(node.cells || []).map((cell: any) => <div className="layout-grid-cell" key={cell.node.id} style={{ gridColumn: (cell.column + 1) + " / span " + (cell.columnSpan || 1), gridRow: (cell.row + 1) + " / span " + (cell.rowSpan || 1) }}>
        <LayoutNodeView node={cell.node} index={index} registry={registry} depth={depth} contextName={contextName} />
      </div>)}
    </div>;
  }
  if (node.kind === "frame") {
    return <div className={"layout-frame" + roleClass} data-control={node.controlName}>
      {node.label && <span className="layout-frame-title">{node.label}</span>}
      {(node.children || []).map((child: LayoutNode) => <LayoutNodeView key={child.id} node={child} index={index} registry={registry} depth={depth} contextName={contextName} />)}
    </div>;
  }
  return null;
}

function TabLayoutNode({ node, index, registry, depth, contextName, roleClass }: { node: LayoutNode; index: Map<string, Control>; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; contextName?: string; roleClass: string }) {
  const pages = node.children || [];
  const runtimeTabs = node.runtimeTabs || [];
  const total = pages.length + runtimeTabs.length;
  const [active, setActive] = React.useState(Math.max(0, Math.min(total - 1, node.selectedIndex || 0)));
  const tabListRef = React.useRef<HTMLDivElement>(null);
  const runtimeTab = active >= pages.length ? runtimeTabs[active - pages.length] : undefined;
  const keyboardTab = (event: React.KeyboardEvent<HTMLButtonElement>, pageIndex: number) => {
    let next = pageIndex;
    if (event.key === "ArrowRight" || event.ctrlKey && event.key === "Tab" && !event.shiftKey) next = (pageIndex + 1) % Math.max(1, total);
    else if (event.key === "ArrowLeft" || event.ctrlKey && event.key === "Tab" && event.shiftKey) next = (pageIndex - 1 + Math.max(1, total)) % Math.max(1, total);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = Math.max(0, total - 1);
    else return;
    event.preventDefault();
    setActive(next);
    window.requestAnimationFrame(() => (tabListRef.current?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus());
  };
  return <div className={"native-tabs" + roleClass} data-control={node.controlName}>
    <div ref={tabListRef} className="native-tab-list" role="tablist">{pages.map((page: LayoutNode, pageIndex: number) => <button type="button" role="tab" tabIndex={active === pageIndex ? 0 : -1} aria-selected={active === pageIndex}
      className={active === pageIndex ? "active" : ""} key={page.id} onClick={() => setActive(pageIndex)} onKeyDown={(event) => keyboardTab(event, pageIndex)}><ControlIcon control={index.get(page.controlName) || {}} className="native-tab-icon" fallback={tabGlyph(page.label)} />{page.label || "Tab " + (pageIndex + 1)}</button>)}
      {runtimeTabs.map((tab: any, tabIndex: number) => { const pageIndex = pages.length + tabIndex; return <button type="button" role="tab" tabIndex={active === pageIndex ? 0 : -1} aria-selected={active === pageIndex} className={active === pageIndex ? "active" : ""} key={tab.id} onClick={() => setActive(pageIndex)} onKeyDown={(event) => keyboardTab(event, pageIndex)}><ControlIcon control={{ appearance: { imageKey: tab.imageKey } }} className="native-tab-icon" fallback={tabGlyph(tab.label)} />{tab.label}</button>; })}</div>
    <div className={"native-tab-page" + (runtimeTab?.viewKind === "terminal" ? " terminal-page" : "")} role="tabpanel">{runtimeTab
      ? runtimeTab.viewKind === "terminal" ? <ConsolePreview /> : <div className="native-info-panel"><strong>{runtimeTab.label}</strong><span>Runtime tab content adapter pending.</span></div>
      : pages[active] && <LayoutNodeView node={pages[active]} index={index} registry={registry} depth={depth} contextName={contextName} />}</div>
  </div>;
}

function SplitLayoutNode({ node, index, registry, depth, contextName, roleClass }: { node: LayoutNode; index: Map<string, Control>; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; contextName?: string; roleClass: string }) {
  const { leftPanelVisible, splitViewVertical } = usePreviewRuntime();
  const sourceRatio = Number(node.ratio || .5);
  const fidelityRatio = /MainSplitContainer/i.test(node.controlName || "") ? .19
    : /RightSplitContainer/i.test(node.controlName || "") ? .27
      : /RevisionsSplitContainer/i.test(node.controlName || "") ? .55
        : sourceRatio;
  const initialRatio = Math.min(.8, Math.max(.15, fidelityRatio));
  const [ratio, setRatio] = React.useState(initialRatio);
  const host = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ start: number; size: number; ratio: number } | null>(null);
  const vertical = /RightSplitContainer/i.test(node.controlName || "") ? splitViewVertical : node.axis === "vertical";
  const percent = Math.round(ratio * 1000) / 10;
  const style = vertical
    ? { gridTemplateRows: percent + "% 4px minmax(0, 1fr)" }
    : { gridTemplateColumns: percent + "% 4px minmax(0, 1fr)" };
  const moveDrag = (event: PointerEvent) => {
    if (!drag.current) return;
    const current = vertical ? event.clientY : event.clientX;
    setRatio(Math.min(.85, Math.max(.15, drag.current.ratio + (current - drag.current.start) / Math.max(1, drag.current.size))));
  };
  const stopDrag = () => {
    drag.current = null;
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
  };
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    drag.current = { start: vertical ? event.clientY : event.clientX, size: vertical ? rect.height : rect.width, ratio };
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  };
  const keyboardResize = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = vertical ? event.key === "ArrowUp" : event.key === "ArrowLeft";
    const increase = vertical ? event.key === "ArrowDown" : event.key === "ArrowRight";
    if (!decrease && !increase) return;
    event.preventDefault();
    setRatio((value) => Math.min(.85, Math.max(.15, value + (increase ? .025 : -.025))));
  };
  if (/MainSplitContainer/i.test(node.controlName || "") && !leftPanelVisible) return <div className={"layout-single-pane" + roleClass} data-control={node.controlName}>
    <LayoutNodeView node={node.children?.[1]} index={index} registry={registry} depth={depth} contextName={contextName} />
  </div>;
  return <div ref={host} className={"layout-split axis-" + (vertical ? "vertical" : "horizontal") + roleClass} style={style} data-control={node.controlName} data-ratio={percent}>
    <div className="layout-pane"><LayoutNodeView node={node.children?.[0]} index={index} registry={registry} depth={depth} contextName={contextName} /></div>
    <div className="native-splitter" role="separator" tabIndex={0} aria-orientation={vertical ? "horizontal" : "vertical"}
      onPointerDown={startDrag}
      onDoubleClick={() => setRatio(initialRatio)} onKeyDown={keyboardResize}><span /></div>
    <div className="layout-pane"><LayoutNodeView node={node.children?.[1]} index={index} registry={registry} depth={depth} contextName={contextName} /></div>
  </div>;
}

function LayerLayoutNode({ node, index, registry, depth, contextName, roleClass }: { node: LayoutNode; index: Map<string, Control>; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; contextName?: string; roleClass: string }) {
  const alternatives = node.alternatives || [];
  const [active, setActive] = React.useState(0);
  const total = 1 + alternatives.length;
  const alternative = active > 0 ? index.get(alternatives[active - 1]) : undefined;
  return <div className={"layout-layers" + roleClass} data-state-index={active}>
    {active === 0
      ? (node.children || []).map((child: LayoutNode) => <LayoutNodeView key={child.id} node={child} index={index} registry={registry} depth={depth} contextName={contextName} />)
      : alternative ? <div className="layout-control state-alternative" data-control={alternative.name}><ControlNode control={alternative} registry={registry} depth={depth} normalized contextName={contextName} /></div> : null}
    {alternatives.length > 0 && <button type="button" className="layout-variant-badge" title={[node.label, ...alternatives].filter(Boolean).join(" → ")}
      onClick={() => setActive((value) => (value + 1) % total)}>状态 {active + 1}/{total}</button>}
  </div>;
}

function ControlTree({ controls, registry = {}, depth = 0, normalized = false, contextName }: { controls: Control[]; registry?: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth?: number; normalized?: boolean; contextName?: string }) {
  return <>{controls.map((control, index) => <ControlNode key={control.name} control={control} registry={registry} depth={depth} normalized={normalized}
    zIndex={normalized ? undefined : controls.length - index} contextName={contextName} />)}</>;
}

function ControlNode({ control, registry, depth, normalized = false, zIndex, contextName }: { control: Control; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; normalized?: boolean; zIndex?: number; contextName?: string }) {
  const runtimeHiddenControls = React.useContext(RuntimeVisibilityContext);
  const runtimeTabNavigators = React.useContext(RuntimeTabNavigatorContext);
  const runtimeControlState = React.useContext(RuntimeControlStateContext);
  const runtimeControlScope = React.useContext(RuntimeControlScopeContext);
  const runtimePage = React.useContext(RuntimePageContext);
  const coordinateSpace = React.useContext(RuntimeCoordinateSpaceContext);
  const sourceControl = control;
  const sourceTabs = runtimeTabNavigators.get(sourceControl);
  if (runtimeHiddenControls.has(sourceControl) || sourceControl.properties?.nonVisual === true) return null;
  control = applyRuntimeControlBindings(sourceControl, runtimeControlState);
  const style = normalized ? normalizedControlStyle(control) : controlStyle(control, coordinateSpace);
  if (!normalized && zIndex !== undefined && style.position === "absolute") style.zIndex = zIndex;
  if (sourceTabs) return <TabTreeNavigator control={control} sourceTabs={sourceTabs} registry={registry} depth={depth} style={style} />;
  if (control.componentRef) {
    const Adapter = registry[control.componentRef];
    return <div style={style} className={"migration-control custom-host" + (normalized ? " normalized-control" : "")} data-kind={control.kind}>
      {Adapter ? <Adapter control={control} depth={depth} registry={registry} /> : <div className="migration-custom unresolved"><strong>{control.componentRef}</strong><span>未注册</span></div>}
    </div>;
  }
  const childContextName = control.kind === "GroupBox" || control.kind === "TabPage" ? control.name : contextName;
  const childSpace = control.bounds ? { width: control.bounds.width, height: control.bounds.height } : coordinateSpace;
  const children = <RuntimeCoordinateSpaceContext.Provider value={childSpace}><ControlTree controls={control.children || []} registry={registry} depth={depth + 1} normalized={normalized} contextName={childContextName} /></RuntimeCoordinateSpaceContext.Provider>;
  const text = displayText(control);
  switch (control.kind) {
    case "Button":
    case "ToolStripButton":
    case "ToolStripDropDownButton":
    case "ToolStripSplitButton":
    case "ToolStripMenuItem":
      return <NativeCommandButton control={control} style={style} normalized={normalized} text={text} />;
    case "TextBox":
    case "MaskedTextBox":
    case "ToolStripTextBox": {
      if (control.kind !== "ToolStripTextBox" && control.appearance?.multiline === true) {
        return <Input.TextArea style={textAreaStyle(style, control.appearance?.scrollBars)} className="native-text-area" defaultValue={String(control.text ?? control.properties?.Text ?? "")}
          readOnly={control.appearance?.readOnly === true} disabled={control.appearance?.enabled === false}
          placeholder={control.appearance?.placeholderText} maxLength={control.appearance?.maxLength}
          wrap={control.appearance?.wordWrap === false ? "off" : "soft"} autoSize={false} />;
      }
      return <Input style={style} size="small" type={control.appearance?.passwordChar ? "password" : "text"}
        defaultValue={String(control.text ?? control.properties?.Text ?? "")} readOnly={control.appearance?.readOnly === true}
        disabled={control.appearance?.enabled === false} placeholder={control.appearance?.placeholderText}
        maxLength={control.appearance?.maxLength} />;
    }
    case "RichTextBox":
      return <Input.TextArea style={style} className="native-commit-editor" defaultValue={String(control.text ?? control.properties?.Text ?? "")}
        placeholder={control.appearance?.placeholderText || (contextName === "Message" ? "Enter commit message" : undefined)} readOnly={control.appearance?.readOnly === true}
        disabled={control.appearance?.enabled === false} maxLength={control.appearance?.maxLength} autoSize={false} />;
    case "NumericUpDown":
      return <InputNumber style={style} className="native-number-input" size="small" min={control.appearance?.minimum} max={control.appearance?.maximum}
        defaultValue={control.appearance?.value} disabled={control.appearance?.enabled === false} />;
    case "ComboBox":
    case "DomainUpDown":
    case "ToolStripComboBox": {
      const editable = control.kind === "ComboBox" && control.appearance?.dropDownStyle !== "DropDownList";
      const comboClass = (controlUsesVisualProfile(control, "opendental", "ComboBox") ? "native-od-combo " : "")
        + (editable ? "native-editable-combo" : "native-list-combo");
      const selectedItem = control.appearance?.selectedIndex >= 0 ? control.items?.[control.appearance.selectedIndex] : undefined;
      return <Select style={style} size="small" className={comboClass} disabled={control.appearance?.enabled === false}
        showSearch={editable} optionFilterProp="label" notFoundContent={null}
        defaultValue={selectedItem ?? (control.text ? String(control.text) : undefined)}
        options={(control.items || []).map((item: string) => ({ label: item, value: item }))} />;
    }
    case "CheckBox":
      if (controlUsesVisualProfile(control, "opendental", "CheckBox")) {
        const ProfileVisual = profileVisualComponent(control);
        if (ProfileVisual) return <ProfileVisual control={control} style={style} text={text} />;
      }
      return <div style={style} className={"migration-check" + (control.appearance?.checkAlign?.horizontal === "Right" ? " check-right" : "")}>
        <Checkbox disabled={control.appearance?.enabled === false} checked={runtimeControlState.getValue(control.name, "checked", control, runtimeControlScope)}
          onChange={(event) => runtimeControlState.setValue(control.name, "checked", event.target.checked, runtimeControlScope)}>{text}</Checkbox></div>;
    case "RadioButton":
      return <div style={style} className={"migration-check migration-radio" + (control.appearance?.checkAlign?.horizontal === "Right" ? " check-right" : "")}><Radio name={contextName || "wf-radio-group"}
        disabled={control.appearance?.enabled === false} defaultChecked={runtimeControlState.getValue(control.name, "checked", control, runtimeControlScope)}
        onChange={(event) => runtimeControlState.setValue(control.name, "checked", event.target.checked, runtimeControlScope)}>{text}</Radio></div>;
    case "LinkLabel":
      return <button type="button" style={style} className="migration-link-label" disabled={control.appearance?.enabled === false}
        title={eventTitle(control)}>{text}</button>;
    case "Label":
    case "ToolStripLabel":
    case "ToolStripStatusLabel":
      return <span style={style} className="migration-label">{text}</span>;
    case "ToolStripSeparator":
      return <span className="migration-separator" />;
    case "ToolStripProgressBar":
      return <div style={style} className="migration-progress"><span /></div>;
    case "TreeView":
      return pageUsesVisualProfile(runtimePage, "gitextensions-workspace")
        ? <FileStatusPreview control={control} contextName={contextName} style={style} />
        : <NativeTreeView control={control} style={style} />;
    case "ListBox":
      return <NativeListBox control={control} style={style} />;
    case "DataGridView":
    case "ListView": {
      const defaultColumnWidth = control.kind === "ListView" ? 60 : 100;
      return <div style={style} className={"migration-grid native-" + control.kind.toLowerCase()}>
        {(control.columns || []).length > 0 && <div className="migration-grid-head">{(control.columns || []).map((column: any) => <span key={column.name}
          style={{ flex: "0 0 " + Math.max(24, Number(column.width || defaultColumnWidth)) + "px" }}>{column.headerText || column.name}</span>)}</div>}
        <div className="migration-grid-empty" aria-label="Empty data view" />
      </div>;
    }
    case "PropertyGrid":
      return <NativePropertyGrid control={control} style={style} />;
    case "Panel":
    case "GroupBox":
    case "TabPage":
    case "SplitContainer":
    case "TableLayoutPanel":
    case "FlowLayoutPanel":
    case "ToolStripContainer":
      return <div style={style} className={"migration-container kind-" + control.kind.toLowerCase() + (controlUsesVisualProfile(control, "opendental", "GroupBox") ? " native-od-groupbox" : "")}>
        {control.kind === "GroupBox" && <span className="migration-container-title">{text}</span>}
        {children}
      </div>;
    case "TabControl":
      return <AbsoluteTabControl control={control} registry={registry} depth={depth} style={style} />;
    case "ToolStrip":
    case "MenuStrip":
    case "StatusStrip":
    case "ContextMenuStrip":
      return <div style={style} className={"migration-strip" + (normalized ? " normalized-strip" : "")}>{children}</div>;
    default:
      return <div style={style} className="migration-control fallback" data-kind={control.kind}>
        <small>{control.kind}</small>{text && <span>{text}</span>}{children}
      </div>;
  }
}

function AbsoluteTabControl({ control, registry, depth, style }: { control: Control; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; style: React.CSSProperties }) {
  const pages = (control.children || []).filter((child: Control) => child.kind === "TabPage");
  const initial = Math.max(0, Math.min(pages.length - 1, Number(control.appearance?.selectedIndex || 0)));
  const [active, setActive] = React.useState(initial);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const keyboardTab = (event: React.KeyboardEvent<HTMLButtonElement>, pageIndex: number) => {
    let next = pageIndex;
    if (event.key === "ArrowRight" || event.ctrlKey && event.key === "Tab" && !event.shiftKey) next = (pageIndex + 1) % Math.max(1, pages.length);
    else if (event.key === "ArrowLeft" || event.ctrlKey && event.key === "Tab" && event.shiftKey) next = (pageIndex - 1 + Math.max(1, pages.length)) % Math.max(1, pages.length);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = Math.max(0, pages.length - 1);
    else return;
    event.preventDefault();
    setActive(next);
    window.requestAnimationFrame(() => (tabsRef.current?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus());
  };
  const page = pages[active];
  return <div style={style} className={"native-tabs native-absolute-tabs" + (control.appearance?.multiline === true ? " native-multiline-tabs" : "") + (controlUsesVisualProfile(control, "opendental", "TabControl") ? " native-od-tabs" : "")} data-control={control.name}>
    <div ref={tabsRef} className="native-tab-list" role="tablist">{pages.map((item: Control, pageIndex: number) => <button type="button" role="tab" disabled={item.appearance?.enabled === false} tabIndex={active === pageIndex ? 0 : -1} aria-selected={active === pageIndex} className={active === pageIndex ? "active" : ""} key={item.name} onClick={() => item.appearance?.enabled !== false && setActive(pageIndex)} onKeyDown={(event) => keyboardTab(event, pageIndex)}>{displayText(item) || "Tab " + (pageIndex + 1)}</button>)}</div>
    <div className="native-tab-page native-absolute-tab-page" role="tabpanel">{page && <RuntimeCoordinateSpaceContext.Provider value={{ width: page.bounds?.width, height: page.bounds?.height }}><ControlTree controls={page.children || []} registry={registry} depth={depth + 1} contextName={page.name} /></RuntimeCoordinateSpaceContext.Provider>}</div>
  </div>;
}

type TabTreeNode = { page: Control; children: TabTreeNode[] };
type FlatTabTreeNode = TabTreeNode & { level: number; parent?: TabTreeNode };

function tabTreeNodes(tabControl: Control): TabTreeNode[] {
  return (tabControl.children || []).filter((child: Control) => child.kind === "TabPage").map((page: Control) => ({
    page,
    children: (page.children || []).filter((child: Control) => child.kind === "TabControl").flatMap((child: Control) => tabTreeNodes(child)),
  }));
}

function flattenTabTree(nodes: TabTreeNode[], level = 1, parent?: TabTreeNode): FlatTabTreeNode[] {
  return nodes.flatMap((node) => [{ ...node, level, parent }, ...flattenTabTree(node.children, level + 1, node)]);
}

function firstTabLeaf(node?: TabTreeNode): TabTreeNode | undefined {
  return node?.children.length ? firstTabLeaf(node.children[0]) : node;
}

function TabTreeNavigator({ control, sourceTabs, registry, depth, style }: { control: Control; sourceTabs: Control; registry: Record<string, React.ComponentType<DefinitionAdapterProps>>; depth: number; style: React.CSSProperties }) {
  const roots = tabTreeNodes(sourceTabs);
  const flat = flattenTabTree(roots);
  const sourceIndex = Math.max(0, Math.min(roots.length - 1, Number(sourceTabs.appearance?.selectedIndex || 0)));
  const autoSelectChild = control.properties?.AutoSelectChild !== false;
  const initial = autoSelectChild ? firstTabLeaf(roots[sourceIndex] || roots[0]) : roots[sourceIndex] || roots[0];
  const [selectedName, setSelectedName] = React.useState(initial?.page.name || "");
  const selectedEntry = flat.find((item) => item.page.name === selectedName) || flat[0];
  const selectedPage = selectedEntry?.page;
  const selectedPageStyle: React.CSSProperties = {
    ...(selectedPage?.appearance?.backColor?.cssColor ? { background: selectedPage.appearance.backColor.cssColor } : {}),
    ...(selectedPage?.appearance?.foreColor?.cssColor ? { color: selectedPage.appearance.foreColor.cssColor } : {}),
  };
  const treeWidth = Math.max(120, Math.min(420, Number(control.properties?.TreeViewSize || 220)));
  const host = React.useRef<HTMLDivElement>(null);
  const selectNode = (node: TabTreeNode, focus = false) => {
    const target = autoSelectChild ? firstTabLeaf(node) || node : node;
    setSelectedName(target.page.name);
    if (focus) window.requestAnimationFrame(() => (host.current?.querySelector('[data-tab-tree-name="' + target.page.name + '"]') as HTMLButtonElement | null)?.focus());
  };
  const keyboardTree = (event: React.KeyboardEvent<HTMLButtonElement>, item: FlatTabTreeNode, itemIndex: number) => {
    let next: FlatTabTreeNode | undefined;
    if (event.key === "ArrowDown") next = flat[Math.min(flat.length - 1, itemIndex + 1)];
    else if (event.key === "ArrowUp") next = flat[Math.max(0, itemIndex - 1)];
    else if (event.key === "Home") next = flat[0];
    else if (event.key === "End") next = flat[flat.length - 1];
    else if (event.key === "ArrowRight" && item.children.length) next = { ...item.children[0], level: item.level + 1, parent: item };
    else if (event.key === "ArrowLeft" && item.parent) next = flat.find((entry) => entry.page.name === item.parent?.page.name);
    else return;
    if (!next) return;
    event.preventDefault();
    selectNode(next, true);
  };
  return <div ref={host} style={{ ...style, gridTemplateColumns: treeWidth + "px 1px minmax(0, 1fr)" }} className="native-tab-tree-navigator" data-control={control.name}>
    <div className="native-tab-tree-nav" role="tree" aria-label={displayText(control) || humanizeType(control.name)}>
      {flat.map((item, itemIndex) => { const iconControl = item.page.appearance?.imageKey || item.page.appearance?.image ? item.page : control; return <button type="button" role="treeitem" aria-level={item.level} aria-expanded={item.children.length ? true : undefined}
        aria-selected={selectedEntry?.page.name === item.page.name} tabIndex={selectedEntry?.page.name === item.page.name ? 0 : -1}
        className={"native-tab-tree-item" + (selectedEntry?.page.name === item.page.name ? " selected" : "")}
        data-tab-tree-name={item.page.name} key={item.page.name} style={{ paddingLeft: 8 + (item.level - 1) * 18 }}
        onClick={() => selectNode(item)} onKeyDown={(event) => keyboardTree(event, item, itemIndex)}>
        {controlIconUrl(iconControl) && <ControlIcon control={iconControl} className="native-tab-tree-icon" />}
        <span>{displayText(item.page) || humanizeType(item.page.name.replace(/^tp/i, ""))}</span>
      </button>; })}
    </div>
    <div className="native-tab-tree-separator" />
    <div className="native-tab-tree-page" style={selectedPageStyle} role="tabpanel" aria-label={selectedPage ? displayText(selectedPage) || humanizeType(selectedPage.name) : undefined}>
      {selectedPage && <RuntimeCoordinateSpaceContext.Provider value={{ width: selectedPage.bounds?.width, height: selectedPage.bounds?.height }}><ControlTree controls={(selectedPage.children || []).filter((child: Control) => child.kind !== "TabControl")} registry={registry} depth={depth + 1} contextName={selectedPage.name} /></RuntimeCoordinateSpaceContext.Provider>}
    </div>
  </div>;
}

function NativeListBox({ control, style }: { control: Control; style: React.CSSProperties }) {
  const items = (control.items || []) as string[];
  const initial = Math.max(-1, Math.min(items.length - 1, Number(control.appearance?.selectedIndex ?? -1)));
  const [selected, setSelected] = React.useState(initial);
  const moveSelection = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!items.length || control.appearance?.enabled === false) return;
    let next = selected;
    if (event.key === "ArrowDown") next = Math.min(items.length - 1, selected + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, selected < 0 ? 0 : selected - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
  };
  return <div style={style} className={"migration-list native-list-box" + (controlUsesVisualProfile(control, "opendental", "ListBox") ? " native-od-list-box" : "") + (control.appearance?.enabled === false ? " disabled" : "")}
    role="listbox" aria-disabled={control.appearance?.enabled === false} tabIndex={control.appearance?.enabled === false ? -1 : 0} onKeyDown={moveSelection}>
    {items.map((item, index) => <div key={index} role="option" aria-selected={selected === index}
      className={"native-list-box-item" + (selected === index ? " selected" : "")}
      onClick={() => control.appearance?.enabled !== false && setSelected(index)}>{item}</div>)}
  </div>;
}

function NativePropertyGrid({ control, style }: { control: Control; style: React.CSSProperties }) {
  const showToolbar = control.properties?.ToolbarVisible !== false;
  const showHelp = control.properties?.HelpVisible !== false;
  const fields = (control.propertyGridSource?.fields || []) as any[];
  const categorized = /Categorized/i.test(String(control.properties?.PropertySort || "CategorizedAlphabetical"));
  const [selected, setSelected] = React.useState(0);
  const [values, setValues] = React.useState<Record<string, string | number | boolean>>(() => Object.fromEntries(
    fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.name, field.defaultValue]),
  ));
  const selectedField = fields[selected];
  const rows: Array<{ category?: string; field?: any }> = [];
  let previousCategory = "";
  fields.forEach((field) => {
    const category = String(field.category || "Misc");
    if (categorized && category !== previousCategory) rows.push({ category });
    rows.push({ field });
    previousCategory = category;
  });
  return <div style={style} className={"native-property-grid" + (control.appearance?.enabled === false ? " disabled" : "")}>
    {showToolbar && <div className="native-property-grid-toolbar" aria-label="Property grid toolbar">
      <button type="button" className={categorized ? "active" : ""} title="Categorized" aria-label="Categorized"><span aria-hidden="true">▦</span></button>
      <button type="button" className={!categorized ? "active" : ""} title="Alphabetical" aria-label="Alphabetical"><span aria-hidden="true">A↕</span></button>
      <span className="native-property-grid-toolbar-separator" />
      <button type="button" title="Property pages" aria-label="Property pages"><span aria-hidden="true">▤</span></button>
    </div>}
    <div className="native-property-grid-body" aria-label="Property values">
      {rows.map((row) => row.category
        ? <div className="native-property-grid-category" key={"category-" + row.category}><span aria-hidden="true">−</span>{row.category}</div>
        : (() => {
          const field = row.field;
          const fieldIndex = fields.indexOf(field);
          const boolField = /(?:^|\.)bool\??$/i.test(String(field.typeName));
          const choiceField = !boolField && !/(?:^|\.)(?:string|char|s?byte|u?short|u?int|u?long|float|double|decimal|DateTime)\??$/i.test(String(field.typeName));
          const value = values[field.name] ?? "";
          const disabled = control.appearance?.enabled === false || field.readOnly === true;
          return <div className={"native-property-grid-row" + (selected === fieldIndex ? " selected" : "")} key={field.name}
            title={field.description || field.label} onClick={() => setSelected(fieldIndex)}>
            <button type="button" className="native-property-grid-name" disabled={control.appearance?.enabled === false}
              onFocus={() => setSelected(fieldIndex)}>{field.label}</button>
            <span className="native-property-grid-value">
              {boolField
                ? <input type="checkbox" aria-label={field.label} checked={value === true} disabled={disabled}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />
                : <input type={field.password ? "password" : "text"} aria-label={field.label} value={String(value)} readOnly={disabled}
                    onFocus={() => setSelected(fieldIndex)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />}
              {choiceField && <button type="button" className="native-property-grid-drop" disabled={disabled} aria-label={"Choose " + field.label}>▾</button>}
              {field.hasEditor && <button type="button" className="native-property-grid-editor" disabled={disabled} aria-label={"Edit " + field.label}>…</button>}
            </span>
          </div>;
        })())}
    </div>
    {showHelp && <div className="native-property-grid-help" aria-live="polite"><strong>{selectedField?.label || ""}</strong><span>{selectedField?.description || ""}</span></div>}
  </div>;
}

type FlatNativeTreeNode = { name: string; text: string; level: number; hasChildren: boolean };

function flattenNativeTree(control: Control): FlatNativeTreeNode[] {
  const children = control.treeNodeChildren || {};
  const texts = control.treeNodeTexts || {};
  const visit = (names: string[], level: number): FlatNativeTreeNode[] => names.flatMap((name) => {
    const childNames = children[name] || [];
    return [{ name, text: texts[name] || name, level, hasChildren: childNames.length > 0 }, ...visit(childNames, level + 1)];
  });
  return visit(control.treeRootNodes || [], 1);
}

function NativeTreeView({ control, style }: { control: Control; style: React.CSSProperties }) {
  const items = flattenNativeTree(control);
  const [selected, setSelected] = React.useState(items[0]?.name || "");
  const host = React.useRef<HTMLDivElement>(null);
  const moveSelection = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = Math.max(0, items.length - 1);
    else return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    setSelected(item.name);
    window.requestAnimationFrame(() => (host.current?.querySelector('[data-tree-name="' + item.name + '"]') as HTMLButtonElement | null)?.focus());
  };
  return <div ref={host} style={style} className={"native-generic-tree" + (control.appearance?.enabled === false ? " disabled" : "")} role="tree" aria-disabled={control.appearance?.enabled === false}>
    {items.map((item, index) => <button type="button" role="treeitem" aria-level={item.level} aria-expanded={item.hasChildren ? true : undefined}
      aria-selected={selected === item.name} disabled={control.appearance?.enabled === false} tabIndex={selected === item.name ? 0 : -1}
      className={"native-generic-tree-row" + (selected === item.name ? " selected" : "")} data-tree-name={item.name} key={item.name}
      style={{ paddingLeft: 4 + (item.level - 1) * 18 }} onClick={() => setSelected(item.name)} onKeyDown={(event) => moveSelection(event, index)}>
      <span className="native-generic-tree-expander" aria-hidden="true">{item.hasChildren ? "▾" : ""}</span><span>{item.text}</span>
    </button>)}
  </div>;
}

function FileStatusPreview({ control, contextName, style }: { control: Control; contextName?: string; style: React.CSSProperties }) {
  const [selected, setSelected] = React.useState(contextName === "Staged" ? -1 : 1);
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const treeItems = (control.treeRootNodes || []).slice(0, 8).map((name: string) => ({ status: "", path: control.treeNodeTexts?.[name] || name }));
  const previewItems = contextName === "Staged" ? [] : previewFilePaths.slice(0, 4).map((path, index) => ({ status: index === 2 ? "A" : "M", path }));
  const items = treeItems.length ? treeItems : previewItems;
  const openMenu = (event: React.MouseEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(index);
    const list = event.currentTarget.closest(".native-file-list")?.getBoundingClientRect();
    setMenu({ x: Math.max(4, Math.min(event.clientX - (list?.left || 0), (list?.width || 220) - 184)), y: Math.max(24, Math.min(event.clientY - (list?.top || 0), (list?.height || 180) - 128)) });
  };
  return <div style={style} className="migration-tree native-file-list" role="listbox" onClick={() => setMenu(null)}>
    <div className="native-list-caption"><span>{contextName === "Staged" ? "Staged changes" : "Working dir changes"}</span><small>{items.length} files</small></div>
    {items.map((item: any, index: number) => <div className={"migration-tree-row" + (index === selected ? " selected" : "")} key={item.path} role="option" aria-selected={index === selected} tabIndex={0}
      onClick={(event) => { event.stopPropagation(); setSelected(index); setMenu(null); }} onContextMenu={(event) => openMenu(event, index)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); } }}>
      <span className={"file-status status-" + item.status.toLowerCase()}>{item.status || "·"}</span><span className="file-path">{item.path}</span>
    </div>)}
    {!items.length && <div className="migration-tree-empty">There are no staged changes</div>}
    {menu && <div className="native-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => setMenu(null)}>{contextName === "Staged" ? "Unstage selected" : "Stage selected"}<kbd>S</kbd></button>
      <button type="button" role="menuitem" onClick={() => setMenu(null)}>Open working directory file</button>
      <button type="button" role="menuitem" onClick={() => setMenu(null)}>Open with difftool</button>
      <span className="context-separator" />
      <button type="button" role="menuitem" onClick={() => setMenu(null)}>File history<kbd>Ctrl+H</kbd></button>
    </div>}
  </div>;
}

function compactToolbarControls(controls: Control[]): Control[] {
  const direct = controls.filter((control) => control.kind !== "ToolStripMenuItem" && control.properties?.nonVisual !== true);
  const preferred = direct.filter((control) => !/^(?:sep|toolStripSeparator)/i.test(control.name) || direct.length <= 10);
  return preferred.slice(0, 10);
}

function controlStyle(control: Control, coordinateSpace: RuntimeCoordinateSpace = {}): React.CSSProperties {
  const bounds = control.bounds || (control.dock ? { x: 0, y: 0, width: 0, height: 0 } : undefined);
  const style: React.CSSProperties = bounds
    ? { position: "absolute", left: bounds.x, top: bounds.y, width: Math.max(bounds.width, 1), height: Math.max(bounds.height, 1) }
    : { position: "relative" };
  if (bounds) applyWinFormsEdges(style, control, bounds, coordinateSpace);
  if (bounds) applyWinFormsAutoSize(style, control, bounds);
  if (control.appearance?.visible === false) style.display = "none";
  if (control.appearance?.backColor?.cssColor) style.background = control.appearance.backColor.cssColor;
  if (control.appearance?.foreColor?.cssColor) style.color = control.appearance.foreColor.cssColor;
  return applyAppearanceStyle(style, control);
}

function applyWinFormsAutoSize(style: React.CSSProperties, control: Control, bounds: { width: number; height: number }) {
  if (control.autoSize !== true || control.dock || !["Label", "LinkLabel", "CheckBox", "RadioButton", "Button"].includes(control.kind)) return;
  // An empty design-time Label commonly has width 0 and receives text from a
  // constructor/property setter. WinForms recomputes its PreferredSize;
  // retaining the parsed zero-width box would hide the proven runtime text.
  if (bounds.width <= 1) {
    style.width = "max-content";
    style.minWidth = 0;
  }
  if (bounds.height <= 1) {
    style.height = "max-content";
    style.minHeight = 0;
  }
}

function applyWinFormsEdges(style: React.CSSProperties, control: Control, bounds: { x: number; y: number; width: number; height: number }, space: RuntimeCoordinateSpace) {
  const sourceWidth = Number(space.width);
  const sourceHeight = Number(space.height);
  const hasWidth = Number.isFinite(sourceWidth) && sourceWidth > 0;
  const hasHeight = Number.isFinite(sourceHeight) && sourceHeight > 0;
  const right = hasWidth ? sourceWidth - bounds.x - bounds.width : undefined;
  const bottom = hasHeight ? sourceHeight - bounds.y - bounds.height : undefined;
  const dock = String(control.dock || "");
  if (dock === "Fill") {
    style.left = bounds.x;
    style.top = bounds.y;
    if (right !== undefined) { style.right = right; delete style.width; }
    if (bottom !== undefined) { style.bottom = bottom; delete style.height; }
    return;
  }
  if (dock === "Top" || dock === "Bottom") {
    style.left = bounds.x;
    if (right !== undefined) { style.right = right; delete style.width; }
    if (dock === "Bottom" && bottom !== undefined) { style.bottom = bottom; delete style.top; }
    return;
  }
  if (dock === "Left" || dock === "Right") {
    style.top = bounds.y;
    if (bottom !== undefined) { style.bottom = bottom; delete style.height; }
    if (dock === "Right" && right !== undefined) { style.right = right; delete style.left; }
    return;
  }
  const anchors = new Set((control.anchor || []).map(String));
  if (anchors.has("Left") && anchors.has("Right") && right !== undefined) {
    style.right = right;
    delete style.width;
  } else if (!anchors.has("Left") && anchors.has("Right") && right !== undefined) {
    style.right = right;
    delete style.left;
  }
  if (anchors.has("Top") && anchors.has("Bottom") && bottom !== undefined) {
    style.bottom = bottom;
    delete style.height;
  } else if (!anchors.has("Top") && anchors.has("Bottom") && bottom !== undefined) {
    style.bottom = bottom;
    delete style.top;
  }
}

function normalizedControlStyle(control: Control): React.CSSProperties {
  const compact = ["Button", "ToolStripButton", "ToolStripDropDownButton", "ToolStripSplitButton", "ToolStripMenuItem", "Label", "LinkLabel", "ToolStripLabel", "ToolStripStatusLabel", "CheckBox", "RadioButton", "ToolStripSeparator"].includes(control.kind);
  const style: React.CSSProperties = compact ? { maxWidth: "100%" } : { width: "100%", height: "100%", minHeight: 0 };
  if (control.appearance?.visible === false) style.display = "none";
  if (control.appearance?.backColor?.cssColor) style.background = control.appearance.backColor.cssColor;
  if (control.appearance?.foreColor?.cssColor) style.color = control.appearance.foreColor.cssColor;
  return applyAppearanceStyle(style, control);
}

function applyAppearanceStyle(style: React.CSSProperties, control: Control): React.CSSProperties {
  const appearance = control.appearance || {};
  const font = appearance.font || {};
  if (font.family) style.fontFamily = font.family;
  if (Number(font.size) > 0) style.fontSize = Number(font.size) * 4 / 3;
  if (font.bold) style.fontWeight = 700;
  if (font.italic) style.fontStyle = "italic";
  if (font.underline) style.textDecoration = "underline";
  if (font.strikeout) style.textDecoration = [style.textDecoration, "line-through"].filter(Boolean).join(" ");

  const alignment = appearance.textAlign || {};
  const horizontal = typeof alignment === "string" ? alignment : String(alignment.horizontal || "");
  const vertical = typeof alignment === "string" ? alignment : String(alignment.vertical || "");
  if (/Right$/i.test(horizontal)) {
    style.textAlign = "right";
    style.justifyContent = "flex-end";
  } else if (/Center$/i.test(horizontal)) {
    style.textAlign = "center";
    style.justifyContent = "center";
  } else if (/Left$/i.test(horizontal)) {
    style.textAlign = "left";
    style.justifyContent = "flex-start";
  }
  if (/Top/i.test(vertical)) style.alignItems = "flex-start";
  if (/Middle/i.test(vertical)) style.alignItems = "center";
  if (/Bottom/i.test(vertical)) style.alignItems = "flex-end";
  if (appearance.borderStyle === "FixedSingle") style.border = "1px solid #a0a0a0";
  if (appearance.borderStyle === "Fixed3D") style.border = "2px inset #c0c0c0";
  if (appearance.borderStyle === "None") style.border = "0";
  if (appearance.padding) {
    const padding = appearance.padding;
    style.padding = Number(padding.top || 0) + "px " + Number(padding.right || 0) + "px "
      + Number(padding.bottom || 0) + "px " + Number(padding.left || 0) + "px";
  }
  if (Number(appearance.minimumSize?.width) > 0) style.minWidth = Number(appearance.minimumSize.width);
  if (Number(appearance.minimumSize?.height) > 0) style.minHeight = Number(appearance.minimumSize.height);
  if (Number(appearance.maximumSize?.width) > 0) style.maxWidth = Number(appearance.maximumSize.width);
  if (Number(appearance.maximumSize?.height) > 0) style.maxHeight = Number(appearance.maximumSize.height);
  if (appearance.rightToLeft === true || appearance.rightToLeft === "Yes") style.direction = "rtl";
  return style;
}

function textAreaStyle(style: React.CSSProperties, scrollBars: unknown): React.CSSProperties {
  const mode = String(scrollBars || "Both");
  if (mode === "None") return { ...style, overflowX: "hidden", overflowY: "hidden" };
  if (mode === "Horizontal") return { ...style, overflowX: "auto", overflowY: "hidden" };
  if (mode === "Vertical") return { ...style, overflowX: "hidden", overflowY: "auto" };
  return { ...style, overflowX: "auto", overflowY: "auto" };
}

function buttonImageAlignmentClass(control: Control): string {
  const alignment = control.appearance?.imageAlign;
  if (!alignment) return "";
  if (alignment.vertical === "Top") return " native-button-image-top";
  if (alignment.vertical === "Bottom") return " native-button-image-bottom";
  if (alignment.horizontal === "Right") return " native-button-image-right";
  return " native-button-image-left";
}

function eventTitle(control: Control): string {
  return (control.events || []).map((event: any) => event.event + " → " + event.handler).join("\\n");
}

function controlIconUrl(control: Control): string | undefined {
  const raw = control.appearance?.imageKey || control.appearance?.image;
  const key = String(raw || "").split(".").pop()?.replace(/[^A-Za-z0-9_-]/g, "");
  return key ? visualAssets[key] : undefined;
}

function ControlIcon({ control, className, fallback }: { control: Control; className: string; fallback?: string }) {
  const source = controlIconUrl(control);
  return <span className={className}>{source ? <img src={source} alt="" /> : fallback}</span>;
}

function displayText(control: Control): string {
  const statusText: Record<string, string> = {
    commitAuthorStatus: "Author configured", toolStripStatusBranchIcon: "⑂", branchNameLabel: "master",
    remoteNameLabel: "origin/master", commitEndPadding: "",
  };
  if (control.name in statusText) return statusText[control.name];
  if (control.text) return String(control.text).replace(/&/g, "");
  const known: Record<string, string> = {
    CommitAndPush: "Commit & push", btnResetAllChanges: "Reset all changes", btnResetUnstagedChanges: "Reset unstaged changes",
    btnRefresh: "Refresh", btnCollapseGroups: "Collapse groups", btnAsTree: "Tree view", btnByPath: "Group by path",
    btnByExtension: "Group by extension", btnByStatus: "Group by status", btnFindInFilesGitGrep: "Find in files",
    nextChangeButton: "Next change", previousChangeButton: "Previous change", increaseNumberOfLines: "More context",
    decreaseNumberOfLines: "Less context", showEntireFileButton: "Show entire file", settingsButton: "Settings",
    toolStageAllItem: "Stage all", toolUnstageAllItem: "Unstage all",
  };
  if (known[control.name]) return known[control.name];
  if (["Button", "ToolStripButton", "ToolStripDropDownButton", "ToolStripSplitButton", "ToolStripMenuItem", "CheckBox", "RadioButton", "Label", "LinkLabel", "ToolStripLabel", "ToolStripStatusLabel", "GroupBox", "TabPage"].includes(control.kind)) return "";
  return labelFromName(control.name)
    .replace(/^(?:btn|tool|tsmi|cbo|lbl)\\s+/i, "")
    .replace(/\\s+(?:button|item)$/i, "")
    .trim();
}

function controlButtonGlyph(control: Control): string {
  const icon = String(control.appearance?.imageKey || control.properties?.Icon || "");
  if (/(?:DeleteX|Remove|Clear|Close)/i.test(icon)) return "×";
  if (/(?:Add|Plus|New)/i.test(icon)) return "+";
  if (/(?:Edit|Pencil)/i.test(icon)) return "✎";
  if (/(?:Search|Find)/i.test(icon)) return "⌕";
  return buttonGlyph(control.name);
}

function buttonGlyph(name: string): string {
  if (/commitandpush/i.test(name)) return "↗";
  if (/commit/i.test(name)) return "✓";
  if (/unstage/i.test(name)) return "↑";
  if (/stage/i.test(name)) return "↓";
  if (/reset/i.test(name)) return "↶";
  if (/refresh/i.test(name)) return "↻";
  if (/previous/i.test(name)) return "↑";
  if (/next/i.test(name)) return "↓";
  if (/increase/i.test(name)) return "+";
  if (/decrease/i.test(name)) return "−";
  if (/find|search/i.test(name)) return "⌕";
  if (/toggleleft/i.test(name)) return "☰";
  if (/togglesplit|commitinfoposition/i.test(name)) return "▥";
  if (/levelup/i.test(name)) return "↑";
  if (/worktree|branch/i.test(name)) return "⑂";
  if (/workingdir/i.test(name)) return "⌂";
  if (/pull/i.test(name)) return "↓";
  if (/push/i.test(name)) return "↑";
  if (/stash/i.test(name)) return "▣";
  if (/explorer/i.test(name)) return "▧";
  if (/shell/i.test(name)) return ">_";
  if (/settings|options/i.test(name)) return "⚙";
  if (/tree|path|extension|status/i.test(name)) return "▦";
  return "";
}

function toolbarShowsText(control: Control): boolean {
  return /(?:WorkingDir|branchSelect|ButtonCommit)$/i.test(control.name);
}

function tabGlyph(label?: string): string {
  if (/diff/i.test(label || "")) return "▤";
  if (/tree/i.test(label || "")) return "▱";
  if (/gpg/i.test(label || "")) return "🔑";
  if (/console/i.test(label || "")) return "▣";
  return "●";
}

function labelFromName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}

function humanizeType(value: string): string {
  return labelFromName(value).replace(/\\b(?:Control|Ex)\\b/g, "").replace(/\\s+/g, " ").trim() || value;
}
`;
}

export function migrationStylesCss(): string {
  return `* { box-sizing: border-box; }
body { margin: 0; background: #f4f6f8; color: #172033; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.migration-page { min-width: 0; }
.migration-page-header { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding: 14px 20px; background: white; border-bottom: 1px solid #e0e4e9; }
.migration-page-header h2 { margin: 0 0 4px; font-size: 18px; }
.migration-page-header small { color: #778196; }
.migration-badges { display: flex; gap: 6px; }
.migration-canvas-scroll { overflow: auto; min-height: calc(100vh - 72px); }
.migration-layout-scroll { padding: 12px; }
.migration-canvas { position: relative; overflow: hidden; margin: 0 auto; background: #efefef; border: 1px solid #8795a4; border-radius: 3px; box-shadow: 0 12px 32px rgba(34, 48, 73, .16); }
.migration-layout-canvas { display: flex; flex-direction: column; width: min(1180px, 100%); height: clamp(590px, calc(100vh - 132px), 760px); min-width: 780px; padding: 0; }
.native-presentation .migration-page-header { display: none; }
.native-presentation .migration-canvas-scroll { min-height: 590px; }
.native-presentation .migration-layout-scroll { padding: 0; }
.native-presentation .migration-canvas { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
.native-presentation .migration-layout-canvas { width: 100%; height: clamp(620px, calc(100vh - 2px), 725px); }
.native-presentation { color: #202020; font: 11px "Segoe UI",Tahoma,sans-serif; }
.native-presentation button, .native-presentation input, .native-presentation select, .native-presentation textarea { font: inherit; }
.native-presentation button:focus-visible, .native-presentation input:focus-visible, .native-presentation select:focus-visible { outline: 1px dotted #111; outline-offset: -3px; }
.native-presentation ::-webkit-scrollbar { width: 16px; height: 16px; }
.native-presentation ::-webkit-scrollbar-track { background: #f0f0f0; }
.native-presentation ::-webkit-scrollbar-thumb { min-height: 28px; background: #c5c5c5; border: 3px solid #f0f0f0; }
.native-presentation ::-webkit-scrollbar-thumb:hover { background: #a9a9a9; }
.native-presentation ::-webkit-scrollbar-corner { background: #f0f0f0; }
.native-window-titlebar { display: flex; flex: 0 0 31px; align-items: center; gap: 7px; height: 31px; padding-left: 8px; color: #1f2937; background: #fff; border-bottom: 1px solid #d2d2d2; font: 12px "Segoe UI", sans-serif; user-select: none; }
.native-window-titlebar > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
.native-app-icon { display: grid; flex: 0 0 17px; width: 17px; height: 17px; place-items: center; color: #168b42; background: transparent; font-weight: 700; }
.native-app-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-generic-app-icon { position: relative; border: 1px solid #2d6e9f; background: linear-gradient(135deg,#f7fbff 0 45%,#87b9dd 46% 100%); }
.native-generic-app-icon::after { position: absolute; right: 2px; bottom: 2px; width: 5px; height: 4px; content: ""; border-left: 1px solid #2d6e9f; border-top: 1px solid #2d6e9f; }
.native-repository { color: #687587; }
.native-window-buttons { display: flex; align-self: stretch; margin-left: auto; }
.native-window-buttons button { display: grid; width: 42px; padding: 0; place-items: center; color: #465263; border: 0; background: transparent; font: 12px "Segoe UI",sans-serif; }
.native-window-buttons button:hover { background: #dce3eb; }
.native-window-buttons button:last-child:hover { color: white; background: #d83b01; }
.native-window-body { position: relative; flex: 1; min-height: 0; padding: 0; }
.native-fixed-client { position: relative; width: 100%; height: 100%; overflow: hidden; background: #f0f0f0; --wf-control-surface: #f0f0f0; }
.native-fixed-form .migration-canvas-scroll { min-height: 100vh; padding: 12px; background: #dfe3e8; }
.native-fixed-form .migration-canvas { margin: 0 auto; border: 1px solid #707070; box-shadow: 0 10px 26px rgba(20,31,43,.28); }
.native-fixed-form :is(.ant-input,.ant-input-number,.ant-select-selector) { border-color: #7a7a7a !important; border-radius: 0 !important; box-shadow: none !important; background: #fff; font: inherit; }
.native-fixed-form .ant-input { padding: 1px 3px; }
.native-fixed-form :is(.ant-input,.ant-btn,.ant-select-selection-item,.ant-checkbox-wrapper,.ant-radio-wrapper) { line-height: normal; }
.native-fixed-form .ant-input:focus, .native-fixed-form .ant-input-number-focused, .native-fixed-form .ant-select-focused .ant-select-selector { border-color: #0078d7 !important; box-shadow: inset 0 0 0 1px #0078d7 !important; }
.native-fixed-form .ant-input[readonly], .native-fixed-form .ant-input.ant-input-disabled, .native-fixed-form .ant-input-number-disabled, .native-fixed-form .ant-select-disabled .ant-select-selector { color: #555 !important; background: #f0f0f0 !important; }
.native-fixed-form .ant-select, .native-fixed-form .ant-select-selector { min-height: 0 !important; height: 100% !important; }
.native-fixed-form .ant-select-selection-item { line-height: normal !important; }
.native-fixed-form .native-editable-combo .ant-select-selector { cursor: text !important; }
.native-fixed-form .native-list-combo .ant-select-selector { cursor: default !important; }
.native-fixed-form .native-number-input .ant-input-number-input { text-align: inherit; }
.native-fixed-form .native-text-area.ant-input { resize: none; overflow: auto; }
.native-fixed-form :is(.migration-label,.migration-check) { min-height: 0; padding: 0; line-height: normal; }
.native-fixed-form :is(.ant-checkbox-wrapper,.ant-radio-wrapper) { display: flex; align-items: center; height: 100%; }
.native-fixed-form :is(.ant-checkbox-wrapper,.ant-radio-wrapper) > span:last-child { padding-inline: 3px 0; }
.native-fixed-form .check-right :is(.ant-checkbox-wrapper,.ant-radio-wrapper) { flex-direction: row-reverse; }
.native-fixed-form .check-right :is(.ant-checkbox-wrapper,.ant-radio-wrapper) > span:last-child { padding-inline: 0 3px; }
.native-fixed-form .ant-checkbox-inner { width: 13px; height: 13px; border-color: #707070; border-radius: 0; }
.native-fixed-form .ant-checkbox-checked .ant-checkbox-inner { background: #fff; border-color: #707070; }
.native-fixed-form .ant-checkbox-checked .ant-checkbox-inner::after { border-color: #111; }
.native-fixed-form .ant-radio-inner { width: 13px; height: 13px; border-color: #707070; background: #fff; }
.native-fixed-form .ant-radio-checked .ant-radio-inner { border-color: #707070; background: #fff; }
.native-fixed-form .ant-radio-checked .ant-radio-inner::after { transform: scale(.55); background: #111; }
.native-fixed-form .native-absolute-tabs { background: #f0f0f0; }
.native-fixed-form .native-absolute-tabs .native-tab-list { flex: 0 0 20px; height: 20px; padding: 1px 2px 0; background: #f0f0f0; }
.native-fixed-form .native-absolute-tabs.native-multiline-tabs .native-tab-list { flex: 0 0 auto; align-content: flex-end; flex-wrap: wrap; min-height: 20px; height: auto; overflow: hidden; }
.native-fixed-form .native-absolute-tabs .native-tab-list button { height: 19px; padding: 0 6px; line-height: normal; }
.native-fixed-form .native-absolute-tabs .native-tab-list button.active { height: 20px; }
.native-fixed-form .native-absolute-tab-page { margin: 0 1px 1px; background: #f0f0f0; }
.native-fixed-form .kind-groupbox { border-color: #8e8e8e; background: var(--wf-control-surface); }
.native-fixed-form .migration-container-title { background: var(--wf-control-surface); font: inherit; }
.native-command-toast { position: absolute; z-index: 80; right: 12px; bottom: 12px; display: grid; grid-template-columns: auto minmax(130px,1fr); gap: 2px 8px; min-width: 270px; max-width: 420px; padding: 7px 10px; color: #253242; background: #f9fbfd; border: 1px solid #8798aa; box-shadow: 2px 4px 12px rgba(0,0,0,.28); font: 11px "Segoe UI",sans-serif; }
.native-command-toast strong { color: #2365a3; }
.native-command-toast small { grid-column: 1 / -1; color: #6f7d8c; }
.layout-control, .layout-layers, .layout-frame, .layout-stack, .layout-split, .layout-grid, .native-tabs, .native-tab-page, .layout-pane, .layout-child, .layout-grid-cell { min-width: 0; min-height: 0; }
.layout-control, .layout-layers, .layout-frame, .layout-split, .layout-grid, .native-tabs { width: 100%; height: 100%; }
.layout-split { display: grid; gap: 0; background: #d3d3d3; }
.layout-single-pane { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.layout-pane { overflow: hidden; border: 0; background: #f3f3f3; }
.native-splitter { position: relative; z-index: 4; display: grid; place-items: center; outline: none; background: linear-gradient(90deg,#c6c9cc,#e5e5e5,#c6c9cc); touch-action: none; }
.layout-split.axis-horizontal > .native-splitter { cursor: col-resize; }
.layout-split.axis-vertical > .native-splitter { background: linear-gradient(#c6c9cc,#e5e5e5,#c6c9cc); cursor: row-resize; }
.native-splitter span { width: 2px; height: 28px; border-left: 1px dotted #7e8791; border-right: 1px dotted #f7f7f7; opacity: 0; }
.layout-split.axis-vertical > .native-splitter span { width: 28px; height: 2px; border: 0; border-top: 1px dotted #7e8791; border-bottom: 1px dotted #f7f7f7; }
.native-splitter:hover span, .native-splitter:focus span { opacity: 1; }
.native-splitter:focus { background: #c7d9ef; }
.layout-stack { display: flex; gap: 0; width: 100%; height: 100%; }
.layout-stack.axis-vertical { flex-direction: column; }
.layout-stack.axis-horizontal { flex-direction: row; align-items: center; flex-wrap: nowrap; }
.layout-child { overflow: hidden; }
.layout-child-toolbar, .layout-child-actions, .layout-child-status { overflow: hidden; }
.layout-child-toolbar, .layout-stack.layout-role-toolbar > .layout-child { position: relative; z-index: 12; overflow: visible; }
.layout-role-toolbar { min-height: 25px; }
.layout-role-toolbar.layout-stack { gap: 0; }
.layout-role-actions { display: flex; justify-content: flex-end; align-items: center; min-height: 28px; padding: 2px 4px; background: #ededed; }
.layout-stack.layout-role-actions.axis-vertical { justify-content: flex-start; align-items: stretch; gap: 5px; height: 100%; padding: 5px; overflow: auto; }
.layout-stack.layout-role-actions.axis-vertical .layout-child { width: 100%; }
.layout-stack.layout-role-actions.axis-vertical .ant-btn { width: 100%; justify-content: flex-start; }
.layout-role-status { min-height: 22px; padding: 2px 7px; background: #ededed; border-top: 1px solid #aeb5bd; }
.layout-layers { position: relative; overflow: hidden; }
.layout-variant-badge { position: absolute; z-index: 8; right: 4px; top: 3px; height: 19px; padding: 1px 5px; border: 1px solid #b8c0ca; border-radius: 2px; color: #697586; background: rgba(242,242,242,.94); font: 9px "Segoe UI",sans-serif; opacity: 0; transition: opacity .12s; cursor: pointer; }
.layout-layers:hover > .layout-variant-badge { opacity: .78; }
.layout-variant-badge:focus { opacity: 1; outline: 1px solid #0078d7; }
.state-alternative { display: grid; place-items: center; }
.layout-grid { display: grid; gap: 3px; padding: 0; background: #cfd2d5; }
.layout-grid-cell { overflow: hidden; background: #f2f2f2; }
.layout-frame { position: relative; overflow: hidden; padding: 0; background: #f3f3f3; }
.layout-frame-title { display: block; margin-bottom: 3px; color: #59677b; font-size: 11px; font-weight: 600; }
.layout-empty { min-height: 1px; }
.native-tabs { display: flex; flex-direction: column; overflow: hidden; background: #f3f3f3; border: 1px solid #9ea7b1; font: 11px "Segoe UI",sans-serif; }
.native-tab-list { display: flex; flex: 0 0 26px; align-items: flex-end; gap: 1px; padding: 3px 3px 0; background: #e8e8e8; border-bottom: 1px solid #9ea7b1; }
.native-tab-list button { min-width: 60px; height: 23px; padding: 2px 9px; color: #313a45; background: linear-gradient(#f7f7f7,#dedede); border: 1px solid #a8afb7; border-bottom: 0; font: inherit; cursor: default; }
.native-tab-list button span { margin-right: 5px; color: #3a68a0; font-size: 11px; }
.native-tab-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; vertical-align: -3px; }
.native-tab-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-tab-list button.active { position: relative; z-index: 2; height: 24px; margin-bottom: -1px; background: #fff; }
.native-tab-list button:focus-visible { outline: 1px dotted #111; outline-offset: -3px; }
.native-tab-page { flex: 1; overflow: hidden; padding: 3px; background: #fff; }
.native-tab-page.terminal-page { padding: 0; }
.native-absolute-tabs { position: absolute; }
.native-absolute-tabs .native-tab-list button { min-width: 0; padding-right: 10px; padding-left: 10px; }
.native-absolute-tab-page { position: relative; padding: 0; }
.native-tab-tree-navigator { display: grid; overflow: hidden; color: #202020; background: #f0f0f0; font: 13px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.native-tab-tree-nav { min-width: 0; padding: 8px 0; overflow: auto; background: #fff; }
.native-tab-tree-item { display: flex; align-items: center; width: 100%; min-height: 25px; padding-top: 2px; padding-right: 7px; padding-bottom: 2px; overflow: hidden; color: inherit; text-align: left; white-space: nowrap; border: 0; background: transparent; font: inherit; cursor: default; }
.native-tab-tree-item:hover { background: #e5f0fb; }
.native-tab-tree-item:focus { outline: 1px dotted #111; outline-offset: -2px; }
.native-tab-tree-item.selected { color: #fff; background: #0078d7; }
.native-tab-tree-icon { display: inline-grid; flex: 0 0 16px; width: 16px; height: 16px; margin-right: 5px; place-items: center; }
.native-tab-tree-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-tab-tree-item > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.native-tab-tree-separator { background: #a0a0a0; box-shadow: 1px 0 #fff; }
.native-tab-tree-page { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #f0f0f0; }
.migration-control, .migration-container, .migration-grid { overflow: hidden; }
.migration-container { position: absolute; border: 1px solid #aeb5bd; background: #f3f3f3; }
.kind-panel, .kind-flowlayoutpanel, .kind-tablelayoutpanel { border-color: transparent; background: transparent; }
.migration-container-title { position: absolute; top: -1px; left: 8px; z-index: 2; background: white; padding: 0 4px; font-size: 11px; }
.migration-label { display: flex; align-items: center; min-height: 18px; padding: 0 3px; overflow: hidden; white-space: nowrap; font: 11px "Segoe UI", sans-serif; }
.migration-link-label { display: flex; align-items: center; min-height: 0; padding: 0; overflow: hidden; color: #0000ff; text-align: left; text-decoration: underline; text-overflow: clip; white-space: nowrap; border: 0; background: transparent; font: inherit; cursor: pointer; }
.migration-link-label:hover, .migration-link-label:focus-visible { color: #ff0000; }
.migration-link-label:disabled { color: #6d6d6d; cursor: default; }
.migration-check { display: flex; align-items: center; min-height: 21px; font: 11px "Segoe UI", sans-serif; }
.migration-strip { position: absolute; display: flex; align-items: center; gap: 2px; overflow: hidden; padding: 1px 3px; background: #ededed; border: 1px solid #b0b7bf; }
.migration-strip.normalized-strip { position: relative; inset: auto; width: 100% !important; height: 100% !important; padding: 1px 5px; border: 0; }
.migration-grid { display: flex; flex-direction: column; border: 1px solid #7a7a7a; background: white; }
.migration-grid-head { display: flex; flex: 0 0 23px; min-height: 23px; overflow: hidden; background: linear-gradient(#fafafa,#e5e5e5); border-bottom: 1px solid #a6a6a6; }
.migration-grid-head span { min-width: 24px; padding: 3px 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; border-right: 1px solid #b8bec5; }
.migration-grid-empty { flex: 1; min-height: 0; background: #fff; }
.native-property-grid { display: flex; flex-direction: column; overflow: hidden; color: #000; border: 1px solid #7a7a7a; background: #fff; font: 11px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.native-property-grid-toolbar { display: flex; flex: 0 0 25px; align-items: center; gap: 1px; min-height: 25px; padding: 1px 2px; border-bottom: 1px solid #a0a0a0; background: #f0f0f0; }
.native-property-grid-toolbar button { display: grid; width: 22px; height: 21px; padding: 0; color: #202020; border: 1px solid transparent; background: transparent; place-items: center; font: 9px "Segoe UI",sans-serif; }
.native-property-grid-toolbar button.active { border-color: #8da4bd; background: #dbe9f7; }
.native-property-grid-toolbar button:hover { border-color: #7da2ce; background: #e5f1fb; }
.native-property-grid-toolbar-separator { width: 1px; height: 19px; margin: 0 2px; background: #a0a0a0; box-shadow: 1px 0 #fff; }
.native-property-grid-body { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; background: inherit; }
.native-property-grid-category { display: flex; align-items: center; gap: 3px; min-height: 20px; padding: 1px 3px; color: #000; border-bottom: 1px solid #d5d5d5; background: #e6e6e6; font-weight: 700; }
.native-property-grid-category span { display: grid; width: 9px; height: 9px; place-items: center; border: 1px solid #6f6f6f; background: #fff; font: 8px Arial,sans-serif; }
.native-property-grid-row { display: grid; grid-template-columns: minmax(90px,44%) minmax(100px,56%); min-height: 20px; color: #000; border-bottom: 1px solid #e0e0e0; background: #fff; }
.native-property-grid-name { min-width: 0; padding: 2px 4px 2px 15px; overflow: hidden; color: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; border: 0; border-right: 1px solid #a0a0a0; background: transparent; font: inherit; }
.native-property-grid-row.selected .native-property-grid-name { color: #fff; background: #0078d7; }
.native-property-grid-value { display: flex; min-width: 0; background: #fff; }
.native-property-grid-value > input[type="text"], .native-property-grid-value > input[type="password"] { flex: 1; min-width: 0; height: 19px; padding: 1px 3px; color: #000; border: 0; outline: 0; background: transparent; font: inherit; }
.native-property-grid-value > input[readonly] { color: #6d6d6d; background: #f3f3f3; }
.native-property-grid-value > input[type="checkbox"] { width: 13px; height: 13px; margin: 3px 4px; accent-color: #fff; }
.native-property-grid-drop, .native-property-grid-editor { flex: 0 0 18px; width: 18px; height: 18px; padding: 0; color: #000; border: 0; border-left: 1px solid #a0a0a0; background: linear-gradient(#fff,#e6e6e6); font: 9px Arial,sans-serif; }
.native-property-grid-editor { font: 11px "Segoe UI",sans-serif; }
.native-property-grid-help { flex: 0 0 54px; min-height: 54px; padding: 4px 5px; border-top: 1px solid #a0a0a0; background: #f0f0f0; }
.native-property-grid-help strong, .native-property-grid-help span { display: block; min-height: 14px; overflow: hidden; text-overflow: ellipsis; }
.native-property-grid-help strong { white-space: nowrap; }
.native-property-grid-help span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.native-property-grid.disabled { color: #6d6d6d; background: #f0f0f0; }
.migration-custom { position: relative; width: 100%; height: 100%; padding: 2px; overflow: hidden; border: 1px solid #b7bec7; background: #f3f3f3; }
.migration-custom.unresolved { display: flex; flex-direction: column; justify-content: center; align-items: center; color: #5b6d86; }
.migration-custom.unresolved span { font-size: 10px; }
.resolved-component { padding: 0; overflow: visible; border: 0; background: transparent; }
.migration-control.custom-host { overflow: visible; }
.component-type-tag { display: none; }
.external-inline { padding: 1px 3px; border: 0; background: #ededed; }
.native-empty-toolbar { display: flex; align-items: center; height: 25px; color: #7b8490; font: 10px "Segoe UI",sans-serif; }
.native-external-surface { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; color: #43546a; background: repeating-linear-gradient(135deg,#f8f8f8,#f8f8f8 7px,#f1f1f1 7px,#f1f1f1 14px); font: 11px "Segoe UI",sans-serif; }
.native-external-surface span { color: #8792a1; font-size: 9px; }
.semantic-date-input { display: flex; width: 100%; height: 100%; min-height: 21px; background: #fff; border: 1px solid #8e969e; }
.semantic-date-input input { min-width: 0; width: 100%; padding: 1px 4px; color: inherit; border: 0; outline: 0; background: #fff; font: inherit; }
.semantic-date-input button { flex: 0 0 21px; width: 21px; padding: 0; color: #303840; border: 0; border-left: 1px solid #b6bbc0; background: linear-gradient(#fff,#e5e5e5); font: 9px "Segoe UI",sans-serif; }
.semantic-text-input, .semantic-combo-input { display: block; width: 100%; height: 100%; min-height: 20px; padding: 1px 4px; color: inherit; border: 1px solid #8e969e; border-radius: 0; background: #fff; font: inherit; }
.semantic-text-input.multiline { resize: none; }
.semantic-date-input input:disabled, .semantic-date-input button:disabled, .semantic-text-input:disabled, .semantic-combo-input:disabled, .semantic-text-input[readonly] { color: #555; background: #f0f0f0; }
.semantic-warning-indicator { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; color: transparent; border: 0; background: transparent; font-size: 0; }
.semantic-warning-indicator::before { position: absolute; inset: 1px 0 1px; content: ""; background: #ffc080; clip-path: polygon(50% 0,100% 100%,0 100%); filter: drop-shadow(0 0 1px #ffa500); }
.semantic-warning-indicator::after { position: absolute; top: 3px; left: 0; width: 100%; content: "!"; color: #fff; text-align: center; font: bold 11px "Microsoft Sans Serif","Segoe UI",sans-serif; }
.migration-inline-controls { display: flex; align-items: center; gap: 2px; width: 100%; height: 100%; overflow: hidden; }
.normalized-control { position: relative !important; inset: auto !important; width: 100% !important; height: 100% !important; min-height: 0; }
.native-command-button.ant-btn, .native-icon-button.ant-btn { height: 23px; padding: 0 7px; border-color: #aeb5bd; border-radius: 2px; background: linear-gradient(#fff,#e9e9e9); box-shadow: none; font: 11px "Segoe UI",sans-serif; }
.native-icon-button.ant-btn { min-width: 24px; padding: 0 5px; }
.native-menu-command.ant-btn { display: flex; justify-content: flex-start; gap: 4px; padding-right: 3px; }
.native-menu-command-arrow { display: grid; align-self: stretch; min-width: 13px; margin-left: auto; place-items: center; border-left: 1px solid #c1c5c9; font-size: 8px; }
.native-menu-button-host { overflow: visible; }
.native-menu-button-host > .ant-btn { position: relative; inset: auto; }
.native-linked-menu { position: absolute; z-index: 1000; top: calc(100% + 1px); left: 0; display: flex; flex-direction: column; padding: 2px; color: #202020; border: 1px solid #979797; background: #f0f0f0; box-shadow: 2px 2px 4px rgba(0,0,0,.24); font: 12px "Segoe UI",sans-serif; }
.native-linked-menu-item-host { position: relative; display: block; }
.native-linked-menu-item-host > button { display: flex; align-items: center; gap: 5px; width: 100%; min-height: 22px; padding: 2px 7px; color: inherit; text-align: left; white-space: nowrap; border: 0; background: transparent; font: inherit; }
.native-linked-menu-item-host > button:hover, .native-linked-menu-item-host > button:focus-visible { color: #000; outline: 0; background: #d9eaf7; }
.native-linked-menu-item-host > button:disabled { color: #888; background: transparent; }
.native-linked-menu-label { flex: 1 1 auto; }
.native-linked-menu-item-host kbd { margin-left: 18px; color: inherit; background: transparent; border: 0; font: inherit; }
.native-linked-menu-check { flex: 0 0 13px; width: 13px; text-align: center; }
.native-linked-menu-arrow { margin-left: 10px; font-size: 14px; }
.native-linked-menu-separator { display: block; height: 1px; margin: 3px 2px; background: #c7c7c7; }
.native-linked-menu.nested { top: -3px; left: calc(100% - 2px); display: none; }
.native-linked-menu-item-host:hover > .native-linked-menu.nested, .native-linked-menu-item-host:focus-within > .native-linked-menu.nested { display: flex; }
.native-button-glyph { display: inline-block; min-width: 12px; color: #2867b2; font-weight: 700; }
.native-button-image-right .native-button-glyph { order: 2; margin-left: 3px; }
.native-button-image-top.ant-btn { flex-direction: column; gap: 0; }
.native-button-image-bottom.ant-btn { flex-direction: column-reverse; gap: 0; }
.native-menu-command .native-menu-command-arrow { order: 3; }
.native-fixed-form .native-button-glyph { color: #202020; }
.native-commit-editor.ant-input { resize: none; border-color: #999; border-radius: 0; background: white; font: 12px "Segoe UI",sans-serif; }
.migration-tree { position: relative; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #9ea7b1; background: white; }
.native-list-caption { display: flex; align-items: center; justify-content: space-between; min-height: 23px; padding: 2px 7px; color: #283441; background: linear-gradient(#fafafa,#e7e7e7); border-bottom: 1px solid #aab2bb; font: 11px "Segoe UI",sans-serif; }
.native-list-caption small { color: #697586; font-size: 10px; }
.migration-tree-row { display: flex; align-items: center; gap: 7px; min-height: 21px; padding: 2px 6px; border-bottom: 1px solid #edf0f2; font: 11px "Segoe UI",sans-serif; }
.migration-tree-row.selected { color: white; background: #0078d7; }
.migration-tree-row:focus { outline: 1px dotted #111; outline-offset: -2px; }
.file-status { display: grid; place-items: center; width: 15px; height: 15px; color: white; font-size: 9px; font-weight: 700; }
.status-m { background: #df851c; }
.status-a { background: #2ea44f; }
.file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.migration-tree-empty { display: grid; flex: 1; place-items: start; padding: 8px; color: #a0a7af; font: italic 11px "Segoe UI",sans-serif; }
.native-context-menu { position: absolute; z-index: 30; display: flex; flex-direction: column; width: 180px; padding: 3px; color: #1f252c; background: #f6f6f6; border: 1px solid #8b929a; box-shadow: 2px 3px 8px rgba(0,0,0,.26); font: 11px "Segoe UI",sans-serif; }
.native-context-menu button { display: flex; justify-content: space-between; width: 100%; min-height: 23px; padding: 3px 7px 3px 25px; color: inherit; text-align: left; border: 0; background: transparent; font: inherit; }
.native-context-menu button:hover, .native-context-menu button:focus { color: white; outline: 0; background: #0078d7; }
.native-context-menu kbd { margin-left: 8px; color: inherit; background: transparent; font: inherit; }
.context-separator { height: 1px; margin: 3px 5px 3px 24px; background: #c5c8cc; }
.migration-list { overflow: auto; padding: 1px; color: #202020; border: 1px solid #7a7a7a; background: #fff; font: 11px "Segoe UI",sans-serif; }
.native-list-box:focus { outline: 1px solid #0078d7; outline-offset: -1px; }
.native-list-box.disabled { color: #6d6d6d; background: #f0f0f0; }
.native-list-box-item { min-height: 15px; padding: 0 2px; white-space: nowrap; cursor: default; }
.native-list-box-item.selected { color: #fff; background: #0078d7; }
.native-generic-tree { overflow: auto; color: #202020; border: 1px solid #7a7a7a; background: #fff; font: 11px "Segoe UI",sans-serif; }
.native-generic-tree.disabled { color: #6d6d6d; background: #f0f0f0; }
.native-generic-tree-row { display: flex; align-items: center; width: 100%; min-height: 20px; padding-top: 1px; padding-right: 4px; padding-bottom: 1px; overflow: hidden; color: inherit; text-align: left; white-space: nowrap; border: 0; background: transparent; font: inherit; cursor: default; }
.native-generic-tree-row:hover { background: #e5f0fb; }
.native-generic-tree-row:focus { outline: 1px dotted #111; outline-offset: -2px; }
.native-generic-tree-row.selected { color: #fff; background: #0078d7; }
.native-generic-tree-row:disabled { color: inherit; }
.native-generic-tree-expander { display: inline-grid; flex: 0 0 13px; width: 13px; place-items: center; font-size: 8px; }
.migration-separator { align-self: stretch; width: 1px; min-height: 18px; background: #b9c0c8; }
.migration-progress { align-self: center; width: 90px !important; height: 7px !important; overflow: hidden; border-radius: 8px; background: #d0d5db; }
.migration-progress span { display: block; width: 38%; height: 100%; background: #3b7dcc; }
.native-diff { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; border: 0; background: white; }
.native-diff-caption { display: none; }
.native-diff-caption small { color: #6c7786; }
.native-diff-toolbar { position: absolute; z-index: 6; top: 2px; right: 18px; display: flex; align-items: center; gap: 2px; height: 25px; padding: 1px 4px; color: #596676; pointer-events: none; opacity: 0; background: rgba(237,237,237,.97); border: 1px solid #aeb5bd; box-shadow: 1px 2px 5px rgba(0,0,0,.18); font: 10px "Segoe UI",sans-serif; transition: opacity .1s; }
.native-diff:hover .native-diff-toolbar, .native-diff:focus-within .native-diff-toolbar { pointer-events: auto; opacity: 1; }
.native-diff-toolbar button { display: grid; width: 23px; height: 22px; padding: 2px; place-items: center; border: 1px solid transparent; background: transparent; }
.native-diff-toolbar button:hover, .native-diff-toolbar button.active { background: #dceafb; border-color: #94b2d4; }
.native-diff-toolbar button:disabled { opacity: .38; }
.native-diff-toolbar > i { width: 1px; height: 17px; margin: 0 3px; background: #b8bec5; }
.diff-toolbar-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; }
.diff-toolbar-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-diff-code { flex: 1; overflow: auto; scrollbar-color: #a9adb2 #ececec; font: 11px Consolas,"SFMono-Regular",monospace; }
.native-diff-line { display: grid; grid-template-columns: 31px 31px max-content; width: max-content; min-width: 100%; min-height: 19px; }
.native-diff-line .line-number { padding: 2px 4px; color: #8a919a; text-align: right; background: #f2f2f2; border-right: 1px solid #ddd; }
.native-diff-line code { min-width: calc(100% - 62px); padding: 2px 6px; white-space: pre; }
.native-diff-line.meta code { color: #495566; background: #f3f5f7; }
.native-diff-line.header-removed code { background: #ffc9c9; }
.native-diff-line.header-added code { background: #c8f7c8; }
.native-diff-line.hunk code { color: #31318b; background: #d8edf7; }
.native-diff-line.hunk .line-number { background: #e7f2f7; }
.native-diff-line.added code { background: #d7f5d5; }
.native-diff-line.removed code { background: #ffd9d6; }
.syntax-keyword { color: #0000d8; }
.syntax-literal { color: #7a219e; }
.syntax-comment { color: #008000; }
.native-revision-diff { display: grid; grid-template-columns: minmax(210px,29%) 4px minmax(0,1fr); width: 100%; height: 100%; overflow: hidden; background: #c9cdd1; }
.revision-diff-files { min-width: 0; overflow: auto; color: #293544; background: #fff; font: 11px "Segoe UI",sans-serif; }
.revision-diff-splitter { position: relative; display: grid; place-items: center; cursor: col-resize; outline: 0; background: linear-gradient(90deg,#aeb3b8,#e2e2e2,#aeb3b8); touch-action: none; }
.revision-diff-splitter span { width: 2px; height: 28px; border-left: 1px dotted #767f88; opacity: 0; }
.revision-diff-splitter:hover span, .revision-diff-splitter:focus span { opacity: 1; }
.revision-diff-splitter:focus { background: #c7d9ef; }
.revision-diff-filter { display: flex; align-items: center; height: 25px; color: #7b8591; border-bottom: 1px solid #d3d6d9; }
.revision-diff-filter input { flex: 1; min-width: 0; height: 24px; padding: 3px 7px; border: 0; outline: 0; background: white; font: italic 11px "Segoe UI",sans-serif; }
.revision-diff-filter button { align-self: stretch; width: 24px; border: 0; border-left: 1px solid #c4c8cd; background: #ededed; }
.revision-diff-summary { height: 23px; padding: 4px 7px; overflow: hidden; color: #264f87; text-overflow: ellipsis; white-space: nowrap; border-bottom: 1px solid #e3e5e7; }
.revision-diff-files > button { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 22px; padding: 2px 6px; overflow: hidden; color: inherit; text-align: left; background: transparent; border: 0; font: inherit; }
.revision-diff-files > button > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.revision-diff-files > button:hover { background: #e8f2fc; }
.revision-diff-files > button.selected { color: inherit; background: #e5e5e5; }
.revision-diff-files:has(> button:focus) > button.selected { color: white; background: #0078d7; }
.revision-diff-empty { padding: 9px 7px; color: #7b8591; font-style: italic; }
.diff-file-status { display: grid; flex: 0 0 15px; height: 15px; place-items: center; color: white; font-size: 9px; font-weight: 700; }
.diff-file-status.status-m { background: #d98824; }
.diff-file-status.status-a { background: #2c9b4a; }
.diff-file-status-image { display: inline-grid; flex: 0 0 16px; width: 16px; height: 16px; place-items: center; }
.diff-file-status-image img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-menu-bar { position: relative; display: flex; align-items: center; width: 100%; height: 25px; padding: 1px 3px; background: #fff; border-bottom: 1px solid #d0d0d0; font: 11px "Segoe UI",sans-serif; }
.native-menu-bar > button { height: 22px; padding: 2px 8px; color: #20252b; background: transparent; border: 1px solid transparent; font: inherit; }
.native-menu-bar > button:hover, .native-menu-bar > button.active { background: #dceafb; border-color: #9ab9dd; }
.native-menu-dropdown { position: absolute; z-index: 40; top: 23px; left: 3px; display: flex; flex-direction: column; width: 230px; padding: 3px; background: #f7f7f7; border: 1px solid #9299a1; box-shadow: 2px 4px 10px rgba(0,0,0,.24); }
.native-menu-dropdown button { display: flex; align-items: center; min-height: 23px; padding: 3px 8px 3px 6px; color: #20252b; text-align: left; background: transparent; border: 0; font: inherit; }
.native-menu-dropdown .menu-item-icon { margin: 0 5px 0 0; }
.native-menu-dropdown .menu-check { display: inline-grid; flex: 0 0 16px; width: 16px; place-items: center; }
.native-menu-dropdown kbd { margin-left: auto; padding-left: 10px; color: inherit; background: transparent; font: inherit; }
.menu-item-icon { display: inline-grid; width: 18px; height: 18px; margin: 0 5px 0 -22px; place-items: center; }
.menu-item-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-menu-dropdown button:hover { color: white; background: #0078d7; }
.native-tool-strip { position: relative; display: flex; align-items: center; width: 100%; height: 25px; min-height: 25px; padding: 1px 3px; overflow: visible; background: #ededed; border-bottom: 1px solid #b2b7bd; font: 11px "Segoe UI",sans-serif; }
.native-tool-strip > button { display: flex; align-items: center; gap: 3px; height: 22px; min-width: 24px; padding: 1px 4px; color: #28323d; background: transparent; border: 1px solid transparent; font: inherit; }
.native-tool-strip > button:hover, .native-tool-strip > button.active { background: #dceafb; border-color: #9ab9dd; }
.native-tool-strip > button small { display: grid; align-self: stretch; margin: -1px -4px -1px 2px; padding: 0 2px; place-items: center; color: #4c5764; border-left: 1px solid #c2c7cc; font-size: 8px; }
.runtime-script-strip { flex: 0 0 auto; }
.runtime-script-strip > button { min-width: 116px; white-space: nowrap; }
.native-tool-strip > .native-overflow-button { position: absolute; z-index: 3; right: 1px; min-width: 18px; padding: 0 3px; background: #ededed; }
.toolbar-glyph { display: inline-grid; min-width: 14px; place-items: center; color: #2767aa; font-weight: 700; }
.toolbar-glyph img, .native-button-glyph img { display: block; width: 16px; height: 16px; object-fit: contain; image-rendering: auto; }
.native-toolbar-separator { width: 1px; height: 18px; margin: 0 3px; background: #b6bcc3; box-shadow: 1px 0 white; }
.native-toolbar-dropdown { position: absolute; z-index: 42; top: 23px; display: flex; flex-direction: column; width: 225px; padding: 3px; background: #f7f7f7; border: 1px solid #9299a1; box-shadow: 2px 4px 10px rgba(0,0,0,.24); }
.native-toolbar-dropdown button { min-height: 23px; padding: 3px 8px 3px 27px; color: #20252b; text-align: left; background: transparent; border: 0; font: inherit; }
.native-toolbar-dropdown button:hover { color: white; background: #0078d7; }
.native-repository-tree { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; color: #263444; background: #fff; font: 11px "Segoe UI",sans-serif; }
.repo-tree-view-toolbar { display: flex; flex: 0 0 27px; align-items: center; gap: 1px; padding: 2px 4px; background: #ededed; border-bottom: 1px solid #b6bcc3; }
.repo-tree-view-toolbar button { display: grid; width: 24px; height: 22px; padding: 2px; place-items: center; border: 1px solid transparent; background: transparent; }
.repo-tree-view-toolbar button:hover, .repo-tree-view-toolbar button.active { background: #dceafb; border-color: #8faed1; }
.repo-tree-view-icon, .repo-tree-node-icon { display: inline-grid; flex: 0 0 16px; width: 16px; height: 16px; place-items: center; }
.repo-tree-view-icon img, .repo-tree-node-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.repo-tree-search { display: flex; flex: 0 0 29px; align-items: center; gap: 2px; padding: 3px 4px; background: #f0f0f0; border-bottom: 1px solid #b6bcc3; }
.repo-tree-search input { flex: 1; min-width: 0; height: 22px; padding: 1px 4px; border: 1px solid #9da5ad; font: inherit; }
.repo-tree-search button { width: 23px; height: 22px; color: #53677d; border: 0; background: transparent; font: inherit; }
.repo-tree-scroll { flex: 1; padding: 3px 0; overflow: auto; }
.repo-tree-scroll [role="treeitem"] { position: relative; display: flex; align-items: center; gap: 2px; width: 100%; min-height: 20px; padding-top: 1px; padding-right: 4px; padding-bottom: 1px; overflow: hidden; color: inherit; text-align: left; white-space: nowrap; background: transparent; border: 0; font: inherit; }
.repo-tree-scroll [role="treeitem"]:not(.level-0)::before { position: absolute; z-index: 0; top: 0; bottom: 0; left: 10px; width: var(--tree-rail-width); content: ""; pointer-events: none; background-image: radial-gradient(circle,#aeb5bd .7px,transparent .9px); background-position: 2px 0; background-size: 15px 3px; }
.repo-tree-scroll [role="treeitem"]:not(.level-0)::after { position: absolute; z-index: 0; top: 50%; left: var(--tree-last-rail); width: 8px; content: ""; pointer-events: none; border-top: 1px dotted #aeb5bd; }
.repo-tree-expander { position: relative; z-index: 1; display: grid; flex: 0 0 10px; width: 10px; height: 16px; place-items: center; color: #404851; }
.repo-tree-scroll [role="treeitem"].group .repo-tree-expander::before { width: 0; height: 0; content: ""; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 5px solid currentColor; }
.repo-tree-scroll [role="treeitem"].group.expanded .repo-tree-expander::before { transform: translateY(1px) rotate(90deg); }
.repo-tree-node-icon, .repo-tree-label { position: relative; z-index: 1; }
.repo-tree-label { min-width: 0; margin-left: 1px; overflow: hidden; text-overflow: ellipsis; }
.repo-tree-scroll [role="treeitem"]:hover { background: #e5f0fb; }
.repo-tree-scroll [role="treeitem"]:focus { outline: 1px dotted #111; outline-offset: -2px; }
.repo-tree-scroll [role="treeitem"].selected { color: inherit; background: transparent; }
.repo-tree-scroll:has([role="treeitem"]:focus) [role="treeitem"].selected { color: white; background: #0078d7; }
.repo-tree-scroll:has([role="treeitem"]:focus) [role="treeitem"].selected .repo-tree-expander { color: white; }
.repo-tree-scroll [role="treeitem"].group, .repo-tree-scroll [role="treeitem"].strong { font-weight: 600; }
.repo-tree-scroll [role="treeitem"].muted { color: #77828e; font-style: italic; }
.repo-tree-empty { padding: 10px 8px; color: #7d8793; font-style: italic; }
.native-revision-grid { position: relative; width: 100%; height: 100%; overflow: auto; color: #202832; background: #fff; font: 11px "Segoe UI",sans-serif; }
.revision-grid-header, .native-revision-grid > button { display: grid; grid-template-columns: 36px minmax(180px,1fr) minmax(94px,120px) 130px 60px; align-items: center; min-width: 560px; }
.revision-grid-header { position: sticky; z-index: 2; top: 0; height: 24px; background: linear-gradient(#fafafa,#e5e5e5); border-bottom: 1px solid #9fa7af; }
.revision-grid-header span { height: 100%; padding: 4px 6px; border-right: 1px solid #bec3c8; }
.native-revision-grid > button { width: 100%; min-height: 23px; padding: 0; color: inherit; text-align: left; background: #fff; border: 0; border-bottom: 1px solid #edf0f2; font: inherit; }
.native-revision-grid > button > span, .native-revision-grid > button > code { padding: 3px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.native-revision-grid > button:hover { background: #e9f2fc; }
.native-revision-grid > button.selected { color: white; background: #0078d7; }
.native-revision-grid > button.artificial { color: #65717f; background: #f7f7f7; }
.native-revision-grid > button.artificial:hover { background: #e9f2fc; }
.native-revision-grid > button.artificial.selected { color: white; background: #0078d7; }
.native-revision-grid > button.primary { box-shadow: inset 0 0 0 1px rgba(255,255,255,.85); }
.revision-grid-empty { padding: 12px 8px; color: #7b8591; font-style: italic; }
.revision-context-menu { width: 222px; }
.revision-graph { position: relative; display: block; align-self: stretch; width: 36px; min-height: 23px; padding: 0 !important; overflow: hidden; }
svg.revision-graph { height: 100%; }
.graph-path { fill: none; stroke: #35ae49; stroke-width: 2; vector-effect: non-scaling-stroke; }
.graph-path-side, .graph-path-branch { stroke: #338bd4; }
.graph-node { fill: #6bd16f; stroke: #258f39; stroke-width: 2; vector-effect: non-scaling-stroke; }
.graph-side .graph-node { fill: #5eb0ef; stroke: #2272b6; }
.graph-merge .graph-node { fill: #38b854; }
.revision-status { display: grid; place-items: center; }
.revision-status::before { position: absolute; top: 0; bottom: 0; left: 13px; width: 2px; content: ""; background: #d6d9dc; }
.revision-status-icon { z-index: 1; display: inline-grid; width: 16px; height: 16px; place-items: center; background: #fff; }
.revision-status-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-revision-grid > button.selected .graph-path-main { stroke: #bceec3; }
.native-revision-grid > button.selected .graph-path-side, .native-revision-grid > button.selected .graph-path-branch { stroke: #b9ddff; }
.native-revision-grid > button.selected .revision-status-icon { background: #0078d7; }
.revision-subject { display: flex; align-items: center; gap: 5px; }
.revision-subject > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.revision-subject em { flex: 0 0 auto; max-width: 94px; padding: 0 4px; overflow: hidden; color: #30451d; text-overflow: ellipsis; border: 1px solid #86a65e; border-radius: 1px; background: #dff0c8; font-size: 9px; font-style: normal; line-height: 15px; }
.revision-subject em.ref-remote { color: #6b331f; border-color: #ce8b62; background: #f7d9c1; }
.revision-subject em.ref-tag { color: #5d5318; border-color: #c7ad39; background: #fff2a5; }
.revision-subject em.ref-state { color: #65717f; border-color: transparent; background: transparent; font-size: 10px; }
.native-revision-grid > button.selected .revision-subject em { filter: saturate(.92) brightness(1.05); }
.revision-author { display: flex; align-items: center; gap: 5px; min-width: 0; }
.revision-author > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.author-portrait { position: relative; display: block; flex: 0 0 80px; width: 80px; height: 80px; overflow: hidden; border: 1px solid #7f8993; background: linear-gradient(145deg,#8bb596,#405c75); }
.author-portrait.compact { flex-basis: 20px; width: 20px; height: 20px; }
.author-portrait img { display: block; width: 100%; height: 100%; object-fit: cover; }
.author-portrait i { position: absolute; z-index: 2; top: 15%; left: 34%; width: 32%; height: 32%; border-radius: 50%; background: #e7bd99; box-shadow: inset -2px -2px rgba(107,69,50,.18); }
.author-portrait b { position: absolute; bottom: -9%; left: 15%; width: 70%; height: 55%; border-radius: 46% 46% 12% 12%; background: #263f58; }
.author-portrait.compact i { box-shadow: none; }
.author-portrait.avatar-tone-1 { background: linear-gradient(145deg,#b5a082,#536a79); }
.author-portrait.avatar-tone-2 { background: linear-gradient(145deg,#9fb4cc,#556b8a); }
.author-portrait.avatar-tone-3 { background: linear-gradient(145deg,#b2bd8c,#526c56); }
.author-portrait.avatar-tone-4 { background: linear-gradient(145deg,#c2a5aa,#665370); }
.native-revision-grid > button.selected .author-portrait { border-color: #e5f1ff; }
.native-commit-info { height: 100%; overflow: auto; color: #263342; background: white; font: 11px "Segoe UI",sans-serif; }
.commit-selection-banner { padding: 4px 8px; color: #304d70; background: #e7f1fc; border-bottom: 1px solid #a9c5e4; }
.commit-info-header { display: grid; grid-template-columns: 80px minmax(0,1fr); gap: 9px; padding: 7px; border-bottom: 1px solid #d6d9dc; }
.native-commit-info h3 { margin: 0 0 12px; font-size: 12px; }
.native-commit-info dl { display: grid; grid-template-columns: 64px minmax(0,1fr); align-content: start; gap: 3px 7px; margin: 0; }
.native-commit-info dt { color: #111; }
.native-commit-info dd { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; }
.native-commit-info a { color: #0767bd; text-decoration: underline; cursor: pointer; }
.commit-message { padding: 8px 10px; }
.commit-message p { margin: 0 0 12px; white-space: pre-wrap; }
.native-info-panel { display: flex; flex-direction: column; gap: 7px; height: 100%; padding: 12px; color: #3e4d61; background: white; font: 11px "Segoe UI",sans-serif; }
.native-info-panel strong { color: #207a38; }
.native-gpg-info { height: 100%; padding: 12px 14px; overflow: auto; color: #2e3b49; background: white; font: 11px "Segoe UI",sans-serif; }
.gpg-status { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #c4cbd2; background: #f5f7f8; }
.gpg-status.verified { border-color: #91bd99; background: #edf8ef; }
.gpg-status.unsigned { border-color: #d3b36d; background: #fff8e4; }
.gpg-status > div { display: flex; flex-direction: column; gap: 2px; }
.gpg-status-icon { display: inline-grid; flex: 0 0 24px; width: 24px; height: 24px; place-items: center; font-size: 18px; }
.gpg-status-icon img { display: block; width: 20px; height: 20px; object-fit: contain; }
.native-gpg-info dl { display: grid; grid-template-columns: 78px minmax(0,1fr); gap: 6px 10px; margin: 13px 0; }
.native-gpg-info dt { color: #6e7b89; }
.native-gpg-info dd { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; }
.gpg-actions { display: flex; gap: 6px; padding-top: 9px; border-top: 1px solid #d7dade; }
.gpg-actions button { display: flex; align-items: center; gap: 5px; height: 24px; padding: 2px 8px; border: 1px solid #a8afb6; background: linear-gradient(#fff,#e6e6e6); font: inherit; }
.gpg-actions button:disabled { opacity: .5; }
.gpg-action-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; }
.gpg-action-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-action-notice { display: flex; align-items: center; gap: 7px; width: 100%; height: 33px; padding: 4px 7px; color: #314258; background: #fff8dc; border: 1px solid #d6c67e; font: 11px "Segoe UI",sans-serif; }
.native-action-notice > span:not(.native-spinner) { flex: 1; color: #687587; }
.native-action-notice button { height: 22px; border: 1px solid #a9afb6; background: linear-gradient(#fff,#e6e6e6); font: inherit; }
.native-spinner { color: #0078d7; font-size: 17px; animation: native-spin 1.1s linear infinite; }
@keyframes native-spin { to { transform: rotate(360deg); } }
.native-file-tree-preview { display: grid; grid-template-columns: minmax(180px,32%) minmax(0,1fr); width: 100%; height: 100%; overflow: hidden; background: #c7cbd0; }
.native-file-tree-pane { display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: white; border-right: 1px solid #979fa8; }
.file-tree-filter { display: flex; align-items: center; gap: 4px; height: 27px; padding: 3px 5px; background: #ededed; border-bottom: 1px solid #b5bbc2; }
.file-tree-filter input { flex: 1; min-width: 0; height: 21px; padding: 1px 5px; border: 1px solid #9fa7af; font: 11px "Segoe UI",sans-serif; }
.file-tree-filter button { width: 22px; height: 21px; padding: 0; border: 1px solid #a8afb6; background: linear-gradient(#fff,#e6e6e6); font: 11px "Segoe UI",sans-serif; }
.file-tree-items { flex: 1; padding: 2px 0; overflow: auto; }
.file-tree-items button { display: flex; align-items: center; gap: 4px; width: 100%; min-height: 21px; padding: 2px 5px; color: #273441; text-align: left; white-space: nowrap; background: transparent; border: 0; font: 11px "Segoe UI",sans-serif; }
.file-tree-items button:hover { background: #e8f2fc; }
.file-tree-items button:focus { outline: 1px dotted #111; outline-offset: -2px; }
.file-tree-items button.selected { color: white; background: #0078d7; }
.file-tree-expander { display: inline-grid; flex: 0 0 10px; width: 10px; place-items: center; }
.file-tree-node-icon { display: inline-grid; flex: 0 0 16px; width: 16px; height: 16px; place-items: center; }
.file-tree-node-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.file-tree-empty { padding: 9px 7px; color: #7b8591; font: italic 11px "Segoe UI",sans-serif; }
.native-file-content { display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: white; }
.file-content-toolbar { display: flex; flex: 0 0 27px; align-items: center; justify-content: space-between; gap: 8px; padding-left: 7px; overflow: hidden; background: linear-gradient(#f9f9f9,#e8e8e8); border-bottom: 1px solid #aab1b9; font: 11px "Segoe UI",sans-serif; }
.file-content-toolbar > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-view-mode { display: flex; align-self: stretch; }
.file-view-mode button { display: flex; align-items: center; gap: 3px; min-width: 55px; padding: 1px 6px; border: 0; border-left: 1px solid #b6bcc3; background: transparent; font: inherit; }
.file-view-mode button:hover, .file-view-mode button.active { background: #dceafb; }
.file-mode-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; }
.file-mode-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.file-source-lines { flex: 1; overflow: auto; font: 11px Consolas,"SFMono-Regular",monospace; }
.file-source-lines > div { display: grid; grid-template-columns: 36px max-content; width: max-content; min-width: 100%; min-height: 19px; }
.file-source-lines.blame-mode > div { grid-template-columns: 65px 94px 36px max-content; }
.file-source-lines span { padding: 2px 5px; color: #8a919a; text-align: right; background: #f2f2f2; border-right: 1px solid #ddd; }
.file-source-lines code { padding: 2px 7px; white-space: pre; }
.file-source-lines .blame-hash, .file-source-lines .blame-author { overflow: hidden; color: #52667d; text-overflow: ellipsis; background: #eef2f5; border-right: 1px solid #d5d9dd; }
.native-filter-toolbar { position: relative; display: flex; align-items: center; gap: 0; width: 100%; height: 25px; padding: 1px 0; overflow: visible; background: #ededed; border-bottom: 1px solid #b2b7bd; font: 11px "Segoe UI",sans-serif; }
.filter-button-host { position: relative; display: flex; flex: 0 0 auto; align-self: stretch; align-items: center; }
.native-filter-toolbar button { height: 22px; padding: 1px 4px; color: #28323d; border: 1px solid transparent; background: transparent; font: inherit; }
.native-filter-toolbar > button:hover, .native-filter-toolbar .filter-button-host > button:hover, .native-filter-toolbar button.checked { background: #dceafb; border-color: #9ab9dd; }
.native-filter-toolbar .filter-icon-button { display: grid; flex: 0 0 24px; width: 24px; padding: 2px; place-items: center; }
.native-filter-toolbar .filter-split-button { display: flex; align-items: center; gap: 3px; padding: 1px 0 1px 3px; }
.native-filter-toolbar .filter-split-button.icon-only { width: 31px; }
.native-filter-toolbar .filter-split-button.scope-button { min-width: 94px; max-width: 116px; }
.filter-split-button.scope-button > span:not(.filter-toolbar-icon) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.native-filter-toolbar .filter-split-button small { display: grid; align-self: stretch; min-width: 11px; margin-left: auto; place-items: center; color: #4c5764; border-left: 1px solid #c2c7cc; font-size: 8px; }
.filter-label { flex: 0 0 auto; padding: 0 4px 0 5px; white-space: nowrap; }
.filter-combo { display: flex; flex: 1 1 82px; min-width: 58px; max-width: 112px; height: 23px; background: #fff; border: 1px solid #8e969e; }
.filter-combo input { min-width: 0; width: 100%; height: 21px; padding: 1px 4px; border: 0; outline: 0; background: #fff; font: inherit; }
.native-filter-toolbar .filter-combo button { flex: 0 0 17px; width: 17px; height: 21px; padding: 0; border: 0; border-left: 1px solid #c1c5c9; background: linear-gradient(#fff,#e7e7e7); }
.filter-separator { flex: 0 0 1px; width: 1px; height: 18px; margin: 0 3px; background: #b6bcc3; box-shadow: 1px 0 #fff; }
.native-filter-menu { position: absolute; z-index: 46; top: 23px; left: 0; display: flex; flex-direction: column; width: 210px; padding: 3px; color: #20252b; background: #f7f7f7; border: 1px solid #9299a1; box-shadow: 2px 4px 10px rgba(0,0,0,.24); }
.native-filter-menu button { display: flex; align-items: center; min-height: 23px; height: auto; padding: 3px 8px; text-align: left; border: 0; }
.native-filter-menu button:hover { color: #fff; background: #0078d7; }
.native-filter-menu .context-separator { width: 100%; height: 1px; margin: 3px 0; background: #c6c9cc; }
.native-filter-menu .menu-check { display: inline-grid; flex: 0 0 17px; width: 17px; place-items: center; }
.native-filter-menu .menu-item-icon { margin-left: 0; }
.native-filter-menu.compact-menu { width: 130px; }
.native-filter-menu.revision-type-menu { right: 0; left: auto; width: 180px; }
.native-filter-toolbar.filters-active { box-shadow: inset 0 -2px #d99828; }
.filter-toolbar-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; }
.filter-toolbar-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.native-console { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; color: #d7d7d7; background: #0c0c0c; font: 12px Consolas,"SFMono-Regular",monospace; }
.console-toolbar { display: flex; flex: 0 0 25px; align-items: center; justify-content: space-between; padding: 2px 5px 2px 8px; color: #2c3540; background: linear-gradient(#f7f7f7,#dfdfdf); border-bottom: 1px solid #8e969e; font: 11px "Segoe UI",sans-serif; }
.console-toolbar button { height: 20px; padding: 1px 7px; border: 1px solid #a5abb2; background: linear-gradient(#fff,#e5e5e5); font: inherit; }
.console-output { flex: 1; padding: 7px 9px; overflow: auto; line-height: 1.45; }
.console-output form { display: flex; align-items: center; }
.console-output form span { flex: 0 0 auto; white-space: pre; }
.console-output input { flex: 1; min-width: 80px; padding: 0 0 0 5px; color: #f1f1f1; caret-color: white; border: 0; outline: 0; background: transparent; font: inherit; }
.native-presentation :is(.native-menu-bar,.native-tool-strip,.native-repository-tree,.native-revision-grid,.native-commit-info,.native-tabs,.revision-diff-files,.native-file-tree-preview,.native-filter-toolbar,.native-context-menu) { font-size: 12px; }
.fallback { padding: 3px; border: 1px dashed #b7bec9; background: #fff; font-size: 10px; }
.fallback small { display: block; color: #8c96a6; }
`;
}
