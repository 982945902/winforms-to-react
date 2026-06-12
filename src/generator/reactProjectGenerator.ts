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
  const formItems = forms.map((item) => `{ name: ${JSON.stringify(item.form.name)}, form: ${item.importName} }`).join(",\n  ");
  return `${imports}
import { WinFormHost } from "./winformsCompat";

const forms = [
  ${formItems}
];

export default function App() {
  return (
    <main className="preview-shell">
      <aside className="preview-sidebar">
        <h1>WinForms React Preview</h1>
        <p>{forms.length} form{forms.length === 1 ? "" : "s"} converted</p>
      </aside>
      <section className="preview-forms">
        {forms.map((item) => (
          <WinFormHost key={item.name} form={item.form as any} />
        ))}
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

export type VisualControl = {
  kind: string;
  name: string;
  text?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  dock?: string;
  anchor?: string[];
  tabIndex?: number;
  autoSize?: boolean;
  properties?: Record<string, unknown>;
  events?: Array<{ event: string; handler: string }>;
  columns?: Array<{ name: string; headerText?: string; width?: number; kind: string }>;
  children?: VisualControl[];
};

export type VisualForm = {
  kind: "Form";
  name: string;
  text?: string;
  clientSize?: { width: number; height: number };
  controls: VisualControl[];
};

export function WinFormHost({ form }: { form: VisualForm }) {
  const width = form.clientSize?.width ?? 900;
  const height = form.clientSize?.height ?? 640;
  return (
    <article className="wf-window" style={{ width, minHeight: height + 34 }}>
      <header className="wf-titlebar">{form.text || form.name}</header>
      <div className="wf-form-surface" style={{ width, height }}>
        {form.controls.map((control) => (
          <WinControl key={control.name} control={control} />
        ))}
      </div>
    </article>
  );
}

function WinControl({ control }: { control: VisualControl }) {
  const style = boundsStyle(control);
  const children = control.children ?? [];
  const label = control.text ?? "";

  switch (control.kind) {
    case "Label":
      return <span className="wf-label" style={style}>{label}</span>;
    case "TextBox":
    case "MaskedTextBox":
      return <input className="wf-input" style={style} defaultValue={label} aria-label={control.name} />;
    case "Button":
      return <button className="wf-button" style={style} title={eventTitle(control)}>{label || control.name}</button>;
    case "ComboBox":
    case "DomainUpDown":
      return <select className="wf-select" style={style} aria-label={control.name}><option>{label}</option></select>;
    case "CheckBox":
      return <label className="wf-check" style={style}><input type="checkbox" /> <span>{label}</span></label>;
    case "RadioButton":
      return <label className="wf-check" style={style}><input type="radio" /> <span>{label}</span></label>;
    case "GroupBox":
      return <fieldset className="wf-group" style={style}><legend>{label}</legend>{children.map((child) => <WinControl key={child.name} control={child} />)}</fieldset>;
    case "Panel":
    case "FlowLayoutPanel":
    case "TableLayoutPanel":
    case "TabPage":
    case "ToolStripContainer":
      return <div className="wf-panel" style={style}>{children.map((child) => <WinControl key={child.name} control={child} />)}</div>;
    case "TabControl":
      return <div className="wf-tab" style={style}>{children.map((child) => <WinControl key={child.name} control={child} />)}</div>;
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
      return <select className="wf-strip-combo"><option>{label || control.name}</option></select>;
    case "ToolStripTextBox":
      return <input className="wf-strip-input" defaultValue={label} aria-label={control.name} />;
    case "ToolStripProgressBar":
      return <progress className="wf-strip-progress" />;
    case "ListBox":
    case "CheckedListBox":
    case "ListView":
    case "TreeView":
      return <div className="wf-list" style={style}>{label || control.name}</div>;
    case "LinkLabel":
      return <a className="wf-label wf-link" style={style}>{label || control.name}</a>;
    case "HScrollBar":
    case "VScrollBar":
      return <div className={"wf-scrollbar " + (control.kind === "VScrollBar" ? "vertical" : "horizontal")} style={style} />;
    case "TrackBar":
      return <input className="wf-trackbar" style={style} type="range" />;
    case "ProgressBar":
      return <progress className="wf-progress" style={style} />;
    case "PictureBox":
      return <div className="wf-picture" style={style}>{control.name}</div>;
    case "PrintPreviewControl":
      return <div className="wf-print-preview" style={style}><span>{label || "Print preview"}</span></div>;
    default:
      return <div className="wf-unknown" style={style}>{control.kind}: {control.name}</div>;
  }
}

function WinDataGridView({ control, style }: { control: VisualControl; style: CSSProperties }) {
  const columns = control.columns && control.columns.length > 0
    ? control.columns
    : [{ name: "placeholder", headerText: control.name, kind: "DataGridViewTextBoxColumn" }];
  return (
    <div className="wf-grid" style={style}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.name} style={{ width: column.width }}>{column.headerText || column.name}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{columns.map((column) => <td key={column.name}>&nbsp;</td>)}</tr>
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

function eventTitle(control: VisualControl) {
  const events = control.events ?? [];
  return events.length ? events.map((event) => event.handler).join(", ") : undefined;
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
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

.preview-sidebar {
  padding: 24px;
  border-right: 1px solid #c7c7c7;
  background: #f7f7f7;
}

.preview-sidebar h1 {
  font-size: 18px;
  margin: 0 0 8px;
}

.preview-sidebar p {
  margin: 0;
  color: #555;
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

.wf-link {
  color: #0066cc;
  text-decoration: underline;
}

.wf-print-preview {
  display: grid;
  place-items: center;
  background:
    linear-gradient(90deg, transparent 31px, #e9e9e9 32px),
    linear-gradient(transparent 31px, #e9e9e9 32px),
    #f8f8f8;
  background-size: 32px 32px;
  color: #555;
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

.wf-unknown {
  border-style: dashed;
  color: #7a3300;
  background: #fff5e8;
}
`;
}
