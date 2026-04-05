import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getFullTraceabilityForCase,
  getOutcomeTimelineForCase,
  recordAdministrationForCase,
  recordClinicalFollowUpForCase,
  recordImmuneMonitoringForCase,
} from "../src/store-outcomes";

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

test("store delegates outcomes flows through a dedicated outcomes module", () => {
  assert.equal(typeof recordAdministrationForCase, "function");
  assert.equal(typeof recordImmuneMonitoringForCase, "function");
  assert.equal(typeof recordClinicalFollowUpForCase, "function");
  assert.equal(typeof getOutcomeTimelineForCase, "function");
  assert.equal(typeof getFullTraceabilityForCase, "function");

  const storeSource = readRepoFile("src", "store.ts");

  assert.match(storeSource, /from\s+"\.\/store-outcomes"/);
  assert.match(storeSource, /return\s+recordAdministrationForCase\(/);
  assert.match(storeSource, /return\s+recordImmuneMonitoringForCase\(/);
  assert.match(storeSource, /return\s+recordClinicalFollowUpForCase\(/);
  assert.match(storeSource, /return\s+getOutcomeTimelineForCase\(/);
  assert.match(storeSource, /return\s+getFullTraceabilityForCase\(/);
});