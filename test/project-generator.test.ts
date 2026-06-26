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
        eventStubs: [{ controlName: "button1", event: "Click", handler: "button1_Click" }]
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
          eventStubs: [{ controlName: "button1", event: "Click", handler: "button1_Click" }]
        }
      });

      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      const packageJson = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));
      const formJson = JSON.parse(await readFile(join(outDir, "forms", "SampleForm.json"), "utf8"));
      const report = JSON.parse(await readFile(join(outDir, "migration-report.json"), "utf8"));

      expect(app).toContain("WinFormHost");
      expect(app).toContain("import { useState } from \"react\";");
      expect(app).toContain("import report from \"../migration-report.json\";");
      expect(app).toContain("selectedForm");
      expect(app).toContain("preview-form-list");
      expect(app).toContain("preview-stat");
      expect(app).toContain("sourcePath: \"src/SampleForm.Designer.cs\"");
      expect(app).toContain("<small>{item.sourcePath}</small>");
      expect(app).toContain("controlCount: 1");
      expect(app).toContain("unknownCount: 0");
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
        eventStubs: []
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
          eventStubs: []
        }
      });

      const app = await readFile(join(outDir, "src", "App.tsx"), "utf8");
      const first = JSON.parse(await readFile(join(outDir, "forms", "1-Form1.json"), "utf8"));
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
        eventStubs: []
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
          eventStubs: []
        }
      });

      const compat = await readFile(join(outDir, "src", "winformsCompat.tsx"), "utf8");
      expect(compat).toContain("function dockLayout");
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
});
