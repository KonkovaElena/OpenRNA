import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import type { IWorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
import { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
import type {
  AssayType,
  ArtifactRecord,
  BoardPacketGenerationResult,
  BoardPacketRecord,
  BoardPacketSnapshot,
  CaseProfile,
  CaseRecord,
  CaseAuditEventRecord,
  CaseAuditEventType,
  CaseStatus,
  CompleteWorkflowRunInput,
  ConsentStatus,
  CreateCaseInput,
  EvaluateQcGateInput,
  FailWorkflowRunInput,
  HlaConsensusRecord,
  OperationsSummary,
  QcGateOutcome,
  QcGateRecord,
  QcResult,
  RecordHlaConsensusInput,
  RegisterArtifactInput,
  RegisterSampleInput,
  RequestWorkflowInput,
  RunArtifact,
  SampleRecord,
  SampleType,
  StartWorkflowRunInput,
  TimelineEvent,
  WorkflowDispatchRecord,
  WorkflowRequestRecord,
  WorkflowRunRecord,
} from "./types";
import { assayTypes, caseStatuses, consentStatuses, sampleTypes } from "./types";

const requiredSampleTypes: ReadonlySet<SampleType> = new Set(["TUMOR_DNA", "NORMAL_DNA", "TUMOR_RNA"]);

export interface Clock {
  nowIso(): string;
}

export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
}

export type { IWorkflowDispatchSink as WorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
export { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";

export interface CaseStore {
  createCase(rawInput: unknown, correlationId: string): CaseRecord;
  listCases(): CaseRecord[];
  getCase(caseId: string): CaseRecord;
  registerSample(caseId: string, rawInput: unknown, correlationId: string): CaseRecord;
  registerArtifact(caseId: string, rawInput: unknown, correlationId: string): CaseRecord;
  requestWorkflow(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord>;
  getOperationsSummary(): OperationsSummary;
  // Phase 2: workflow lifecycle
  startWorkflowRun(caseId: string, runId: string, correlationId: string): CaseRecord;
  completeWorkflowRun(caseId: string, runId: string, derivedArtifacts: RunArtifact[], correlationId: string): CaseRecord;
  failWorkflowRun(caseId: string, runId: string, reason: string, correlationId: string): CaseRecord;
  // Phase 2: HLA consensus
  recordHlaConsensus(caseId: string, record: HlaConsensusRecord, correlationId: string): CaseRecord;
  getHlaConsensus(caseId: string): HlaConsensusRecord | null;
  // Phase 2: QC gate
  recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: string): CaseRecord;
  getQcGate(caseId: string, runId: string): QcGateRecord | null;
  // Phase 2: workflow runs
  getWorkflowRun(caseId: string, runId: string): WorkflowRunRecord;
  listWorkflowRuns(caseId: string): WorkflowRunRecord[];
  // Phase 2: expert review packets
  generateBoardPacket(caseId: string, correlationId: string): BoardPacketGenerationResult;
  listBoardPackets(caseId: string): BoardPacketRecord[];
  getBoardPacket(caseId: string, packetId: string): BoardPacketRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "invalid_input", `${fieldName} is required.`, `Provide a non-empty ${fieldName}.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", "Optional text fields must be strings.", "Submit text values or omit the field.");
  }

  return value.trim();
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ApiError(400, "invalid_input", `${fieldName} must be a positive integer.`, `Provide a positive integer for ${fieldName}.`);
  }

  return value;
}

function timelineEvent(clock: Clock, type: string, detail: string): TimelineEvent {
  return { at: clock.nowIso(), type, detail };
}

function auditEvent(
  clock: Clock,
  type: CaseAuditEventType,
  detail: string,
  correlationId: string,
): CaseAuditEventRecord {
  return {
    eventId: `event_${randomUUID()}`,
    type,
    detail,
    correlationId,
    occurredAt: clock.nowIso(),
  };
}

function emptyStatusCounts(): Record<CaseStatus, number> {
  return Object.fromEntries(caseStatuses.map((status) => [status, 0])) as Record<CaseStatus, number>;
}

function hasRequiredSamples(samples: SampleRecord[]): boolean {
  const seen = new Set(samples.map((sample) => sample.sampleType));
  for (const sampleType of requiredSampleTypes) {
    if (!seen.has(sampleType)) {
      return false;
    }
  }

  return true;
}

function hasRequiredSourceArtifacts(samples: SampleRecord[], artifacts: ArtifactRecord[]): boolean {
  const sourceArtifactSampleIds = new Set(
    artifacts
      .filter((artifact) => artifact.artifactClass === "SOURCE")
      .map((artifact) => artifact.sampleId),
  );

  for (const sampleType of requiredSampleTypes) {
    const sample = samples.find((candidate) => candidate.sampleType === sampleType);
    if (!sample || !sourceArtifactSampleIds.has(sample.sampleId)) {
      return false;
    }
  }

  return true;
}

function deriveCaseStatus(
  consentStatus: ConsentStatus,
  samples: SampleRecord[],
  artifacts: ArtifactRecord[],
  hasWorkflowRequest: boolean,
): CaseStatus {
  if (hasWorkflowRequest) {
    return "WORKFLOW_REQUESTED";
  }

  if (consentStatus === "missing") {
    return "AWAITING_CONSENT";
  }

  if (hasRequiredSamples(samples) && hasRequiredSourceArtifacts(samples, artifacts)) {
    return "READY_FOR_WORKFLOW";
  }

  return "INTAKING";
}

function computePacketHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export class MemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, CaseRecord>();

  constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly workflowDispatchSink: IWorkflowDispatchSink = new InMemoryWorkflowDispatchSink(),
  ) {}

  createCase(rawInput: unknown, correlationId: string): CaseRecord {
    const input = parseCreateCaseInput(rawInput);
    const createdAt = this.clock.nowIso();
    const caseId = `case_${randomUUID()}`;
    const status = deriveCaseStatus(input.caseProfile.consentStatus, [], [], false);
    const timeline: TimelineEvent[] = [timelineEvent(this.clock, "case_created", "Human oncology case was created.")];

    if (status === "AWAITING_CONSENT") {
      timeline.push(timelineEvent(this.clock, "consent_missing", "Case is waiting for required consent artifacts."));
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
    };

    record.auditEvents.push(auditEvent(this.clock, "case.created", "Human oncology case was created.", correlationId));

    this.cases.set(caseId, record);
    return structuredClone(record);
  }

  listCases(): CaseRecord[] {
    return [...this.cases.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => structuredClone(record));
  }

  getCase(caseId: string): CaseRecord {
    return structuredClone(this.getMutableRecord(caseId));
  }

  private getMutableRecord(caseId: string): CaseRecord {
    const record = this.cases.get(caseId);
    if (!record) {
      throw new ApiError(404, "case_not_found", "Case was not found.", "Use a valid caseId from the case list endpoint.");
    }

    return record;
  }

  registerSample(caseId: string, rawInput: unknown, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    const input = parseRegisterSampleInput(rawInput);

    if (record.workflowRequests.length > 0) {
      throw new ApiError(409, "invalid_transition", "Samples cannot be changed after workflow request.", "Create a new case version before changing sample provenance.");
    }

    if (record.samples.some((sample) => sample.sampleType === input.sampleType)) {
      throw new ApiError(409, "duplicate_sample_type", "Sample type already registered.", "Submit each required sample type only once in this bootstrap slice.");
    }

    const registeredAt = this.clock.nowIso();
    record.samples.push({
      sampleId: input.sampleId,
      sampleType: input.sampleType,
      assayType: input.assayType,
      accessionId: input.accessionId,
      sourceSite: input.sourceSite,
      registeredAt,
    });
    record.timeline.push(timelineEvent(this.clock, "sample_registered", `${input.sampleType} provenance was registered.`));
    record.auditEvents.push(
      auditEvent(this.clock, "sample.registered", `${input.sampleType} provenance was registered.`, correlationId),
    );

    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
    if (nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW") {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    record.status = nextStatus;
    record.updatedAt = registeredAt;
    return structuredClone(record);
  }

  registerArtifact(caseId: string, rawInput: unknown, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    const input = parseRegisterArtifactInput(rawInput);

    if (record.workflowRequests.length > 0) {
      throw new ApiError(409, "invalid_transition", "Artifacts cannot be changed after workflow request.", "Create a new case version before changing artifact provenance.");
    }

    if (!record.samples.some((sample) => sample.sampleId === input.sampleId)) {
      throw new ApiError(409, "missing_sample_provenance", "Artifact references an unknown sample.", "Register the sample provenance before attaching a source artifact.");
    }

    if (record.artifacts.some((artifact) => artifact.sampleId === input.sampleId && artifact.semanticType === input.semanticType && artifact.artifactHash === input.artifactHash)) {
      throw new ApiError(409, "duplicate_artifact", "Artifact is already registered for this sample.", "Submit each source artifact only once per sample and semantic type in this bootstrap slice.");
    }

    const registeredAt = this.clock.nowIso();
    const artifact: ArtifactRecord = {
      artifactId: `artifact_${randomUUID()}`,
      artifactClass: "SOURCE",
      sampleId: input.sampleId,
      semanticType: input.semanticType,
      schemaVersion: input.schemaVersion,
      artifactHash: input.artifactHash,
      storageUri: input.storageUri,
      mediaType: input.mediaType,
      registeredAt,
    };

    record.artifacts.push(artifact);
    record.timeline.push(timelineEvent(this.clock, "artifact_registered", `${input.semanticType} source artifact was cataloged.`));
    record.auditEvents.push(
      auditEvent(this.clock, "artifact.registered", `${input.semanticType} source artifact was cataloged.`, correlationId),
    );
    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
    if (nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW") {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    record.status = nextStatus;
    record.updatedAt = registeredAt;
    return structuredClone(record);
  }

  async requestWorkflow(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRequestWorkflowInput(rawInput);

    if (input.idempotencyKey) {
      const existingRequest = record.workflowRequests.find(
        (workflowRequest) => workflowRequest.idempotencyKey === input.idempotencyKey,
      );

      if (existingRequest) {
        if (
          existingRequest.workflowName !== input.workflowName ||
          existingRequest.referenceBundleId !== input.referenceBundleId ||
          existingRequest.executionProfile !== input.executionProfile
        ) {
          throw new ApiError(
            409,
            "idempotency_mismatch",
            "Idempotency key was already used with a different payload.",
            "Use a new idempotency key for a different workflow request.",
          );
        }

        return structuredClone(record);
      }
    }

    if (record.status !== "READY_FOR_WORKFLOW") {
      throw new ApiError(
        409,
        "invalid_transition",
        "Case is not ready for workflow request.",
        "Complete consent and register tumor DNA, normal DNA, tumor RNA, and their source artifacts before requesting a workflow.",
      );
    }

    const requestedAt = this.clock.nowIso();
    const workflowRequest: WorkflowRequestRecord = {
      requestId: `run_${randomUUID()}`,
      workflowName: input.workflowName,
      referenceBundleId: input.referenceBundleId,
      executionProfile: input.executionProfile,
      requestedBy: input.requestedBy,
      requestedAt,
      idempotencyKey: input.idempotencyKey,
      correlationId,
    };

    // Dispatch to sink BEFORE mutating aggregate — if sink throws,
    // case state stays clean and the same idempotency key can be retried.
    await this.workflowDispatchSink.recordWorkflowRequested({
      dispatchId: `dispatch_${randomUUID()}`,
      caseId: record.caseId,
      requestId: workflowRequest.requestId,
      workflowName: workflowRequest.workflowName,
      referenceBundleId: workflowRequest.referenceBundleId,
      executionProfile: workflowRequest.executionProfile,
      requestedBy: workflowRequest.requestedBy,
      requestedAt: workflowRequest.requestedAt,
      idempotencyKey: workflowRequest.idempotencyKey,
      correlationId,
      status: "PENDING",
    });
    record.workflowRequests.push(workflowRequest);
    record.status = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, true);
    record.timeline.push(
      timelineEvent(this.clock, "workflow_requested", `${input.workflowName} requested with reference bundle ${input.referenceBundleId}.`),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "workflow.requested", `${input.workflowName} workflow was requested.`, correlationId),
    );
    record.updatedAt = requestedAt;
    return structuredClone(record);
  }

  getOperationsSummary(): OperationsSummary {
    const statusCounts = emptyStatusCounts();

    for (const record of this.cases.values()) {
      statusCounts[record.status] += 1;
    }

    return {
      totalCases: this.cases.size,
      statusCounts,
      awaitingConsentCount: statusCounts.AWAITING_CONSENT,
      readyForWorkflowCount: statusCounts.READY_FOR_WORKFLOW,
      workflowRequestedCount: statusCounts.WORKFLOW_REQUESTED,
    };
  }

  // ─── Phase 2: Workflow Run Lifecycle ──────────────────────────────

  startWorkflowRun(caseId: string, runId: string, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    if (record.status !== "WORKFLOW_REQUESTED") {
      throw new ApiError(409, "invalid_transition", "Case must be in WORKFLOW_REQUESTED status to start a run.", "Request a workflow before starting a run.");
    }

    const request = record.workflowRequests[record.workflowRequests.length - 1];
    const run: WorkflowRunRecord = {
      runId,
      caseId,
      requestId: request?.requestId ?? "",
      status: "RUNNING",
      workflowName: request?.workflowName ?? "",
      referenceBundleId: request?.referenceBundleId ?? "",
      executionProfile: request?.executionProfile ?? "",
      startedAt: this.clock.nowIso(),
    };

    record.workflowRuns.push(run);
    record.status = "WORKFLOW_RUNNING";
    record.timeline.push(timelineEvent(this.clock, "workflow_started", `Workflow run ${runId} started.`));
    record.auditEvents.push(auditEvent(this.clock, "workflow.started", `Workflow run ${runId} started.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  completeWorkflowRun(caseId: string, runId: string, derivedArtifacts: RunArtifact[], correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status.");
    }

    run.status = "COMPLETED";
    run.completedAt = this.clock.nowIso();
    record.status = "WORKFLOW_COMPLETED";

    for (const artifact of derivedArtifacts) {
      record.derivedArtifacts.push(artifact);
      record.auditEvents.push(
        auditEvent(this.clock, "artifact.derived", `Derived artifact ${artifact.semanticType} from run ${runId}.`, correlationId),
      );
    }

    record.timeline.push(timelineEvent(this.clock, "workflow_completed", `Run ${runId} completed with ${derivedArtifacts.length} derived artifacts.`));
    record.auditEvents.push(auditEvent(this.clock, "workflow.completed", `Run ${runId} completed.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  failWorkflowRun(caseId: string, runId: string, reason: string, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be failed.", "Check run status.");
    }

    run.status = "FAILED";
    run.failureReason = reason;
    run.completedAt = this.clock.nowIso();
    record.status = "WORKFLOW_FAILED";
    record.timeline.push(timelineEvent(this.clock, "workflow_failed", `Run ${runId} failed: ${reason}`));
    record.auditEvents.push(auditEvent(this.clock, "workflow.failed", `Run ${runId} failed: ${reason}`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  // ─── Phase 2: HLA Consensus ───────────────────────────────────────

  recordHlaConsensus(caseId: string, consensus: HlaConsensusRecord, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    record.hlaConsensus = consensus;
    record.timeline.push(timelineEvent(this.clock, "hla_consensus_produced", `HLA consensus with ${consensus.alleles.length} alleles, confidence ${consensus.confidenceScore}.`));
    record.auditEvents.push(auditEvent(this.clock, "hla.consensus.produced", `HLA consensus produced for case ${caseId}.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  getHlaConsensus(caseId: string): HlaConsensusRecord | null {
    const record = this.getCase(caseId);
    return record.hlaConsensus ?? null;
  }

  // ─── Phase 2: QC Gate ─────────────────────────────────────────────

  recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: string): CaseRecord {
    const record = this.getMutableRecord(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "COMPLETED") {
      throw new ApiError(409, "invalid_transition", "QC can only be evaluated on completed runs.", "Complete the workflow run first.");
    }

    record.qcGates.push(gate);
    if (gate.outcome === "PASSED" || gate.outcome === "WARN") {
      record.status = "QC_PASSED";
    } else {
      record.status = "QC_FAILED";
    }

    record.timeline.push(timelineEvent(this.clock, "qc_evaluated", `QC gate for run ${runId}: ${gate.outcome}.`));
    record.auditEvents.push(auditEvent(this.clock, "qc.evaluated", `QC gate for run ${runId}: ${gate.outcome}. ${gate.results.length} metrics evaluated.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  getQcGate(caseId: string, runId: string): QcGateRecord | null {
    const record = this.getCase(caseId);
    return record.qcGates.find((g) => g.runId === runId) ?? null;
  }

  // ─── Phase 2: Workflow Run Queries ────────────────────────────────

  getWorkflowRun(caseId: string, runId: string): WorkflowRunRecord {
    const record = this.getCase(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return run;
  }

  listWorkflowRuns(caseId: string): WorkflowRunRecord[] {
    const record = this.getCase(caseId);
    return record.workflowRuns;
  }

  generateBoardPacket(caseId: string, correlationId: string): BoardPacketGenerationResult {
    const record = this.getMutableRecord(caseId);
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

    const snapshot: BoardPacketSnapshot = {
      caseSummary: {
        caseId: record.caseId,
        status: record.status,
        indication: record.caseProfile.indication,
        siteId: record.caseProfile.siteId,
        protocolVersion: record.caseProfile.protocolVersion,
        boardRoute,
      },
      workflowRuns: structuredClone(completedRuns),
      derivedArtifacts: structuredClone(record.derivedArtifacts),
      hlaConsensus: structuredClone(record.hlaConsensus),
      latestQcGate: structuredClone(latestQcGate),
    };

    const packetHash = computePacketHash(snapshot);
    const existingPacket = record.boardPackets.find((packet) => packet.packetHash === packetHash);
    if (existingPacket) {
      return {
        case: structuredClone(record),
        packet: structuredClone(existingPacket),
        created: false,
      };
    }

    const createdAt = this.clock.nowIso();
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
    record.timeline.push(timelineEvent(this.clock, "board_packet_generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`));
    record.auditEvents.push(
      auditEvent(this.clock, "board.packet.generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`, correlationId),
    );
    record.updatedAt = createdAt;

    return {
      case: structuredClone(record),
      packet: structuredClone(packet),
      created: true,
    };
  }

  listBoardPackets(caseId: string): BoardPacketRecord[] {
    const record = this.getCase(caseId);
    return record.boardPackets;
  }

  getBoardPacket(caseId: string, packetId: string): BoardPacketRecord {
    const record = this.getCase(caseId);
    const packet = record.boardPackets.find((candidate) => candidate.packetId === packetId);
    if (!packet) {
      throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
    }

    return packet;
  }
}

export function parseCreateCaseInput(value: unknown): CreateCaseInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with case profile data.");
  }

  const caseProfileRecord = value.caseProfile;
  if (!isRecord(caseProfileRecord)) {
    throw new ApiError(400, "invalid_input", "caseProfile is required.", "Provide a caseProfile object with case metadata.");
  }

  return {
    caseProfile: parseCaseProfile(caseProfileRecord),
  };
}

function parseCaseProfile(value: Record<string, unknown>): CaseProfile {
  const consentStatus = requireString(value.consentStatus, "caseProfile.consentStatus");
  if (!consentStatuses.includes(consentStatus as ConsentStatus)) {
    throw new ApiError(400, "invalid_input", "Unsupported consent status.", "Use complete or missing.");
  }

  return {
    patientKey: requireString(value.patientKey, "caseProfile.patientKey"),
    indication: requireString(value.indication, "caseProfile.indication"),
    siteId: requireString(value.siteId, "caseProfile.siteId"),
    protocolVersion: requireString(value.protocolVersion, "caseProfile.protocolVersion"),
    consentStatus: consentStatus as ConsentStatus,
    boardRoute: optionalString(value.boardRoute),
  };
}

export function parseRegisterSampleInput(value: unknown): RegisterSampleInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with sample provenance.");
  }

  const sampleType = requireString(value.sampleType, "sampleType");
  if (!sampleTypes.includes(sampleType as SampleType)) {
    throw new ApiError(400, "invalid_input", "Unsupported sample type.", "Use TUMOR_DNA, NORMAL_DNA, TUMOR_RNA, or FOLLOW_UP.");
  }

  const assayType = requireString(value.assayType, "assayType");
  if (!assayTypes.includes(assayType as AssayType)) {
    throw new ApiError(400, "invalid_input", "Unsupported assay type.", "Use WES, WGS, RNA_SEQ, PANEL, or OTHER.");
  }

  return {
    sampleId: requireString(value.sampleId, "sampleId"),
    sampleType: sampleType as SampleType,
    assayType: assayType as AssayType,
    accessionId: requireString(value.accessionId, "accessionId"),
    sourceSite: requireString(value.sourceSite, "sourceSite"),
  };
}

export function parseRegisterArtifactInput(value: unknown): RegisterArtifactInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with artifact catalog data.");
  }

  return {
    sampleId: requireString(value.sampleId, "sampleId"),
    semanticType: requireString(value.semanticType, "semanticType"),
    schemaVersion: requirePositiveInteger(value.schemaVersion, "schemaVersion"),
    artifactHash: requireString(value.artifactHash, "artifactHash"),
    storageUri: optionalString(value.storageUri),
    mediaType: optionalString(value.mediaType),
  };
}

export function parseRequestWorkflowInput(value: unknown): RequestWorkflowInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with workflow request details.");
  }

  return {
    workflowName: requireString(value.workflowName, "workflowName"),
    referenceBundleId: requireString(value.referenceBundleId, "referenceBundleId"),
    executionProfile: requireString(value.executionProfile, "executionProfile"),
    requestedBy: optionalString(value.requestedBy),
    idempotencyKey: optionalString(value.idempotencyKey),
  };
}

// ─── Phase 2 Input Parsers ──────────────────────────────────────────

export function parseStartWorkflowRunInput(value: unknown): StartWorkflowRunInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with run details.");
  }
  return {
    runId: requireString(value.runId, "runId"),
  };
}

export function parseCompleteWorkflowRunInput(value: unknown): CompleteWorkflowRunInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with completion details.");
  }
  const derivedArtifacts: CompleteWorkflowRunInput["derivedArtifacts"] = [];
  if (Array.isArray(value.derivedArtifacts)) {
    for (const item of value.derivedArtifacts) {
      if (!isRecord(item)) {
        throw new ApiError(400, "invalid_input", "Each derived artifact must be an object.", "Submit proper artifact entries.");
      }
      derivedArtifacts.push({
        semanticType: requireString(item.semanticType, "derivedArtifacts[].semanticType"),
        artifactHash: requireString(item.artifactHash, "derivedArtifacts[].artifactHash"),
        producingStep: requireString(item.producingStep, "derivedArtifacts[].producingStep"),
      });
    }
  }
  return { derivedArtifacts };
}

export function parseFailWorkflowRunInput(value: unknown): FailWorkflowRunInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with failure reason.");
  }
  return {
    reason: requireString(value.reason, "reason"),
  };
}

export function parseRecordHlaConsensusInput(value: unknown): RecordHlaConsensusInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with HLA consensus data.");
  }
  if (!Array.isArray(value.alleles) || value.alleles.length === 0) {
    throw new ApiError(400, "invalid_input", "alleles must be a non-empty array of strings.", "Provide HLA allele calls.");
  }
  for (const allele of value.alleles) {
    if (typeof allele !== "string" || allele.trim().length === 0) {
      throw new ApiError(400, "invalid_input", "Each allele must be a non-empty string.", "Provide valid HLA allele identifiers.");
    }
  }
  if (!Array.isArray(value.perToolEvidence) || value.perToolEvidence.length === 0) {
    throw new ApiError(400, "invalid_input", "perToolEvidence must be a non-empty array.", "Provide at least one tool's evidence.");
  }
  const perToolEvidence = (value.perToolEvidence as unknown[]).map((item) => {
    if (!isRecord(item)) {
      throw new ApiError(400, "invalid_input", "Each tool evidence entry must be an object.", "Provide proper evidence entries.");
    }
    return {
      toolName: requireString(item.toolName, "perToolEvidence[].toolName"),
      alleles: Array.isArray(item.alleles) ? item.alleles.map((a: unknown) => String(a)) : [],
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
      rawOutput: optionalString(item.rawOutput),
    };
  });
  if (typeof value.confidenceScore !== "number") {
    throw new ApiError(400, "invalid_input", "confidenceScore must be a number.", "Provide a numeric confidence score.");
  }
  return {
    alleles: (value.alleles as string[]).map((a) => a.trim()),
    perToolEvidence,
    confidenceScore: value.confidenceScore,
    tieBreakNotes: optionalString(value.tieBreakNotes),
    referenceVersion: requireString(value.referenceVersion, "referenceVersion"),
  };
}

export function parseEvaluateQcGateInput(value: unknown): EvaluateQcGateInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", "Submit a JSON object with QC results.");
  }
  if (!Array.isArray(value.results) || value.results.length === 0) {
    throw new ApiError(400, "invalid_input", "results must be a non-empty array.", "Provide at least one QC metric result.");
  }
  const results = (value.results as unknown[]).map((item) => {
    if (!isRecord(item)) {
      throw new ApiError(400, "invalid_input", "Each QC result must be an object.", "Provide proper QC metric entries.");
    }
    return {
      metric: requireString(item.metric, "results[].metric"),
      value: typeof item.value === "number" ? item.value : (() => { throw new ApiError(400, "invalid_input", "results[].value must be a number.", "Provide numeric metric values."); })(),
      threshold: typeof item.threshold === "number" ? item.threshold : (() => { throw new ApiError(400, "invalid_input", "results[].threshold must be a number.", "Provide numeric threshold values."); })(),
      pass: typeof item.pass === "boolean" ? item.pass : (() => { throw new ApiError(400, "invalid_input", "results[].pass must be a boolean.", "Provide boolean pass/fail for each metric."); })(),
      notes: optionalString(item.notes),
    };
  });
  return { results };
}