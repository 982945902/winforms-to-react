import { describe, expect, it } from "vitest";
import { normalizeLayout } from "../src/ir/layoutNormalizer.js";
import type { NormalizedLayoutNode, VisualControl } from "../src/ir/types.js";

function control(values: Partial<VisualControl> & Pick<VisualControl, "kind" | "name">): VisualControl {
  return {
    appearance: {}, properties: {}, events: [], children: [],
    ...values,
  };
}

function kinds(node: NormalizedLayoutNode): string[] {
  return [node.kind, ...(node.children ?? []).flatMap(kinds), ...(node.cells ?? []).flatMap((cell) => kinds(cell.node))];
}

describe("semantic layout normalization", () => {
  it("preserves split panes and converts overlapping states into one layer", () => {
    const normal = control({ kind: "UserControl", name: "Staged", componentRef: "FileStatusList", dock: "Fill", bounds: { x: 0, y: 28, width: 400, height: 300 } });
    const loading = control({ kind: "PictureBox", name: "LoadingStaged", dock: "Fill", bounds: { x: 0, y: 28, width: 400, height: 300 } });
    const cancel = control({ kind: "Button", name: "Cancel", text: "Cancel", bounds: { x: 130, y: 160, width: 90, height: 24 } });
    const toolbar = control({ kind: "UserControl", name: "toolbarStaged", componentRef: "ToolStripEx", bounds: { x: 0, y: 0, width: 400, height: 28 } });
    const split = control({
      kind: "SplitContainer", name: "splitMain", orientation: "Horizontal", splitterDistance: 240,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      panel1Children: ["top"], panel2Children: ["toolbarStaged", "Staged", "LoadingStaged", "Cancel"],
      children: [control({ kind: "Panel", name: "top", dock: "Fill", bounds: { x: 0, y: 0, width: 800, height: 240 } }), toolbar, normal, loading, cancel],
    });

    const plan = normalizeLayout([split], { width: 800, height: 600 }, new Set(["FileStatusList"]));
    expect(kinds(plan.root)).toEqual(expect.arrayContaining(["split", "stack", "layers"]));
    expect(plan.diagnostics.stateAlternatives).toBe(2);
  });

  it("keeps side-by-side reusable component instances instead of treating them as states", () => {
    const plan = normalizeLayout([
      control({ kind: "UserControl", name: "shipping", componentRef: "AddressEditor", bounds: { x: 8, y: 8, width: 160, height: 80 } }),
      control({ kind: "UserControl", name: "billing", componentRef: "AddressEditor", bounds: { x: 180, y: 8, width: 160, height: 80 } }),
    ], { width: 360, height: 140 }, new Set(["AddressEditor"]));
    expect(plan.root).toEqual(expect.objectContaining({ kind: "stack", axis: "horizontal" }));
    expect(plan.diagnostics.stateAlternatives).toBe(0);
  });

  it("preserves a TabControl as selectable pages instead of stacking every tab", () => {
    const tabs = control({
      kind: "TabControl", name: "revisionTabs", appearance: { selectedIndex: 1 },
      children: [
        control({ kind: "TabPage", name: "commitTab", text: "Commit", children: [control({ kind: "UserControl", name: "commitInfo", componentRef: "CommitInfo" })] }),
        control({ kind: "TabPage", name: "diffTab", text: "Diff", children: [control({ kind: "UserControl", name: "revisionDiff", componentRef: "RevisionDiffControl" })] }),
      ],
    });

    const plan = normalizeLayout([tabs], { width: 640, height: 420 }, new Set(), [{
      kind: "add-tab", controlName: "_consoleTabPage", parentControlName: "revisionTabs", label: "Console",
      imageKey: "Console", viewKind: "terminal", sourceFile: "BrowseForm.cs", line: 42,
    }]);
    expect(plan.root).toEqual(expect.objectContaining({
      kind: "tabs",
      controlName: "revisionTabs",
      selectedIndex: 1,
    }));
    expect(plan.root.children?.map((page) => page.label)).toEqual(["Commit", "Diff"]);
    expect(plan.root.runtimeTabs).toEqual([{ id: "_consoleTabPage", label: "Console", imageKey: "Console", viewKind: "terminal" }]);
    expect(plan.diagnostics.runtimeTabs).toEqual([{ controlName: "_consoleTabPage", target: "revisionTabs", label: "Console" }]);
  });

  it("keeps a custom MenuStripEx above the main fill surface", () => {
    const menu = control({ kind: "UserControl", name: "mainMenuStrip", componentRef: "MenuStripEx", bounds: { x: 0, y: 0, width: 900, height: 24 } });
    const content = control({ kind: "ToolStripContainer", name: "toolPanel", dock: "Fill", bounds: { x: 0, y: 24, width: 900, height: 576 } });

    const plan = normalizeLayout([content, menu], { width: 900, height: 600 }, new Set());
    expect(plan.root).toEqual(expect.objectContaining({ kind: "stack", axis: "vertical" }));
    expect(plan.root.children?.[0]).toEqual(expect.objectContaining({ role: "toolbar", controlName: "mainMenuStrip" }));
    expect(plan.root.children?.[1]).toEqual(expect.objectContaining({ role: "content", controlName: "toolPanel" }));
  });

  it("infers a missing splitter distance from its first pane and removes collapsed empty panes", () => {
    const left = control({ kind: "Panel", name: "left", dock: "Fill", bounds: { x: 1, y: 1, width: 190, height: 500 } });
    const right = control({ kind: "Panel", name: "right", dock: "Fill", bounds: { x: 0, y: 0, width: 727, height: 500 } });
    const main = control({
      kind: "SplitContainer", name: "main", bounds: { x: 0, y: 0, width: 923, height: 500 },
      panel1Children: ["left"], panel2Children: ["right"], children: [left, right],
    });
    const collapsed = control({
      kind: "SplitContainer", name: "collapsed", orientation: "Horizontal", bounds: { x: 0, y: 0, width: 190, height: 500 },
      panel1Children: ["left"], panel2Children: [], properties: { Panel2Collapsed: true }, children: [left],
    });

    const mainPlan = normalizeLayout([main], { width: 923, height: 500 }, new Set());
    expect(mainPlan.root).toEqual(expect.objectContaining({ kind: "split", ratio: 190 / 923 }));
    const collapsedPlan = normalizeLayout([collapsed], { width: 190, height: 500 }, new Set());
    expect(kinds(collapsedPlan.root)).not.toContain("split");
    expect(collapsedPlan.root).toEqual(expect.objectContaining({ kind: "frame", controlName: "collapsed" }));
  });

  it("lays ToolStripContainer top strips out in one native toolbar row", () => {
    const main = control({ kind: "UserControl", name: "ToolStripMain", componentRef: "ToolStripEx" });
    const filter = control({ kind: "UserControl", name: "ToolStripFilters", componentRef: "FilterToolBar" });
    const scripts = control({ kind: "UserControl", name: "ToolStripScripts", componentRef: "ToolStripEx" });
    const content = control({ kind: "Panel", name: "content", dock: "Fill" });
    const host = control({
      kind: "ToolStripContainer", name: "toolPanel", topToolStripChildren: [main.name, filter.name, scripts.name],
      contentPanelChildren: [content.name], children: [main, filter, scripts, content],
    });

    const plan = normalizeLayout([host], { width: 900, height: 600 }, new Set());
    const stack = plan.root.children?.[0];
    expect(stack?.children?.[0]).toEqual(expect.objectContaining({ kind: "stack", role: "toolbar", axis: "horizontal" }));
  });

  it("recovers a code-behind control reparented into an empty split pane", () => {
    const grid = control({ kind: "UserControl", name: "RevisionGrid", componentRef: "RevisionGridControl", dock: "Fill" });
    const revisions = control({
      kind: "SplitContainer", name: "RevisionsSplitContainer", splitterDistance: 350,
      bounds: { x: 0, y: 0, width: 650, height: 209 }, panel1Children: [grid.name], panel2Children: [], children: [grid],
    });
    const info = control({ kind: "UserControl", name: "RevisionInfo", componentRef: "CommitInfo", dock: "Fill" });
    const commitPage = control({ kind: "TabPage", name: "CommitInfoTabPage", text: "Commit", children: [info] });
    const diffPage = control({ kind: "TabPage", name: "DiffTabPage", text: "Diff", children: [control({ kind: "UserControl", name: "revisionDiff", componentRef: "RevisionDiffControl" })] });
    const tabs = control({ kind: "TabControl", name: "CommitInfoTabControl", bounds: { x: 0, y: 220, width: 650, height: 287 }, children: [commitPage, diffPage] });

    const plan = normalizeLayout([revisions, tabs], { width: 650, height: 507 }, new Set(), [{
      kind: "reparent", controlName: "RevisionInfo", parentControlName: "RevisionsSplitContainer", panel: 2, sourceFile: "BrowseForm.cs", line: 10,
    }]);
    const nodes: NormalizedLayoutNode[] = [];
    const visit = (node: NormalizedLayoutNode) => { nodes.push(node); node.children?.forEach(visit); node.cells?.forEach((cell) => visit(cell.node)); };
    visit(plan.root);
    expect(nodes).toContainEqual(expect.objectContaining({ kind: "split", controlName: "RevisionsSplitContainer", ratio: 350 / 650 }));
    expect(nodes).toContainEqual(expect.objectContaining({ kind: "control", controlName: "RevisionInfo" }));
    const tabNode = nodes.find((node) => node.kind === "tabs");
    expect(tabNode?.children?.map((page) => page.label)).toEqual(["Diff"]);
    expect(plan.diagnostics.runtimeReparents).toEqual([{ controlName: "RevisionInfo", target: "RevisionsSplitContainer.Panel2" }]);
  });
});
