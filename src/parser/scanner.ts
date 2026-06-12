import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { MigrationReport, VisualForm } from "../ir/types.js";
import { parseDesignerSource } from "./designerParser.js";

export type ConvertSourceResult = {
  forms: VisualForm[];
  report: MigrationReport;
};

export async function findDesignerFiles(inputPath: string): Promise<string[]> {
  const info = await stat(inputPath);
  if (info.isFile()) {
    return inputPath.endsWith(".Designer.cs") ? [inputPath] : [];
  }

  const files: string[] = [];
  await walk(inputPath, files);
  return files.sort();
}

export async function convertDesignerSources(inputPath: string): Promise<ConvertSourceResult> {
  const files = await findDesignerFiles(inputPath);
  const forms: VisualForm[] = [];
  const reports: MigrationReport[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = parseDesignerSource(source, { sourcePath: file });
    forms.push(result.form);
    reports.push(result.report);
  }

  return {
    forms,
    report: mergeReports(reports)
  };
}

async function walk(dir: string, files: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "bin" || entry.name === "obj" || entry.name === ".git") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".Designer.cs")) {
      files.push(fullPath);
    }
  }
}

function mergeReports(reports: MigrationReport[]): MigrationReport {
  const supportedControls = new Set<string>();
  const degradedControls = new Set<string>();
  const unknownControls = new Set<string>();
  return {
    sourceFiles: reports.flatMap((report) => report.sourceFiles),
    formsConverted: reports.reduce((total, report) => total + report.formsConverted, 0),
    controlsConverted: reports.reduce((total, report) => total + report.controlsConverted, 0),
    supportedControls: mergeSet(reports, "supportedControls", supportedControls),
    degradedControls: mergeSet(reports, "degradedControls", degradedControls),
    unknownControls: mergeSet(reports, "unknownControls", unknownControls),
    eventStubs: reports.flatMap((report) => report.eventStubs)
  };
}

function mergeSet(
  reports: MigrationReport[],
  key: "supportedControls" | "degradedControls" | "unknownControls",
  target: Set<string>
): string[] {
  for (const report of reports) {
    for (const value of report[key]) target.add(value);
  }
  return [...target].sort();
}
