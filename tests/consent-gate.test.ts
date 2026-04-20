import test, { describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";

/**
 * Consent Gate Tests.
 *
 * Verify that case-write POST endpoints are blocked when no consent
 * has been granted, allowed after grant, and re-blocked after withdrawal.
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
    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
    assert.equal(createRes.status, 201);
    const caseId = createRes.body.case.caseId;

    // Attempt to register a sample without consent
    const sampleRes = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(sampleRes.status, 403, "Should reject sample registration without consent");
    assert.equal(sampleRes.body.code, "consent_required");
  });

  test("consent grant enables case-write operations", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
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
    assert.equal(sampleRes.status, 200, "Should allow sample registration after consent grant");
  });

  test("consent withdrawal re-blocks case-write operations", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
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

    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Reading consent history should work even without approved consent
    const res = await request(app).get(`/api/cases/${caseId}/consent`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.history));
  });

  test("consent POST rejects invalid type", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    const res = await request(app)
      .post(`/api/cases/${caseId}/consent`)
      .send({ type: "revoked", scope: "full", version: "1.0" });
    assert.equal(res.status, 400, "Should reject invalid consent type");
  });

  test("consent renewed re-activates consent gate", async () => {
    const app = createApp({ rbacAllowAll: true });

    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
    const caseId = createRes.body.case.caseId;

    // Grant → withdraw → renew
    await request(app).post(`/api/cases/${caseId}/consent`).send({ type: "granted", scope: "full-genomic", version: "2.0" });
    await request(app).post(`/api/cases/${caseId}/consent`).send({ type: "withdrawn", scope: "full-genomic", version: "2.0" });
    await request(app).post(`/api/cases/${caseId}/consent`).send({ type: "renewed", scope: "full-genomic", version: "3.0" });

    // Should be active again
    const sampleRes = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(buildSample());
    assert.equal(sampleRes.status, 200, "Should allow after renewal");
  });
});
