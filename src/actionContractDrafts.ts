import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildActionContractCandidateReport, type ActionContractCandidate, type CandidateCapability } from "./actionContractCandidates.js";
import type { ActionCapability, ProjectIR, VisualControl } from "./ir/types.js";

const CAPABILITY_ORDER: CandidateCapability[] = [
  "data", "filesystem", "external-service", "security", "navigation", "validation", "ui", "no-op", "unclassified",
];
const INPUT_KINDS = /^(?:TextBox|MaskedTextBox|RichTextBox|NumericUpDown|ComboBox|DomainUpDown|CheckBox|RadioButton|ListBox|DataGridView|ListView)$/;
const OUTPUT_KINDS = /^(?:TextBox|MaskedTextBox|RichTextBox|ComboBox|DomainUpDown|CheckBox|RadioButton|ListBox|DataGridView|ListView|Label|LinkLabel)$/;

export type ActionContractDraftTrigger = {
  candidateId: string;
  controlName: string;
  event: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  calledSymbols: string[];
  transitiveCalledSymbols: string[];
  propertyReads: string[];
  assignedSymbols: string[];
  constructedTypes: string[];
  awaitedCalls: string[];
  valueWrites: NonNullable<ProjectIR["pages"][number]["support"]["contractPoints"][number]["valueWrites"]>;
};

export type ActionContractDraftOperation = {
  draftOperationId: string;
  handler: string;
  triggers: ActionContractDraftTrigger[];
  capabilities: CandidateCapability[];
  suggestedExecution: "client" | "server" | "review" | "omit";
  contractTemplate: Record<string, unknown>;
  bindingHints: {
    referencedControls: Array<{ controlName: string; kind: string }>;
    requestControlCandidates: Array<{ controlName: string; kind: string }>;
    responseControlCandidates: Array<{ controlName: string; kind: string }>;
  };
  todos: Array<{
    kind: "boundary" | "transport" | "request-bindings" | "response-bindings" | "client-effect" | "verification";
    required: boolean;
    message: string;
  }>;
};

export type ActionContractPageDraft = {
  schemaVersion: 1;
  kind: "ActionContractPageDraft";
  status: "draft";
  page: string;
  title: string;
  suggestedSidecarFileName: string;
  planHeaderTemplate: {
    schemaVersion: 1;
    id: string;
    page: string;
    backend: { baseUrl: string };
  };
  summary: {
    mappedTriggers: number;
    unmappedTriggers: number;
    operationSkeletons: number;
    groupedOperations: number;
    triggerReuseSavings: number;
    serverOperations: number;
    clientOperations: number;
    reviewOperations: number;
    omitOperations: number;
    unclassifiedOperations: number;
  };
  operations: ActionContractDraftOperation[];
};

export type ActionContractDraftBundle = {
  schemaVersion: 1;
  kind: "ActionContractDraftBundle";
  status: "draft";
  note: string;
  summary: {
    selectedPages: number;
    pagesWithUnresolvedWork: number;
    mappedTriggers: number;
    unmappedTriggers: number;
    operationSkeletons: number;
    groupedOperations: number;
    triggerReuseSavings: number;
    serverOperations: number;
    clientOperations: number;
    reviewOperations: number;
    omitOperations: number;
    unclassifiedOperations: number;
  };
  pages: ActionContractPageDraft[];
};

export function buildActionContractDraftBundle(
  project: ProjectIR,
  options: { page?: string; baseUrl?: string } = {},
): ActionContractDraftBundle {
  const candidates = buildActionContractCandidateReport(project);
  if (options.page && !project.pages.some((page) => page.name === options.page)) {
    throw new Error(`ActionContract draft page is not part of the selected ProjectIR: ${options.page}`);
  }
  const projectPages = new Map(project.pages.map((page) => [page.name, page]));
  const selectedCandidatePages = candidates.pages.filter((page) => !options.page || page.page === options.page);
  const pages = selectedCandidatePages
    .map((page) => {
      const sourcePage = projectPages.get(page.page)!;
      const controlIndex = new Map(flattenControls(sourcePage.controls).map((control) => [control.name, control]));
      const groups = groupCandidates(page.items.filter((candidate) => candidate.mappingStatus === "unmapped"));
      const usedOperationIds = new Set<string>();
      const operations = groups.map((group) => buildDraftOperation(page.page, group, controlIndex, usedOperationIds));
      const groupedOperations = operations.filter((operation) => operation.triggers.length > 1).length;
      return {
        schemaVersion: 1 as const,
        kind: "ActionContractPageDraft" as const,
        status: "draft" as const,
        page: page.page,
        title: page.title,
        suggestedSidecarFileName: `${kebab(page.page)}.json`,
        planHeaderTemplate: {
          schemaVersion: 1 as const,
          id: `${kebab(page.page)}-v1`,
          page: page.page,
          backend: { baseUrl: options.baseUrl || "__TODO_BACKEND_BASE_URL__" },
        },
        summary: {
          mappedTriggers: page.mapped,
          unmappedTriggers: page.unmapped,
          operationSkeletons: operations.length,
          groupedOperations,
          triggerReuseSavings: Math.max(0, page.unmapped - operations.length),
          serverOperations: operations.filter((operation) => operation.suggestedExecution === "server").length,
          clientOperations: operations.filter((operation) => operation.suggestedExecution === "client").length,
          reviewOperations: operations.filter((operation) => operation.suggestedExecution === "review").length,
          omitOperations: operations.filter((operation) => operation.suggestedExecution === "omit").length,
          unclassifiedOperations: operations.filter((operation) => operation.capabilities.includes("unclassified")).length,
        },
        operations,
      };
    })
    .filter((page) => page.summary.unmappedTriggers > 0);
  const totals = pages.map((page) => page.summary);
  return {
    schemaVersion: 1,
    kind: "ActionContractDraftBundle",
    status: "draft",
    note: "Drafts are intentionally not loadable ActionContract plans. Review every TODO, then copy planHeaderTemplate and contractTemplate entries into a validated sidecar.",
    summary: {
      selectedPages: selectedCandidatePages.length,
      pagesWithUnresolvedWork: pages.length,
      mappedTriggers: selectedCandidatePages.reduce((sum, page) => sum + page.mapped, 0),
      unmappedTriggers: selectedCandidatePages.reduce((sum, page) => sum + page.unmapped, 0),
      operationSkeletons: totals.reduce((sum, value) => sum + value.operationSkeletons, 0),
      groupedOperations: totals.reduce((sum, value) => sum + value.groupedOperations, 0),
      triggerReuseSavings: totals.reduce((sum, value) => sum + value.triggerReuseSavings, 0),
      serverOperations: totals.reduce((sum, value) => sum + value.serverOperations, 0),
      clientOperations: totals.reduce((sum, value) => sum + value.clientOperations, 0),
      reviewOperations: totals.reduce((sum, value) => sum + value.reviewOperations, 0),
      omitOperations: totals.reduce((sum, value) => sum + value.omitOperations, 0),
      unclassifiedOperations: totals.reduce((sum, value) => sum + value.unclassifiedOperations, 0),
    },
    pages,
  };
}

export async function writeActionContractDraftBundle(
  bundle: ActionContractDraftBundle,
  outDir: string,
): Promise<{ bundlePath: string; markdownPath: string; pagePaths: string[] }> {
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const bundlePath = resolve(output, "action-contract.drafts.json");
  const markdownPath = resolve(output, "action-contract.drafts.md");
  const pagePaths = bundle.pages.map((page) => resolve(output, `${kebab(page.page)}.action-contract.draft.json`));
  await Promise.all([
    writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatActionContractDraftMarkdown(bundle), "utf8"),
    ...bundle.pages.map((page, index) => writeFile(pagePaths[index], `${JSON.stringify(page, null, 2)}\n`, "utf8")),
  ]);
  return { bundlePath, markdownPath, pagePaths };
}

export function formatActionContractDraftMarkdown(bundle: ActionContractDraftBundle): string {
  const summary = bundle.summary;
  const lines = [
    "# ActionContract skeleton drafts",
    "",
    "> Draft only: these files are not executable ActionContract manifests.",
    "",
    `- Selected pages: ${summary.selectedPages}`,
    `- Pages with unresolved work: ${summary.pagesWithUnresolvedWork}`,
    `- Unmapped triggers: ${summary.unmappedTriggers}`,
    `- Operation skeletons: ${summary.operationSkeletons}`,
    `- Shared-handler reuse savings: ${summary.triggerReuseSavings}`,
    `- Suggested dispositions: ${summary.serverOperations} server, ${summary.clientOperations} client, ${summary.reviewOperations} requiring source review, ${summary.omitOperations} confirmed no-op candidate(s)`,
    `- Skeletons containing unclassified evidence: ${summary.unclassifiedOperations}`,
    "",
    "| Page | Mapped | Unmapped | Skeletons | Grouped | Reused | Server | Client | Review | Omit | Unclassified |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...bundle.pages.map((page) => {
      const item = page.summary;
      return `| ${page.page} | ${item.mappedTriggers} | ${item.unmappedTriggers} | ${item.operationSkeletons} | ${item.groupedOperations} | ${item.triggerReuseSavings} | ${item.serverOperations} | ${item.clientOperations} | ${item.reviewOperations} | ${item.omitOperations} | ${item.unclassifiedOperations} |`;
    }),
    "",
    "## Shared-handler groups",
    "",
    ...bundle.pages.flatMap((page) => page.operations
      .filter((operation) => operation.triggers.length > 1)
      .map((operation) => `- ${page.page}.${operation.handler}: ${operation.triggers.length} triggers → 1 operation skeleton`)),
  ];
  if (!bundle.pages.some((page) => page.operations.some((operation) => operation.triggers.length > 1))) lines.push("- None");
  return `${lines.join("\n")}\n`;
}

function groupCandidates(candidates: ActionContractCandidate[]): ActionContractCandidate[][] {
  const groups = new Map<string, ActionContractCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.handler) ?? [];
    group.push(candidate);
    groups.set(candidate.handler, group);
  }
  return [...groups.values()];
}

function buildDraftOperation(
  page: string,
  candidates: ActionContractCandidate[],
  controlIndex: ReadonlyMap<string, VisualControl>,
  usedOperationIds: Set<string>,
): ActionContractDraftOperation {
  const handler = candidates[0].handler;
  const operationId = uniqueOperationId(handler, usedOperationIds);
  const capabilities = CAPABILITY_ORDER.filter((capability) => candidates.some((candidate) => candidate.capabilities.includes(capability)));
  const suggestedExecution = candidates.some((candidate) => candidate.suggestedExecution === "server") ? "server"
    : candidates.some((candidate) => candidate.suggestedExecution === "review") ? "review"
      : candidates.every((candidate) => candidate.suggestedExecution === "omit") ? "omit" : "client";
  const triggerTemplates = candidates.map(({ controlName, event }) => ({ controlName, event }));
  const knownCapabilities = capabilities.filter((capability): capability is ActionCapability => capability !== "unclassified" && capability !== "no-op");
  const contractTemplate: Record<string, unknown> = {
    operationId,
    handler,
    ...(triggerTemplates.length === 1 ? { trigger: triggerTemplates[0] } : { triggers: triggerTemplates }),
    execution: suggestedExecution === "review" ? "TODO" : suggestedExecution === "omit" ? "OMIT" : suggestedExecution,
    intent: `TODO: describe the migrated intent of ${handler}.`,
    capabilities: knownCapabilities,
    ...(suggestedExecution === "server" ? {
      transport: {
        method: candidates.every((candidate) => candidate.event === "Load") ? "GET" : "POST",
        path: `/api/todo/${kebab(page)}/${kebab(operationId)}`,
      },
      request: { fields: [] },
      response: { bindings: [] },
    } : suggestedExecution === "client" ? { effect: { kind: "TODO", targetControl: "TODO" } } : {}),
  };
  const referencedControls = referencedControlHints(candidates, controlIndex);
  return {
    draftOperationId: `${page}::${handler}`,
    handler,
    triggers: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      controlName: candidate.controlName,
      event: candidate.event,
      sourceFile: candidate.sourceFile,
      lineStart: candidate.lineStart,
      lineEnd: candidate.lineEnd,
      calledSymbols: candidate.calledSymbols,
      transitiveCalledSymbols: candidate.transitiveCalledSymbols,
      propertyReads: candidate.propertyReads,
      assignedSymbols: candidate.assignedSymbols,
      constructedTypes: candidate.constructedTypes,
      awaitedCalls: candidate.awaitedCalls,
      valueWrites: candidate.valueWrites,
    })),
    capabilities,
    suggestedExecution,
    contractTemplate,
    bindingHints: {
      referencedControls,
      requestControlCandidates: referencedControls.filter((control) => INPUT_KINDS.test(control.kind)),
      responseControlCandidates: referencedControls.filter((control) => OUTPUT_KINDS.test(control.kind)),
    },
    todos: [
      ...(capabilities.includes("unclassified") ? [{ kind: "boundary" as const, required: true, message: "Review source because no backend/UI boundary could be classified." }] : []),
      ...(suggestedExecution === "server"
        ? [{ kind: "transport" as const, required: true, message: "Replace the /api/todo path and confirm GET/POST ownership." }]
        : suggestedExecution === "client"
          ? [{ kind: "client-effect" as const, required: true, message: "Replace the TODO client effect with a supported generic effect or choose a server contract." }]
          : []),
      { kind: "request-bindings", required: suggestedExecution === "server", message: "Add only the control values required by the migrated operation after the boundary is confirmed." },
      { kind: "response-bindings", required: suggestedExecution === "server", message: "Bind response values to options, values, rows, visibility, status, or artifacts after the boundary is confirmed." },
      { kind: "verification", required: true, message: suggestedExecution === "omit"
        ? "Confirm the source handler is intentionally empty before excluding it from the migration plan."
        : "Add fixture/adapter tests and verify the connected frontend with wfActions=1." },
    ],
  };
}

function referencedControlHints(
  candidates: ActionContractCandidate[],
  controlIndex: ReadonlyMap<string, VisualControl>,
): Array<{ controlName: string; kind: string }> {
  const names = new Set<string>();
  for (const candidate of candidates) {
    names.add(candidate.controlName);
    for (const symbol of [
      ...candidate.calledSymbols,
      ...candidate.transitiveCalledSymbols,
      ...candidate.propertyReads,
      ...candidate.assignedSymbols,
    ]) {
      const root = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(symbol)?.[1];
      if (root && controlIndex.has(root)) names.add(root);
    }
  }
  return [...names].map((controlName) => ({ controlName, kind: controlIndex.get(controlName)?.kind ?? "Form" }));
}

function uniqueOperationId(handler: string, used: Set<string>): string {
  const base = camel(handler.replace(/[^A-Za-z0-9]+/g, "_")) || "migrateAction";
  let value = base;
  let suffix = 2;
  while (used.has(value)) value = `${base}${suffix++}`;
  used.add(value);
  return value;
}

function camel(value: string): string {
  const words = value.split(/_+/).filter(Boolean);
  return words.map((word, index) => index === 0
    ? word.charAt(0).toLocaleLowerCase() + word.slice(1)
    : word.charAt(0).toLocaleUpperCase() + word.slice(1)).join("");
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase();
}

function flattenControls(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.children)]);
}
