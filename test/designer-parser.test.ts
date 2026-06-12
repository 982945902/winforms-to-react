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
  });
});
