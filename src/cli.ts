#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReactProject } from "./generator/reactProjectGenerator.js";
import { generateTanStackFormProject } from "./generator/tanstackFormGenerator.js";
import { generateRefineProject } from "./generator/refineProjectGenerator.js";
import { generateNocoBasePlugin } from "./generator/nocobasePluginGenerator.js";
import { buildProjectIR } from "./ir/projectIr.js";
import { convertDesignerSources, findDesignerFiles } from "./parser/scanner.js";

type CliOptions = {
  input?: string;
  outDir?: string;
  format?: "json" | "text";
  formEngine?: "compat" | "tanstack";
  target?: "compat" | "refine" | "nocobase";
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
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function runScan(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const files = await findDesignerFiles(input);
  if (options.format === "json") {
    console.log(JSON.stringify({ files }, null, 2));
    return;
  }
  for (const file of files) console.log(file);
}

async function runConvert(options: CliOptions) {
  const input = resolveRequiredInput(options);
  const outDir = resolve(options.outDir ?? "out/wf2react-preview");
  if (options.target === "refine" || options.target === "nocobase") {
    const project = await buildProjectIR(input);
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
  const result = await convertDesignerSources(input);
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
  const outDir = options.outDir ? resolve(options.outDir) : null;
  const result = await convertDesignerSources(input);
  const text = JSON.stringify(result.report, null, 2);
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, "migration-report.json"), `${text}\n`, "utf8");
    console.log(`Report written: ${resolve(outDir, "migration-report.json")}`);
    return;
  }
  console.log(text);
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

function printHelp() {
  console.log(`wf2react

Usage:
  wf2react scan <file-or-folder> [--json]
  wf2react convert <file-or-folder> --out <dir> [--target compat|refine|nocobase]
  wf2react report <file-or-folder> [--out <dir>]

  --form tanstack  [已废弃] 生成 TanStack Form + Zod,而非默认 React 预览。冻结不再维护。
  --target refine  生成可运行的 Refine/React 验证项目。
  --target nocobase 生成可放入 NocoBase 2.1 workspace 的 client-v2 插件源码。
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`wf2react: ${message}`);
  process.exitCode = 1;
});
