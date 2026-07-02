import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MigrationReport, VisualControl, VisualForm } from "../ir/types.js";

export type GenerateStaticHtmlInput = {
  outDir: string;
  forms: VisualForm[];
  report: MigrationReport;
};

export async function generateStaticHtmlProject(input: GenerateStaticHtmlInput): Promise<void> {
  await mkdir(input.outDir, { recursive: true });
  await mkdir(join(input.outDir, "forms"), { recursive: true });

  for (const form of input.forms) {
    const fileName = safeFileName(form.name) + ".html";
    await writeFile(join(input.outDir, "forms", fileName), generateFormHtml(form), "utf8");
  }

  await writeFile(join(input.outDir, "migration-report.json"), JSON.stringify(input.report, null, 2) + "\n", "utf8");
  await writeFile(join(input.outDir, "index.html"), generateIndexHtml(input.forms, input.report), "utf8");
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function generateIndexHtml(forms: VisualForm[], report: MigrationReport): string {
  const formLinks = forms.map((f) => {
    const file = safeFileName(f.name) + ".html";
    const title = escapeHtml(f.text ?? f.name);
    return `    <li><a href="forms/${file}">${title}</a> <small>${f.sourcePath.split("/").pop()}</small></li>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WinForms Static Preview</title>
  <style>
    ${INDEX_CSS}
  </style>
</head>
<body>
  <main class="shell">
    <aside class="sidebar">
      <h1>WinForms Preview</h1>
      <p>${forms.length} forms &middot; ${report.controlCoverage.supportedPercent}% supported</p>
      <ul class="form-list">
${formLinks}
      </ul>
    </aside>
    <section class="content">
      <p>Select a form from the sidebar to preview.</p>
    </section>
  </main>
</body>
</html>`;
}

function generateFormHtml(form: VisualForm): string {
  const width = form.clientSize?.width ?? 900;
  const height = form.clientSize?.height ?? 640;
  const surfaceHtml = renderSurface(form.controls, { width, height });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(form.text ?? form.name)}</title>
  <style>
    ${FORM_CSS}
  </style>
</head>
<body>
  <main class="preview-shell">
    <aside class="preview-sidebar">
      <h1>${escapeHtml(form.text ?? form.name)}</h1>
      <nav>${escapeHtml(form.sourcePath ?? "")}</nav>
      <p>${form.support.controlsConverted} controls</p>
    </aside>
    <section class="preview-content">
      <article class="wf-window" style="width:${width}px;min-height:${height + 34}px">
        <header class="wf-titlebar">${escapeHtml(form.text ?? form.name)}</header>
        <div class="wf-form-surface" style="width:${width}px;height:${height}px">
          ${surfaceHtml}
        </div>
      </article>
    </section>
  </main>
  <script crossorigin src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@19/umd/react-dom.client.production.min.js"></script>
  <script>
    ${RUNTIME_JS}
    bootForm(${JSON.stringify(form.name)}, ${generateFormJs(form.controls, { width, height })});
  </script>
</body>
</html>`;
}

// ---- Rendering ----

type SurfaceContext = { width: number; height: number; depth?: number };

function renderSurface(controls: VisualControl[], ctx: SurfaceContext): string {
  return controls.map((c) => renderControl(c, ctx)).join("\n");
}

function renderControl(control: VisualControl, ctx: SurfaceContext): string {
  const style = boundsStyle(control, ctx);
  const kind = control.kind;
  const label = escapeHtml(control.text ?? control.name);
  const children = control.children ?? [];

  if (kind === "Panel" || kind === "TabPage" || kind === "UserControl" || kind === "ToolStripContainer") {
    return `<div class="wf-panel" style="${style}">${renderSurface(children, ctx)}</div>`;
  }
  if (kind === "GroupBox") {
    return `<fieldset class="wf-group" style="${style}"><legend>${label}</legend>${renderSurface(children, ctx)}</fieldset>`;
  }
  if (kind === "TableLayoutPanel") {
    return `<div class="wf-tlp" style="${style}">${renderSurface(children, ctx)}</div>`;
  }
  if (kind === "FlowLayoutPanel") {
    return `<div class="wf-flow-panel" style="${style}">${renderSurface(children, ctx)}</div>`;
  }
  if (kind === "SplitContainer") {
    const p1Names = new Set(control.panel1Children ?? []);
    const p2Names = new Set(control.panel2Children ?? []);
    const p1 = children.filter((c) => p1Names.has(c.name));
    const p2 = children.filter((c) => p2Names.has(c.name));
    const horizontal = (control.orientation ?? "Vertical") === "Horizontal";
    const dist = control.splitterDistance ?? 0;
    const splitStyle = horizontal
      ? `flex-direction:column;${dist ? "height:" + dist + "px" : ""}`
      : `flex-direction:row;${dist ? "width:" + dist + "px;flex:0 0 auto" : "flex:1"}`;
    return `<div class="wf-split" style="${style}">
      <div class="wf-split-panel" style="${splitStyle}">${renderSurface(p1, ctx)}</div>
      <div class="wf-splitter-bar"></div>
      <div class="wf-split-panel" style="flex:1">${renderSurface(p2, ctx)}</div>
    </div>`;
  }
  if (kind === "TabControl") {
    const pages = children.filter((c) => c.kind === "TabPage" || c.kind === "UserControl");
    return `<div class="wf-tab" style="${style}">
      <div class="wf-tab-headers">${pages.map((p, i) => `<span class="wf-tab-header${i === 0 ? " active" : ""}">${escapeHtml(p.text ?? p.name)}</span>`).join("")}</div>
      ${pages.map((p, i) => `<div class="wf-tab-page${i === 0 ? "" : " hidden"}" style="position:relative">${renderSurface(p.children ?? [], ctx)}</div>`).join("")}
    </div>`;
  }
  if (kind === "DataGridView") {
    const cols = (control.columns ?? []) as Array<{ name: string; headerText?: string; width?: number }>;
    const headers = cols.length ? cols : [{ name: "placeholder", headerText: control.name, width: undefined }];
    return `<div class="wf-grid" style="${style}">
      <table><thead><tr>${headers.map((c) => `<th style="width:${escapeHtml(String(c.width ?? "auto"))}">${escapeHtml(c.headerText ?? c.name)}</th>`).join("")}</tr></thead>
      <tbody>${[0, 1, 2].map(() => `<tr>${headers.map(() => "<td>&nbsp;</td>").join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
  }
  if (kind === "MenuStrip" || kind === "ToolStrip" || kind === "BindingNavigator" || kind === "StatusStrip") {
    return `<div class="wf-strip wf-strip-${kind.toLowerCase()}" style="${style}">${children.map((child) => `<button class="wf-strip-button" title="${escapeHtml(child.text ?? child.name)}">${escapeHtml(child.text ?? child.name)}</button>`).join(" ")}</div>`;
  }
  if (kind === "Label" || kind === "LinkLabel") {
    return `<span class="wf-label${kind === "LinkLabel" ? " wf-link" : ""}" style="${style}">${label}</span>`;
  }
  if (kind === "TextBox" || kind === "MaskedTextBox") {
    return `<input class="wf-input" style="${style}" value="${label}" readonly>`;
  }
  if (kind === "RichTextBox") {
    return `<textarea class="wf-input wf-textarea" style="${style}" readonly>${label}</textarea>`;
  }
  if (kind === "Button") {
    return `<button class="wf-button" style="${style}" title="${handlerTitle(control)}">${label}</button>`;
  }
  if (kind === "ComboBox" || kind === "DomainUpDown") {
    const options = control.items ?? [label];
    return `<select class="wf-select" style="${style}">${options.map((o) => `<option>${escapeHtml(o)}</option>`).join("")}</select>`;
  }
  if (kind === "CheckBox") {
    return `<label class="wf-check" style="${style}"><input type="checkbox" ${control.appearance?.checked ? "checked" : ""}> <span>${label}</span></label>`;
  }
  if (kind === "RadioButton") {
    return `<label class="wf-check" style="${style}"><input type="radio"> <span>${label}</span></label>`;
  }
  if (kind === "TreeView") {
    const childrenMap = control.treeNodeChildren ?? {};
    const roots = control.treeRootNodes ?? control.items ?? [];
    function renderNode(name: string, depth: number): string {
      const text = name;
      const kids = childrenMap[name] ?? [];
      return `<div class="wf-tree-branch" style="margin-left:${depth * 16}px">
        <div class="wf-tree-node">${kids.length > 0 ? "<span class=wf-tree-toggle>▾</span>" : ""}${escapeHtml(text)}</div>
        ${kids.map((kid) => renderNode(kid, depth + 1)).join("")}
      </div>`;
    }
    return `<div class="wf-list wf-tree" style="${style}">${roots.map((r) => renderNode(r, 0)).join("")}</div>`;
  }
  if (kind === "ListBox" || kind === "ListView") {
    const items = control.items ?? [];
    return `<div class="wf-list" style="${style}">${items.map((item) => `<div class="wf-list-item">${escapeHtml(item)}</div>`).join("")}</div>`;
  }
  if (kind === "CheckedListBox") {
    const items = control.items ?? [];
    return `<div class="wf-list" style="${style}">${items.map((item) => `<label class="wf-list-item wf-list-check"><input type="checkbox"> ${escapeHtml(item)}</label>`).join("")}</div>`;
  }
  if (kind === "HScrollBar" || kind === "VScrollBar") {
    return `<div class="wf-scrollbar ${kind === "VScrollBar" ? "vertical" : "horizontal"}" style="${style}"></div>`;
  }
  if (kind === "TrackBar") {
    return `<input class="wf-trackbar" style="${style}" type="range">`;
  }
  if (kind === "ProgressBar") {
    const v = typeof control.appearance?.value === "number" ? control.appearance.value : 0;
    const max = control.appearance?.maximum ?? 100;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    return `<div class="wf-progress" style="${style}"><div class="wf-progress-bar" style="width:${pct}%"></div></div>`;
  }
  if (kind === "PictureBox") {
    return `<div class="wf-picture" style="${style}">${label}</div>`;
  }
  if (kind === "DateTimePicker" || kind === "MonthCalendar") {
    return `<input class="wf-input wf-date-picker" style="${style}" readonly>`;
  }
  if (kind === "NumericUpDown" || kind === "DomainUpDown") {
    return `<input class="wf-input wf-numeric" style="${style}" type="number"${control.appearance?.minimum != null ? ` min="${control.appearance.minimum}"` : ""}${control.appearance?.maximum != null ? ` max="${control.appearance.maximum}"` : ""}>`;
  }
  if (kind === "PrintPreviewControl") {
    return `<div class="wf-print-preview" style="${style}"><span>${label || "Print preview"}</span></div>`;
  }
  if (kind === "PropertyGrid" || kind === "Chart" || kind === "WebBrowser") {
    return `<div class="wf-unknown wf-degraded" style="${style}"><span>${kind}</span><small>${kind.toLowerCase()} (degraded)</small></div>`;
  }
  const orig = (control.properties?.originalKind as string) || "";
  return `<div class="wf-custom-ctrl" style="${style}" title="${orig ? escapeHtml(orig) + " → " : ""}${kind}">
    <strong>${escapeHtml(kind)}</strong>
  </div>`;
}

function boundsStyle(control: VisualControl, ctx: SurfaceContext): string {
  const bounds = control.bounds ?? { x: 0, y: 0, width: 100, height: 24 };
  return `position:absolute;left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px`;
}

function handlerTitle(control: VisualControl): string {
  const events = control.events ?? [];
  return events.length ? events.map((e) => e.handler).join(", ") : "";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateFormJs(controls: VisualControl[], ctx: SurfaceContext): string {
  // For single-file HTML, we use DOM directly - no React needed for static preview
  // This is a no-op; the HTML is static-rendered
  return "{}";
}

// ---- Shared CSS ----

const INDEX_CSS = `
:root { font-family: "Segoe UI", -apple-system, sans-serif; color: #111; background: #f5f5f5; }
body { margin: 0; }
.shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.sidebar { padding: 20px; border-right: 1px solid #ddd; background: #fafafa; max-height: 100vh; overflow: auto; }
.sidebar h1 { font-size: 16px; margin: 0 0 8px; }
.sidebar p { margin: 0 0 12px; color: #666; font-size: 13px; }
.sidebar ul { padding-left: 18px; }
.sidebar li { margin-bottom: 6px; font-size: 13px; }
.sidebar small { color: #888; font-size: 11px; }
.content { padding: 24px; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
`;

const FORM_CSS = `
:root { font-family: "Segoe UI", -apple-system, sans-serif; color: #111; background: #f5f5f5; }
body { margin: 0; }
.preview-shell { display: flex; min-height: 100vh; }
.preview-sidebar { width: 240px; padding: 20px; border-right: 1px solid #ddd; background: #fafafa; flex-shrink: 0; }
.preview-sidebar h1 { font-size: 16px; margin: 0 0 8px; }
.preview-sidebar nav { font-size: 11px; color: #888; word-break: break-all; margin-bottom: 8px; }
.preview-content { flex: 1; padding: 24px; overflow: auto; }
.wf-window { display: inline-block; border: 1px solid #7f7f7f; background: #f0f0f0; box-shadow: 0 12px 32px rgba(0,0,0,0.18); }
.wf-titlebar { height: 33px; line-height: 33px; padding: 0 10px; background: linear-gradient(#ffffff, #d9e8fb); border-bottom: 1px solid #9caec4; font-size: 13px; }
.wf-form-surface { position: relative; background: #f0f0f0; overflow: hidden; }
.wf-label { font-size: 12px; }
.wf-input, .wf-select { box-sizing: border-box; border: 1px solid #7a7a7a; background: white; font: inherit; font-size: 12px; padding: 2px 3px; }
.wf-textarea { resize: vertical; }
.wf-button { border: 1px solid #707070; border-radius: 2px; background: linear-gradient(#ffffff, #e5e5e5); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 8px; }
.wf-check { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.wf-panel, .wf-tlp, .wf-flow-panel { box-sizing: border-box; border: 1px solid #b8b8b8; background: #f0f0f0; }
.wf-flow-panel { display: flex; flex-wrap: wrap; gap: 4px; }
.wf-group { border: 1px solid #aaa; padding: 14px 8px 8px; margin: 0; box-sizing: border-box; }
.wf-group legend { padding: 0 4px; font-size: 12px; }
.wf-tab { border: 1px solid #b8b8b8; background: #f0f0f0; }
.wf-tab-headers { display: flex; border-bottom: 1px solid #b8b8b8; padding: 2px 2px 0; background: #e8e8e8; }
.wf-tab-header { padding: 4px 10px; font-size: 12px; cursor: pointer; border: 1px solid transparent; }
.wf-tab-header.active { background: #fff; border-color: #b8b8b8; border-bottom-color: #fff; margin-bottom: -1px; }
.wf-grid { border: 1px solid #9a9a9a; background: white; overflow: hidden; }
.wf-grid table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
.wf-grid th { height: 21px; border-right: 1px solid #b5b5b5; border-bottom: 1px solid #a0a0a0; background: linear-gradient(#f8f8f8, #dfdfdf); padding: 0 4px; }
.wf-grid td { height: 20px; border-right: 1px solid #ddd; border-bottom: 1px solid #eee; padding: 0 4px; }
.wf-tab-page.hidden { display: none; }
.wf-tree-toggle { display: inline-block; width: 12px; font-size: 9px; }
.wf-list { border: 1px solid #999; background: white; overflow: auto; }
.wf-list-item { min-height: 18px; line-height: 18px; padding: 2px 4px; font-size: 12px; border-bottom: 1px solid #eee; }
.wf-split { display: flex; border: 1px solid #b8b8b8; }
.wf-split-panel { overflow: auto; }
.wf-splitter-bar { width: 4px; background: linear-gradient(#f4f4f4, #dcdcdc); border: 1px solid #a0a0a0; flex-shrink: 0; cursor: col-resize; }
.wf-progress { border: 1px solid #7a7a7a; background: #f0f0f0; overflow: hidden; }
.wf-progress-bar { height: 100%; background: linear-gradient(#3a8de6, #1f6fc4); }
.wf-strip { box-sizing: border-box; border: 1px solid #b8b8b8; background: linear-gradient(#fafafa, #e5e5e5); font-size: 12px; padding: 3px 6px; }
.wf-strip-button { border: 1px solid transparent; background: transparent; padding: 2px 6px; cursor: pointer; }
.wf-link { color: #0066cc; text-decoration: underline; }
.wf-unknown, .wf-degraded { box-sizing: border-box; border: 1px dashed #888; background: #fff5e8; color: #7a3300; display: grid; place-items: center; gap: 2px; }
.wf-degraded small, .wf-custom-ctrl small { color: #888; font-size: 10px; }
.wf-custom-ctrl { display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dotted #999; background: #f8f8f8; color: #555; font-size: 11px; }
.wf-print-preview { display: grid; place-items: center; background: repeating-linear-gradient(90deg, transparent 31px, #e9e9e9 32px), repeating-linear-gradient(transparent 31px, #e9e9e9 32px), #f8f8f8; }
`;

const RUNTIME_JS = `
  // Minimal runtime for static HTML forms - no React needed
  // The forms are CSS-styled static HTML; interactions are minimal
  document.addEventListener('click', function(e) {
    if (e.target.classList && e.target.classList.contains('wf-button')) {
      // Visual feedback for button clicks
      e.target.style.background = '#dcebff';
      setTimeout(function() { e.target.style.background = ''; }, 200);
    }
    if (e.target.classList && e.target.classList.contains('wf-tab-header')) {
      var headers = e.target.parentElement.querySelectorAll('.wf-tab-header');
      headers.forEach(function(h) { h.classList.remove('active'); });
      e.target.classList.add('active');
      var pages = e.target.closest('.wf-tab').querySelectorAll('.wf-tab-page');
      pages.forEach(function(p, i) { pages[i].classList.toggle('active') === false ? pages[i].classList.add('hidden') : pages[i].classList.remove('hidden'); });
      pages.forEach(function(p, i) {
        var idx = Array.from(e.target.parentElement.children).indexOf(e.target);
        p.classList.toggle('hidden', i !== idx);
        p.classList.toggle('active', i === idx);
      });
    }
  });
  function bootForm(name, config) { /* placeholder */ }
`;