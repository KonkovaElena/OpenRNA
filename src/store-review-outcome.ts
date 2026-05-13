import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, stableReviewOutcomeSignature, timelineEvent } from "./store-helpers";
import type { ReviewStoreMutationContext } from "./store-review";
import type { CaseRecord, RecordReviewOutcomeInput, ReviewOutcomeRecord, ReviewOutcomeResult } from "./types";

export async function recordReviewOutcomeForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: RecordReviewOutcomeInput,
  correlationId: AuditContextInput,
): Promise<ReviewOutcomeResult> {
  const packet = record.boardPackets.find((candidate) => candidate.packetId === input.packetId);
  if (!packet) {
    throw new ApiError(
      404,
      "board_packet_not_found",
      "Board packet was not found for this case.",
      "Use a valid packetId from the board packet list endpoint.",
    );
  }

  const existingOutcome = record.reviewOutcomes.find((candidate) => candidate.packetId === input.packetId);
  if (existingOutcome) {
    if (stableReviewOutcomeSignature(existingOutcome) === stableReviewOutcomeSignature(input)) {
      return {
        case: structuredClone(record),
        reviewOutcome: structuredClone(existingOutcome),
        created: false,
      };
    }

    throw new ApiError(
      409,
      "review_outcome_already_recorded",
      "A review outcome is already recorded for this board packet.",
      "Reuse the stored review outcome or generate a new board packet revision before recording a different decision.",
    );
  }

  const reviewedAt = context.clock.nowIso();
  const reviewOutcome: ReviewOutcomeRecord = {
    reviewId: `review_${randomUUID()}`,
    caseId,
    packetId: packet.packetId,
    reviewerId: input.reviewerId,
    reviewerRole: input.reviewerRole,
    reviewDisposition: input.reviewDisposition,
    rationale: input.rationale,
    comments: input.comments,
    signatureManifestation: input.signatureManifestation,
    reviewedAt,
  };

  record.reviewOutcomes.push(reviewOutcome);
  const reviewTargetStatus =
    input.reviewDisposition === "approved"
      ? "AWAITING_FINAL_RELEASE"
      : input.reviewDisposition === "rejected"
        ? "REVIEW_REJECTED"
        : "REVISION_REQUESTED";
  await context.applyTransition(record, reviewTargetStatus, correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "review_outcome_recorded",
      `Recorded ${input.reviewDisposition} review outcome ${reviewOutcome.reviewId} for packet ${packet.packetId}.`,
      reviewedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "review.outcome.recorded",
      `Recorded ${input.reviewDisposition} review outcome ${reviewOutcome.reviewId} for packet ${packet.packetId}.`,
      correlationId,
      reviewedAt,
    ),
  );
  record.updatedAt = reviewedAt;

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "review.outcome.recorded",
      {
        reviewOutcome: structuredClone(reviewOutcome),
        nextStatus: record.status,
      },
      correlationId,
      reviewedAt,
      reviewedAt,
    ),
  );

  return {
    case: await context.rebuildCaseProjection(caseId),
    reviewOutcome: structuredClone(reviewOutcome),
    created: true,
  };
}
