import type { AuditContextInput } from "./store-helpers";
import { auditEvent, timelineEvent } from "./store-helpers";
import type {
  ArtifactRecord,
  CaseDomainEventInput,
  CaseDomainEventType,
  CaseRecord,
  ConsentStatus,
  SampleRecord,
} from "./types";

type ClockLike = { nowIso(): string };
type IdGenerator = () => string;

export interface CreateCaseStoreMutationContext {
  clock: ClockLike;
  generateId: IdGenerator;
  deriveCaseStatus: (
    consentStatus: ConsentStatus,
    samples: SampleRecord[],
    artifacts: ArtifactRecord[],
    workflowRequested: boolean,
  ) => CaseRecord["status"];
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

export interface CreateCaseInput {
  caseProfile: CaseRecord["caseProfile"];
}

export async function createCaseRecord(
  context: CreateCaseStoreMutationContext,
  input: CreateCaseInput,
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const createdAt = context.clock.nowIso();
  const caseId = `case_${context.generateId()}`;
  const status = context.deriveCaseStatus(input.caseProfile.consentStatus, [], [], false);
  const timeline = [timelineEvent(context.clock, "case_created", "Human oncology case was created.")];

  if (status === "AWAITING_CONSENT") {
    timeline.push(timelineEvent(context.clock, "consent_missing", "Case is waiting for required consent artifacts."));
  }

  const record: CaseRecord = {
    caseId,
    status,
    createdAt,
    updatedAt: createdAt,
    caseProfile: input.caseProfile,
    samples: [],
    artifacts: [],
    workflowRequests: [],
    timeline,
    auditEvents: [],
    workflowRuns: [],
    derivedArtifacts: [],
    qcGates: [],
    boardPackets: [],
    reviewOutcomes: [],
    handoffPackets: [],
    outcomeTimeline: [],
  };

  record.auditEvents.push(auditEvent(context.clock, "case.created", "Human oncology case was created.", correlationId));

  await context.appendCaseEvent(
    context.createCaseEvent(
      caseId,
      "case.created",
      { createdAt, status, caseProfile: structuredClone(input.caseProfile) },
      correlationId,
      createdAt,
      createdAt,
    ),
  );

  return record;
}
