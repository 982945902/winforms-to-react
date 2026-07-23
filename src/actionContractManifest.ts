import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ActionCapability,
  ActionContractFieldBinding,
  ActionContractOperation,
  ActionContractPlan,
  ActionContractResponseBinding,
  ProjectIR,
  VisualControl,
} from "./ir/types.js";

const CAPABILITIES = new Set<ActionCapability>([
  "data", "filesystem", "external-service", "security", "navigation", "validation", "ui",
]);
const SOURCES = new Set<ActionContractFieldBinding["source"]>(["value", "checked", "selected-value", "selected-values", "selected-rows", "trigger-control"]);
const PARSERS = new Set<NonNullable<ActionContractFieldBinding["parse"]>>(["string", "integer", "boolean", "string-array", "integer-array"]);
const RESPONSE_TARGETS = new Set<ActionContractResponseBinding["target"]>(["options", "visibility", "value", "rows", "artifact", "status"]);

export async function loadActionContractManifest(manifestPath: string, project: ProjectIR): Promise<ActionContractPlan> {
  const path = resolve(manifestPath);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`ActionContract manifest is not readable JSON: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(raw) || raw.schemaVersion !== 1 || typeof raw.id !== "string" || !raw.id.trim()
    || typeof raw.page !== "string" || !raw.page.trim()) {
    throw new Error("ActionContract manifest requires schemaVersion 1, id, and page");
  }
  if (!isObject(raw.backend) || typeof raw.backend.baseUrl !== "string" || !raw.backend.baseUrl.trim()) {
    throw new Error("ActionContract manifest requires backend.baseUrl");
  }
  if (!Array.isArray(raw.operations) || raw.operations.length === 0) {
    throw new Error("ActionContract manifest requires a non-empty operations array");
  }

  const page = project.pages.find((item) => item.name === raw.page);
  if (!page) throw new Error(`ActionContract page is not part of the selected ProjectIR: ${raw.page}`);
  const flattenedControls = flattenControls(page.controls);
  const controlIndex = new Map(flattenedControls.map((control) => [control.name, control]));
  const controls = new Set(controlIndex.keys());
  controls.add(page.name);
  const contracts = new Set(page.support.contractPoints.map((contract) =>
    `${contract.controlName}::${contract.event}::${contract.handler}`));
  const operationIds = new Set<string>();
  const mappedContracts = new Set<string>();

  const operations = raw.operations.map((value, index) => {
    const operation = validateOperation(value, index);
    if (operationIds.has(operation.operationId)) throw new Error(`Duplicate ActionContract operationId: ${operation.operationId}`);
    operationIds.add(operation.operationId);
    for (const trigger of operation.triggers ?? [operation.trigger]) {
      const contractKey = `${trigger.controlName}::${trigger.event}::${operation.handler}`;
      if (!contracts.has(contractKey)) throw new Error(`ActionContract operation does not match a scanned handler: ${contractKey}`);
      if (!controls.has(trigger.controlName)) throw new Error(`Unknown ActionContract trigger control: ${trigger.controlName}`);
      if (mappedContracts.has(contractKey)) throw new Error(`ActionContract trigger is mapped more than once: ${contractKey}`);
      mappedContracts.add(contractKey);
    }
    for (const field of operation.request?.fields ?? []) {
      if (!controls.has(field.sourceControl)) throw new Error(`Unknown ActionContract request control: ${field.sourceControl}`);
    }
    for (const binding of operation.response?.bindings ?? []) {
      if (binding.targetControl && !controls.has(binding.targetControl)) throw new Error(`Unknown ActionContract response control: ${binding.targetControl}`);
      if (binding.columnFields && binding.targetControl) {
        const columnNames = new Set((controlIndex.get(binding.targetControl)?.columns ?? []).map((column) => column.name));
        for (const columnName of Object.keys(binding.columnFields)) {
          if (!columnNames.has(columnName)) throw new Error(`Unknown ActionContract response column: ${binding.targetControl}.${columnName}`);
        }
      }
    }
    if (operation.effect && !controls.has(operation.effect.targetControl)) throw new Error(`Unknown ActionContract effect control: ${operation.effect.targetControl}`);
    return operation;
  });

  return {
    schemaVersion: 1,
    id: raw.id,
    page: raw.page,
    backend: {
      baseUrl: raw.backend.baseUrl,
      ...(typeof raw.backend.openApiPath === "string" ? { openApiPath: raw.backend.openApiPath } : {}),
    },
    operations,
  };
}

export async function loadActionContractManifests(manifestPaths: string[], project: ProjectIR): Promise<ActionContractPlan[]> {
  const plans = await Promise.all(manifestPaths.map((manifestPath) => loadActionContractManifest(manifestPath, project)));
  const ids = new Set<string>();
  const pages = new Set<string>();
  for (const plan of plans) {
    if (ids.has(plan.id)) throw new Error(`Duplicate ActionContract plan id across batch: ${plan.id}`);
    if (pages.has(plan.page)) throw new Error(`Multiple ActionContract plans target the same page: ${plan.page}`);
    ids.add(plan.id);
    pages.add(plan.page);
  }
  return plans;
}

function validateOperation(value: unknown, index: number): ActionContractOperation {
  const label = `ActionContract operation #${index + 1}`;
  if (!isObject(value) || typeof value.operationId !== "string" || !value.operationId.trim()
    || typeof value.handler !== "string" || !value.handler.trim() || typeof value.intent !== "string" || !value.intent.trim()) {
    throw new Error(`${label} requires operationId, handler, and intent`);
  }
  const triggerValues = value.triggers !== undefined ? value.triggers : value.trigger !== undefined ? [value.trigger] : [];
  if (!Array.isArray(triggerValues) || triggerValues.length === 0 || triggerValues.some((trigger) =>
    !isObject(trigger) || typeof trigger.controlName !== "string" || !trigger.controlName
      || typeof trigger.event !== "string" || !trigger.event)) {
    throw new Error(`${label} requires trigger or a non-empty triggers array with controlName and event`);
  }
  const triggers = triggerValues.map((trigger) => ({ controlName: String(trigger.controlName), event: String(trigger.event) }));
  if (value.execution !== "server" && value.execution !== "client") throw new Error(`${label} execution must be server or client`);
  if (!Array.isArray(value.capabilities) || value.capabilities.some((item) => typeof item !== "string" || !CAPABILITIES.has(item as ActionCapability))) {
    throw new Error(`${label} has an invalid capabilities list`);
  }
  let transport: ActionContractOperation["transport"];
  if (value.execution === "server") {
    if (!isObject(value.transport) || !["GET", "POST"].includes(String(value.transport.method))
      || typeof value.transport.path !== "string" || !value.transport.path.startsWith("/")) {
      throw new Error(`${label} server execution requires GET/POST transport with an absolute API path`);
    }
    transport = { method: value.transport.method as "GET" | "POST", path: value.transport.path };
  } else if (value.transport !== undefined) {
    throw new Error(`${label} client execution cannot declare transport`);
  }

  let request: ActionContractOperation["request"];
  if (value.request !== undefined) {
    if (!isObject(value.request) || !Array.isArray(value.request.fields)) throw new Error(`${label} request.fields must be an array`);
    request = { fields: value.request.fields.map((field, fieldIndex) => validateRequestField(field, `${label} request field #${fieldIndex + 1}`)) };
  }
  let response: ActionContractOperation["response"];
  if (value.response !== undefined) {
    if (!isObject(value.response) || !Array.isArray(value.response.bindings)) throw new Error(`${label} response.bindings must be an array`);
    response = { bindings: value.response.bindings.map((binding, bindingIndex) => validateResponseBinding(binding, `${label} response binding #${bindingIndex + 1}`)) };
  }
  let effect: ActionContractOperation["effect"];
  if (value.effect !== undefined) {
    if (!isObject(value.effect) || typeof value.effect.targetControl !== "string" || !value.effect.targetControl) {
      throw new Error(`${label} effect requires kind and targetControl`);
    }
    const kind = String(value.effect.kind);
    if (["select-all", "clear-all", "focus", "copy-value"].includes(kind)) {
      effect = { kind: kind as "select-all" | "clear-all" | "focus" | "copy-value", targetControl: value.effect.targetControl };
    } else if (kind === "set-value" && ["string", "number", "boolean"].includes(typeof value.effect.value)
      && (value.effect.targetProperty === undefined || ["text", "checked", "selectedIndex", "value"].includes(String(value.effect.targetProperty)))) {
      effect = {
        kind: "set-value",
        targetControl: value.effect.targetControl,
        ...(value.effect.targetProperty !== undefined ? { targetProperty: value.effect.targetProperty as "text" | "checked" | "selectedIndex" | "value" } : {}),
        value: value.effect.value as string | number | boolean,
      };
    } else if (kind === "transform-value" && ["uppercase", "lowercase", "trim"].includes(String(value.effect.transform))) {
      effect = { kind: "transform-value", targetControl: value.effect.targetControl, transform: value.effect.transform as "uppercase" | "lowercase" | "trim" };
    } else {
      throw new Error(`${label} has an unsupported or incomplete client effect`);
    }
  }
  if (value.execution === "client" && !effect) throw new Error(`${label} client execution requires an effect`);

  return {
    operationId: value.operationId,
    handler: value.handler,
    trigger: triggers[0],
    ...(value.triggers !== undefined ? { triggers } : {}),
    execution: value.execution,
    intent: value.intent,
    capabilities: [...value.capabilities] as ActionCapability[],
    ...(transport ? { transport } : {}),
    ...(request ? { request } : {}),
    ...(response ? { response } : {}),
    ...(effect ? { effect } : {}),
  };
}

function validateRequestField(value: unknown, label: string): ActionContractFieldBinding {
  if (!isObject(value) || typeof value.name !== "string" || !value.name || typeof value.sourceControl !== "string" || !value.sourceControl
    || typeof value.source !== "string" || !SOURCES.has(value.source as ActionContractFieldBinding["source"])) {
    throw new Error(`${label} requires name, sourceControl, and a supported source`);
  }
  if (value.parse !== undefined && (typeof value.parse !== "string" || !PARSERS.has(value.parse as NonNullable<ActionContractFieldBinding["parse"]>))) {
    throw new Error(`${label} has an invalid parser`);
  }
  return {
    name: value.name,
    sourceControl: value.sourceControl,
    source: value.source as ActionContractFieldBinding["source"],
    ...(value.parse ? { parse: value.parse as NonNullable<ActionContractFieldBinding["parse"]> } : {}),
  };
}

function validateResponseBinding(value: unknown, label: string): ActionContractResponseBinding {
  if (!isObject(value) || typeof value.source !== "string" || !value.source || typeof value.target !== "string"
    || !RESPONSE_TARGETS.has(value.target as ActionContractResponseBinding["target"])) {
    throw new Error(`${label} requires source and a supported target`);
  }
  if (["options", "visibility", "value", "rows"].includes(value.target as string) && (typeof value.targetControl !== "string" || !value.targetControl)) {
    throw new Error(`${label} requires targetControl`);
  }
  if (value.columnFields !== undefined && (!isObject(value.columnFields)
    || Object.entries(value.columnFields).some(([column, source]) => !column || typeof source !== "string" || !source))) {
    throw new Error(`${label} columnFields must map non-empty column names to response fields`);
  }
  return {
    source: value.source,
    target: value.target as ActionContractResponseBinding["target"],
    ...(typeof value.targetControl === "string" ? { targetControl: value.targetControl } : {}),
    ...(typeof value.labelField === "string" ? { labelField: value.labelField } : {}),
    ...(typeof value.valueField === "string" ? { valueField: value.valueField } : {}),
    ...(typeof value.rowIdField === "string" ? { rowIdField: value.rowIdField } : {}),
    ...(isObject(value.columnFields) ? { columnFields: Object.fromEntries(Object.entries(value.columnFields).map(([column, source]) => [column, String(source)])) } : {}),
  };
}

function flattenControls(controls: VisualControl[]): VisualControl[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.children)]);
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
