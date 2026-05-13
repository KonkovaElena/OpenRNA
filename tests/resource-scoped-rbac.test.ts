import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { InMemoryCaseAccessStore } from "../src/adapters/InMemoryCaseAccessStore";
import { InMemoryRbacProvider } from "../src/adapters/InMemoryRbacProvider";
import { createApp } from "../src/app";

function buildCaseInput(patientKey: string) {
  return {
    caseProfile: {
      patientKey,
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

function buildSampleInput(sampleId: string, sampleType = "TUMOR_DNA") {
  return {
    sampleId,
    sampleType,
    assayType: "WES",
    accessionId: `acc-${sampleId}`,
    sourceSite: "site-001",
  };
}

async function createOwnedCase(app: ReturnType<typeof createApp>, principalId: string, patientKey: string) {
  const response = await request(app)
    .post("/api/cases")
    .set("x-principal-id", principalId)
    .send(buildCaseInput(patientKey));

  assert.equal(response.status, 201);
  return String(response.body.case.caseId);
}

// URS-013 / FS-013 / OQ-010: resource-scoped RBAC must deny a principal that
// has the correct route-level role but lacks a case-specific access grant.
test("resource-scoped RBAC denies cross-case mutations for otherwise authorized operators", async (t) => {
  const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
  const caseAccessStore = new InMemoryCaseAccessStore();
  const app = createApp({
    rbacProvider,
    caseAccessStore,
    consentGateEnabled: false,
  });

  await rbacProvider.assignRole("principal-a", "OPERATOR");
  await rbacProvider.assignRole("principal-a", "REVIEWER");
  await rbacProvider.assignRole("principal-b", "OPERATOR");
  await rbacProvider.assignRole("principal-admin", "ADMIN");

  const caseA = await createOwnedCase(app, "principal-a", "pt-resource-a");
  const caseB = await createOwnedCase(app, "principal-b", "pt-resource-b");

  await t.test("owner can mutate their own case", async () => {
    const response = await request(app)
      .post(`/api/cases/${caseA}/samples`)
      .set("x-principal-id", "principal-a")
      .send(buildSampleInput("tumor-dna-owner"));

    assert.equal(response.status, 200);
  });

  await t.test("principal A cannot mutate principal B's case despite OPERATOR role", async () => {
    const response = await request(app)
      .post(`/api/cases/${caseB}/samples`)
      .set("x-principal-id", "principal-a")
      .send(buildSampleInput("tumor-dna-cross-case"));

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "resource_access_denied");
    assert.match(response.body.nextStep, /does not have access to case/);
  });

  await t.test("reviewer cannot submit review outcome for a foreign case despite APPROVE_REVIEW role", async () => {
    const response = await request(app)
      .post(`/api/cases/${caseB}/review-outcomes`)
      .set("x-principal-id", "principal-a")
      .send({});

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "resource_access_denied");
    assert.match(response.body.nextStep, /does not have access to case/);
  });

  await t.test("case grant allows an explicitly assigned non-owner to mutate", async () => {
    await caseAccessStore.grantAccess(caseB, "principal-a", "REVIEWER");

    const response = await request(app)
      .post(`/api/cases/${caseB}/samples`)
      .set("x-principal-id", "principal-a")
      .send(buildSampleInput("tumor-dna-assigned"));

    assert.equal(response.status, 200);
  });

  await t.test("admin bypass remains available for regulated operations staff", async () => {
    const response = await request(app)
      .post(`/api/cases/${caseB}/samples`)
      .set("x-principal-id", "principal-admin")
      .send(buildSampleInput("normal-dna-admin", "NORMAL_DNA"));

    assert.equal(response.status, 200);
  });
});
