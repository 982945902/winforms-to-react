import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectIR } from "../src/ir/projectIr.js";
import { parsePropertyGridDeclarations } from "../src/parser/propertyGridCatalog.js";

const SETTINGS_MODEL = `using System.ComponentModel;
public class CustomerSettings {
  [Category("General"), DisplayName("Customer name"), Description("Shown in the customer list")]
  public string Name { get; set; } = "Initializer";

  [Category("General"), DefaultValue(5)]
  public int Priority { get; set; }

  [Category("Connection"), Editor(typeof(FolderEditor), typeof(object))]
  public string RootFolder { get; set; }

  [Category("Connection"), PasswordPropertyText(true)]
  public string Secret { get; set; }

  public string EmptyValue { get; set; } = string.Empty;

  [ReadOnly(true)]
  public string Summary { get { return Name; } }

  [Browsable(false)]
  public string InternalId { get; set; }

  public CustomerSettings() {
    Name = "New customer";
    Priority = 7;
    RootFolder = "";
  }
}`;

describe("PropertyGrid preview contracts", () => {
  it("extracts source attributes, access mode and proven default values", () => {
    const fields = parsePropertyGridDeclarations(SETTINGS_MODEL, new Set(["CustomerSettings"])).get("CustomerSettings");
    expect(fields).toEqual([
      expect.objectContaining({
        name: "Name", label: "Customer name", typeName: "string", category: "General",
        description: "Shown in the customer list", defaultValue: "New customer",
      }),
      expect.objectContaining({ name: "Priority", typeName: "int", defaultValue: 7 }),
      expect.objectContaining({ name: "RootFolder", hasEditor: true, defaultValue: "" }),
      expect.objectContaining({ name: "Secret", password: true }),
      expect.objectContaining({ name: "EmptyValue", defaultValue: "" }),
      expect.objectContaining({ name: "Summary", readOnly: true }),
    ]);
    expect(fields?.some((field) => field.name === "InternalId")).toBe(false);
  });

  it("materializes an inferred SelectedObject type from wider project context", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-property-grid-"));
    const ui = join(root, "ui");
    const domain = join(root, "domain");
    try {
      await mkdir(ui);
      await mkdir(domain);
      const designer = join(ui, "SettingsForm.Designer.cs");
      await writeFile(designer, `partial class SettingsForm {
        private System.Windows.Forms.ListBox customerList;
        private System.Windows.Forms.PropertyGrid customerGrid;
        private void InitializeComponent() {
          this.customerList = new System.Windows.Forms.ListBox();
          this.customerGrid = new System.Windows.Forms.PropertyGrid();
          this.customerList.Location = new System.Drawing.Point(8, 8);
          this.customerList.Size = new System.Drawing.Size(120, 240);
          this.customerGrid.Location = new System.Drawing.Point(136, 8);
          this.customerGrid.Size = new System.Drawing.Size(360, 240);
          this.Controls.Add(this.customerGrid);
          this.Controls.Add(this.customerList);
        }
      }`, "utf8");
      await writeFile(join(ui, "SettingsForm.cs"), `partial class SettingsForm : System.Windows.Forms.Form {
        void SelectCustomer() {
          CustomerSettings selected = (CustomerSettings)customerList.Items[customerList.SelectedIndex];
          customerGrid.SelectedObject = customerList.Items[customerList.SelectedIndex];
        }
      }`, "utf8");
      await writeFile(join(domain, "CustomerSettings.cs"), SETTINGS_MODEL, "utf8");

      const project = await buildProjectIR(designer, { contextRoot: root });
      const grid = project.pages[0].controls.find((control) => control.name === "customerGrid");
      expect(grid?.propertyGridSource).toEqual(expect.objectContaining({
        typeName: "CustomerSettings",
        expression: "customerList.Items[customerList.SelectedIndex]",
        fields: expect.arrayContaining([
          expect.objectContaining({ name: "Name", defaultValue: "New customer" }),
          expect.objectContaining({ name: "Secret", password: true }),
        ]),
      }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
