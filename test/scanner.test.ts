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
});
