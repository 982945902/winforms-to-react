import { describe, expect, it } from "vitest";
import { parseDesignerSource } from "../src/parser/designerParser.js";

const SIMPLE_FORM = `
namespace Demo;

partial class OrderForm
{
    private System.Windows.Forms.GroupBox groupBox1;
    private System.Windows.Forms.Label labelCode;
    private System.Windows.Forms.TextBox txtCode;
    private System.Windows.Forms.Button btnSave;
    private System.Windows.Forms.DataGridView gridItems;
    private System.Windows.Forms.DataGridViewTextBoxColumn colName;

    private void InitializeComponent()
    {
        this.groupBox1 = new System.Windows.Forms.GroupBox();
        this.labelCode = new System.Windows.Forms.Label();
        this.txtCode = new System.Windows.Forms.TextBox();
        this.btnSave = new System.Windows.Forms.Button();
        this.gridItems = new System.Windows.Forms.DataGridView();
        this.colName = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.groupBox1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.gridItems)).BeginInit();
        this.SuspendLayout();
        //
        // groupBox1
        //
        this.groupBox1.Controls.Add(this.labelCode);
        this.groupBox1.Controls.Add(this.txtCode);
        this.groupBox1.Controls.Add(this.btnSave);
        this.groupBox1.Location = new System.Drawing.Point(12, 12);
        this.groupBox1.Name = "groupBox1";
        this.groupBox1.Size = new System.Drawing.Size(360, 82);
        this.groupBox1.TabIndex = 0;
        this.groupBox1.TabStop = false;
        this.groupBox1.Text = "Basic";
        //
        // labelCode
        //
        this.labelCode.AutoSize = true;
        this.labelCode.Location = new System.Drawing.Point(16, 26);
        this.labelCode.Name = "labelCode";
        this.labelCode.Size = new System.Drawing.Size(35, 13);
        this.labelCode.TabIndex = 0;
        this.labelCode.Text = "Code";
        //
        // txtCode
        //
        this.txtCode.Location = new System.Drawing.Point(64, 23);
        this.txtCode.Name = "txtCode";
        this.txtCode.Size = new System.Drawing.Size(170, 20);
        this.txtCode.TabIndex = 1;
        //
        // btnSave
        //
        this.btnSave.Location = new System.Drawing.Point(252, 21);
        this.btnSave.Name = "btnSave";
        this.btnSave.Size = new System.Drawing.Size(75, 23);
        this.btnSave.TabIndex = 2;
        this.btnSave.Text = "Save";
        this.btnSave.UseVisualStyleBackColor = true;
        this.btnSave.Click += btnSave_Click;
        //
        // gridItems
        //
        this.gridItems.AllowUserToAddRows = false;
        this.gridItems.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        this.gridItems.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colName});
        this.gridItems.Location = new System.Drawing.Point(12, 112);
        this.gridItems.Name = "gridItems";
        this.gridItems.Size = new System.Drawing.Size(360, 180);
        this.gridItems.TabIndex = 1;
        //
        // colName
        //
        this.colName.HeaderText = "Name";
        this.colName.Name = "colName";
        this.colName.Width = 120;
        //
        // OrderForm
        //
        this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.ClientSize = new System.Drawing.Size(384, 311);
        this.Controls.Add(this.gridItems);
        this.Controls.Add(this.groupBox1);
        this.Name = "OrderForm";
        this.Text = "Order Entry";
        this.groupBox1.ResumeLayout(false);
        this.groupBox1.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)(this.gridItems)).EndInit();
        this.ResumeLayout(false);
    }
}
`;

describe("parseDesignerSource", () => {
  it("extracts a form, control hierarchy, bounds, text, events, and grid columns", () => {
    const result = parseDesignerSource(SIMPLE_FORM, {
      sourcePath: "OrderForm.Designer.cs"
    });
    const serialized = JSON.stringify(result.form);

    expect(result.form.name).toBe("OrderForm");
    expect(result.form.sourcePath).toBe("OrderForm.Designer.cs");
    expect(result.form.text).toBe("Order Entry");
    expect(result.form.clientSize).toEqual({ width: 384, height: 311 });
    expect(result.form.controls.map((control) => control.name)).toEqual([
      "gridItems",
      "groupBox1"
    ]);

    const group = result.controlsByName.get("groupBox1");
    expect(group).toMatchObject({
      kind: "GroupBox",
      name: "groupBox1",
      text: "Basic",
      bounds: { x: 12, y: 12, width: 360, height: 82 }
    });
    expect(group?.children.map((control) => control.name)).toEqual([
      "labelCode",
      "txtCode",
      "btnSave"
    ]);

    const button = result.controlsByName.get("btnSave");
    expect(button?.events).toEqual([{ event: "Click", handler: "btnSave_Click" }]);

    const grid = result.controlsByName.get("gridItems");
    expect(grid?.columns).toEqual([
      { name: "colName", headerText: "Name", width: 120, kind: "DataGridViewTextBoxColumn" }
    ]);

    expect(result.report.supportedControls).toContain("Button");
    expect(result.report.supportedControls).toContain("DataGridView");
    expect(result.report.unknownControls).toEqual([]);
    expect(result.report.controlCoverage).toEqual({
      total: 5,
      supported: 5,
      degraded: 0,
      unknown: 0,
      supportedPercent: 100,
      previewablePercent: 100,
      unknownPercent: 0,
      byKind: [
        { kind: "Button", count: 1, status: "supported" },
        { kind: "DataGridView", count: 1, status: "supported" },
        { kind: "GroupBox", count: 1, status: "supported" },
        { kind: "Label", count: 1, status: "supported" },
        { kind: "TextBox", count: 1, status: "supported" }
      ]
    });
    expect(result.form.support).toEqual({
      controlsConverted: 5,
      supportedControls: ["Button", "DataGridView", "GroupBox", "Label", "TextBox"],
      degradedControls: [],
      unknownControls: [],
      controlCoverage: result.report.controlCoverage,
      eventStubs: [{ controlName: "btnSave", event: "Click", handler: "btnSave_Click" }],
      contractPoints: []
    });
    expect(result.report.forms).toEqual([
      {
        name: "OrderForm",
        title: "Order Entry",
        sourcePath: "OrderForm.Designer.cs",
        support: result.form.support
      }
    ]);
    expect(serialized).not.toContain("typeName");
  });
});

const TOOLSTRIP_FORM = `
partial class MenuForm
{
    private System.Windows.Forms.MenuStrip menuStrip1;
    private System.Windows.Forms.ToolStripMenuItem fileToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem openToolStripMenuItem;
    private System.Windows.Forms.ToolStrip toolStrip1;
    private System.Windows.Forms.ToolStripButton saveToolStripButton;

    private void InitializeComponent()
    {
        this.menuStrip1 = new System.Windows.Forms.MenuStrip();
        this.fileToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.openToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.toolStrip1 = new System.Windows.Forms.ToolStrip();
        this.saveToolStripButton = new System.Windows.Forms.ToolStripButton();
        this.menuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.fileToolStripMenuItem});
        this.fileToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.openToolStripMenuItem});
        this.fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        this.fileToolStripMenuItem.Text = "File";
        this.openToolStripMenuItem.Name = "openToolStripMenuItem";
        this.openToolStripMenuItem.Text = "Open";
        this.openToolStripMenuItem.Click += this.openToolStripMenuItem_Click;
        this.toolStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.saveToolStripButton});
        this.saveToolStripButton.Name = "saveToolStripButton";
        this.saveToolStripButton.Text = "Save";
        this.ClientSize = new System.Drawing.Size(320, 240);
        this.Controls.Add(this.toolStrip1);
        this.Controls.Add(this.menuStrip1);
        this.Name = "MenuForm";
        this.Text = "Menu";
    }
}
`;

describe("parseDesignerSource tool strips", () => {
  it("extracts MenuStrip and ToolStrip item hierarchy", () => {
    const result = parseDesignerSource(TOOLSTRIP_FORM, {
      sourcePath: "MenuForm.Designer.cs"
    });

    const menu = result.controlsByName.get("menuStrip1");
    const file = result.controlsByName.get("fileToolStripMenuItem");
    const toolStrip = result.controlsByName.get("toolStrip1");

    expect(menu?.children.map((control) => control.name)).toEqual(["fileToolStripMenuItem"]);
    expect(file?.children.map((control) => control.name)).toEqual(["openToolStripMenuItem"]);
    expect(toolStrip?.children.map((control) => control.name)).toEqual(["saveToolStripButton"]);
    expect(result.report.unknownControls).toEqual([]);
    expect(result.report.eventStubs).toContainEqual({
      controlName: "openToolStripMenuItem",
      event: "Click",
      handler: "openToolStripMenuItem_Click"
    });
  });
});

const COMPONENT_CLASSIFICATION_FORM = `
partial class ComponentClassificationForm
{
    private System.Windows.Forms.BindingNavigator bindingNavigator1;
    private System.Windows.Forms.ContextMenuStrip contextMenuStrip1;
    private System.Windows.Forms.ToolStripContainer toolStripContainer1;
    private System.Windows.Forms.BindingSource bindingSource1;
    private System.Windows.Forms.PageSetupDialog pageSetupDialog1;
    private System.Windows.Forms.PrintPreviewControl printPreviewControl1;
    private System.Windows.Forms.ListViewItem listViewItem1;

    private void InitializeComponent()
    {
        this.bindingNavigator1 = new System.Windows.Forms.BindingNavigator();
        this.contextMenuStrip1 = new System.Windows.Forms.ContextMenuStrip();
        this.toolStripContainer1 = new System.Windows.Forms.ToolStripContainer();
        this.bindingSource1 = new System.Windows.Forms.BindingSource();
        this.pageSetupDialog1 = new System.Windows.Forms.PageSetupDialog();
        this.printPreviewControl1 = new System.Windows.Forms.PrintPreviewControl();
        this.listViewItem1 = new System.Windows.Forms.ListViewItem();
        this.bindingNavigator1.Location = new System.Drawing.Point(0, 0);
        this.bindingNavigator1.Name = "bindingNavigator1";
        this.bindingNavigator1.Size = new System.Drawing.Size(320, 25);
        this.contextMenuStrip1.Name = "contextMenuStrip1";
        this.contextMenuStrip1.Size = new System.Drawing.Size(140, 24);
        this.toolStripContainer1.Location = new System.Drawing.Point(8, 32);
        this.toolStripContainer1.Name = "toolStripContainer1";
        this.toolStripContainer1.Size = new System.Drawing.Size(300, 120);
        this.printPreviewControl1.Location = new System.Drawing.Point(8, 160);
        this.printPreviewControl1.Name = "printPreviewControl1";
        this.printPreviewControl1.Size = new System.Drawing.Size(300, 120);
        this.ClientSize = new System.Drawing.Size(340, 300);
        this.Controls.Add(this.printPreviewControl1);
        this.Controls.Add(this.toolStripContainer1);
        this.Controls.Add(this.bindingNavigator1);
    }
}
`;

describe("parseDesignerSource component classification", () => {
  it("keeps nonvisual components out of the visual tree and classifies common previewable controls", () => {
    const result = parseDesignerSource(COMPONENT_CLASSIFICATION_FORM, {
      sourcePath: "ComponentClassificationForm.Designer.cs"
    });

    expect(result.controlsByName.has("bindingSource1")).toBe(false);
    expect(result.controlsByName.has("pageSetupDialog1")).toBe(false);
    expect(result.controlsByName.has("listViewItem1")).toBe(false);
    expect(result.report.supportedControls).toEqual([
      "BindingNavigator",
      "ContextMenuStrip",
      "PrintPreviewControl",
      "ToolStripContainer"
    ]);
    expect(result.report.degradedControls).toEqual([]);
    expect(result.report.unknownControls).toEqual([]);
    expect(result.report.controlCoverage).toEqual({
      total: 4,
      supported: 4,
      degraded: 0,
      unknown: 0,
      supportedPercent: 100,
      previewablePercent: 100,
      unknownPercent: 0,
      byKind: [
        { kind: "BindingNavigator", count: 1, status: "supported" },
        { kind: "ContextMenuStrip", count: 1, status: "supported" },
        { kind: "PrintPreviewControl", count: 1, status: "supported" },
        { kind: "ToolStripContainer", count: 1, status: "supported" }
      ]
    });
  });
});

const LIST_ITEM_FORM = `
partial class ListItemForm
{
    private System.Windows.Forms.ComboBox comboBox1;
    private System.Windows.Forms.ListBox listBox1;
    private System.Windows.Forms.CheckedListBox checkedListBox1;
    private System.Windows.Forms.DomainUpDown domainUpDown1;
    private System.Windows.Forms.ListView listView1;
    private System.Windows.Forms.TreeView treeView1;

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ListItemForm));
        System.Windows.Forms.TreeNode treeNode1 = new System.Windows.Forms.TreeNode("Root");
        System.Windows.Forms.TreeNode treeNode2 = new System.Windows.Forms.TreeNode("Child");
        this.comboBox1 = new System.Windows.Forms.ComboBox();
        this.listBox1 = new System.Windows.Forms.ListBox();
        this.checkedListBox1 = new System.Windows.Forms.CheckedListBox();
        this.domainUpDown1 = new System.Windows.Forms.DomainUpDown();
        this.listView1 = new System.Windows.Forms.ListView();
        this.treeView1 = new System.Windows.Forms.TreeView();
        this.comboBox1.Items.AddRange(new object[] {
            "Open",
            "Closed"});
        this.listBox1.Items.AddRange(new object[] { "North", "South" });
        this.checkedListBox1.Items.AddRange(new object[] {
            "Approved",
            "Archived"});
        this.domainUpDown1.Items.Add("First");
        this.domainUpDown1.Items.Add("Second");
        this.listView1.Items.AddRange(new System.Windows.Forms.ListViewItem[] {
            ((System.Windows.Forms.ListViewItem)(resources.GetObject("listView1.Items")))});
        this.treeView1.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode1,
            treeNode2});
        this.comboBox1.Location = new System.Drawing.Point(8, 8);
        this.comboBox1.Size = new System.Drawing.Size(120, 23);
        this.listBox1.Location = new System.Drawing.Point(8, 40);
        this.listBox1.Size = new System.Drawing.Size(120, 60);
        this.checkedListBox1.Location = new System.Drawing.Point(136, 40);
        this.checkedListBox1.Size = new System.Drawing.Size(120, 60);
        this.domainUpDown1.Location = new System.Drawing.Point(8, 108);
        this.domainUpDown1.Size = new System.Drawing.Size(120, 23);
        this.listView1.Location = new System.Drawing.Point(136, 108);
        this.listView1.Size = new System.Drawing.Size(120, 120);
        this.treeView1.Location = new System.Drawing.Point(8, 140);
        this.treeView1.Size = new System.Drawing.Size(160, 120);
        this.ClientSize = new System.Drawing.Size(280, 280);
        this.Controls.Add(this.treeView1);
        this.Controls.Add(this.listView1);
        this.Controls.Add(this.domainUpDown1);
        this.Controls.Add(this.checkedListBox1);
        this.Controls.Add(this.listBox1);
        this.Controls.Add(this.comboBox1);
    }
}
`;

describe("parseDesignerSource list items", () => {
  it("extracts static items for list-like controls", () => {
    const result = parseDesignerSource(LIST_ITEM_FORM, {
      sourcePath: "ListItemForm.Designer.cs"
    });

    expect(result.controlsByName.get("comboBox1")?.items).toEqual(["Open", "Closed"]);
    expect(result.controlsByName.get("listBox1")?.items).toEqual(["North", "South"]);
    expect(result.controlsByName.get("checkedListBox1")?.items).toEqual(["Approved", "Archived"]);
    expect(result.controlsByName.get("domainUpDown1")?.items).toEqual(["First", "Second"]);
    expect(result.controlsByName.get("listView1")?.items).toBeUndefined();
    expect(result.controlsByName.get("treeView1")?.items).toEqual(["Root", "Child"]);
  });
});

const MODERN_DESIGNER_FORM = `
partial class ModernDesignerForm
{
    System.Windows.Forms.Button button1;
    System.Windows.Forms.Label label1;
    System.Windows.Forms.Panel panel1;

    private void InitializeComponent()
    {
        button1 = new();
        label1 = new System.Windows.Forms.Label();
        panel1 = new();
        button1.Location = new System.Drawing.Point(12, 16);
        button1.Size = new System.Drawing.Size(75, 23);
        button1.Text = "Save";
        label1.Location = new System.Drawing.Point(8, 8);
        label1.Size = new System.Drawing.Size(80, 16);
        label1.Text = "Customer";
        panel1.Location = new System.Drawing.Point(4, 44);
        panel1.Size = new System.Drawing.Size(140, 48);
        panel1.Controls.Add(label1);
        Controls.Add(button1);
        Controls.Add(panel1);
        ClientSize = new System.Drawing.Size(180, 120);
        Text = "Modern";
    }
}
`;

describe("parseDesignerSource modern Designer syntax", () => {
  it("extracts target-typed controls and unqualified control references", () => {
    const result = parseDesignerSource(MODERN_DESIGNER_FORM, {
      sourcePath: "ModernDesignerForm.Designer.cs"
    });

    expect(result.form.clientSize).toEqual({ width: 180, height: 120 });
    expect(result.form.text).toBe("Modern");
    expect(result.form.controls.map((control) => control.name)).toEqual(["button1", "panel1"]);
    expect(result.controlsByName.get("button1")).toMatchObject({
      kind: "Button",
      text: "Save",
      bounds: { x: 12, y: 16, width: 75, height: 23 }
    });
    expect(result.controlsByName.get("panel1")?.children.map((control) => control.name)).toEqual(["label1"]);
    expect(result.controlsByName.get("label1")).toMatchObject({
      kind: "Label",
      text: "Customer",
      bounds: { x: 8, y: 8, width: 80, height: 16 }
    });
  });
});

const COMMENT_FORM = `
partial class CommentForm
{
    private System.Windows.Forms.Button button1;
    // this.button1.Text = "CommentedOut";
    private System.Windows.Forms.Label label1;

    private void InitializeComponent()
    {
        this.button1 = new System.Windows.Forms.Button();
        this.label1 = new System.Windows.Forms.Label();
        /* this.label1.Text = "BlockCommented"; */
        this.button1.Text = "Save";
        this.label1.Text = "Real";
        // this.Controls.Add(this.button1);
        this.Controls.Add(this.label1);
        this.Controls.Add(this.button1);
        this.ClientSize = new System.Drawing.Size(200, 100);
        this.Text = "Comments";
    }
}
`;

describe("parseDesignerSource comment stripping", () => {
  it("ignores single-line and block comments so only live assignments apply", () => {
    const result = parseDesignerSource(COMMENT_FORM, {
      sourcePath: "CommentForm.Designer.cs"
    });

    expect(result.controlsByName.get("button1")?.text).toBe("Save");
    expect(result.controlsByName.get("label1")?.text).toBe("Real");
    expect(result.form.controls.map((control) => control.name)).toEqual([
      "label1",
      "button1"
    ]);
  });
});

const VISUAL_PROPERTIES_FORM = `
partial class VisualForm
{
    private System.Windows.Forms.Label label1;
    private System.Windows.Forms.Button button1;
    private System.Windows.Forms.TextBox textBox1;
    private System.Windows.Forms.Panel panel1;

    private void InitializeComponent()
    {
        this.label1 = new System.Windows.Forms.Label();
        this.button1 = new System.Windows.Forms.Button();
        this.textBox1 = new System.Windows.Forms.TextBox();
        this.panel1 = new System.Windows.Forms.Panel();
        this.label1.Font = new System.Drawing.Font("Segoe UI", 14F, System.Drawing.FontStyle.Bold | System.Drawing.FontStyle.Italic);
        this.label1.ForeColor = System.Drawing.Color.Red;
        this.label1.BackColor = System.Drawing.Color.FromArgb(200, 220, 240);
        this.label1.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
        this.label1.BorderStyle = System.Windows.Forms.BorderStyle.Fixed3D;
        this.label1.Enabled = false;
        this.label1.Visible = false;
        this.label1.Location = new System.Drawing.Point(8, 8);
        this.label1.Size = new System.Drawing.Size(120, 24);
        this.label1.Text = "Hello";
        this.button1.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
        this.button1.Location = new System.Drawing.Point(8, 40);
        this.button1.Size = new System.Drawing.Size(80, 28);
        this.button1.Text = "OK";
        this.textBox1.Location = new System.Drawing.Point(8, 76);
        this.textBox1.Size = new System.Drawing.Size(160, 20);
        this.panel1.Dock = System.Windows.Forms.DockStyle.Fill;
        this.panel1.Padding = new System.Windows.Forms.Padding(4, 8, 4, 8);
        this.panel1.Location = new System.Drawing.Point(0, 100);
        this.panel1.Size = new System.Drawing.Size(200, 60);
        this.panel1.Controls.Add(this.textBox1);
        this.ClientSize = new System.Drawing.Size(200, 160);
        this.Controls.Add(this.panel1);
        this.Controls.Add(this.button1);
        this.Controls.Add(this.label1);
        this.Text = "Visual";
    }
}
`;

describe("parseDesignerSource visual properties", () => {
  it("captures font, colors, alignment, border style, enabled/visible, flat style and padding", () => {
    const result = parseDesignerSource(VISUAL_PROPERTIES_FORM, {
      sourcePath: "VisualForm.Designer.cs"
    });

    const label = result.controlsByName.get("label1");
    expect(label?.appearance.font).toEqual({
      family: "Segoe UI",
      size: 14,
      bold: true,
      italic: true
    });
    expect(label?.appearance.foreColor).toEqual({ cssColor: "#ff0000", name: "Red" });
    expect(label?.appearance.backColor).toEqual({ cssColor: "rgb(200, 220, 240)" });
    expect(label?.appearance.textAlign).toEqual({ horizontal: "Center", vertical: "Middle" });
    expect(label?.appearance.borderStyle).toBe("Fixed3D");
    expect(label?.appearance.enabled).toBe(false);
    expect(label?.appearance.visible).toBe(false);

    const button = result.controlsByName.get("button1");
    expect(button?.appearance.flatStyle).toBe("Flat");

    const panel = result.controlsByName.get("panel1");
    expect(panel?.dock).toBe("Fill");
    expect(panel?.appearance.padding).toEqual({ left: 4, top: 8, right: 4, bottom: 8 });
  });
});

const LAYOUT_FORM = `
partial class LayoutForm
{
    private System.Windows.Forms.Panel anchorPanel;
    private System.Windows.Forms.TableLayoutPanel tlp1;
    private System.Windows.Forms.FlowLayoutPanel flp1;
    private System.Windows.Forms.SplitContainer split1;
    private System.Windows.Forms.ListView lv1;
    private System.Windows.Forms.ColumnHeader colHeader1;
    private System.Windows.Forms.MaskedTextBox masked1;
    private System.Windows.Forms.PictureBox pic1;
    private System.Windows.Forms.Button button1;
    private System.Windows.Forms.Button button2;

    private void InitializeComponent()
    {
        this.anchorPanel = new System.Windows.Forms.Panel();
        this.tlp1 = new System.Windows.Forms.TableLayoutPanel();
        this.flp1 = new System.Windows.Forms.FlowLayoutPanel();
        this.split1 = new System.Windows.Forms.SplitContainer();
        this.lv1 = new System.Windows.Forms.ListView();
        this.colHeader1 = new System.Windows.Forms.ColumnHeader();
        this.masked1 = new System.Windows.Forms.MaskedTextBox();
        this.pic1 = new System.Windows.Forms.PictureBox();
        this.button1 = new System.Windows.Forms.Button();
        this.button2 = new System.Windows.Forms.Button();
        this.tlp1.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
        this.tlp1.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
        this.tlp1.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 40F));
        this.tlp1.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
        this.tlp1.Controls.Add(this.button1, 0, 0);
        this.tlp1.Controls.Add(this.button2, 1, 1);
        this.anchorPanel.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top
            | System.Windows.Forms.AnchorStyles.Bottom)
            | System.Windows.Forms.AnchorStyles.Left)
            | System.Windows.Forms.AnchorStyles.Right)));
        this.anchorPanel.Location = new System.Drawing.Point(10, 10);
        this.anchorPanel.Size = new System.Drawing.Size(100, 80);
        this.flp1.FlowDirection = System.Windows.Forms.FlowDirection.TopDown;
        this.flp1.WrapContents = false;
        this.flp1.Controls.Add(this.button1);
        this.flp1.Location = new System.Drawing.Point(10, 100);
        this.flp1.Size = new System.Drawing.Size(120, 80);
        this.split1.Orientation = System.Windows.Forms.Orientation.Horizontal;
        this.split1.SplitterDistance = 60;
        this.split1.Panel1.Controls.Add(this.button1);
        this.split1.Panel2.Controls.Add(this.button2);
        this.split1.Location = new System.Drawing.Point(10, 190);
        this.split1.Size = new System.Drawing.Size(140, 100);
        this.lv1.View = System.Windows.Forms.View.Details;
        this.lv1.Columns.AddRange(new System.Windows.Forms.ColumnHeader[] { this.colHeader1 });
        this.lv1.Location = new System.Drawing.Point(160, 10);
        this.lv1.Size = new System.Drawing.Size(120, 80);
        this.colHeader1.Text = "Name";
        this.colHeader1.Width = 100;
        this.masked1.Mask = "00/00/0000";
        this.masked1.Location = new System.Drawing.Point(160, 100);
        this.masked1.Size = new System.Drawing.Size(100, 23);
        this.pic1.ImageLocation = "logo.png";
        this.pic1.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
        this.pic1.Location = new System.Drawing.Point(160, 130);
        this.pic1.Size = new System.Drawing.Size(80, 60);
        this.button1.Text = "A";
        this.button2.Text = "B";
        this.ClientSize = new System.Drawing.Size(300, 300);
        this.Controls.Add(this.pic1);
        this.Controls.Add(this.masked1);
        this.Controls.Add(this.lv1);
        this.Controls.Add(this.split1);
        this.Controls.Add(this.flp1);
        this.Controls.Add(this.tlp1);
        this.Controls.Add(this.anchorPanel);
        this.Text = "Layout";
    }
}
`;

describe("parseDesignerSource layout and advanced controls", () => {
  it("captures anchor, table layout, flow direction, split panels, listview columns, mask, image", () => {
    const result = parseDesignerSource(LAYOUT_FORM, {
      sourcePath: "LayoutForm.Designer.cs"
    });

    const anchor = result.controlsByName.get("anchorPanel");
    expect(anchor?.anchor).toEqual(["Top", "Bottom", "Left", "Right"]);

    const tlp = result.controlsByName.get("tlp1");
    expect(tlp?.tableLayout?.columns).toEqual([
      { type: "Percent", value: 50 },
      { type: "Percent", value: 50 }
    ]);
    expect(tlp?.tableLayout?.rows).toEqual([
      { type: "Absolute", value: 40 },
      { type: "Percent", value: 100 }
    ]);
    expect(tlp?.tableLayout?.cells).toEqual({ button1: [0, 0], button2: [1, 1] });

    const flp = result.controlsByName.get("flp1");
    expect(flp?.flowDirection).toBe("TopDown");
    expect(flp?.wrapContents).toBe(false);

    const split = result.controlsByName.get("split1");
    expect(split?.orientation).toBe("Horizontal");
    expect(split?.splitterDistance).toBe(60);
    expect(split?.panel1Children).toEqual(["button1"]);
    expect(split?.panel2Children).toEqual(["button2"]);

    const lv = result.controlsByName.get("lv1");
    expect(lv?.appearance?.view).toBe("Details");
    expect(lv?.columns).toEqual([{ name: "colHeader1", headerText: "Name", width: 100, kind: "ColumnHeader" }]);

    const masked = result.controlsByName.get("masked1");
    expect(masked?.appearance?.mask).toBe("00/00/0000");

    const pic = result.controlsByName.get("pic1");
    expect(pic?.appearance?.imageLocation).toBe("logo.png");
    expect(pic?.appearance?.sizeMode).toBe("Zoom");
  });
});

const STATE_FORM = `
partial class StateForm
{
    private System.Windows.Forms.CheckBox check1;
    private System.Windows.Forms.TextBox txt1;
    private System.Windows.Forms.ComboBox combo1;
    private System.Windows.Forms.TrackBar track1;
    private System.Windows.Forms.ProgressBar prog1;
    private System.Windows.Forms.NumericUpDown num1;
    private System.Windows.Forms.DateTimePicker dtp1;

    private void InitializeComponent()
    {
        this.check1 = new System.Windows.Forms.CheckBox();
        this.txt1 = new System.Windows.Forms.TextBox();
        this.combo1 = new System.Windows.Forms.ComboBox();
        this.track1 = new System.Windows.Forms.TrackBar();
        this.prog1 = new System.Windows.Forms.ProgressBar();
        this.num1 = new System.Windows.Forms.NumericUpDown();
        this.dtp1 = new System.Windows.Forms.DateTimePicker();
        this.check1.Checked = true;
        this.check1.ThreeState = true;
        this.txt1.Multiline = true;
        this.txt1.ReadOnly = true;
        this.txt1.MaxLength = 200;
        this.txt1.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
        this.combo1.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
        this.combo1.SelectedIndex = 1;
        this.track1.Value = 30;
        this.track1.Minimum = 0;
        this.track1.Maximum = 100;
        this.prog1.Value = 50;
        this.prog1.Minimum = 0;
        this.prog1.Maximum = 100;
        this.num1.Value = 5;
        this.num1.Minimum = 0;
        this.num1.Maximum = 100;
        this.dtp1.Format = System.Windows.Forms.DateTimePickerFormat.Short;
        this.dtp1.Value = System.DateTime.Now;
        this.check1.Text = "Agree";
        this.txt1.Text = "Content";
        this.combo1.Items.AddRange(new object[] { "A", "B", "C" });
        this.check1.Location = new System.Drawing.Point(8, 8);
        this.txt1.Location = new System.Drawing.Point(8, 32);
        this.txt1.Size = new System.Drawing.Size(120, 60);
        this.combo1.Location = new System.Drawing.Point(8, 100);
        this.track1.Location = new System.Drawing.Point(8, 130);
        this.prog1.Location = new System.Drawing.Point(8, 170);
        this.prog1.Size = new System.Drawing.Size(120, 20);
        this.num1.Location = new System.Drawing.Point(8, 196);
        this.dtp1.Location = new System.Drawing.Point(8, 222);
        this.ClientSize = new System.Drawing.Size(160, 260);
        this.Controls.Add(this.dtp1);
        this.Controls.Add(this.num1);
        this.Controls.Add(this.prog1);
        this.Controls.Add(this.track1);
        this.Controls.Add(this.combo1);
        this.Controls.Add(this.txt1);
        this.Controls.Add(this.check1);
        this.Text = "State";
    }
}
`;

describe("parseDesignerSource control state properties", () => {
  it("captures checked, readonly, multiline, dropdown style, value/min/max, format", () => {
    const result = parseDesignerSource(STATE_FORM, {
      sourcePath: "StateForm.Designer.cs"
    });

    const check = result.controlsByName.get("check1");
    expect(check?.appearance?.checked).toBe(true);
    expect(check?.appearance?.threeState).toBe(true);

    const txt = result.controlsByName.get("txt1");
    expect(txt?.appearance?.multiline).toBe(true);
    expect(txt?.appearance?.readOnly).toBe(true);
    expect(txt?.appearance?.maxLength).toBe(200);
    expect(txt?.appearance?.scrollBars).toBe("Vertical");

    const combo = result.controlsByName.get("combo1");
    expect(combo?.appearance?.dropDownStyle).toBe("DropDownList");
    expect(combo?.appearance?.selectedIndex).toBe(1);
    expect(combo?.items).toEqual(["A", "B", "C"]);

    const track = result.controlsByName.get("track1");
    expect(track?.appearance?.value).toBe(30);
    expect(track?.appearance?.minimum).toBe(0);
    expect(track?.appearance?.maximum).toBe(100);

    const prog = result.controlsByName.get("prog1");
    expect(prog?.appearance?.value).toBe(50);
    expect(prog?.appearance?.maximum).toBe(100);

    const num = result.controlsByName.get("num1");
    expect(num?.appearance?.value).toBe(5);

    const dtp = result.controlsByName.get("dtp1");
    expect(dtp?.appearance?.format).toBe("Short");
  });
});

const FORM_PROPERTIES_SOURCE = `
partial class FormPropsForm
{
    private void InitializeComponent()
    {
        this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
        this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
        this.WindowState = System.Windows.Forms.FormWindowState.Maximized;
        this.Opacity = 0.8;
        this.AcceptButton = this.okButton;
        this.ClientSize = new System.Drawing.Size(200, 100);
        this.Text = "Props";
    }
    private System.Windows.Forms.Button okButton;
}
`;

describe("parseDesignerSource form-level properties", () => {
  it("captures border style, start position, window state, opacity, accept button", () => {
    const result = parseDesignerSource(FORM_PROPERTIES_SOURCE, {
      sourcePath: "FormPropsForm.Designer.cs"
    });

    expect(result.form.formBorderStyle).toBe("FixedSingle");
    expect(result.form.startPosition).toBe("CenterParent");
    expect(result.form.windowState).toBe("Maximized");
    expect(result.form.opacity).toBe(0.8);
    expect(result.form.acceptButton).toBe("okButton");
  });
});

const GRID_NESTED_SOURCE = `
partial class GridNestedForm
{
    private System.Windows.Forms.DataGridView grid1;
    private System.Windows.Forms.DataGridViewTextBoxColumn col1;

    private void InitializeComponent()
    {
        this.grid1 = new System.Windows.Forms.DataGridView();
        this.col1 = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.grid1.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] { this.col1 });
        this.grid1.BackgroundColor = System.Drawing.Color.FromArgb(240, 240, 240);
        this.grid1.GridColor = System.Drawing.Color.DarkGray;
        this.grid1.DefaultCellStyle.SelectionBackColor = System.Drawing.Color.FromArgb(0, 120, 215);
        this.grid1.ColumnHeadersDefaultCellStyle.BackColor = System.Drawing.Color.FromArgb(230, 230, 230);
        this.grid1.AlternatingRowsDefaultCellStyle.BackColor = System.Drawing.Color.FromArgb(245, 245, 245);
        this.col1.HeaderText = "Name";
        this.col1.Width = 100;
        this.grid1.Location = new System.Drawing.Point(8, 8);
        this.grid1.Size = new System.Drawing.Size(200, 120);
        this.ClientSize = new System.Drawing.Size(220, 140);
        this.Controls.Add(this.grid1);
        this.Text = "Grid";
    }
}
`;

describe("parseDesignerSource DataGridView nested style properties", () => {
  it("captures background, grid color, selection and alternating row colors via nested assignment", () => {
    const result = parseDesignerSource(GRID_NESTED_SOURCE, {
      sourcePath: "GridNestedForm.Designer.cs"
    });

    const grid = result.controlsByName.get("grid1");
    expect((grid?.properties["BackgroundColor"] as { cssColor: string })?.cssColor).toBe("rgb(240, 240, 240)");
    expect((grid?.properties["GridColor"] as { cssColor: string })?.cssColor).toBe("#a9a9a9");
    expect((grid?.properties["DefaultCellStyle.SelectionBackColor"] as { cssColor: string })?.cssColor).toBe("rgb(0, 120, 215)");
    expect((grid?.properties["ColumnHeadersDefaultCellStyle.BackColor"] as { cssColor: string })?.cssColor).toBe("rgb(230, 230, 230)");
    expect((grid?.properties["AlternatingRowsDefaultCellStyle.BackColor"] as { cssColor: string })?.cssColor).toBe("rgb(245, 245, 245)");
    expect(grid?.columns).toEqual([{ name: "col1", headerText: "Name", width: 100, kind: "DataGridViewTextBoxColumn" }]);
  });

  it("captures TableLayoutPanel cell coordinates and SetColumnSpan/SetRowSpan", () => {
    const source = `namespace App { partial class TlpForm {
  private void InitializeComponent() {
    this.tlp = new System.Windows.Forms.TableLayoutPanel();
    this.lblHeader = new System.Windows.Forms.Label();
    this.txtA = new System.Windows.Forms.TextBox();
    this.btnWide = new System.Windows.Forms.Button();
    this.tlp.ColumnCount = 2;
    this.tlp.RowCount = 3;
    this.tlp.Controls.Add(this.lblHeader, 0, 0);
    this.tlp.SetColumnSpan(this.lblHeader, 2);
    this.tlp.Controls.Add(this.txtA, 0, 1);
    this.tlp.Controls.Add(this.btnWide, 0, 2);
    this.tlp.SetColumnSpan(this.btnWide, 2);
    this.Controls.Add(this.tlp);
  }
  private System.Windows.Forms.TableLayoutPanel tlp;
  private System.Windows.Forms.Label lblHeader;
  private System.Windows.Forms.TextBox txtA;
  private System.Windows.Forms.Button btnWide;
}}`;
    const result = parseDesignerSource(source, { sourcePath: "TlpForm.Designer.cs" });
    const tlp = result.controlsByName.get("tlp");
    expect(tlp?.tableLayout?.cells).toEqual({ lblHeader: [0, 0], txtA: [0, 1], btnWide: [0, 2] });
    expect(tlp?.tableLayout?.columnSpan).toEqual({ lblHeader: 2, btnWide: 2 });
  });

  it("does not truncate property values at a semicolon inside a string literal", () => {
    const source = `namespace App { partial class S {
  private void InitializeComponent() {
    this.lbl = new System.Windows.Forms.Label();
    this.lbl.Text = "First; Second; Third";
    this.lbl.Location = new System.Drawing.Point(10, 10);
    this.Controls.Add(this.lbl);
  }
  private System.Windows.Forms.Label lbl;
}}`;
    const result = parseDesignerSource(source, { sourcePath: "S.Designer.cs" });
    const lbl = result.controlsByName.get("lbl");
    // The full text (with embedded semicolons) must be captured, not "First.
    expect(lbl?.text).toBe("First; Second; Third");
  });

  it("parses Color.FromArgb with the nested-cast form VS Designer emits", () => {
    const source = `namespace App { partial class C {
  private void InitializeComponent() {
    this.lbl = new System.Windows.Forms.Label();
    this.lbl.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(128)))), ((int)(((byte)(255)))));
    this.lbl.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(10)))), ((int)(((byte)(20)))), ((int)(((byte)(30)))));
    this.Controls.Add(this.lbl);
  }
  private System.Windows.Forms.Label lbl;
}}`;
    const result = parseDesignerSource(source, { sourcePath: "C.Designer.cs" });
    const lbl = result.controlsByName.get("lbl");
    expect(lbl?.appearance?.foreColor).toEqual({ cssColor: "rgb(64, 128, 255)" });
    // 4-arg form is A,R,G,B → rgba(r,g,b, a/255).
    expect(lbl?.appearance?.backColor).toEqual({ cssColor: "rgba(10, 20, 30, 0.784)" });
  });
});
