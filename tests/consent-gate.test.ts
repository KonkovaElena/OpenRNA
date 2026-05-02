import test, { describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";

/**
 * Consent Gate Tests.
 *
 * Verify that case-write endpoints and regulated disclosure endpoints are blocked
 * when no consent has been granted, allowed after grant, and re-blocked after withdrawal.
 */

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-consent-test",
      indication: "breast carcinoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

function buildSample(sampleType = "TUMOR_DNA", assayType = "WES") {
  return {
    sampleId: `${sampleType.toLowerCase()}-001`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}`,
    sourceSite: "site-001",
  };
}

describe("consent gate middleware", () => {
  test("POST /api/cases/:caseId/samples returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    // Create a case (not consent-gated since it's not a per-case write)
    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    // Attempt to register a sample without consent
    const sampleRes = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(
      sampleRes.status,
      403,
      "Should reject sample registration without consent",
    );
    assert.equal(sampleRes.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/traceability returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(`/api/cases/${caseId}/traceability`);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/runs returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(`/api/cases/${caseId}/runs`);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/runs proceeds after consent grant", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const consentRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    assert.equal(consentRes.status, 201);

    const res = await request(app).get(`/api/cases/${caseId}/runs`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.runs));
  });

  test("GET /api/cases/:caseId/board-packets returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(`/api/cases/${caseId}/board-packets`);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/neoantigen-ranking returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(
      `/api/cases/${caseId}/neoantigen-ranking`,
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/traceability proceeds after consent grant", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const consentRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    assert.equal(consentRes.status, 201);

    const res = await request(app).get(`/api/cases/${caseId}/traceability`);

    // With consent active, readiness rules apply (ranking/construct may still be missing)
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "traceability_not_ready");
  });

  test("GET /api/cases/:caseId/fhir/bundle returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(`/api/cases/${caseId}/fhir/bundle`);

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/fhir/bundle proceeds after consent grant", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const consentRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    assert.equal(consentRes.status, 201);

    const res = await request(app).get(`/api/cases/${caseId}/fhir/bundle`);

    assert.equal(res.status, 200);
  });

  test("GET /api/cases/:caseId/fhir/hla-consensus returns 403 when no consent recorded", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const res = await request(app).get(
      `/api/cases/${caseId}/fhir/hla-consensus`,
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.code, "consent_required");
  });

  test("GET /api/cases/:caseId/fhir/hla-consensus proceeds after consent grant", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    const consentRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    assert.equal(consentRes.status, 201);

    const res = await request(app).get(
      `/api/cases/${caseId}/fhir/hla-consensus`,
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.code, "not_found");
  });

  test("consent grant enables case-write operations", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Grant consent
    const consentRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    assert.equal(consentRes.status, 201);

    // Now sample registration should succeed
    const sampleRes = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(
      sampleRes.status,
      200,
      "Should allow sample registration after consent grant",
    );
  });

  test("consent withdrawal re-blocks case-write operations", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Grant consent
    await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });

    // Register sample successfully
    const sample1 = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(sample1.status, 200);

    // Withdraw consent
    await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "withdrawn", scope: "full-genomic", version: "2.0" });

    // Attempt another sample registration — should be blocked
    const sample2 = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample("NORMAL_DNA", "WES"));
    assert.equal(sample2.status, 403, "Should block after consent withdrawal");
    assert.equal(sample2.body.code, "consent_required");
  });

  test("consent GET endpoint is not consent-gated", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Reading consent history should work even without approved consent
    const res = await request(app).get(`/api/cases/${caseId}/consent`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.history));
  });

  test("consent POST rejects invalid type", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    const res = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "revoked", scope: "full", version: "1.0" });
    assert.equal(res.status, 400, "Should reject invalid consent type");
  });

  test("consent renewed re-activates consent gate", async () => {
    // NOTE: CONSENT_WITHDRAWN is an absorbing (terminal) state. Consent renewal is
    // not permitted on a withdrawn case — a new case must be opened. This test
    // verifies that the renewal attempt returns 409 and that the case remains
    // locked. Per ICH E6(R2) §4.8.2, renewed participation requires a fresh
    // informed-consent cycle documented against a new case record.
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Grant → withdraw
    await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "2.0" });
    await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "withdrawn", scope: "full-genomic", version: "2.0" });

    // Attempted renewal on a terminal withdrawn case must be rejected
    const renewalRes = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "renewed", scope: "full-genomic", version: "3.0" });
    assert.equal(
      renewalRes.status,
      409,
      "Renewal on CONSENT_WITHDRAWN must return 409",
    );
    assert.equal(
      renewalRes.body.code,
      "new_case_required_after_consent_withdrawal",
    );

    // Case remains in CONSENT_WITHDRAWN — operations still blocked
    const sampleRes = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(
      sampleRes.status,
      403,
      "Operations remain blocked on the withdrawn case",
    );
  });

  test("new case after consent withdrawal unblocks a fresh treatment cycle", async () => {
    // The correct pattern: open a new case once renewed consent is obtained.
    const app = createApp({ rbacAllowAll: true });

    // Original case
    const createRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    const oldCaseId = createRes.body.case.caseId;
    await request(app)
      .post(`/api/cases/${oldCaseId}/consent`)
      .send({ type: "withdrawn", scope: "full-genomic", version: "2.0" });

    // Fresh case under renewed consent
    const newCaseRes = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.equal(newCaseRes.status, 201, "New case should be creatable");
    const newCaseId = newCaseRes.body.case.caseId;

    await request(app)
      .post(`/api/cases/${newCaseId}/consent`)
      .send({ type: "granted", scope: "full-genomic", version: "3.0" });

    const sampleRes = await request(app)
      .post(`/api/cases/${newCaseId}/samples`)
      .send(buildSample());
    assert.equal(
      sampleRes.status,
      200,
      "New case should allow sample registration after consent",
    );
  });
});
