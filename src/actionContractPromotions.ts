import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildActionContractDraftBundle, type ActionContractDraftOperation } from "./actionContractDrafts.js";
import type { ActionCapability, ActionContractEffect, ActionContractFieldBinding, ProjectIR, VisualControl } from "./ir/types.js";

export type PromotionDisposition = "ready-client" | "client-stub" | "server-stub" | "review" | "omit";

export type ActionContractPromotionOperation = {
  draftOperationId: string;
  operationId: string;
  handler: string;
  triggers: Array<{ controlName: string; event: string }>;
  capabilities: Array<ActionCapability | "unclassified" | "no-op">;
  disposition: PromotionDisposition;
  confidence: "exact" | "boundary-only" | "unresolved" | "source-resolved";
  operationTemplate: Record<string, unknown>;
  inferredEffect?: ActionContractEffect;
  inferenceRule?: string;
  suggestedRequestFields: ActionContractFieldBinding[];
  suggestedResponseTargets: Array<{ targetControl: string; target: "options" | "value" | "rows" }>;
  blockers: string[];
  todos: string[];
};

export type ActionContractPromotionPage = {
  schemaVersion: 1;
  kind: "ActionContractPromotionPage";
  status: "proposal";
  page: string;
  title: string;
  planHeaderTemplate: { schemaVersion: 1; id: string; page: string; backend: { baseUrl: string } };
  summary: PromotionSummary;
  operations: ActionContractPromotionOperation[];
};

export type ActionContractPromotionBundle = {
  schemaVersion: 1;
  kind: "ActionContractPromotionBundle";
  status: "proposal";
  note: string;
  summary: PromotionSummary & { selectedPages: number; pagesWithProposals: number };
  pages: ActionContractPromotionPage[];
};

type PromotionSummary = {
  operations: number;
  readyClient: number;
  clientStubs: number;
  serverStubs: number;
  review: number;
  omit: number;
};

export function buildActionContractPromotionBundle(
  project: ProjectIR,
  options: { page?: string; baseUrl?: string } = {},
): ActionContractPromotionBundle {
  const drafts = buildActionContractDraftBundle(project, options);
  const pageIndex = new Map(project.pages.map((page) => [page.name, page]));
  const pages = drafts.pages.map((draftPage) => {
    const page = pageIndex.get(draftPage.page)!;
    const controls = new Map(flattenControls(page.controls).map((control) => [control.name, control]));
    const operations = draftPage.operations.map((operation) => promoteOperation(operation, controls));
    return {
      schemaVersion: 1 as const,
      kind: "ActionContractPromotionPage" as const,
      status: "proposal" as const,
      page: draftPage.page,
      title: draftPage.title,
      planHeaderTemplate: draftPage.planHeaderTemplate,
      summary: summarize(operations),
      operations,
    };
  });
  const all = pages.flatMap((page) => page.operations);
  return {
    schemaVersion: 1,
    kind: "ActionContractPromotionBundle",
    status: "proposal",
    note: "Promotion proposals are never loaded as ActionContract plans. Only ready-client templates have exact generic effects; server/client stubs still require review and sidecar merge.",
    summary: { selectedPages: drafts.summary.selectedPages, pagesWithProposals: pages.length, ...summarize(all) },
    pages,
  };
}

export async function writeActionContractPromotionBundle(
  bundle: ActionContractPromotionBundle,
  outDir: string,
): Promise<{ bundlePath: string; markdownPath: string; pagePaths: string[] }> {
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const bundlePath = resolve(output, "action-contract.promotions.json");
  const markdownPath = resolve(output, "action-contract.promotions.md");
  const pagePaths = bundle.pages.map((page) => resolve(output, `${kebab(page.page)}.action-contract.promotion.json`));
  await Promise.all([
    writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatActionContractPromotionMarkdown(bundle), "utf8"),
    ...bundle.pages.map((page, index) => writeFile(pagePaths[index], `${JSON.stringify(page, null, 2)}\n`, "utf8")),
  ]);
  return { bundlePath, markdownPath, pagePaths };
}

export function formatActionContractPromotionMarkdown(bundle: ActionContractPromotionBundle): string {
  const summary = bundle.summary;
  const lines = [
    "# ActionContract promotion proposals",
    "",
    "> Proposal only: these files are not executable ActionContract manifests.",
    "",
    `- Operations: ${summary.operations}`,
    `- Exact generic client effects: ${summary.readyClient}`,
    `- Client stubs: ${summary.clientStubs}`,
    `- Server stubs: ${summary.serverStubs}`,
    `- Source review: ${summary.review}`,
    `- Omit after confirmation: ${summary.omit}`,
    "",
    "| Page | Operations | Ready client | Client stub | Server stub | Review | Omit |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...bundle.pages.map((page) => `| ${page.page} | ${page.summary.operations} | ${page.summary.readyClient} | ${page.summary.clientStubs} | ${page.summary.serverStubs} | ${page.summary.review} | ${page.summary.omit} |`),
    "",
    "## Exact client effects",
    "",
    ...bundle.pages.flatMap((page) => page.operations
      .filter((operation) => operation.disposition === "ready-client")
      .map((operation) => `- ${page.page}.${operation.handler}: ${operation.inferredEffect?.kind} via ${operation.inferenceRule}`)),
  ];
  if (summary.readyClient === 0) lines.push("- None");
  return `${lines.join("\n")}\n`;
}

function promoteOperation(
  draft: ActionContractDraftOperation,
  controls: ReadonlyMap<string, VisualControl>,
): ActionContractPromotionOperation {
  const operationId = String(draft.contractTemplate.operationId);
  const base = {
    draftOperationId: draft.draftOperationId,
    operationId,
    handler: draft.handler,
    triggers: draft.triggers.map(({ controlName, event }) => ({ controlName, event })),
    capabilities: draft.capabilities,
    suggestedRequestFields: inferRequestFields(draft, controls),
    suggestedResponseTargets: inferResponseTargets(draft),
  };
  if (draft.suggestedExecution === "server") return {
    ...base,
    disposition: "server-stub",
    confidence: "boundary-only",
    operationTemplate: draft.contractTemplate,
    blockers: ["Backend route has no implementation contract or fixture yet.", "Request and response bindings require source/domain review."],
    todos: ["Confirm endpoint ownership and authorization.", "Select request fields and response targets from the generated hints.", "Add fixture and adapter verification before merging into a sidecar."],
  };
  if (draft.suggestedExecution === "review") return {
    ...base,
    disposition: "review",
    confidence: "unresolved",
    operationTemplate: draft.contractTemplate,
    blockers: ["No safe execution boundary was proven."],
    todos: ["Review the recorded source lines and classify the boundary before promotion."],
  };
  if (draft.suggestedExecution === "omit") return {
    ...base,
    disposition: "omit",
    confidence: "source-resolved",
    operationTemplate: draft.contractTemplate,
    blockers: [],
    todos: ["Confirm the resolved handler is intentionally empty before excluding it."],
  };
  const inferred = inferClientEffect(draft, controls);
  if (!inferred) return {
    ...base,
    disposition: "client-stub",
    confidence: "boundary-only",
    operationTemplate: draft.contractTemplate,
    blockers: [draft.capabilities.includes("navigation")
      ? "Navigation/dialog ownership is known, but no selected target page proves a portable route."
      : "Client ownership is known, but the handler cannot be represented by one supported generic effect."],
    todos: ["Add a reusable effect rule or map the target dialog/page before merging into a sidecar."],
  };
  const operationTemplate = {
    ...draft.contractTemplate,
    execution: "client",
    intent: inferred.intent,
    effect: inferred.effect,
  };
  return {
    ...base,
    disposition: "ready-client",
    confidence: "exact",
    operationTemplate,
    inferredEffect: inferred.effect,
    inferenceRule: inferred.rule,
    blockers: [],
    todos: ["Verify the generic effect against the WinForms interaction before merging it into the page sidecar."],
  };
}

function inferClientEffect(
  draft: ActionContractDraftOperation,
  controls: ReadonlyMap<string, VisualControl>,
): { effect: ActionContractEffect; rule: string; intent: string } | undefined {
  const handler = draft.handler;
  const calls = draft.triggers.flatMap((trigger) => [...trigger.calledSymbols, ...trigger.transitiveCalledSymbols]);
  const collection = uniqueReferencedControls(draft, controls, (control) =>
    /^(?:DataGridView|ListView|ListBox|UserControl)$/.test(control.kind) && /(?:grid|list)/i.test(control.name));
  const hasSetAllEvidence = collection.length === 1 && calls.some((symbol) => symbol === `${collection[0]}.SetAll`);
  if (/(?:deselect|unselect).*all|clear.*all/i.test(handler) && hasSetAllEvidence) return {
    effect: { kind: "clear-all", targetControl: collection[0] },
    rule: "handler-name + unique collection target",
    intent: `Clear the current ${collection[0]} selection without a server round trip.`,
  };
  if (/(?:select|set).*all/i.test(handler) && hasSetAllEvidence) return {
    effect: { kind: "select-all", targetControl: collection[0] },
    rule: "handler-name + unique collection target",
    intent: `Select every currently loaded row in ${collection[0]} without a server round trip.`,
  };

  const controlWrites = draft.triggers.flatMap((trigger) => trigger.valueWrites)
    .filter((write) => controls.has(write.controlName));
  const writes = controlWrites
    .filter((write) => controls.has(write.controlName) && !write.conditional && write.literalValue !== undefined
      && ["text", "checked", "selectedIndex", "value"].includes(write.property));
  const uniqueWrites = uniqueBy(writes, (write) => `${write.controlName}|${write.property}|${String(write.literalValue)}`);
  if (uniqueWrites.length === 1 && controlWrites.every((write) => write.controlName === uniqueWrites[0].controlName
    && write.property === uniqueWrites[0].property && write.expression === uniqueWrites[0].expression && !write.conditional)) return {
    effect: {
      kind: "set-value",
      targetControl: uniqueWrites[0].controlName,
      targetProperty: uniqueWrites[0].property as "text" | "checked" | "selectedIndex" | "value",
      value: uniqueWrites[0].literalValue!,
    },
    rule: "unconditional literal control assignment",
    intent: `Set ${uniqueWrites[0].controlName} to the source-proven literal value.`,
  };

  const assignments = new Set(draft.triggers.flatMap((trigger) => trigger.assignedSymbols));
  const transforms = (["uppercase", "lowercase", "trim"] as const).flatMap((transform) => {
    const tail = transform === "uppercase" ? "ToUpper" : transform === "lowercase" ? "ToLower" : "Trim";
    return calls.flatMap((symbol) => {
      const match = new RegExp(`^([A-Za-z_]\\w*)\\.Text\\.${tail}$`).exec(symbol);
      const exactWrite = controlWrites.some((write) => write.controlName === match?.[1] && write.property === "text"
        && !write.conditional && new RegExp(`^${match?.[1]}\\.Text\\.${tail}\\(\\)$`).test(write.expression));
      const onlyTargetWrites = controlWrites.every((write) => write.controlName === match?.[1] && !write.conditional);
      return match && controls.has(match[1]) && assignments.has(`${match[1]}.Text`) && exactWrite && onlyTargetWrites
        ? [{ targetControl: match[1], transform }] : [];
    });
  });
  const uniqueTransforms = uniqueBy(transforms, (item) => `${item.targetControl}|${item.transform}`);
  if (uniqueTransforms.length === 1) return {
    effect: { kind: "transform-value", ...uniqueTransforms[0] },
    rule: "matching Text assignment and string transform call",
    intent: `Apply ${uniqueTransforms[0].transform} normalization to ${uniqueTransforms[0].targetControl}.`,
  };

  if (calls.some((symbol) => /(?:^|\.)(?:OD)?Clipboard\.(?:SetClipboard|SetText)$/.test(symbol))) {
    const sources = uniqueReferencedControls(draft, controls, (control) => /^(?:TextBox|MaskedTextBox|RichTextBox|Label|LinkLabel)$/.test(control.kind));
    if (sources.length === 1) return {
      effect: { kind: "copy-value", targetControl: sources[0] },
      rule: "clipboard call + unique text source",
      intent: `Copy ${sources[0]} to the browser clipboard.`,
    };
  }

  const focusTargets = uniqueBy(calls.flatMap((symbol) => {
    const match = /^([A-Za-z_]\w*)\.(?:Focus|SwitchFocus)$/.exec(symbol);
    return match && controls.has(match[1]) ? [match[1]] : [];
  }), (value) => value);
  const controlOwnedCalls = calls.filter((symbol) => controls.has(symbol.split(".")[0]));
  if (focusTargets.length === 1 && controlWrites.length === 0
    && controlOwnedCalls.every((symbol) => new RegExp(`^${focusTargets[0]}\\.(?:Focus|SwitchFocus)$`).test(symbol))) return {
    effect: { kind: "focus", targetControl: focusTargets[0] },
    rule: "exact control focus call",
    intent: `Move keyboard focus to ${focusTargets[0]}.`,
  };
  return undefined;
}

function inferRequestFields(draft: ActionContractDraftOperation, controls: ReadonlyMap<string, VisualControl>): ActionContractFieldBinding[] {
  const fields: ActionContractFieldBinding[] = [];
  for (const { controlName } of draft.bindingHints.requestControlCandidates) {
    const control = controls.get(controlName);
    if (!control) continue;
    if (/^(?:CheckBox|RadioButton)$/.test(control.kind)) fields.push({ name: controlName, sourceControl: controlName, source: "checked", parse: "boolean" });
    else if (/^(?:ComboBox|DomainUpDown)$/.test(control.kind)) fields.push({ name: controlName, sourceControl: controlName, source: "selected-value" });
    else if (/^(?:ListBox|ListView)$/.test(control.kind)) fields.push({ name: controlName, sourceControl: controlName, source: "selected-values" });
    else if (/^(?:DataGridView)$/.test(control.kind)) fields.push({ name: controlName, sourceControl: controlName, source: "selected-rows" });
    else if (/^(?:NumericUpDown)$/.test(control.kind)) fields.push({ name: controlName, sourceControl: controlName, source: "value", parse: "integer" });
    else fields.push({ name: controlName, sourceControl: controlName, source: "value", parse: "string" });
  }
  return fields;
}

function inferResponseTargets(draft: ActionContractDraftOperation): ActionContractPromotionOperation["suggestedResponseTargets"] {
  return draft.bindingHints.responseControlCandidates.map(({ controlName, kind }) => ({
    targetControl: controlName,
    target: /^(?:ComboBox|DomainUpDown|ListBox)$/.test(kind) ? "options" as const
      : /^(?:DataGridView|ListView)$/.test(kind) ? "rows" as const : "value" as const,
  }));
}

function uniqueReferencedControls(
  draft: ActionContractDraftOperation,
  controls: ReadonlyMap<string, VisualControl>,
  predicate: (control: VisualControl) => boolean,
): string[] {
  return uniqueBy(draft.bindingHints.referencedControls
    .map(({ controlName }) => controls.get(controlName))
    .filter((control): control is VisualControl => Boolean(control && predicate(control)))
    .map((control) => control.name), (value) => value);
}

function summarize(operations: ActionContractPromotionOperation[]): PromotionSummary {
  return {
    operations: operations.length,
    readyClient: operations.filter((operation) => operation.disposition === "ready-client").length,
    clientStubs: operations.filter((operation) => operation.disposition === "client-stub").length,
    serverStubs: operations.filter((operation) => operation.disposition === "server-stub").length,
    review: operations.filter((operation) => operation.disposition === "review").length,
    omit: operations.filter((operation) => operation.disposition === "omit").length,
  };
}

function flattenControls(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.children)]);
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLocaleLowerCase();
}
