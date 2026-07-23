import { readFile } from "node:fs/promises";

const projectPath = process.argv[2];
if (!projectPath) throw new Error("Usage: node verify-generated-contract.mjs <generated-project.ir.json>");
const project = JSON.parse(await readFile(projectPath, "utf8"));
const plan = project.actionContracts?.find((candidate) => candidate.page === "Catagories");
assert(plan, "generated target contains the Catagories ActionContract plan");

const openApiUrl = new URL(plan.backend.openApiPath, plan.backend.baseUrl);
const openApi = await fetchJson(openApiUrl);
for (const operation of plan.operations) {
  assert(openApi.paths?.[operation.transport.path], `OpenAPI contains ${operation.transport.path}`);
  const inputValues = { txtsearch: "Acme" };
  const body = Object.fromEntries((operation.request?.fields ?? []).map((field) => [field.name, inputValues[field.sourceControl] ?? ""]));
  const payload = await fetchJson(new URL(operation.transport.path, plan.backend.baseUrl), {
    method: operation.transport.method,
    headers: operation.transport.method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: operation.transport.method === "POST" ? JSON.stringify(body) : undefined,
  });
  for (const binding of operation.response?.bindings ?? []) {
    const value = readPath(payload, binding.source);
    assert(value !== undefined, `${operation.operationId} resolves response binding ${binding.source}`);
    if (binding.target === "rows") {
      assert(Array.isArray(value), `${operation.operationId} row binding is an array`);
      assert(value.every((row) => row[binding.rowIdField] !== undefined), `${operation.operationId} rows expose ${binding.rowIdField}`);
      assert(value.length > 0 && Object.keys(value[0]).length > 0, `${operation.operationId} returns fields for runtime column inference`);
    }
  }
}

console.log("Generated Refine ActionContract matches the live POS categories API.");

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text}`);
  return JSON.parse(text);
}

function readPath(value, path) {
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
