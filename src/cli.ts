#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReactProject } from "./generator/reactProjectGenerator.js";
import { convertDesignerSources, findDesignerFiles } from "./parser/scanner.js";

type CliOptions = {
  input?: string;
  outDir?: string;
  format?: "json" | "text";
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
  const result = await convertDesignerSources(input);
  await generateReactProject({ outDir, forms: result.forms, report: result.report });
  console.log(`Converted ${result.report.formsConverted} form(s), ${result.report.controlsConverted} control(s)`);
  console.log(`Preview project: ${outDir}`);
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
  wf2react convert <file-or-folder> --out <preview-project-dir>
  wf2react report <file-or-folder> [--out <dir>]

The first version converts WinForms Designer source to a standalone React
compatibility preview. Business logic migration is intentionally out of scope.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`wf2react: ${message}`);
  process.exitCode = 1;
});
