import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateReactProject } from "../src/generator/reactProjectGenerator.js";
import type { VisualForm } from "../src/ir/types.js";

describe("generateReactProject", () => {
  it("writes a standalone Vite React preview with form JSON and compatibility renderer", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-"));
    const form: VisualForm = {
      kind: "Form",
      name: "SampleForm",
      sourcePath: "src/SampleForm.Designer.cs",
      text: "Sample",
      clientSize: { width: 300, height: 200 },
      autoScaleDimensions: { width: 6, height: 13 },
      support: {
        controlsConverted: 1,
        supportedControls: ["Button"],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: {
          total: 1,
          supported: 1,
          degraded: 0,
          unknown: 0,
          supportedPercent: 100,
          previewablePercent: 100,
          unknownPercent: 0,
          byKind: [{ kind: "Button", count: 1, status: "supported" }]
        },
        eventStubs: [{ controlName: "button1", event: "Click", handler: "button1_Click" }],
        contractPoints: []
      },
      controls: [
        {
          kind: "Button",
          name: "button1",
          text: "OK",
          bounds: { x: 20, y: 30, width: 75, height: 23 },
          properties: {},
          events: [{ event: "Click", handler: "button1_Click" }],
          children: []
        }
      ],
      properties: {}
    };

    try {
      await generateReactProject({
        outDir,
        forms: [form],
        report: {
          sourceFiles: ["SampleForm.Designer.cs"],
          forms: [
            {
              name: "SampleForm",
              title: "Sample",
              sourcePath: "src/SampleForm.Designer.cs",
              support: form.support
            }
          ],
          formsConverted: 1,
          controlsConverted: 1,
          supportedControls: ["Button"],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: {
            total: 1,
            supported: 1,
            degraded: 0,
            unknown: 0,
            supportedPercent: 100,
            previewablePercent: 100,
            unknownPercent: 0,
            byKind: [{ kind: "Button", count: 1, status: "supported" }]
          },
          eventStubs: [{ controlName: "button1", event: "Click", handler: "button1_Click" }],
        contractPoints: []
        }
      });

      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      const packageJson = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
      const formJson = JSON.parse(await readFile(join(outDir, "forms", "SampleForm.json"), "utf8"));
      const report = JSON.parse(await readFile(join(outDir, "migration-report.json"), "utf8"));

      expect(app).toContain("WinFormHost");
      expect(app).toContain("import { useState, useRef, useEffect } from \"react\";");
      expect(app).toContain("import report from \"../migration-report.json\";");
      expect(app).toContain("selectedForm");
      expect(app).toContain("preview-form-list");
      expect(app).toContain("preview-stat");
      expect(app).toContain("sourcePath: \"src/SampleForm.Designer.cs\"");
      expect(app).toContain("<small>{item.sourcePath}</small>");
      expect(app).toContain("controlCount: 1");
      expect(app).toContain("unknownCount: 0");
      expect(app).toContain("navigations: [");
      expect(app).toContain("const nameToId = new Map");
      expect(app).toContain("window.addEventListener(\"wf-event\"");
      expect(app).toContain("navStack");
      expect(app).toContain("wf-nav-back");
      expect(app).toContain("preview-form-badges");
      expect(app).toContain("issueMode");
      expect(app).toContain("visibleForms");
      expect(app).toContain("preview-filter");
      expect(packageJson.devDependencies["@types/react"]).toBeDefined();
      expect(packageJson.devDependencies["@types/react-dom"]).toBeDefined();
      expect(formJson.name).toBe("SampleForm");
      expect(formJson.sourcePath).toBe("src/SampleForm.Designer.cs");
      expect(report.eventStubs[0].handler).toBe("button1_Click");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("injects per-form navigations and wires wf-event routing for multi-form navigation", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-nav-"));
    const emptyCoverage = {
      total: 0,
      supported: 0,
      degraded: 0,
      unknown: 0,
      supportedPercent: 100,
      previewablePercent: 100,
      unknownPercent: 0,
      byKind: [] as { kind: string; count: number; status: string }[]
    };
    const mkForm = (name: string, navigations: VisualForm["navigations"]): VisualForm => ({
      kind: "Form",
      name,
      sourcePath: `src/${name}.Designer.cs`,
      text: name,
      clientSize: { width: 200, height: 120 },
      support: {
        controlsConverted: 0,
        supportedControls: [],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: emptyCoverage,
        eventStubs: [],
        contractPoints: []
      },
      controls: [],
      properties: {},
      navigations
    });
    const main = mkForm("Main", [
      { target: "DetailForm", modal: true, fromHandler: "btnDetail_Click" },
      { target: "ReportForm", modal: false, fromHandler: "btnReport_Click" }
    ]);
    const detail = mkForm("DetailForm", []);
    const forms = [main, detail];

    try {
      await generateReactProject({
        outDir,
        forms,
        report: {
          sourceFiles: forms.map((f) => f.sourcePath),
          forms: forms.map((f) => ({
            name: f.name,
            title: f.text ?? f.name,
            sourcePath: f.sourcePath,
            support: f.support
          })),
          formsConverted: forms.length,
          controlsConverted: 0,
          supportedControls: [],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: emptyCoverage,
          eventStubs: [],
          contractPoints: []
        }
      });

      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      // Main's navigations are serialized into its formItem
      expect(app).toContain("\"target\":\"DetailForm\",\"modal\":true,\"fromHandler\":\"btnDetail_Click\"");
      expect(app).toContain("\"target\":\"ReportForm\",\"modal\":false,\"fromHandler\":\"btnReport_Click\"");
      // routing scaffold present
      expect(app).toContain("const nameToId = new Map");
      expect(app).toContain("nameToId.get(edge.target.toLowerCase())");
      expect(app).toContain("window.addEventListener(\"wf-event\"");
      expect(app).toContain("setSelectedFormId(targetId)");
      expect(app).toContain("wf-modal-backdrop");
      expect(app).toContain("wf-nav-back");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });


  it("writes MIGRATION.md and renders contract markers for forms with contract points", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-mig-"));
    const hint = {
      handler: "btnSave_Click",
      sourceFile: "OrderForm.cs",
      lineStart: 6,
      lineEnd: 10,
      calledSymbols: ["SaveOrder", "MessageBox.Show"]
    };
    const form: VisualForm = {
      kind: "Form",
      name: "OrderForm",
      sourcePath: "src/OrderForm.Designer.cs",
      text: "Order",
      clientSize: { width: 200, height: 120 },
      support: {
        controlsConverted: 1,
        supportedControls: ["Button"],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: {
          total: 1, supported: 1, degraded: 0, unknown: 0,
          supportedPercent: 100, previewablePercent: 100, unknownPercent: 0,
          byKind: [{ kind: "Button", count: 1, status: "supported" }]
        },
        eventStubs: [{ controlName: "btnSave", event: "Click", handler: "btnSave_Click" }],
        contractPoints: [{ ...hint, controlName: "btnSave", event: "Click" }]
      },
      controls: [
        {
          kind: "Button",
          name: "btnSave",
          text: "Save",
          bounds: { x: 10, y: 10, width: 75, height: 23 },
          properties: {},
          events: [{ event: "Click", handler: "btnSave_Click", migrationHint: hint }],
          children: []
        }
      ],
      properties: {},
      navigations: [{ target: "DetailForm", modal: true, fromHandler: "btnDetail_Click" }],
      bindings: [{ controlName: "grid", dataSource: "orderBindingSource", kind: "BindingSource" }]
    };

    try {
      await generateReactProject({
        outDir,
        forms: [form],
        report: {
          sourceFiles: ["OrderForm.Designer.cs"],
          forms: [{ name: "OrderForm", title: "Order", sourcePath: "src/OrderForm.Designer.cs", support: form.support }],
          formsConverted: 1,
          controlsConverted: 1,
          supportedControls: ["Button"],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: form.support.controlCoverage,
          eventStubs: form.support.eventStubs
        }
      });

      const migration = await readFile(join(outDir, "MIGRATION.md"), "utf8");
      expect(migration).toContain("# Migration Checklist");
      expect(migration).toContain("## OrderForm (src/OrderForm.Designer.cs)");
      expect(migration).toContain("btnSave.Click → btnSave_Click (OrderForm.cs:6-10)");
      expect(migration).toContain("calls: SaveOrder, MessageBox.Show");
      expect(migration).toContain("ShowDialog → DetailForm");
      expect(migration).toContain("grid ← orderBindingSource (BindingSource)");

      const compat = await readFile(join(outDir, "src", "winformsCompat.tsx"), "utf8");
      expect(compat).toContain("wf-contract-marker");
      expect(compat).toContain("wf-pending-panel");
      expect(compat).toContain("待接后端");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("renders actionable MIGRATION.md wording for inline-lambda and orphan handlers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-migword-"));
    const mkForm = (): VisualForm => ({
      kind: "Form",
      name: "M",
      sourcePath: "M.Designer.cs",
      support: {
        controlsConverted: 2, supportedControls: ["Button"], degradedControls: [], unknownControls: [],
        controlCoverage: { total: 2, supported: 2, degraded: 0, unknown: 0, supportedPercent: 100, previewablePercent: 100, unknownPercent: 0, byKind: [] },
        eventStubs: [],
        contractPoints: [
          { controlName: "btnInline", event: "Click", handler: "btnInline_Click_inline", sourceFile: "(inline lambda)", lineStart: 0, lineEnd: 0, calledSymbols: [] },
          { controlName: "btnOrphan", event: "Click", handler: "btnOrphan_Click", sourceFile: "(handler not found)", lineStart: 0, lineEnd: 0, calledSymbols: [] }
        ]
      },
      controls: [],
      properties: {}
    });
    const form = mkForm();
    try {
      await generateReactProject({
        outDir, forms: [form],
        report: {
          sourceFiles: ["M.Designer.cs"],
          forms: [{ name: "M", title: "M", sourcePath: "M.Designer.cs", support: form.support }],
          formsConverted: 1, controlsConverted: 2,
          supportedControls: ["Button"], degradedControls: [], unknownControls: [],
          controlCoverage: form.support.controlCoverage, eventStubs: []
        }
      });
      const migration = await readFile(join(outDir, "MIGRATION.md"), "utf8");
      // Inline lambda must not present a phantom findable handler name.
      expect(migration).toContain("btnInline.Click → inline lambda");
      expect(migration).not.toContain("btnInline_Click_inline");
      // Orphan handler must say it's missing from code-behind.
      expect(migration).toContain("btnOrphan.Click → btnOrphan_Click (handler not found in code-behind)");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("deduplicates generated files and imports for forms with the same class name", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-dupes-"));
    const form: VisualForm = {
      kind: "Form",
      name: "Form1",
      sourcePath: "A/Form1.Designer.cs",
      text: "Form",
      clientSize: { width: 100, height: 80 },
      support: {
        controlsConverted: 0,
        supportedControls: [],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: {
          total: 0,
          supported: 0,
          degraded: 0,
          unknown: 0,
          supportedPercent: 0,
          previewablePercent: 0,
          unknownPercent: 0,
          byKind: []
        },
        eventStubs: [],
        contractPoints: []
      },
      controls: [],
      properties: {}
    };

    try {
      await generateReactProject({
        outDir,
        forms: [form, { ...form }],
        report: {
          sourceFiles: ["A/Form1.Designer.cs", "B/Form1.Designer.cs"],
          forms: [
            {
              name: "Form1",
              title: "Form",
              sourcePath: "A/Form1.Designer.cs",
              support: form.support
            },
            {
              name: "Form1",
              title: "Form",
              sourcePath: "B/Form1.Designer.cs",
              support: form.support
            }
          ],
          formsConverted: 2,
          controlsConverted: 0,
          supportedControls: [],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: {
            total: 0,
            supported: 0,
            degraded: 0,
            unknown: 0,
            supportedPercent: 0,
            previewablePercent: 0,
            unknownPercent: 0,
            byKind: []
          },
          eventStubs: [],
        contractPoints: []
        }
      });

      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      const first = JSON.parse(await readFile(join(outDir, "forms", "Form1.json"), "utf8"));
      const second = JSON.parse(await readFile(join(outDir, "forms", "2-Form1.json"), "utf8"));

      expect(app).toContain("form0");
      expect(app).toContain("form1");
      expect(app).toContain("id: \"form-0\"");
      expect(app).toContain("id: \"form-1\"");
      expect(first.name).toBe("Form1");
      expect(second.name).toBe("Form1");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("gives case-only-different form names distinct filenames (avoids TS1149 on case-insensitive FS)", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-case-"));
    const mkForm = (name: string): VisualForm => ({
      kind: "Form",
      name,
      sourcePath: `${name}.Designer.cs`,
      support: {
        controlsConverted: 0, supportedControls: [], degradedControls: [], unknownControls: [],
        controlCoverage: { total: 0, supported: 0, degraded: 0, unknown: 0, supportedPercent: 0, previewablePercent: 0, unknownPercent: 0, byKind: [] },
        eventStubs: [], contractPoints: []
      },
      controls: [],
      properties: {}
    });
    const forms = [mkForm("FormEditor"), mkForm("formEditor")];
    try {
      await generateReactProject({
        outDir,
        forms,
        report: {
          sourceFiles: forms.map((f) => f.sourcePath),
          forms: forms.map((f) => ({ name: f.name, title: f.name, sourcePath: f.sourcePath, support: f.support })),
          formsConverted: 2, controlsConverted: 0,
          supportedControls: [], degradedControls: [], unknownControls: [],
          controlCoverage: forms[0].support.controlCoverage, eventStubs: []
        }
      });
      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      // The two imports must reference filenames that differ by MORE than casing.
      const importedFiles = [...app.matchAll(/from "\.\.\/forms\/([^"]+)"/g)].map((m) => m[1]);
      const lowered = importedFiles.map((f) => f.toLowerCase());
      expect(new Set(lowered).size).toBe(importedFiles.length);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("emits a Dock-aware compatibility renderer that reserves edges and fills the remainder", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-dock-"));
    const form: VisualForm = {
      kind: "Form",
      name: "DockForm",
      sourcePath: "DockForm.Designer.cs",
      text: "Dock",
      clientSize: { width: 400, height: 300 },
      support: {
        controlsConverted: 3,
        supportedControls: ["MenuStrip", "Panel", "StatusStrip"],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: {
          total: 3,
          supported: 3,
          degraded: 0,
          unknown: 0,
          supportedPercent: 100,
          previewablePercent: 100,
          unknownPercent: 0,
          byKind: [
            { kind: "MenuStrip", count: 1, status: "supported" },
            { kind: "Panel", count: 1, status: "supported" },
            { kind: "StatusStrip", count: 1, status: "supported" }
          ]
        },
        eventStubs: [],
        contractPoints: []
      },
      controls: [
        {
          kind: "MenuStrip",
          name: "menuStrip1",
          dock: "Top",
          bounds: { x: 0, y: 0, width: 400, height: 24 },
          properties: {},
          events: [],
          children: []
        },
        {
          kind: "StatusStrip",
          name: "statusStrip1",
          dock: "Bottom",
          bounds: { x: 0, y: 276, width: 400, height: 24 },
          properties: {},
          events: [],
          children: []
        },
        {
          kind: "Panel",
          name: "contentPanel",
          dock: "Fill",
          bounds: { x: 0, y: 24, width: 400, height: 252 },
          properties: {},
          events: [],
          children: []
        }
      ],
      properties: {}
    };

    try {
      await generateReactProject({
        outDir,
        forms: [form],
        report: {
          sourceFiles: ["DockForm.Designer.cs"],
          forms: [
            {
              name: "DockForm",
              title: "Dock",
              sourcePath: "DockForm.Designer.cs",
              support: form.support
            }
          ],
          formsConverted: 1,
          controlsConverted: 3,
          supportedControls: ["MenuStrip", "Panel", "StatusStrip"],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: form.support.controlCoverage,
          eventStubs: [],
        contractPoints: []
        }
      });

      const compat = await readFile(join(outDir, "src", "winformsCompat.tsx"), "utf8");
      expect(compat).toContain("function layoutChildren");
      expect(compat).toContain("hasLeft && hasRight");
      expect(compat).toContain("dock === \"Top\"");
      expect(compat).toContain("dock === \"Bottom\"");
      expect(compat).toContain("dock === \"Left\"");
      expect(compat).toContain("dock === \"Right\"");
      expect(compat).toContain("dock === \"Fill\"");
      expect(compat).toContain("fillIndices");
      expect(compat).toContain("hostStyle");
      expect(compat).toContain("isContainerKind");
      expect(compat).toContain("function winStyle");
      expect(compat).toContain("a.foreColor");
      expect(compat).toContain("a.backColor");
      expect(compat).toContain("a.font");
      expect(compat).toContain("a.borderStyle");
      expect(compat).toContain("a.textAlign");
      expect(compat).toContain("a.enabled === false");
      expect(compat).toContain("appearance?.visible === false");
      expect(compat).toContain("function layoutChildren");
      expect(compat).toContain("hasLeft && hasRight");
      expect(compat).toContain("WinTableLayoutPanel");
      expect(compat).toContain("WinFlowLayoutPanel");
      expect(compat).toContain("WinSplitContainer");
      expect(compat).toContain("wf-textarea");
      expect(compat).toContain("wf-progress-bar");
      expect(compat).toContain("wf-degraded");
      expect(compat).toContain("wf-listview");
      expect(compat).toContain("wf-tree-node");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });


  it("renders FlowLayoutPanel children in flex flow and TLP cells in grid", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf2react-align-"));
    const form: VisualForm = {
      kind: "Form",
      name: "AlignForm",
      sourcePath: "AlignForm.Designer.cs",
      text: "Align",
      clientSize: { width: 300, height: 200 },
      support: {
        controlsConverted: 3,
        supportedControls: ["Button", "FlowLayoutPanel"],
        degradedControls: [],
        unknownControls: [],
        controlCoverage: {
          total: 3, supported: 3, degraded: 0, unknown: 0,
          supportedPercent: 100, previewablePercent: 100, unknownPercent: 0,
          byKind: [
            { kind: "Button", count: 2, status: "supported" },
            { kind: "FlowLayoutPanel", count: 1, status: "supported" }
          ]
        },
        eventStubs: [],
        contractPoints: []
      },
      controls: [
        {
          kind: "FlowLayoutPanel",
          name: "flp1",
          flowDirection: "TopDown",
          wrapContents: false,
          bounds: { x: 10, y: 10, width: 200, height: 180 },
          properties: {}, events: [], children: [
            { kind: "Button", name: "b1", text: "A", bounds: { x: 0, y: 0, width: 80, height: 30 }, appearance: {}, properties: {}, events: [], children: [] },
            { kind: "Button", name: "b2", text: "B", bounds: { x: 0, y: 36, width: 80, height: 30 }, appearance: {}, properties: {}, events: [], children: [] }
          ],
          appearance: {}
        },
        {
          kind: "Button",
          name: "topBtn",
          text: "Top",
          bounds: { x: 220, y: 10, width: 60, height: 30 },
          appearance: {}, properties: {}, events: [], children: []
        }
      ],
      properties: {}
    };

    try {
      await generateReactProject({
        outDir,
        forms: [form],
        report: {
          sourceFiles: ["AlignForm.Designer.cs"],
          forms: [{ name: "AlignForm", title: "Align", sourcePath: "AlignForm.Designer.cs", support: form.support }],
          formsConverted: 1,
          controlsConverted: 3,
          supportedControls: ["Button", "FlowLayoutPanel"],
          degradedControls: [],
          unknownControls: [],
          controlCoverage: form.support.controlCoverage,
          eventStubs: [],
        contractPoints: []
        }
      });

      const compat = await readFile(join(outDir, "src", "winformsCompat.tsx"), "utf8");
      expect(compat).toContain('position: "relative", width: b.width, height: b.height');
      expect(compat).toContain('width: "100%", height: "100%"');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
