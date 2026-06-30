import { readFile } from "node:fs/promises";

// Parsed resx properties for a single control: { "Location": "8, 401", "Size": "96, 32", "Text": "Continue", ... }
export type ResxControlProps = Map<string, string>;

// Map from control name -> properties
export type ResxData = Map<string, ResxControlProps>;

// Parse a .resx file and extract per-control properties.
// resx entries look like:
//   <data name="btnContinue.Location" type="System.Drawing.Point, System.Drawing">
//     <value>8, 401</value>
//   </data>
// We extract controlName.property -> value pairs.
export async function parseResx(filePath: string): Promise<ResxData> {
  const source = await readFile(filePath, "utf8");
  const data: ResxData = new Map();

  // Match <data name="X.Y" ...><value>Z</value></data>
  // Skip entries starting with >> (designer metadata like >>btnCancel.Parent)
  const pattern = /<data\s+name="([^"&][^"]*)"(?:[^>]*)>\s*<value(?:[^>]*)>([^<]*)<\/value>\s*<\/data>/g;
  for (const match of source.matchAll(pattern)) {
    const fullName = match[1];
    const value = match[2].trim();
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

// Merge resx properties into a control's bounds and text.
// This is called after parsing the Designer.cs when a control has no bounds
// (set via resources.ApplyResources instead of direct assignment).
export function applyResxToProps(
  controlName: string,
  resx: ResxData
): { location?: { x: number; y: number }; size?: { width: number; height: number }; clientSize?: { width: number; height: number }; text?: string; dock?: string; anchor?: string[] } {
  const props = resx.get(controlName);
  if (!props) return {};
  const result: { location?: { x: number; y: number }; size?: { width: number; height: number }; clientSize?: { width: number; height: number }; text?: string; dock?: string; anchor?: string[] } = {};

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

  const text = props.get("Text");
  if (text) result.text = text;

  const dock = props.get("Dock");
  if (dock) result.dock = dock;

  const anchor = props.get("Anchor");
  if (anchor) result.anchor = anchor.split(",").map((s) => s.trim());

  return result;
}