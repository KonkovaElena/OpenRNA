import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryCaseStore } from "../src/store";
import { InMemoryRbacProvider } from "../src/adapters/InMemoryRbacProvider";

/**
 * Tests for security middleware: rate limiter, security headers, and RBAC auth.
 * Uses supertest to verify middleware behavior at the HTTP layer.
 */

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-sec-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

test("Security Headers Middleware", async (t) => {
  const store = new MemoryCaseStore();
  const app = createApp({ store });

  await t.test("responses include X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
  });

  await t.test("responses include X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.headers["x-frame-options"], "DENY");
  });

  await t.test("responses include Strict-Transport-Security header", async () => {
    const res = await request(app).get("/healthz");
    const hsts = res.headers["strict-transport-security"];
    assert.ok(hsts);
    assert.ok(hsts.includes("max-age=31536000"));
  });

  await t.test("responses include Content-Security-Policy: default-src 'none'", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.headers["content-security-policy"], "default-src 'none'");
  });

  await t.test("responses include Cache-Control: no-store", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.headers["cache-control"], "no-store");
  });

  await t.test("responses include Referrer-Policy: no-referrer", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.headers["referrer-policy"], "no-referrer");
  });

  await t.test("responses include Permissions-Policy header", async () => {
    const res = await request(app).get("/healthz");
    const pp = res.headers["permissions-policy"];
    assert.ok(pp);
    assert.ok(pp.includes("camera=()"));
  });
});

test("Rate Limiter Middleware", async (t) => {
  // Create app with very low rate limit to test exhaustion
  const store = new MemoryCaseStore();
  const app = createApp({ store, enableRateLimiting: true, rateLimitOptions: { maxTokens: 3, refillRate: 0 } });

  await t.test("allows requests within rate limit", async () => {
    const res = await request(app).get("/healthz");
    assert.strictEqual(res.status, 200);
  });

  await t.test("returns 429 when rate limit exhausted", async () => {
    // Exhaust the token bucket (3 tokens)
    await request(app).get("/healthz");
    await request(app).get("/healthz");
    await request(app).get("/healthz");

    const res = await request(app).get("/healthz");
    assert.strictEqual(res.status, 429);
    assert.ok(res.body.error);
    assert.ok(res.body.error.includes("Too many requests"));
    assert.ok(res.headers["retry-after"]);
  });
});

test("RBAC Auth Middleware", async (t) => {
  await t.test("allows all requests when no RBAC provider configured", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store });

    const res = await request(app)
      .post("/api/cases")
      .send(buildCaseInput());
    assert.strictEqual(res.status, 201);
  });

  await t.test("strict RBAC rejects unauthorized principals", async () => {
    const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
    const store = new MemoryCaseStore();
    const app = createApp({ store, rbacProvider });

    const res = await request(app)
      .post("/api/cases")
      .set("x-api-key", "unauthorized-user")
      .send(buildCaseInput());
    assert.strictEqual(res.status, 403);
    assert.ok(res.body.error);
  });

  await t.test("strict RBAC allows authorized principals", async () => {
    const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
    await rbacProvider.assignRole("authorized-user", "OPERATOR");
    const store = new MemoryCaseStore();
    const app = createApp({ store, rbacProvider });

    const res = await request(app)
      .post("/api/cases")
      .set("x-api-key", "authorized-user")
      .send(buildCaseInput());
    assert.strictEqual(res.status, 201);
  });

  await t.test("RBAC error details indicate action in response", async () => {
    const rbacProvider = new InMemoryRbacProvider({ allowAll: false });
    const store = new MemoryCaseStore();
    const app = createApp({ store, rbacProvider });

    const res = await request(app)
      .post("/api/cases")
      .set("x-api-key", "unknown-user")
      .send(buildCaseInput());
    assert.strictEqual(res.status, 403);
    assert.ok(res.body.detail, "response should include detail about the denied action");
  });
});
