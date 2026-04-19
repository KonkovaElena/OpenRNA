import type {
  AdministrationRecord,
  CaseAuditEventRecord,
  CaseDomainEventRecord,
  CaseRecord,
  CaseStatus,
  ClinicalFollowUpRecord,
  ConstructDesignPackage,
  HandoffPacketRecord,
  HlaConsensusRecord,
  ImmuneMonitoringRecord,
  OutcomeTimelineEntry,
  QcGateRecord,
  RankingResult,
  ReviewOutcomeRecord,
  RunArtifact,
  SampleRecord,
  TimelineEvent,
  WorkflowRequestRecord,
  WorkflowRunRecord,
} from "../types.js";
import { sealAuditHashChain } from "../store-helpers.js";

function timelineEvent(at: string, type: string, detail: string): TimelineEvent {
  return { at, type, detail };
}

function auditEvent(
  event: CaseDomainEventRecord,
  type: CaseAuditEventRecord["type"],
  detail: string,
): CaseAuditEventRecord {
  return {
    eventId: event.eventId,
    type,
    detail,
    correlationId: event.correlationId,
    actorId: event.actorId,
    authMechanism: event.authMechanism,
    occurredAt: event.occurredAt,
  };
}

function sortOutcomeTimeline(entries: OutcomeTimelineEntry[]): void {
  entries.sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime !== 0 ? byTime : left.entryId.localeCompare(right.entryId);
  });
}

function ensureCaseRecord(record: CaseRecord | undefined, event: CaseDomainEventRecord): CaseRecord {
  if (!record) {
    throw new Error(`Case ${event.aggregateId} must be created before applying ${event.type}.`);
  }

  if (record.caseId !== event.aggregateId) {
    throw new Error(`Aggregate mismatch: expected ${record.caseId}, got ${event.aggregateId}.`);
  }

  return record;
}

function replaceWorkflowRun(record: CaseRecord, nextRun: WorkflowRunRecord): void {
  const index = record.workflowRuns.findIndex((run) => run.runId === nextRun.runId);
  if (index === -1) {
    record.workflowRuns.push(structuredClone(nextRun));
    return;
  }

  record.workflowRuns[index] = structuredClone(nextRun);
}

function pushOutcomeEntry(record: CaseRecord, entry: OutcomeTimelineEntry): void {
  record.outcomeTimeline.push(structuredClone(entry));
  sortOutcomeTimeline(record.outcomeTimeline);
}

export function applyCaseEvent(current: CaseRecord | undefined, event: CaseDomainEventRecord): CaseRecord {
  if (event.type === "case.created") {
    const timeline: TimelineEvent[] = [
      timelineEvent(event.occurredAt, "case_created", "Human oncology case was created."),
    ];

    if (event.payload.status === "AWAITING_CONSENT") {
      timeline.push(
        timelineEvent(event.occurredAt, "consent_missing", "Case is waiting for required consent artifacts."),
      );
    }

    return {
      caseId: event.aggregateId,
      status: event.payload.status,
      createdAt: event.payload.createdAt,
      updatedAt: event.updatedAt,
      caseProfile: structuredClone(event.payload.caseProfile),
      samples: [],
      artifacts: [],
      workflowRequests: [],
      timeline,
      auditEvents: [
        auditEvent(event, "case.created", "Human oncology case was created."),
      ],
      workflowRuns: [],
      derivedArtifacts: [],
      qcGates: [],
      boardPackets: [],
      reviewOutcomes: [],
      qaReleases: [],
      handoffPackets: [],
      outcomeTimeline: [],
    };
  }

  const record = structuredClone(ensureCaseRecord(current, event));

  switch (event.type) {
    case "sample.registered": {
      record.samples.push(structuredClone(event.payload.sample));
      record.timeline.push(
        timelineEvent(event.occurredAt, "sample_registered", `${event.payload.sample.sampleType} provenance was registered.`),
      );
      record.auditEvents.push(
        auditEvent(event, "sample.registered", `${event.payload.sample.sampleType} provenance was registered.`),
      );
      if (event.payload.workflowGateOpened) {
        record.timeline.push(
          timelineEvent(
            event.occurredAt,
            "workflow_gate_opened",
            "Required sample trio, source artifacts, and consent gate are complete.",
          ),
        );
      }
      record.status = event.payload.nextStatus;
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "artifact.registered": {
      record.artifacts.push(structuredClone(event.payload.artifact));
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "artifact_registered",
          `${event.payload.artifact.semanticType} source artifact was cataloged.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "artifact.registered",
          `${event.payload.artifact.semanticType} source artifact was cataloged.`,
        ),
      );
      if (event.payload.workflowGateOpened) {
        record.timeline.push(
          timelineEvent(
            event.occurredAt,
            "workflow_gate_opened",
            "Required sample trio, source artifacts, and consent gate are complete.",
          ),
        );
      }
      record.status = event.payload.nextStatus;
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "workflow.requested": {
      record.workflowRequests.push(structuredClone(event.payload.request));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "workflow_requested",
          `${event.payload.request.workflowName} requested with reference bundle ${event.payload.request.referenceBundleId}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(event, "workflow.requested", `${event.payload.request.workflowName} workflow was requested.`),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "workflow.started": {
      replaceWorkflowRun(record, event.payload.run);
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(event.occurredAt, "workflow_started", `Workflow run ${event.payload.run.runId} started.`),
      );
      record.auditEvents.push(
        auditEvent(event, "workflow.started", `Workflow run ${event.payload.run.runId} started.`),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "workflow.completed": {
      replaceWorkflowRun(record, event.payload.run);
      record.status = event.payload.nextStatus;
      for (const artifact of event.payload.derivedArtifacts) {
        record.derivedArtifacts.push(structuredClone(artifact));
        record.auditEvents.push(
          auditEvent(
            event,
            "artifact.derived",
            `Derived artifact ${artifact.semanticType} from run ${event.payload.run.runId}.`,
          ),
        );
      }
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "workflow_completed",
          `Run ${event.payload.run.runId} completed with ${event.payload.derivedArtifacts.length} derived artifacts.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(event, "workflow.completed", `Run ${event.payload.run.runId} completed.`),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "workflow.cancelled": {
      replaceWorkflowRun(record, event.payload.run);
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(event.occurredAt, "workflow_cancelled", `Run ${event.payload.run.runId} was cancelled.`),
      );
      record.auditEvents.push(
        auditEvent(event, "workflow.cancelled", `Workflow run ${event.payload.run.runId} was cancelled.`),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "workflow.failed": {
      replaceWorkflowRun(record, event.payload.run);
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "workflow_failed",
          `Run ${event.payload.run.runId} failed: ${event.payload.run.failureReason ?? "unknown failure"}`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "workflow.failed",
          `Run ${event.payload.run.runId} failed: ${event.payload.run.failureReason ?? "unknown failure"}`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "hla.consensus.produced": {
      record.hlaConsensus = structuredClone(event.payload.consensus);
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "hla_consensus_produced",
          `HLA consensus with ${event.payload.consensus.alleles.length} alleles, confidence ${event.payload.consensus.confidenceScore}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(event, "hla.consensus.produced", `HLA consensus produced for case ${record.caseId}.`),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "qc.evaluated": {
      record.qcGates.push(structuredClone(event.payload.gate));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "qc_evaluated",
          `QC gate for run ${event.payload.runId}: ${event.payload.gate.outcome}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "qc.evaluated",
          `QC gate for run ${event.payload.runId}: ${event.payload.gate.outcome}. ${event.payload.gate.results.length} metrics evaluated.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "board.packet.generated": {
      record.boardPackets.push(structuredClone(event.payload.packet));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "board_packet_generated",
          `Board packet ${event.payload.packet.packetId} generated for ${event.payload.packet.boardRoute}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "board.packet.generated",
          `Board packet ${event.payload.packet.packetId} generated for ${event.payload.packet.boardRoute}.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "review.outcome.recorded": {
      record.reviewOutcomes.push(structuredClone(event.payload.reviewOutcome));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "review_outcome_recorded",
          `Recorded ${event.payload.reviewOutcome.reviewDisposition} review outcome ${event.payload.reviewOutcome.reviewId} for packet ${event.payload.reviewOutcome.packetId}.`,
        ),
      );
      const reviewSignature = event.payload.reviewOutcome.signature;
      record.auditEvents.push(
        {
          ...auditEvent(
            event,
            "review.outcome.recorded",
            `Recorded ${event.payload.reviewOutcome.reviewDisposition} review outcome ${event.payload.reviewOutcome.reviewId} for packet ${event.payload.reviewOutcome.packetId}.`,
          ),
          ...(reviewSignature
            ? {
                printedName: reviewSignature.printedName,
                signatureMeaning: reviewSignature.meaning,
                signedBy: reviewSignature.signedBy,
                signedAt: reviewSignature.signedAt,
                signatureMethod: reviewSignature.signatureMethod,
                signatureHash: reviewSignature.signatureHash,
                stepUpMethod: reviewSignature.stepUpMethod,
              }
            : {}),
        },
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "qa.release.recorded": {
      record.qaReleases.push(structuredClone(event.payload.qaRelease));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "qa_release_recorded",
          `Recorded QA release ${event.payload.qaRelease.qaReleaseId} for review ${event.payload.qaRelease.reviewId}.`,
        ),
      );
      const qaSignature = event.payload.qaRelease.signature;
      record.auditEvents.push(
        {
          ...auditEvent(
            event,
            "qa.release.recorded",
            `Recorded QA release ${event.payload.qaRelease.qaReleaseId} for review ${event.payload.qaRelease.reviewId}.`,
          ),
          printedName: qaSignature.printedName,
          signatureMeaning: qaSignature.meaning,
          signedBy: qaSignature.signedBy,
          signedAt: qaSignature.signedAt,
          signatureMethod: qaSignature.signatureMethod,
          signatureHash: qaSignature.signatureHash,
          stepUpMethod: qaSignature.stepUpMethod,
        },
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "handoff.packet.generated": {
      record.handoffPackets.push(structuredClone(event.payload.handoffPacket));
      record.status = event.payload.nextStatus;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "handoff_packet_generated",
          `Generated manufacturing handoff packet ${event.payload.handoffPacket.handoffId} for ${event.payload.handoffPacket.handoffTarget}.`,
        ),
      );
      const handoffQaSignature = event.payload.handoffPacket.snapshot.qaRelease.signature;
      record.auditEvents.push(
        {
          ...auditEvent(
            event,
            "handoff.packet.generated",
            `Generated manufacturing handoff packet ${event.payload.handoffPacket.handoffId} for ${event.payload.handoffPacket.handoffTarget}.`,
          ),
          printedName: handoffQaSignature.printedName,
          signatureMeaning: handoffQaSignature.meaning,
          signedBy: handoffQaSignature.signedBy,
          signedAt: handoffQaSignature.signedAt,
          signatureMethod: handoffQaSignature.signatureMethod,
          signatureHash: handoffQaSignature.signatureHash,
          stepUpMethod: handoffQaSignature.stepUpMethod,
        },
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "neoantigen.ranking.recorded": {
      record.neoantigenRanking = structuredClone(event.payload.ranking);
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "candidate_rank_generated",
          `Generated neoantigen ranking with ${event.payload.ranking.rankedCandidates.length} ranked candidates using ${event.payload.ranking.ensembleMethod}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "candidate.rank-generated",
          `Generated neoantigen ranking with ${event.payload.ranking.rankedCandidates.length} ranked candidates using ${event.payload.ranking.ensembleMethod}.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "construct.design.recorded": {
      record.constructDesign = structuredClone(event.payload.constructDesign);
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "payload_generated",
          `Generated construct ${event.payload.constructDesign.constructId} for ${event.payload.constructDesign.deliveryModality} with ${event.payload.constructDesign.candidateIds.length} candidate epitopes.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "payload.generated",
          `Generated construct ${event.payload.constructDesign.constructId} for ${event.payload.constructDesign.deliveryModality} with ${event.payload.constructDesign.candidateIds.length} candidate epitopes.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "administration.recorded": {
      pushOutcomeEntry(record, event.payload.entry);
      const administration = event.payload.entry.administration;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "construct_administered",
          `Recorded construct administration ${administration.administrationId} via ${administration.route}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "outcome.recorded",
          `Recorded administration outcome ${administration.administrationId} for construct ${administration.constructId}.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "immune-monitoring.recorded": {
      pushOutcomeEntry(record, event.payload.entry);
      const monitoring = event.payload.entry.immuneMonitoring;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "immune_monitoring_recorded",
          `Recorded immune monitoring ${monitoring.monitoringId} for biomarker ${monitoring.biomarker}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "outcome.recorded",
          `Recorded immune monitoring outcome ${monitoring.monitoringId} for construct ${monitoring.constructId}.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }

    case "clinical-follow-up.recorded": {
      pushOutcomeEntry(record, event.payload.entry);
      const followUp = event.payload.entry.clinicalFollowUp;
      record.timeline.push(
        timelineEvent(
          event.occurredAt,
          "clinical_follow_up_recorded",
          `Recorded clinical follow-up ${followUp.followUpId} with response ${followUp.responseCategory}.`,
        ),
      );
      record.auditEvents.push(
        auditEvent(
          event,
          "outcome.recorded",
          `Recorded clinical follow-up outcome ${followUp.followUpId} for construct ${followUp.constructId}.`,
        ),
      );
      record.updatedAt = event.updatedAt;
      return record;
    }
  }
}

export function replayCaseEvents(events: readonly CaseDomainEventRecord[]): CaseRecord {
  const orderedEvents = [...events].sort((left, right) => {
    const byVersion = left.version - right.version;
    return byVersion !== 0 ? byVersion : left.eventId.localeCompare(right.eventId);
  });

  if (orderedEvents.length === 0) {
    throw new Error("At least one case event is required to rebuild aggregate state.");
  }

  let record: CaseRecord | undefined;
  for (const event of orderedEvents) {
    record = applyCaseEvent(record, event);
  }

  if (!record) {
    throw new Error("Case replay produced no aggregate state.");
  }

  sealAuditHashChain(record.auditEvents);

  return record;
}