import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectIR } from "../src/ir/projectIr.js";

describe("runtime initialization values", () => {
  it("applies proven configuration defaults through constructor and Shown call graphs", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-runtime-values-"));
    try {
      await mkdir(join(root, "ui"));
      await mkdir(join(root, "model"));
      const designer = join(root, "ui", "SettingsForm.Designer.cs");
      await writeFile(designer, `partial class SettingsForm {
        private System.Windows.Forms.TextBox txtEndpoint;
        private System.Windows.Forms.TextBox txtRegion;
        private System.Windows.Forms.TextBox txtPatient;
        private System.Windows.Forms.CheckBox cbEnabled;
        private System.Windows.Forms.CheckBox cbAmbiguous;
        private System.Windows.Forms.CheckBox cbConditional;
        private System.Windows.Forms.ComboBox cbMode;
        private System.Windows.Forms.ComboBox cbLiteral;
        private void InitializeComponent() {
          this.txtEndpoint = new System.Windows.Forms.TextBox();
          this.txtRegion = new System.Windows.Forms.TextBox();
          this.txtPatient = new System.Windows.Forms.TextBox();
          this.cbEnabled = new System.Windows.Forms.CheckBox();
          this.cbAmbiguous = new System.Windows.Forms.CheckBox();
          this.cbConditional = new System.Windows.Forms.CheckBox();
          this.cbMode = new System.Windows.Forms.ComboBox();
          this.cbLiteral = new System.Windows.Forms.ComboBox();
          this.txtEndpoint.Location = new System.Drawing.Point(8, 8);
          this.txtRegion.Location = new System.Drawing.Point(8, 36);
          this.txtPatient.Location = new System.Drawing.Point(8, 64);
          this.cbEnabled.Location = new System.Drawing.Point(8, 92);
          this.cbAmbiguous.Location = new System.Drawing.Point(8, 120);
          this.cbConditional.Location = new System.Drawing.Point(130, 120);
          this.cbMode.Location = new System.Drawing.Point(8, 148);
          this.cbLiteral.Location = new System.Drawing.Point(8, 176);
          this.cbLiteral.Items.AddRange(new object[] { "Zero", "One" });
          this.ClientSize = new System.Drawing.Size(260, 210);
          this.Controls.Add(this.txtEndpoint);
          this.Controls.Add(this.txtRegion);
          this.Controls.Add(this.txtPatient);
          this.Controls.Add(this.cbEnabled);
          this.Controls.Add(this.cbAmbiguous);
          this.Controls.Add(this.cbConditional);
          this.Controls.Add(this.cbMode);
          this.Controls.Add(this.cbLiteral);
          Shown += SettingsForm_Shown;
        }
      }`, "utf8");
      await writeFile(join(root, "ui", "SettingsForm.cs"), `partial class SettingsForm : System.Windows.Forms.Form {
        public PreviewConfig Config { get; private set; }
        public Patient Patient;
        public SettingsForm(PreviewConfig config) {
          Config = config;
          InitializeComponent();
          InitializeView();
        }
        private void InitializeView() {
          cbMode.Items.AddEnums<PreviewMode>();
          txtEndpoint.SetWatermark(Resources.EndpointHint, true);
          txtEndpoint.Text = Config.Endpoint;
          cbEnabled.Checked = !Config.Disabled;
          cbMode.SelectedIndex = (int)Config.Mode;
          cbLiteral.SelectedIndex = 1;
          txtPatient.Text = Patient.Name;
          cbAmbiguous.Checked = Config.Enabled;
          cbAmbiguous.Checked = ComputeFlag();
          if (Config.Enabled) {
            cbConditional.Checked = true;
          }
        }
        private void SettingsForm_Shown(object sender, System.EventArgs e) {
          LoadNestedDefaults();
        }
        private void LoadNestedDefaults() {
          txtRegion.Text = Config.Network.Region;
        }
        private bool ComputeFlag() { return false; }
        private void cbEnabled_Click(object sender, System.EventArgs e) {
          cbEnabled.Checked = false;
        }
      }`, "utf8");
      await writeFile(join(root, "model", "PreviewConfig.cs"), `public enum PreviewMode { Basic, Advanced }
        public class PreviewConfig {
          public string Endpoint { get; set; } = "https://api.example/";
          public bool Disabled { get; set; } = false;
          public bool Enabled { get; set; } = true;
          public PreviewMode Mode { get; set; } = PreviewMode.Advanced;
          public NetworkSettings Network { get; set; } = new NetworkSettings();
        }
        public class NetworkSettings {
          public string Region { get; set; } = "East Asia";
        }
        public class Patient {
          public string Name { get; set; } = "Invented patient";
        }
      `, "utf8");
      await writeFile(join(root, "model", "Resources.resx"), `<?xml version="1.0" encoding="utf-8"?>
        <root><data name="EndpointHint" xml:space="preserve"><value>Enter service endpoint</value></data></root>
      `, "utf8");

      const project = await buildProjectIR(designer, { contextRoot: root });
      const controls = new Map(project.pages[0].controls.map((control) => [control.name, control]));
      expect(controls.get("txtEndpoint")?.text).toBe("https://api.example/");
      expect(controls.get("txtEndpoint")?.appearance.placeholderText).toBe("Enter service endpoint");
      expect(controls.get("txtRegion")?.text).toBe("East Asia");
      expect(controls.get("cbEnabled")?.appearance.checked).toBe(true);
      expect(controls.get("cbMode")?.items).toEqual(["Basic", "Advanced"]);
      expect(controls.get("cbMode")?.appearance.selectedIndex).toBe(1);
      expect(controls.get("cbLiteral")?.appearance.selectedIndex).toBe(1);

      // Ordinary entity instances are contracts, not preview records.
      expect(controls.get("txtPatient")?.text).toBeUndefined();
      expect(controls.get("txtPatient")?.runtimeValueSources?.[0]).toEqual(
        expect.objectContaining({ modelType: "Patient", memberPath: ["Name"] }),
      );
      // A competing unresolved assignment makes the initial branch ambiguous.
      expect(controls.get("cbAmbiguous")?.appearance.checked).toBeUndefined();
      expect(controls.get("cbConditional")?.appearance.checked).toBeUndefined();
      expect(controls.get("cbConditional")?.runtimeValueSources?.[0].conditional).toBe(true);
      // Event-only mutations are not treated as initialization defaults.
      expect(controls.get("cbEnabled")?.runtimeValueSources).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
