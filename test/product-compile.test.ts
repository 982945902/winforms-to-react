import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { convertDesignerSources } from "../src/parser/scanner.js";
import { generateReactProject } from "../src/generator/reactProjectGenerator.js";

const exec = promisify(execFile);

// Expensive end-to-end check: generate a project and verify it type-checks.
// Runs `npm install` + `tsc` in a tmpdir, so it is gated behind an env flag.
// Enable with: WF2_COMPILE_TEST=1 npx vitest run test/product-compile.test.ts
const enabled = process.env.WF2_COMPILE_TEST === "1";

const DESIGNER = `
partial class OrderForm
{
    private System.Windows.Forms.Button btnSave;
    private System.Windows.Forms.DataGridView grid;

    private void InitializeComponent()
    {
        this.btnSave = new System.Windows.Forms.Button();
        this.grid = new System.Windows.Forms.DataGridView();
        this.btnSave.Text = "Save";
        this.btnSave.Click += new System.EventHandler(this.btnSave_Click);
        this.grid.DataSource = this.orderBindingSource;
        this.ClientSize = new System.Drawing.Size(320, 200);
        this.Text = "Order";
        this.Controls.Add(this.btnSave);
        this.Controls.Add(this.grid);
    }
}`;

const CODE_BEHIND = `
using System;
using System.Windows.Forms;
public partial class OrderForm : Form {
    public OrderForm() { InitializeComponent(); }
    private void btnSave_Click(object sender, EventArgs e) {
        SaveOrder();
        MessageBox.Show("saved");
    }
}`;

describe("generated product compiles", () => {
  it.skipIf(!enabled)("passes tsc --noEmit after npm install", async () => {
    const src = await mkdtemp(join(tmpdir(), "wf2react-compile-src-"));
    try {
      await mkdir(join(src, "app"), { recursive: true });
      await writeFile(join(src, "app", "OrderForm.Designer.cs"), DESIGNER, "utf8");
      await writeFile(join(src, "app", "OrderForm.cs"), CODE_BEHIND, "utf8");

      const result = await convertDesignerSources(src);
      const outDir = join(src, "out");
      await generateReactProject({ outDir, forms: result.forms, report: result.report });

      await exec("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: outDir });
      await exec("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: outDir });
    } finally {
      await rm(src, { recursive: true, force: true });
    }
  }, 300_000);

  // The checked-in integration fixture exercises all fixed features across
  // multiple forms (menu, ContextMenu, lambda, CJK identifiers, generic delegates,
  // TLP spans, case-only-colliding form names, navigation). Verify the generated
  // multi-form product type-checks — the goal's "compiles" hard criterion.
  it.skipIf(!enabled)("compiles the consolidated multi-form integration fixture", async () => {
    const fixtureDir = join(__dirname, "fixtures", "integration");
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-intg-out-"));
    try {
      const result = await convertDesignerSources(fixtureDir);
      await generateReactProject({ outDir, forms: result.forms, report: result.report });
      await exec("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: outDir });
      await exec("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: outDir });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 300_000);
});
