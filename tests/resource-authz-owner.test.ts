import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { InMemoryRbacProvider } from "../src/adapters/InMemoryRbacProvider";
import { InMemoryCaseAccessStore } from "../src/adapters/InMemoryCaseAccessStore";

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-authz-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

test("resource-scoped authorization", async (t) => {
  const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
  const caseAccessStore = new InMemoryCaseAccessStore();
  const app = createApp({ rbacProvider, caseAccessStore, consentGateEnabled: false });

  await rbacProvider.assignRole("alice", "OPERATOR");
  await rbacProvider.assignRole("bob", "OPERATOR");
  await rbacProvider.assignRole("admin", "ADMIN");

  const createResponse = await request(app)
    .post("/api/cases")
    .set("x-principal-id", "alice")
    .send(buildCaseInput());
  assert.equal(createResponse.status, 201);
  const caseId = String(createResponse.body.case.caseId);

  await t.test("owner can access their case", async () => {
    const res = await request(app)
      .get(`/api/cases/${caseId}`)
      .set("x-principal-id", "alice");
    assert.equal(res.status, 200);
  });

  await t.test("non-owner is denied for case-scoped route", async () => {
    const res = await request(app)
      .get(`/api/cases/${caseId}`)
      .set("x-principal-id", "bob");
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "Forbidden");
  });

  await t.test("admin can access foreign case", async () => {
    const res = await request(app)
      .get(`/api/cases/${caseId}`)
      .set("x-principal-id", "admin");
    assert.equal(res.status, 200);
  });

  await t.test("GET /api/cases only returns owned cases for non-admin principal", async () => {
    const bobCase = await request(app)
      .post("/api/cases")
      .set("x-principal-id", "bob")
      .send({
        caseProfile: {
          patientKey: "pt-authz-002",
          indication: "melanoma",
          siteId: "site-001",
          protocolVersion: "2026.1",
          consentStatus: "complete",
          boardRoute: "solid-tumor-board",
        },
      });
    assert.equal(bobCase.status, 201);

    const aliceList = await request(app)
      .get("/api/cases")
      .set("x-principal-id", "alice");
    assert.equal(aliceList.status, 200);
    assert.equal(aliceList.body.cases.length, 1);
    assert.equal(String(aliceList.body.cases[0].caseId), caseId);

    const adminList = await request(app)
      .get("/api/cases")
      .set("x-principal-id", "admin");
    assert.equal(adminList.status, 200);
    assert.ok(adminList.body.cases.length >= 2);
  });
});
