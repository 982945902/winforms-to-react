using System; using System.Windows.Forms;
namespace Integration {
  public partial class EditorForm : Form {
    private void pipette_Used(object s, Integration.Controls.PipetteUsedArgs e) { UseColor(); }
  }
}
