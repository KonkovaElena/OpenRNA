export interface ConsentEvent {
  type: "granted" | "withdrawn" | "renewed";
  timestamp: string;
  scope: string;
  version: string;
  witnessId?: string;
  notes?: string;
}

export interface IConsentTracker {
  recordConsent(caseId: string, event: ConsentEvent): Promise<void>;
  getConsentHistory(caseId: string): Promise<ConsentEvent[]>;
  isConsentActive(caseId: string): Promise<boolean>;
}
