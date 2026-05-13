import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, computePacketHash, timelineEvent } from "./store-helpers";
import type { ReviewStoreMutationContext } from "./store-review";
import type {
  CaseRecord,
  GenerateHandoffPacketInput,
  HandoffPacketGenerationResult,
  HandoffPacketRecord,
  HandoffPacketSnapshot,
} from "./types";

export async function generateHandoffPacketForCase(
  context: ReviewStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  input: GenerateHandoffPacketInput,
  correlationId: AuditContextInput,
): Promise<HandoffPacketGenerationResult> {
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
      "Only approved review outcomes can emit a manufacturing handoff packet.",
      "Record an approved review outcome before generating a handoff packet.",
    );
  }

  if (!reviewOutcome.finalRelease) {
    throw new ApiError(
      409,
      "final_release_required",
      "Manufacturing handoff requires a recorded final release authorization.",
      "Authorize final release before generating a handoff packet.",
    );
  }

  if (input.requestedBy !== reviewOutcome.finalRelease.releaserId) {
    throw new ApiError(
      403,
      "final_release_requestor_mismatch",
      "Handoff requestor must match the principal who authorized final release.",
      "Use the releaserId captured during final release authorization as requestedBy.",
    );
  }

  const boardPacket = record.boardPackets.find((candidate) => candidate.packetId === reviewOutcome.packetId);
  if (!boardPacket) {
    throw new ApiError(
      404,
      "board_packet_not_found",
      "Board packet was not found for this case.",
      "Use a valid packetId from the board packet list endpoint.",
    );
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
