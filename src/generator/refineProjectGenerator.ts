import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectIR } from "../ir/types.js";
import { buildTargetManifest } from "../ir/targetManifest.js";
import {
  componentRegistryTsx,
  migrationStylesCss,
  migrationSurfaceTsx,
} from "./migrationTargetRuntime.js";

export async function generateRefineProject(input: { outDir: string; project: ProjectIR }): Promise<void> {
  const generated = join(input.outDir, "src", "generated");
  const runtime = join(input.outDir, "src", "runtime");
  const providers = join(input.outDir, "src", "providers");
  const assets = join(input.outDir, "src", "assets");
  await Promise.all([
    mkdir(generated, { recursive: true }),
    mkdir(runtime, { recursive: true }),
    mkdir(providers, { recursive: true }),
    mkdir(assets, { recursive: true }),
  ]);
  const manifest = buildTargetManifest(input.project);

  await Promise.all([
    writeJson(join(generated, "project.ir.json"), input.project),
    writeJson(join(generated, "target-manifest.json"), manifest),
    writeFile(join(input.outDir, "package.json"), refinePackageJson(), "utf8"),
    writeFile(join(input.outDir, "index.html"), indexHtml(), "utf8"),
    writeFile(join(input.outDir, "tsconfig.json"), tsconfigJson(), "utf8"),
    writeFile(join(input.outDir, "vite.config.ts"), viteConfig(), "utf8"),
    writeFile(join(input.outDir, "src", "main.tsx"), mainTsx(), "utf8"),
    writeFile(join(input.outDir, "src", "App.tsx"), appTsx(), "utf8"),
    writeFile(join(providers, "dataProvider.ts"), dataProviderTs(), "utf8"),
    writeFile(join(runtime, "MigrationSurface.tsx"), migrationSurfaceTsx(input.project), "utf8"),
    writeFile(join(runtime, "componentRegistry.tsx"), componentRegistryTsx(input.project), "utf8"),
    writeFile(join(input.outDir, "src", "styles.css"), refineStylesCss(), "utf8"),
    writeFile(join(input.outDir, "README.md"), refineReadme(manifest.totals), "utf8"),
    ...input.project.assets.map((asset) => asset.contentBase64
      ? writeFile(join(assets, asset.targetFileName), Buffer.from(asset.contentBase64, "base64"))
      : copyFile(asset.sourcePath!, join(assets, asset.targetFileName))),
  ]);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function refinePackageJson(): string {
  return `${JSON.stringify({
    name: "wf2-refine-spike",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: { dev: "vite", build: "tsc --noEmit && vite build" },
    dependencies: {
      "@refinedev/core": "5.0.12",
      "@refinedev/react-router": "2.0.4",
      antd: "6.5.1",
      react: "19.1.1",
      "react-dom": "19.1.1",
      "react-router": "7.6.3",
    },
    devDependencies: {
      "@types/react": "19.1.6",
      "@types/react-dom": "19.1.5",
      "@vitejs/plugin-react": "4.5.1",
      typescript: "5.8.3",
      vite: "6.3.5",
    },
  }, null, 2)}\n`;
}

function indexHtml(): string {
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>WinForms migration · Refine spike</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`;
}

function tsconfigJson(): string {
  return `${JSON.stringify({ compilerOptions: {
    target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"],
    allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true,
    strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler",
    resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx",
  }, include: ["src", "vite.config.ts"] }, null, 2)}\n`;
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n`;
}

function mainTsx(): string {
  return `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport "antd/dist/reset.css";\nimport "./styles.css";\nimport App from "./App";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);\n`;
}

function appTsx(): string {
  return `import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useParams } from "react-router";
import project from "./generated/project.ir.json";
import manifest from "./generated/target-manifest.json";
import { dataProvider } from "./providers/dataProvider";
import { sharedComponentRegistry } from "./runtime/componentRegistry";
import { MigrationSurface } from "./runtime/MigrationSurface";

const resources = manifest.pages.map((page) => ({
  name: page.id,
  list: page.route,
  meta: { label: page.title },
}));

export default function App() {
  const first = manifest.pages[0];
  return <BrowserRouter><Refine routerProvider={routerProvider} dataProvider={dataProvider} resources={resources} options={{ syncWithLocation: true }}>
    <Routes>
      <Route element={<WorkbenchLayout />}>
        <Route index element={first ? <Navigate to={first.route} replace /> : <div>没有可迁移页面</div>} />
        <Route path="/migration/:pageId" element={<MigrationScreen />} />
      </Route>
    </Routes>
  </Refine></BrowserRouter>;
}

function WorkbenchLayout() {
  return <div className="workbench">
    <aside className="workbench-sidebar">
      <div className="workbench-brand"><strong>Refine target</strong><span>neutral IR spike</span></div>
      <nav>{manifest.pages.map((page) => <Link key={page.id} to={page.route}>{page.title}<small>{page.contractCount} contracts</small></Link>)}</nav>
      <footer>{manifest.totals.sharedComponentTypes} component types / {manifest.totals.sharedComponentInstances} instances</footer>
    </aside>
    <main className="workbench-main"><Outlet /></main>
  </div>;
}

function MigrationScreen() {
  const { pageId } = useParams();
  const page = project.pages.find((item) => item.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") === pageId);
  return page ? <MigrationSurface page={page} registry={sharedComponentRegistry} /> : <div>Page not found: {pageId}</div>;
}
`;
}

function dataProviderTs(): string {
  return `import type { BaseRecord, DataProvider } from "@refinedev/core";

// Deliberate seam for the future ASP.NET Core compatibility API. The visual
// spike does not invent records from Designer files.
export const dataProvider: DataProvider = {
  getList: async () => ({ data: [], total: 0 }),
  getOne: async <TData extends BaseRecord = BaseRecord>({ id }: any) => ({ data: { id } as TData }),
  create: async <TData extends BaseRecord = BaseRecord>({ variables }: any) => ({ data: { id: crypto.randomUUID(), ...(variables as object) } as TData }),
  update: async <TData extends BaseRecord = BaseRecord>({ id, variables }: any) => ({ data: { id, ...(variables as object) } as TData }),
  deleteOne: async <TData extends BaseRecord = BaseRecord>({ id }: any) => ({ data: { id } as TData }),
  getApiUrl: () => "/api",
};
`;
}

function refineStylesCss(): string {
  return `${migrationStylesCss()}
.workbench { min-height: 100vh; display: grid; grid-template-columns: 248px minmax(0, 1fr); }
.workbench-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: #172033; color: white; }
.workbench-brand { padding: 22px 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
.workbench-brand strong, .workbench-brand span { display: block; }
.workbench-brand span { margin-top: 4px; color: #9eabc0; font-size: 12px; }
.workbench-sidebar nav { flex: 1; overflow: auto; padding: 10px; }
.workbench-sidebar nav a { display: block; padding: 10px 11px; color: #dbe3ef; text-decoration: none; border-radius: 7px; }
.workbench-sidebar nav a:hover { background: #26334a; }
.workbench-sidebar nav small { display: block; margin-top: 3px; color: #8795aa; }
.workbench-sidebar footer { padding: 14px 18px; color: #91a0b5; border-top: 1px solid rgba(255,255,255,.1); font-size: 11px; }
.workbench-main { min-width: 0; }
`;
}

function refineReadme(totals: ReturnType<typeof buildTargetManifest>["totals"]): string {
  return `# Refine / React migration spike

Generated from the neutral Project IR. It contains ${totals.pages} pages, ${totals.contracts} event contracts,
and ${totals.sharedComponentTypes} shared component types used by ${totals.sharedComponentInstances} instances.

Run with \`npm install && npm run dev\`. Replace \`src/providers/dataProvider.ts\` with the ASP.NET Core API adapter;
generated files under \`src/generated\` stay disposable.
`;
}
