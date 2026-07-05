using System; using System.Windows.Forms;
namespace Integration {
  public partial class MainForm : Form {
    private void miNew_Click(object s, EventArgs e) { var f = new EditorForm(); f.ShowDialog(); }
    private void miExit_Click(object s, EventArgs e) { Close(); }
    private void ctxDelete_Click(object s, EventArgs e) { DeleteSel(); }
    private void pollTimer_Tick(object s, EventArgs e) { Poll(); }
    private void MainForm_Load(object s, EventArgs e) { Init(); }
  }
}
