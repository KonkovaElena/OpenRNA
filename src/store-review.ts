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
  QcGateRecord,
  RecordReviewOutcomeInput,
  ReferenceBundleManifest,
  RetrievalProvenance,
  ReviewOutcomeRecord,
  ReviewOutcomeResult,
  WorkflowRunRecord,
} from "./types";

type ReviewTransitionStatus = "AWAITING_REVIEW" | "APPROVED_FOR_HANDOFF" | "REVIEW_REJECTED" | "REVISION_REQUESTED" | "HANDOFF_PENDING";
type ReviewEventType = "board.packet.generated" | "review.outcome.recorded" | "handoff.packet.generated";

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
  const reviewTargetStatus = input.reviewDisposition === "approved"
    ? "APPROVED_FOR_HANDOFF"
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