import type {
  NormalizedLayoutNode,
  NormalizedLayoutPlan,
  RuntimeLayoutHint,
  VisualControl,
  VisualSize,
  VisualTableSizing,
} from "./types.js";

type Context = {
  resolvedComponents: Set<string>;
  excludedPopups: Set<string>;
  stateAlternatives: number;
  nextId: number;
  controlIndex: Map<string, VisualControl>;
  dynamicPanels: Map<string, string[]>;
  reparentedControls: Set<string>;
  runtimeTabs: Map<string, Extract<RuntimeLayoutHint, { kind: "add-tab" }>[]>;
};

export function normalizeLayout(
  controls: VisualControl[],
  sourceSize: VisualSize | undefined,
  resolvedComponents: Set<string>,
  runtimeLayoutHints: RuntimeLayoutHint[] = [],
): NormalizedLayoutPlan {
  const controlIndex = indexControls(controls);
  const { dynamicPanels, reparentedControls } = prepareRuntimeReparents(controls, controlIndex, runtimeLayoutHints);
  const runtimeTabs = prepareRuntimeTabs(runtimeLayoutHints);
  const context: Context = {
    resolvedComponents,
    excludedPopups: new Set(),
    stateAlternatives: 0,
    nextId: 1,
    controlIndex,
    dynamicPanels,
    reparentedControls,
    runtimeTabs,
  };
  return {
    version: 1,
    strategy: "semantic-web",
    sourceSize,
    root: normalizeCollection(controls, context, "content"),
    diagnostics: {
      stateAlternatives: context.stateAlternatives,
      excludedPopups: [...context.excludedPopups].sort(),
      runtimeReparents: [...context.dynamicPanels].flatMap(([target, names]) => names.map((controlName) => ({ controlName, target }))),
      runtimeTabs: [...context.runtimeTabs].flatMap(([target, hints]) => hints.map((hint) => ({ controlName: hint.controlName, target, label: hint.label }))),
    },
  };
}

function normalizeCollection(
  controls: VisualControl[],
  context: Context,
  role: NormalizedLayoutNode["role"],
  includeReparented = false,
): NormalizedLayoutNode {
  const visible = controls.filter((control) => {
    if (!includeReparented && context.reparentedControls.has(control.name)) return false;
    if (!isPopupOrNonVisual(control)) return true;
    context.excludedPopups.add(control.name);
    return false;
  });
  if (visible.length === 0) return node(context, "empty", { role });

  const status = visible.filter(isStatus);
  const candidates = visible.filter((control) => !status.includes(control));
  const nonActions = candidates.filter((control) => !isAction(control));
  const likelyPrimary = [...nonActions].sort((a, b) => primaryScore(b, context) - primaryScore(a, context))[0];
  // Buttons placed inside a Dock=Fill surface are commonly transient state
  // overlays (loading cancel, resolve conflicts, message locked). Preserve them
  // as layer alternatives instead of showing a permanent web action bar.
  const actions = candidates.filter((control) =>
    isAction(control) && !(control.bounds && likelyPrimary?.bounds && overlaps(control, likelyPrimary))
  );
  const withoutActions = candidates.filter((control) => !actions.includes(control));
  const toolbars = withoutActions.filter(isToolbar);
  const content = withoutActions.filter((control) => !toolbars.includes(control));

  const children: NormalizedLayoutNode[] = [];
  if (toolbars.length > 0) {
    children.push(normalizeSequence(toolbars, context, "toolbar", "vertical"));
  }
  if (actions.length > 0) {
    children.push(normalizeSequence(actions, context, "actions", "horizontal"));
  }
  if (content.length > 0) {
    children.push(normalizeContent(content, context, role));
  }
  if (status.length > 0) {
    children.push(normalizeSequence(status, context, "status", "horizontal"));
  }

  if (children.length === 1) return children[0];
  return node(context, "stack", { role, axis: "vertical", children });
}

function normalizeContent(
  controls: VisualControl[],
  context: Context,
  role: NormalizedLayoutNode["role"],
): NormalizedLayoutNode {
  if (controls.length === 1) return withRole(normalizeControl(controls[0], context), role);

  const primary = [...controls].sort((a, b) => primaryScore(b, context) - primaryScore(a, context))[0];
  const others = controls.filter((control) => control !== primary);
  if (others.every((control) => overlaps(control, primary) || area(control) < Math.max(area(primary) * 0.12, 1200))) {
    context.stateAlternatives += others.length;
    return node(context, "layers", {
      role,
      label: primary.text || primary.name,
      children: [normalizeControl(primary, context)],
      alternatives: others.map((control) => control.name),
    });
  }

  const ordered = [...controls].sort((a, b) => {
    const ay = a.bounds?.y ?? 0;
    const by = b.bounds?.y ?? 0;
    return ay === by ? (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0) : ay - by;
  });
  const axis = mostlySameRow(ordered) ? "horizontal" : "vertical";
  return node(context, "stack", {
    role,
    axis,
    children: ordered.map((control) => normalizeControl(control, context)),
  });
}

function normalizeSequence(
  controls: VisualControl[],
  context: Context,
  role: NormalizedLayoutNode["role"],
  axis: "horizontal" | "vertical",
): NormalizedLayoutNode {
  if (controls.length === 1) return withRole(normalizeControl(controls[0], context), role);
  return node(context, "stack", {
    role,
    axis,
    children: controls.map((control) => normalizeControl(control, context)),
  });
}

function normalizeControl(control: VisualControl, context: Context): NormalizedLayoutNode {
  if (control.kind === "SplitContainer") {
    const firstNames = new Set(control.panel1Children ?? []);
    const secondNames = new Set(control.panel2Children ?? []);
    const first = control.children.filter((child) => firstNames.has(child.name));
    const second = control.children.filter((child) => secondNames.has(child.name));
    const dynamicFirst = (context.dynamicPanels.get(`${control.name}.Panel1`) ?? []).flatMap((name) => context.controlIndex.get(name) ?? []);
    const dynamicSecond = (context.dynamicPanels.get(`${control.name}.Panel2`) ?? []).flatMap((name) => context.controlIndex.get(name) ?? []);
    const firstContent = first.length > 0 ? first : dynamicFirst;
    const secondContent = second.length > 0 ? second : dynamicSecond;
    const axis = control.orientation === "Horizontal" ? "vertical" : "horizontal";
    const extent = axis === "vertical" ? control.bounds?.height : control.bounds?.width;
    const firstExtent = control.splitterDistance ?? inferPaneExtent(firstContent, axis);
    const ratio = extent && firstExtent
      ? clamp(firstExtent / extent, 0.15, 0.85)
      : 0.5;
    const firstCollapsed = control.properties.Panel1Collapsed === true || firstContent.length === 0;
    const secondCollapsed = control.properties.Panel2Collapsed === true || secondContent.length === 0;
    if (firstCollapsed !== secondCollapsed) {
      return node(context, "frame", {
        controlName: control.name,
        children: [normalizeCollection(
          firstCollapsed ? secondContent : firstContent,
          context,
          "content",
          firstCollapsed ? dynamicSecond.length > 0 : dynamicFirst.length > 0,
        )],
      });
    }
    return node(context, "split", {
      controlName: control.name,
      axis,
      ratio,
      children: [
        normalizeCollection(firstContent, context, "content", dynamicFirst.length > 0),
        normalizeCollection(secondContent, context, "content", dynamicSecond.length > 0),
      ],
    });
  }

  if (control.kind === "ToolStripContainer") {
    const topNames = new Set(control.topToolStripChildren ?? []);
    const contentNames = new Set(control.contentPanelChildren ?? []);
    const top = control.children.filter((child) => topNames.has(child.name));
    const content = control.children.filter((child) => contentNames.has(child.name));
    return node(context, "frame", {
      controlName: control.name,
      children: [node(context, "stack", {
        axis: "vertical",
        children: [
          normalizeSequence(top, context, "toolbar", "horizontal"),
          normalizeCollection(content.length > 0 ? content : control.children.filter((child) => !topNames.has(child.name)), context, "content"),
        ],
      })],
    });
  }

  if (control.kind === "TableLayoutPanel" && control.tableLayout) {
    const byName = new Map(control.children.map((child) => [child.name, child]));
    const cells = Object.entries(control.tableLayout.cells).flatMap(([name, [column, row]]) => {
      const child = byName.get(name);
      return child ? [{
        column,
        row,
        columnSpan: control.tableLayout?.columnSpan?.[name],
        rowSpan: control.tableLayout?.rowSpan?.[name],
        node: normalizeControl(child, context),
      }] : [];
    });
    return node(context, "grid", {
      controlName: control.name,
      columns: control.tableLayout.columns.map(cssTrack),
      rows: control.tableLayout.rows.map(cssTrack),
      cells,
    });
  }

  if (control.kind === "FlowLayoutPanel") {
    return node(context, "stack", {
      controlName: control.name,
      role: /(?:button|action|commit)/i.test(control.name) ? "actions" : undefined,
      axis: control.flowDirection === "TopDown" || control.flowDirection === "BottomUp" ? "vertical" : "horizontal",
      children: control.children.filter((child) => !isPopupOrNonVisual(child)).map((child) => normalizeControl(child, context)),
    });
  }

  if (control.kind === "TabControl") {
    const pages = control.children.filter((child) => child.kind === "TabPage" && (child.children.length === 0 || hasNonReparentedControl(child, context.reparentedControls)));
    return node(context, "tabs", {
      controlName: control.name,
      selectedIndex: Math.max(0, Math.min(pages.length - 1, control.appearance.selectedIndex ?? 0)),
      children: pages.map((page) => ({ ...normalizeControl(page, context), label: page.text || page.name })),
      runtimeTabs: (context.runtimeTabs.get(control.name) ?? []).map((hint) => ({
        id: hint.controlName,
        label: hint.label,
        imageKey: hint.imageKey,
        viewKind: hint.viewKind,
      })),
    });
  }

  if (isFrame(control) && control.children.length > 0) {
    return node(context, "frame", {
      controlName: control.name,
      label: control.kind === "GroupBox" ? control.text || control.name : undefined,
      children: [normalizeCollection(control.children, context, "content")],
    });
  }

  return node(context, "control", { controlName: control.name });
}

function inferPaneExtent(controls: VisualControl[], axis: "horizontal" | "vertical"): number | undefined {
  const extents = controls
    .map((control) => axis === "vertical" ? control.bounds?.height : control.bounds?.width)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return extents.length > 0 ? Math.max(...extents) : undefined;
}

function indexControls(controls: VisualControl[]): Map<string, VisualControl> {
  const index = new Map<string, VisualControl>();
  const visit = (items: VisualControl[]) => items.forEach((control) => {
    index.set(control.name, control);
    visit(control.children);
  });
  visit(controls);
  return index;
}

function prepareRuntimeReparents(
  controls: VisualControl[],
  controlIndex: Map<string, VisualControl>,
  hints: RuntimeLayoutHint[],
): { dynamicPanels: Map<string, string[]>; reparentedControls: Set<string> } {
  const dynamicPanels = new Map<string, string[]>();
  const reparentedControls = new Set<string>();
  const visit = (items: VisualControl[]) => items.forEach((control) => {
    if (control.kind === "SplitContainer") {
      const currentNames = new Set([...(control.panel1Children ?? []), ...(control.panel2Children ?? [])]);
      for (const panel of [1, 2] as const) {
        const declared = panel === 1 ? control.panel1Children ?? [] : control.panel2Children ?? [];
        if (declared.length > 0 || control.properties[`Panel${panel}Collapsed`] === true) continue;
        const candidates = hints
          .filter((hint): hint is Extract<RuntimeLayoutHint, { kind: "reparent" }> => hint.kind === "reparent")
          .filter((hint) => hint.parentControlName === control.name && hint.panel === panel)
          .map((hint) => hint.controlName)
          .filter((name, index, all) => all.indexOf(name) === index && controlIndex.has(name) && !currentNames.has(name));
        if (candidates.length === 0) continue;
        dynamicPanels.set(`${control.name}.Panel${panel}`, candidates);
        candidates.forEach((name) => reparentedControls.add(name));
      }
    }
    visit(control.children);
  });
  visit(controls);
  return { dynamicPanels, reparentedControls };
}

function prepareRuntimeTabs(hints: RuntimeLayoutHint[]): Map<string, Extract<RuntimeLayoutHint, { kind: "add-tab" }>[]> {
  const tabs = new Map<string, Extract<RuntimeLayoutHint, { kind: "add-tab" }>[]>();
  for (const hint of hints) {
    if (hint.kind !== "add-tab") continue;
    const current = tabs.get(hint.parentControlName) ?? [];
    if (!current.some((item) => item.controlName === hint.controlName)) current.push(hint);
    tabs.set(hint.parentControlName, current);
  }
  return tabs;
}

function hasNonReparentedControl(control: VisualControl, reparented: Set<string>): boolean {
  return control.children.some((child) => !reparented.has(child.name) || hasNonReparentedControl(child, reparented));
}

function node(
  context: Context,
  kind: NormalizedLayoutNode["kind"],
  values: Omit<NormalizedLayoutNode, "id" | "kind"> = {},
): NormalizedLayoutNode {
  return { id: `layout-${context.nextId++}`, kind, ...values };
}

function withRole(value: NormalizedLayoutNode, role: NormalizedLayoutNode["role"]): NormalizedLayoutNode {
  return { ...value, role };
}

function isPopupOrNonVisual(control: VisualControl): boolean {
  return control.properties.nonVisual === true || control.kind === "ContextMenuStrip" || /(?:Timer|ToolTip)$/i.test(control.name);
}

function isStatus(control: VisualControl): boolean {
  return control.kind === "StatusStrip" || control.dock === "Bottom" && /status/i.test(control.name);
}

function isToolbar(control: VisualControl): boolean {
  return ["ToolStrip", "MenuStrip"].includes(control.kind)
    || /^(?:MenuStripEx|ToolStripEx)$/.test(control.componentRef ?? "")
    || /(?:menuStrip|toolbar|toolstrip)/i.test(control.name);
}

function isAction(control: VisualControl): boolean {
  return ["Button", "ToolStripButton", "ToolStripDropDownButton", "ToolStripSplitButton"].includes(control.kind);
}

function isFrame(control: VisualControl): boolean {
  return ["Panel", "GroupBox", "TabPage"].includes(control.kind);
}

function primaryScore(control: VisualControl, context: Context): number {
  let score = area(control);
  if (control.dock === "Fill") score += 1_000_000;
  if (["SplitContainer", "TableLayoutPanel", "DataGridView", "ListView", "TreeView"].includes(control.kind)) score += 600_000;
  if (control.componentRef && context.resolvedComponents.has(control.componentRef)) score += 800_000;
  if (control.componentRef && !context.resolvedComponents.has(control.componentRef)) score -= 250_000;
  if (/(?:loading|cancel|conflict|preview|picture)/i.test(control.name)) score -= 500_000;
  return score;
}

function area(control: VisualControl): number {
  return Math.max(0, control.bounds?.width ?? 0) * Math.max(0, control.bounds?.height ?? 0);
}

function overlaps(a: VisualControl, b: VisualControl): boolean {
  if (!a.bounds || !b.bounds) return true;
  const width = Math.max(0, Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) - Math.max(a.bounds.x, b.bounds.x));
  const height = Math.max(0, Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) - Math.max(a.bounds.y, b.bounds.y));
  const intersection = width * height;
  return intersection / Math.max(1, Math.min(area(a), area(b))) >= 0.25;
}

function mostlySameRow(controls: VisualControl[]): boolean {
  if (controls.length < 2) return false;
  const centers = controls.map((control) => (control.bounds?.y ?? 0) + (control.bounds?.height ?? 0) / 2);
  const averageHeight = controls.reduce((sum, control) => sum + (control.bounds?.height ?? 24), 0) / controls.length;
  return Math.max(...centers) - Math.min(...centers) <= averageHeight;
}

function cssTrack(sizing: VisualTableSizing): string {
  if (sizing.type === "Absolute") return `${Math.max(1, sizing.value ?? 1)}px`;
  if (sizing.type === "Percent") return `${Math.max(1, sizing.value ?? 1)}fr`;
  return "auto";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
