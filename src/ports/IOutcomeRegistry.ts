import type {
  AdministrationRecord,
  ClinicalFollowUpRecord,
  ImmuneMonitoringRecord,
  OutcomeTimelineEntry,
} from "../types.js";

export interface IOutcomeRegistry {
  recordAdministration(record: AdministrationRecord): Promise<OutcomeTimelineEntry>;
  recordImmuneMonitoring(record: ImmuneMonitoringRecord): Promise<OutcomeTimelineEntry>;
  recordClinicalFollowUp(record: ClinicalFollowUpRecord): Promise<OutcomeTimelineEntry>;
  getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]>;
}