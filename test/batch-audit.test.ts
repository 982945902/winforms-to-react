import { describe, expect, it } from "vitest";
import { buildBatchAuditReport, classifyCalledSymbol, formatBatchAuditMarkdown } from "../src/batchAudit.js";
import { classifyActionEvidence } from "../src/actionCapabilities.js";
import { buildTargetManifest } from "../src/ir/targetManifest.js";
import type { ContractPoint, ProjectIR } from "../src/ir/types.js";

function contract(handler: string, calledSymbols: string[]): ContractPoint {
  return {
    controlName: "buttonRun",
    event: "Click",
    handler,
    sourceFile: "/source/Form.cs",
    lineStart: 10,
    lineEnd: 14,
    calledSymbols,
  };
}

describe("batch audit", () => {
  it("expands source visibility groups into a stable acceptance matrix", () => {
    const project = {
      pages: [{
        name: "FormVariants", sourcePath: "/source/FormVariants.Designer.cs", controls: [],
        support: { contractPoints: [] },
        runtimeVisibilityGroups: [
          { variants: [{ label: "A0" }, { label: "A1" }] },
          { variants: [{ label: "B0" }, { label: "B1" }, { label: "B2" }] },
        ],
      }],
      components: [],
    } as unknown as ProjectIR;

    expect(buildTargetManifest(project).pages[0].acceptanceVariants).toEqual([
      { key: "0-0", labels: ["A0", "B0"] },
      { key: "0-1", labels: ["A0", "B1"] },
      { key: "0-2", labels: ["A0", "B2"] },
      { key: "1-0", labels: ["A1", "B0"] },
      { key: "1-1", labels: ["A1", "B1"] },
      { key: "1-2", labels: ["A1", "B2"] },
    ]);
  });

  it("classifies backend boundaries without treating UI getters as data access", () => {
    expect(classifyCalledSymbol("File.WriteAllText")).toContain("filesystem");
    expect(classifyCalledSymbol("Patients.Update")).toContain("data");
    expect(classifyCalledSymbol("Authentication.GeneratePasswordHash")).toContain("security");
    expect(classifyCalledSymbol("WebServiceProxy.GetSignups")).toContain("external-service");
    expect(classifyCalledSymbol("gridMain.GetSelectedIndex")).toEqual(["ui"]);
  });

  it("classifies boundary evidence with ownership and provenance", () => {
    const result = classifyActionEvidence({
      calledSymbols: [],
      transitiveCalledSymbols: ["UICommands.StashSave"],
      propertyReads: ["gridMain.SelectedRows", "AppSettings.ShowSplitViewLayout"],
      assignedSymbols: ["textName.Text"],
      constructedTypes: ["DetailForm"],
      awaitedCalls: [],
    }, new Set(["gridMain", "textName"]));

    expect(result.capabilities).toEqual(["data", "external-service", "navigation", "ui"]);
    expect(result.evidence).toContainEqual({ capability: "external-service", kind: "transitive-call", symbol: "UICommands.StashSave" });
    expect(result.evidence).toContainEqual({ capability: "navigation", kind: "construction", symbol: "DetailForm" });
    expect(result.evidence).toContainEqual({ capability: "ui", kind: "property-read", symbol: "gridMain.SelectedRows" });
  });

  it("reports local FormClosed field resets consistently with action candidates", () => {
    const emptyCoverage = { total: 0, supported: 0, degraded: 0, unknown: 0, supportedPercent: 100, previewablePercent: 100, unknownPercent: 0, byKind: [] };
    const lifecycle = {
      ...contract("Form1_FormClosed", []), controlName: "Form1", event: "FormClosed", assignedSymbols: ["_instance"],
    };
    const project = {
      pages: [{ name: "Form1", text: "Form1", sourcePath: "/source/Form1.Designer.cs", controls: [], support: { contractPoints: [lifecycle] } }],
      components: [], assets: [],
      report: { controlCoverage: emptyCoverage, unknownControls: [], degradedControls: [] },
    } as unknown as ProjectIR;

    const report = buildBatchAuditReport(project);
    expect(report.coverage.actionContracts).toMatchObject({ total: 1, classified: 1, unclassified: 0 });
    expect(report.recommendedVerticalSlice?.contracts[0].capabilities).toEqual(["ui"]);
  });

  it("reports external component coverage and recommends a bounded data/filesystem slice", () => {
    const emptyCoverage = { total: 2, supported: 2, degraded: 0, unknown: 0, supportedPercent: 100, previewablePercent: 100, unknownPercent: 0, byKind: [] };
    const project = {
      schemaVersion: 1,
      sourceRoot: "/source",
      pages: [
        {
          name: "FormPortal", text: "Portal", sourcePath: "/source/FormPortal.Designer.cs", properties: {}, controls: [], events: [], bindings: [], navigations: [],
          support: { eventStubs: [], unresolvedHandlers: [], bindings: [], navigations: [], controlCoverage: emptyCoverage, contractPoints: [
            contract("buttonSync_Click", ["WebServiceProxy.GetSignups", "Security.IsAuthorized"]),
          ] },
        },
        {
          name: "FormExport", text: "Export", sourcePath: "/source/FormExport.Designer.cs", properties: {}, controls: [], events: [], bindings: [], navigations: [],
          support: { eventStubs: [], unresolvedHandlers: [], bindings: [], navigations: [], controlCoverage: emptyCoverage, contractPoints: [
            contract("buttonExport_Click", ["Patients.GetPat", "Directory.CreateDirectory", "File.WriteAllText"]),
            contract("buttonValidate_Click", ["ExportValidator.ValidatePatient"]),
          ] },
        },
      ],
      components: [
        { id: "SharedPicker", typeName: "SharedPicker", status: "resolved", controls: [], instanceCount: 2 },
        { id: "CustomGrid", typeName: "CustomGrid", status: "external", controls: [], instanceCount: 3 },
      ],
      assets: [],
      report: {
        sourceFiles: [], forms: [], formsConverted: 2, controlsConverted: 2, supportedControls: ["Button"], degradedControls: [], unknownControls: [],
        controlCoverage: emptyCoverage, eventStubs: [],
      },
    } as unknown as ProjectIR;

    const report = buildBatchAuditReport(project);
    expect(report.coverage.sharedComponents.types).toMatchObject({ total: 2, defined: 1, adapted: 0, uncovered: 1, coveredPercent: 50 });
    expect(report.coverage.sharedComponents.instances).toMatchObject({ total: 5, defined: 2, adapted: 0, uncovered: 3, coveredPercent: 40 });
    expect(report.externalComponents).toEqual([{ id: "CustomGrid", instanceCount: 3 }]);
    expect(report.recommendedVerticalSlice?.page).toBe("FormExport");
    expect(report.recommendedVerticalSlice?.reasons.join(" ")).toContain("filesystem boundary");
    expect(report.csharpSliceGate?.status).toBe("blocked");
    expect(report.csharpSliceGate?.checks.find((check) => check.id === "layout-review")?.passed).toBe(false);
    expect(formatBatchAuditMarkdown(report)).toContain("## Recommended C# ActionContract vertical slice");
  });
});
