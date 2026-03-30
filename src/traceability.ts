import type { CaseRecord, FullTraceabilityRecord, HandoffPacketRecord, OutcomeTimelineEntry, ReviewOutcomeRecord } from "./types.js";

function requireTraceabilityInputs(caseRecord: CaseRecord): {
  rankedCandidateIds: string[];
  constructId: string;
  constructVersion: number;
  constructCandidateIds: string[];
} {
  if (!caseRecord.neoantigenRanking) {
    throw new Error("Neoantigen ranking is required to build full traceability.");
  }

  if (!caseRecord.constructDesign) {
    throw new Error("Construct design is required to build full traceability.");
  }

  const rankedCandidateIds = caseRecord.neoantigenRanking.rankedCandidates.map((candidate) => candidate.candidateId);
  for (const candidateId of caseRecord.constructDesign.candidateIds) {
    if (!rankedCandidateIds.includes(candidateId)) {
      throw new Error("Construct design contains a candidate that is absent from the stored ranking.");
    }
  }

  return {
    rankedCandidateIds,
    constructId: caseRecord.constructDesign.constructId,
    constructVersion: caseRecord.constructDesign.version,
    constructCandidateIds: structuredClone(caseRecord.constructDesign.candidateIds),
  };
}

function assertEntryMatchesConstruct(
  caseRecord: CaseRecord,
  entry: OutcomeTimelineEntry,
  constructId: string,
  constructVersion: number,
): void {
  if (entry.caseId !== caseRecord.caseId) {
    throw new Error("Outcome entry caseId does not match the target case.");
  }

  if (entry.constructId !== constructId || entry.constructVersion !== constructVersion) {
    throw new Error("Outcome entry is not traceable to the stored construct design.");
  }
}

function assertReviewOutcomeMatchesCase(caseRecord: CaseRecord, reviewOutcome: ReviewOutcomeRecord): void {
  if (reviewOutcome.caseId !== caseRecord.caseId) {
    throw new Error("Review outcome caseId does not match the target case.");
  }
}

function assertHandoffPacketMatchesConstruct(
  caseRecord: CaseRecord,
  handoffPacket: HandoffPacketRecord,
  constructId: string,
  constructVersion: number,
): void {
  if (handoffPacket.caseId !== caseRecord.caseId) {
    throw new Error("Handoff packet caseId does not match the target case.");
  }

  if (handoffPacket.constructId !== constructId || handoffPacket.constructVersion !== constructVersion) {
    throw new Error("Handoff packet is not traceable to the stored construct design.");
  }
}

export function buildFullTraceability(
  caseRecord: CaseRecord,
  outcomeTimeline: OutcomeTimelineEntry[],
): FullTraceabilityRecord {
  const {
    rankedCandidateIds,
    constructId,
    constructVersion,
    constructCandidateIds,
  } = requireTraceabilityInputs(caseRecord);

  const timeline = structuredClone(outcomeTimeline).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  for (const entry of timeline) {
    assertEntryMatchesConstruct(caseRecord, entry, constructId, constructVersion);
  }

  const reviewOutcomes = structuredClone(caseRecord.reviewOutcomes);
  for (const reviewOutcome of reviewOutcomes) {
    assertReviewOutcomeMatchesCase(caseRecord, reviewOutcome);
  }

  const handoffPackets = structuredClone(caseRecord.handoffPackets);
  for (const handoffPacket of handoffPackets) {
    assertHandoffPacketMatchesConstruct(caseRecord, handoffPacket, constructId, constructVersion);
  }

  return {
    caseId: caseRecord.caseId,
    rankedCandidateIds,
    constructId,
    constructVersion,
    constructCandidateIds,
    timeline,
    administrations: timeline
      .filter((entry): entry is Extract<OutcomeTimelineEntry, { entryType: "administration" }> => entry.entryType === "administration")
      .map((entry) => structuredClone(entry.administration)),
    immuneMonitoringRecords: timeline
      .filter((entry): entry is Extract<OutcomeTimelineEntry, { entryType: "immune-monitoring" }> => entry.entryType === "immune-monitoring")
      .map((entry) => structuredClone(entry.immuneMonitoring)),
    clinicalFollowUpRecords: timeline
      .filter((entry): entry is Extract<OutcomeTimelineEntry, { entryType: "clinical-follow-up" }> => entry.entryType === "clinical-follow-up")
      .map((entry) => structuredClone(entry.clinicalFollowUp)),
    reviewOutcomes,
    handoffPackets,
  };
}