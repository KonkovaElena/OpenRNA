import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, stableFinalReleaseSignature, timelineEvent } from "./store-helpers";
import type { ReviewStoreMutationContext } from "./store-review";
import type { AuthorizeFinalReleaseInput, CaseRecord, FinalReleaseAuthorizationResult } from "./types";

export async function authorizeFinalReleaseForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: AuthorizeFinalReleaseInput,
  correlationId: AuditContextInput,
): Promise<FinalReleaseAuthorizationResult> {
  const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === input.reviewId);
  if (!reviewOutcome) {
    throw new ApiError(
      404,
      "review_outcome_not_found",
      "Review outcome was not found for this case.",
      "Use a valid reviewId from the review outcome list endpoint.",
    );
  }

  if (reviewOutcome.reviewDisposition !== "approved") {
    throw new ApiError(
      409,
      "review_outcome_not_approved",
      "Only approved review outcomes can receive final release authorization.",
      "Record an approved review outcome before authorizing final release.",
    );
  }

  if (reviewOutcome.reviewerId === input.releaserId) {
    throw new ApiError(
      403,
      "dual_authorization_required",
      "Final releaser must differ from the reviewer who approved the board packet.",
      "Provide a releaserId independent from the approving reviewer.",
    );
  }

  if (reviewOutcome.finalRelease) {
    const existingSignature = stableFinalReleaseSignature({
      reviewId: reviewOutcome.reviewId,
      releaserId: reviewOutcome.finalRelease.releaserId,
      releaserRole: reviewOutcome.finalRelease.releaserRole,
      rationale: reviewOutcome.finalRelease.rationale,
      comments: reviewOutcome.finalRelease.comments,
      signatureManifestation: reviewOutcome.finalRelease.signatureManifestation,
    });

    if (existingSignature === stableFinalReleaseSignature(input)) {
      return {
        case: structuredClone(record),
        reviewOutcome: structuredClone(reviewOutcome),
        created: false,
      };
    }

    throw new ApiError(
      409,
      "final_release_already_authorized",
      "A final release authorization is already recorded for this review outcome.",
      "Reuse the stored release authorization or restart board review with a new packet revision.",
    );
  }

  const releasedAt = context.clock.nowIso();
  reviewOutcome.finalRelease = {
    releaserId: input.releaserId,
    releaserRole: input.releaserRole,
    rationale: input.rationale,
    comments: input.comments,
    signatureManifestation: input.signatureManifestation,
    releasedAt,
  };

  await context.applyTransition(record, "APPROVED_FOR_HANDOFF", correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "final_release_authorized",
      `Authorized final release for review outcome ${reviewOutcome.reviewId} by ${input.releaserId}.`,
      releasedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "final.release.authorized",
      `Authorized final release for review outcome ${reviewOutcome.reviewId} by ${input.releaserId}.`,
      correlationId,
      releasedAt,
    ),
  );
  record.updatedAt = releasedAt;

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "final.release.authorized",
      {
        reviewOutcome: structuredClone(reviewOutcome),
        nextStatus: record.status,
      },
      correlationId,
      releasedAt,
      releasedAt,
    ),
  );

  return {
    case: await context.rebuildCaseProjection(caseId),
    reviewOutcome: structuredClone(reviewOutcome),
    created: true,
  };
}
