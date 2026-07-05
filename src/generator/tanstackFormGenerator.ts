import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MigrationReport, VisualAppearance, VisualControl, VisualForm } from "../ir/types.js";

/**
 * @deprecated 冻结,不再开发。
 *
 * 迁移策略已改为 B 方案:React Custom 生成完整的视觉+结构骨架,
 * 事件/数据/导航作为"待接后端"的占位标注,人工对照 code-behind 填实现。
 * 前端是一等公民,充当后端迁移的契约骨架。
 *
 * TanStack Form 路径只覆盖输入型控件、校验是从控件几何猜出来的、
 * 提交是 mock,与上述策略方向相悖。保留仅为存档,勿在此基础上继续开发。
 */

export type GenerateTanStackFormInput = {
  outDir: string;
  forms: VisualForm[];
  report: MigrationReport;
};

export async function generateTanStackFormProject(input: GenerateTanStackFormInput): Promise<void> {
  await mkdir(input.outDir, { recursive: true });
  await mkdir(join(input.outDir, "src"), { recursive: true });
  await mkdir(join(input.outDir, "src", "lib"), { recursive: true });
  await mkdir(join(input.outDir, "src", "forms"), { recursive: true });
  await mkdir(join(input.outDir, "forms"), { recursive: true });

  const formFiles: string[] = [];

  for (const form of input.forms) {
    const fileName = safeFileName(form.name) + ".tsx";
    const filePath = join("src", "forms", fileName);
    await writeFile(join(input.outDir, filePath), generateFormComponent(form), "utf8");
    formFiles.push(`./forms/${fileName}`);
    await writeFile(join(input.outDir, "forms", safeFileName(form.name) + ".json"), JSON.stringify(form, null, 2) + "\n", "utf8");
  }

  await writeFile(join(input.outDir, "migration-report.json"), JSON.stringify(input.report, null, 2) + "\n", "utf8");
  await writeFile(join(input.outDir, "package.json"), packageJson(), "utf8");
  await writeFile(join(input.outDir, "index.html"), indexHtml(), "utf8");
  await writeFile(join(input.outDir, "tsconfig.json"), tsconfigJson(), "utf8");
  await writeFile(join(input.outDir, "vite.config.ts"), viteConfig(), "utf8");
  await writeFile(join(input.outDir, "src", "main.tsx"), mainTsx(), "utf8");
  await writeFile(join(input.outDir, "src", "App.tsx"), appTsx(input.forms), "utf8");
  await writeFile(join(input.outDir, "src", "styles.css"), stylesCss(), "utf8");
  await writeFile(join(input.outDir, "src", "lib", "formFields.tsx"), formFieldsTsx(), "utf8");
  await writeFile(join(input.outDir, "src", "lib", "useZodForm.ts"), useZodFormTs(), "utf8");
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "Form";
}

// ---- Field extraction ----

type FieldType = "string" | "number" | "boolean" | "date" | "select";

type FormField = {
  name: string;
  label: string;
  type: FieldType;
  defaultValue?: string | number | boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  increment?: number;
  options?: string[];
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  passwordChar?: string;
  tabIndex?: number;
  changeHandler?: string;
};

function isInputControl(kind: string): boolean {
  return kind === "TextBox" || kind === "MaskedTextBox" || kind === "RichTextBox"
    || kind === "CheckBox" || kind === "RadioButton"
    || kind === "ComboBox" || kind === "DomainUpDown" || kind === "ListBox" || kind === "CheckedListBox"
    || kind === "NumericUpDown" || kind === "DateTimePicker" || kind === "MonthCalendar"
    || kind === "TrackBar";
}

// Sanitize a WinForms control name into a valid JS identifier for use as
// a zod schema key and form field name. Strips leading underscores and
// replaces non-identifier characters.
let fieldNameCounter = 0;
const fieldNameMap = new Map<string, string>();
function sanitizeFieldName(original: string): string {
  const cached = fieldNameMap.get(original);
  if (cached) return cached;
  let cleaned = original.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "");
  if (!cleaned) cleaned = "field";
  if (!/^[A-Za-z_]/.test(cleaned)) cleaned = "_" + cleaned;
  // Ensure uniqueness
  let name = cleaned;
  while ([...fieldNameMap.values()].includes(name)) {
    fieldNameCounter += 1;
    name = cleaned + "_" + fieldNameCounter;
  }
  fieldNameMap.set(original, name);
  return name;
}

function extractField(control: VisualControl): FormField | null {
  const a = control.appearance ?? {};
  const kind = control.kind;
  if (!isInputControl(kind)) return null;

  const name = sanitizeFieldName(control.name);
  const label = cleanMnemonic(control.text ?? control.name);

  if (kind === "CheckBox" || kind === "RadioButton") {
    return { name, label, type: "boolean", defaultValue: a.checked ?? false, readOnly: a.readOnly, tabIndex: control.tabIndex };
  }
  if (kind === "NumericUpDown") {
    return {
      name, label, type: "number",
      defaultValue: typeof a.value === "number" ? a.value : undefined,
      minimum: a.minimum, maximum: a.maximum, increment: a.increment, readOnly: a.readOnly, tabIndex: control.tabIndex
    };
  }
  if (kind === "TrackBar") {
    return {
      name, label, type: "number",
      defaultValue: typeof a.value === "number" ? a.value : undefined,
      minimum: a.minimum, maximum: a.maximum, tabIndex: control.tabIndex
    };
  }
  if (kind === "DateTimePicker" || kind === "MonthCalendar") {
    return { name, label, type: "date", defaultValue: typeof a.value === "string" ? a.value : undefined, tabIndex: control.tabIndex };
  }
  if (kind === "ComboBox" || kind === "DomainUpDown" || kind === "ListBox" || kind === "CheckedListBox") {
    return {
      name, label, type: "select",
      options: control.items ?? [],
      readOnly: a.readOnly, tabIndex: control.tabIndex
    };
  }
  // TextBox / MaskedTextBox / RichTextBox
  return {
    name, label, type: "string",
    defaultValue: control.text ?? "",
    maxLength: a.maxLength, multiline: a.multiline, readOnly: a.readOnly,
    passwordChar: a.passwordChar, placeholder: a.mask ? maskToPlaceholder(a.mask) : undefined,
    tabIndex: control.tabIndex
  };
}

function maskToPlaceholder(mask: string): string {
  return mask.replace(/0/g, "_").replace(/9/g, "_").replace(/[LA#?&><]/g, "_");
}

function collectFields(control: VisualControl, fields: FormField[]): void {
  const field = extractField(control);
  if (field) fields.push(field);
  for (const child of control.children ?? []) collectFields(child, fields);
}

// Collect fields and associate nearby Labels as field labels. In WinForms,
// a Label control positioned just above or to the left of an input control
// serves as its caption. We match by proximity within the same parent.
// Track which Label controls have been associated with fields (to avoid
// rendering them twice — once as field label, once as standalone label).
const consumedLabels = new Set<string>();
const buttonHandlers = new Set<string>();

function collectFieldsWithLabels(controls: VisualControl[], fields: FormField[]): void {
  // Process each container level separately so Label-Field association only
  // matches siblings within the same parent (not across container boundaries
  // where relative coordinates are not comparable).
  const siblingLabels = controls.filter((c) => c.kind === "Label" || c.kind === "LinkLabel");
  const siblingFields = controls.filter((c) => isInputControl(c.kind));

  for (const fc of siblingFields) {
    const field = extractField(fc);
    if (!field) continue;
    // Find closest label by position among siblings
    if (fc.bounds && siblingLabels.length > 0) {
      let bestLabel: string | undefined;
      let bestDist = Infinity;
      for (const label of siblingLabels) {
        if (!label.bounds) continue;
        if (consumedLabels.has(label.name)) continue; // already used by another field
        // Label should be above or to the left, with similar y
        const dy = Math.abs(label.bounds.y - fc.bounds.y);
        const dx = label.bounds.x - fc.bounds.x;
        if (dy < 30 && dx <= 5) {
          const dist = dy + Math.abs(dx);
          if (dist < bestDist) {
            bestDist = dist;
            const labelText = label.text ?? "";
            if (labelText) {
              bestLabel = cleanMnemonic(labelText);
            } else if (label.name.startsWith("lbl")) {
              bestLabel = label.name.slice(3);
            } else {
              bestLabel = label.name;
            }
          }
        }
      }
      if (bestLabel) {
        field.label = bestLabel;
        // Mark the closest label as consumed
        for (const label of siblingLabels) {
          if (label.text === bestLabel && label.bounds) {
            const dy = Math.abs(label.bounds.y - fc.bounds!.y);
            const dx = label.bounds.x - fc.bounds!.x;
            if (dy < 30 && dx <= 5) { consumedLabels.add(label.name); break; }
          }
        }
      }
    }
    // Extract change handler from events (TextChanged/SelectedIndexChanged/ValueChanged)
    const changeEvent = fc.events?.find((e) =>
      e.event === "TextChanged" || e.event === "SelectedIndexChanged" || e.event === "ValueChanged"
    );
    if (changeEvent) {
      field.changeHandler = changeEvent.handler;
      buttonHandlers.add(changeEvent.handler);
    }
    fields.push(field);
  }

  // Recurse into child containers
  for (const control of controls) {
    if (control.children && control.children.length > 0) {
      collectFieldsWithLabels(control.children, fields);
    }
  }
}

// ---- Zod schema generation ----

function generateZodSchema(fields: FormField[]): string {
  if (fields.length === 0) return "z.object({})";
  const lines = fields.map((f) => {
    let line = `  ${f.name}: `;
    if (f.type === "boolean") {
      line += "z.boolean()";
    } else if (f.type === "number") {
      line += "z.number()";
      if (f.minimum != null) line += `.min(${f.minimum})`;
      if (f.maximum != null) line += `.max(${f.maximum})`;
    } else if (f.type === "date") {
      line += "z.string()";
    } else if (f.type === "select") {
      if (f.options && f.options.length > 0) {
        const opts = f.options.map((o) => `"${o.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, " ")}"`).join(", ");
        line += `z.enum([${opts}])`;
      } else {
        line += "z.string()";
      }
    } else {
      line += "z.string()";
      if (f.maxLength != null) line += `.max(${f.maxLength})`;
      else if (!f.multiline) line += `.min(1)`;
    }
    line += ",";
    return line;
  });
  return `z.object({\n${lines.join("\n")}\n})`;
}

// ---- Form component generation ----

function generateFormComponent(form: VisualForm): string {
  fieldNameMap.clear();
  fieldNameCounter = 0;
  consumedLabels.clear();
  buttonHandlers.clear();
  const fields: FormField[] = [];
  collectFieldsWithLabels(form.controls, fields);

  const componentName = form.name.replace(/[^A-Za-z0-9]/g, "");
  const schemaName = componentName + "Schema";
  const defaultValues = generateDefaultValues(fields);
  const zodSchema = generateZodSchema(fields);
  const fieldRenders = fields.map((f) => generateFieldRender(f)).join("\n");
  // Build a map from original control name to field for layout rendering
  const fieldByControlName = new Map<string, FormField>();
  // Re-collect with original names for matching
  for (const c of form.controls) {
    function collectForMap(ctrl: VisualControl) {
      if (isInputControl(ctrl.kind)) {
        const f = fields.find((ff) => ff.name === sanitizeFieldName(ctrl.name));
        if (f) fieldByControlName.set(ctrl.name, f);
      }
      (ctrl.children ?? []).forEach(collectForMap);
    }
    collectForMap(c);
  }
  const layoutRender = generateLayoutRender(form.controls, fieldByControlName);
  const handlerStubs = [...buttonHandlers].map((h) => `  // TODO: migrate ${h} from WinForms\n  function ${h}() { /* stub */ }`).join("\n");
  const handlersBlock = handlerStubs ? "\n" + handlerStubs + "\n" : "";

  return `import { useState } from "react";
import { z } from "zod";
import { useZodForm } from "../lib/useZodForm";
import { TextField, NumberField, SelectField, DateField, BooleanField } from "../lib/formFields";

const ${schemaName} = ${zodSchema};

type ${componentName}Values = z.infer<typeof ${schemaName}>;

const defaultValues: ${componentName}Values = ${defaultValues};

export default function ${componentName}() {${handlersBlock}
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitMsg, setSubmitMsg] = useState("");
  const form = useZodForm({
    defaultValues,
    schema: ${schemaName},
    onSubmit: async ({ value }) => {
      setSubmitState("submitting");
      setSubmitMsg("");
      // Simulated API call — replace with real fetch/axios
      await new Promise((r) => setTimeout(r, 600));
      setSubmitState("success");
      setSubmitMsg("Form submitted successfully (mock)");
    }
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}
      className="wf-form"
    >
      <h2>${escapeJsx(form.text ?? form.name)}</h2>
${layoutRender}
      <div className="wf-form-actions">
        <button type="submit" disabled={submitState === "submitting"}>
          {submitState === "submitting" ? "Submitting..." : "OK"}
        </button>
        <button type="button" onClick={() => { form.reset(); setSubmitState("idle"); setSubmitMsg(""); }}>Reset</button>
      </div>
      {submitMsg && (
        <div className={"wf-form-toast wf-form-toast-" + submitState}>{submitMsg}</div>
      )}
    </form>
  );
}
`;
}

function generateDefaultValues(fields: FormField[]): string {
  if (fields.length === 0) return "{}";
  const entries = fields.map((f) => {
    const v = f.defaultValue;
    if (f.type === "boolean") return `  ${f.name}: ${v ?? false}`;
    if (f.type === "number") return `  ${f.name}: ${v ?? 0}`;
    if (f.type === "select") return `  ${f.name}: ${v != null ? `"${v}"` : `"${f.options?.[0] ?? ""}"`}`;
    return `  ${f.name}: "${(v ?? "").toString().replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
  });
  return `{\n${entries.join(",\n")}\n}`;
}

function generateFieldRender(f: FormField): string {
  const afterChange = f.changeHandler ? `; ${f.changeHandler}()` : "";
  const labelAttr = `label="${escapeJsx(f.label)}"`;
  if (f.type === "boolean") {
    return `      <form.Field name="${f.name}">
        {(field) => <BooleanField field={field} label={${JSON.stringify(f.label)}} />}
      </form.Field>`;
  }
  if (f.type === "select") {
    return `      <form.Field name="${f.name}">
        {(field) => <SelectField field={field} label=${JSON.stringify(f.label)} options={${JSON.stringify([])}} />}
      </form.Field>`;
  }
  if (f.type === "number") {
    return `      <form.Field name="${f.name}">
        {(field) => (
          <div className="wf-field">
            <label>${escapeJsx(f.label)}</label>
            <input
              type="number"
              style={field.state.meta.hasErrors ? { borderColor: "#d32f2f" } : undefined}
              value={field.state.value}
              onChange={(e) => field.handleChange(Number(e.target.value))}
              onBlur={field.handleBlur}
              ${f.minimum != null ? `min={${f.minimum}}` : ""}
              ${f.maximum != null ? `max={${f.maximum}}` : ""}
              ${f.increment != null ? `step={${f.increment}}` : ""}
            />
          </div>
        )}
      </form.Field>`;
  }
  if (f.type === "date") {
    return `      <form.Field name="${f.name}">
        {(field) => (
          <div className="wf-field">
            <label>${escapeJsx(f.label)}</label>
            <input
              type="date"
              style={field.state.meta.hasErrors ? { borderColor: "#d32f2f" } : undefined}
              value={field.state.value ?? ""}
              onChange={(e) => { field.handleChange(e.target.value)${afterChange}; }}
              onBlur={field.handleBlur}
            />
          </div>
        )}
      </form.Field>`;
  }
  // string
  const inputType = f.passwordChar ? "password" : "text";
  if (f.multiline) {
    return `      <form.Field name="${f.name}">
        {(field) => (
          <div className="wf-field">
            <label>${escapeJsx(f.label)}</label>
            <textarea
              style={field.state.meta.hasErrors ? { borderColor: "#d32f2f" } : undefined}
              value={field.state.value}
              onChange={(e) => { field.handleChange(e.target.value)${afterChange}; }}
              onBlur={field.handleBlur}
              ${f.maxLength != null ? `maxLength={${f.maxLength}}` : ""}
              ${f.readOnly ? "readOnly" : ""}
            />
          </div>
        )}
      </form.Field>`;
  }
  return `      <form.Field name="${f.name}">
        {(field) => (
          <div className="wf-field">
            <label>${escapeJsx(f.label)}</label>
            <input
              type="${inputType}"
              style={field.state.meta.hasErrors ? { borderColor: "#d32f2f" } : undefined}
              value={field.state.value}
              onChange={(e) => { field.handleChange(e.target.value)${afterChange}; }}
              onBlur={field.handleBlur}
              ${f.maxLength != null ? `maxLength={${f.maxLength}}` : ""}
              ${f.placeholder ? `placeholder="${escapeJsx(f.placeholder)}"` : ""}
              ${f.readOnly ? "readOnly" : ""}
            />
          </div>
        )}
      </form.Field>`;
}

// ---- Layout rendering (non-field controls as containers) ----

function generateLayoutRender(controls: VisualControl[], fieldMap: Map<string, FormField>, indent = "      "): string {
  const blocks: string[] = [];
  for (const control of controls) {
    const field = fieldMap.get(control.name);
    if (field) {
      blocks.push(generateFieldRender(field));
      continue;
    }
    if (consumedLabels.has(control.name)) continue;
    const block = generateContainerBlock(control, fieldMap, indent);
    if (block) blocks.push(block);
  }
  return blocks.join("\n");
}

function generateContainerBlock(control: VisualControl, fieldMap: Map<string, FormField>, indent: string): string | null {
  const kind = control.kind;
  const label = escapeJsx(cleanMnemonic(control.text ?? control.name));
  const children = control.children ?? [];
  const childBlocks = generateLayoutRender(children, fieldMap, indent + "  ");

  if (kind === "GroupBox") {
    return `${indent}<fieldset className="wf-group">
${indent}  <legend>${label}</legend>
${childBlocks}
${indent}</fieldset>`;
  }
  if (kind === "TabControl") {
    const tabs = children.filter((c) => c.kind === "TabPage" || c.kind === "UserControl");
    const tabHeaders = tabs.map((t, i) => `${indent}    <span className=${i === 0 ? '"wf-tab-header active"' : '"wf-tab-header"'}>${escapeJsx(t.text ?? t.name)}</span>`).join("\n");
    const firstPage = tabs[0];
    const pageContent = firstPage ? generateLayoutRender(firstPage.children ?? [], fieldMap, indent + "      ") : "";
    return `${indent}<div className="wf-tabcontrol">
${indent}  <div className="wf-tab-strip">
${tabHeaders}
${indent}  </div>
${indent}  <div className="wf-tab-content">
${pageContent}
${indent}  </div>
${indent}</div>`;
  }
  if (kind === "TableLayoutPanel") {
    const cellBlocks = children.map((child) => {
      const cf = fieldMap.get(child.name);
      if (cf) {
        return generateFieldRender(cf);
      }
      return generateContainerBlock(child, fieldMap, indent + "    ") ?? "";
    }).filter(Boolean).join("\n");
    return `${indent}<div className="wf-tlp">
${cellBlocks}
${indent}</div>`;
  }
  if (kind === "FlowLayoutPanel") {
    return `${indent}<div className="wf-flow-panel">
${childBlocks}
${indent}</div>`;
  }
  if (kind === "SplitContainer" || kind === "Panel" || kind === "TabPage" || kind === "UserControl" || kind === "ToolStripContainer") {
    return `${indent}<div className="wf-panel">
${childBlocks}
${indent}</div>`;
  }
  if (kind === "Label") {
    return `${indent}<label className="wf-label">${label}</label>`;
  }
  if (kind === "Button") {
    const handler = control.events?.find((e) => e.event === "Click");
    const onClick = handler ? ` onClick={() => ${handler.handler}()}` : "";
    if (handler) buttonHandlers.add(handler.handler);
    return `${indent}<button type="button" className="wf-button"${onClick}>${label}</button>`;
  }
  if (kind === "LinkLabel") {
    return `${indent}<a className="wf-link" href="#">${label}</a>`;
  }
  // Non-input controls that aren't containers — skip or render as placeholder
  return null;
}

function escapeJsx(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, " ").replace(/\r/g, "");
}

// Strip WinForms mnemonic markers (&X) from display text.
function cleanMnemonic(text: string): string {
  // Strip WinForms mnemonic markers (&X)
  let cleaned = text.replace(/&([A-Za-z0-9])/g, "$1");
  // Strip C# string concatenation artifacts that leak into Text property
  cleaned = cleaned.replace(/"\s*\+\s*"/g, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

// ---- Project scaffold ----

function packageJson(): string {
  return JSON.stringify({
    name: "wf2react-tanstack",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview"
    },
    dependencies: {
      "@tanstack/react-form": "^0.40.0",
      "@tanstack/zod-form-adapter": "^0.40.0",
      "zod": "^3.23.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^6.0.0",
      "typescript": "^5.8.3",
      "vite": "^8.0.0"
    }
  }, null, 2) + "\n";
}

function indexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WinForms → TanStack Form</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function tsconfigJson(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
`;
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
`;
}

function mainTsx(): string {
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

function appTsx(forms: VisualForm[]): string {
  const imports = forms.map((f) => {
    const comp = f.name.replace(/[^A-Za-z0-9]/g, "");
    return `import ${comp} from "./forms/${safeFileName(f.name)}";`;
  }).join("\n");
  const items = forms.map((f, i) => {
    const comp = f.name.replace(/[^A-Za-z0-9]/g, "");
    return `{ id: "form-${i}", name: ${JSON.stringify(f.text ?? f.name)}, component: ${comp} }`;
  }).join(",\n  ");

  return `import { useState, useEffect } from "react";
${imports}

const forms = [
  ${items}
];

function getHashId() {
  const hash = window.location.hash.replace("#", "");
  return forms.find((f) => f.id === hash)?.id ?? forms[0]?.id ?? "";
}

export default function App() {
  const [selectedId, setSelectedId] = useState(getHashId);
  useEffect(() => {
    const onHashChange = () => setSelectedId(getHashId());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const go = (id: string) => { window.location.hash = id; };
  const selected = forms.find((f) => f.id === selectedId) ?? forms[0];
  const SelectedForm = selected?.component;

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <h1>WinForms → React</h1>
        <p>{forms.length} forms</p>
        <nav>
          {forms.map((f) => (
            <button
              key={f.id}
              className={f.id === selectedId ? "active" : ""}
              onClick={() => go(f.id)}
            >
              {f.name}
            </button>
          ))}
        </nav>
      </aside>
      <section className="app-content">
        {SelectedForm ? <SelectedForm key={selectedId} /> : <p>No forms</p>}
      </section>
    </main>
  );
}
`;
}

function stylesCss(): string {
  return `:root {
  font-family: "Segoe UI", -apple-system, sans-serif;
  color: #111;
  background: #f5f5f5;
}
body { margin: 0; }
.app-shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.app-sidebar { padding: 20px; border-right: 1px solid #ddd; background: #fafafa; max-height: 100vh; overflow: auto; }
.app-sidebar h1 { font-size: 16px; margin: 0 0 8px; }
.app-sidebar p { margin: 0 0 12px; color: #666; font-size: 13px; }
.app-sidebar nav { display: grid; gap: 4px; }
.app-sidebar button { text-align: left; border: none; background: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 13px; }
.app-sidebar button:hover { background: #e8e8e8; }
.app-sidebar button.active { background: #dcebff; font-weight: 600; }
.app-content { padding: 24px; overflow: auto; }
.wf-form { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.wf-form h2 { margin: 0 0 8px; font-size: 18px; }
.wf-field { display: flex; flex-direction: column; gap: 4px; }
.wf-field label { font-size: 13px; color: #333; }
.wf-field input, .wf-field select, .wf-field textarea {
  padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font: inherit; font-size: 14px;
}
.wf-field textarea { min-height: 80px; resize: vertical; }
.wf-field-check { display: flex; align-items: center; gap: 6px; flex-direction: row; }
.wf-field-error { color: #d32f2f; font-size: 12px; margin-top: 2px; display: block; }
.wf-form-actions { display: flex; gap: 8px; margin-top: 8px; }
.wf-form-actions button { padding: 6px 16px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font: inherit; }
.wf-form-actions button[type="submit"] { background: #0078d4; color: #fff; border-color: #0078d4; }
.wf-form-result { background: #f0f0f0; padding: 12px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; }

.wf-form-toast {
  padding: 8px 12px;
  border-radius: 4px;
  margin-top: 8px;
  font-size: 13px;
}

.wf-form-toast-success { background: #e6f4ea; color: #1e8e3e; border: 1px solid #34a853; }
.wf-form-toast-error { background: #fce8e6; color: #d93025; border: 1px solid #ea4335; }
.wf-form-toast-submitting { background: #e8f0fe; color: #1a73e8; border: 1px solid #4285f4; }
.wf-group { border: 1px solid #ccc; border-radius: 4px; padding: 12px; margin: 0; }
.wf-group legend { padding: 0 6px; font-size: 13px; font-weight: 600; }
.wf-panel { display: flex; flex-direction: column; gap: 8px; }
.wf-flow-panel { display: flex; flex-wrap: wrap; gap: 8px; }
.wf-tlp { display: grid; gap: 8px; }
.wf-tabcontrol { border: 1px solid #ccc; border-radius: 4px; overflow: hidden; }
.wf-tab-strip { display: flex; gap: 0; background: #e8e8e8; border-bottom: 1px solid #ccc; padding: 4px 4px 0; }
.wf-tab-header { padding: 4px 12px; font-size: 13px; border: 1px solid #ccc; border-bottom: none; background: #e8e8e8; border-radius: 4px 4px 0 0; }
.wf-tab-header.active { background: #fff; border-color: #aaa; }
.wf-tab-content { padding: 12px; }
.wf-label { font-size: 13px; color: #555; }
.wf-button { padding: 6px 16px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font: inherit; }
.wf-link { color: #0066cc; text-decoration: underline; cursor: pointer; }
`;
}
// ---- Shared library modules ----

function formFieldsTsx(): string {
  return `import type { FieldApi } from "@tanstack/react-form";

type FieldProps = {
  field: FieldApi<any, any, any, any>;
  label: string;
  style?: React.CSSProperties;
};

export function TextField({ field, label, style }: FieldProps) {
  return (
    <div className="wf-field">
      <label>{label}</label>
      <input
        style={field.state.meta.hasErrors ? { ...style, borderColor: "#d32f2f" } : style}
        type="text"
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        maxLength={field.fieldMeta?.validator?.lastAutoFocus as any}
      />
      {field.state.meta.hasErrors && <span className="wf-field-error">{field.state.meta.errors[0]}</span>}
    </div>
  );
}

export function NumberField({ field, label, style }: FieldProps) {
  return (
    <div className="wf-field">
      <label>{label}</label>
      <input
        style={field.state.meta.hasErrors ? { ...style, borderColor: "#d32f2f" } : style}
        type="number"
        value={field.state.value}
        onChange={(e) => field.handleChange(Number(e.target.value))}
        onBlur={field.handleBlur}
      />
      {field.state.meta.hasErrors && <span className="wf-field-error">{field.state.meta.errors[0]}</span>}
    </div>
  );
}

export function SelectField({ field, label, options, style }: FieldProps & { options?: string[] }) {
  return (
    <div className="wf-field">
      <label>{label}</label>
      <select
        style={field.state.meta.hasErrors ? { ...style, borderColor: "#d32f2f" } : style}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      >
        {(options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      {field.state.meta.hasErrors && <span className="wf-field-error">{field.state.meta.errors[0]}</span>}
    </div>
  );
}

export function DateField({ field, label, style }: FieldProps) {
  return (
    <div className="wf-field">
      <label>{label}</label>
      <input
        style={field.state.meta.hasErrors ? { ...style, borderColor: "#d32f2f" } : style}
        type="date"
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.hasErrors && <span className="wf-field-error">{field.state.meta.errors[0]}</span>}
    </div>
  );
}

export function BooleanField({ field, label, style }: FieldProps) {
  return (
    <label className="wf-field wf-field-check" style={style}>
      <input
        type="checkbox"
        checked={field.state.value}
        onChange={(e) => field.handleChange(e.target.checked)}
        onBlur={field.handleBlur}
      />
      <span>{label}</span>
      {field.state.meta.hasErrors && <span className="wf-field-error">{field.state.meta.errors[0]}</span>}
    </label>
  );
}
`;
}

function useZodFormTs(): string {
  return `import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import type { z } from "zod";

type UseZodFormOptions<T extends z.ZodObject<any>> = {
  defaultValues: z.infer<T>;
  schema: T;
  onSubmit: (options: { value: z.infer<T> }) => Promise<void> | void;
};

export function useZodForm<T extends z.ZodObject<any>>(options: UseZodFormOptions<T>) {
  return useForm({
    defaultValues: options.defaultValues,
    validatorAdapter: zodValidator,
    validators: { onChange: options.schema },
    onSubmit: options.onSubmit
  });
}
`;
}
