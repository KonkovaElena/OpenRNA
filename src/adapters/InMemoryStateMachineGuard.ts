import type { CaseStatus } from "../types";
import type { IStateMachineGuard, TransitionGuardResult } from "../ports/IStateMachineGuard";

/**
 * Explicit allowed-transition map for the 15-state case lifecycle.
 *
 * Design rationale:
 * - INTAKING → AWAITING_CONSENT or READY_FOR_WORKFLOW (depends on consent + sample readiness)
 * - AWAITING_CONSENT → INTAKING (re-intake) or READY_FOR_WORKFLOW (consent granted + data ready)
 * - READY_FOR_WORKFLOW → WORKFLOW_REQUESTED (workflow submitted)
 * - WORKFLOW_REQUESTED → WORKFLOW_RUNNING (executor accepts)
 * - WORKFLOW_RUNNING → WORKFLOW_COMPLETED | WORKFLOW_CANCELLED | WORKFLOW_FAILED
 * - WORKFLOW_COMPLETED → QC_PASSED | QC_FAILED (QC gate evaluation)
 * - WORKFLOW_FAILED → READY_FOR_WORKFLOW (retry) or WORKFLOW_REQUESTED (re-submit)
 * - WORKFLOW_CANCELLED → READY_FOR_WORKFLOW (re-submit)
 * - QC_PASSED → AWAITING_REVIEW (board review)
 * - QC_FAILED → READY_FOR_WORKFLOW (retry from scratch)
 * - AWAITING_REVIEW → AWAITING_FINAL_RELEASE | REVISION_REQUESTED | REVIEW_REJECTED
 * - AWAITING_FINAL_RELEASE → APPROVED_FOR_HANDOFF | REVISION_REQUESTED | REVIEW_REJECTED
 * - REVISION_REQUESTED → READY_FOR_WORKFLOW (restart pipeline)
 * - APPROVED_FOR_HANDOFF → HANDOFF_PENDING (handoff packet generation)
 * - HANDOFF_PENDING is terminal (delivered to the downstream handoff target)
 * - REVIEW_REJECTED is terminal (case rejected by review board)
 */
const ALLOWED_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  INTAKING:              ["AWAITING_CONSENT", "READY_FOR_WORKFLOW"],
  AWAITING_CONSENT:      ["INTAKING", "READY_FOR_WORKFLOW"],
  READY_FOR_WORKFLOW:    ["WORKFLOW_REQUESTED"],
  WORKFLOW_REQUESTED:    ["WORKFLOW_RUNNING", "WORKFLOW_CANCELLED"],
  WORKFLOW_RUNNING:      ["WORKFLOW_COMPLETED", "WORKFLOW_CANCELLED", "WORKFLOW_FAILED"],
  WORKFLOW_COMPLETED:    ["QC_PASSED", "QC_FAILED"],
  WORKFLOW_CANCELLED:    ["READY_FOR_WORKFLOW"],
  WORKFLOW_FAILED:       ["READY_FOR_WORKFLOW", "WORKFLOW_REQUESTED"],
  QC_PASSED:             ["AWAITING_REVIEW"],
  QC_FAILED:             ["READY_FOR_WORKFLOW"],
  AWAITING_REVIEW:       ["AWAITING_FINAL_RELEASE", "REVISION_REQUESTED", "REVIEW_REJECTED"],
  AWAITING_FINAL_RELEASE:["APPROVED_FOR_HANDOFF", "REVISION_REQUESTED", "REVIEW_REJECTED"],
  APPROVED_FOR_HANDOFF:  ["HANDOFF_PENDING"],
  REVISION_REQUESTED:    ["READY_FOR_WORKFLOW"],
  REVIEW_REJECTED:       [],  // terminal state
  HANDOFF_PENDING:       [],  // terminal state
};

export class InMemoryStateMachineGuard implements IStateMachineGuard {
  async validateTransition(
    _caseId: string,
    fromStatus: CaseStatus,
    toStatus: CaseStatus,
  ): Promise<TransitionGuardResult> {
    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed) {
      return { allowed: false, reason: `Unknown source status: ${fromStatus}` };
    }

    if (allowed.includes(toStatus)) {
      return { allowed: true };
    }

    const validTargets = allowed.length > 0 ? allowed.join(", ") : "(none — terminal state)";
    return {
      allowed: false,
      reason: `Transition from ${fromStatus} to ${toStatus} is not allowed. Valid targets: ${validTargets}`,
    };
  }

  getAllowedTransitions(fromStatus: CaseStatus): CaseStatus[] {
    return [...(ALLOWED_TRANSITIONS[fromStatus] ?? [])];
  }
}

export { ALLOWED_TRANSITIONS };
