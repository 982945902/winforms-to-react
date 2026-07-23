import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.WF_ACTION_FIXTURE_PORT || 5199);
const option = (value, label = value) => ({ value, label });

let smokingState = {
  smokeStatus: "Former smoker",
  tobaccoStatus: "Former tobacco user",
  patientDeclined: false,
};

const smokingPayload = () => ({
  smokeStatuses: ["Current every day smoker", "Current some day smoker", "Former smoker", "Never smoker"].map((value) => option(value)),
  tobaccoStatuses: ["Current tobacco user", "Former tobacco user", "Never used tobacco", "Unknown"].map((value) => option(value)),
  assessmentTypes: [option("Smoking status"), option("Tobacco use")],
  interventionCodes: [option("Counseling", "Tobacco cessation counseling"), option("Medication", "Smoking cessation medication")],
  current: smokingState,
  assessments: [
    { id: 1, date: "07/15/2026", type: "Smoking", description: "Former smoker", documentation: "Patient history" },
    { id: 2, date: "01/08/2026", type: "Tobacco", description: "Former tobacco user", documentation: "Annual assessment" },
  ],
  interventions: [
    { id: 11, date: "05/10/2026", type: "Counseling", description: "Brief cessation counseling", declined: "No", documentation: "3 minutes" },
    { id: 12, date: "11/02/2025", type: "Medication", description: "Nicotine replacement discussed", declined: "Yes", documentation: "Patient declined" },
  ],
  status: "Smoking workspace loaded from the batchability fixture.",
});

const patients = [
  { patientNumber: 1001, age: 42, name: "Jordan Miller", birthdate: "04/16/1984", email: "jordan@example.test", address: "15 Cedar Ave", address2: "", city: "Salem", state: "OR", zip: "97301", contactMethod: "Email", status: "Patient", lastAppointment: "06/21/2026", nextAppointment: "08/04/2026", hasFutureAppointment: true },
  { patientNumber: 1002, age: 67, name: "Alexis Chen", birthdate: "09/08/1958", email: "alexis@example.test", address: "29 Market St", address2: "Suite 4", city: "Portland", state: "OR", zip: "97205", contactMethod: "Phone", status: "Patient", lastAppointment: "03/17/2025", nextAppointment: "", hasFutureAppointment: false },
  { patientNumber: 1003, age: 24, name: "Taylor Rivera", birthdate: "12/13/2001", email: "taylor@example.test", address: "802 Pine Rd", address2: "", city: "Eugene", state: "OR", zip: "97401", contactMethod: "Text", status: "Patient", lastAppointment: "01/22/2026", nextAppointment: "", hasFutureAppointment: false },
  { patientNumber: 1004, age: 79, name: "Morgan Patel", birthdate: "02/27/1947", email: "", address: "7 Oak Court", address2: "", city: "Bend", state: "OR", zip: "97701", contactMethod: "Mail", status: "Inactive", lastAppointment: "08/09/2022", nextAppointment: "", hasFutureAppointment: false }
];

function advertisingPayload(items = patients) {
  return {
    billingTypes: [option("All"), option("Insurance"), option("Patient")],
    patientStatuses: [option("Patient"), option("Inactive"), option("Archived")],
    contactMethods: [option("All"), option("Email"), option("Phone"), option("Text"), option("Mail")],
    defaults: { ageFrom: 1, ageTo: 110, hideNotSeenSince: true, hideSeenSince: false, hideFutureAppointments: false },
    items,
    status: `${items.length} patient(s) loaded from the batchability fixture.`,
  };
}

const server = createServer(async (request, response) => {
  setCors(request, response);
  if (request.method === "OPTIONS") return send(response, 204);
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok", fixture: "action-contract-batchability" });
    if (request.method === "GET" && url.pathname === "/api/batchability/smoking") return json(response, 200, smokingPayload());
    if (request.method === "POST" && url.pathname === "/api/batchability/smoking") {
      const body = await readJson(request);
      if (!body.smokeStatus || !body.tobaccoStatus) return json(response, 400, { message: "Smoke status and tobacco status are required." });
      smokingState = { smokeStatus: String(body.smokeStatus), tobaccoStatus: String(body.tobaccoStatus), patientDeclined: Boolean(body.patientDeclined) };
      return json(response, 200, { current: smokingState, message: "Smoking state saved by the fixture API." });
    }
    if (request.method === "POST" && url.pathname === "/api/batchability/smoking/intervention-codes") {
      const body = await readJson(request);
      const filters = {
        radioRecentInterventions: [option("Counseling", "Tobacco cessation counseling")],
        radioAllInterventions: [option("Counseling", "Tobacco cessation counseling"), option("Medication", "Smoking cessation medication"), option("Referral", "Quit-line referral")],
        radioMedInterventions: [option("Medication", "Smoking cessation medication")],
        radioCounselInterventions: [option("Counseling", "Tobacco cessation counseling"), option("Referral", "Quit-line referral")],
      };
      const options = filters[String(body.filterControl)] || filters.radioRecentInterventions;
      return json(response, 200, { options, status: `${options.length} intervention code(s) available.` });
    }
    if (request.method === "POST" && url.pathname === "/api/batchability/smoking/tobacco-statuses") {
      const body = await readJson(request);
      const filters = {
        radioRecentStatuses: [option("Current tobacco user"), option("Former tobacco user"), option("Never used tobacco")],
        radioAllStatuses: [option("Current tobacco user"), option("Former tobacco user"), option("Never used tobacco"), option("Unknown"), option("Custom SNOMED status")],
        radioNonUserStatuses: [option("Never used tobacco"), option("Former tobacco user")],
        radioUserStatuses: [option("Current tobacco user"), option("Custom SNOMED status")],
      };
      const options = filters[String(body.filterControl)] || filters.radioRecentStatuses;
      return json(response, 200, { options, status: `${options.length} tobacco status(es) available.` });
    }
    if (request.method === "GET" && url.pathname === "/api/batchability/advertising") return json(response, 200, advertisingPayload());
    if (request.method === "POST" && url.pathname === "/api/batchability/advertising/search") {
      const body = await readJson(request);
      const ageFrom = body.ageFrom == null ? 1 : Number(body.ageFrom);
      const ageTo = body.ageTo == null ? 110 : Number(body.ageTo);
      if (!Number.isFinite(ageFrom) || !Number.isFinite(ageTo) || ageFrom < 0 || ageTo < ageFrom) {
        return json(response, 400, { message: "Age range is invalid." });
      }
      const items = patients.filter((patient) => patient.age >= ageFrom && patient.age <= ageTo)
        .filter((patient) => !body.hideFutureAppointments || !patient.hasFutureAppointment);
      return json(response, 200, advertisingPayload(items));
    }
    if (request.method === "POST" && url.pathname === "/api/batchability/advertising/commit") {
      const body = await readJson(request);
      const patientNumbers = Array.isArray(body.patientNumbers) ? body.patientNumbers.map(Number).filter(Number.isFinite) : [];
      if (patientNumbers.length === 0) return json(response, 400, { message: "Select at least one patient before committing the list." });
      return json(response, 200, { patientNumbers, message: `${patientNumbers.length} patient(s) prepared for the advertising list.` });
    }
    return json(response, 404, { message: "Fixture endpoint not found." });
  } catch (error) {
    return json(response, 500, { message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => console.log(`ActionContract fixture API listening on http://${host}:${port}`));

function setCors(request, response) {
  const origin = String(request.headers.origin || "");
  if (/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function send(response, status) {
  response.statusCode = status;
  response.end();
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Request body must be valid JSON."); }
}
