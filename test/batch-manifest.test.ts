import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBatchManifest } from "../src/batchManifest.js";

describe("migration batch manifest", () => {
  it("resolves an ordered Designer-file subset inside the project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-batch-"));
    try {
      await mkdir(join(root, "Forms"));
      await writeFile(join(root, "Forms", "Second.designer.cs"), "partial class Second {}", "utf8");
      await writeFile(join(root, "Forms", "First.Designer.cs"), "partial class First {}", "utf8");
      await mkdir(join(root, "contracts"));
      await writeFile(join(root, "contracts", "actions.json"), "{}", "utf8");
      const manifestPath = join(root, "patient-batch.json");
      await writeFile(manifestPath, JSON.stringify({ id: "patient", actionContracts: "contracts/actions.json", files: ["Forms/Second.designer.cs", "Forms/First.Designer.cs"] }), "utf8");

      const batch = await loadBatchManifest(manifestPath, root);
      expect(batch.manifest.id).toBe("patient");
      expect(batch.files).toEqual([
        join(root, "Forms", "Second.designer.cs"),
        join(root, "Forms", "First.Designer.cs"),
      ]);
      expect(batch.actionContractPaths).toEqual([join(root, "contracts", "actions.json")]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the project and non-Designer entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-batch-invalid-"));
    try {
      const manifestPath = join(root, "batch.json");
      await writeFile(manifestPath, JSON.stringify({ files: ["../Escape.Designer.cs"] }), "utf8");
      await expect(loadBatchManifest(manifestPath, root)).rejects.toThrow("escapes the project root");
      await writeFile(manifestPath, JSON.stringify({ files: ["Form.cs"] }), "utf8");
      await expect(loadBatchManifest(manifestPath, root)).rejects.toThrow("not a Designer file");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("loads multiple ActionContract sidecars in manifest order and rejects duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-batch-actions-"));
    try {
      await writeFile(join(root, "Form.Designer.cs"), "partial class Form {}", "utf8");
      await writeFile(join(root, "first.json"), "{}", "utf8");
      await writeFile(join(root, "second.json"), "{}", "utf8");
      const manifestPath = join(root, "batch.json");
      await writeFile(manifestPath, JSON.stringify({ files: ["Form.Designer.cs"], actionContracts: ["first.json", "second.json"] }), "utf8");
      await expect(loadBatchManifest(manifestPath, root)).resolves.toMatchObject({
        actionContractPaths: [join(root, "first.json"), join(root, "second.json")],
      });
      await writeFile(manifestPath, JSON.stringify({ files: ["Form.Designer.cs"], actionContracts: ["first.json", "first.json"] }), "utf8");
      await expect(loadBatchManifest(manifestPath, root)).rejects.toThrow("Duplicate batch ActionContract path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
