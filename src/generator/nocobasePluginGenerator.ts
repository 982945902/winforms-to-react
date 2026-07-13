import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectIR } from "../ir/types.js";
import { buildTargetManifest } from "../ir/targetManifest.js";
import {
  componentRegistryTsx,
  migrationStylesCss,
  migrationSurfaceTsx,
} from "./migrationTargetRuntime.js";

export async function generateNocoBasePlugin(input: { outDir: string; project: ProjectIR }): Promise<void> {
  const client = join(input.outDir, "src", "client-v2");
  const generated = join(client, "generated");
  const runtime = join(client, "runtime");
  const pages = join(client, "pages");
  const assets = join(client, "assets");
  await Promise.all([
    mkdir(generated, { recursive: true }), mkdir(runtime, { recursive: true }), mkdir(pages, { recursive: true }), mkdir(assets, { recursive: true }),
  ]);
  const manifest = buildTargetManifest(input.project);

  await Promise.all([
    writeJson(join(generated, "project.ir.json"), input.project),
    writeJson(join(generated, "target-manifest.json"), manifest),
    writeFile(join(input.outDir, "package.json"), packageJson(), "utf8"),
    writeFile(join(input.outDir, "tsconfig.json"), tsconfigJson(), "utf8"),
    writeFile(join(client, "index.tsx"), `export { default } from "./plugin";\n`, "utf8"),
    writeFile(join(client, "plugin.tsx"), pluginTsx(manifest.pages[0]?.id), "utf8"),
    writeFile(join(pages, "MigrationPage.tsx"), pageTsx(), "utf8"),
    writeFile(join(runtime, "MigrationSurface.tsx"), migrationSurfaceTsx(input.project), "utf8"),
    writeFile(join(runtime, "componentRegistry.tsx"), componentRegistryTsx(input.project), "utf8"),
    writeFile(join(client, "styles.css"), migrationStylesCss(), "utf8"),
    writeFile(join(input.outDir, "README.md"), readme(manifest.totals), "utf8"),
    ...input.project.assets.map((asset) => asset.contentBase64
      ? writeFile(join(assets, asset.targetFileName), Buffer.from(asset.contentBase64, "base64"))
      : copyFile(asset.sourcePath!, join(assets, asset.targetFileName))),
  ]);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function packageJson(): string {
  return `${JSON.stringify({
    private: true,
    name: "@my-project/plugin-wf2-migration-spike",
    displayName: "WinForms migration spike",
    version: "0.0.0",
    main: "dist/server/index.js",
    scripts: { typecheck: "tsc --noEmit" },
    peerDependencies: {
      "@nocobase/client-v2": "2.x",
      "@nocobase/flow-engine": "2.x",
    },
    devDependencies: {
      "@nocobase/client-v2": "2.1.23",
      "@nocobase/flow-engine": "2.1.23",
      "@types/react": "18.3.23",
      "@types/react-dom": "18.3.7",
      antd: "5.24.2",
      react: "18.3.1",
      "react-dom": "18.3.1",
      typescript: "5.8.3",
    },
  }, null, 2)}\n`;
}

function tsconfigJson(): string {
  return `${JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["ES2022", "DOM"], strict: true, skipLibCheck: true,
    esModuleInterop: true, allowSyntheticDefaultImports: true, module: "ESNext",
    moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true,
    noEmit: true, jsx: "react-jsx",
  }, include: ["src"] }, null, 2)}\n`;
}

function pluginTsx(firstPageId?: string): string {
  const defaultId = firstPageId ?? "index";
  return `import { Plugin } from "@nocobase/client-v2";
import { useEffect } from "react";

export class Wf2MigrationSpikePlugin extends Plugin {
  async load() {
    this.router.add("wf2-migration", {
      path: "/migration/:pageId",
      componentLoader: () => import("./pages/MigrationPage"),
    });
    this.router.add("wf2-migration-index", {
      path: "/migration",
      element: <RedirectToFirstPage plugin={this} />,
    });
  }
}

function RedirectToFirstPage({ plugin }: { plugin: Wf2MigrationSpikePlugin }) {
  useEffect(() => {
    plugin.context.router.navigate(${JSON.stringify(`/migration/${defaultId}`)});
  }, [plugin]);
  return null;
}

export default Wf2MigrationSpikePlugin;
`;
}

function pageTsx(): string {
  return `import { useFlowContext } from "@nocobase/flow-engine";
import { Select } from "antd";
import project from "../generated/project.ir.json";
import manifest from "../generated/target-manifest.json";
import { sharedComponentRegistry } from "../runtime/componentRegistry";
import { MigrationSurface } from "../runtime/MigrationSurface";
import "../styles.css";

export default function MigrationPage() {
  const ctx = useFlowContext();
  const pageId = String(ctx.route.params?.pageId || "");
  const meta = manifest.pages.find((item) => item.id === pageId) || manifest.pages[0];
  const page = project.pages.find((item) => item.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") === meta?.id);
  if (!page || !meta) return <div>没有可迁移页面</div>;
  return <div>
    <div style={{ padding: "12px 22px", background: "white", borderBottom: "1px solid #e6e9ee" }}>
      <Select value={meta.id} style={{ minWidth: 260 }} options={manifest.pages.map((item) => ({ label: item.title, value: item.id }))}
        onChange={(id) => ctx.router.navigate("/migration/" + id)} />
    </div>
    <MigrationSurface page={page} registry={sharedComponentRegistry} />
  </div>;
}
`;
}

function readme(totals: ReturnType<typeof buildTargetManifest>["totals"]): string {
  return `# NocoBase migration spike plugin

This is source for a NocoBase 2.1 client-v2 plugin: ${totals.pages} pages, ${totals.contracts} event contracts,
${totals.sharedComponentTypes} shared component types and ${totals.sharedComponentInstances} instances.

The plugin deliberately starts as a plain React route, which is the stable progressive path in the NocoBase docs.
Copy it into a NocoBase workspace plugin created with
\`yarn pm create @my-project/plugin-wf2-migration-spike\`, then enable it and open
\`/v/migration/<page-id>\`. FlowModel/collection generation should be added only after data semantics are known.

For an isolated API compatibility check, run \`npm install && npm run typecheck\` in this directory.
`;
}
