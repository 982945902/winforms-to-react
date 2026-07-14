import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectIR } from "../src/ir/projectIr.js";

describe("shared component constructor defaults", () => {
  it("materializes only source-proven constant constructor branches", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-component-init-"));
    try {
      await mkdir(join(root, "Properties"));
      await mkdir(join(root, "Other"));
      await writeFile(join(root, "StatePanel.cs"), `
        partial class StatePanel : System.Windows.Forms.UserControl {
          private PreviewState status;
          public PreviewState Status {
            get { return status; }
            set { status = value; UpdateView(); }
          }
          public bool Connected { get; private set; }
          public StatePanel() {
            InitializeComponent();
            txtCode.HandleCreated += (sender, e) => txtCode.SetWatermark(Resources.CodeHint, true);
            Status = PreviewState.Ready;
            UpdateConnection();
            ApplyUnknownRuntimeState();
          }
          private void UpdateView() {
            switch (Status) {
              case PreviewState.Ready:
                lblState.Text = Resources.ReadyLabel;
                lblState.ForeColor = System.Drawing.Color.FromArgb(20, 130, 40);
                break;
              case PreviewState.Busy:
                lblState.Text = "Busy";
                break;
            }
          }
          private void UpdateConnection() {
            if (Connected) {
              btnConnect.Text = "Disconnect";
            } else {
              btnConnect.Text = Resources.ConnectLabel;
              btnConnect.Enabled = true;
              lblAmbiguous.Text = Resources.AmbiguousLabel;
            }
          }
          private void ApplyUnknownRuntimeState() {
            if (RuntimeProbe()) {
              lblRuntime.Text = "Invented runtime value";
            }
          }
        }
        enum PreviewState { Ready, Busy }
      `, "utf8");
      await writeFile(join(root, "StatePanel.Designer.cs"), `
        partial class StatePanel {
          private System.Windows.Forms.Label lblState;
          private System.Windows.Forms.Label lblAmbiguous;
          private System.Windows.Forms.Label lblRuntime;
          private System.Windows.Forms.Button btnConnect;
          private System.Windows.Forms.TextBox txtCode;
          private void InitializeComponent() {
            this.lblState = new System.Windows.Forms.Label();
            this.lblAmbiguous = new System.Windows.Forms.Label();
            this.lblRuntime = new System.Windows.Forms.Label();
            this.btnConnect = new System.Windows.Forms.Button();
            this.txtCode = new System.Windows.Forms.TextBox();
            this.lblState.Location = new System.Drawing.Point(4, 4);
            this.lblState.Size = new System.Drawing.Size(100, 20);
            this.lblAmbiguous.Location = new System.Drawing.Point(4, 28);
            this.lblAmbiguous.Size = new System.Drawing.Size(100, 20);
            this.lblRuntime.Location = new System.Drawing.Point(4, 52);
            this.lblRuntime.Size = new System.Drawing.Size(100, 20);
            this.btnConnect.Location = new System.Drawing.Point(4, 76);
            this.btnConnect.Size = new System.Drawing.Size(100, 24);
            this.txtCode.Location = new System.Drawing.Point(4, 104);
            this.txtCode.Size = new System.Drawing.Size(100, 24);
            this.Controls.Add(this.lblState);
            this.Controls.Add(this.lblAmbiguous);
            this.Controls.Add(this.lblRuntime);
            this.Controls.Add(this.btnConnect);
            this.Controls.Add(this.txtCode);
          }
        }
      `, "utf8");
      await writeFile(join(root, "Properties", "Resources.resx"), `<?xml version="1.0" encoding="utf-8"?>
        <root>
          <data name="ReadyLabel" xml:space="preserve"><value>Ready from source</value></data>
          <data name="ConnectLabel" xml:space="preserve"><value>Connect now</value></data>
          <data name="CodeHint" xml:space="preserve"><value>Paste verification code</value></data>
          <data name="AmbiguousLabel" xml:space="preserve"><value>First value</value></data>
        </root>`, "utf8");
      await writeFile(join(root, "Other", "Resources.resx"), `<?xml version="1.0" encoding="utf-8"?>
        <root><data name="AmbiguousLabel" xml:space="preserve"><value>Conflicting value</value></data></root>`, "utf8");
      await writeFile(join(root, "HostForm.cs"), "partial class HostForm : System.Windows.Forms.Form { }", "utf8");
      await writeFile(join(root, "HostForm.Designer.cs"), `
        partial class HostForm {
          private StatePanel statePanel;
          private void InitializeComponent() {
            this.statePanel = new StatePanel();
            this.statePanel.Location = new System.Drawing.Point(0, 0);
            this.statePanel.Size = new System.Drawing.Size(120, 104);
            this.ClientSize = new System.Drawing.Size(120, 104);
            this.Controls.Add(this.statePanel);
          }
        }
      `, "utf8");

      const project = await buildProjectIR(join(root, "HostForm.Designer.cs"), { contextRoot: root });
      const component = project.components.find((candidate) => candidate.id === "StatePanel");
      const controls = new Map(component?.controls.map((control) => [control.name, control]));
      expect(component?.instanceCount).toBe(1);
      expect(controls.get("lblState")?.text).toBe("Ready from source");
      expect(controls.get("lblState")?.appearance.foreColor).toEqual({ cssColor: "rgb(20, 130, 40)" });
      expect(controls.get("btnConnect")?.text).toBe("Connect now");
      expect(controls.get("btnConnect")?.appearance.enabled).toBe(true);
      expect(controls.get("txtCode")?.appearance.placeholderText).toBe("Paste verification code");
      // Conflicting Resources keys and unknown runtime conditions are never
      // materialized as preview state.
      expect(controls.get("lblAmbiguous")?.text).toBeUndefined();
      expect(controls.get("lblRuntime")?.text).toBeUndefined();
      expect(component?.initializationDefaults).toEqual(expect.arrayContaining([
        expect.objectContaining({
          targetControlName: "lblState",
          targetProperty: "text",
          value: "Ready from source",
          condition: "Status == PreviewState.Ready",
        }),
        expect.objectContaining({
          targetControlName: "btnConnect",
          targetProperty: "text",
          value: "Connect now",
          condition: "!(Connected)",
        }),
        expect.objectContaining({
          targetControlName: "txtCode",
          targetProperty: "placeholderText",
          value: "Paste verification code",
        }),
      ]));
      expect(component?.initializationDefaults?.some((item) => item.targetControlName === "lblRuntime")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
