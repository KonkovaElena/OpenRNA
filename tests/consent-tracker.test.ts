import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryConsentTracker } from "../src/adapters/InMemoryConsentTracker";
import type { ConsentEvent } from "../src/ports/IConsentTracker";

test("Consent Tracker", async (t) => {
  await t.test("records and retrieves consent events", async () => {
    const tracker = new InMemoryConsentTracker();
    const event: ConsentEvent = {
      type: "granted",
      timestamp: "2026-04-01T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    };
    await tracker.recordConsent("case-1", event);
    const history = await tracker.getConsentHistory("case-1");
    assert.strictEqual(history.length, 1);
    assert.deepStrictEqual(history[0], event);
  });

  await t.test("isConsentActive returns true when last event is granted", async () => {
    const tracker = new InMemoryConsentTracker();
    await tracker.recordConsent("case-1", {
      type: "granted",
      timestamp: "2026-04-01T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    });
    assert.strictEqual(await tracker.isConsentActive("case-1"), true);
  });

  await t.test("isConsentActive returns false when last event is withdrawn", async () => {
    const tracker = new InMemoryConsentTracker();
    await tracker.recordConsent("case-1", {
      type: "granted",
      timestamp: "2026-04-01T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    });
    await tracker.recordConsent("case-1", {
      type: "withdrawn",
      timestamp: "2026-04-02T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    });
    assert.strictEqual(await tracker.isConsentActive("case-1"), false);
  });

  await t.test("isConsentActive returns true after re-granting", async () => {
    const tracker = new InMemoryConsentTracker();
    await tracker.recordConsent("case-1", {
      type: "granted",
      timestamp: "2026-04-01T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    });
    await tracker.recordConsent("case-1", {
      type: "withdrawn",
      timestamp: "2026-04-02T00:00:00Z",
      scope: "genomic-analysis",
      version: "1.0",
    });
    await tracker.recordConsent("case-1", {
      type: "renewed",
      timestamp: "2026-04-03T00:00:00Z",
      scope: "genomic-analysis",
      version: "2.0",
    });
    assert.strictEqual(await tracker.isConsentActive("case-1"), true);
  });

  await t.test("isConsentActive returns false for unknown case", async () => {
    const tracker = new InMemoryConsentTracker();
    assert.strictEqual(await tracker.isConsentActive("unknown"), false);
  });

  await t.test("getConsentHistory returns empty array for unknown case", async () => {
    const tracker = new InMemoryConsentTracker();
    const history = await tracker.getConsentHistory("unknown");
    assert.strictEqual(history.length, 0);
  });

  await t.test("supports witnessId in consent event", async () => {
    const tracker = new InMemoryConsentTracker();
    await tracker.recordConsent("case-1", {
      type: "granted",
      timestamp: "2026-04-01T00:00:00Z",
      scope: "full-treatment",
      version: "1.0",
      witnessId: "witness-001",
    });
    const history = await tracker.getConsentHistory("case-1");
    assert.strictEqual(history[0].witnessId, "witness-001");
  });
});
