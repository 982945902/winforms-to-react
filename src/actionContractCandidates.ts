import type { ActionCapability, ActionContractOperation, ContractPoint, ProjectIR } from "./ir/types.js";
import { classifyActionEvidence, isLocalLifecycleState, type CapabilityEvidence } from "./actionCapabilities.js";

export type CandidateCapability = ActionCapability | "unclassified" | "no-op";

export type ActionContractCandidate = {
  candidateId: string;
  page: string;
  pageTitle: string;
  controlName: string;
  event: string;
  handler: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  calledSymbols: string[];
  transitiveCalledSymbols: string[];
  propertyReads: string[];
  assignedSymbols: string[];
  constructedTypes: string[];
  awaitedCalls: string[];
  valueWrites: NonNullable<ContractPoint["valueWrites"]>;
  capabilities: CandidateCapability[];
  capabilityEvidence: CapabilityEvidence[];
  suggestedExecution: "client" | "server" | "review" | "omit";
  suggestedOperationId: string;
  mappingStatus: "mapped" | "unmapped";
  mappedPlanId?: string;
  mappedOperationId?: string;
  manualBindings: { requestFields: number; responseBindings: number };
};

export type ActionContractCandidateReport = {
  schemaVersion: 1;
  summary: {
    pages: number;
    candidates: number;
    mapped: number;
    unmapped: number;
    mappedPercent: number;
    operationDefinitions: number;
    triggerReuseSavings: number;
    duplicateHandlerGroups: number;
    manualRequestFields: number;
    manualResponseBindings: number;
    reviewCandidates: number;
    noOpCandidates: number;
  };
  pages: Array<{
    page: string;
    title: string;
    candidates: number;
    mapped: number;
    unmapped: number;
    mappedPercent: number;
    operationDefinitions: number;
    triggerReuseSavings: number;
    reviewCandidates: number;
    noOpCandidates: number;
    items: ActionContractCandidate[];
  }>;
  duplicateHandlerGroups: Array<{
    page: string;
    handler: string;
    triggers: Array<{ controlName: string; event: string }>;
  }>;
};

export function buildActionContractCandidateReport(project: ProjectIR): ActionContractCandidateReport {
  const planByPage = new Map((project.actionContracts ?? []).map((plan) => [plan.page, plan]));
  const pages = project.pages.map((page) => {
    const controlNames = new Set([page.name, ...flattenControlNames(page.controls)]);
    const plan = planByPage.get(page.name);
    const operations = new Map((plan?.operations ?? []).flatMap((operation) =>
      (operation.triggers ?? [operation.trigger]).map((trigger) => [triggerKey(trigger, operation.handler), operation] as const)));
    const items = page.support.contractPoints.map((contract) => buildCandidate(
      page.name,
      page.text ?? page.name,
      contract,
      plan?.id,
      operations.get(contractPointKey(contract)),
      controlNames,
    ));
    const mapped = items.filter((candidate) => candidate.mappingStatus === "mapped").length;
    return {
      page: page.name,
      title: page.text ?? page.name,
      candidates: items.length,
      mapped,
      unmapped: items.length - mapped,
      mappedPercent: percent(mapped, items.length),
      operationDefinitions: plan?.operations.length ?? 0,
      triggerReuseSavings: Math.max(0, mapped - (plan?.operations.length ?? 0)),
      reviewCandidates: items.filter((candidate) => candidate.suggestedExecution === "review").length,
      noOpCandidates: items.filter((candidate) => candidate.suggestedExecution === "omit").length,
      items,
    };
  });
  const duplicateHandlerGroups = pages.flatMap((page) => {
    const byHandler = new Map<string, ActionContractCandidate[]>();
    for (const candidate of page.items) {
      const group = byHandler.get(candidate.handler) ?? [];
      group.push(candidate);
      byHandler.set(candidate.handler, group);
    }
    return [...byHandler.entries()]
      .filter(([, candidates]) => candidates.length > 1)
      .map(([handler, candidates]) => ({
        page: page.page,
        handler,
        triggers: candidates.map(({ controlName, event }) => ({ controlName, event })),
      }));
  });
  const candidates = pages.reduce((total, page) => total + page.candidates, 0);
  const mapped = pages.reduce((total, page) => total + page.mapped, 0);
  const allOperations = (project.actionContracts ?? []).flatMap((plan) => plan.operations);
  return {
    schemaVersion: 1,
    summary: {
      pages: pages.length,
      candidates,
      mapped,
      unmapped: candidates - mapped,
      mappedPercent: percent(mapped, candidates),
      operationDefinitions: allOperations.length,
      triggerReuseSavings: Math.max(0, mapped - allOperations.length),
      duplicateHandlerGroups: duplicateHandlerGroups.length,
      manualRequestFields: allOperations.reduce((total, operation) => total + (operation.request?.fields.length ?? 0), 0),
      manualResponseBindings: allOperations.reduce((total, operation) => total + (operation.response?.bindings.length ?? 0), 0),
      reviewCandidates: pages.reduce((total, page) => total + page.reviewCandidates, 0),
      noOpCandidates: pages.reduce((total, page) => total + page.noOpCandidates, 0),
    },
    pages,
    duplicateHandlerGroups,
  };
}

function buildCandidate(
  page: string,
  pageTitle: string,
  contract: ContractPoint,
  planId: string | undefined,
  operation: ActionContractOperation | undefined,
  controlNames: ReadonlySet<string>,
): ActionContractCandidate {
  const classification = classifyActionEvidence(contract, controlNames);
  const isResolvedNoOp = !classification.hasCodeEvidence && contract.lineStart > 0 && !contract.sourceFile.startsWith("(");
  const localLifecycleState = isLocalLifecycleState(contract, classification.capabilities);
  const capabilities: CandidateCapability[] = isResolvedNoOp
    ? ["no-op"]
    : localLifecycleState ? ["ui"]
    : classification.capabilities.length > 0 ? classification.capabilities : ["unclassified"];
  const serverOwned = capabilities.some((capability) => ["data", "filesystem", "external-service", "security", "validation"].includes(capability));
  const suggestedExecution = isResolvedNoOp ? "omit" : capabilities.includes("unclassified") ? "review" : serverOwned ? "server" : "client";
  return {
    candidateId: [page, contract.controlName, contract.event, contract.handler].join("::"),
    page,
    pageTitle,
    controlName: contract.controlName,
    event: contract.event,
    handler: contract.handler,
    sourceFile: contract.sourceFile,
    lineStart: contract.lineStart,
    lineEnd: contract.lineEnd,
    calledSymbols: [...contract.calledSymbols],
    transitiveCalledSymbols: [...(contract.transitiveCalledSymbols ?? [])],
    propertyReads: [...(contract.propertyReads ?? [])],
    assignedSymbols: [...(contract.assignedSymbols ?? [])],
    constructedTypes: [...(contract.constructedTypes ?? [])],
    awaitedCalls: [...(contract.awaitedCalls ?? [])],
    valueWrites: [...(contract.valueWrites ?? [])],
    capabilities,
    capabilityEvidence: localLifecycleState
      ? [...classification.evidence, ...(contract.assignedSymbols ?? []).map((symbol) => ({ capability: "ui" as const, kind: "assignment" as const, symbol }))]
      : classification.evidence,
    suggestedExecution,
    suggestedOperationId: suggestedOperationId(contract),
    mappingStatus: operation ? "mapped" : "unmapped",
    ...(operation && planId ? { mappedPlanId: planId, mappedOperationId: operation.operationId } : {}),
    manualBindings: {
      requestFields: operation?.request?.fields.length ?? 0,
      responseBindings: operation?.response?.bindings.length ?? 0,
    },
  };
}

function flattenControlNames(controls: ProjectIR["pages"][number]["controls"]): string[] {
  return controls.flatMap((control) => [control.name, ...flattenControlNames(control.children)]);
}

function triggerKey(trigger: ActionContractOperation["trigger"], handler: string): string {
  return [trigger.controlName, trigger.event, handler].join("::");
}

function contractPointKey(contract: ContractPoint): string {
  return [contract.controlName, contract.event, contract.handler].join("::");
}

function suggestedOperationId(contract: ContractPoint): string {
  const raw = `${contract.handler}_${contract.controlName}_${contract.event}`.replace(/[^A-Za-z0-9]+/g, "_");
  return raw.replace(/^_+|_+$/g, "").replace(/_([A-Za-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 100 : Number(((numerator / denominator) * 100).toFixed(1));
}
