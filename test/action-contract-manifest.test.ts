import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadActionContractManifest } from "../src/actionContractManifest.js";
import type { ProjectIR } from "../src/ir/types.js";

const project = {
  pages: [{
    name: "FormExport",
    controls: [
      { name: "textQuery", kind: "TextBox", children: [] },
      { name: "gridMain", kind: "DataGridView", columns: [{ name: "columnId", kind: "DataGridViewTextBoxColumn" }], children: [] },
      { name: "buttonSearch", kind: "Button", children: [] },
      { name: "buttonRetry", kind: "Button", children: [] },
    ],
    support: { contractPoints: [
      { controlName: "FormExport", event: "Load", handler: "FormExport_Load" },
      { controlName: "buttonSearch", event: "Click", handler: "buttonSearch_Click" },
      { controlName: "buttonRetry", event: "Click", handler: "buttonSearch_Click" },
    ] },
  }],
} as unknown as ProjectIR;

describe("ActionContract manifest", () => {
  it("validates operations against scanned pages, handlers, and controls", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-action-contract-"));
    try {
      const path = join(root, "actions.json");
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        id: "export-v1",
        page: "FormExport",
        backend: { baseUrl: "http://127.0.0.1:5000" },
        operations: [{
          operationId: "search",
          handler: "buttonSearch_Click",
          trigger: { controlName: "buttonSearch", event: "Click" },
          execution: "server",
          intent: "Search records",
          capabilities: ["data", "ui"],
          transport: { method: "POST", path: "/api/search" },
          request: { fields: [{ name: "query", sourceControl: "textQuery", source: "value", parse: "string" }] },
          response: { bindings: [{ source: "items", targetControl: "gridMain", target: "rows", rowIdField: "id", columnFields: { columnId: "id" } }] },
        }],
      }), "utf8");

      const result = await loadActionContractManifest(path, project);
      expect(result).toMatchObject({ id: "export-v1", page: "FormExport" });
      expect(result.operations[0]).toMatchObject({ operationId: "search", execution: "server" });
      expect(result.operations[0].response?.bindings[0].columnFields).toEqual({ columnId: "id" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes one handler-level operation across multiple scanned triggers", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-action-contract-triggers-"));
    try {
      const path = join(root, "actions.json");
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        id: "shared-handler-v1",
        page: "FormExport",
        backend: { baseUrl: "/api" },
        operations: [{
          operationId: "sharedSearch",
          handler: "buttonSearch_Click",
          triggers: [
            { controlName: "buttonSearch", event: "Click" },
            { controlName: "buttonRetry", event: "Click" },
          ],
          execution: "server",
          intent: "Reuse one mapping",
          capabilities: ["data"],
          transport: { method: "POST", path: "/api/search" },
          request: { fields: [{ name: "trigger", sourceControl: "FormExport", source: "trigger-control", parse: "string" }] },
        }],
      }), "utf8");

      const result = await loadActionContractManifest(path, project);
      expect(result.operations[0].trigger).toEqual({ controlName: "buttonSearch", event: "Click" });
      expect(result.operations[0].triggers).toHaveLength(2);
      expect(result.operations[0].request?.fields[0].source).toBe("trigger-control");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects mappings that do not match the scanned handler contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-action-contract-invalid-"));
    try {
      const path = join(root, "actions.json");
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        id: "invalid",
        page: "FormExport",
        backend: { baseUrl: "/api" },
        operations: [{
          operationId: "search",
          handler: "invented_Click",
          trigger: { controlName: "buttonSearch", event: "Click" },
          execution: "server",
          intent: "Invented handler",
          capabilities: ["data"],
          transport: { method: "POST", path: "/api/search" }
        }],
      }), "utf8");
      await expect(loadActionContractManifest(path, project)).rejects.toThrow("does not match a scanned handler");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects row mappings to columns that were not scanned from the target grid", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-action-contract-column-"));
    try {
      const path = join(root, "actions.json");
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        id: "invalid-column",
        page: "FormExport",
        backend: { baseUrl: "/api" },
        operations: [{
          operationId: "search",
          handler: "buttonSearch_Click",
          trigger: { controlName: "buttonSearch", event: "Click" },
          execution: "server",
          intent: "Search records",
          capabilities: ["data", "ui"],
          transport: { method: "POST", path: "/api/search" },
          response: { bindings: [{
            source: "items", targetControl: "gridMain", target: "rows", rowIdField: "id",
            columnFields: { inventedColumn: "id" },
          }] },
        }],
      }), "utf8");
      await expect(loadActionContractManifest(path, project)).rejects.toThrow("Unknown ActionContract response column");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
