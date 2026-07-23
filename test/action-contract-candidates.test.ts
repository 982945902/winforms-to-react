import { describe, expect, it } from "vitest";
import { buildActionContractCandidateReport } from "../src/actionContractCandidates.js";
import type { ProjectIR } from "../src/ir/types.js";

describe("ActionContract candidate report", () => {
  it("overlays exact mappings while retaining every unresolved trigger and duplicate handler group", () => {
    const contract = (controlName: string, handler: string, calledSymbols: string[], sourceFile = "/source/FormBatch.cs", lineStart = 10) => ({
      controlName, event: "Click", handler, sourceFile, lineStart, lineEnd: lineStart ? 15 : 0, calledSymbols,
    });
    const project = {
      pages: [{
        name: "FormBatch", text: "Batch", sourcePath: "/source/FormBatch.Designer.cs", controls: [],
        support: { contractPoints: [
          contract("buttonSave", "shared_Click", ["Patients.Update"]),
          contract("buttonRetry", "shared_Click", ["gridMain.BeginUpdate"]),
          contract("buttonLocal", "local_Click", ["gridMain.BeginUpdate"]),
          contract("buttonUnknown", "unknown_Click", [], "(handler not found)", 0),
          contract("buttonEmpty", "empty_Click", []),
        ] },
      }],
      actionContracts: [{
        schemaVersion: 1, id: "batch-v1", page: "FormBatch", backend: { baseUrl: "/api" },
        operations: [{
          operationId: "save", handler: "shared_Click", trigger: { controlName: "buttonSave", event: "Click" },
          triggers: [{ controlName: "buttonSave", event: "Click" }, { controlName: "buttonRetry", event: "Click" }],
          execution: "server", intent: "Save", capabilities: ["data"], transport: { method: "POST", path: "/save" },
          request: { fields: [{ name: "value", sourceControl: "buttonSave", source: "value" }] },
        }],
      }],
    } as unknown as ProjectIR;

    const report = buildActionContractCandidateReport(project);
    expect(report.summary).toMatchObject({
      pages: 1, candidates: 5, mapped: 2, unmapped: 3, mappedPercent: 40,
      operationDefinitions: 1, triggerReuseSavings: 1, duplicateHandlerGroups: 1, manualRequestFields: 1,
      reviewCandidates: 1, noOpCandidates: 1,
    });
    expect(report.pages[0].items).toHaveLength(5);
    expect(report.pages[0].items.find((item) => item.controlName === "buttonSave")).toMatchObject({
      mappingStatus: "mapped", mappedPlanId: "batch-v1", mappedOperationId: "save", suggestedExecution: "server",
    });
    expect(report.pages[0].items.find((item) => item.controlName === "buttonRetry")).toMatchObject({
      mappingStatus: "mapped", mappedOperationId: "save", suggestedExecution: "client",
    });
    expect(report.pages[0].items.find((item) => item.controlName === "buttonLocal")).toMatchObject({ mappingStatus: "unmapped", suggestedExecution: "client" });
    expect(report.pages[0].items.find((item) => item.controlName === "buttonUnknown")?.capabilities).toEqual(["unclassified"]);
    expect(report.pages[0].items.find((item) => item.controlName === "buttonUnknown")?.suggestedExecution).toBe("review");
    expect(report.pages[0].items.find((item) => item.controlName === "buttonEmpty")).toMatchObject({ capabilities: ["no-op"], suggestedExecution: "omit" });
    expect(report.duplicateHandlerGroups[0].triggers).toEqual([
      { controlName: "buttonSave", event: "Click" },
      { controlName: "buttonRetry", event: "Click" },
    ]);
  });

  it("classifies exact window lifecycle and print shapes without hiding unknown cleanup work", () => {
    const point = (overrides: Record<string, unknown>) => ({
      controlName: "Form1", event: "FormClosed", handler: "Form1_FormClosed",
      sourceFile: "/source/Form1.cs", lineStart: 10, lineEnd: 12, calledSymbols: [],
      ...overrides,
    });
    const project = {
      pages: [{
        name: "Form1", text: "Form", sourcePath: "/source/Form1.Designer.cs", controls: [],
        support: { contractPoints: [
          point({ handler: "reset", assignedSymbols: ["_instance"] }),
          point({ event: "Click", handler: "close", calledSymbols: ["this.Close"] }),
          point({ event: "Click", handler: "bareClose", calledSymbols: ["Close"] }),
          point({ event: "Click", handler: "print", calledSymbols: ["printer.PrintDataGridView"], constructedTypes: ["DGVPrinter"] }),
          point({ event: "Click", handler: "databaseClose", calledSymbols: ["conn.Close"], constructedTypes: ["SqlConnection"] }),
          point({ event: "Click", handler: "message", calledSymbols: ["MessageBox.Show"] }),
          point({ handler: "unknownCleanup", calledSymbols: ["CleanupSession"] }),
          point({ handler: "savedCleanup", calledSymbols: ["Repository.Save"] }),
        ] },
      }],
    } as unknown as ProjectIR;

    const items = buildActionContractCandidateReport(project).pages[0].items;
    expect(items.map((item) => ({ handler: item.handler, execution: item.suggestedExecution, capabilities: item.capabilities }))).toEqual([
      { handler: "reset", execution: "client", capabilities: ["ui"] },
      { handler: "close", execution: "client", capabilities: ["navigation"] },
      { handler: "bareClose", execution: "client", capabilities: ["navigation"] },
      { handler: "print", execution: "client", capabilities: ["ui"] },
      { handler: "databaseClose", execution: "server", capabilities: ["data"] },
      { handler: "message", execution: "client", capabilities: ["ui"] },
      { handler: "unknownCleanup", execution: "review", capabilities: ["unclassified"] },
      { handler: "savedCleanup", execution: "server", capabilities: ["data"] },
    ]);
    expect(items[0].capabilityEvidence).toContainEqual({ capability: "ui", kind: "assignment", symbol: "_instance" });
  });
});
