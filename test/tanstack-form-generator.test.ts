import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTanStackFormProject } from "../src/generator/tanstackFormGenerator.js";
import type { MigrationReport, VisualForm } from "../src/ir/types.js";

const sampleForm: VisualForm = {
  kind: "Form",
  name: "LoginForm",
  sourcePath: "LoginForm.Designer.cs",
  text: "Login",
  clientSize: { width: 300, height: 200 },
  support: {
    controlsConverted: 4,
    supportedControls: ["TextBox", "CheckBox", "Button", "Label"],
    degradedControls: [],
    unknownControls: [],
    controlCoverage: {
      total: 4, supported: 4, degraded: 0, unknown: 0,
      supportedPercent: 100, previewablePercent: 100, unknownPercent: 0,
      byKind: [
        { kind: "TextBox", count: 2, status: "supported" },
        { kind: "CheckBox", count: 1, status: "supported" },
        { kind: "Button", count: 1, status: "supported" }
      ]
    },
    eventStubs: []
  },
  controls: [
    {
      kind: "Label", name: "lblUser", text: "Username:",
      bounds: { x: 10, y: 10, width: 80, height: 16 },
      appearance: {}, properties: {}, events: [], children: []
    },
    {
      kind: "TextBox", name: "txtUser",
      bounds: { x: 100, y: 8, width: 180, height: 24 },
      appearance: {}, properties: {}, events: [], children: []
    },
    {
      kind: "Label", name: "lblPass", text: "Password:",
      bounds: { x: 10, y: 44, width: 80, height: 16 },
      appearance: {}, properties: {}, events: [], children: []
    },
    {
      kind: "TextBox", name: "txtPass",
      bounds: { x: 100, y: 42, width: 180, height: 24 },
      appearance: { passwordChar: "•" },
      properties: {}, events: [], children: []
    },
    {
      kind: "CheckBox", name: "chkRemember", text: "Remember me",
      bounds: { x: 100, y: 76, width: 160, height: 20 },
      appearance: { checked: true },
      properties: {}, events: [], children: []
    },
    {
      kind: "Button", name: "btnOK", text: "OK",
      bounds: { x: 100, y: 110, width: 80, height: 28 },
      appearance: {},
      properties: {}, events: [{ event: "Click", handler: "btnOK_Click" }], children: []
    }
  ],
  properties: {}
};

const sampleReport: MigrationReport = {
  sourceFiles: ["LoginForm.Designer.cs"],
  forms: [{ name: "LoginForm", title: "Login", sourcePath: "LoginForm.Designer.cs", support: sampleForm.support }],
  formsConverted: 1,
  controlsConverted: 6,
  supportedControls: ["TextBox", "CheckBox", "Button", "Label"],
  degradedControls: [],
  unknownControls: [],
  controlCoverage: sampleForm.support.controlCoverage,
  eventStubs: []
};

describe("generateTanStackFormProject", () => {
  it("generates a TanStack Form + Zod project with typed fields, labels, and handler stubs", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "wf-ts-test-"));
    try {
      await generateTanStackFormProject({
        outDir,
        forms: [sampleForm],
        report: sampleReport
      });

      const formFile = await readFile(join(outDir, "src", "forms", "LoginForm.tsx"), "utf8");
      const packageJson = JSON.parse(await readFile(join(outDir, "package.json"), "utf8"));

      // Zod schema with correct types
      expect(formFile).toContain("z.string()");
      expect(formFile).toContain("z.boolean()");
      expect(formFile).toContain("txtUser: z.string()");
      expect(formFile).toContain("chkRemember: z.boolean()");

      // Default values from Designer
      expect(formFile).toContain("chkRemember: true");
      expect(formFile).toContain('txtUser: ""');

      // Label association (lblUser near txtUser -> label "Username:")
      expect(formFile).toContain("Username:");

      // Button handler stub
      expect(formFile).toContain("btnOK_Click");
      expect(formFile).toContain("TODO: migrate btnOK_Click");

      // Password field
      expect(formFile).toContain('type="password"');

      // Zod validation in onSubmit
      expect(formFile).toContain("safeParse");
      expect(formFile).toContain("LoginFormSchema");

      // form.Field bindings
      expect(formFile).toContain('form.Field name="txtUser"');
      expect(formFile).toContain('form.Field name="txtPass"');
      expect(formFile).toContain('form.Field name="chkRemember"');

      // Package.json has TanStack Form + Zod deps
      expect(packageJson.dependencies["@tanstack/react-form"]).toBeDefined();
      expect(packageJson.dependencies["zod"]).toBeDefined();

      // Mnemonic cleanup (& removed)
      expect(formFile).not.toContain("&amp;");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});