namespace Integration {
  partial class MainForm {
    private System.ComponentModel.IContainer components;
    private System.Windows.Forms.MenuStrip menuStrip;
    private System.Windows.Forms.ToolStripMenuItem fileMenu;
    private System.Windows.Forms.ToolStripMenuItem miNew;
    private System.Windows.Forms.ToolStripMenuItem miExit;
    private System.Windows.Forms.ContextMenuStrip ctxMenu;
    private System.Windows.Forms.ToolStripMenuItem ctxDelete;
    private System.Windows.Forms.Timer pollTimer;
    private System.Windows.Forms.ListBox list;
    private void InitializeComponent() {
      this.menuStrip = new System.Windows.Forms.MenuStrip();
      this.fileMenu = new System.Windows.Forms.ToolStripMenuItem();
      this.miNew = new System.Windows.Forms.ToolStripMenuItem();
      this.miExit = new System.Windows.Forms.ToolStripMenuItem();
      this.ctxMenu = new System.Windows.Forms.ContextMenuStrip(this.components);
      this.ctxDelete = new System.Windows.Forms.ToolStripMenuItem();
      this.pollTimer = new System.Windows.Forms.Timer(this.components);
      this.list = new System.Windows.Forms.ListBox();
      this.miNew.Text = "New";
      this.miNew.Click += new System.EventHandler(this.miNew_Click);
      this.miExit.Text = "Exit";
      this.miExit.Click += new System.EventHandler(this.miExit_Click);
      this.fileMenu.DropDownItems.Add(this.miNew);
      this.fileMenu.DropDownItems.Add(this.miExit);
      this.menuStrip.Items.Add(this.fileMenu);
      this.ctxDelete.Text = "Delete";
      this.ctxDelete.Click += new System.EventHandler(this.ctxDelete_Click);
      this.ctxMenu.Items.Add(this.ctxDelete);
      this.pollTimer.Tick += new System.EventHandler(this.pollTimer_Tick);
      this.list.Location = new System.Drawing.Point(10, 30);
      this.list.Size = new System.Drawing.Size(200, 150);
      this.list.ContextMenuStrip = this.ctxMenu;
      this.Load += new System.EventHandler(this.MainForm_Load);
      this.ClientSize = new System.Drawing.Size(400, 300);
      this.Text = "Main";
      this.Controls.Add(this.list);
      this.Controls.Add(this.menuStrip);
    }
  }
}
