import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MigrationReport, VisualForm } from "../ir/types.js";

export type GenerateReactProjectInput = {
  outDir: string;
  forms: VisualForm[];
  report: MigrationReport;
};

export async function generateReactProject(input: GenerateReactProjectInput): Promise<void> {
  await mkdir(input.outDir, { recursive: true });
  await mkdir(join(input.outDir, "src"), { recursive: true });
  await mkdir(join(input.outDir, "forms"), { recursive: true });

  const formFiles = allocateFormFiles(input.forms);

  for (const item of formFiles) {
    await writeJson(join(input.outDir, "forms", item.fileName), item.form);
  }

  await writeJson(join(input.outDir, "migration-report.json"), input.report);
  await writeFile(join(input.outDir, "package.json"), packageJson(), "utf8");
  await writeFile(join(input.outDir, "index.html"), indexHtml(), "utf8");
  await writeFile(join(input.outDir, "tsconfig.json"), tsconfigJson(), "utf8");
  await writeFile(join(input.outDir, "vite.config.ts"), viteConfig(), "utf8");
  await writeFile(join(input.outDir, "src", "main.tsx"), mainTsx(), "utf8");
  await writeFile(join(input.outDir, "src", "App.tsx"), appTsx(formFiles), "utf8");
  await writeFile(join(input.outDir, "src", "winformsCompat.tsx"), winformsCompatTsx(), "utf8");
  await writeFile(join(input.outDir, "src", "styles.css"), stylesCss(), "utf8");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function packageJson() {
  return `${JSON.stringify({
    name: "wf2react-preview",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview"
    },
    dependencies: {
      "@vitejs/plugin-react": "^6.0.0",
      "vite": "^8.0.0",
      "typescript": "^5.8.3",
      "react": "^19.0.0",
      "react-dom": "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0"
    }
  }, null, 2)}\n`;
}

function indexHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WinForms React Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function tsconfigJson() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
`;
}

function viteConfig() {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
`;
}

function mainTsx() {
  return `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

type GeneratedFormFile = {
  form: VisualForm;
  fileName: string;
  importName: string;
};

function allocateFormFiles(forms: VisualForm[]): GeneratedFormFile[] {
  const counts = new Map<string, number>();
  for (const form of forms) {
    counts.set(form.name, (counts.get(form.name) ?? 0) + 1);
  }

  return forms.map((form, index) => {
    const duplicate = (counts.get(form.name) ?? 0) > 1;
    const baseName = safeFileName(form.name);
    return {
      form,
      fileName: duplicate ? `${index + 1}-${baseName}.json` : `${baseName}.json`,
      importName: `form${index}`
    };
  });
}

function appTsx(forms: GeneratedFormFile[]) {
  const imports = forms.map((item) => `import ${item.importName} from "../forms/${item.fileName}";`).join("\n");
  const formItems = forms
    .map((item, index) => `{ id: "form-${index}", name: ${JSON.stringify(item.form.name)}, title: ${JSON.stringify(item.form.text ?? item.form.name)}, sourcePath: ${JSON.stringify(item.form.sourcePath)}, controlCount: ${item.form.support.controlsConverted}, degradedCount: ${item.form.support.controlCoverage.degraded}, unknownCount: ${item.form.support.controlCoverage.unknown}, fileName: ${JSON.stringify(item.fileName)}, form: ${item.importName} }`)
    .join(",\n  ");
  return `import { useState } from "react";
${imports}
import report from "../migration-report.json";
import { WinFormHost } from "./winformsCompat";

type PreviewForm = {
  id: string;
  name: string;
  title: string;
  sourcePath: string;
  controlCount: number;
  degradedCount: number;
  unknownCount: number;
  fileName: string;
  form: unknown;
};

const forms: PreviewForm[] = [
  ${formItems}
];

export default function App() {
  const [selectedFormId, setSelectedFormId] = useState(forms[0]?.id ?? "");
  const [issueMode, setIssueMode] = useState(false);
  const visibleForms = issueMode
    ? forms.filter((item) => item.degradedCount > 0 || item.unknownCount > 0)
    : forms;
  const selectedForm = visibleForms.find((item) => item.id === selectedFormId) ?? visibleForms[0] ?? forms[0];
  const coverage = report.controlCoverage;

  return (
    <main className="preview-shell">
      <aside className="preview-sidebar">
        <h1>WinForms React Preview</h1>
        <p>{forms.length} form{forms.length === 1 ? "" : "s"} converted</p>
        <div className="preview-stats" aria-label="Migration coverage">
          <div className="preview-stat">
            <span>Controls</span>
            <strong>{coverage.total}</strong>
          </div>
          <div className="preview-stat">
            <span>Supported</span>
            <strong>{coverage.supportedPercent}%</strong>
          </div>
          <div className="preview-stat">
            <span>Previewable</span>
            <strong>{coverage.previewablePercent}%</strong>
          </div>
          <div className="preview-stat">
            <span>Unknown</span>
            <strong>{coverage.unknown}</strong>
          </div>
        </div>
        <div className="preview-filter" role="group" aria-label="Form filter">
          <button
            className={!issueMode ? "active" : ""}
            type="button"
            onClick={() => {
              setIssueMode(false);
              setSelectedFormId(forms[0]?.id ?? "");
            }}
          >
            All
          </button>
          <button
            className={issueMode ? "active" : ""}
            type="button"
            onClick={() => {
              const firstIssue = forms.find((item) => item.degradedCount > 0 || item.unknownCount > 0);
              setIssueMode(true);
              setSelectedFormId(firstIssue?.id ?? "");
            }}
          >
            Issues
          </button>
        </div>
        <nav className="preview-form-list" aria-label="Converted forms">
          {visibleForms.map((item) => (
            <button
              key={item.id}
              className={item.id === selectedForm?.id ? "active" : ""}
              type="button"
              onClick={() => setSelectedFormId(item.id)}
            >
              <span>{item.title}</span>
              <small>{item.sourcePath}</small>
              <span className="preview-form-badges">
                <em>{item.controlCount} controls</em>
                {item.degradedCount > 0 ? <em>{item.degradedCount} degraded</em> : null}
                {item.unknownCount > 0 ? <em className="warning">{item.unknownCount} unknown</em> : null}
              </span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="preview-forms">
        {selectedForm ? <WinFormHost key={selectedForm.id} form={selectedForm.form as any} /> : null}
      </section>
    </main>
  );
}
`;
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "Form";
}

function winformsCompatTsx() {
  return `import type { CSSProperties } from "react";

export type VisualFont = {
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
};

export type VisualColor = { cssColor: string; name?: string };

export type VisualContentAlignment = {
  horizontal: "Left" | "Center" | "Right";
  vertical: "Top" | "Middle" | "Bottom";
};

export type VisualBorderStyle = "None" | "FixedSingle" | "Fixed3D";

export type VisualAppearance = {
  font?: VisualFont;
  foreColor?: VisualColor;
  backColor?: VisualColor;
  enabled?: boolean;
  visible?: boolean;
  borderStyle?: VisualBorderStyle;
  textAlign?: VisualContentAlignment;
  imageKey?: string;
  image?: string;
  padding?: { left: number; top: number; right: number; bottom: number };
  margin?: { left: number; top: number; right: number; bottom: number };
  rightToLeft?: boolean;
  maximumSize?: { width: number; height: number };
  minimumSize?: { width: number; height: number };
  flatStyle?: string;
  checked?: boolean;
  threeState?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  passwordChar?: string;
  maxLength?: number;
  dropDownStyle?: string;
  selectedIndex?: number;
  value?: string | number;
  minimum?: number;
  maximum?: number;
  format?: string;
  wordWrap?: boolean;
  scrollBars?: string;
  view?: string;
  mask?: string;
  imageLocation?: string;
  sizeMode?: string;
  rows?: number;
  zoom?: number;
  autoZoom?: boolean;
  url?: string;
  checkAlign?: VisualContentAlignment;
  imageAlign?: VisualContentAlignment;
  appearanceStyle?: string;
};

export type VisualTableSizing = {
  type: "Absolute" | "Percent" | "AutoSize";
  value?: number;
};

export type VisualTableLayout = {
  columns: VisualTableSizing[];
  rows: VisualTableSizing[];
  cells: Record<string, [number, number]>;
  columnSpan?: Record<string, number>;
  rowSpan?: Record<string, number>;
};

export type VisualControl = {
  kind: string;
  name: string;
  text?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  dock?: string;
  anchor?: string[];
  tabIndex?: number;
  autoSize?: boolean;
  appearance?: VisualAppearance;
  properties?: Record<string, unknown>;
  events?: Array<{ event: string; handler: string }>;
  columns?: Array<{ name: string; headerText?: string; width?: number; kind: string }>;
  tableLayout?: VisualTableLayout;
  flowDirection?: string;
  wrapContents?: boolean;
  panel1Children?: string[];
  panel2Children?: string[];
  orientation?: string;
  splitterDistance?: number;
  items?: string[];
  children?: VisualControl[];
};

export type VisualForm = {
  kind: "Form";
  name: string;
  text?: string;
  clientSize?: { width: number; height: number };
  formBorderStyle?: string;
  startPosition?: string;
  windowState?: string;
  opacity?: number;
  acceptButton?: string;
  cancelButton?: string;
  icon?: string;
  backgroundImage?: string;
  controls: VisualControl[];
};

export function WinFormHost({ form }: { form: VisualForm }) {
  const width = form.clientSize?.width ?? 900;
  const height = form.clientSize?.height ?? 640;
  const childStyles = layoutChildren({ width, height }, form.controls);
  const border = form.formBorderStyle ?? "Sizable";
  const windowStyle: CSSProperties = { width, minHeight: height + 34 };
  if (form.opacity != null) windowStyle.opacity = Math.max(0, Math.min(1, form.opacity));
  const borderless = border === "None";
  if (borderless) {
    windowStyle.border = "none";
    windowStyle.boxShadow = "none";
  } else if (border === "Fixed3D") {
    windowStyle.border = "2px inset #c0c0c0";
  } else if (border === "FixedSingle" || border === "FixedDialog") {
    windowStyle.border = "1px solid #7f7f7f";
  }
  return (
    <article className="wf-window" style={windowStyle}>
      <header className="wf-titlebar">{form.text || form.name}</header>
      <div className="wf-form-surface" style={{ width, height, backgroundImage: form.backgroundImage ? \`url(\${form.backgroundImage})\` : undefined }}>
        {form.controls.map((control, index) => (
          <WinControl key={control.name} control={control} hostStyle={childStyles[index]} />
        ))}
      </div>
    </article>
  );
}

type LayoutBox = { x: number; y: number; width: number; height: number };

// Compute absolute positioning styles for children of a container.
// Pass 1: Dock reserves edges in z-order; Fill consumes the remainder.
// Pass 2: Anchor resizes/repositions undocked children whose anchor set
// includes opposite edges (Left+Right stretches width, Top+Bottom stretches
// height) to match the parent client rectangle.
function layoutChildren(parent: { width: number; height: number }, children: VisualControl[]): (CSSProperties | undefined)[] {
  const dockStyles = dockLayout(parent, children);
  const styles = dockStyles.slice();
  for (let i = 0; i < children.length; i += 1) {
    if (styles[i]) continue;
    const child = children[i];
    if (!child.anchor || child.anchor.length === 0) continue;
    const anchor = new Set(child.anchor);
    const hasLeft = anchor.has("Left");
    const hasRight = anchor.has("Right");
    const hasTop = anchor.has("Top");
    const hasBottom = anchor.has("Bottom");
    if (!hasLeft && !hasRight && !hasTop && !hasBottom) continue;
    const b = child.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    let left = b.x;
    let top = b.y;
    let w = b.width;
    let h = b.height;
    if (hasLeft && hasRight) {
      const rightEdge = parent.width - (b.x + b.width);
      left = b.x;
      w = Math.max(0, parent.width - b.x - rightEdge);
    } else if (hasRight && !hasLeft) {
      const rightEdge = parent.width - (b.x + b.width);
      left = Math.max(0, parent.width - rightEdge - b.width);
    }
    if (hasTop && hasBottom) {
      const bottomEdge = parent.height - (b.y + b.height);
      top = b.y;
      h = Math.max(0, parent.height - b.y - bottomEdge);
    } else if (hasBottom && !hasTop) {
      const bottomEdge = parent.height - (b.y + b.height);
      top = Math.max(0, parent.height - bottomEdge - b.height);
    }
    styles[i] = { position: "absolute", left, top, width: w, height: h };
  }
  return styles;
}

// WinForms docking passes take the parent client rectangle and reserve space
// for side-docked children in z-order, then Fill consumes whatever remains.
// We approximate z-order with the child array order; pure Top/Bottom/Left/Right
// mixes that differ by insertion order may not be byte-identical to WinForms,
// but covers the common MenuStrip(Top)+StatusStrip(Bottom)+Content(Fill) case.
function dockLayout(parent: { width: number; height: number }, children: VisualControl[]): (CSSProperties | undefined)[] {
  const slot: LayoutBox = { x: 0, y: 0, width: parent.width, height: parent.height };
  const styles: (CSSProperties | undefined)[] = new Array(children.length).fill(undefined);
  const fillIndices: number[] = [];

  children.forEach((child, index) => {
    const dock = (child.dock ?? "None");
    if (dock === "None") return;
    if (dock === "Fill") { fillIndices.push(index); return; }

    const size = child.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    if (dock === "Top") {
      const h = size.height;
      styles[index] = { position: "absolute", left: slot.x, top: slot.y, width: slot.width, height: h };
      slot.y += h; slot.height = Math.max(0, slot.height - h);
    } else if (dock === "Bottom") {
      const h = size.height;
      slot.height = Math.max(0, slot.height - h);
      styles[index] = { position: "absolute", left: slot.x, top: slot.y + slot.height, width: slot.width, height: h };
    } else if (dock === "Left") {
      const w = size.width;
      styles[index] = { position: "absolute", left: slot.x, top: slot.y, width: w, height: slot.height };
      slot.x += w; slot.width = Math.max(0, slot.width - w);
    } else if (dock === "Right") {
      const w = size.width;
      slot.width = Math.max(0, slot.width - w);
      styles[index] = { position: "absolute", left: slot.x + slot.width, top: slot.y, width: w, height: slot.height };
    }
  });

  for (const index of fillIndices) {
    styles[index] = {
      position: "absolute",
      left: slot.x,
      top: slot.y,
      width: Math.max(0, slot.width),
      height: Math.max(0, slot.height)
    };
  }
  return styles;
}

function WinControl({ control, hostStyle }: { control: VisualControl; hostStyle?: CSSProperties }) {
  const baseStyle = hostStyle ?? boundsStyle(control);
  const style = mergeStyle(baseStyle, winStyle(control));
  const children = control.children ?? [];
  const label = control.text ?? "";
  const items = itemTexts(control);
  const ownSize = hostStyle
    ? { width: (hostStyle.width as number | undefined) ?? control.bounds?.width ?? 0, height: (hostStyle.height as number | undefined) ?? control.bounds?.height ?? 0 }
    : { width: control.bounds?.width ?? 0, height: control.bounds?.height ?? 0 };
  const childStyles = isContainerKind(control.kind) ? layoutChildren(ownSize, children) : [];
  const hidden = control.appearance?.visible === false;
  if (hidden) return null;

  switch (control.kind) {
    case "Label":
      return <span className="wf-label" style={style}>{label}</span>;
    case "TextBox":
    case "MaskedTextBox": {
      const a = control.appearance ?? {};
      if (a.multiline) {
        const taStyle: CSSProperties = { ...style, resize: a.readOnly ? "none" : "vertical" };
        return <textarea className="wf-input wf-textarea" style={taStyle} defaultValue={label} readOnly={a.readOnly} maxLength={a.maxLength} aria-label={control.name} />;
      }
      const inputType = a.passwordChar ? "password" : "text";
      const placeholder = a.mask ? a.mask.replace(/0/g, "_").replace(/9/g, "_").replace(/[LA#?&><]/g, "_") : undefined;
      return <input className="wf-input" style={style} type={inputType} defaultValue={label} readOnly={a.readOnly} maxLength={a.maxLength} placeholder={placeholder} aria-label={control.name} />;
    }
    case "RichTextBox": {
      const a = control.appearance ?? {};
      const taStyle: CSSProperties = { ...style, resize: a.readOnly ? "none" : "vertical" };
      return <textarea className="wf-input wf-richtext" style={taStyle} defaultValue={label} readOnly={a.readOnly} aria-label={control.name} />;
    }
    case "Button":
      return <button className="wf-button" style={style} title={eventTitle(control)} disabled={control.appearance?.enabled === false}>{label || control.name}</button>;
    case "ComboBox":
    case "DomainUpDown": {
      const a = control.appearance ?? {};
      const dropdown = a.dropDownStyle === "DropDownList";
      const selected = a.selectedIndex != null ? items[Math.min(a.selectedIndex, items.length - 1)] : undefined;
      return <select className="wf-select" style={style} aria-label={control.name} defaultValue={selected}>{items.map((item) => <option key={item}>{item}</option>)}</select>;
    }
    case "DateTimePicker": {
      const a = control.appearance ?? {};
      const inputType = a.format === "Time" ? "time" : a.format === "Short" ? "date" : "datetime-local";
      return <input className="wf-input wf-date-picker" style={style} type={inputType} defaultValue={typeof a.value === "string" ? a.value : undefined} aria-label={control.name} />;
    }
    case "MonthCalendar":
      return <div className="wf-month-calendar" style={style}><span>{label || control.name}</span></div>;
    case "NumericUpDown": {
      const a = control.appearance ?? {};
      return <input className="wf-input wf-numeric" style={style} type="number" defaultValue={typeof a.value === "number" ? String(a.value) : label} readOnly={a.readOnly} min={a.minimum} max={a.maximum} aria-label={control.name} />;
    }
    case "CheckBox":
      return <label className="wf-check" style={style}><input type="checkbox" defaultChecked={control.appearance?.checked} /> <span>{label}</span></label>;
    case "RadioButton":
      return <label className="wf-check" style={style}><input type="radio" defaultChecked={control.appearance?.checked} /> <span>{label}</span></label>;
    case "GroupBox":
      return <fieldset className="wf-group" style={style}><legend>{label}</legend>{children.map((child, index) => <WinControl key={child.name} control={child} hostStyle={childStyles[index]} />)}</fieldset>;
    case "Panel":
    case "TabPage":
    case "ToolStripContainer":
      return <div className="wf-panel" style={style}>{children.map((child, index) => <WinControl key={child.name} control={child} hostStyle={childStyles[index]} />)}</div>;
    case "FlowLayoutPanel":
      return <WinFlowLayoutPanel control={control} style={style} />;
    case "TableLayoutPanel":
      return <WinTableLayoutPanel control={control} style={style} />;
    case "SplitContainer":
      return <WinSplitContainer control={control} style={style} />;
    case "Splitter":
      return <div className="wf-splitter" style={style} />;
    case "TabControl":
      return <div className="wf-tab" style={style}>{children.map((child, index) => <WinControl key={child.name} control={child} hostStyle={childStyles[index]} />)}</div>;
    case "DataGridView":
      return <WinDataGridView control={control} style={style} />;
    case "MenuStrip":
    case "ToolStrip":
    case "BindingNavigator":
    case "StatusStrip":
      return <div className={"wf-strip wf-strip-" + control.kind.toLowerCase()} style={style}>{children.length ? children.map((child) => <WinControl key={child.name} control={child} />) : (label || control.name)}</div>;
    case "ToolStripButton":
    case "ToolStripDropDownButton":
    case "ToolStripSplitButton":
    case "ToolStripMenuItem":
      return <button className="wf-strip-button" title={eventTitle(control)}>{label || control.name}{children.map((child) => <WinControl key={child.name} control={child} />)}</button>;
    case "ToolStripLabel":
    case "ToolStripStatusLabel":
      return <span className="wf-strip-label">{label || control.name}</span>;
    case "ToolStripSeparator":
      return <span className="wf-strip-separator" />;
    case "ToolStripComboBox":
      return <select className="wf-strip-combo">{items.map((item) => <option key={item}>{item}</option>)}</select>;
    case "ToolStripTextBox":
      return <input className="wf-strip-input" defaultValue={label} aria-label={control.name} />;
    case "ToolStripProgressBar":
      return <progress className="wf-strip-progress" />;
    case "ListBox":
      return <div className="wf-list" style={style}>{items.map((item) => <div key={item} className="wf-list-item">{item}</div>)}</div>;
    case "ListView": {
      const view = control.appearance?.view ?? "List";
      const cols = control.columns ?? [];
      if (view === "Details" && cols.length > 0) {
        return (
          <div className="wf-grid wf-listview" style={style}>
            <table>
              <thead><tr>{cols.map((c) => <th key={c.name} style={{ width: c.width }}>{c.headerText || c.name}</th>)}</tr></thead>
              <tbody>{items.map((item) => <tr key={item}>{cols.map((c) => <td key={c.name}>{item}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      return <div className="wf-list" style={style}>{items.map((item) => <div key={item} className="wf-list-item">{item}</div>)}</div>;
    }
    case "TreeView":
      return <div className="wf-list wf-tree" style={style}>{items.map((item) => <div key={item} className="wf-tree-node">{item}</div>)}</div>;
    case "CheckedListBox":
      return <div className="wf-list" style={style}>{items.map((item) => <label key={item} className="wf-list-item wf-list-check"><input type="checkbox" /> {item}</label>)}</div>;
    case "LinkLabel":
      return <a className="wf-label wf-link" style={style}>{label || control.name}</a>;
    case "HScrollBar":
    case "VScrollBar":
      return <div className={"wf-scrollbar " + (control.kind === "VScrollBar" ? "vertical" : "horizontal")} style={style} />;
    case "TrackBar": {
      const a = control.appearance ?? {};
      return <input className="wf-trackbar" style={style} type="range" defaultValue={typeof a.value === "number" ? String(a.value) : undefined} min={a.minimum} max={a.maximum} />;
    }
    case "ProgressBar": {
      const a = control.appearance ?? {};
      const v = typeof a.value === "number" ? a.value : 0;
      const min = a.minimum ?? 0;
      const max = a.maximum ?? 100;
      const pct = max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 0;
      return <div className="wf-progress" style={style}><div className="wf-progress-bar" style={{ width: pct + "%" }} /></div>;
    }
    case "PictureBox": {
      const a = control.appearance ?? {};
      const fit = (a.sizeMode === "StretchImage") ? "100% 100%" : (a.sizeMode === "Zoom") ? "contain" : (a.sizeMode === "CenterImage") ? "none" : "cover";
      if (a.imageLocation) {
        const imgStyle: CSSProperties = { ...style, backgroundImage: \`url(\${a.imageLocation})\`, backgroundSize: fit as string, backgroundPosition: "center", backgroundRepeat: "no-repeat" };
        return <div className="wf-picture" style={imgStyle} />;
      }
      return <div className="wf-picture" style={style}>{control.name}</div>;
    }
    case "PrintPreviewControl": {
      const a = control.appearance ?? {};
      const zoom = a.zoom ?? 1;
      const pageH = Math.round((style.height as number | undefined ?? 400) * Math.min(zoom, 1));
      const pageW = Math.round((style.width as number | undefined ?? 300) * Math.min(zoom, 1));
      return (
        <div className="wf-print-preview" style={style}>
          <div className="wf-print-page" style={{ width: pageW, height: pageH }} />
        </div>
      );
    }
    case "PropertyGrid":
    case "PropertyGridExtended":
      return <WinPropertyGrid control={control} style={style} />;
    case "WebBrowser":
      return <WinWebBrowser control={control} style={style} />;
    case "Chart":
      return <div className="wf-unknown wf-degraded" style={style}><span>Chart</span><small>chart (degraded)</small></div>;
    case "ErrorProvider":
    case "ToolTip":
    case "Timer":
      return null;
    default:
      return <div className="wf-unknown" style={style}>{control.kind}: {control.name}</div>;
  }
}

// FlowLayoutPanel: children flow according to FlowDirection and WrapContents.
// LeftToRight (default) -> row wrap; TopDown -> column; RightToLeft -> row-reverse.
function WinFlowLayoutPanel({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const dir = control.flowDirection ?? "LeftToRight";
  const wrap = control.wrapContents !== false;
  const children = control.children ?? [];
  const flowStyle: CSSProperties = { ...style, display: "flex", gap: "4px", alignContent: "flex-start" };
  if (dir === "TopDown" || dir === "BottomUp") {
    flowStyle.flexDirection = "column";
    flowStyle.flexWrap = wrap ? "wrap" : "nowrap";
    if (dir === "BottomUp") flowStyle.flexDirection = "column-reverse";
  } else {
    flowStyle.flexWrap = wrap ? "wrap" : "nowrap";
    if (dir === "RightToLeft") flowStyle.flexDirection = "row-reverse";
  }
  return (
    <div className="wf-flow" style={flowStyle}>
      {children.map((child) => <WinControl key={child.name} control={child} />)}
    </div>
  );
}

// SplitContainer: two panels separated by a splitter. Orientation Vertical
// (default) splits left/right; Horizontal splits top/bottom. SplitterDistance
// is the pixel size of Panel1.
function WinSplitContainer({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const horizontal = (control.orientation ?? "Vertical") === "Horizontal";
  const dist = control.splitterDistance ?? 0;
  const all = control.children ?? [];
  const p1Names = new Set(control.panel1Children ?? []);
  const p2Names = new Set(control.panel2Children ?? []);
  const p1 = all.filter((c) => p1Names.has(c.name));
  const p2 = all.filter((c) => p2Names.has(c.name));
  const rest = all.filter((c) => !p1Names.has(c.name) && !p2Names.has(c.name));
  const splitStyle: CSSProperties = { ...style, display: "flex" };
  if (horizontal) splitStyle.flexDirection = "column"; else splitStyle.flexDirection = "row";
  const panel1Style: CSSProperties = horizontal
    ? { height: dist || "50%", overflow: "auto", position: "relative" }
    : { width: dist || "50%", overflow: "auto", position: "relative" };
  const panel2Style: CSSProperties = { flex: 1, overflow: "auto", position: "relative" };
  return (
    <div className="wf-split" style={splitStyle}>
      <div className="wf-split-panel" style={panel1Style}>{p1.map((c) => <WinControl key={c.name} control={c} />)}</div>
      <div className="wf-splitter-bar" aria-hidden="true" />
      <div className="wf-split-panel" style={panel2Style}>{p2.map((c) => <WinControl key={c.name} control={c} />)}{rest.map((c) => <WinControl key={c.name} control={c} />)}</div>
    </div>
  );
}

// PropertyGrid: VS-style property browser with toolbar, categorized rows,
// and a name|value two-column layout. Static placeholder rows approximate the
// runtime appearance; actual selected-object content is not available from
// Designer files.
function WinPropertyGrid({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const rows = [
    { cat: "Appearance", props: [["BackColor", "Control"], ["ForeColor", "ControlText"], ["Font", "Segoe UI, 9pt"], ["Text", control.text ?? control.name]] },
    { cat: "Layout", props: [["Location", boundsText(control)], ["Size", sizeText(control)], ["Dock", (control.dock ?? "None")], ["Anchor", "Top, Left"]] },
    { cat: "Behavior", props: [["Enabled", "True"], ["Visible", "True"], ["TabIndex", String(control.tabIndex ?? 0)]] }
  ];
  return (
    <div className="wf-propgrid" style={style}>
      <div className="wf-propgrid-toolbar">
        <span className="wf-propgrid-btn" title="Categorized">\u229e</span>
        <span className="wf-propgrid-btn" title="Alphabetical">\u2261</span>
        <span className="wf-propgrid-btn" title="Properties">\ud83d\udcc4</span>
        <span className="wf-propgrid-btn" title="Events">\u26a1</span>
      </div>
      <div className="wf-propgrid-body">
        {rows.map((row) => (
          <div key={row.cat} className="wf-propgrid-cat">
            <div className="wf-propgrid-cat-header">\u25be {row.cat}</div>
            {row.props.map(([name, val]) => (
              <div key={name} className="wf-propgrid-row">
                <span className="wf-propgrid-name">{name}</span>
                <span className="wf-propgrid-val">{val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function boundsText(control: VisualControl): string {
  const b = control.bounds;
  return b ? b.x + ", " + b.y : "0, 0";
}

function sizeText(control: VisualControl): string {
  const b = control.bounds;
  return b ? b.width + ", " + b.height : "0, 0";
}

// WebBrowser: address bar + content frame. Url from Designer is shown in the
// address bar; the content area renders a placeholder since cross-origin iframes
// cannot be reliably embedded and most Designer Urls are commented out.
function WinWebBrowser({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const a = control.appearance ?? {};
  const url = a.url ?? "";
  return (
    <div className="wf-webbrowser" style={style}>
      <div className="wf-webbrowser-bar">
        <span className="wf-webbrowser-back">\u2190</span>
        <span className="wf-webbrowser-fwd">\u2192</span>
        <input className="wf-webbrowser-url" defaultValue={url} readOnly placeholder="about:blank" />
      </div>
      <div className="wf-webbrowser-content">
        {url ? <span>Navigation to {url} is not available in preview</span> : <span>about:blank</span>}
      </div>
    </div>
  );
}

// Render a TableLayoutPanel as a CSS grid using the parsed row/column styles.
// Absolute -> px; Percent -> fr with the designer's ratio; AutoSize -> auto.
// Children with cell coordinates are placed via gridColumn/gridRow.
function WinTableLayoutPanel({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const tlp = control.tableLayout;
  const children = control.children ?? [];
  if (!tlp || (tlp.columns.length === 0 && tlp.rows.length === 0)) {
    return <div className="wf-panel wf-tlp" style={style}>{children.map((child) => <WinControl key={child.name} control={child} />)}</div>;
  }

  const colTemplate = tlp.columns.length
    ? tlp.columns.map((c) => sizingToGrid(c, "column")).join(" ")
    : "auto";
  const rowTemplate = tlp.rows.length
    ? tlp.rows.map((r) => sizingToGrid(r, "row")).join(" ")
    : "auto";
  const gridStyle: CSSProperties = { ...style, display: "grid", gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate };

  return (
    <div className="wf-panel wf-tlp" style={gridStyle}>
      {children.map((child) => {
        const cell = tlp.cells[child.name] ?? [0, 0];
        const colSpan = tlp.columnSpan?.[child.name] ?? 1;
        const rowSpan = tlp.rowSpan?.[child.name] ?? 1;
        const cellStyle: CSSProperties = {
          gridColumn: \`\${cell[0] + 1} / span \${colSpan}\`,
          gridRow: \`\${cell[1] + 1} / span \${rowSpan}\`,
          position: "relative"
        };
        return <div key={child.name} style={cellStyle}><WinControl control={child} /></div>;
      })}
    </div>
  );
}

function sizingToGrid(s: VisualTableSizing, axis: "column" | "row"): string {
  if (s.type === "Absolute") return \`\${s.value ?? 0}px\`;
  if (s.type === "Percent") return \`\${s.value ?? 100}fr\`;
  return "auto";
}

function WinDataGridView({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const columns = control.columns && control.columns.length > 0
    ? control.columns
    : [{ name: "placeholder", headerText: control.name, kind: "DataGridViewTextBoxColumn" }];
  const props = control.properties ?? {};
  const bgColor = (props["BackgroundColor"] as VisualColor | undefined)?.cssColor;
  const gridColor = (props["GridColor"] as VisualColor | undefined)?.cssColor ?? "#d0d0d0";
  const altBackColor = (props["AlternatingRowsDefaultCellStyle.BackColor"] as VisualColor | undefined)?.cssColor;
  const headerBackColor = (props["ColumnHeadersDefaultCellStyle.BackColor"] as VisualColor | undefined)?.cssColor;
  const headerForeColor = (props["ColumnHeadersDefaultCellStyle.ForeColor"] as VisualColor | undefined)?.cssColor;
  const selectionBackColor = (props["DefaultCellStyle.SelectionBackColor"] as VisualColor | undefined)?.cssColor;

  const gridStyle: CSSProperties = { ...style, background: bgColor ?? "#ffffff", borderColor: gridColor };
  const headerStyle: CSSProperties = { background: headerBackColor, color: headerForeColor };
  const rowStyle = (index: number): CSSProperties => ({
    background: index % 2 === 1 && altBackColor ? altBackColor : undefined
  });

  return (
    <div className="wf-grid" style={gridStyle}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.name} style={{ width: column.width, ...headerStyle }}>{column.headerText || column.name}</th>)}</tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((row) => (
            <tr key={row} style={rowStyle(row)} className={selectionBackColor ? "wf-grid-row" : undefined}>
              {columns.map((column) => <td key={column.name}>&nbsp;</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function boundsStyle(control: VisualControl): CSSProperties {
  const bounds = control.bounds ?? { x: 0, y: 0, width: 100, height: 24 };
  return {
    position: "absolute",
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function mergeStyle(base: CSSProperties, extra: CSSProperties): CSSProperties {
  return { ...base, ...extra };
}

// Translate WinForms visual appearance into CSS properties. Pure mapping, no
// layout semantics here; layout is handled by dockLayout/boundsStyle upstream.
function winStyle(control: VisualControl): CSSProperties {
  const a = control.appearance;
  if (!a) return {};
  const style: CSSProperties = {};

  if (a.font) {
    const f = a.font;
    const parts: string[] = [];
    if (f.italic) parts.push("italic");
    const weight = f.bold ? "700" : "400";
    parts.push(weight);
    parts.push(f.size != null ? \`\${f.size}px\` : "13px");
    parts.push(f.family || "Segoe UI");
    style.font = parts.join(" ");
    if (f.underline || f.strikeout) {
      const decos: string[] = [];
      if (f.underline) decos.push("underline");
      if (f.strikeout) decos.push("line-through");
      style.textDecoration = decos.join(" ");
    }
  }

  if (a.foreColor) style.color = a.foreColor.cssColor;
  if (a.backColor) style.backgroundColor = a.backColor.cssColor;

  if (a.enabled === false) {
    style.opacity = 0.5;
    style.pointerEvents = "none";
  }

  if (a.borderStyle && a.borderStyle !== "None") {
    if (a.borderStyle === "FixedSingle") {
      style.border = "1px solid #a0a0a0";
    } else {
      style.border = "2px inset #c0c0c0";
    }
  }

  if (a.textAlign) {
    style.textAlign = a.textAlign.horizontal.toLowerCase();
    // Vertical alignment via flex on the content box is applied per-control in
    // CSS; we expose a hint via CSS custom properties for themed components.
    style.alignItems = a.textAlign.vertical === "Top"
      ? "flex-start"
      : a.textAlign.vertical === "Bottom"
        ? "flex-end"
        : "center";
    style.justifyContent = a.textAlign.horizontal === "Left"
      ? "flex-start"
      : a.textAlign.horizontal === "Right"
        ? "flex-end"
        : "center";
  }

  if (a.padding) {
    style.padding = \`\${a.padding.top}px \${a.padding.right}px \${a.padding.bottom}px \${a.padding.left}px\`;
  }

  if (a.rightToLeft) {
    style.direction = "rtl";
  }

  return style;
}

function isContainerKind(kind: string): boolean {
  return kind === "Panel"
    || kind === "FlowLayoutPanel"
    || kind === "TableLayoutPanel"
    || kind === "GroupBox"
    || kind === "TabPage"
    || kind === "ToolStripContainer"
    || kind === "TabControl"
    || kind === "SplitContainer";
}

function eventTitle(control: VisualControl) {
  const events = control.events ?? [];
  return events.length ? events.map((event) => event.handler).join(", ") : undefined;
}

function itemTexts(control: VisualControl) {
  const items = control.items ?? [];
  if (items.length > 0) return items;
  return [control.text || control.name];
}
`;
}

function stylesCss() {
  return `:root {
  font-family: "Microsoft YaHei UI", "Segoe UI", Arial, sans-serif;
  color: #111;
  background: #ececec;
}

body {
  margin: 0;
}

.preview-shell {
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: 100vh;
}

.preview-sidebar {
  padding: 24px;
  border-right: 1px solid #c7c7c7;
  background: #f7f7f7;
  max-height: 100vh;
  overflow: auto;
}

.preview-sidebar h1 {
  font-size: 18px;
  margin: 0 0 8px;
}

.preview-sidebar p {
  margin: 0;
  color: #555;
}

.preview-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0;
}

.preview-stat {
  border: 1px solid #d0d0d0;
  background: #fff;
  padding: 8px;
}

.preview-stat span {
  display: block;
  color: #666;
  font-size: 11px;
}

.preview-stat strong {
  display: block;
  margin-top: 2px;
  font-size: 16px;
  font-weight: 600;
}

.preview-filter {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 0 14px;
  border: 1px solid #c7c7c7;
  background: #fff;
}

.preview-filter button {
  border: 0;
  border-right: 1px solid #c7c7c7;
  background: transparent;
  padding: 7px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.preview-filter button:last-child {
  border-right: 0;
}

.preview-filter button.active {
  background: #dcebff;
  font-weight: 600;
}

.preview-form-list {
  display: grid;
  gap: 4px;
}

.preview-form-list button {
  display: block;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  padding: 7px 8px;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.preview-form-list button:hover,
.preview-form-list button.active {
  border-color: #9bb7da;
  background: #e6f0ff;
}

.preview-form-list span,
.preview-form-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-form-list .preview-form-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.preview-form-badges em {
  border: 1px solid #c8c8c8;
  background: #fff;
  padding: 1px 5px;
  color: #555;
  font-size: 10px;
  font-style: normal;
}

.preview-form-badges em.warning {
  border-color: #d49a60;
  background: #fff4e8;
  color: #7a3300;
}

.preview-form-list span {
  font-size: 12px;
}

.preview-form-list small {
  margin-top: 2px;
  color: #666;
  font-size: 11px;
}

.preview-forms {
  padding: 24px;
  overflow: auto;
}

.wf-window {
  display: inline-block;
  margin: 0 24px 24px 0;
  border: 1px solid #7f7f7f;
  background: #f0f0f0;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.wf-titlebar {
  height: 33px;
  line-height: 33px;
  padding: 0 10px;
  color: #111;
  background: linear-gradient(#ffffff, #d9e8fb);
  border-bottom: 1px solid #9caec4;
  font-size: 13px;
}

.wf-form-surface {
  position: relative;
  background: #f0f0f0;
  overflow: hidden;
}

.wf-label {
  font-size: 12px;
  line-height: 1.2;
  overflow: hidden;
}

.wf-input,
.wf-select {
  box-sizing: border-box;
  border: 1px solid #7a7a7a;
  background: white;
  font: inherit;
  font-size: 12px;
  padding: 1px 3px;
}

.wf-button {
  box-sizing: border-box;
  border: 1px solid #707070;
  border-radius: 2px;
  background: linear-gradient(#ffffff, #e5e5e5);
  font: inherit;
  font-size: 12px;
}

.wf-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  overflow: hidden;
}

.wf-group {
  box-sizing: border-box;
  border: 1px solid #aaa;
  padding: 14px 8px 8px;
}

.wf-group legend {
  padding: 0 4px;
  font-size: 12px;
}

.wf-panel,
.wf-tab {
  box-sizing: border-box;
  border: 1px solid #b8b8b8;
  background: #f0f0f0;
}

.wf-grid {
  box-sizing: border-box;
  border: 1px solid #9a9a9a;
  background: white;
  overflow: hidden;
}

.wf-grid table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.wf-grid th {
  height: 21px;
  border-right: 1px solid #b5b5b5;
  border-bottom: 1px solid #a0a0a0;
  background: linear-gradient(#f8f8f8, #dfdfdf);
  text-align: left;
  padding: 0 4px;
  font-weight: 400;
}

.wf-grid td {
  height: 20px;
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #eee;
}

.wf-strip {
  box-sizing: border-box;
  border: 1px solid #b8b8b8;
  background: linear-gradient(#fafafa, #e5e5e5);
  font-size: 12px;
  padding: 3px 6px;
  white-space: nowrap;
}

.wf-strip-button,
.wf-strip-label,
.wf-strip-combo,
.wf-strip-input,
.wf-strip-progress {
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
  font: inherit;
  font-size: 12px;
}

.wf-strip-button {
  border: 1px solid transparent;
  background: transparent;
  padding: 2px 6px;
}

.wf-strip-button:hover {
  border-color: #8db2e3;
  background: #dcebff;
}

.wf-strip-separator {
  display: inline-block;
  vertical-align: middle;
  width: 1px;
  height: 18px;
  margin: 0 5px 0 1px;
  background: #b8b8b8;
}

.wf-list,
.wf-picture,
.wf-print-preview,
.wf-unknown {
  box-sizing: border-box;
  border: 1px solid #999;
  background: white;
  font-size: 12px;
  padding: 4px;
}

.wf-list-item {
  min-height: 18px;
  line-height: 18px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wf-list-check {
  display: block;
}

.wf-link {
  color: #0066cc;
  text-decoration: underline;
}

.wf-print-preview {
  box-sizing: border-box;
  border: 1px solid #9a9a9a;
  background: #e0e0e0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px;
}

.wf-print-page {
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  border: 1px solid #c0c0c0;
}

.wf-propgrid {
  box-sizing: border-box;
  border: 1px solid #717171;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  font-size: 11px;
  overflow: hidden;
}

.wf-propgrid-toolbar {
  display: flex;
  gap: 2px;
  padding: 3px 4px;
  background: linear-gradient(#fbfbfb, #e4e4e4);
  border-bottom: 1px solid #c0c0c0;
}

.wf-propgrid-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid transparent;
  cursor: default;
}

.wf-propgrid-btn:hover {
  border-color: #8db2e3;
  background: #dcebff;
}

.wf-propgrid-body {
  flex: 1;
  overflow: auto;
  background: #ffffff;
}

.wf-propgrid-cat {
  border-bottom: 1px solid #e0e0e0;
}

.wf-propgrid-cat-header {
  background: #ececec;
  padding: 3px 6px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #d0d0d0;
}

.wf-propgrid-row {
  display: grid;
  grid-template-columns: 45% 55%;
  border-bottom: 1px solid #f0f0f0;
}

.wf-propgrid-name {
  padding: 2px 6px;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-propgrid-val {
  padding: 2px 6px;
  color: #666;
  background: #fafafa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-webbrowser {
  box-sizing: border-box;
  border: 1px solid #717171;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wf-webbrowser-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: linear-gradient(#fafafa, #e8e8e8);
  border-bottom: 1px solid #c0c0c0;
}

.wf-webbrowser-back,
.wf-webbrowser-fwd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid #b0b0b0;
  background: #fff;
  color: #444;
  cursor: default;
}

.wf-webbrowser-url {
  flex: 1;
  border: 1px solid #a0a0a0;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  background: #fff;
}

.wf-webbrowser-content {
  flex: 1;
  display: grid;
  place-items: center;
  color: #888;
  font-size: 12px;
  background: #fff;
}

.wf-scrollbar {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #b0b0b0;
  background: linear-gradient(#f4f4f4, #dcdcdc);
}

.wf-scrollbar.vertical::before,
.wf-scrollbar.horizontal::before {
  content: "";
  position: absolute;
  inset: 2px;
  border: 1px solid #c0c0c0;
  background: #eeeeee;
}

.wf-trackbar {
  box-sizing: border-box;
}

.wf-textarea,
.wf-richtext {
  box-sizing: border-box;
  border: 1px solid #7a7a7a;
  background: white;
  font: inherit;
  font-size: 12px;
  padding: 2px 3px;
  overflow: auto;
}

.wf-progress {
  box-sizing: border-box;
  border: 1px solid #7a7a7a;
  background: #f0f0f0;
  overflow: hidden;
  position: relative;
}

.wf-progress-bar {
  height: 100%;
  background: linear-gradient(#3a8de6, #1f6fc4);
}

.wf-unknown {
  border-style: dashed;
  color: #7a3300;
  background: #fff5e8;
}

.wf-degraded {
  display: grid;
  gap: 4px;
  padding: 6px;
  font-size: 11px;
}

.wf-degraded small {
  color: #888;
}

.wf-listview {
  background: white;
}

.wf-tree {
  padding: 4px;
}

.wf-tree-node {
  padding-left: 16px;
  position: relative;
  min-height: 18px;
  line-height: 18px;
}

.wf-tree-node::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 6px;
  width: 8px;
  height: 8px;
  border: 1px solid #888;
  background: #fff;
}

.wf-flow {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
  border: 1px solid #b8b8b8;
  background: #f0f0f0;
}

.wf-split {
  box-sizing: border-box;
  border: 1px solid #b8b8b8;
  background: #f0f0f0;
}

.wf-split-panel {
  box-sizing: border-box;
  background: #f0f0f0;
}

.wf-splitter-bar {
  flex: 0 0 4px;
  background: linear-gradient(#d8d8d8, #c0c0c0);
  border: 1px solid #a0a0a0;
}

.wf-splitter {
  box-sizing: border-box;
  background: linear-gradient(#f4f4f4, #dcdcdc);
  border: 1px solid #b8b8b8;
}

.wf-date-picker,
.wf-numeric {
  font: inherit;
  font-size: 12px;
}

.wf-month-calendar {
  box-sizing: border-box;
  border: 1px solid #9a9a9a;
  background: #ffffff;
  display: grid;
  place-items: center;
  color: #555;
  font-size: 12px;
}
`;
}
