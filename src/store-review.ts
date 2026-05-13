import type { AuditContextInput } from "./store-helpers";
import type { CaseDomainEventInput, CaseRecord } from "./types";

type ReviewTransitionStatus =
  | "AWAITING_REVIEW"
  | "HLA_REVIEW_REQUIRED"
  | "AWAITING_FINAL_RELEASE"
  | "APPROVED_FOR_HANDOFF"
  | "REVIEW_REJECTED"
  | "REVISION_REQUESTED"
  | "HANDOFF_PENDING";
type ReviewEventType =
  | "board.packet.generated"
  | "review.outcome.recorded"
  | "final.release.authorized"
  | "handoff.packet.generated";

export interface ReviewStoreMutationContext {
  clock: { nowIso(): string };
  applyTransition: (
    record: CaseRecord,
    nextStatus: ReviewTransitionStatus,
    correlationId?: AuditContextInput,
  ) => Promise<void>;
  createCaseEvent: (
    caseId: string,
    type: ReviewEventType,
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt?: string,
    updatedAt?: string,
  ) => CaseDomainEventInput;
  appendCaseEvent: (event: CaseDomainEventInput) => Promise<unknown>;
  rebuildCaseProjection: (caseId: string) => Promise<CaseRecord>;
}

export { generateBoardPacketForCase } from "./store-board-packet";
export { authorizeFinalReleaseForCase } from "./store-final-release";
export { generateHandoffPacketForCase } from "./store-handoff-packet";
export { recordReviewOutcomeForCase } from "./store-review-outcome";
