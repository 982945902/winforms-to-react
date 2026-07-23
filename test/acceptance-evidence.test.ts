import { describe, expect, it } from "vitest";
import {
  evaluateAcceptanceGate,
  formatAcceptanceGateMarkdown,
  type FrontendAcceptanceDecision,
  type FrontendAcceptanceRecord,
} from "../src/acceptanceEvidence.js";
import type { BatchAuditReport } from "../src/batchAudit.js";
import type { TargetManifest } from "../src/ir/targetManifest.js";

const manifest = {
  pages: [
    { pageName: "FormDefault", title: "Default", acceptanceVariants: [{ key: "default", labels: [] }] },
    { pageName: "FormVariants", title: "Variants", acceptanceVariants: [
      { key: "0", labels: ["A"] }, { key: "1", labels: ["B"] },
    ] },
  ],
} as unknown as TargetManifest;

const batchAudit = {
  csharpSliceGate: {
    page: "FormExport",
    status: "manual-layout-review-required",
    checks: [
      { id: "unknown-controls", passed: true, observed: "0", required: "0" },
      { id: "shared-instance-coverage", passed: true, observed: "95%", required: ">=90%" },
      { id: "layout-review", passed: false, observed: "not recorded", required: "all selected pages reviewed" },
    ],
    remaining: [],
  },
} as unknown as BatchAuditReport;

function record(pageName: string, variantKey: string, decision: FrontendAcceptanceDecision = "pass", issues: string[] = []): FrontendAcceptanceRecord {
  return {
    schemaVersion: 1,
    pageName,
    pageTitle: pageName,
    variantKey,
    variantLabels: [],
    decision,
    notes: decision === "pass" ? "" : "reviewed difference",
    recordedAt: "2026-07-16T10:00:00.000Z",
    viewport: { width: 1440, height: 900 },
    geometry: { checked: 10, issues: issues.map((type) => ({ type })), byType: {} },
  };
}

describe("frontend acceptance evidence", () => {
  it("keeps the gate pending until every manifest state has evidence", () => {
    const report = evaluateAcceptanceGate(manifest, { records: [record("FormDefault", "default")] });
    expect(report.status).toBe("pending");
    expect(report.readyForCSharpSlice).toBe(false);
    expect(report.summary).toMatchObject({ expectedStates: 3, recordedStates: 1, missingStates: 2 });
    expect(report.pages.find((page) => page.pageName === "FormVariants")?.missingVariantKeys).toEqual(["0", "1"]);
  });

  it("accepts documented differences and ignores valid stale records", () => {
    const report = evaluateAcceptanceGate(manifest, { records: [
      record("FormDefault", "default"),
      record("FormVariants", "0", "accepted-difference", ["overlap"]),
      record("FormVariants", "1"),
      record("RemovedPage", "default"),
    ] }, { batchAudit });
    expect(report.status).toBe("ready");
    expect(report.frontendReady).toBe(true);
    expect(report.readyForCSharpSlice).toBe(true);
    expect(report.csharpSlice).toMatchObject({ page: "FormExport", status: "ready" });
    expect(report.summary).toMatchObject({ acceptedDifferenceStates: 1, geometryIssues: 1, staleRecords: 1 });
    expect(formatAcceptanceGateMarkdown(report)).toContain("C# ActionContract slice ready: **yes**");
  });

  it("does not declare C# readiness when a non-layout batch check fails", () => {
    const staticBlockedAudit = structuredClone(batchAudit);
    staticBlockedAudit.csharpSliceGate!.checks[0].passed = false;
    staticBlockedAudit.csharpSliceGate!.checks[0].observed = "2";
    const report = evaluateAcceptanceGate(manifest, { records: [
      record("FormDefault", "default"), record("FormVariants", "0"), record("FormVariants", "1"),
    ] }, { batchAudit: staticBlockedAudit });
    expect(report.status).toBe("ready");
    expect(report.frontendReady).toBe(true);
    expect(report.readyForCSharpSlice).toBe(false);
    expect(report.csharpSlice?.status).toBe("blocked");
  });

  it("reports a valid manual blocker", () => {
    const report = evaluateAcceptanceGate(manifest, { records: [
      record("FormDefault", "default"), record("FormVariants", "0", "blocked"), record("FormVariants", "1"),
    ] });
    expect(report.status).toBe("blocked");
    expect(report.summary.blockedPages).toBe(1);
    expect(report.pages[1].blockedVariantKeys).toEqual(["0"]);
  });

  it("rejects contradictory pass records and duplicate state evidence", () => {
    const report = evaluateAcceptanceGate(manifest, { records: [
      record("FormDefault", "default", "pass", ["clipped"]),
      record("FormVariants", "0"),
      record("FormVariants", "0"),
      record("FormVariants", "1"),
    ] });
    expect(report.status).toBe("invalid");
    expect(report.readyForCSharpSlice).toBe(false);
    expect(report.invalidRecords.map((item) => item.reason)).toEqual([
      "pass records cannot contain geometry issues.",
      "Duplicate page/state record.",
    ]);
  });
});
