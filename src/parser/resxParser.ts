import { readFile } from "node:fs/promises";

// Parsed resx properties for a single control: { "Location": "8, 401", "Size": "96, 32", "Text": "Continue", ... }
export type ResxControlProps = Map<string, string>;

// Map from control name -> properties
export type ResxData = Map<string, ResxControlProps>;

export type ResxBinaryResource = {
  name: string;
  type: string;
  contentBase64: string;
};

// Decode the XML entities that resx <value> text is stored with, so displayed
// text (labels/tooltips containing & < > " ') round-trips correctly.
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // must be last so decoded entities aren't re-decoded
}

// Parse a .resx file and extract per-control properties.
// resx entries look like:
//   <data name="btnContinue.Location" type="System.Drawing.Point, System.Drawing">
//     <value>8, 401</value>
//   </data>
// We extract controlName.property -> value pairs.
export async function parseResx(filePath: string): Promise<ResxData> {
  const source = await readFile(filePath, "utf8");
  const data: ResxData = new Map();

  // Match <data name="X.Y" ...><value>Z</value>...</data>. Localized
  // WinForms resources often insert a <comment>@Invariant</comment> after the
  // value; requiring </data> immediately after </value> silently dropped those
  // labels (notably ShareX's nested TabPage captions).
  // Skip entries starting with >> (designer metadata like >>btnCancel.Parent)
  const pattern = /<data\s+name="([^"&][^"]*)"(?:[^>]*)>[\s\S]*?<value(?:[^>]*)>([\s\S]*?)<\/value>[\s\S]*?<\/data>/g;
  for (const match of source.matchAll(pattern)) {
    const fullName = match[1];
    const value = decodeXmlEntities(match[2].trim());
    const dotIdx = fullName.indexOf(".");
    if (dotIdx <= 0) continue;
    const controlName = fullName.slice(0, dotIdx);
    const property = fullName.slice(dotIdx + 1);
    if (!controlName || !property) continue;
    let props = data.get(controlName);
    if (!props) {
      props = new Map();
      data.set(controlName, props);
    }
    props.set(property, value);
  }

  return data;
}

// Extract raw icon byte arrays embedded by ComponentResourceManager. Icon
// values in classic WinForms resx files are already ICO bytes encoded as
// base64, so they can be emitted without System.Drawing or platform-specific
// deserialization.
export async function parseResxBinaryResources(filePath: string): Promise<Map<string, ResxBinaryResource>> {
  const source = (await readFile(filePath, "utf8")).replace(/<!--[\s\S]*?-->/g, "");
  const resources = new Map<string, ResxBinaryResource>();
  const pattern = /<data\s+([^>]*)>\s*<value(?:[^>]*)>([\s\S]*?)<\/value>\s*<\/data>/g;
  for (const match of source.matchAll(pattern)) {
    const attributes = match[1];
    const name = attributes.match(/\bname="([^"]+)"/)?.[1];
    const type = attributes.match(/\btype="([^"]+)"/)?.[1] ?? "";
    if (!name || !/System\.Drawing\.Icon/i.test(type)) continue;
    const contentBase64 = match[2].replace(/\s+/g, "");
    if (!contentBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) continue;
    const decodedName = decodeXmlEntities(name);
    resources.set(decodedName, { name: decodedName, type, contentBase64 });
  }
  return resources;
}

// Merge resx properties into a control's bounds and text.
// This is called after parsing the Designer.cs when a control has no bounds
// (set via resources.ApplyResources instead of direct assignment).
export type ResxProps = {
  location?: { x: number; y: number };
  size?: { width: number; height: number };
  clientSize?: { width: number; height: number };
  text?: string;
  dock?: string;
  anchor?: string[];
  font?: { family: string; size: number; bold?: boolean; italic?: boolean; underline?: boolean; strikeout?: boolean };
  enabled?: boolean;
  autoSize?: boolean;
  padding?: { left: number; top: number; right: number; bottom: number };
  margin?: { left: number; top: number; right: number; bottom: number };
  image?: string;
  imageKey?: string;
  dgvColumnHeaderText?: string;
  width?: number;
  foreColor?: string;
  backColor?: string;
  borderStyle?: string;
  textAlign?: string;
  checkAlign?: string;
  imageAlign?: string;
  rightToLeft?: string;
  flatStyle?: string;
  readOnly?: boolean;
  multiline?: boolean;
  wordWrap?: boolean;
  useSystemPasswordChar?: boolean;
  passwordChar?: string;
  maxLength?: number;
  placeholderText?: string;
  toolTipText?: string;
  scrollBars?: string;
  dropDownStyle?: string;
  minimumSize?: { width: number; height: number };
  maximumSize?: { width: number; height: number };
};

export function applyResxToProps(controlName: string, resx: ResxData): ResxProps {
  const props = resx.get(controlName);
  if (!props) return {};
  const result: ResxProps = {};

  const loc = props.get("Location");
  if (loc) {
    const parts = loc.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
      result.location = { x: parts[0], y: parts[1] };
    }
  }

  const parseSize = (val: string | undefined): { width: number; height: number } | undefined => {
    if (!val) return undefined;
    const parts = val.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) return { width: parts[0], height: parts[1] };
    return undefined;
  };
  result.size = parseSize(props.get("Size"));
  result.clientSize = parseSize(props.get("ClientSize"));
  result.minimumSize = parseSize(props.get("MinimumSize"));
  result.maximumSize = parseSize(props.get("MaximumSize"));

  const text = props.get("Text");
  if (text) result.text = text;

  const dock = props.get("Dock");
  if (dock) result.dock = dock;

  const anchor = props.get("Anchor");
  if (anchor) result.anchor = anchor.split(",").map((s) => s.trim());

  // Font: "Segoe UI, 9.75pt, style=Bold, Italic" -> { family, size, bold, italic, ... }
  const font = props.get("Font");
  if (font) {
    const m = font.match(/^([^,]+),\s*([\d.]+)pt/);
    if (m) {
      const parsed: NonNullable<ResxProps["font"]> = { family: m[1].trim(), size: Number(m[2]) };
      const style = font.match(/style=([A-Za-z,\s]+)/i)?.[1] ?? "";
      if (/\bBold\b/i.test(style)) parsed.bold = true;
      if (/\bItalic\b/i.test(style)) parsed.italic = true;
      if (/\bUnderline\b/i.test(style)) parsed.underline = true;
      if (/\bStrikeout\b/i.test(style)) parsed.strikeout = true;
      result.font = parsed;
    }
  }

  const enabled = props.get("Enabled");
  if (enabled) result.enabled = enabled === "True";

  // Note: Visible from resx is intentionally NOT applied — WinForms designer
  // sets Visible=False on collapsed/hidden design-time controls, which is not
  // the runtime visibility state. Only apply Visible from Designer.cs direct
  // assignment.

  const autoSize = props.get("AutoSize");
  if (autoSize) result.autoSize = autoSize === "True";

  const booleanValue = (name: string): boolean | undefined => {
    const value = props.get(name);
    return value === undefined ? undefined : value === "True";
  };
  result.readOnly = booleanValue("ReadOnly");
  result.multiline = booleanValue("Multiline");
  result.wordWrap = booleanValue("WordWrap");
  result.useSystemPasswordChar = booleanValue("UseSystemPasswordChar");

  // Image references (ImageKey from resx for buttons/toolstrip items)
  const image = props.get("Image");
  if (image) result.image = image;
  const imageKey = props.get("ImageKey");
  if (imageKey) result.imageKey = imageKey;

  // Padding: "4, 3, 4, 3" -> { left, top, right, bottom }
  const padding = props.get("Padding");
  if (padding) {
    const parts = padding.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 4) result.padding = { left: parts[0], top: parts[1], right: parts[2], bottom: parts[3] };
  }
  const margin = props.get("Margin");
  if (margin) {
    const parts = margin.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 4) result.margin = { left: parts[0], top: parts[1], right: parts[2], bottom: parts[3] };
  }

  result.foreColor = props.get("ForeColor");
  result.backColor = props.get("BackColor");
  result.borderStyle = props.get("BorderStyle");
  result.textAlign = props.get("TextAlign");
  result.checkAlign = props.get("CheckAlign");
  result.imageAlign = props.get("ImageAlign");
  result.rightToLeft = props.get("RightToLeft");
  result.flatStyle = props.get("FlatStyle");
  result.passwordChar = props.get("PasswordChar");
  result.placeholderText = props.get("PlaceholderText") ?? props.get("WatermarkText") ?? props.get("CueBannerText");
  result.toolTipText = props.get("ToolTip") ?? props.get("ToolTipText");
  result.scrollBars = props.get("ScrollBars");
  result.dropDownStyle = props.get("DropDownStyle");
  const maxLength = Number(props.get("MaxLength"));
  if (Number.isFinite(maxLength)) result.maxLength = maxLength;

  // DataGridView column header text: colName.HeaderText -> actual display text
  const headerText = props.get("HeaderText");
  if (headerText) result.dgvColumnHeaderText = headerText;
  const width = Number(props.get("Width"));
  if (Number.isFinite(width)) result.width = width;

  return result;
}
