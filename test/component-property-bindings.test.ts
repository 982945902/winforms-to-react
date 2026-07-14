import { describe, expect, it } from "vitest";
import { parseComponentPropertyBindings } from "../src/parser/componentPropertyBindingCatalog.js";

describe("shared component property bindings", () => {
  it("accepts only proven unconditional value flows into child controls", () => {
    const source = `
      public partial class ChoiceEditor : UserControl {
        private bool locked;
        public PreviewMode Mode {
          get { return (PreviewMode)mode.SelectedIndex; }
          set { mode.SelectedIndex = (int)value; }
        }
        public string Caption { set { this.label.Text = (value); } }
        public string Hint { set { editor.PlaceholderText = value; } }
        public bool Locked {
          set {
            locked = value;
            editor.ReadOnly = locked;
            editor.Enabled = !locked;
          }
        }
        public bool Conditional { set { if (value) { editor.Visible = false; } } }
        public bool Computed { set { editor.Checked = Normalize(value); } }
      }
    `;
    const bindings = parseComponentPropertyBindings(
      source,
      "/repo/ChoiceEditor.cs",
      "ChoiceEditor",
      new Set(["mode", "label", "editor"]),
    );
    expect(bindings).toEqual([
      expect.objectContaining({ sourceProperty: "Mode", targetControlName: "mode", targetProperty: "selectedIndex", line: 6 }),
      expect.objectContaining({ sourceProperty: "Caption", targetControlName: "label", targetProperty: "text" }),
      expect.objectContaining({ sourceProperty: "Hint", targetControlName: "editor", targetProperty: "placeholderText" }),
      expect.objectContaining({ sourceProperty: "Locked", targetControlName: "editor", targetProperty: "readOnly" }),
      expect.objectContaining({ sourceProperty: "Locked", targetControlName: "editor", targetProperty: "enabled", negated: true }),
    ]);
    expect(bindings.some((binding) => binding.sourceProperty === "Conditional")).toBe(false);
    expect(bindings.some((binding) => binding.sourceProperty === "Computed")).toBe(false);
  });

  it("does not bind assignments to fields that are not controls in the shared definition", () => {
    const bindings = parseComponentPropertyBindings(
      "public class Editor : UserControl { public bool Active { set { unrelated.Enabled = value; } } }",
      "/repo/Editor.cs",
      "Editor",
      new Set(["actualChild"]),
    );
    expect(bindings).toEqual([]);
  });
});
