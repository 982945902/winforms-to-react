namespace Integration {
  partial class EditorForm {
    private System.Windows.Forms.TableLayoutPanel tlp;
    private System.Windows.Forms.Label lblTitle;
    private System.Windows.Forms.TextBox txtName;
    private System.Windows.Forms.Button button_保存;
    private Integration.Controls.Pipette pipette;
    private void InitializeComponent() {
      this.tlp = new System.Windows.Forms.TableLayoutPanel();
      this.lblTitle = new System.Windows.Forms.Label();
      this.txtName = new System.Windows.Forms.TextBox();
      this.button_保存 = new System.Windows.Forms.Button();
      this.pipette = new Integration.Controls.Pipette();
      this.tlp.ColumnCount = 2;
      this.tlp.RowCount = 3;
      this.tlp.Location = new System.Drawing.Point(0, 0);
      this.tlp.Size = new System.Drawing.Size(400, 300);
      this.lblTitle.Text = "Editor";
      this.txtName.DataBindings.Add(new System.Windows.Forms.Binding("Text", this.model, "Name"));
      this.button_保存.Text = "保存";
      this.button_保存.Click += (sender, e) => DoSave();
      this.pipette.PipetteUsed += new System.EventHandler<Integration.Controls.PipetteUsedArgs>(this.pipette_Used);
      this.tlp.Controls.Add(this.lblTitle, 0, 0);
      this.tlp.SetColumnSpan(this.lblTitle, 2);
      this.tlp.Controls.Add(this.txtName, 0, 1);
      this.tlp.Controls.Add(this.button_保存, 1, 1);
      this.tlp.Controls.Add(this.pipette, 0, 2);
      this.ClientSize = new System.Drawing.Size(400, 300);
      this.Text = "Editor";
      this.Controls.Add(this.tlp);
    }
  }
}
