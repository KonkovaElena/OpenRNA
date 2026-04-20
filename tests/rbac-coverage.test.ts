import test, { describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";

/**
 * RBAC Coverage Tests.
 *
 * Verify that all mutating/case-scoped endpoints return 403 under
 * deny-by-default RBAC (no rbacAllowAll flag, no roles granted).
 */

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-rbac-test",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

describe("RBAC deny-by-default coverage", () => {
  // createApp without rbacAllowAll → deny-by-default
  const app = createApp({});

  const postRoutes = [
    { path: "/api/cases", body: buildCaseInput(), status: 403, label: "POST /api/cases" },
    { path: "/api/cases/c1/samples", body: {}, status: 403, label: "POST /api/cases/:caseId/samples" },
    { path: "/api/cases/c1/artifacts", body: {}, status: 403, label: "POST /api/cases/:caseId/artifacts" },
    { path: "/api/cases/c1/workflows", body: { referenceBundleId: "b1" }, status: 403, label: "POST /api/cases/:caseId/workflows" },
    { path: "/api/cases/c1/runs/r1/start", body: {}, status: 403, label: "POST /api/cases/:caseId/runs/:runId/start" },
    { path: "/api/cases/c1/runs/r1/complete", body: {}, status: 403, label: "POST /api/cases/:caseId/runs/:runId/complete" },
    { path: "/api/cases/c1/runs/r1/fail", body: {}, status: 403, label: "POST /api/cases/:caseId/runs/:runId/fail" },
    { path: "/api/cases/c1/runs/r1/cancel", body: {}, status: 403, label: "POST /api/cases/:caseId/runs/:runId/cancel" },
    { path: "/api/cases/c1/hla-consensus", body: {}, status: 403, label: "POST /api/cases/:caseId/hla-consensus" },
    { path: "/api/cases/c1/runs/r1/qc", body: {}, status: 403, label: "POST /api/cases/:caseId/runs/:runId/qc" },
    { path: "/api/cases/c1/neoantigen-ranking", body: {}, status: 403, label: "POST /api/cases/:caseId/neoantigen-ranking" },
    { path: "/api/cases/c1/construct-design", body: {}, status: 403, label: "POST /api/cases/:caseId/construct-design" },
    { path: "/api/cases/c1/outcomes/administration", body: {}, status: 403, label: "POST outcomes/administration" },
    { path: "/api/cases/c1/outcomes/immune-monitoring", body: {}, status: 403, label: "POST outcomes/immune-monitoring" },
    { path: "/api/cases/c1/outcomes/clinical-follow-up", body: {}, status: 403, label: "POST outcomes/clinical-follow-up" },
    { path: "/api/cases/c1/board-packets", body: {}, status: 403, label: "POST /api/cases/:caseId/board-packets" },
    { path: "/api/cases/c1/review-outcomes", body: {}, status: 403, label: "POST /api/cases/:caseId/review-outcomes" },
    { path: "/api/cases/c1/handoff-packets", body: {}, status: 403, label: "POST /api/cases/:caseId/handoff-packets" },
    { path: "/api/cases/c1/consent", body: { type: "granted", scope: "full", version: "1.0" }, status: 403, label: "POST /api/cases/:caseId/consent" },
    { path: "/api/reference-bundles", body: {}, status: 403, label: "POST /api/reference-bundles (ADMIN)" },
    { path: "/api/audit/sign", body: {}, status: 403, label: "POST /api/audit/sign (ADMIN)" },
    { path: "/api/audit/verify", body: {}, status: 403, label: "POST /api/audit/verify" },
    { path: "/api/cases/c1/validate-transition", body: { targetStatus: "REVIEWED" }, status: 403, label: "POST validate-transition" },
    { path: "/api/cases/c1/restart-from-revision", body: {}, status: 403, label: "POST restart-from-revision" },
    { path: "/api/cases/c1/resolve-hla-review", body: { rationale: "test" }, status: 403, label: "POST resolve-hla-review" },
  ];

  const getRoutes = [
    { path: "/api/cases", status: 403, label: "GET /api/cases" },
    { path: "/api/cases/c1", status: 403, label: "GET /api/cases/:caseId" },
    { path: "/api/cases/c1/runs", status: 403, label: "GET /api/cases/:caseId/runs" },
    { path: "/api/cases/c1/runs/r1", status: 403, label: "GET /api/cases/:caseId/runs/:runId" },
    { path: "/api/cases/c1/hla-consensus", status: 403, label: "GET /api/cases/:caseId/hla-consensus" },
    { path: "/api/cases/c1/runs/r1/qc", status: 403, label: "GET /api/cases/:caseId/runs/:runId/qc" },
    { path: "/api/cases/c1/neoantigen-ranking", status: 403, label: "GET neoantigen-ranking" },
    { path: "/api/cases/c1/construct-design", status: 403, label: "GET construct-design" },
    { path: "/api/cases/c1/outcomes", status: 403, label: "GET outcomes" },
    { path: "/api/cases/c1/traceability", status: 403, label: "GET traceability" },
    { path: "/api/cases/c1/board-packets", status: 403, label: "GET board-packets" },
    { path: "/api/cases/c1/board-packets/p1", status: 403, label: "GET board-packets/:packetId" },
    { path: "/api/cases/c1/review-outcomes", status: 403, label: "GET review-outcomes" },
    { path: "/api/cases/c1/review-outcomes/r1", status: 403, label: "GET review-outcomes/:reviewId" },
    { path: "/api/cases/c1/handoff-packets", status: 403, label: "GET handoff-packets" },
    { path: "/api/cases/c1/handoff-packets/h1", status: 403, label: "GET handoff-packets/:handoffId" },
    { path: "/api/reference-bundles", status: 403, label: "GET reference-bundles" },
    { path: "/api/reference-bundles/b1", status: 403, label: "GET reference-bundles/:bundleId" },
    { path: "/api/operations/summary", status: 403, label: "GET operations/summary" },
    { path: "/api/cases/c1/allowed-transitions", status: 403, label: "GET allowed-transitions" },
    { path: "/api/cases/c1/consent", status: 403, label: "GET consent" },
    { path: "/api/cases/c1/fhir/bundle", status: 403, label: "GET fhir/bundle" },
    { path: "/api/cases/c1/fhir/hla-consensus", status: 403, label: "GET fhir/hla-consensus" },
  ];

  for (const route of postRoutes) {
    test(`${route.label} → 403 without RBAC role`, async () => {
      const res = await request(app).post(route.path).send(route.body);
      assert.equal(res.status, 403, `Expected 403 for ${route.label}, got ${res.status}`);
      assert.equal(res.body.error, "Forbidden");
    });
  }

  for (const route of getRoutes) {
    test(`${route.label} → 403 without RBAC role`, async () => {
      const res = await request(app).get(route.path);
      assert.equal(res.status, 403, `Expected 403 for ${route.label}, got ${res.status}`);
      assert.equal(res.body.error, "Forbidden");
    });
  }

  test("exempt: GET / returns 200 (no RBAC)", async () => {
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
  });

  test("exempt: GET /healthz returns 200 (no RBAC)", async () => {
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 200);
  });

  test("exempt: GET /readyz returns 200 (no RBAC)", async () => {
    const res = await request(app).get("/readyz");
    assert.equal(res.status, 200);
  });

  test("rbacAllowAll: true bypasses all RBAC checks", async () => {
    const permissiveApp = createApp({ rbacAllowAll: true });
    const res = await request(permissiveApp).post("/api/cases").send(buildCaseInput());
    assert.equal(res.status, 201, "Should allow case creation with rbacAllowAll");
    assert.ok(res.body.case.caseId, "Should return case with caseId");
  });
});
