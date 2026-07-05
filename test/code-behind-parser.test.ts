import { describe, expect, it } from "vitest";
import { parseCodeBehind } from "../src/parser/codeBehindParser.js";

const CODE_BEHIND = `using System;
using System.Windows.Forms;

namespace App {
  public partial class OrderForm : Form {
    public OrderForm() { InitializeComponent(); }

    private void btnSave_Click(object sender, EventArgs e) {
      if (ValidateInput()) {
        SaveOrder();
        MessageBox.Show("Saved");
      }
    }

    private void btnDetail_Click(object sender, EventArgs e) {
      var f = new DetailForm();
      f.ShowDialog();
    }

    private void grid_CellClick(object sender, DataGridViewCellEventArgs e) {
      RefreshGrid();
    }
  }
}
`;

describe("parseCodeBehind", () => {
  it("extracts handlers with C# 8+ nullable sender/args signatures", () => {
    const src = `using System; using System.Windows.Forms;
public partial class N : Form {
    private void btn_Click(object? sender, EventArgs e) { SaveOrder(); }
    private void grid_Cell(object sender, DataGridViewCellEventArgs? e) { Refresh(); }
}`;
    const info = parseCodeBehind(src, "/proj/N.cs");
    const names = info.handlers.map((h) => h.handler).sort();
    // Both nullable-annotated signatures must be extracted (not "handler not found").
    expect(names).toEqual(["btn_Click", "grid_Cell"]);
    const btn = info.handlers.find((h) => h.handler === "btn_Click");
    expect(btn?.calledSymbols).toContain("SaveOrder");
  });

  it("extracts event handlers with line ranges and called symbols", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    const byName = Object.fromEntries(info.handlers.map((h) => [h.handler, h]));

    expect(Object.keys(byName).sort()).toEqual(["btnDetail_Click", "btnSave_Click", "grid_CellClick"]);

    const save = byName["btnSave_Click"];
    expect(save.sourceFile).toBe("OrderForm.cs");
    expect(save.lineStart).toBeLessThan(save.lineEnd);
    expect(save.calledSymbols).toContain("SaveOrder");
    expect(save.calledSymbols).toContain("MessageBox.Show");
    expect(save.calledSymbols).toContain("ValidateInput");

    const grid = byName["grid_CellClick"];
    expect(grid.calledSymbols).toEqual(["RefreshGrid"]);
  });

  it("resolves navigation targets through local variables and marks modality", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    expect(info.navigations).toEqual([
      { target: "DetailForm", modal: true, fromHandler: "btnDetail_Click" }
    ]);
  });

  it("does not treat MessageBox.Show as navigation", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    expect(info.navigations.some((n) => n.target === "MessageBox")).toBe(false);
  });

  it("does not treat MessageBox-like helper classes as navigation", () => {
    const src = `public partial class F : Form {
      private void btn_Click(object sender, EventArgs e) {
        MessageBoxes.Show("hi");
        CustomMessageBox.ShowDialog("warn");
        var dlg = new RealForm();
        dlg.ShowDialog();
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    // MessageBoxes / CustomMessageBox are dialog helpers, not navigable forms.
    expect(info.navigations.map((n) => n.target)).toEqual(["RealForm"]);
  });

  it("extracts data bindings from DataSource, BindingSource and DataBindings.Add", () => {
    const src = `public partial class F : Form {
      private void Init() {
        this.grid.DataSource = this.orderBindingSource;
        this.orderBindingSource = new BindingSource();
        this.txtName.DataBindings.Add("Text", this.model);
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.bindings).toContainEqual({ controlName: "grid", dataSource: "orderBindingSource", kind: "DataSource" });
    expect(info.bindings).toContainEqual({ controlName: "orderBindingSource", dataSource: "orderBindingSource", kind: "BindingSource" });
    expect(info.bindings).toContainEqual({ controlName: "txtName", dataSource: "model", boundProperty: "Text", kind: "DataBinding" });
  });

  it("extracts bindings from the new Binding(...) overload and typeof data sources", () => {
    const src = `public partial class F : Form {
      private void Init() {
        this.chk.DataBindings.Add(new Binding("Checked", src, "IsActive"));
        this.bs.DataSource = typeof(Customer);
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.bindings).toContainEqual({ controlName: "chk", dataSource: "src.IsActive", boundProperty: "Checked", kind: "DataBinding" });
    // typeof(Customer) records the type, not the literal "typeof".
    expect(info.bindings).toContainEqual({ controlName: "bs", dataSource: "Customer", kind: "DataSource" });
  });

  it("ignores braces inside comments and strings when matching method bodies", () => {
    const src = `public partial class F : Form {
      private void onClick(object sender, EventArgs e) {
        // a stray } brace in a comment
        var s = "another } in a string";
        DoWork();
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.handlers).toHaveLength(1);
    expect(info.handlers[0].calledSymbols).toContain("DoWork");
  });
});
