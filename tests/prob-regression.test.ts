/**
 * Regression tests for PROB-002, PROB-004, PROB-008, PROB-009, PROB-010, PROB-014.
 * Each section targets one specific fix to prevent silent reintroduction.
 */
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";

// ── Helpers ──────────────────────────────────────────────────────────

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-regr-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
    },
  };
}

async function createConstructDesign(app: ReturnType<typeof createApp>, caseId: string) {
  const res = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({
      rankedCandidates: [
        {
          candidateId: "cand-regr-001",
          rank: 1,
          compositeScore: 0.92,
          featureWeights: { binding: 0.7, expression: 0.3 },
          featureScores: { binding: 0.95, expression: 0.85 },
          uncertaintyContribution: 0.08,
          explanation: "Highest-ranked candidate for regression coverage.",
        },
      ],
    });

  assert.equal(res.status, 201);
  return res.body.constructDesign as { constructId: string; version: number };
}

// ── PROB-002: API Key Authentication ─────────────────────────────────

test("PROB-002: exempt paths respond without api key", async () => {
  const app = createApp({ apiKey: "secret-key-42" });

  for (const path of ["/", "/healthz", "/readyz", "/metrics"]) {
    const res = await request(app).get(path);
    assert.notEqual(res.status, 401, `${path} should not require auth`);
    assert.notEqual(res.status, 403, `${path} should not reject valid request`);
  }
});

test("PROB-002: protected route returns 401 without x-api-key header", async () => {
  const app = createApp({ apiKey: "secret-key-42" });
  const res = await request(app).get("/api/cases");
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Missing x-api-key/);
});

test("PROB-002: protected route returns 403 with wrong api key", async () => {
  const app = createApp({ apiKey: "secret-key-42" });
  const res = await request(app)
    .get("/api/cases")
    .set("x-api-key", "wrong-key");
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Invalid API key/);
});

test("PROB-002: protected route returns 200 with correct api key", async () => {
  const app = createApp({ apiKey: "secret-key-42" });
  const res = await request(app)
    .get("/api/cases")
    .set("x-api-key", "secret-key-42");
  assert.equal(res.status, 200);
});

test("PROB-002: no auth middleware when apiKey is not set", async () => {
  const app = createApp(); // no apiKey
  const res = await request(app).get("/api/cases");
  assert.equal(res.status, 200);
});

test("PROB-002: loadConfig reads API_KEY and maps it to apiKey", () => {
  const config = loadConfig({ API_KEY: "  my-secret  " });
  assert.equal(config.apiKey, "my-secret");
});

test("PROB-002: loadConfig leaves apiKey undefined when API_KEY absent", () => {
  const config = loadConfig({} as NodeJS.ProcessEnv);
  assert.equal(config.apiKey, undefined);
});

// ── PROB-004: Pagination ─────────────────────────────────────────────

test("PROB-004: GET /api/cases returns meta with totalCases, limit, offset", async () => {
  const app = createApp();
  await request(app).post("/api/cases").send(buildCaseInput());
  await request(app).post("/api/cases").send(buildCaseInput());

  const res = await request(app).get("/api/cases");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.cases), "should have cases array");
  assert.ok(res.body.meta, "should have meta object");
  assert.equal(res.body.meta.totalCases, 2);
  assert.equal(res.body.meta.limit, 50); // default
  assert.equal(res.body.meta.offset, 0);
});

test("PROB-004: pagination respects limit and offset query params", async () => {
  const app = createApp();
  for (let i = 0; i < 5; i++) {
    await request(app).post("/api/cases").send(buildCaseInput());
  }

  const res = await request(app).get("/api/cases?limit=2&offset=1");
  assert.equal(res.status, 200);
  assert.equal(res.body.cases.length, 2);
  assert.equal(res.body.meta.totalCases, 5);
  assert.equal(res.body.meta.limit, 2);
  assert.equal(res.body.meta.offset, 1);
});

test("PROB-004: limit is clamped to max 200", async () => {
  const app = createApp();
  await request(app).post("/api/cases").send(buildCaseInput());

  // limit=999 → clamped to 200
  const res = await request(app).get("/api/cases?limit=999");
  assert.equal(res.body.meta.limit, 200);
});

test("PROB-004: limit=1 is accepted", async () => {
  const app = createApp();
  await request(app).post("/api/cases").send(buildCaseInput());

  const res = await request(app).get("/api/cases?limit=1");
  assert.equal(res.body.meta.limit, 1);
  assert.equal(res.body.cases.length, 1);
});

// ── PROB-008: Confidence Score Range ──────────────────────────────────

test("PROB-008: HLA confidenceScore rejects values > 1", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;

  const res = await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["A*01:01", "A*02:01"],
    perToolEvidence: [
      { toolName: "optitype", alleles: ["A*01:01"], confidence: 0.9 },
    ],
    confidenceScore: 1.5,
    referenceVersion: "IMGT-3.54.0",
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /confidenceScore must be between 0 and 1/);
});

test("PROB-008: HLA confidenceScore rejects values < 0", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;

  const res = await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["A*01:01", "A*02:01"],
    perToolEvidence: [
      { toolName: "optitype", alleles: ["A*01:01"], confidence: 0.9 },
    ],
    confidenceScore: -0.1,
    referenceVersion: "IMGT-3.54.0",
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /confidenceScore must be between 0 and 1/);
});

test("PROB-008: HLA confidenceScore accepts boundary values 0 and 1", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;

  for (const score of [0, 1]) {
    const res = await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
      alleles: ["A*01:01", "A*02:01"],
      perToolEvidence: [
        { toolName: "optitype", alleles: ["A*01:01"], confidence: 0.9 },
      ],
      confidenceScore: score,
      referenceVersion: "IMGT-3.54.0",
    });
    assert.equal(res.status, 200, `score=${score} should be accepted`);
  }
});

// ── PROB-009: ISO 8601 Timestamp Validation ──────────────────────────

test("PROB-009: rejects non-ISO observedAt in immune monitoring", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;

  const res = await request(app).post(`/api/cases/${caseId}/outcomes/immune-monitoring`).send({
    monitoringId: "imm-001",
    constructId: "CNST-001",
    constructVersion: 1,
    collectedAt: "2026-03-15",
    assayType: "ELISpot",
    biomarker: "IFN-gamma",
    value: 150,
    unit: "SFU/1e6",
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /ISO 8601 timestamp/);
});

test("PROB-009: rejects non-ISO administeredAt in administration outcome", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;

  const res = await request(app).post(`/api/cases/${caseId}/outcomes/administration`).send({
    administrationId: "admin-001",
    constructId: "construct-001",
    constructVersion: 1,
    administeredAt: "2026-01-15",  // not ISO datetime
    route: "intravenous",
    doseMicrograms: 100,
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /ISO 8601 timestamp/);
});

test("PROB-009: accepts valid ISO 8601 administeredAt", async () => {
  const app = createApp();
  const caseRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = caseRes.body.case.caseId;
  const constructDesign = await createConstructDesign(app, caseId);

  const res = await request(app).post(`/api/cases/${caseId}/outcomes/administration`).send({
    administrationId: "admin-002",
    constructId: constructDesign.constructId,
    constructVersion: constructDesign.version,
    administeredAt: "2026-01-15T10:30:00.000Z",
    route: "intravenous",
    doseMicrograms: 100,
  });
  assert.equal(res.status, 201);
});

// ── PROB-010: Pool Configuration ─────────────────────────────────────

test("PROB-010: loadConfig returns pool-relevant fields", () => {
  const config = loadConfig({
    CASE_STORE_DATABASE_URL: "postgres://localhost:5432/mrna",
  });
  // Verifies that config is usable for creating Pools with proper settings.
  // The actual Pool config (max, statement_timeout, etc.) is applied in index.ts.
  assert.ok(config.caseStoreDatabaseUrl, "should expose database URL");
  assert.ok(config.port, "should expose port");
});

// ── PROB-014: Request Logger ─────────────────────────────────────────

test("PROB-014: request logger emits JSON to stdout for API calls", async () => {
  const lines: string[] = [];
  const app = createApp({
    requestLogWriter: (line) => {
      if (line.includes('"method"')) {
        lines.push(line.trim());
      }
    },
  });

  await request(app).post("/api/cases").send(buildCaseInput());
  assert.ok(lines.length >= 1, "should have logged at least one request");
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.method, "POST");
  assert.equal(entry.url, "/api/cases");
  assert.equal(entry.statusCode, 201);
  assert.ok(entry.timestamp, "should have timestamp");
  assert.ok(typeof entry.durationMs === "number", "should have durationMs");
  assert.ok(entry.correlationId, "should have correlationId");
});

test("PROB-014: request logger skips health/metrics paths", async () => {
  const lines: string[] = [];
  const app = createApp({
    requestLogWriter: (line) => {
      if (line.includes('"method"')) {
        lines.push(line.trim());
      }
    },
  });

  await request(app).get("/healthz");
  await request(app).get("/readyz");
  await request(app).get("/metrics");
  assert.equal(lines.length, 0, "should not log exempt paths");
});
