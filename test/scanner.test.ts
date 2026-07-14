import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectIR } from "../src/ir/projectIr.js";
import { convertDesignerSources } from "../src/parser/scanner.js";

const FIRST_FORM = `
partial class FirstForm
{
    private System.Windows.Forms.Button button1;

    private void InitializeComponent()
    {
        this.button1 = new System.Windows.Forms.Button();
        this.button1.Text = "Save";
        this.ClientSize = new System.Drawing.Size(120, 80);
        this.Text = "First";
        this.Controls.Add(this.button1);
    }
}
`;

const SECOND_FORM = `
partial class SecondForm
{
    private CustomWidget customWidget1;

    private void InitializeComponent()
    {
        this.customWidget1 = new CustomWidget();
        this.ClientSize = new System.Drawing.Size(120, 80);
        this.Text = "Second";
        this.Controls.Add(this.customWidget1);
    }
}
`;

describe("convertDesignerSources", () => {
  it("retains the form base type when converting a single Designer file", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-single-inherit-"));
    try {
      const designer = join(root, "FirstForm.Designer.cs");
      await writeFile(designer, FIRST_FORM, "utf8");
      await writeFile(join(root, "FirstForm.cs"), "partial class FirstForm : ProductFormBase { }", "utf8");

      const project = await buildProjectIR(designer);

      expect(project.pages[0].baseType).toBe("ProductFormBase");
      expect(project.pages[0].baseTypes).toEqual(["ProductFormBase"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("merges per-form report summaries across Designer files", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-scan-"));
    const nested = join(root, "nested");

    try {
      await mkdir(nested);
      await writeFile(join(root, "FirstForm.Designer.cs"), FIRST_FORM, "utf8");
      await writeFile(join(nested, "SecondForm.Designer.cs"), SECOND_FORM, "utf8");

      const result = await convertDesignerSources(root);

      expect(result.report.forms.map((form) => ({
        name: form.name,
        title: form.title,
        sourcePath: form.sourcePath.replace(root, "<root>"),
        unknownControls: form.support.unknownControls
      }))).toEqual([
        {
          name: "FirstForm",
          title: "First",
          sourcePath: "<root>/FirstForm.Designer.cs",
          unknownControls: []
        },
        {
          name: "SecondForm",
          title: "Second",
          sourcePath: "<root>/nested/SecondForm.Designer.cs",
          unknownControls: ["CustomWidget"]
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves custom controls via inheritance, generic base, and name heuristic", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-inherit-"));
    try {
      await writeFile(join(root, "CustomControls.cs"), `
public partial class MyListView : ListView {}
public sealed partial class FancyButton : Button {}
internal sealed class BlackStyleProgressBar : Control {}
public class GenericHost<T> : UserControl where T : Control {}
public class MyGridHost : GenericHost<DataGridView> {}
public sealed partial class DerivedDeep : FancyButton {}
internal sealed class LabelledMeter : Control {}
`, "utf8");

      await writeFile(join(root, "Form1.Designer.cs"), `
partial class Form1
{
    private MyListView lv1;
    private FancyButton btn1;
    private BlackStyleProgressBar prog1;
    private MyGridHost grid1;
    private DerivedDeep dd1;
    private LabelledMeter meter1;

    private void InitializeComponent()
    {
        this.lv1 = new MyListView();
        this.btn1 = new FancyButton();
        this.prog1 = new BlackStyleProgressBar();
        this.grid1 = new MyGridHost();
        this.dd1 = new DerivedDeep();
        this.meter1 = new LabelledMeter();
        this.lv1.Location = new System.Drawing.Point(8, 8);
        this.lv1.Size = new System.Drawing.Size(100, 80);
        this.btn1.Location = new System.Drawing.Point(8, 100);
        this.btn1.Size = new System.Drawing.Size(75, 23);
        this.btn1.Text = "Hi";
        this.prog1.Location = new System.Drawing.Point(8, 130);
        this.prog1.Size = new System.Drawing.Size(100, 20);
        this.grid1.Location = new System.Drawing.Point(120, 8);
        this.grid1.Size = new System.Drawing.Size(200, 80);
        this.dd1.Location = new System.Drawing.Point(120, 100);
        this.dd1.Size = new System.Drawing.Size(75, 23);
        this.meter1.Location = new System.Drawing.Point(120, 130);
        this.meter1.Size = new System.Drawing.Size(75, 20);
        this.ClientSize = new System.Drawing.Size(340, 160);
        this.Controls.Add(this.meter1);
        this.Controls.Add(this.dd1);
        this.Controls.Add(this.grid1);
        this.Controls.Add(this.prog1);
        this.Controls.Add(this.btn1);
        this.Controls.Add(this.lv1);
        this.Text = "Inherit";
    }
}`, "utf8");

      const result = await convertDesignerSources(root);

      const lv = result.forms[0].controls.find((c) => c.name === "lv1");
      expect(lv?.kind).toBe("ListView");

      const btn = result.forms[0].controls.find((c) => c.name === "btn1");
      expect(btn?.kind).toBe("Button");

      const prog = result.forms[0].controls.find((c) => c.name === "prog1");
      expect(prog?.kind).toBe("ProgressBar");
      expect(prog?.properties.originalKind).toBe("BlackStyleProgressBar");

      // "LabelledMeter" contains "Label" as an interior substring but must NOT be
      // misclassified as Label (name heuristic is suffix-only, not any-substring).
      const meter = result.forms[0].controls.find((c) => c.name === "meter1");
      expect(meter?.kind).not.toBe("Label");

      const grid = result.forms[0].controls.find((c) => c.name === "grid1");
      expect(grid?.kind).toBe("DataGridView");

      const dd = result.forms[0].controls.find((c) => c.name === "dd1");
      expect(dd?.kind).toBe("Button");

      expect(result.report.unknownControls).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("attaches code-behind migration hints, navigations and bindings to the form", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-cb-"));
    try {
      await writeFile(join(root, "OrderForm.Designer.cs"), `
partial class OrderForm
{
    private System.Windows.Forms.Button btnSave;
    private System.Windows.Forms.Button btnDetail;

    private void InitializeComponent()
    {
        this.btnSave = new System.Windows.Forms.Button();
        this.btnDetail = new System.Windows.Forms.Button();
        this.btnSave.Text = "Save";
        this.btnSave.Click += new System.EventHandler(this.btnSave_Click);
        this.btnDetail.Click += new System.EventHandler(this.btnDetail_Click);
        this.ClientSize = new System.Drawing.Size(200, 120);
        this.Text = "Order";
        this.Controls.Add(this.btnSave);
        this.Controls.Add(this.btnDetail);
    }
}`, "utf8");
      await writeFile(join(root, "OrderForm.cs"), `
using System;
using System.Windows.Forms;
public partial class OrderForm : Form {
    public OrderForm() { InitializeComponent(); }
    private void btnSave_Click(object sender, EventArgs e) {
        SaveOrder();
        MessageBox.Show("ok");
    }
    private void btnDetail_Click(object sender, EventArgs e) {
        var f = new DetailForm();
        f.ShowDialog();
    }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const form = result.forms[0];

      const save = form.controls.find((c) => c.name === "btnSave");
      const hint = save?.events.find((e) => e.event === "Click")?.migrationHint;
      expect(hint?.handler).toBe("btnSave_Click");
      expect(hint?.sourceFile).toBe("OrderForm.cs");
      expect(hint?.calledSymbols).toContain("SaveOrder");

      expect(form.support.contractPoints.map((c) => c.controlName).sort()).toEqual(["btnDetail", "btnSave"]);

      expect(form.navigations).toEqual([
        { target: "DetailForm", modal: true, fromHandler: "btnDetail_Click" }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("achieves 100% event coverage across messy real-world wiring patterns", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-cover-"));
    try {
      await writeFile(join(root, "Msgy.Designer.cs"), `
partial class Msgy
{
    private System.Windows.Forms.MenuStrip menuStrip;
    private System.Windows.Forms.ToolStripMenuItem fileMenu;
    private System.Windows.Forms.ToolStripMenuItem miNew;
    private System.Windows.Forms.ContextMenuStrip ctxMenu;
    private System.Windows.Forms.ToolStripMenuItem ctxDelete;
    private System.Windows.Forms.ListBox list;
    private System.Windows.Forms.Button btnInline;

    private void InitializeComponent()
    {
        this.menuStrip = new System.Windows.Forms.MenuStrip();
        this.fileMenu = new System.Windows.Forms.ToolStripMenuItem();
        this.miNew = new System.Windows.Forms.ToolStripMenuItem();
        this.ctxMenu = new System.Windows.Forms.ContextMenuStrip();
        this.ctxDelete = new System.Windows.Forms.ToolStripMenuItem();
        this.list = new System.Windows.Forms.ListBox();
        this.btnInline = new System.Windows.Forms.Button();
        this.miNew.Click += new System.EventHandler(this.miNew_Click);
        this.ctxDelete.Click += new System.EventHandler(this.ctxDelete_Click);
        this.btnInline.Click += (sender, e) => DoInline();
        this.Load += new System.EventHandler(this.Msgy_Load);
        this.fileMenu.DropDownItems.Add(this.miNew);
        this.menuStrip.Items.Add(this.fileMenu);
        this.ctxMenu.Items.Add(this.ctxDelete);
        this.list.ContextMenuStrip = this.ctxMenu;
        this.ClientSize = new System.Drawing.Size(400, 300);
        this.Text = "Msgy";
        this.Controls.Add(this.list);
        this.Controls.Add(this.btnInline);
        this.Controls.Add(this.menuStrip);
    }
}`, "utf8");
      await writeFile(join(root, "Msgy.cs"), `
using System;
using System.Windows.Forms;
public partial class Msgy : Form {
    private void miNew_Click(object sender, EventArgs e) { NewItem(); }
    private void ctxDelete_Click(object sender, EventArgs e) { DeleteItem(); }
    private void Msgy_Load(object sender, EventArgs e) { Init(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const cp = result.forms[0].support.contractPoints;
      const keys = cp.map((c) => `${c.controlName}.${c.event}`).sort();

      // Every wired event must be present: single-.Add menu item, ContextMenu item,
      // lambda button, and form-level Load — none may be silently dropped.
      expect(keys).toEqual([
        "Msgy.Load",
        "btnInline.Click",
        "ctxDelete.Click",
        "miNew.Click",
      ]);

      // Lambda event has no code-behind method but is still recorded.
      const inline = cp.find((c) => c.controlName === "btnInline");
      expect(inline?.handler).toContain("inline");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("parents controls added via Controls.AddRange so nested events are covered", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-range-"));
    try {
      await writeFile(join(root, "Tabby.Designer.cs"), `
partial class Tabby
{
    private System.Windows.Forms.TabControl tabs;
    private System.Windows.Forms.TabPage tabA;
    private System.Windows.Forms.TabPage tabB;
    private System.Windows.Forms.Button btnA;
    private System.Windows.Forms.CheckBox chkB;

    private void InitializeComponent()
    {
        this.tabs = new System.Windows.Forms.TabControl();
        this.tabA = new System.Windows.Forms.TabPage();
        this.tabB = new System.Windows.Forms.TabPage();
        this.btnA = new System.Windows.Forms.Button();
        this.chkB = new System.Windows.Forms.CheckBox();
        this.tabs.Location = new System.Drawing.Point(10, 10);
        this.tabs.Size = new System.Drawing.Size(400, 300);
        this.tabs.Controls.AddRange(new System.Windows.Forms.Control[] { this.tabA, this.tabB });
        this.btnA.Click += new System.EventHandler(this.btnA_Click);
        this.chkB.CheckedChanged += new System.EventHandler(this.chkB_CheckedChanged);
        this.tabA.Controls.Add(this.btnA);
        this.tabB.Controls.Add(this.chkB);
        this.ClientSize = new System.Drawing.Size(420, 320);
        this.Text = "Tabby";
        this.Controls.Add(this.tabs);
    }
}`, "utf8");
      await writeFile(join(root, "Tabby.cs"), `
using System;
using System.Windows.Forms;
public partial class Tabby : Form {
    private void btnA_Click(object sender, EventArgs e) { A(); }
    private void chkB_CheckedChanged(object sender, EventArgs e) { B(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const form = result.forms[0];

      // AddRange-parented tab pages must nest under the TabControl.
      const tabs = form.controls.find((c) => c.name === "tabs");
      expect(tabs?.children.map((c) => c.name).sort()).toEqual(["tabA", "tabB"]);

      // Events on controls inside AddRange-added pages must reach contract points.
      const keys = form.support.contractPoints.map((c) => `${c.controlName}.${c.event}`).sort();
      expect(keys).toEqual(["btnA.Click", "chkB.CheckedChanged"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps only tab-navigator bindings whose controls exist in the form", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-tab-nav-"));
    try {
      await writeFile(join(root, "Settings.Designer.cs"), `partial class Settings {
        private Helpers.TabToTreeView settingsTree;
        private System.Windows.Forms.TabControl settingsTabs;
        private System.Windows.Forms.TabPage generalPage;
        private void InitializeComponent() {
          this.settingsTree = new Helpers.TabToTreeView();
          this.settingsTabs = new System.Windows.Forms.TabControl();
          this.generalPage = new System.Windows.Forms.TabPage();
          this.generalPage.Text = "General";
          this.settingsTabs.Controls.Add(this.generalPage);
          this.Controls.Add(this.settingsTabs);
          this.Controls.Add(this.settingsTree);
        }
      }`, "utf8");
      await writeFile(join(root, "Settings.cs"), `partial class Settings : System.Windows.Forms.Form {
        void ConfigureNavigation() {
          settingsTree.MainTabControl = settingsTabs;
          missingTree.MainTabControl = settingsTabs;
        }
      }`, "utf8");

      const result = await convertDesignerSources(root);
      expect(result.forms[0].runtimeTabNavigators).toEqual([expect.objectContaining({
        navigatorControlName: "settingsTree",
        property: "MainTabControl",
        tabControlName: "settingsTabs",
      })]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps direct control-state bindings only when their handler is wired", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-control-state-"));
    try {
      await writeFile(join(root, "Settings.Designer.cs"), `partial class Settings {
        private System.Windows.Forms.CheckBox includeDetails;
        private System.Windows.Forms.TextBox details;
        private System.Windows.Forms.TextBox notes;
        private void InitializeComponent() {
          this.includeDetails = new System.Windows.Forms.CheckBox();
          this.details = new System.Windows.Forms.TextBox();
          this.notes = new System.Windows.Forms.TextBox();
          this.includeDetails.CheckedChanged += includeDetails_CheckedChanged;
          this.Controls.Add(this.includeDetails);
          this.Controls.Add(this.details);
          this.Controls.Add(this.notes);
        }
      }`, "utf8");
      await writeFile(join(root, "Settings.cs"), `partial class Settings : System.Windows.Forms.Form {
        void includeDetails_CheckedChanged(object sender, System.EventArgs e) {
          details.Enabled = includeDetails.Checked;
          notes.ReadOnly = !includeDetails.Checked;
          missing.Enabled = includeDetails.Checked;
        }
        void NeverCalled() { details.Visible = includeDetails.Checked; }
      }`, "utf8");

      const result = await convertDesignerSources(root);
      expect(result.forms[0].runtimeControlBindings).toEqual([
        expect.objectContaining({
          triggerControlName: "includeDetails",
          triggerEvent: "CheckedChanged",
          handler: "includeDetails_CheckedChanged",
          sourceControlName: "includeDetails",
          targetControlName: "details",
          targetProperty: "enabled",
        }),
        expect.objectContaining({
          sourceControlName: "includeDetails",
          targetControlName: "notes",
          targetProperty: "readOnly",
          negated: true,
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("captures events wired with generic delegate types (EventHandler<T>)", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-generic-"));
    try {
      await writeFile(join(root, "Picker.Designer.cs"), `
partial class Picker
{
    private Custom.Controls.Pipette pipette;
    private System.Windows.Forms.Button btn;

    private void InitializeComponent()
    {
        this.pipette = new Custom.Controls.Pipette();
        this.btn = new System.Windows.Forms.Button();
        this.pipette.PipetteUsed += new System.EventHandler<Custom.Controls.PipetteUsedArgs>(this.PipetteUsed);
        this.btn.Click += new System.EventHandler(this.btn_Click);
        this.ClientSize = new System.Drawing.Size(200, 120);
        this.Text = "Picker";
        this.Controls.Add(this.pipette);
        this.Controls.Add(this.btn);
    }
}`, "utf8");
      await writeFile(join(root, "Picker.cs"), `
using System;
using System.Windows.Forms;
public partial class Picker : Form {
    private void PipetteUsed(object sender, Custom.Controls.PipetteUsedArgs e) { UseColor(); }
    private void btn_Click(object sender, EventArgs e) { Go(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const keys = result.forms[0].support.contractPoints.map((c) => `${c.controlName}.${c.event}`).sort();
      // The generic-delegate event on the custom control must not be dropped.
      expect(keys).toEqual(["btn.Click", "pipette.PipetteUsed"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("attributes non-visual component events to the component, not the form", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-comp-"));
    try {
      await writeFile(join(root, "Trayed.Designer.cs"), `
partial class Trayed
{
    private System.ComponentModel.IContainer components;
    private System.Windows.Forms.NotifyIcon niTray;
    private System.Windows.Forms.Timer timer1;
    private System.Windows.Forms.Button btn;

    private void InitializeComponent()
    {
        this.niTray = new System.Windows.Forms.NotifyIcon(this.components);
        this.timer1 = new System.Windows.Forms.Timer(this.components);
        this.btn = new System.Windows.Forms.Button();
        this.niTray.MouseUp += new System.Windows.Forms.MouseEventHandler(this.niTray_MouseUp);
        this.timer1.Tick += new System.EventHandler(this.timer1_Tick);
        this.btn.Click += new System.EventHandler(this.btn_Click);
        this.ClientSize = new System.Drawing.Size(200, 120);
        this.Text = "Trayed";
        this.Controls.Add(this.btn);
    }
}`, "utf8");
      await writeFile(join(root, "Trayed.cs"), `
using System;
using System.Windows.Forms;
public partial class Trayed : Form {
    private void niTray_MouseUp(object sender, MouseEventArgs e) { ShowMenu(); }
    private void timer1_Tick(object sender, EventArgs e) { Poll(); }
    private void btn_Click(object sender, EventArgs e) { Go(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const keys = result.forms[0].support.contractPoints.map((c) => `${c.controlName}.${c.event}`).sort();
      // Component events must attribute to niTray/timer1, NOT collapse onto the form.
      expect(keys).toEqual(["btn.Click", "niTray.MouseUp", "timer1.Tick"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not treat a ContextMenuStrip.Show(point) as form navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-ctxnav-"));
    try {
      await writeFile(join(root, "Menued.Designer.cs"), `
partial class Menued
{
    private System.ComponentModel.IContainer components;
    private System.Windows.Forms.ContextMenuStrip cmsActions;
    private System.Windows.Forms.Button btn;

    private void InitializeComponent()
    {
        this.cmsActions = new System.Windows.Forms.ContextMenuStrip(this.components);
        this.btn = new System.Windows.Forms.Button();
        this.btn.Click += new System.EventHandler(this.btn_Click);
        this.ClientSize = new System.Drawing.Size(200, 120);
        this.Text = "Menued";
        this.Controls.Add(this.btn);
    }
}`, "utf8");
      await writeFile(join(root, "Menued.cs"), `
using System;
using System.Windows.Forms;
public partial class Menued : Form {
    private void btn_Click(object sender, EventArgs e) {
        cmsActions.Show(Cursor.Position);
        var dlg = new EditForm();
        dlg.ShowDialog();
    }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const navTargets = (result.forms[0].navigations ?? []).map((n) => n.target);
      // cmsActions is a ContextMenuStrip popup, not navigation; only EditForm counts.
      expect(navTargets).not.toContain("cmsActions");
      expect(navTargets).toContain("EditForm");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("parses non-ASCII (CJK) control identifiers and covers their events", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-cjk-"));
    try {
      await writeFile(join(root, "Weird.Designer.cs"), `
partial class Weird
{
    private System.Windows.Forms.Button button_保存;
    private System.Windows.Forms.Label lbl123;

    private void InitializeComponent()
    {
        this.button_保存 = new System.Windows.Forms.Button();
        this.lbl123 = new System.Windows.Forms.Label();
        this.button_保存.Text = "保存";
        this.button_保存.Click += new System.EventHandler(this.button_保存_Click);
        this.lbl123.Text = "ラベル";
        this.ClientSize = new System.Drawing.Size(200, 120);
        this.Text = "変な";
        this.Controls.Add(this.button_保存);
        this.Controls.Add(this.lbl123);
    }
}`, "utf8");
      await writeFile(join(root, "Weird.cs"), `
using System;
using System.Windows.Forms;
public partial class Weird : Form {
    private void button_保存_Click(object sender, EventArgs e) { Save(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const form = result.forms[0];
      const names = form.controls.map((c) => c.name).sort();
      // The CJK-named control must be present (not silently dropped).
      expect(names).toContain("button_保存");
      // ...and its event contract must be covered.
      const keys = form.support.contractPoints.map((c) => `${c.controlName}.${c.event}`);
      expect(keys).toContain("button_保存.Click");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("covers events in multi-level nested submenus (DropDownItems within DropDownItems)", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-submenu-"));
    try {
      await writeFile(join(root, "MenuForm.Designer.cs"), `
partial class MenuForm
{
    private System.Windows.Forms.MenuStrip menuStrip;
    private System.Windows.Forms.ToolStripMenuItem fileMenu;
    private System.Windows.Forms.ToolStripMenuItem miRecent;
    private System.Windows.Forms.ToolStripMenuItem miRecent1;
    private System.Windows.Forms.ToolStripSeparator sep1;
    private System.Windows.Forms.ToolStripMenuItem miExit;

    private void InitializeComponent()
    {
        this.menuStrip = new System.Windows.Forms.MenuStrip();
        this.fileMenu = new System.Windows.Forms.ToolStripMenuItem();
        this.miRecent = new System.Windows.Forms.ToolStripMenuItem();
        this.miRecent1 = new System.Windows.Forms.ToolStripMenuItem();
        this.sep1 = new System.Windows.Forms.ToolStripSeparator();
        this.miExit = new System.Windows.Forms.ToolStripMenuItem();
        this.miRecent1.Click += new System.EventHandler(this.miRecent1_Click);
        this.miExit.Click += new System.EventHandler(this.miExit_Click);
        this.miRecent.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] { this.miRecent1 });
        this.fileMenu.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] { this.miRecent, this.sep1, this.miExit });
        this.menuStrip.Items.Add(this.fileMenu);
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Text = "MenuForm";
        this.Controls.Add(this.menuStrip);
    }
}`, "utf8");
      await writeFile(join(root, "MenuForm.cs"), `
using System;
using System.Windows.Forms;
public partial class MenuForm : Form {
    private void miRecent1_Click(object sender, EventArgs e) { Recent(); }
    private void miExit_Click(object sender, EventArgs e) { Close(); }
}`, "utf8");

      const result = await convertDesignerSources(root);
      const keys = result.forms[0].support.contractPoints.map((c) => `${c.controlName}.${c.event}`).sort();
      // The event on the 2nd-level submenu item (miRecent1) must be covered.
      expect(keys).toEqual(["miExit.Click", "miRecent1.Click"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("merges same-form partial code-behind files and applies runtime image keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-partials-"));
    try {
      await writeFile(join(root, "IconForm.Designer.cs"), `partial class IconForm {
        private System.Windows.Forms.Button btn;
        private void InitializeComponent() {
          this.btn = new System.Windows.Forms.Button();
          this.ClientSize = new System.Drawing.Size(200, 100);
          this.Controls.Add(this.btn);
        }
      }`, "utf8");
      await writeFile(join(root, "IconForm.cs"), "partial class IconForm { }", "utf8");
      await writeFile(join(root, "IconForm.InitIcons.cs"), `partial class IconForm {
        private void InitIcons() { this.btn.ImageKey = nameof(Images.Save); }
      }`, "utf8");

      const result = await convertDesignerSources(root);
      expect(result.forms[0].controls.find((control) => control.name === "btn")?.appearance.imageKey).toBe("Save");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves a concrete Designer image when code-behind assigns an image variable", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-image-fallback-"));
    try {
      await writeFile(join(root, "IconForm.Designer.cs"), `partial class IconForm {
        private System.Windows.Forms.Button btn;
        private void InitializeComponent() {
          this.btn = new System.Windows.Forms.Button();
          this.btn.Image = Properties.Images.Save;
          this.ClientSize = new System.Drawing.Size(200, 100);
          this.Controls.Add(this.btn);
        }
      }`, "utf8");
      await writeFile(join(root, "IconForm.cs"), `partial class IconForm {
        private void UpdateIcon() { this.btn.Image = image; }
      }`, "utf8");

      const result = await convertDesignerSources(root);
      expect(result.forms[0].controls.find((control) => control.name === "btn")?.appearance.image).toBe("Properties.Images.Save");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("degrades gracefully on malformed/truncated/empty designer files", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2react-bad-"));
    try {
      // Truncated: unbalanced braces, cut off mid-statement.
      await writeFile(join(root, "Truncated.Designer.cs"), `namespace App { partial class Truncated {
  private void InitializeComponent() {
    this.btn = new System.Windows.Forms.Button();
    this.btn.Click += new System.EventHandler(this.btn_Click);
    this.Controls.Add(this.btn`, "utf8");
      await writeFile(join(root, "Empty.Designer.cs"), "", "utf8");
      await writeFile(join(root, "Garbage.Designer.cs"), "not valid c# {{{ ]]] ;;;", "utf8");

      // Must not throw, and must still recover the parseable contract point.
      const result = await convertDesignerSources(root);
      const truncated = result.forms.find((f) => f.name === "Truncated");
      expect(truncated).toBeDefined();
      const keys = (truncated?.support.contractPoints ?? []).map((c) => `${c.controlName}.${c.event}`);
      expect(keys).toContain("btn.Click");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });});

describe("consolidated integration fixture", () => {
  // A checked-in multi-form project (test/fixtures/integration) exercising ALL
  // fixed features together: menu single-Add, ContextMenu items, non-visual
  // component (Timer) event attribution, form-level events, lambda events, CJK
  // identifiers, generic-delegate events, generic Binding, TLP spans, navigation,
  // and case-only-colliding form names. Guards against cross-feature regressions.
  it("covers every fixed feature together with 100% event coverage", async () => {
    const fixtureDir = join(__dirname, "fixtures", "integration");
    const result = await convertDesignerSources(fixtureDir);

    const allCp = result.forms.flatMap((f) =>
      f.support.contractPoints.map((c) => `${c.controlName}.${c.event}`)
    );
    // Every wired event across all forms must be present.
    for (const expected of [
      "miNew.Click",          // menu single-Add
      "miExit.Click",
      "ctxDelete.Click",      // ContextMenu item
      "pollTimer.Tick",       // non-visual Timer attributed to component (not form)
      "MainForm.Load",        // form-level event
      "button_保存.Click",     // lambda event on CJK-named control
      "pipette.PipetteUsed",  // generic-delegate event on custom control
      "btnLegacy.Click",      // case-only-colliding form
    ]) {
      expect(allCp).toContain(expected);
    }

    // Navigation captured (miNew opens EditorForm modally).
    const mainForm = result.forms.find((f) => f.name === "MainForm");
    expect((mainForm?.navigations ?? []).some((n) => n.target === "EditorForm")).toBe(true);
  });
});



