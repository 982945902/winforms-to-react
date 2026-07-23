import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ContractPoint, ProjectIR, VisualControl } from "./ir/types.js";
import { buildTargetManifest } from "./ir/targetManifest.js";
import { migrationComponentAdapters } from "./generator/migrationVisualProfiles.js";
import { classifyActionEvidence, classifyCalledSymbol, isLocalLifecycleState, type CapabilityEvidence } from "./actionCapabilities.js";
import { buildActionContractCandidateReport } from "./actionContractCandidates.js";

export { classifyCalledSymbol } from "./actionCapabilities.js";

export type ContractCapability =
  | "data"
  | "filesystem"
  | "external-service"
  | "security"
  | "navigation"
  | "validation"
  | "ui"
  | "no-op"
  | "unclassified";

export type AuditedContract = {
  controlName: string;
  event: string;
  handler: string;
  sourceFile: string;
  lineStart: number;
  calledSymbols: string[];
  transitiveCalledSymbols: string[];
  propertyReads: string[];
  assignedSymbols: string[];
  constructedTypes: string[];
  awaitedCalls: string[];
  capabilityEvidence: CapabilityEvidence[];
  capabilities: ContractCapability[];
};

export type BatchAuditReport = {
  schemaVersion: 1;
  sourceRoot: string;
  coverage: {
    pages: number;
    controls: ProjectIR["report"]["controlCoverage"];
    actionContracts: {
      total: number;
      classified: number;
      unclassified: number;
      byCapability: Record<ContractCapability, number>;
    };
    actionContractMappings: ReturnType<typeof buildActionContractCandidateReport>["summary"];
    sharedComponents: {
      types: { total: number; defined: number; adapted: number; uncovered: number; coveredPercent: number };
      instances: { total: number; defined: number; adapted: number; uncovered: number; coveredPercent: number };
    };
  };
  layoutGate: {
    execution: "generated-runtime";
    query: "wfInspect=1";
    tolerancePx: number;
    expectedReviewStates: number;
    checks: Array<"size" | "position" | "out-of-bounds" | "clipped" | "overlap">;
  };
  externalComponents: Array<{ id: string; instanceCount: number; sourcePath?: string }>;
  adaptedComponents: Array<{ id: string; adapter: string; instanceCount: number }>;
  pages: Array<{
    name: string;
    title: string;
    sourcePath: string;
    controls: number;
    actionContracts: number;
    capabilities: ContractCapability[];
  }>;
  defects: Array<{
    severity: "blocking" | "manual-review";
    kind: "unknown-control" | "degraded-control" | "external-component" | "unclassified-contract";
    message: string;
  }>;
  recommendedVerticalSlice?: {
    page: string;
    title: string;
    score: number;
    reasons: string[];
    contracts: AuditedContract[];
  };
  csharpSliceGate?: {
    page: string;
    status: "blocked" | "manual-layout-review-required";
    checks: Array<{ id: string; passed: boolean; observed: string; required: string }>;
    remaining: string[];
  };
};

const CAPABILITIES: Exclude<ContractCapability, "unclassified" | "no-op">[] = [
  "data", "filesystem", "external-service", "security", "navigation", "validation", "ui",
];
const ALL_CAPABILITIES: ContractCapability[] = [...CAPABILITIES, "no-op", "unclassified"];

export function buildBatchAuditReport(project: ProjectIR): BatchAuditReport {
  const target = buildTargetManifest(project, { componentAdapters: migrationComponentAdapters(project) });
  const auditedByPage = new Map(project.pages.map((page) => [
    page.name,
    page.support.contractPoints.map((contract) => auditContract(contract, new Set([page.name, ...flattenControls(page.controls).map((control) => control.name)]))),
  ]));
  const allContracts = [...auditedByPage.values()].flat();
  const actionContractCandidates = buildActionContractCandidateReport(project);
  const capabilityCounts = Object.fromEntries(
    ALL_CAPABILITIES.map((capability) => [
      capability,
      allContracts.filter((contract) => contract.capabilities.includes(capability)).length,
    ]),
  ) as Record<ContractCapability, number>;
  const externalComponents = target.sharedComponents
    .filter((component) => component.renderStatus === "fallback")
    .map((component) => ({
      id: component.id, instanceCount: component.instanceCount,
      ...(project.components.find((source) => source.id === component.id)?.sourcePath
        ? { sourcePath: project.components.find((source) => source.id === component.id)!.sourcePath }
        : {}),
    }));
  const adaptedComponents = target.sharedComponents
    .filter((component) => component.renderStatus === "adapter" && component.adapter)
    .map((component) => ({ id: component.id, adapter: component.adapter!, instanceCount: component.instanceCount }));
  const pages = project.pages.map((page) => {
    const contracts = auditedByPage.get(page.name) ?? [];
    return {
      name: page.name,
      title: page.text ?? page.name,
      sourcePath: page.sourcePath,
      controls: flattenControls(page.controls).length,
      actionContracts: contracts.length,
      capabilities: distinctCapabilities(contracts),
    };
  });
  const defects: BatchAuditReport["defects"] = [];
  if (project.report.controlCoverage.unknown > 0) defects.push({
    severity: "blocking", kind: "unknown-control",
    message: `${project.report.controlCoverage.unknown} control(s) have no preview mapping: ${project.report.unknownControls.join(", ")}`,
  });
  if (project.report.controlCoverage.degraded > 0) defects.push({
    severity: "manual-review", kind: "degraded-control",
    message: `${project.report.controlCoverage.degraded} control(s) use degraded mappings: ${project.report.degradedControls.join(", ")}`,
  });
  for (const component of externalComponents) defects.push({
    severity: "manual-review", kind: "external-component",
    message: `${component.id} is unresolved and used ${component.instanceCount} time(s); add one type-level adapter or definition.`,
  });
  if (capabilityCounts.unclassified > 0) defects.push({
    severity: "manual-review", kind: "unclassified-contract",
    message: `${capabilityCounts.unclassified} ActionContract(s) have no classified boundary and need source review.`,
  });

  const slice = project.pages
    .map((page) => scoreVerticalSlice(page.name, page.text ?? page.name, auditedByPage.get(page.name) ?? []))
    .filter((candidate) => candidate.contracts.length > 0)
    .sort((left, right) => right.score - left.score || left.contracts.length - right.contracts.length || left.page.localeCompare(right.page))[0];
  const sharedInstanceCoverage = percent(
    target.totals.definedSharedComponentInstances + target.totals.adaptedSharedComponentInstances,
    target.totals.sharedComponentInstances,
  );
  const sliceChecks = slice ? [
    { id: "unknown-controls", passed: project.report.controlCoverage.unknown === 0,
      observed: `${project.report.controlCoverage.unknown}`, required: "0" },
    { id: "shared-instance-coverage", passed: sharedInstanceCoverage >= 90,
      observed: `${sharedInstanceCoverage}%`, required: ">=90%" },
    { id: "uncovered-shared-instances", passed: target.totals.fallbackSharedComponentInstances <= 2,
      observed: `${target.totals.fallbackSharedComponentInstances}`, required: "<=2" },
    { id: "layout-review", passed: false,
      observed: "not recorded", required: "12 selected pages reviewed with no blocking clipping/overlap" },
  ] : [];
  const quantitativeSliceGatePassed = sliceChecks.filter((check) => check.id !== "layout-review").every((check) => check.passed);

  return {
    schemaVersion: 1,
    sourceRoot: project.sourceRoot,
    coverage: {
      pages: target.totals.pages,
      controls: project.report.controlCoverage,
      actionContracts: {
        total: allContracts.length,
        classified: allContracts.length - capabilityCounts.unclassified,
        unclassified: capabilityCounts.unclassified,
        byCapability: capabilityCounts,
      },
      actionContractMappings: actionContractCandidates.summary,
      sharedComponents: {
        types: {
          total: target.totals.sharedComponentTypes,
          defined: target.totals.definedSharedComponentTypes,
          adapted: target.totals.adaptedSharedComponentTypes,
          uncovered: target.totals.fallbackSharedComponentTypes,
          coveredPercent: percent(target.totals.definedSharedComponentTypes + target.totals.adaptedSharedComponentTypes, target.totals.sharedComponentTypes),
        },
        instances: {
          total: target.totals.sharedComponentInstances,
          defined: target.totals.definedSharedComponentInstances,
          adapted: target.totals.adaptedSharedComponentInstances,
          uncovered: target.totals.fallbackSharedComponentInstances,
          coveredPercent: percent(target.totals.definedSharedComponentInstances + target.totals.adaptedSharedComponentInstances, target.totals.sharedComponentInstances),
        },
      },
    },
    layoutGate: {
      execution: "generated-runtime",
      query: "wfInspect=1",
      tolerancePx: 4,
      expectedReviewStates: target.pages.reduce((sum, page) => sum + page.acceptanceVariants.length, 0),
      checks: ["size", "position", "out-of-bounds", "clipped", "overlap"],
    },
    externalComponents,
    adaptedComponents,
    pages,
    defects,
    ...(slice ? { recommendedVerticalSlice: slice } : {}),
    ...(slice ? { csharpSliceGate: {
      page: slice.page,
      status: quantitativeSliceGatePassed ? "manual-layout-review-required" as const : "blocked" as const,
      checks: sliceChecks,
      remaining: sliceChecks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.observed}; requires ${check.required}`),
    } } : {}),
  };
}

export function formatBatchAuditMarkdown(report: BatchAuditReport): string {
  const shared = report.coverage.sharedComponents;
  const actions = report.coverage.actionContracts;
  const mappings = report.coverage.actionContractMappings;
  const lines = [
    "# Frontend Batch Gate audit",
    "",
    `- Pages: ${report.coverage.pages}`,
    `- Controls: ${report.coverage.controls.total} (${report.coverage.controls.previewablePercent}% previewable)`,
    `- Shared component types: ${shared.types.defined} defined + ${shared.types.adapted} adapted / ${shared.types.total} (${shared.types.coveredPercent}% covered; ${shared.types.uncovered} uncovered)`,
    `- Shared component instances: ${shared.instances.defined} defined + ${shared.instances.adapted} adapted / ${shared.instances.total} (${shared.instances.coveredPercent}% covered; ${shared.instances.uncovered} uncovered)`,
    `- ActionContracts: ${actions.total} (${actions.classified} classified, ${actions.unclassified} unclassified)`,
    `- ActionContract mappings: ${mappings.mapped}/${mappings.candidates} (${mappings.mappedPercent}%); ${mappings.operationDefinitions} operation definition(s); ${mappings.triggerReuseSavings} trigger mapping(s) reused; ${mappings.unmapped} unresolved; ${mappings.duplicateHandlerGroups} duplicate-handler group(s)`,
    `- Layout gate: ${report.layoutGate.expectedReviewStates} review state(s); ${report.layoutGate.checks.join(", ")} at ±${report.layoutGate.tolerancePx}px via ?${report.layoutGate.query}`,
    "",
    "## Type-level target adapters",
    "",
    ...(report.adaptedComponents.length > 0
      ? report.adaptedComponents.map((component) => `- ${component.id}: ${component.adapter}, ${component.instanceCount} instance(s)`)
      : ["- None"]),
    "",
    "## Uncovered shared components",
    "",
    ...(report.externalComponents.length > 0
      ? report.externalComponents.map((component) => `- ${component.id}: ${component.instanceCount} instance(s)`)
      : ["- None"]),
    "",
    "## Pages",
    "",
    "| Page | Controls | Contracts | Capabilities |",
    "| --- | ---: | ---: | --- |",
    ...report.pages.map((page) => `| ${page.name} | ${page.controls} | ${page.actionContracts} | ${page.capabilities.join(", ")} |`),
    "",
    "## Defects and review queue",
    "",
    ...(report.defects.length > 0
      ? report.defects.map((defect) => `- [${defect.severity}] ${defect.message}`)
      : ["- None"]),
  ];
  if (report.recommendedVerticalSlice) {
    lines.push(
      "",
      "## Recommended C# ActionContract vertical slice",
      "",
      `**${report.recommendedVerticalSlice.page} — ${report.recommendedVerticalSlice.title}**`,
      "",
      ...report.recommendedVerticalSlice.reasons.map((reason) => `- ${reason}`),
      "",
      "Contracts:",
      "",
      ...report.recommendedVerticalSlice.contracts.map((contract) =>
        `- ${contract.controlName}.${contract.event} → ${contract.handler} [${contract.capabilities.join(", ")}]`,
      ),
    );
  }
  if (report.csharpSliceGate) {
    lines.push(
      "",
      "## C# vertical-slice entry gate",
      "",
      `Status: **${report.csharpSliceGate.status}** for ${report.csharpSliceGate.page}`,
      "",
      ...report.csharpSliceGate.checks.map((check) =>
        `- ${check.passed ? "PASS" : "PENDING"} ${check.id}: ${check.observed} (required ${check.required})`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function writeBatchAuditReport(report: BatchAuditReport, outDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const jsonPath = resolve(output, "batch-audit.json");
  const markdownPath = resolve(output, "batch-audit.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatBatchAuditMarkdown(report), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

function auditContract(contract: ContractPoint, controlNames: ReadonlySet<string>): AuditedContract {
  const classification = classifyActionEvidence(contract, controlNames);
  const isResolvedNoOp = !classification.hasCodeEvidence && contract.lineStart > 0 && !contract.sourceFile.startsWith("(");
  const localLifecycleState = isLocalLifecycleState(contract, classification.capabilities);
  const capabilities: ContractCapability[] = isResolvedNoOp
    ? ["no-op"]
    : localLifecycleState ? ["ui"]
    : classification.capabilities.length > 0 ? classification.capabilities : ["unclassified"];
  return {
    controlName: contract.controlName,
    event: contract.event,
    handler: contract.handler,
    sourceFile: contract.sourceFile,
    lineStart: contract.lineStart,
    calledSymbols: contract.calledSymbols,
    transitiveCalledSymbols: [...(contract.transitiveCalledSymbols ?? [])],
    propertyReads: [...(contract.propertyReads ?? [])],
    assignedSymbols: [...(contract.assignedSymbols ?? [])],
    constructedTypes: [...(contract.constructedTypes ?? [])],
    awaitedCalls: [...(contract.awaitedCalls ?? [])],
    capabilityEvidence: localLifecycleState
      ? [...classification.evidence, ...(contract.assignedSymbols ?? []).map((symbol) => ({ capability: "ui" as const, kind: "assignment" as const, symbol }))]
      : classification.evidence,
    capabilities,
  };
}

function scoreVerticalSlice(page: string, title: string, contracts: AuditedContract[]): NonNullable<BatchAuditReport["recommendedVerticalSlice"]> {
  const capabilities = new Set(distinctCapabilities(contracts));
  const manageable = contracts.length <= 6 ? 6 : contracts.length <= 12 ? 4 : contracts.length <= 20 ? 2 : 0;
  let score = manageable;
  if (capabilities.has("filesystem")) score += 6;
  if (capabilities.has("data")) score += 4;
  if (capabilities.has("external-service")) score += 5;
  if (capabilities.has("security")) score += 4;
  if (capabilities.has("validation")) score += 2;
  if (capabilities.has("filesystem") && capabilities.has("data")) score += 8;
  score += Math.min(3, [...capabilities].filter((capability) => !["ui", "navigation", "no-op", "unclassified"].includes(capability)).length);
  score = Number((score - Math.max(0, contracts.length - 12) * 0.2).toFixed(1));
  const reasons = [`${contracts.length} contracts keep the first end-to-end slice reviewable.`];
  if (capabilities.has("filesystem") && capabilities.has("data")) {
    reasons.push("Combines data access with a filesystem boundary, forcing an explicit server-side artifact/download contract.");
  }
  if (capabilities.has("external-service")) reasons.push("Exercises an external-service boundary without moving credentials into the browser.");
  if (capabilities.has("security")) reasons.push("Exercises authorization/security behavior as a backend-owned contract.");
  reasons.push(`Observed capabilities: ${[...capabilities].join(", ")}.`);
  return { page, title, score, reasons, contracts };
}

function distinctCapabilities(contracts: AuditedContract[]): ContractCapability[] {
  const present = new Set(contracts.flatMap((contract) => contract.capabilities));
  return ALL_CAPABILITIES.filter((capability) => present.has(capability));
}

function flattenControls(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.children)]);
}

function percent(value: number, total: number): number {
  return total === 0 ? 100 : Number(((value / total) * 100).toFixed(1));
}
