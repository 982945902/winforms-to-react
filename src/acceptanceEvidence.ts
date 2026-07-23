import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BatchAuditReport } from "./batchAudit.js";
import type { TargetManifest } from "./ir/targetManifest.js";

export type FrontendAcceptanceDecision = "pass" | "accepted-difference" | "blocked";

export type FrontendAcceptanceRecord = {
  schemaVersion: 1;
  pageName: string;
  pageTitle: string;
  variantKey: string;
  variantLabels: string[];
  decision: FrontendAcceptanceDecision;
  notes: string;
  recordedAt: string;
  viewport: { width: number; height: number };
  geometry: {
    checked: number;
    issues: Array<{ type: string; [key: string]: unknown }>;
    byType?: Record<string, number>;
  };
};

export type AcceptanceGateReport = {
  schemaVersion: 1;
  status: "ready" | "pending" | "blocked" | "invalid";
  frontendReady: boolean;
  readyForCSharpSlice: boolean;
  csharpSlice?: {
    page: string;
    status: "ready" | "pending" | "blocked";
    checks: Array<{ id: string; passed: boolean; observed: string; required: string }>;
    remaining: string[];
  };
  summary: {
    pages: number;
    passedPages: number;
    pendingPages: number;
    blockedPages: number;
    expectedStates: number;
    recordedStates: number;
    acceptedDifferenceStates: number;
    geometryIssues: number;
    missingStates: number;
    invalidRecords: number;
    staleRecords: number;
  };
  pages: Array<{
    pageName: string;
    title: string;
    status: "passed" | "pending" | "blocked";
    expectedVariantKeys: string[];
    recordedVariantKeys: string[];
    missingVariantKeys: string[];
    blockedVariantKeys: string[];
    acceptedDifferenceVariantKeys: string[];
    geometryIssues: number;
  }>;
  invalidRecords: Array<{ index: number; key?: string; reason: string }>;
  staleRecords: Array<{ pageName: string; variantKey: string }>;
};

const DECISIONS = new Set<FrontendAcceptanceDecision>(["pass", "accepted-difference", "blocked"]);

export function evaluateAcceptanceGate(
  manifest: TargetManifest,
  payload: unknown,
  options: { batchAudit?: BatchAuditReport } = {},
): AcceptanceGateReport {
  const rawRecords = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.records) ? payload.records : undefined;
  const invalidRecords: AcceptanceGateReport["invalidRecords"] = [];
  if (!rawRecords) invalidRecords.push({ index: -1, reason: "Evidence must be an array or an object with a records array." });

  const recordsByKey = new Map<string, FrontendAcceptanceRecord>();
  for (const [index, raw] of (rawRecords ?? []).entries()) {
    const validated = validateRecord(raw);
    if (typeof validated === "string") {
      invalidRecords.push({ index, ...(recordKey(raw) ? { key: recordKey(raw) } : {}), reason: validated });
      continue;
    }
    const key = acceptanceKey(validated.pageName, validated.variantKey);
    if (recordsByKey.has(key)) {
      invalidRecords.push({ index, key, reason: "Duplicate page/state record." });
      continue;
    }
    recordsByKey.set(key, validated);
  }

  const expectedKeys = new Set(manifest.pages.flatMap((page) =>
    page.acceptanceVariants.map((variant) => acceptanceKey(sourcePageName(page), variant.key))));
  const staleRecords = [...recordsByKey.entries()]
    .filter(([key]) => !expectedKeys.has(key))
    .map(([, record]) => ({ pageName: record.pageName, variantKey: record.variantKey }));

  const pages = manifest.pages.map((page) => {
    const pageName = sourcePageName(page);
    const expectedVariantKeys = page.acceptanceVariants.map((variant) => variant.key);
    const records = expectedVariantKeys
      .map((variantKey) => recordsByKey.get(acceptanceKey(pageName, variantKey)))
      .filter((record): record is FrontendAcceptanceRecord => Boolean(record));
    const recordedVariantKeys = records.map((record) => record.variantKey);
    const recorded = new Set(recordedVariantKeys);
    const missingVariantKeys = expectedVariantKeys.filter((key) => !recorded.has(key));
    const blockedVariantKeys = records.filter((record) => record.decision === "blocked").map((record) => record.variantKey);
    const acceptedDifferenceVariantKeys = records
      .filter((record) => record.decision === "accepted-difference")
      .map((record) => record.variantKey);
    const status = blockedVariantKeys.length > 0 ? "blocked" as const
      : missingVariantKeys.length > 0 ? "pending" as const : "passed" as const;
    return {
      pageName,
      title: page.title,
      status,
      expectedVariantKeys,
      recordedVariantKeys,
      missingVariantKeys,
      blockedVariantKeys,
      acceptedDifferenceVariantKeys,
      geometryIssues: records.reduce((sum, record) => sum + record.geometry.issues.length, 0),
    };
  });

  const relevantRecords = [...recordsByKey.entries()].filter(([key]) => expectedKeys.has(key)).map(([, record]) => record);
  const passedPages = pages.filter((page) => page.status === "passed").length;
  const pendingPages = pages.filter((page) => page.status === "pending").length;
  const blockedPages = pages.filter((page) => page.status === "blocked").length;
  const expectedStates = pages.reduce((sum, page) => sum + page.expectedVariantKeys.length, 0);
  const recordedStates = relevantRecords.length;
  const missingStates = expectedStates - recordedStates;
  const status = invalidRecords.length > 0 ? "invalid" as const
    : blockedPages > 0 ? "blocked" as const
      : missingStates > 0 ? "pending" as const : "ready" as const;
  const frontendReady = status === "ready";
  const staticGate = options.batchAudit?.csharpSliceGate;
  const csharpSlice = staticGate ? (() => {
    const checks = staticGate.checks.map((check) => check.id === "layout-review" ? {
      ...check,
      passed: frontendReady,
      observed: frontendReady
        ? `${passedPages}/${pages.length} pages and ${recordedStates}/${expectedStates} states accepted with no blockers`
        : `${passedPages}/${pages.length} pages and ${recordedStates}/${expectedStates} states accepted; frontend status ${status}`,
    } : check);
    const staticBlocked = checks.some((check) => check.id !== "layout-review" && !check.passed);
    const sliceStatus = staticBlocked || status === "blocked" || status === "invalid" ? "blocked" as const
      : status === "pending" ? "pending" as const : "ready" as const;
    return {
      page: staticGate.page,
      status: sliceStatus,
      checks,
      remaining: checks.filter((check) => !check.passed)
        .map((check) => `${check.id}: ${check.observed}; requires ${check.required}`),
    };
  })() : undefined;

  return {
    schemaVersion: 1,
    status,
    frontendReady,
    readyForCSharpSlice: csharpSlice?.status === "ready",
    ...(csharpSlice ? { csharpSlice } : {}),
    summary: {
      pages: pages.length,
      passedPages,
      pendingPages,
      blockedPages,
      expectedStates,
      recordedStates,
      acceptedDifferenceStates: relevantRecords.filter((record) => record.decision === "accepted-difference").length,
      geometryIssues: relevantRecords.reduce((sum, record) => sum + record.geometry.issues.length, 0),
      missingStates,
      invalidRecords: invalidRecords.length,
      staleRecords: staleRecords.length,
    },
    pages,
    invalidRecords,
    staleRecords,
  };
}

export function formatAcceptanceGateMarkdown(report: AcceptanceGateReport): string {
  const lines = [
    "# Frontend Acceptance Gate v0.4",
    "",
    `Frontend status: **${report.status}**`,
    `C# ActionContract slice ready: **${report.readyForCSharpSlice ? "yes" : "no"}**${report.csharpSlice ? ` — ${report.csharpSlice.page}` : " — batch audit not supplied"}`,
    "",
    `- Pages: ${report.summary.passedPages}/${report.summary.pages} passed; ${report.summary.pendingPages} pending; ${report.summary.blockedPages} blocked`,
    `- Evidence states: ${report.summary.recordedStates}/${report.summary.expectedStates}; ${report.summary.missingStates} missing`,
    `- Accepted differences: ${report.summary.acceptedDifferenceStates}`,
    `- Recorded geometry issues: ${report.summary.geometryIssues}`,
    `- Invalid records: ${report.summary.invalidRecords}`,
    `- Stale records: ${report.summary.staleRecords}`,
    "",
    "## Pages",
    "",
    "| Page | Status | Evidence | Missing | Blocked | Accepted differences | Geometry issues |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.pages.map((page) =>
      `| ${page.pageName} | ${page.status} | ${page.recordedVariantKeys.length}/${page.expectedVariantKeys.length} | ${page.missingVariantKeys.length} | ${page.blockedVariantKeys.length} | ${page.acceptedDifferenceVariantKeys.length} | ${page.geometryIssues} |`),
  ];
  if (report.csharpSlice) lines.push(
    "",
    `## C# readiness — ${report.csharpSlice.page}`,
    "",
    `Status: **${report.csharpSlice.status}**`,
    "",
    ...report.csharpSlice.checks.map((check) =>
      `- ${check.passed ? "PASS" : "PENDING"} ${check.id}: ${check.observed} (required ${check.required})`),
  );
  if (report.invalidRecords.length > 0) lines.push(
    "",
    "## Invalid records",
    "",
    ...report.invalidRecords.map((item) => `- #${item.index}${item.key ? ` ${item.key}` : ""}: ${item.reason}`),
  );
  if (report.staleRecords.length > 0) lines.push(
    "",
    "## Stale records",
    "",
    ...report.staleRecords.map((item) => `- ${acceptanceKey(item.pageName, item.variantKey)}`),
  );
  return `${lines.join("\n")}\n`;
}

export async function writeAcceptanceGateReport(report: AcceptanceGateReport, outDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const jsonPath = resolve(output, "acceptance-gate.json");
  const markdownPath = resolve(output, "acceptance-gate.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatAcceptanceGateMarkdown(report), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

function validateRecord(value: unknown): FrontendAcceptanceRecord | string {
  if (!isObject(value)) return "Record must be an object.";
  if (value.schemaVersion !== 1) return "schemaVersion must be 1.";
  if (typeof value.pageName !== "string" || !value.pageName) return "pageName is required.";
  if (typeof value.pageTitle !== "string") return "pageTitle must be a string.";
  if (typeof value.variantKey !== "string" || !value.variantKey) return "variantKey is required.";
  if (!Array.isArray(value.variantLabels) || value.variantLabels.some((label) => typeof label !== "string")) return "variantLabels must be a string array.";
  if (typeof value.decision !== "string" || !DECISIONS.has(value.decision as FrontendAcceptanceDecision)) return "decision is invalid.";
  if (typeof value.notes !== "string") return "notes must be a string.";
  if (value.decision !== "pass" && !value.notes.trim()) return "accepted-difference and blocked records require notes.";
  if (typeof value.recordedAt !== "string" || !Number.isFinite(Date.parse(value.recordedAt))) return "recordedAt must be an ISO-compatible timestamp.";
  if (!isObject(value.viewport) || !positiveNumber(value.viewport.width) || !positiveNumber(value.viewport.height)) return "viewport must contain positive width and height.";
  if (!isObject(value.geometry) || !Number.isInteger(value.geometry.checked) || Number(value.geometry.checked) <= 0 || !Array.isArray(value.geometry.issues)) {
    return "geometry must contain a positive checked count and an issues array.";
  }
  if (value.geometry.issues.some((issue) => !isObject(issue) || typeof issue.type !== "string")) return "every geometry issue must have a type.";
  if (value.decision === "pass" && value.geometry.issues.length > 0) return "pass records cannot contain geometry issues.";
  return value as FrontendAcceptanceRecord;
}

function sourcePageName(page: TargetManifest["pages"][number]): string {
  return page.pageName;
}

function acceptanceKey(pageName: string, variantKey: string): string {
  return `${pageName}::${variantKey}`;
}

function recordKey(value: unknown): string | undefined {
  return isObject(value) && typeof value.pageName === "string" && typeof value.variantKey === "string"
    ? acceptanceKey(value.pageName, value.variantKey) : undefined;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
