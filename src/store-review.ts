import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import {
  auditEvent,
  buildEvidenceLineage,
  computePacketHash,
  stableReviewOutcomeSignature,
  timelineEvent,
} from "./store-helpers";
import type {
  BoardPacketGenerationResult,
  BoardPacketRecord,
  BoardPacketSnapshot,
  CaseDomainEventInput,
  CaseRecord,
  GenerateHandoffPacketInput,
  HandoffPacketGenerationResult,
  HandoffPacketRecord,
  HandoffPacketSnapshot,
  HlaConsensusRecord,
  QaReleaseRecord,
  QaReleaseResult,
  QcGateRecord,
  RecordQaReleaseInput,
  RecordReviewOutcomeInput,
  ReferenceBundleManifest,
  RetrievalProvenance,
  ReviewOutcomeRecord,
  ReviewOutcomeResult,
  WorkflowRunRecord,
} from "./types";

type ReviewTransitionStatus =
  | "AWAITING_REVIEW"
  | "AWAITING_FINAL_RELEASE"
  | "APPROVED_FOR_HANDOFF"
  | "REVIEW_REJECTED"
  | "REVISION_REQUESTED"
  | "HANDOFF_PENDING";
type ReviewEventType = "board.packet.generated" | "review.outcome.recorded" | "qa.release.recorded" | "handoff.packet.generated";

export interface ReviewStoreMutationContext {
  clock: { nowIso(): string };
  applyTransition: (record: CaseRecord, nextStatus: ReviewTransitionStatus, correlationId?: AuditContextInput) => Promise<void>;
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

function getPinnedReferenceBundles(completedRuns: WorkflowRunRecord[]): ReferenceBundleManifest[] {
  return [
    ...new Map(
      completedRuns
        .map((run) => run.pinnedReferenceBundle)
        .filter((bundle): bundle is ReferenceBundleManifest => Boolean(bundle))
        .map((bundle) => [bundle.bundleId, structuredClone(bundle)]),
    ).values(),
  ];
}

function getBundleRetrievalProvenance(
  pinnedReferenceBundles: ReferenceBundleManifest[],
): RetrievalProvenance[] | undefined {
  const provenances = pinnedReferenceBundles
    .map((bundle) => bundle.retrievalProvenance)
    .filter((provenance): provenance is RetrievalProvenance => Boolean(provenance));

  return provenances.length > 0 ? provenances : undefined;
}

function stableQaReleaseSignature(value: RecordQaReleaseInput): string {
  return JSON.stringify({
    reviewId: value.reviewId,
    qaReviewerId: value.qaReviewerId,
    qaReviewerRole: value.qaReviewerRole ?? null,
    rationale: value.rationale,
    comments: value.comments ?? null,
    signature: {
      printedName: value.signature.printedName,
      meaning: value.signature.meaning,
      stepUpMethod: value.signature.stepUpAuth.method,
    },
  });
}

function buildBoardPacketSnapshot(
  record: CaseRecord,
  boardRoute: string,
  completedRuns: WorkflowRunRecord[],
  hlaConsensus: HlaConsensusRecord,
  latestQcGate: QcGateRecord,
): BoardPacketSnapshot {
  const pinnedReferenceBundles = getPinnedReferenceBundles(completedRuns);

  return {
    caseSummary: {
      caseId: record.caseId,
      status: "QC_PASSED",
      indication: record.caseProfile.indication,
      siteId: record.caseProfile.siteId,
      protocolVersion: record.caseProfile.protocolVersion,
      boardRoute,
    },
    workflowRuns: structuredClone(completedRuns),
    pinnedReferenceBundles,
    derivedArtifacts: structuredClone(record.derivedArtifacts),
    hlaConsensus: structuredClone(hlaConsensus),
    latestQcGate: structuredClone(latestQcGate),
    hlaToolBreakdown: hlaConsensus.perToolEvidence.length > 0
      ? structuredClone(hlaConsensus.perToolEvidence)
      : undefined,
    hlaDisagreements: hlaConsensus.disagreements,
    bundleRetrievalProvenance: getBundleRetrievalProvenance(pinnedReferenceBundles),
    evidenceLineage: (() => {
      const lineage = buildEvidenceLineage(completedRuns, record.derivedArtifacts);
      return lineage.edges.length > 0 ? lineage : undefined;
    })(),
    neoantigenRanking: record.neoantigenRanking ? structuredClone(record.neoantigenRanking) : undefined,
    constructDesign: record.constructDesign ? structuredClone(record.constructDesign) : undefined,
  };
}

export async function generateBoardPacketForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  correlationId: AuditContextInput,
): Promise<BoardPacketGenerationResult> {
  const boardRoute = record.caseProfile.boardRoute;

  if (!boardRoute) {
    throw new ApiError(
      409,
      "review_route_not_configured",
      "Case is missing a configured multidisciplinary review route.",
      "Set caseProfile.boardRoute before generating a board packet.",
    );
  }

  const latestQcGate = record.qcGates[record.qcGates.length - 1];
  const completedRuns = record.workflowRuns.filter((run) => run.status === "COMPLETED");

  if (!record.hlaConsensus || !latestQcGate || latestQcGate.outcome === "FAILED" || completedRuns.length === 0 || record.derivedArtifacts.length === 0) {
    throw new ApiError(
      409,
      "board_packet_not_ready",
      "Case does not yet have the evidence required for board packet generation.",
      "Complete workflow execution, HLA consensus, and a passing QC gate before generating a board packet.",
    );
  }

  const snapshot = buildBoardPacketSnapshot(record, boardRoute, completedRuns, record.hlaConsensus, latestQcGate);
  const packetHash = computePacketHash(snapshot);
  const existingPacket = record.boardPackets.find((packet) => packet.packetHash === packetHash);
  if (existingPacket) {
    return {
      case: structuredClone(record),
      packet: structuredClone(existingPacket),
      created: false,
    };
  }

  const createdAt = context.clock.nowIso();
  const packet: BoardPacketRecord = {
    packetId: `packet_${randomUUID()}`,
    caseId,
    artifactClass: "BOARD_PACKET",
    boardRoute,
    version: record.boardPackets.length + 1,
    schemaVersion: 1,
    packetHash,
    createdAt,
    snapshot,
  };

  record.boardPackets.push(packet);
  await context.applyTransition(record, "AWAITING_REVIEW", correlationId);
  record.timeline.push(timelineEvent(context.clock, "board_packet_generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`));
  record.auditEvents.push(
    auditEvent(context.clock, "board.packet.generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`, correlationId),
  );
  record.updatedAt = createdAt;

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "board.packet.generated",
      {
        packet: structuredClone(packet),
        nextStatus: record.status,
      },
      correlationId,
      createdAt,
      createdAt,
    ),
  );

  return {
    case: await context.rebuildCaseProjection(caseId),
    packet: structuredClone(packet),
    created: true,
  };
}

export async function recordReviewOutcomeForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: RecordReviewOutcomeInput,
  correlationId: AuditContextInput,
): Promise<ReviewOutcomeResult> {
  const packet = record.boardPackets.find((candidate) => candidate.packetId === input.packetId);
  if (!packet) {
    throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
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
  const reviewSignatureHash = input.signatureManifest?.signatureHash ?? (input.signature
    ? computePacketHash({
        packetId: input.packetId,
        reviewerId: input.reviewerId,
        printedName: input.signature.printedName,
        meaning: input.signature.meaning,
        reviewedAt,
      })
    : undefined);
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
    signature: input.signatureManifest
      ? {
          ...input.signatureManifest,
          signedAt: input.signatureManifest.signedAt || reviewedAt,
          signedBy: input.signatureManifest.signedBy || input.reviewerId,
        }
      : input.signature
        ? {
            printedName: input.signature.printedName,
            meaning: input.signature.meaning,
            signedBy: input.reviewerId,
            signedAt: reviewedAt,
            signatureMethod: "step-up-auth",
            signatureHash: reviewSignatureHash ?? computePacketHash({ packetId: input.packetId, reviewerId: input.reviewerId, reviewedAt }),
            stepUpMethod: input.signature.stepUpAuth.method,
          }
        : undefined,
  };

  record.reviewOutcomes.push(reviewOutcome);
  const reviewTargetStatus = input.reviewDisposition === "approved"
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
      reviewOutcome.signature
        ? {
            printedName: reviewOutcome.signature.printedName,
            signatureMeaning: reviewOutcome.signature.meaning,
            signedBy: reviewOutcome.signature.signedBy,
            signedAt: reviewOutcome.signature.signedAt,
            signatureMethod: reviewOutcome.signature.signatureMethod,
            signatureHash: reviewOutcome.signature.signatureHash,
            stepUpMethod: reviewOutcome.signature.stepUpMethod,
          }
        : undefined,
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

export async function recordQaReleaseForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: RecordQaReleaseInput,
  correlationId: AuditContextInput,
): Promise<QaReleaseResult> {
  const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === input.reviewId);
  if (!reviewOutcome) {
    throw new ApiError(404, "review_outcome_not_found", "Review outcome was not found for this case.", "Use a valid reviewId from the review outcome list endpoint.");
  }

  if (reviewOutcome.reviewDisposition !== "approved") {
    throw new ApiError(
      409,
      "review_outcome_not_approved",
      "Quality release is available only for approved board reviews.",
      "Record an approved review outcome before posting a QA release.",
    );
  }

  if (reviewOutcome.reviewerId === input.qaReviewerId) {
    throw new ApiError(
      409,
      "maker_checker_violation",
      "Maker and checker must be different principals for release authorization.",
      "Use an independent QA reviewer identity for final release.",
    );
  }

  const existingRelease = record.qaReleases.find((candidate) => candidate.reviewId === input.reviewId);
  if (existingRelease) {
    if (stableQaReleaseSignature(input) === JSON.stringify({
      reviewId: existingRelease.reviewId,
      qaReviewerId: existingRelease.qaReviewerId,
      qaReviewerRole: existingRelease.qaReviewerRole ?? null,
      rationale: existingRelease.rationale,
      comments: existingRelease.comments ?? null,
      signature: {
        printedName: existingRelease.signature.printedName,
        meaning: existingRelease.signature.meaning,
        stepUpMethod: existingRelease.signature.stepUpMethod,
      },
    })) {
      return {
        case: structuredClone(record),
        qaRelease: structuredClone(existingRelease),
        created: false,
      };
    }

    throw new ApiError(
      409,
      "qa_release_already_recorded",
      "A QA release is already recorded for this review outcome.",
      "Reuse the stored QA release or create a new review revision.",
    );
  }

  const releasedAt = context.clock.nowIso();
  const qaReleaseSignatureHash = input.signatureManifest?.signatureHash ?? computePacketHash({
    reviewId: input.reviewId,
    qaReviewerId: input.qaReviewerId,
    printedName: input.signature.printedName,
    meaning: input.signature.meaning,
    releasedAt,
  });

  const qaRelease: QaReleaseRecord = {
    qaReleaseId: `qa_release_${randomUUID()}`,
    caseId,
    reviewId: input.reviewId,
    qaReviewerId: input.qaReviewerId,
    qaReviewerRole: input.qaReviewerRole,
    rationale: input.rationale,
    comments: input.comments,
    releasedAt,
    signature: input.signatureManifest
      ? {
          ...input.signatureManifest,
          signedAt: input.signatureManifest.signedAt || releasedAt,
          signedBy: input.signatureManifest.signedBy || input.qaReviewerId,
        }
      : {
          printedName: input.signature.printedName,
          meaning: input.signature.meaning,
          signedBy: input.qaReviewerId,
          signedAt: releasedAt,
          signatureMethod: "step-up-auth",
          signatureHash: qaReleaseSignatureHash,
          stepUpMethod: input.signature.stepUpAuth.method,
        },
  };

  record.qaReleases.push(qaRelease);
  await context.applyTransition(record, "APPROVED_FOR_HANDOFF", correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "qa_release_recorded",
      `Recorded QA release ${qaRelease.qaReleaseId} for review ${qaRelease.reviewId}.`,
      releasedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "qa.release.recorded",
      `Recorded QA release ${qaRelease.qaReleaseId} for review ${qaRelease.reviewId}.`,
      correlationId,
      releasedAt,
      {
        printedName: qaRelease.signature.printedName,
        signatureMeaning: qaRelease.signature.meaning,
        signedBy: qaRelease.signature.signedBy,
        signedAt: qaRelease.signature.signedAt,
        signatureMethod: qaRelease.signature.signatureMethod,
        signatureHash: qaRelease.signature.signatureHash,
        stepUpMethod: qaRelease.signature.stepUpMethod,
      },
    ),
  );
  record.updatedAt = releasedAt;

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "qa.release.recorded",
      {
        qaRelease: structuredClone(qaRelease),
        nextStatus: record.status,
      },
      correlationId,
      releasedAt,
      releasedAt,
    ),
  );

  return {
    case: await context.rebuildCaseProjection(caseId),
    qaRelease: structuredClone(qaRelease),
    created: true,
  };
}

export async function generateHandoffPacketForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: GenerateHandoffPacketInput,
  correlationId: AuditContextInput,
): Promise<HandoffPacketGenerationResult> {
  const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === input.reviewId);
  if (!reviewOutcome) {
    throw new ApiError(404, "review_outcome_not_found", "Review outcome was not found for this case.", "Use a valid reviewId from the review outcome list endpoint.");
  }

  if (reviewOutcome.reviewDisposition !== "approved") {
    throw new ApiError(
      409,
      "review_outcome_not_approved",
      "Only approved review outcomes can emit a manufacturing handoff packet.",
      "Record an approved review outcome before generating a handoff packet.",
    );
  }

  if (input.requestedBy === reviewOutcome.reviewerId) {
    throw new ApiError(
      403,
      "dual_authorization_required",
      "Handoff requestor must differ from the reviewer who approved the board packet.",
      "Provide a requestedBy principal independent from the approving reviewer.",
    );
  }

  const qaRelease = record.qaReleases.find((candidate) => candidate.qaReleaseId === input.qaReleaseId);
  if (!qaRelease) {
    throw new ApiError(
      404,
      "qa_release_not_found",
      "QA release was not found for this case.",
      "Use a valid qaReleaseId from the QA release list endpoint.",
    );
  }

  if (qaRelease.reviewId !== reviewOutcome.reviewId) {
    throw new ApiError(
      409,
      "qa_release_review_mismatch",
      "QA release does not belong to the requested review outcome.",
      "Use qaReleaseId linked to the same reviewId.",
    );
  }

  if (qaRelease.qaReviewerId === reviewOutcome.reviewerId) {
    throw new ApiError(
      409,
      "maker_checker_violation",
      "Maker and checker must be different principals for release authorization.",
      "Use an independent QA reviewer identity for final release.",
    );
  }

  const boardPacket = record.boardPackets.find((candidate) => candidate.packetId === reviewOutcome.packetId);
  if (!boardPacket) {
    throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
  }

  if (!record.constructDesign) {
    throw new ApiError(
      409,
      "construct_design_required",
      "Manufacturing handoff requires a stored construct design.",
      "Generate and persist a construct design before creating a handoff packet.",
    );
  }

  const snapshot: HandoffPacketSnapshot = {
    caseSummary: {
      caseId: record.caseId,
      status: record.status,
      indication: record.caseProfile.indication,
      siteId: record.caseProfile.siteId,
      protocolVersion: record.caseProfile.protocolVersion,
      boardRoute: boardPacket.boardRoute,
    },
    boardPacket: {
      packetId: boardPacket.packetId,
      boardRoute: boardPacket.boardRoute,
      version: boardPacket.version,
      packetHash: boardPacket.packetHash,
      createdAt: boardPacket.createdAt,
    },
    reviewOutcome: structuredClone(reviewOutcome),
    qaRelease: structuredClone(qaRelease),
    constructDesign: structuredClone(record.constructDesign),
    handoffTarget: input.handoffTarget,
    requestedBy: input.requestedBy,
    turnaroundDays: input.turnaroundDays,
    notes: input.notes,
  };

  const packetHash = computePacketHash(snapshot);
  const existingPacket = record.handoffPackets.find((candidate) => candidate.packetHash === packetHash);
  if (existingPacket) {
    return {
      case: structuredClone(record),
      handoff: structuredClone(existingPacket),
      created: false,
    };
  }

  const createdAt = context.clock.nowIso();
  const handoff: HandoffPacketRecord = {
    handoffId: `handoff_${randomUUID()}`,
    caseId,
    reviewId: reviewOutcome.reviewId,
    qaReleaseId: qaRelease.qaReleaseId,
    packetId: boardPacket.packetId,
    artifactClass: "HANDOFF_PACKET",
    constructId: record.constructDesign.constructId,
    constructVersion: record.constructDesign.version,
    handoffTarget: input.handoffTarget,
    schemaVersion: 1,
    packetHash,
    createdAt,
    snapshot,
  };

  record.handoffPackets.push(handoff);
  await context.applyTransition(record, "HANDOFF_PENDING", correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "handoff_packet_generated",
      `Generated manufacturing handoff packet ${handoff.handoffId} for ${input.handoffTarget}.`,
      createdAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "handoff.packet.generated",
      `Generated manufacturing handoff packet ${handoff.handoffId} for ${input.handoffTarget}.`,
      correlationId,
      createdAt,
      {
        printedName: qaRelease.signature.printedName,
        signatureMeaning: qaRelease.signature.meaning,
        signedBy: qaRelease.signature.signedBy,
        signedAt: qaRelease.signature.signedAt,
        signatureMethod: qaRelease.signature.signatureMethod,
        signatureHash: qaRelease.signature.signatureHash,
        stepUpMethod: qaRelease.signature.stepUpMethod,
      },
    ),
  );
  record.updatedAt = createdAt;

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "handoff.packet.generated",
      {
        handoffPacket: structuredClone(handoff),
        nextStatus: record.status,
      },
      correlationId,
      createdAt,
      createdAt,
    ),
  );

  return {
    case: await context.rebuildCaseProjection(caseId),
    handoff: structuredClone(handoff),
    created: true,
  };
}