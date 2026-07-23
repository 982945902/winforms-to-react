import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildActionContractDraftBundle, formatActionContractDraftMarkdown, writeActionContractDraftBundle } from "../src/actionContractDrafts.js";
import { loadActionContractManifest } from "../src/actionContractManifest.js";
import type { ProjectIR } from "../src/ir/types.js";

function point(controlName: string, event: string, handler: string, calledSymbols: string[]) {
  return { controlName, event, handler, sourceFile: "/source/FormBatch.cs", lineStart: 20, lineEnd: 25, calledSymbols };
}

const project = {
  sourceRoot: "/source",
  pages: [{
    name: "FormBatch",
    text: "Batch",
    sourcePath: "/source/FormBatch.Designer.cs",
    controls: [
      { name: "radioA", kind: "RadioButton", children: [] },
      { name: "radioB", kind: "RadioButton", children: [] },
      { name: "buttonLocal", kind: "Button", children: [] },
      { name: "buttonUnknown", kind: "Button", children: [] },
      { name: "buttonMissing", kind: "Button", children: [] },
      { name: "comboStatus", kind: "ComboBox", children: [] },
      { name: "gridMain", kind: "DataGridView", children: [] },
    ],
    support: { contractPoints: [
      point("FormBatch", "Load", "FormBatch_Load", ["Patients.GetPat"]),
      point("radioA", "CheckedChanged", "radioFilter_CheckedChanged", ["Patients.GetPat", "comboStatus.Items.Clear"]),
      point("radioB", "CheckedChanged", "radioFilter_CheckedChanged", ["Patients.GetPat", "comboStatus.Items.Clear"]),
      point("buttonLocal", "Click", "buttonLocal_Click", ["gridMain.BeginUpdate"]),
      point("buttonUnknown", "Click", "buttonUnknown_Click", []),
      { ...point("buttonMissing", "Click", "buttonMissing_Click", []), sourceFile: "(handler not found)", lineStart: 0, lineEnd: 0 },
    ] },
  }],
  actionContracts: [{
    schemaVersion: 1,
    id: "batch-v1",
    page: "FormBatch",
    backend: { baseUrl: "/api" },
    operations: [{
      operationId: "load",
      handler: "FormBatch_Load",
      trigger: { controlName: "FormBatch", event: "Load" },
      execution: "server",
      intent: "Load",
      capabilities: ["data"],
      transport: { method: "GET", path: "/load" },
    }],
  }],
} as unknown as ProjectIR;

describe("ActionContract skeleton drafts", () => {
  it("groups shared handlers, excludes mapped triggers, and emits binding/source evidence", () => {
    const bundle = buildActionContractDraftBundle(project, { baseUrl: "http://127.0.0.1:5999" });
    expect(bundle.status).toBe("draft");
    expect(bundle.summary).toEqual({
      selectedPages: 1,
      pagesWithUnresolvedWork: 1,
      mappedTriggers: 1,
      unmappedTriggers: 5,
      operationSkeletons: 4,
      groupedOperations: 1,
      triggerReuseSavings: 1,
      serverOperations: 1,
      clientOperations: 1,
      reviewOperations: 1,
      omitOperations: 1,
      unclassifiedOperations: 1,
    });
    const shared = bundle.pages[0].operations.find((operation) => operation.handler === "radioFilter_CheckedChanged")!;
    expect(shared.triggers).toHaveLength(2);
    expect(shared.contractTemplate).toMatchObject({
      operationId: "radioFilterCheckedChanged",
      execution: "server",
      triggers: [{ controlName: "radioA", event: "CheckedChanged" }, { controlName: "radioB", event: "CheckedChanged" }],
      transport: { method: "POST" },
    });
    expect(shared.bindingHints.responseControlCandidates).toContainEqual({ controlName: "comboStatus", kind: "ComboBox" });
    expect(bundle.pages[0].operations.find((operation) => operation.handler === "buttonUnknown_Click")?.suggestedExecution).toBe("omit");
    expect(bundle.pages[0].operations.find((operation) => operation.handler === "buttonMissing_Click")?.suggestedExecution).toBe("review");
    expect(bundle.pages[0].planHeaderTemplate.backend.baseUrl).toBe("http://127.0.0.1:5999");
    expect(formatActionContractDraftMarkdown(bundle)).toContain("2 triggers → 1 operation skeleton");
  });

  it("writes a bundle, Markdown summary, and a deliberately non-loadable page draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-action-drafts-"));
    try {
      const output = await writeActionContractDraftBundle(buildActionContractDraftBundle(project), root);
      expect(output.pagePaths).toHaveLength(1);
      expect(JSON.parse(await readFile(output.bundlePath, "utf8"))).toMatchObject({ kind: "ActionContractDraftBundle", status: "draft" });
      expect(await readFile(output.markdownPath, "utf8")).toContain("Operation skeletons: 4");
      await expect(loadActionContractManifest(output.pagePaths[0], project)).rejects.toThrow("requires schemaVersion 1, id, and page");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a page filter outside the selected ProjectIR", () => {
    expect(() => buildActionContractDraftBundle(project, { page: "MissingForm" })).toThrow("not part of the selected ProjectIR");
  });
});
