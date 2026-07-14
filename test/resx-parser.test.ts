import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseResx, parseResxBinaryResources, applyResxToProps } from "../src/parser/resxParser.js";

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
  <data name="btnOK.Padding" type="System.Windows.Forms.Padding, System.Windows.Forms"><value>1, 2, 3, 4</value></data>
  <data name="btnOK.Margin" type="System.Windows.Forms.Padding, System.Windows.Forms"><value>5, 6, 7, 8</value></data>
  <data name="btnOK.BackColor" type="System.Drawing.Color, System.Drawing"><value>Window</value></data>
  <data name="btnOK.ForeColor" type="System.Drawing.Color, System.Drawing"><value>Navy</value></data>
  <data name="btnOK.BorderStyle" type="System.Windows.Forms.BorderStyle, System.Windows.Forms"><value>FixedSingle</value></data>
  <data name="btnOK.TextAlign" type="System.Drawing.ContentAlignment, System.Drawing"><value>MiddleLeft</value></data>
  <data name="btnOK.RightToLeft" type="System.Windows.Forms.RightToLeft, System.Windows.Forms"><value>Yes</value></data>
  <data name="btnOK.MinimumSize" type="System.Drawing.Size, System.Drawing"><value>70, 20</value></data>
  <data name="btnOK.MaximumSize" type="System.Drawing.Size, System.Drawing"><value>100, 30</value></data>
  <data name="txtNotes.ReadOnly" type="System.Boolean, mscorlib"><value>True</value></data>
  <data name="txtNotes.Multiline" type="System.Boolean, mscorlib"><value>True</value></data>
  <data name="txtNotes.WordWrap" type="System.Boolean, mscorlib"><value>False</value></data>
  <data name="txtNotes.MaxLength" type="System.Int32, mscorlib"><value>80</value></data>
  <data name="txtNotes.PlaceholderText" xml:space="preserve"><value>Describe the change</value></data>
  <data name="txtNotes.ScrollBars" type="System.Windows.Forms.ScrollBars, System.Windows.Forms"><value>Vertical</value></data>
  <data name="txtSecret.UseSystemPasswordChar" type="System.Boolean, mscorlib"><value>True</value></data>
  <data name="comboMode.DropDownStyle" type="System.Windows.Forms.ComboBoxStyle, System.Windows.Forms"><value>DropDownList</value></data>
  <data name="lblName.Location" type="System.Drawing.Point, System.Drawing">
    <value>12, 12</value>
  </data>
  <data name="lblName.Text" xml:space="preserve">
    <value>Name:</value>
  </data>
  <data name="tpService.Text" xml:space="preserve">
    <value>Image service</value>
    <comment>@Invariant</comment>
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
      expect(btnProps.padding).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
      expect(btnProps.margin).toEqual({ left: 5, top: 6, right: 7, bottom: 8 });
      expect(btnProps.backColor).toBe("Window");
      expect(btnProps.foreColor).toBe("Navy");
      expect(btnProps.borderStyle).toBe("FixedSingle");
      expect(btnProps.textAlign).toBe("MiddleLeft");
      expect(btnProps.rightToLeft).toBe("Yes");
      expect(btnProps.minimumSize).toEqual({ width: 70, height: 20 });
      expect(btnProps.maximumSize).toEqual({ width: 100, height: 30 });

      expect(applyResxToProps("txtNotes", data)).toEqual(expect.objectContaining({
        readOnly: true,
        multiline: true,
        wordWrap: false,
        maxLength: 80,
        placeholderText: "Describe the change",
        scrollBars: "Vertical",
      }));
      expect(applyResxToProps("txtSecret", data).useSystemPasswordChar).toBe(true);
      expect(applyResxToProps("comboMode", data).dropDownStyle).toBe("DropDownList");

      // Label text
      const lblProps = applyResxToProps("lblName", data);
      expect(lblProps.text).toBe("Name:");
      expect(lblProps.location).toEqual({ x: 12, y: 12 });

      // A comment after <value> is common in localized Designer resources.
      expect(applyResxToProps("tpService", data).text).toBe("Image service");

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

  it("extracts embedded WinForms icon bytes without System.Drawing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf2react-resx-icon-"));
    try {
      const file = join(dir, "F.resx");
      await writeFile(file, `<?xml version="1.0" encoding="utf-8"?>
<root>
  <!-- <data name="Example.Icon" type="System.Drawing.Icon, System.Drawing"><value>QUJD</value></data> -->
  <data name="$this.Icon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>AAAB\nAA==</value>
  </data>
</root>`, "utf8");
      const resources = await parseResxBinaryResources(file);
      expect(resources.size).toBe(1);
      expect(resources.get("$this.Icon")).toEqual(expect.objectContaining({ contentBase64: "AAABAA==" }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
