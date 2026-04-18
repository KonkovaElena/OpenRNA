import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";

function buildCaseInput(consentStatus: "complete" | "missing") {
  return {
    caseProfile: {
      patientKey: "pt-sdc-001",
      indication: "melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus,
      boardRoute: "solid-tumor-board",
    },
  };
}

test("server-derived consent on create-case", async (t) => {
  await t.test("runtime mode can force consentStatus=missing regardless of client payload", async () => {
    const app = createApp({
      rbacAllowAll: true,
      consentGateEnabled: false,
      enforceServerDerivedConsentOnCreate: true,
    });

    const res = await request(app)
      .post("/api/cases")
      .send(buildCaseInput("complete"));

    assert.equal(res.status, 201);
    assert.equal(res.body.case.caseProfile.consentStatus, "missing");
    assert.equal(res.body.case.status, "AWAITING_CONSENT");
  });

  await t.test("default mode keeps backward-compatible create-case behavior", async () => {
    const app = createApp({
      rbacAllowAll: true,
      consentGateEnabled: false,
    });

    const res = await request(app)
      .post("/api/cases")
      .send(buildCaseInput("complete"));

    assert.equal(res.status, 201);
    assert.equal(res.body.case.caseProfile.consentStatus, "complete");
  });
});
