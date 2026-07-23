#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateAcceptanceGate, formatAcceptanceGateMarkdown, writeAcceptanceGateReport } from "./acceptanceEvidence.js";
import { loadActionContractManifests } from "./actionContractManifest.js";
import { buildActionContractCandidateReport } from "./actionContractCandidates.js";
import { buildActionContractDraftBundle, writeActionContractDraftBundle } from "./actionContractDrafts.js";
import { buildActionContractPromotionBundle, writeActionContractPromotionBundle } from "./actionContractPromotions.js";
import { loadBatchManifest } from "./batchManifest.js";
import { buildBatchAuditReport, formatBatchAuditMarkdown, writeBatchAuditReport } from "./batchAudit.js";
import { generateReactProject } from "./generator/reactProjectGenerator.js";
import { generateTanStackFormProject } from "./generator/tanstackFormGenerator.js";
import { generateRefineProject } from "./generator/refineProjectGenerator.js";
import { generateNocoBasePlugin } from "./generator/nocobasePluginGenerator.js";
import { buildProjectIR } from "./ir/projectIr.js";
import type { TargetManifest } from "./ir/targetManifest.js";
import type { ProjectIR } from "./ir/types.js";
import { convertDesignerSources, findDesignerFiles } from "./parser/scanner.js";
import {
  evaluateVisualGate,
  formatVisualGateMarkdown,
  writeVisualGateReport,
} from "./visual/visualParity.js";

type CliOptions = {
  input?: string;
  contextRoot?: string;
  outDir?: string;
  format?: "json" | "text";
  formEngine?: "compat" | "tanstack";
  target?: "compat" | "refine" | "nocobase";
  batchManifest?: string;
  targetManifest?: string;
  batchAudit?: string;
  page?: string;
  baseUrl?: string;
};

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  const options = parseOptions(args);

  switch (command) {
    case "scan":
      await runScan(options);
      return;
    case "convert":
      await runConvert(options);
      return;
    case "report":
      await runReport(options);
      return;
    case "visual-gate":
      await runVisualGate(options);
      return;
    case "batch-audit":
      await runBatchAudit(options);
      return;
    case "action-candidates":
      await runActionCandidates(options);
      return;
    case "action-skeletons":
      await runActionSkeletons(options);
      return;
    case "action-promotions":
      await runActionPromotions(options);
      return;
    case "acceptance-gate":
      await runAcceptanceGate(options);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function runScan(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const files = options.batchManifest
    ? (await loadBatchManifest(options.batchManifest, input)).files
    : await findDesignerFiles(input);
  if (options.format === "json") {
    console.log(JSON.stringify({ files }, null, 2));
    return;
  }
  for (const file of files) console.log(file);
}

async function runConvert(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const outDir = resolve(options.outDir ?? "out/wf2react-preview");
  if (options.target === "refine" || options.target === "nocobase") {
    const project = await buildProjectIR(input, {
      contextRoot: options.contextRoot ? resolve(options.contextRoot) : undefined,
      sourceFiles: batch?.files,
    });
    ensureProjectHasPages(project, input);
    if (batch?.actionContractPaths.length) project.actionContracts = await loadActionContractManifests(batch.actionContractPaths, project);
    if (options.target === "refine") {
      await generateRefineProject({ outDir, project });
    } else {
      await generateNocoBasePlugin({ outDir, project });
    }
    console.log(`Converted ${project.pages.length} form(s) to ${options.target} target`);
    console.log(`Shared components: ${project.components.length} type(s), ${project.components.reduce((n, c) => n + c.instanceCount, 0)} instance(s)`);
    console.log(`Output: ${outDir}`);
    return;
  }
  const result = await convertDesignerSources(input, { designerFiles: batch?.files });
  if (options.formEngine === "tanstack") {
    console.error(
      "wf2react: [deprecated] --form tanstack 已冻结,不再维护。建议使用默认 React Custom 输出。",
    );
    await generateTanStackFormProject({ outDir, forms: result.forms, report: result.report });
    console.log(`Converted ${result.report.formsConverted} form(s) to TanStack Form (deprecated)`);
  } else {
    await generateReactProject({ outDir, forms: result.forms, report: result.report });
    console.log(`Converted ${result.report.formsConverted} form(s), ${result.report.controlsConverted} control(s)`);
  }
  console.log(`Output: ${outDir}`);
}

async function runReport(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const outDir = options.outDir ? resolve(options.outDir) : null;
  const result = await convertDesignerSources(input, { designerFiles: batch?.files });
  const text = JSON.stringify(result.report, null, 2);
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, "migration-report.json"), `${text}\n`, "utf8");
    console.log(`Report written: ${resolve(outDir, "migration-report.json")}`);
    return;
  }
  console.log(text);
}

async function runVisualGate(options: CliOptions) {
  const manifestPath = resolve(options.input ?? "visual-baselines/manifest.json");
  const report = await evaluateVisualGate(manifestPath);
  if (options.outDir) {
    const output = await writeVisualGateReport(report, options.outDir);
    console.log(`Visual gate JSON: ${output.jsonPath}`);
    console.log(`Visual gate Markdown: ${output.markdownPath}`);
  } else if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatVisualGateMarkdown(report));
  }
  if (report.status !== "passed") process.exitCode = 2;
}

async function runBatchAudit(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const project = await buildProjectIR(input, {
    contextRoot: options.contextRoot ? resolve(options.contextRoot) : undefined,
    sourceFiles: batch?.files,
  });
  ensureProjectHasPages(project, input);
  if (batch?.actionContractPaths.length) project.actionContracts = await loadActionContractManifests(batch.actionContractPaths, project);
  const report = buildBatchAuditReport(project);
  if (options.outDir) {
    const output = await writeBatchAuditReport(report, options.outDir);
    console.log(`Batch audit JSON: ${output.jsonPath}`);
    console.log(`Batch audit Markdown: ${output.markdownPath}`);
  } else if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatBatchAuditMarkdown(report));
  }
}

async function runActionCandidates(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const project = await buildProjectIR(input, {
    contextRoot: options.contextRoot ? resolve(options.contextRoot) : undefined,
    sourceFiles: batch?.files,
  });
  ensureProjectHasPages(project, input);
  if (batch?.actionContractPaths.length) project.actionContracts = await loadActionContractManifests(batch.actionContractPaths, project);
  const report = buildActionContractCandidateReport(project);
  if (options.outDir) {
    const outDir = resolve(options.outDir);
    await mkdir(outDir, { recursive: true });
    const output = resolve(outDir, "action-contract.candidates.json");
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`ActionContract candidates: ${output}`);
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

async function runActionSkeletons(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const project = await buildProjectIR(input, {
    contextRoot: options.contextRoot ? resolve(options.contextRoot) : undefined,
    sourceFiles: batch?.files,
  });
  ensureProjectHasPages(project, input);
  if (batch?.actionContractPaths.length) project.actionContracts = await loadActionContractManifests(batch.actionContractPaths, project);
  const bundle = buildActionContractDraftBundle(project, { page: options.page, baseUrl: options.baseUrl });
  if (options.outDir) {
    const output = await writeActionContractDraftBundle(bundle, options.outDir);
    console.log(`ActionContract skeleton bundle: ${output.bundlePath}`);
    console.log(`ActionContract skeleton summary: ${output.markdownPath}`);
    console.log(`Page drafts: ${output.pagePaths.length}`);
    return;
  }
  console.log(JSON.stringify(bundle, null, 2));
}

async function runActionPromotions(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const batch = options.batchManifest ? await loadBatchManifest(options.batchManifest, input) : undefined;
  const project = await buildProjectIR(input, {
    contextRoot: options.contextRoot ? resolve(options.contextRoot) : undefined,
    sourceFiles: batch?.files,
  });
  ensureProjectHasPages(project, input);
  if (batch?.actionContractPaths.length) project.actionContracts = await loadActionContractManifests(batch.actionContractPaths, project);
  const bundle = buildActionContractPromotionBundle(project, { page: options.page, baseUrl: options.baseUrl });
  if (options.outDir) {
    const output = await writeActionContractPromotionBundle(bundle, options.outDir);
    console.log(`ActionContract promotion bundle: ${output.bundlePath}`);
    console.log(`ActionContract promotion summary: ${output.markdownPath}`);
    console.log(`Page proposals: ${output.pagePaths.length}`);
    return;
  }
  console.log(JSON.stringify(bundle, null, 2));
}

async function runAcceptanceGate(options: CliOptions) {
  const evidencePath = resolveRequiredInput(options);
  if (!options.targetManifest) throw new Error("acceptance-gate requires --manifest <target-manifest.json>");
  if (!options.batchAudit) throw new Error("acceptance-gate requires --batch-audit <batch-audit.json>");
  const manifestPath = resolve(options.targetManifest);
  const batchAuditPath = resolve(options.batchAudit);
  const [evidenceText, manifestText, batchAuditText] = await Promise.all([
    readFile(evidencePath, "utf8"),
    readFile(manifestPath, "utf8"),
    readFile(batchAuditPath, "utf8"),
  ]);
  const report = evaluateAcceptanceGate(
    JSON.parse(manifestText) as TargetManifest,
    JSON.parse(evidenceText) as unknown,
    { batchAudit: JSON.parse(batchAuditText) as ReturnType<typeof buildBatchAuditReport> },
  );
  if (options.outDir) {
    const output = await writeAcceptanceGateReport(report, options.outDir);
    console.log(`Acceptance gate JSON: ${output.jsonPath}`);
    console.log(`Acceptance gate Markdown: ${output.markdownPath}`);
  } else if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAcceptanceGateMarkdown(report));
  }
  if (!report.readyForCSharpSlice) process.exitCode = 2;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      options.outDir = args[++i];
    } else if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--form") {
      options.formEngine = args[++i] as "tanstack";
    } else if (arg === "--target") {
      const target = args[++i];
      if (target !== "compat" && target !== "refine" && target !== "nocobase") {
        throw new Error(`Unknown target: ${target}`);
      }
      options.target = target;
    } else if (arg === "--context") {
      options.contextRoot = args[++i];
    } else if (arg === "--batch") {
      options.batchManifest = args[++i];
    } else if (arg === "--manifest") {
      options.targetManifest = args[++i];
    } else if (arg === "--batch-audit") {
      options.batchAudit = args[++i];
    } else if (arg === "--page") {
      options.page = args[++i];
    } else if (arg === "--base-url") {
      options.baseUrl = args[++i];
    } else if (!options.input) {
      options.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function resolveRequiredInput(options: CliOptions): string {
  if (!options.input) {
    throw new Error("Missing input path");
  }
  return resolve(options.input);
}

function ensureProjectHasPages(project: ProjectIR, input: string): void {
  if (project.pages.length > 0) return;
  throw new Error(`No migratable Form pages were resolved from ${input}. Supply a complete --context so the selected type's base chain reaches System.Windows.Forms.Form.`);
}

function printHelp() {
  console.log(`wf2react

Usage:
  wf2react scan <file-or-folder> [--batch <manifest.json>] [--json]
  wf2react convert <file-or-folder> --out <dir> [--target compat|refine|nocobase] [--context <project-root>] [--batch <manifest.json>]
  wf2react report <file-or-folder> [--batch <manifest.json>] [--out <dir>]
  wf2react batch-audit <file-or-folder> [--batch <manifest.json>] [--context <project-root>] [--json] [--out <dir>]
  wf2react action-candidates <file-or-folder> [--batch <manifest.json>] [--context <project-root>] [--out <dir>]
  wf2react action-skeletons <file-or-folder> [--batch <manifest.json>] [--context <project-root>] [--page <FormName>] [--base-url <url>] [--out <dir>]
  wf2react action-promotions <file-or-folder> [--batch <manifest.json>] [--context <project-root>] [--page <FormName>] [--base-url <url>] [--out <dir>]
  wf2react acceptance-gate <evidence.json> --manifest <target-manifest.json> --batch-audit <batch-audit.json> [--json] [--out <dir>]
  wf2react visual-gate [manifest.json] [--json] [--out <dir>]

  --form tanstack  [已废弃] 生成 TanStack Form + Zod,而非默认 React 预览。冻结不再维护。
  --target refine  生成可运行的 Refine/React 验证项目。
  --target nocobase 生成可放入 NocoBase 2.1 workspace 的 client-v2 插件源码。
  --context <path>  为单窗体迁移提供更大的源码上下文，用于解析运行时枚举等数据契约。
  --batch <path>    只转换清单 files 中列出的 Designer 文件；路径相对于输入项目目录。
  --page <FormName> 只为一个页面生成未映射的 ActionContract skeleton。
  --base-url <url>  写入 skeleton planHeaderTemplate 的后端基址；默认保留 TODO 占位符。
  --manifest <path> acceptance-gate 使用的生成目标清单，用于验证页面和源码状态矩阵。
  --batch-audit <path> acceptance-gate 使用的批次审计，用于合并静态门槛与推荐 C# 纵切页面。

  visual-gate 校验原生/Web PNG 尺寸、计算像素诊断并读取人工视觉复核；缺失证据时退出码为 2。
  acceptance-gate 合并人工证据与批次静态门槛；缺失、阻塞、无效证据或静态检查失败时退出码为 2。
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`wf2react: ${message}`);
  process.exitCode = 1;
});
