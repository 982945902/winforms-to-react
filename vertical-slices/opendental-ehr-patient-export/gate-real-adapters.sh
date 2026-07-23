#!/bin/sh
set -eu

base_url=${PATIENT_EXPORT_API_URL:?Set PATIENT_EXPORT_API_URL to the deployed patient-export API base URL}
base_url=${base_url%/}
report=$(mktemp "${TMPDIR:-/tmp}/wf2-real-adapter-gate.XXXXXX")
openapi=$(mktemp "${TMPDIR:-/tmp}/wf2-real-adapter-openapi.XXXXXX")
trap 'rm "$report" "$openapi"' EXIT

curl --fail --silent --show-error "$base_url/ready" > "$report"
curl --fail --silent --show-error "$base_url/openapi/v1.json" > "$openapi"

node -e '
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const openapi = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const requiredPaths = [
  "/api/ehr-patient-export/options",
  "/api/ehr-patient-export/search",
  "/api/ehr-patient-export/exports",
  "/api/ehr-patient-export/artifacts/{artifactId}",
];
const missingPaths = requiredPaths.filter((path) => !openapi.paths?.[path]);
console.log("patient-data:", report.dataSource?.adapter, report.dataSource?.code);
console.log("ccd:", report.ccdGateway?.adapter, report.ccdGateway?.code);
if (!report.ready || !report.realAdapters || missingPaths.length) {
  if (missingPaths.length) console.error("missing OpenAPI paths:", missingPaths.join(", "));
  console.error("BLOCKED: real SQL Server and legacy CCD adapters are not both ready.");
  process.exit(2);
}
console.log("PASS: real SQL Server + legacy CCD adapter gate");
' "$report" "$openapi"
