import { describe, expect, it } from "vitest";
import { migrationSurfaceTsx } from "../src/generator/migrationTargetRuntime.js";
import { migrationComponentAdapters, migrationVisualProfilesTsx } from "../src/generator/migrationVisualProfiles.js";
import { buildTargetManifest } from "../src/ir/targetManifest.js";

function project(page: Record<string, unknown>, componentIds: string[] = []) {
  return {
    pages: [{ text: page.name, sourcePath: String(page.name) + ".Designer.cs", baseTypes: [],
      support: { contractPoints: [] }, ...page }],
    components: componentIds.map((id) => ({
      id, sourcePath: id + ".cs", status: "external", instanceCount: 1, controls: [],
    })),
    assets: [],
  } as any;
}

describe("visual profile boundary", () => {
  it("keeps action-driven grids useful when WinForms relied on AutoGenerateColumns", () => {
    const runtime = migrationSurfaceTsx(project({ name: "CategoryPage", controls: [] }));

    expect(runtime).toContain("const inferredFields = designerColumns.length === 0");
    expect(runtime).toContain("runtimeInferred: true");
    expect(runtime).toContain("column.runtimeInferred ? column.name : undefined");
    expect(runtime).toContain("requestControllers.current.get(requestKey)?.abort()");
    expect(runtime).toContain("signal: requestController.signal");
  });

  it("keeps the shared runtime byte-identical while loading workspace fixtures only for the matching profile", () => {
    const workspace = project({
      name: "FormBrowse",
      controls: [{ name: "RevisionGrid", kind: "Custom", componentRef: "RevisionGridControl", sourceType: "RevisionGridControl", children: [] }],
    }, ["RevisionGridControl"]);
    const neutral = project({
      name: "CustomerEditor",
      controls: [{ name: "RevisionGrid", kind: "Custom", componentRef: "RevisionGridControl", sourceType: "RevisionGridControl", children: [] }],
    }, ["RevisionGridControl"]);

    const workspaceRuntime = migrationSurfaceTsx(workspace);
    const neutralRuntime = migrationSurfaceTsx(neutral);
    const workspaceProfile = migrationVisualProfilesTsx(workspace);
    const neutralProfile = migrationVisualProfilesTsx(neutral);

    expect(workspaceRuntime).toBe(neutralRuntime);
    expect(workspaceProfile).toContain('"FormBrowse"');
    expect(workspaceProfile).toContain('"gitextensions_5"');
    expect(workspaceProfile).toMatch(/"RevisionGridControl",\s+"revision-grid"/);
    expect(workspaceProfile).toContain('"RightSplitContainer"');
    expect(workspaceProfile).toContain('"btnResetAllChanges"');

    expect(neutralProfile).not.toContain('"gitextensions_5"');
    expect(neutralProfile).not.toMatch(/"RevisionGridControl",\s+"revision-grid"/);
    expect(neutralProfile).not.toContain('"RightSplitContainer"');
    expect(neutralProfile).not.toContain('"btnResetAllChanges"');

    for (const forbidden of [
      "FormBrowse", "OpenDental", "gitextensions_5", "tmp/reword1", "GitUI/",
      "RightSplitContainer", "repositoryToolStripMenuItem", "_NO_TRANSLATE_WorkingDir", "btnResetAllChanges",
    ]) {
      expect(workspaceRuntime, "shared runtime leaked project token: " + forbidden).not.toContain(forbidden);
    }
  });

  it("maps OpenDental grids and menus once in generated configuration, not shared runtime", () => {
    const openDental = project({
      name: "PatientWorkspace",
      baseTypes: ["FormODBase"],
      controls: [
        { name: "records", kind: "UserControl", componentRef: "GridOD", sourceType: "OpenDental.UI.GridOD", children: [] },
        { name: "commands", kind: "UserControl", componentRef: "MenuOD", sourceType: "OpenDental.UI.MenuOD", children: [] },
      ],
    }, ["GridOD", "MenuOD", "OtherExternal"]);
    const adapters = migrationComponentAdapters(openDental);
    const profile = migrationVisualProfilesTsx(openDental);
    const runtime = migrationSurfaceTsx(openDental);
    const manifest = buildTargetManifest(openDental, { componentAdapters: adapters });

    expect(adapters).toEqual({ GridOD: "data-grid", MenuOD: "menu-bar" });
    expect(profile).toMatch(/"GridOD",\s+"data-grid"/);
    expect(profile).toMatch(/"MenuOD",\s+"menu-bar"/);
    expect(manifest.totals).toMatchObject({ adaptedSharedComponentTypes: 2, adaptedSharedComponentInstances: 2, fallbackSharedComponentTypes: 1 });
    expect(manifest.totals.tables).toBe(1);
    expect(runtime).not.toContain("GridOD");
    expect(runtime).not.toContain("MenuOD");
    expect(runtime).not.toContain("OpenDental");
  });
});
