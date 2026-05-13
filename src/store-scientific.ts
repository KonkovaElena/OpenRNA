import type { AuditContextInput } from "./store-helpers";
import { auditEvent, timelineEvent } from "./store-helpers";
import type {
  CaseDomainEventInput,
  CaseDomainEventType,
  CaseRecord,
  ConstructDesignPackage,
  RankingResult,
} from "./types";

type ClockLike = { nowIso(): string };

export interface ScientificStoreMutationContext {
  clock: ClockLike;
  createCaseEvent: (
    caseId: string,
    type: CaseDomainEventType,
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt?: string,
    updatedAt?: string,
  ) => CaseDomainEventInput;
  appendCaseEvent: (event: CaseDomainEventInput) => Promise<CaseDomainEventInput>;
}

export async function recordNeoantigenRankingForCase(
  context: ScientificStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  ranking: RankingResult,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  record.neoantigenRanking = structuredClone(ranking);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "candidate_rank_generated",
      `Generated neoantigen ranking with ${ranking.rankedCandidates.length} ranked candidates using ${ranking.ensembleMethod}.`,
      ranking.rankedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "candidate.rank-generated",
      `Generated neoantigen ranking with ${ranking.rankedCandidates.length} ranked candidates using ${ranking.ensembleMethod}.`,
      correlationId,
      ranking.rankedAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "neoantigen.ranking.recorded",
      { ranking: structuredClone(ranking) },
      correlationId,
      ranking.rankedAt,
      record.updatedAt,
    ),
  );

  return record;
}

export async function recordConstructDesignForCase(
  context: ScientificStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  constructDesign: ConstructDesignPackage,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  record.constructDesign = structuredClone(constructDesign);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "payload_generated",
      `Generated construct ${constructDesign.constructId} for ${constructDesign.deliveryModality} with ${constructDesign.candidateIds.length} candidate epitopes.`,
      constructDesign.designedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "payload.generated",
      `Generated construct ${constructDesign.constructId} for ${constructDesign.deliveryModality} with ${constructDesign.candidateIds.length} candidate epitopes.`,
      correlationId,
      constructDesign.designedAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "construct.design.recorded",
      { constructDesign: structuredClone(constructDesign) },
      correlationId,
      constructDesign.designedAt,
      record.updatedAt,
    ),
  );

  return record;
}
