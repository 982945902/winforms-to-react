import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadActionContractManifests } from "../src/actionContractManifest.js";
import type { ProjectIR } from "../src/ir/types.js";

const sidecars = [
  "migration-batches/action-contracts/opendental-patient-edit-client.json",
  "migration-batches/action-contracts/opendental-eservices-patient-portal-client.json",
  "migration-batches/action-contracts/opendental-patient-status-tool-client.json",
];

const project = {
  pages: [
    {
      name: "FormPatientEdit",
      controls: [
        { name: "butClearDateTimeDeceased", kind: "Button", children: [] },
        { name: "textDateTimeDeceased", kind: "TextBox", children: [] },
        { name: "textZip", kind: "TextBox", children: [] },
        { name: "comboZip", kind: "ComboBox", children: [] },
      ],
      support: { contractPoints: [
        { controlName: "butClearDateTimeDeceased", event: "Click", handler: "butClearDateTimeDeceased_Click" },
        { controlName: "textZip", event: "TextChanged", handler: "textZip_TextChanged" },
      ] },
    },
    {
      name: "FormEServicesPatientPortal",
      controls: [
        { name: "butCopyToClipboard", kind: "Button", children: [] },
        { name: "textHostedUrlPortal", kind: "TextBox", children: [] },
      ],
      support: { contractPoints: [
        { controlName: "butCopyToClipboard", event: "Click", handler: "butCopyToClipboard_Click" },
      ] },
    },
    {
      name: "FormPatientStatusTool",
      controls: [
        { name: "butSelectAll", kind: "Button", children: [] },
        { name: "butDeselectAll", kind: "Button", children: [] },
        { name: "gridMain", kind: "DataGridView", children: [] },
      ],
      support: { contractPoints: [
        { controlName: "butSelectAll", event: "Click", handler: "butSelectAll_Click" },
        { controlName: "butDeselectAll", event: "Click", handler: "butDeselectAll_Click" },
      ] },
    },
  ],
} as unknown as ProjectIR;

describe("activated OpenDental client sidecars", () => {
  it("loads five source-matched client effects across three pages", async () => {
    const plans = await loadActionContractManifests(sidecars.map((path) => resolve(path)), project);
    const operations = plans.flatMap((plan) => plan.operations);

    expect(plans).toHaveLength(3);
    expect(operations).toHaveLength(5);
    expect(operations.every((operation) => operation.execution === "client")).toBe(true);
    expect(operations.map((operation) => operation.effect?.kind)).toEqual([
      "set-value", "set-value", "copy-value", "select-all", "clear-all",
    ]);
    expect(operations.find((operation) => operation.operationId === "clearFrequentZipSelection")?.effect)
      .toEqual({ kind: "set-value", targetControl: "comboZip", targetProperty: "selectedIndex", value: -1 });
  });

  it("keeps every activated sidecar in the reproducible patient batch", async () => {
    const batch = JSON.parse(await readFile(resolve("migration-batches/opendental-patient.json"), "utf8"));
    expect(batch.actionContracts).toEqual(expect.arrayContaining(sidecars.map((path) => path.replace("migration-batches/", ""))));
  });
});
