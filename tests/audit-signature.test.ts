import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditSignatureProvider } from "../src/adapters/InMemoryAuditSignatureProvider";
import type { AuditEntry } from "../src/ports/IAuditSignatureProvider";

test("Audit Signature Provider", async (t) => {
  const provider = new InMemoryAuditSignatureProvider();
  const entry: AuditEntry = {
    eventId: "event-001",
    caseId: "case-001",
    type: "case.created",
    detail: "Case was created",
    occurredAt: "2026-04-01T00:00:00Z",
    correlationId: "corr-001",
  };

  await t.test("signs an audit entry with HMAC-SHA256", async () => {
    const signed = await provider.signAuditEntry(entry, "principal-1");
    assert.strictEqual(signed.eventId, entry.eventId);
    assert.strictEqual(signed.caseId, entry.caseId);
    assert.strictEqual(signed.signedBy, "principal-1");
    assert.strictEqual(signed.signatureMethod, "hmac-sha256");
    assert.ok(signed.signatureHash);
    assert.ok(signed.signedAt);
  });

  await t.test("verifies a valid signature", async () => {
    const signed = await provider.signAuditEntry(entry, "principal-1");
    const valid = await provider.verifySignature(signed);
    assert.strictEqual(valid, true);
  });

  await t.test("rejects tampered entry", async () => {
    const signed = await provider.signAuditEntry(entry, "principal-1");
    signed.detail = "Tampered detail";
    const valid = await provider.verifySignature(signed);
    assert.strictEqual(valid, false);
  });

  await t.test("rejects corrupted hash", async () => {
    const signed = await provider.signAuditEntry(entry, "principal-1");
    signed.signatureHash = "corrupted";
    const valid = await provider.verifySignature(signed);
    assert.strictEqual(valid, false);
  });

  await t.test("different entries produce different hashes", async () => {
    const signed1 = await provider.signAuditEntry(entry, "principal-1");
    const entry2: AuditEntry = { ...entry, eventId: "event-002" };
    const signed2 = await provider.signAuditEntry(entry2, "principal-1");
    assert.notStrictEqual(signed1.signatureHash, signed2.signatureHash);
  });

  await t.test("same entry signed by different principals produces different hashes", async () => {
    const signed1 = await provider.signAuditEntry(entry, "principal-1");
    const signed2 = await provider.signAuditEntry(entry, "principal-2");
    // Signatures differ because signedBy is included in the signed payload
    assert.notStrictEqual(signed1.signatureHash, signed2.signatureHash);
  });
});
