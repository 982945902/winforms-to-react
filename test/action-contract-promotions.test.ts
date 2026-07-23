import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildActionContractPromotionBundle, formatActionContractPromotionMarkdown, writeActionContractPromotionBundle } from "../src/actionContractPromotions.js";
import { loadActionContractManifest } from "../src/actionContractManifest.js";
import type { ContractPoint, ProjectIR } from "../src/ir/types.js";

function point(controlName: string, handler: string, extra: Partial<ContractPoint> = {}): ContractPoint {
  return {
    controlName,
    event: "Click",
    handler,
    sourceFile: "/source/FormPromotion.cs",
    lineStart: 10,
    lineEnd: 12,
    calledSymbols: [],
    ...extra,
  };
}

const project = {
  sourceRoot: "/source",
  pages: [{
    name: "FormPromotion",
    text: "Promotion",
    sourcePath: "/source/FormPromotion.Designer.cs",
    controls: [
      { name: "buttonSelect", kind: "Button", children: [] },
      { name: "buttonClear", kind: "Button", children: [] },
      { name: "buttonReset", kind: "Button", children: [] },
      { name: "buttonCopy", kind: "Button", children: [] },
      { name: "buttonDialog", kind: "Button", children: [] },
      { name: "buttonSave", kind: "Button", children: [] },
      { name: "buttonMissing", kind: "Button", children: [] },
      { name: "buttonEmpty", kind: "Button", children: [] },
      { name: "textName", kind: "TextBox", children: [] },
      { name: "gridMain", kind: "DataGridView", children: [] },
    ],
    support: { contractPoints: [
      point("buttonSelect", "butSelectAll_Click", { calledSymbols: ["gridMain.SetAll"] }),
      point("buttonClear", "butDeselectAll_Click", { calledSymbols: ["gridMain.SetAll"] }),
      point("textName", "textName_TextChanged", {
        event: "TextChanged", calledSymbols: ["textName.Text.ToUpper"], assignedSymbols: ["textName.Text"],
        valueWrites: [{ controlName: "textName", property: "text", expression: "textName.Text.ToUpper()" }],
      }),
      point("buttonReset", "buttonReset_Click", {
        assignedSymbols: ["textName.Text"],
        valueWrites: [{ controlName: "textName", property: "text", expression: "string.Empty", literalValue: "" }],
      }),
      point("buttonCopy", "buttonCopy_Click", { calledSymbols: ["ODClipboard.SetClipboard"], propertyReads: ["textName.Text"] }),
      point("buttonDialog", "buttonDialog_Click", { calledSymbols: ["detailForm.ShowDialog"] }),
      point("buttonSave", "buttonSave_Click", { calledSymbols: ["Patients.Update"] }),
      point("buttonMissing", "buttonMissing_Click", { sourceFile: "(handler not found)", lineStart: 0, lineEnd: 0 }),
      point("buttonEmpty", "buttonEmpty_Click"),
    ] },
  }],
} as unknown as ProjectIR;

describe("ActionContract promotion proposals", () => {
  it("promotes only exact generic effects and keeps every other boundary as a stub or review", () => {
    const bundle = buildActionContractPromotionBundle(project, { baseUrl: "http://127.0.0.1:5999" });
    expect(bundle.status).toBe("proposal");
    expect(bundle.summary).toMatchObject({
      operations: 9, readyClient: 5, clientStubs: 1, serverStubs: 1, review: 1, omit: 1,
    });
    const operations = bundle.pages[0].operations;
    expect(operations.find((operation) => operation.handler === "butSelectAll_Click")?.inferredEffect)
      .toEqual({ kind: "select-all", targetControl: "gridMain" });
    expect(operations.find((operation) => operation.handler === "butDeselectAll_Click")?.inferredEffect)
      .toEqual({ kind: "clear-all", targetControl: "gridMain" });
    expect(operations.find((operation) => operation.handler === "textName_TextChanged")?.inferredEffect)
      .toEqual({ kind: "transform-value", targetControl: "textName", transform: "uppercase" });
    expect(operations.find((operation) => operation.handler === "buttonReset_Click")?.inferredEffect)
      .toEqual({ kind: "set-value", targetControl: "textName", targetProperty: "text", value: "" });
    expect(operations.find((operation) => operation.handler === "buttonCopy_Click")?.inferredEffect)
      .toEqual({ kind: "copy-value", targetControl: "textName" });
    expect(operations.find((operation) => operation.handler === "buttonDialog_Click")?.disposition).toBe("client-stub");
    expect(operations.find((operation) => operation.handler === "buttonSave_Click")?.disposition).toBe("server-stub");
    expect(operations.find((operation) => operation.handler === "buttonMissing_Click")?.disposition).toBe("review");
    expect(operations.find((operation) => operation.handler === "buttonEmpty_Click")?.disposition).toBe("omit");
  });

  it("writes non-loadable proposals while ready-client operation templates pass strict sidecar validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-promotions-"));
    try {
      const bundle = buildActionContractPromotionBundle(project, { baseUrl: "http://127.0.0.1:5999" });
      const output = await writeActionContractPromotionBundle(bundle, root);
      expect(JSON.parse(await readFile(output.bundlePath, "utf8"))).toMatchObject({ kind: "ActionContractPromotionBundle", status: "proposal" });
      expect(formatActionContractPromotionMarkdown(bundle)).toContain("Exact generic client effects: 5");
      await expect(loadActionContractManifest(output.pagePaths[0], project)).rejects.toThrow("requires schemaVersion 1, id, and page");

      const readyOperations = bundle.pages[0].operations
        .filter((operation) => operation.disposition === "ready-client")
        .map((operation) => operation.operationTemplate);
      const sidecar = join(root, "ready-client.json");
      await writeFile(sidecar, `${JSON.stringify({
        schemaVersion: 1,
        id: "form-promotion-ready-client-v1",
        page: "FormPromotion",
        backend: { baseUrl: "http://127.0.0.1:5999" },
        operations: readyOperations,
      }, null, 2)}\n`, "utf8");
      await expect(loadActionContractManifest(sidecar, project)).resolves.toMatchObject({ operations: expect.arrayContaining([
        expect.objectContaining({ effect: { kind: "transform-value", targetControl: "textName", transform: "uppercase" } }),
      ]) });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
