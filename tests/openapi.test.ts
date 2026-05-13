import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const OPENAPI_PATH = join(process.cwd(), "docs", "openapi.json");

describe("OpenAPI 3.1 spec", () => {
  it("is valid JSON", () => {
    const raw = readFileSync(OPENAPI_PATH, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), "openapi.json must be valid JSON");
  });

  it("declares openapi 3.1.0", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    assert.strictEqual(spec.openapi, "3.1.0", "Must declare OpenAPI 3.1.0");
  });

  it("has required info fields", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    assert.ok(spec.info, "Must have info block");
    assert.ok(spec.info.title, "Must have info.title");
    assert.ok(spec.info.version, "Must have info.version");
    assert.ok(spec.info.description, "Must have info.description");
    assert.ok(spec.info.license, "Must have info.license");
  });

  it("covers at least 40 paths", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    const pathCount = Object.keys(spec.paths ?? {}).length;
    assert.ok(pathCount >= 40, `Expected at least 40 paths, got ${pathCount}`);
  });

  it("has at least 10 tags", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    const tagCount = (spec.tags ?? []).length;
    assert.ok(tagCount >= 10, `Expected at least 10 tags, got ${tagCount}`);
  });

  it("includes security schemes", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    assert.ok(spec.components?.securitySchemes, "Must have securitySchemes");
    assert.ok(spec.components.securitySchemes.apiKey, "Must have apiKey scheme");
    assert.ok(spec.components.securitySchemes.bearerAuth, "Must have bearerAuth scheme");
  });

  it("declares component schemas for core inputs", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    const schemas = spec.components?.schemas ?? {};
    const required = [
      "CreateCaseInput",
      "RegisterSampleInput",
      "RegisterArtifactInput",
      "RequestWorkflowInput",
      "ApiError",
    ];
    for (const name of required) {
      assert.ok(schemas[name], `Schema ${name} must be defined`);
    }
  });

  it("every path has operationId and tags", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const [method, op] of Object.entries(methods as Record<string, unknown>)) {
        if (method === "parameters") continue;
        const operation = op as Record<string, unknown>;
        assert.ok(operation.operationId, `Path ${path} ${method} must have operationId`);
        assert.ok(Array.isArray(operation.tags) && operation.tags.length > 0,
          `Path ${path} ${method} must have at least one tag`);
      }
    }
  });

  it("health and readiness paths are present and public", () => {
    const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    assert.ok(spec.paths?.["/healthz"], "Must have /healthz");
    assert.ok(spec.paths?.["/readyz"], "Must have /readyz");
    assert.strictEqual(spec.paths["/healthz"].get.security, undefined, "/healthz should have no explicit security (public)");
  });
});
