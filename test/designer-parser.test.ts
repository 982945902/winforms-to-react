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
      "ToolStripContainer"
    ]);
    expect(result.report.degradedControls).toEqual(["PrintPreviewControl"]);
    expect(result.report.unknownControls).toEqual([]);
    expect(result.report.controlCoverage).toEqual({
      total: 3,
      supported: 2,
      degraded: 1,
      unknown: 0,
      supportedPercent: 66.7,
      previewablePercent: 100,
      unknownPercent: 0,
      byKind: [
        { kind: "BindingNavigator", count: 1, status: "supported" },
        { kind: "PrintPreviewControl", count: 1, status: "degraded" },
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
