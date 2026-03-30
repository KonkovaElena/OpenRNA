import { randomUUID } from "node:crypto";
import type { IOutcomeRegistry } from "../ports/IOutcomeRegistry.js";
import type {
  AdministrationRecord,
  ClinicalFollowUpRecord,
  ImmuneMonitoringRecord,
  OutcomeTimelineEntry,
} from "../types.js";

function sortOutcomeTimeline(entries: OutcomeTimelineEntry[]): void {
  entries.sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime !== 0 ? byTime : left.entryId.localeCompare(right.entryId);
  });
}

export class InMemoryOutcomeRegistry implements IOutcomeRegistry {
  private readonly entriesByCaseId = new Map<string, OutcomeTimelineEntry[]>();

  async recordAdministration(record: AdministrationRecord): Promise<OutcomeTimelineEntry> {
    return this.appendEntry({
      entryId: `outcome_${randomUUID()}`,
      caseId: record.caseId,
      constructId: record.constructId,
      constructVersion: record.constructVersion,
      entryType: "administration",
      occurredAt: record.administeredAt,
      administration: structuredClone(record),
    });
  }

  async recordImmuneMonitoring(record: ImmuneMonitoringRecord): Promise<OutcomeTimelineEntry> {
    return this.appendEntry({
      entryId: `outcome_${randomUUID()}`,
      caseId: record.caseId,
      constructId: record.constructId,
      constructVersion: record.constructVersion,
      entryType: "immune-monitoring",
      occurredAt: record.collectedAt,
      immuneMonitoring: structuredClone(record),
    });
  }

  async recordClinicalFollowUp(record: ClinicalFollowUpRecord): Promise<OutcomeTimelineEntry> {
    return this.appendEntry({
      entryId: `outcome_${randomUUID()}`,
      caseId: record.caseId,
      constructId: record.constructId,
      constructVersion: record.constructVersion,
      entryType: "clinical-follow-up",
      occurredAt: record.evaluatedAt,
      clinicalFollowUp: structuredClone(record),
    });
  }

  async getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]> {
    return structuredClone(this.entriesByCaseId.get(caseId) ?? []);
  }

  private appendEntry(entry: OutcomeTimelineEntry): OutcomeTimelineEntry {
    const entries = this.entriesByCaseId.get(entry.caseId) ?? [];
    entries.push(structuredClone(entry));
    sortOutcomeTimeline(entries);
    this.entriesByCaseId.set(entry.caseId, entries);
    return structuredClone(entry);
  }
}