import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseResx, applyResxToProps } from "../src/parser/resxParser.js";

const SAMPLE_RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>
  <data name="$this.ClientSize" type="System.Drawing.Size, System.Drawing">
    <value>400, 300</value>
  </data>
  <data name="$this.Text" xml:space="preserve">
    <value>My Form</value>
  </data>
  <data name="btnOK.Location" type="System.Drawing.Point, System.Drawing">
    <value>12, 264</value>
  </data>
  <data name="btnOK.Size" type="System.Drawing.Size, System.Drawing">
    <value>75, 23</value>
  </data>
  <data name="btnOK.Text" xml:space="preserve">
    <value>OK</value>
  </data>
  <data name="btnOK.Anchor" type="System.Windows.Forms.AnchorStyles, System.Windows.Forms">
    <value>Bottom, Right</value>
  </data>
  <data name="lblName.Location" type="System.Drawing.Point, System.Drawing">
    <value>12, 12</value>
  </data>
  <data name="lblName.Text" xml:space="preserve">
    <value>Name:</value>
  </data>
  <data name="lvItems.Font" type="System.Drawing.Font, System.Drawing">
    <value>Microsoft Sans Serif, 9.75pt</value>
  </data>
  <data name="lvItems.Enabled" type="System.Boolean, mscorlib">
    <value>False</value>
  </data>
  <data name=">>btnOK.Name" xml:space="preserve">
    <value>btnOK</value>
  </data>
</root>`;

describe("resxParser", () => {
  it("parses control properties from resx XML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resx-test-"));
    const resxPath = join(dir, "TestForm.resx");
    try {
      await writeFile(resxPath, SAMPLE_RESX, "utf8");
      const data = await parseResx(resxPath);

      // btnOK properties
      const btnProps = applyResxToProps("btnOK", data);
      expect(btnProps.location).toEqual({ x: 12, y: 264 });
      expect(btnProps.size).toEqual({ width: 75, height: 23 });
      expect(btnProps.text).toBe("OK");
      expect(btnProps.anchor).toEqual(["Bottom", "Right"]);

      // Label text
      const lblProps = applyResxToProps("lblName", data);
      expect(lblProps.text).toBe("Name:");
      expect(lblProps.location).toEqual({ x: 12, y: 12 });

      // Form properties ($this)
      const formProps = applyResxToProps("$this", data);
      expect(formProps.clientSize).toEqual({ width: 400, height: 300 });
      expect(formProps.text).toBe("My Form");

      // Font and Enabled
      const lvProps = applyResxToProps("lvItems", data);
      expect(lvProps.font).toEqual({ family: "Microsoft Sans Serif", size: 9.75 });
      expect(lvProps.enabled).toBe(false);

      // >> entries (designer metadata) should be skipped
      expect(data.has(">>btnOK.Name")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("decodes XML entities in resx values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf2react-resx-ent-"));
    try {
      const file = join(dir, "F.resx");
      await writeFile(file, `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="lbl.Text" xml:space="preserve"><value>Save &amp; Close &lt;F5&gt; &quot;x&quot;</value></data>
</root>`, "utf8");
      const data = await parseResx(file);
      // & < > " must round-trip decoded; &amp; must not double-decode.
      expect(data.get("lbl")?.get("Text")).toBe('Save & Close <F5> "x"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("parses font style flags (Bold/Italic) from resx Font values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf2react-resx-font-"));
    try {
      const file = join(dir, "F.resx");
      await writeFile(file, `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="lbl.Font" type="System.Drawing.Font, System.Drawing"><value>Segoe UI, 9.75pt, style=Bold, Italic</value></data>
</root>`, "utf8");
      const data = await parseResx(file);
      const props = applyResxToProps("lbl", data);
      expect(props.font).toEqual({ family: "Segoe UI", size: 9.75, bold: true, italic: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});