namespace Integration {
  partial class editorform {
    private System.Windows.Forms.Button btnLegacy;
    private void InitializeComponent() {
      this.btnLegacy = new System.Windows.Forms.Button();
      this.btnLegacy.Text = "Legacy";
      this.btnLegacy.Click += new System.EventHandler(this.btnLegacy_Click);
      this.ClientSize = new System.Drawing.Size(120, 80);
      this.Text = "Legacy";
      this.Controls.Add(this.btnLegacy);
    }
  }
}
