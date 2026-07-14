import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateNocoBasePlugin } from "../src/generator/nocobasePluginGenerator.js";
import { generateRefineProject } from "../src/generator/refineProjectGenerator.js";
import { buildProjectIR } from "../src/ir/projectIr.js";
import { parseEnumDeclarations } from "../src/parser/enumCatalog.js";

describe("runtime item sources", () => {
  it("reads enum member descriptions without splitting attribute arguments", () => {
    const catalog = parseEnumDeclarations(`
      public enum WorkState : byte {
        Ready = 1,
        [System.ComponentModel.Description("Waiting, review")] Waiting = 2,
        [Description(@"A ""quoted"" state")] Quoted,
      }
      enum Unrelated { One }
    `, new Set(["WorkState"]));

    expect(catalog.get("WorkState")).toEqual(["Ready", "Waiting, review", 'A "quoted" state']);
    expect(catalog.has("Unrelated")).toBe(false);
  });

  it("materializes code-behind enum domains into the same neutral IR for both targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-runtime-items-"));
    const source = join(root, "ui");
    const domain = join(root, "domain");
    const refineOut = join(root, "refine");
    const nocobaseOut = join(root, "nocobase");
    try {
      await mkdir(source);
      await mkdir(domain);
      const designer = join(source, "ContactForm.Designer.cs");
      await writeFile(designer, `partial class ContactForm {
        private System.Windows.Forms.ListBox listStatus;
        private System.Windows.Forms.ComboBox comboGender;
        private System.Windows.Forms.ComboBox comboStatus;
        private System.Windows.Forms.ComboBox comboEncryption;
        private System.Windows.Forms.ComboBox comboThumbnail;
        private System.Windows.Forms.ComboBox comboUploadUrl;
        private System.Windows.Forms.ComboBox comboRegion;
        private void InitializeComponent() {
          this.listStatus = new System.Windows.Forms.ListBox();
          this.comboGender = new System.Windows.Forms.ComboBox();
          this.comboStatus = new System.Windows.Forms.ComboBox();
          this.comboEncryption = new System.Windows.Forms.ComboBox();
          this.comboThumbnail = new System.Windows.Forms.ComboBox();
          this.comboUploadUrl = new System.Windows.Forms.ComboBox();
          this.comboRegion = new System.Windows.Forms.ComboBox();
          this.listStatus.Location = new System.Drawing.Point(8, 8);
          this.listStatus.Size = new System.Drawing.Size(120, 90);
          this.comboGender.Location = new System.Drawing.Point(136, 8);
          this.comboGender.Size = new System.Drawing.Size(120, 21);
          this.comboStatus.Location = new System.Drawing.Point(136, 37);
          this.comboStatus.Size = new System.Drawing.Size(120, 21);
          this.comboEncryption.Location = new System.Drawing.Point(136, 66);
          this.comboEncryption.Size = new System.Drawing.Size(120, 21);
          this.comboThumbnail.Location = new System.Drawing.Point(136, 95);
          this.comboThumbnail.Size = new System.Drawing.Size(120, 21);
          this.comboUploadUrl.Location = new System.Drawing.Point(8, 103);
          this.comboUploadUrl.Size = new System.Drawing.Size(120, 21);
          this.comboRegion.Location = new System.Drawing.Point(136, 124);
          this.comboRegion.Size = new System.Drawing.Size(120, 21);
          this.ClientSize = new System.Drawing.Size(270, 155);
          this.Controls.Add(this.listStatus);
          this.Controls.Add(this.comboGender);
          this.Controls.Add(this.comboStatus);
          this.Controls.Add(this.comboEncryption);
          this.Controls.Add(this.comboThumbnail);
          this.Controls.Add(this.comboUploadUrl);
          this.Controls.Add(this.comboRegion);
        }
      }`, "utf8");
      await writeFile(join(source, "ContactForm.cs"), `using System.Collections.Generic;
        partial class ContactForm : System.Windows.Forms.Form {
          private List<ContactStatus> _statuses = new();
          void FillLists() {
            listStatus.Items.AddList(_statuses, value => value.GetDescription());
            comboGender.Items.AddEnums<ContactGender>();
            comboStatus.Items.AddRange(Helpers.GetEnumDescriptions<ContactStatus>());
            comboEncryption.Items.AddRange(Enum.GetNames(typeof(EncryptionMode)));
            comboThumbnail.Items.AddRange(Helpers.GetLocalizedEnumDescriptions<ThumbnailType>());
            comboUploadUrl.Items.AddRange(ServiceCatalog.UploadUrls);
            comboRegion.Items.AddRange(ServiceCatalog.Regions.ToArray());
          }
        }`, "utf8");
      await writeFile(join(domain, "BusinessEnums.cs"), `using System.ComponentModel;
        public enum ContactStatus {
          Current,
          [Description("Former contact")] Former,
          Archived,
        }
        public enum ContactGender { Female, Male, Unknown, Other }
        public enum EncryptionMode { None, [Description("Explicit encryption")] Explicit, Implicit }
        public enum ThumbnailType { Small_Square, Large_Thumbnail }
        public static class ServiceCatalog {
          public static string[] UploadUrls = new string[] { "https://one.example/", "https://two.example/" };
          public static List<ServiceRegion> Regions { get; } = new List<ServiceRegion> {
            new ServiceRegion("North China", "cn-north"),
            new ServiceRegion("West Europe", "eu-west"),
          };
        }
        public class ServiceRegion {
          public string Code { get; set; }
          public string Label { get; set; }
          public ServiceRegion(string label, string code) { Label = label; Code = code; }
          public override string ToString() { return Label; }
        }
      `, "utf8");
      await writeFile(join(root, "Resources.resx"), `<?xml version="1.0" encoding="utf-8"?>
        <root>
          <data name="ThumbnailType_Small_Square" xml:space="preserve"><value>Small square</value></data>
          <data name="ThumbnailType_Large_Thumbnail" xml:space="preserve"><value>Large &amp; detailed</value></data>
        </root>`, "utf8");

      const project = await buildProjectIR(designer, { contextRoot: root });
      const status = project.pages[0].controls.find((control) => control.name === "listStatus");
      const gender = project.pages[0].controls.find((control) => control.name === "comboGender");
      const helperStatus = project.pages[0].controls.find((control) => control.name === "comboStatus");
      const encryption = project.pages[0].controls.find((control) => control.name === "comboEncryption");
      const thumbnail = project.pages[0].controls.find((control) => control.name === "comboThumbnail");
      const uploadUrl = project.pages[0].controls.find((control) => control.name === "comboUploadUrl");
      const region = project.pages[0].controls.find((control) => control.name === "comboRegion");
      expect(status?.itemSources).toEqual([
        expect.objectContaining({ kind: "list", typeName: "ContactStatus", expression: "Items.AddList(_statuses)" }),
      ]);
      expect(status?.items).toEqual(["Current", "Former contact", "Archived"]);
      expect(gender?.itemSources).toEqual([
        expect.objectContaining({ kind: "enum", typeName: "ContactGender", expression: "Items.AddEnums<ContactGender>()" }),
      ]);
      expect(gender?.items).toEqual(["Female", "Male", "Unknown", "Other"]);
      expect(helperStatus?.itemSources).toEqual([
        expect.objectContaining({
          kind: "enum",
          typeName: "ContactStatus",
          expression: "Items.AddRange(GetEnumDescriptions<ContactStatus>())",
        }),
      ]);
      expect(helperStatus?.items).toEqual(["Current", "Former contact", "Archived"]);
      expect(encryption?.itemSources).toEqual([
        expect.objectContaining({
          kind: "enum",
          typeName: "EncryptionMode",
          expression: "Items.AddRange(Enum.GetNames(typeof(EncryptionMode)))",
        }),
      ]);
      expect(encryption?.items).toEqual(["None", "Explicit", "Implicit"]);
      expect(thumbnail?.itemSources).toEqual([
        expect.objectContaining({
          kind: "enum",
          typeName: "ThumbnailType",
          expression: "Items.AddRange(GetLocalizedEnumDescriptions<ThumbnailType>())",
        }),
      ]);
      expect(thumbnail?.items).toEqual(["Small square", "Large & detailed"]);
      expect(uploadUrl?.itemSources).toEqual([
        expect.objectContaining({ kind: "list", expression: "Items.AddRange(ServiceCatalog.UploadUrls)" }),
      ]);
      expect(uploadUrl?.items).toEqual(["https://one.example/", "https://two.example/"]);
      expect(region?.itemSources).toEqual([
        expect.objectContaining({ kind: "list", expression: "Items.AddRange(ServiceCatalog.Regions.ToArray())" }),
      ]);
      expect(region?.items).toEqual(["North China", "West Europe"]);

      await Promise.all([
        generateRefineProject({ outDir: refineOut, project }),
        generateNocoBasePlugin({ outDir: nocobaseOut, project }),
      ]);
      const refineIr = JSON.parse(await readFile(join(refineOut, "src", "generated", "project.ir.json"), "utf8"));
      const nocobaseIr = JSON.parse(await readFile(join(nocobaseOut, "src", "client-v2", "generated", "project.ir.json"), "utf8"));
      const refineProfiles = await readFile(join(refineOut, "src", "runtime", "visualProfiles.tsx"), "utf8");
      const refineStyles = await readFile(join(refineOut, "src", "styles.css"), "utf8");
      expect(refineIr.pages[0].controls).toEqual(nocobaseIr.pages[0].controls);
      expect(refineIr.pages[0].controls.find((control: { name: string }) => control.name === "listStatus").items)
        .toEqual(["Current", "Former contact", "Archived"]);
      expect(refineProfiles).not.toContain("OpenDental");
      expect(refineProfiles).not.toContain("gitextensions-workspace");
      expect(refineStyles).not.toContain(".native-od-form");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
