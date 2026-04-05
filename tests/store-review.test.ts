import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateBoardPacketForCase,
  generateHandoffPacketForCase,
  recordReviewOutcomeForCase,
} from "../src/store-review";

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

test("store delegates review mutation flows through a dedicated review module", () => {
  assert.equal(typeof generateBoardPacketForCase, "function");
  assert.equal(typeof recordReviewOutcomeForCase, "function");
  assert.equal(typeof generateHandoffPacketForCase, "function");

  const storeSource = readRepoFile("src", "store.ts");

  assert.match(storeSource, /from\s+"\.\/store-review"/);
  assert.match(storeSource, /return\s+generateBoardPacketForCase\(/);
  assert.match(storeSource, /return\s+recordReviewOutcomeForCase\(/);
  assert.match(storeSource, /return\s+generateHandoffPacketForCase\(/);
});