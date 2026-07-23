import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectIR } from "../ir/types.js";
import { buildTargetManifest } from "../ir/targetManifest.js";
import { buildActionContractCandidateReport } from "../actionContractCandidates.js";
import { buildActionContractDraftBundle } from "../actionContractDrafts.js";
import { buildActionContractPromotionBundle } from "../actionContractPromotions.js";
import {
  componentRegistryTsx,
  migrationStylesCss,
  migrationSurfaceTsx,
  migrationVisualAssetsTs,
} from "./migrationTargetRuntime.js";
import { migrationComponentAdapters, migrationVisualProfilesTsx, migrationVisualProfileStylesCss } from "./migrationVisualProfiles.js";

export async function generateRefineProject(input: { outDir: string; project: ProjectIR }): Promise<void> {
  const generated = join(input.outDir, "src", "generated");
  const runtime = join(input.outDir, "src", "runtime");
  const providers = join(input.outDir, "src", "providers");
  const assets = join(input.outDir, "src", "assets");
  // Assets are fully generated from the current IR. Clear only this owned
  // directory so repeated single-form conversions cannot retain unrelated
  // images from an earlier project and mask a missing context resolution.
  await rm(assets, { recursive: true, force: true });
  await Promise.all([
    mkdir(generated, { recursive: true }),
    mkdir(runtime, { recursive: true }),
    mkdir(providers, { recursive: true }),
    mkdir(assets, { recursive: true }),
  ]);
  const manifest = buildTargetManifest(input.project, { componentAdapters: migrationComponentAdapters(input.project) });
  const candidates = buildActionContractCandidateReport(input.project);
  const drafts = buildActionContractDraftBundle(input.project);
  const promotions = buildActionContractPromotionBundle(input.project);

  await Promise.all([
    writeJson(join(generated, "project.ir.json"), input.project),
    writeJson(join(generated, "target-manifest.json"), manifest),
    writeJson(join(generated, "action-contract.candidates.json"), candidates),
    writeJson(join(generated, "action-contract.drafts.json"), drafts),
    writeJson(join(generated, "action-contract.promotions.json"), promotions),
    writeFile(join(input.outDir, "package.json"), refinePackageJson(), "utf8"),
    writeFile(join(input.outDir, "index.html"), indexHtml(), "utf8"),
    writeFile(join(input.outDir, "tsconfig.json"), tsconfigJson(), "utf8"),
    writeFile(join(input.outDir, "vite.config.ts"), viteConfig(), "utf8"),
    writeFile(join(input.outDir, "src", "main.tsx"), mainTsx(), "utf8"),
    writeFile(join(input.outDir, "src", "App.tsx"), appTsx(), "utf8"),
    writeFile(join(providers, "dataProvider.ts"), dataProviderTs(), "utf8"),
    writeFile(join(runtime, "MigrationSurface.tsx"), migrationSurfaceTsx(input.project), "utf8"),
    writeFile(join(runtime, "visualAssets.ts"), migrationVisualAssetsTs(input.project), "utf8"),
    writeFile(join(runtime, "componentRegistry.tsx"), componentRegistryTsx(input.project), "utf8"),
    writeFile(join(runtime, "visualProfiles.tsx"), migrationVisualProfilesTsx(input.project), "utf8"),
    writeFile(join(input.outDir, "src", "styles.css"), refineStylesCss(input.project), "utf8"),
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
      "react-router": "7.18.1",
    },
    devDependencies: {
      "@types/react": "19.1.6",
      "@types/react-dom": "19.1.5",
      "@vitejs/plugin-react": "4.5.1",
      typescript: "5.8.3",
      vite: "6.4.3",
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
import { useEffect, useState, type ChangeEvent } from "react";
import routerProvider from "@refinedev/react-router";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useParams } from "react-router";
import project from "./generated/project.ir.json";
import manifest from "./generated/target-manifest.json";
import { dataProvider } from "./providers/dataProvider";
import { sharedComponentRegistry } from "./runtime/componentRegistry";
import { downloadMigrationAcceptanceEvidence, importMigrationAcceptanceEvidence, MigrationSurface, readMigrationAcceptanceRecords, type MigrationAcceptanceRecord } from "./runtime/MigrationSurface";

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
        <Route path="/acceptance" element={<AcceptanceDashboard />} />
        <Route path="/migration/:pageId" element={<MigrationScreen />} />
      </Route>
    </Routes>
  </Refine></BrowserRouter>;
}

function WorkbenchLayout() {
  return <div className="workbench">
    <aside className="workbench-sidebar">
      <div className="workbench-brand"><strong>Refine target</strong><span>neutral IR spike</span></div>
      <nav><Link className="acceptance-nav-link" to="/acceptance">验收总览<small>Frontend Acceptance Gate</small></Link>
        {manifest.pages.map((page) => <Link key={page.id} to={page.route}>{page.title}<small>{page.contractCount} contracts</small></Link>)}</nav>
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

function AcceptanceDashboard() {
  const [records, setRecords] = useState<MigrationAcceptanceRecord[]>(() => readMigrationAcceptanceRecords());
  const [importStatus, setImportStatus] = useState("");
  useEffect(() => {
    const refresh = () => setRecords(readMigrationAcceptanceRecords());
    window.addEventListener("wf-acceptance-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("wf-acceptance-updated", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const rows = manifest.pages.map((manifestPage) => {
    const page = project.pages.find((item) => item.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") === manifestPage.id)!;
    const expected = manifestPage.acceptanceVariants.map((variant) => variant.key);
    const pageRecords = records.filter((record) => record.pageName === page.name && expected.includes(record.variantKey));
    const recorded = new Set(pageRecords.map((record) => record.variantKey));
    const missing = expected.filter((key) => !recorded.has(key));
    const blocked = pageRecords.filter((record) => record.decision === "blocked").length;
    const accepted = pageRecords.filter((record) => record.decision === "accepted-difference").length;
    const issueCount = pageRecords.reduce((sum, record) => sum + record.geometry.issues.length, 0);
    const status = blocked > 0 ? "blocked" : missing.length === 0 ? "passed" : "pending";
    return { manifestPage, page, expected, pageRecords, missing, blocked, accepted, issueCount, status };
  });
  const expectedStates = rows.reduce((sum, row) => sum + row.expected.length, 0);
  const recordedStates = rows.reduce((sum, row) => sum + row.pageRecords.length, 0);
  const passedPages = rows.filter((row) => row.status === "passed").length;
  const blockedPages = rows.filter((row) => row.status === "blocked").length;
  const ready = passedPages === rows.length && blockedPages === 0;
  const exportEvidence = () => downloadMigrationAcceptanceEvidence({
    schemaVersion: 1, gate: "frontend-acceptance-v0.4", exportedAt: new Date().toISOString(),
    target: "refine", sourceRoot: project.sourceRoot,
    summary: { pages: rows.length, passedPages, blockedPages, expectedStates, recordedStates, frontendReady: ready },
    pages: rows.map((row) => ({ pageName: row.page.name, expectedVariantKeys: row.expected, status: row.status })), records,
  });
  const importEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = importMigrationAcceptanceEvidence(JSON.parse(await file.text()));
      setImportStatus("已导入 " + result.imported + " 条，拒绝 " + result.rejected + " 条无效记录");
    } catch (error) {
      setImportStatus("导入失败：" + (error instanceof Error ? error.message : String(error)));
    } finally {
      input.value = "";
    }
  };
  return <section className="acceptance-dashboard">
    <header><div><h1>Frontend Acceptance Gate</h1><p>Refine 视觉基准 · 逐页、逐源码状态记录</p></div><div className="acceptance-header-actions">
      <label>导入验收证据<input type="file" accept="application/json,.json" onChange={importEvidence} /></label>
      <button type="button" onClick={exportEvidence}>导出验收证据</button>
    </div></header>
    {importStatus && <p className="acceptance-import-status" role="status">{importStatus}</p>}
    <div className={"acceptance-readiness " + (ready ? "ready" : blockedPages > 0 ? "blocked" : "pending")}>
      <strong>{ready ? "前端验收已通过，请运行离线 readiness 复核" : blockedPages > 0 ? "存在阻塞页面" : "等待人工布局复核"}</strong>
      <span>{passedPages}/{rows.length} 页面完成 · {recordedStates}/{expectedStates} 状态已记录</span>
    </div>
    <div className="acceptance-table" role="table">
      <div className="acceptance-table-head" role="row"><span>页面</span><span>状态证据</span><span>几何偏差</span><span>结论</span><span /></div>
      {rows.map((row) => { const nextVariant = row.missing[0] || row.expected[0]; return <div className={"acceptance-table-row " + row.status} role="row" key={row.page.name}>
        <span><strong>{row.manifestPage.title}</strong><small>{row.page.name}</small></span>
        <span>{row.pageRecords.length}/{row.expected.length}<small>{row.accepted > 0 ? row.accepted + " 个接受差异" : ""}</small></span>
        <span>{row.issueCount}<small>{row.blocked > 0 ? row.blocked + " 个阻塞结论" : ""}</small></span>
        <span className="acceptance-status">{row.status === "passed" ? "通过" : row.status === "blocked" ? "阻塞" : "待复核"}</span>
        <Link to={row.manifestPage.route + "?wfInspect=1&wfVariant=" + nextVariant}>{row.missing.length > 0 ? "继续复核" : "查看证据"}</Link>
      </div>; })}
    </div>
  </section>;
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

function refineStylesCss(project: ProjectIR): string {
  return `${migrationStylesCss()}${migrationVisualProfileStylesCss(project)}
.workbench { min-height: 100vh; display: grid; grid-template-columns: 248px minmax(0, 1fr); }
.workbench-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: #172033; color: white; }
.workbench-brand { padding: 22px 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
.workbench-brand strong, .workbench-brand span { display: block; }
.workbench-brand span { margin-top: 4px; color: #9eabc0; font-size: 12px; }
.workbench-sidebar nav { flex: 1; overflow: auto; padding: 10px; }
.workbench-sidebar nav a { display: block; padding: 10px 11px; color: #dbe3ef; text-decoration: none; border-radius: 7px; }
.workbench-sidebar nav a:hover { background: #26334a; }
.workbench-sidebar nav .acceptance-nav-link { margin-bottom: 8px; color: #fff; background: #26334a; border: 1px solid #3b4c68; }
.workbench-sidebar nav small { display: block; margin-top: 3px; color: #8795aa; }
.workbench-sidebar footer { padding: 14px 18px; color: #91a0b5; border-top: 1px solid rgba(255,255,255,.1); font-size: 11px; }
.workbench-main { min-width: 0; }
.acceptance-dashboard { min-height: 100vh; padding: 28px; background: #f4f6f8; }
.acceptance-dashboard > header { display: flex; justify-content: space-between; gap: 20px; align-items: center; }
.acceptance-dashboard h1 { margin: 0 0 5px; font-size: 24px; }
.acceptance-dashboard p { margin: 0; color: #657287; }
.acceptance-dashboard > header button { min-height: 34px; padding: 5px 12px; border: 1px solid #7f8da0; border-radius: 5px; background: #fff; }
.acceptance-header-actions { display: flex; gap: 8px; align-items: center; }
.acceptance-header-actions label { min-height: 34px; display: inline-flex; align-items: center; padding: 5px 12px; border: 1px solid #7f8da0; border-radius: 5px; background: #fff; cursor: pointer; }
.acceptance-header-actions input { display: none; }
.acceptance-import-status { margin: 12px 0 -8px; padding: 8px 10px; border: 1px solid #c9d4e0; border-radius: 5px; background: #fff; color: #47566a; }
.acceptance-readiness { display: flex; justify-content: space-between; gap: 20px; margin: 22px 0 14px; padding: 15px 18px; border: 1px solid #d0d7e0; border-radius: 7px; background: #fff; }
.acceptance-readiness.ready { color: #1d6938; border-color: #8bc39d; background: #f2fbf5; }
.acceptance-readiness.blocked { color: #9b3024; border-color: #d9a59f; background: #fff5f3; }
.acceptance-readiness.pending { color: #75571a; border-color: #dcc58d; background: #fffbef; }
.acceptance-table { overflow: hidden; border: 1px solid #d5dbe3; border-radius: 7px; background: #fff; }
.acceptance-table-head, .acceptance-table-row { display: grid; grid-template-columns: minmax(220px,1.6fr) 120px 110px 90px 100px; gap: 12px; align-items: center; padding: 11px 14px; }
.acceptance-table-head { color: #657287; background: #edf1f5; font-size: 12px; font-weight: 650; }
.acceptance-table-row { min-height: 62px; border-top: 1px solid #e3e7ec; }
.acceptance-table-row > span strong, .acceptance-table-row > span small { display: block; }
.acceptance-table-row small { margin-top: 3px; color: #7a8595; font-size: 10px; }
.acceptance-table-row > a { color: #285f9e; text-decoration: none; }
.acceptance-status { width: max-content; padding: 3px 7px; border-radius: 999px; background: #edf1f5; font-size: 11px; }
.acceptance-table-row.passed .acceptance-status { color: #1d6938; background: #e5f6ea; }
.acceptance-table-row.blocked .acceptance-status { color: #9b3024; background: #fde8e5; }
`;
}

function refineReadme(totals: ReturnType<typeof buildTargetManifest>["totals"]): string {
  return `# Refine / React migration spike

Generated from the neutral Project IR. It contains ${totals.pages} pages, ${totals.contracts} event contracts,
and ${totals.sharedComponentTypes} shared component types used by ${totals.sharedComponentInstances} instances.

Run with \`npm install && npm run dev\`. Replace \`src/providers/dataProvider.ts\` with the ASP.NET Core API adapter;
generated files under \`src/generated\` stay disposable.

Use the \`/acceptance\` route to record, export, or import frontend acceptance evidence. Validate an exported file with
\`wf2react acceptance-gate <evidence.json> --manifest src/generated/target-manifest.json --batch-audit <batch-audit.json>\`
before beginning the C# slice.
`;
}
