import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStateMachineGuard } from "../src/adapters/InMemoryStateMachineGuard";

const guard = new InMemoryStateMachineGuard();

test("State Machine Guard", async (t) => {
  await t.test("allows valid INTAKING → AWAITING_CONSENT transition", async () => {
    const result = await guard.validateTransition("case-1", "INTAKING", "AWAITING_CONSENT");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows valid INTAKING → READY_FOR_WORKFLOW transition", async () => {
    const result = await guard.validateTransition("case-1", "INTAKING", "READY_FOR_WORKFLOW");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("rejects invalid INTAKING → WORKFLOW_COMPLETED transition", async () => {
    const result = await guard.validateTransition("case-1", "INTAKING", "WORKFLOW_COMPLETED");
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason);
    assert.ok(result.reason.includes("INTAKING"));
  });

  await t.test("allows WORKFLOW_RUNNING → COMPLETED transition", async () => {
    const result = await guard.validateTransition("case-1", "WORKFLOW_RUNNING", "WORKFLOW_COMPLETED");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows WORKFLOW_RUNNING → FAILED transition", async () => {
    const result = await guard.validateTransition("case-1", "WORKFLOW_RUNNING", "WORKFLOW_FAILED");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows WORKFLOW_RUNNING → CANCELLED transition", async () => {
    const result = await guard.validateTransition("case-1", "WORKFLOW_RUNNING", "WORKFLOW_CANCELLED");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows AWAITING_REVIEW → AWAITING_FINAL_RELEASE transition", async () => {
    const result = await guard.validateTransition("case-1", "AWAITING_REVIEW", "AWAITING_FINAL_RELEASE");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows AWAITING_FINAL_RELEASE → APPROVED_FOR_HANDOFF transition", async () => {
    const result = await guard.validateTransition("case-1", "AWAITING_FINAL_RELEASE", "APPROVED_FOR_HANDOFF");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("allows AWAITING_REVIEW → REVIEW_REJECTED transition", async () => {
    const result = await guard.validateTransition("case-1", "AWAITING_REVIEW", "REVIEW_REJECTED");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("rejects same-state identity transition", async () => {
    const result = await guard.validateTransition("case-1", "INTAKING", "INTAKING");
    assert.strictEqual(result.allowed, false);
  });

  await t.test("rejects transition from terminal state REVIEW_REJECTED", async () => {
    const result = await guard.validateTransition("case-1", "REVIEW_REJECTED", "INTAKING");
    assert.strictEqual(result.allowed, false);
  });

  await t.test("rejects transition from terminal state HANDOFF_PENDING", async () => {
    const result = await guard.validateTransition("case-1", "HANDOFF_PENDING", "INTAKING");
    assert.strictEqual(result.allowed, false);
  });

  await t.test("getAllowedTransitions returns correct list for INTAKING", () => {
    const allowed = guard.getAllowedTransitions("INTAKING");
    assert.ok(allowed.includes("AWAITING_CONSENT"));
    assert.ok(allowed.includes("READY_FOR_WORKFLOW"));
    assert.ok(!allowed.includes("WORKFLOW_COMPLETED"));
  });

  await t.test("getAllowedTransitions returns empty for HANDOFF_PENDING", () => {
    const allowed = guard.getAllowedTransitions("HANDOFF_PENDING");
    assert.strictEqual(allowed.length, 0);
  });

  await t.test("full lifecycle: INTAKING → READY_FOR_WORKFLOW → WORKFLOW_REQUESTED → WORKFLOW_RUNNING → COMPLETED → QC → BOARD → REVIEW → HANDOFF", async () => {
    const lifecycle = [
      ["INTAKING", "READY_FOR_WORKFLOW"],
      ["READY_FOR_WORKFLOW", "WORKFLOW_REQUESTED"],
      ["WORKFLOW_REQUESTED", "WORKFLOW_RUNNING"],
      ["WORKFLOW_RUNNING", "WORKFLOW_COMPLETED"],
      ["WORKFLOW_COMPLETED", "QC_PASSED"],
      ["QC_PASSED", "AWAITING_REVIEW"],
      ["AWAITING_REVIEW", "AWAITING_FINAL_RELEASE"],
      ["AWAITING_FINAL_RELEASE", "APPROVED_FOR_HANDOFF"],
      ["APPROVED_FOR_HANDOFF", "HANDOFF_PENDING"],
    ] as const;

    for (const [from, to] of lifecycle) {
      const result = await guard.validateTransition("case-lifecycle", from, to);
      assert.strictEqual(result.allowed, true, `Expected ${from} → ${to} to be allowed`);
    }
  });
});
