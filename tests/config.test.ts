import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config";

test("loadConfig uses safe defaults for local development", () => {
  const config = loadConfig({} as NodeJS.ProcessEnv);

  assert.equal(config.port, 4010);
  assert.equal(config.caseStoreDatabaseUrl, undefined);
  assert.equal(config.caseStoreTableName, "case_records");
  assert.equal(config.workflowDispatchDatabaseUrl, undefined);
  assert.equal(config.workflowDispatchTableName, "workflow_dispatches");
});

test("loadConfig trims explicit environment values", () => {
  const config = loadConfig({
    PORT: "4020",
    CASE_STORE_DATABASE_URL: "  postgres://localhost:5432/mrna_cases  ",
    CASE_STORE_TABLE_NAME: " case_records_v1 ",
    WORKFLOW_DISPATCH_DATABASE_URL: "  postgres://localhost:5432/mrna  ",
    WORKFLOW_DISPATCH_TABLE_NAME: " workflow_dispatch_queue ",
  });

  assert.equal(config.port, 4020);
  assert.equal(config.caseStoreDatabaseUrl, "postgres://localhost:5432/mrna_cases");
  assert.equal(config.caseStoreTableName, "case_records_v1");
  assert.equal(config.workflowDispatchDatabaseUrl, "postgres://localhost:5432/mrna");
  assert.equal(config.workflowDispatchTableName, "workflow_dispatch_queue");
});

test("loadConfig rejects an invalid case store table identifier", () => {
  assert.throws(
    () => loadConfig({ CASE_STORE_TABLE_NAME: "case-records" }),
    /CASE_STORE_TABLE_NAME must be a valid PostgreSQL identifier/,
  );
});

test("loadConfig rejects an out-of-range port", () => {
  assert.throws(
    () => loadConfig({ PORT: "70000" }),
    /PORT must be between 1 and 65535/,
  );
});

test("loadConfig rejects an invalid dispatch table identifier", () => {
  assert.throws(
    () => loadConfig({ WORKFLOW_DISPATCH_TABLE_NAME: "workflow-dispatches" }),
    /WORKFLOW_DISPATCH_TABLE_NAME must be a valid PostgreSQL identifier/,
  );
});