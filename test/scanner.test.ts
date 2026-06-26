import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
`, "utf8");

      await writeFile(join(root, "Form1.Designer.cs"), `
partial class Form1
{
    private MyListView lv1;
    private FancyButton btn1;
    private BlackStyleProgressBar prog1;
    private MyGridHost grid1;
    private DerivedDeep dd1;

    private void InitializeComponent()
    {
        this.lv1 = new MyListView();
        this.btn1 = new FancyButton();
        this.prog1 = new BlackStyleProgressBar();
        this.grid1 = new MyGridHost();
        this.dd1 = new DerivedDeep();
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
        this.ClientSize = new System.Drawing.Size(340, 160);
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

      const grid = result.forms[0].controls.find((c) => c.name === "grid1");
      expect(grid?.kind).toBe("DataGridView");

      const dd = result.forms[0].controls.find((c) => c.name === "dd1");
      expect(dd?.kind).toBe("Button");

      expect(result.report.unknownControls).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });});
