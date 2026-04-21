import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { InMemoryRbacProvider } from "../src/adapters/InMemoryRbacProvider";

function createStrictApp() {
  const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
  const app = createApp({ rbacProvider, consentGateEnabled: false });
  return { app, rbacProvider };
}

test("RBAC route guards", async (t) => {
  await t.test("workflow request route denies principals without REQUEST_WORKFLOW permission", async () => {
    const { app } = createStrictApp();

    const response = await request(app)
      .post("/api/cases/case-missing/workflows")
      .set("x-principal-id", "principal-no-role")
      .send({
        workflowName: "somatic-variant-calling",
        referenceBundleId: "GRCh38-2026a",
        executionProfile: "default",
      });

    assert.strictEqual(response.status, 403);
  });

  await t.test("workflow request route allows OPERATOR past RBAC", async () => {
    const { app, rbacProvider } = createStrictApp();
    await rbacProvider.assignRole("operator-1", "OPERATOR");

    const response = await request(app)
      .post("/api/cases/case-missing/workflows")
      .set("x-principal-id", "operator-1")
      .send({
        workflowName: "somatic-variant-calling",
        referenceBundleId: "GRCh38-2026a",
        executionProfile: "default",
      });

    assert.notStrictEqual(response.status, 403);
  });

  await t.test("review outcome route denies OPERATOR without APPROVE_REVIEW permission", async () => {
    const { app, rbacProvider } = createStrictApp();
    await rbacProvider.assignRole("operator-1", "OPERATOR");

    const response = await request(app)
      .post("/api/cases/case-missing/review-outcomes")
      .set("x-principal-id", "operator-1")
      .send({
        packetId: "packet-1",
        reviewerId: "reviewer-1",
        reviewDisposition: "approved",
        rationale: "Approved.",
      });

    assert.strictEqual(response.status, 403);
  });

  await t.test("review outcome route allows REVIEWER past RBAC", async () => {
    const { app, rbacProvider } = createStrictApp();
    await rbacProvider.assignRole("reviewer-1", "REVIEWER");

    const response = await request(app)
      .post("/api/cases/case-missing/review-outcomes")
      .set("x-principal-id", "reviewer-1")
      .send({
        packetId: "packet-1",
        reviewerId: "reviewer-1",
        reviewDisposition: "approved",
        rationale: "Approved.",
      });

    assert.notStrictEqual(response.status, 403);
  });

  await t.test("final release route denies principals without RELEASE_CASE permission", async () => {
    const { app } = createStrictApp();

    const response = await request(app)
      .post("/api/cases/case-missing/final-releases")
      .set("x-principal-id", "principal-no-role")
      .send({
        reviewId: "review-1",
        releaserId: "qp-1",
        rationale: "Independent release.",
      });

    assert.strictEqual(response.status, 403);
  });

  await t.test("final release route allows QUALITY_PERSON past RBAC", async () => {
    const { app, rbacProvider } = createStrictApp();
    await rbacProvider.assignRole("qp-1", "QUALITY_PERSON");

    const response = await request(app)
      .post("/api/cases/case-missing/final-releases")
      .set("x-principal-id", "qp-1")
      .send({
        reviewId: "review-1",
        releaserId: "qp-1",
        rationale: "Independent release.",
      });

    assert.notStrictEqual(response.status, 403);
  });

  await t.test("handoff route denies principals without RELEASE_CASE permission", async () => {
    const { app } = createStrictApp();

    const response = await request(app)
      .post("/api/cases/case-missing/handoff-packets")
      .set("x-principal-id", "principal-no-role")
      .send({
        reviewId: "review-1",
        handoffTarget: "manufacturing-site-A",
        requestedBy: "qa-manager-1",
        turnaroundDays: 14,
      });

    assert.strictEqual(response.status, 403);
  });

  await t.test("handoff route allows QUALITY_PERSON past RBAC", async () => {
    const { app, rbacProvider } = createStrictApp();
    await rbacProvider.assignRole("qp-1", "QUALITY_PERSON");

    const response = await request(app)
      .post("/api/cases/case-missing/handoff-packets")
      .set("x-principal-id", "qp-1")
      .send({
        reviewId: "review-1",
        handoffTarget: "manufacturing-site-A",
        requestedBy: "qa-manager-1",
        turnaroundDays: 14,
      });

    assert.notStrictEqual(response.status, 403);
  });
});