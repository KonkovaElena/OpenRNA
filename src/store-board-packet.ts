import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, buildEvidenceLineage, computePacketHash, timelineEvent } from "./store-helpers";
import type { ReviewStoreMutationContext } from "./store-review";
import type {
  BoardPacketGenerationResult,
  BoardPacketRecord,
  BoardPacketSnapshot,
  CaseRecord,
  HlaConsensusRecord,
  QcGateRecord,
  ReferenceBundleManifest,
  RetrievalProvenance,
  WorkflowRunRecord,
} from "./types";

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
    hlaToolBreakdown:
      hlaConsensus.perToolEvidence.length > 0 ? structuredClone(hlaConsensus.perToolEvidence) : undefined,
    hlaDisagreements: hlaConsensus.disagreements,
    bundleRetrievalProvenance: getBundleRetrievalProvenance(pinnedReferenceBundles),
    evidenceLineage: (() => {
      const lineage = buildEvidenceLineage(completedRuns, record.derivedArtifacts);
      return lineage.edges.length > 0 ? lineage : undefined;
    })(),
    neoantigenRanking: record.neoantigenRanking ? structuredClone(record.neoantigenRanking) : undefined,
    constructDesign: record.constructDesign ? structuredClone(record.constructDesign) : undefined,
    hlaManualReviewRequired: hlaConsensus.manualReviewRequired || undefined,
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

  if (
    !record.hlaConsensus ||
    !latestQcGate ||
    latestQcGate.outcome === "FAILED" ||
    completedRuns.length === 0 ||
    record.derivedArtifacts.length === 0
  ) {
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
  const nextReviewStatus = record.hlaConsensus?.manualReviewRequired ? "HLA_REVIEW_REQUIRED" : "AWAITING_REVIEW";
  await context.applyTransition(record, nextReviewStatus, correlationId);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "board_packet_generated",
      `Board packet ${packet.packetId} generated for ${boardRoute}.`,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "board.packet.generated",
      `Board packet ${packet.packetId} generated for ${boardRoute}.`,
      correlationId,
    ),
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
