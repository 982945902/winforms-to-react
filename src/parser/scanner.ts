import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ControlCoverage, ControlSupportStatus, MigrationReport, VisualForm } from "../ir/types.js";
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
  const baseKindMap = await collectBaseKindMap(inputPath);
  const forms: VisualForm[] = [];
  const reports: MigrationReport[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = parseDesignerSource(source, { sourcePath: file, baseKindMap });
    forms.push(result.form);
    reports.push(result.report);
  }

  return {
    forms,
    report: mergeReports(reports)
  };
}

// Scan all non-Designer .cs files for `class X : Y` declarations and build a map
// of custom class name -> base class short name. Used to resolve custom
// WinForms controls to their known base control kind for rendering.
async function collectBaseKindMap(inputPath: string): Promise<Map<string, string>> {
  const csFiles: string[] = [];
  const info = await stat(inputPath);
  if (info.isDirectory()) {
    await walkCs(inputPath, csFiles);
  }

  const map = new Map<string, string>();
  const pattern = /^\s*(?:(?:public|internal|protected|private|sealed|abstract|static|partial)\s+)*class\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w.]*)/gm;
  for (const file of csFiles) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const derived = match[1];
      const base = match[2].split(".").pop() ?? match[2];
      if (derived !== base) map.set(derived, base);
    }
  }
  return map;
}

async function walkCs(dir: string, files: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "bin" || entry.name === "obj" || entry.name === ".git") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkCs(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".cs") && !entry.name.endsWith(".Designer.cs")) {
      files.push(fullPath);
    }
  }
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
    forms: reports.flatMap((report) => report.forms),
    formsConverted: reports.reduce((total, report) => total + report.formsConverted, 0),
    controlsConverted: reports.reduce((total, report) => total + report.controlsConverted, 0),
    supportedControls: mergeSet(reports, "supportedControls", supportedControls),
    degradedControls: mergeSet(reports, "degradedControls", degradedControls),
    unknownControls: mergeSet(reports, "unknownControls", unknownControls),
    controlCoverage: mergeControlCoverage(reports),
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

function mergeControlCoverage(reports: MigrationReport[]): ControlCoverage {
  const counts = new Map<string, { count: number; status: ControlSupportStatus }>();

  for (const report of reports) {
    for (const item of report.controlCoverage.byKind) {
      const existing = counts.get(item.kind);
      counts.set(item.kind, {
        count: (existing?.count ?? 0) + item.count,
        status: mergeStatus(existing?.status, item.status)
      });
    }
  }

  let supported = 0;
  let degraded = 0;
  let unknown = 0;
  const byKind = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, value]) => {
      if (value.status === "supported") supported += value.count;
      if (value.status === "degraded") degraded += value.count;
      if (value.status === "unknown") unknown += value.count;
      return { kind, count: value.count, status: value.status };
    });

  const total = supported + degraded + unknown;
  return {
    total,
    supported,
    degraded,
    unknown,
    supportedPercent: percentage(supported, total),
    previewablePercent: percentage(supported + degraded, total),
    unknownPercent: percentage(unknown, total),
    byKind
  };
}

function mergeStatus(left: ControlSupportStatus | undefined, right: ControlSupportStatus): ControlSupportStatus {
  if (!left) return right;
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "degraded" || right === "degraded") return "degraded";
  return "supported";
}

function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}
