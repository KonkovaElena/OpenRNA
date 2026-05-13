import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, timelineEvent } from "./store-helpers";
import type {
  CaseDomainEventInput,
  CaseDomainEventType,
  CaseRecord,
  HlaConsensusRecord,
  QcGateRecord,
  WorkflowRunRecord,
} from "./types";

type ClockLike = { nowIso(): string };

export interface HlaQcStoreMutationContext {
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

export async function recordHlaConsensusForCase(
  context: HlaQcStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  consensus: HlaConsensusRecord,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  record.hlaConsensus = structuredClone(consensus);
  record.timeline.push(
    timelineEvent(
      context.clock,
      "hla_consensus_produced",
      `HLA consensus produced with ${consensus.alleles.length} alleles (confidence ${consensus.confidenceScore.toFixed(2)}).`,
      consensus.producedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "hla.consensus.produced",
      `HLA consensus produced with ${consensus.alleles.length} alleles (confidence ${consensus.confidenceScore.toFixed(2)}).`,
      correlationId,
      consensus.producedAt,
    ),
  );
  record.updatedAt = context.clock.nowIso();
  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "hla.consensus.produced",
      { consensus: structuredClone(consensus) },
      correlationId,
      consensus.producedAt,
      record.updatedAt,
    ),
  );

  return record;
}

export async function recordQcGateForCase(
  context: HlaQcStoreMutationContext,
  record: CaseRecord,
  caseId: string,
  runId: string,
  gate: QcGateRecord,
  correlationId: AuditContextInput,
): Promise<{ record: CaseRecord; run: WorkflowRunRecord }> {
  const run = record.workflowRuns.find((candidate) => candidate.runId === runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
  }

  record.qcGates.push(gate);
  const evaluatedAt = gate.evaluatedAt;
  record.timeline.push(
    timelineEvent(context.clock, "qc_evaluated", `QC evaluated for run ${runId}: ${gate.outcome}.`, evaluatedAt),
  );
  record.auditEvents.push(
    auditEvent(
      context.clock,
      "qc.evaluated",
      `QC evaluated for run ${runId}: ${gate.outcome}.`,
      correlationId,
      evaluatedAt,
    ),
  );

  return { record, run };
}
