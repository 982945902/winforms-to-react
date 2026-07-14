import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateRefineProject } from "../src/generator/refineProjectGenerator.js";
import { buildProjectIR } from "../src/ir/projectIr.js";
import type { VisualControl } from "../src/ir/types.js";
import { parseTabPageAssetRelations } from "../src/parser/tabPageAssetCatalog.js";

describe("TabPage service assets", () => {
  it("pairs Resources-backed service icons with config TabPages inside the same class", () => {
    const relations = parseTabPageAssetRelations(`
      class CloudUploaderService : UploaderService {
        public override Icon ServiceIcon => Resources.Cloud;
        public override TabPage GetUploadersConfigTabPage(SettingsForm form) => form.tpCloud;
      }
      class LocalUploaderService : UploaderService {
        public override Image ServiceImage { get { return Properties.Resources.LocalDisk; } }
        public override TabPage GetUploadersConfigTabPage(SettingsForm form) {
          return form.tpLocal;
        }
      }
      class UnrelatedIconService { public override Icon ServiceIcon => Resources.Wrong; }
      class UnrelatedTabService { public override TabPage GetUploadersConfigTabPage(SettingsForm form) => form.tpWrong; }
    `, "/project/Services.cs");

    expect(relations.map((relation) => ({ tab: relation.tabPageName, key: relation.assetKey }))).toEqual([
      { tab: "tpCloud", key: "Cloud" },
      { tab: "tpLocal", key: "LocalDisk" },
    ]);
    expect(relations[0].source).toEqual(expect.objectContaining({
      property: "imageKey", value: "Cloud", sourceFile: "Services.cs",
    }));
  });

  it("materializes the relation into neutral IR and the generated asset manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-tab-assets-"));
    const output = join(root, "out");
    try {
      const designer = join(root, "SettingsForm.Designer.cs");
      await writeFile(designer, `partial class SettingsForm {
        private System.Windows.Forms.TabControl tabs;
        public System.Windows.Forms.TabPage tpCloud;
        private void InitializeComponent() {
          this.tabs = new System.Windows.Forms.TabControl();
          this.tpCloud = new System.Windows.Forms.TabPage();
          this.tabs.Location = new System.Drawing.Point(8, 8);
          this.tabs.Size = new System.Drawing.Size(300, 200);
          this.tpCloud.Text = "Cloud";
          this.tabs.Controls.Add(this.tpCloud);
          this.ClientSize = new System.Drawing.Size(320, 220);
          this.Controls.Add(this.tabs);
        }
      }`, "utf8");
      await writeFile(join(root, "CloudService.cs"), `class CloudService {
        public Icon ServiceIcon => Resources.Cloud_Service;
        public TabPage GetUploadersConfigTabPage(SettingsForm form) => form.tpCloud;
      }`, "utf8");
      await writeFile(join(root, "Cloud-Service.ico"), Buffer.from([0, 0, 1, 0]), "binary");

      const project = await buildProjectIR(designer, { contextRoot: root });
      const tabPage = findControl(project.pages[0].controls, "tpCloud");
      expect(tabPage?.appearance.imageKey).toBe("Cloud_Service");
      expect(tabPage?.runtimeAssetSources).toEqual([
        expect.objectContaining({ value: "Cloud_Service", sourceFile: "CloudService.cs" }),
      ]);
      expect(project.assets).toEqual([
        expect.objectContaining({ key: "Cloud_Service", sourcePath: join(root, "Cloud-Service.ico"), targetFileName: "Cloud_Service.ico" }),
      ]);

      await generateRefineProject({ outDir: output, project });
      expect(await stat(join(output, "src", "assets", "Cloud_Service.ico"))).toBeTruthy();
      expect(await readFile(join(output, "src", "runtime", "MigrationSurface.tsx"), "utf8"))
        .toContain("native-tab-tree-icon");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function findControl(controls: VisualControl[], name: string): VisualControl | undefined {
  for (const control of controls) {
    if (control.name === name) return control;
    const nested = findControl(control.children, name);
    if (nested) return nested;
  }
  return undefined;
}
