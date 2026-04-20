import type { IConsentTracker, ConsentEvent } from "../ports/IConsentTracker";

/**
 * In-memory consent event log per case.
 *
 * Consent state is derived from the event log:
 * - Active if the last event is "granted" or "renewed"
 * - Inactive if the last event is "withdrawn" or no events exist
 *
 * This pattern supports full audit trail requirements (21 CFR Part 11)
 * and GDPR right-to-know (consent history).
 */
export class InMemoryConsentTracker implements IConsentTracker {
  private readonly consentLog = new Map<string, ConsentEvent[]>();

  async recordConsent(caseId: string, event: ConsentEvent): Promise<void> {
    let events = this.consentLog.get(caseId);
    if (!events) {
      events = [];
      this.consentLog.set(caseId, events);
    }
    events.push({ ...event });
  }

  async getConsentHistory(caseId: string): Promise<ConsentEvent[]> {
    const events = this.consentLog.get(caseId);
    return events ? events.map((e) => ({ ...e })) : [];
  }

  async isConsentActive(caseId: string): Promise<boolean> {
    const events = this.consentLog.get(caseId);
    if (!events || events.length === 0) {
      return false;
    }

    const lastEvent = events[events.length - 1];
    return lastEvent.type === "granted" || lastEvent.type === "renewed";
  }
}
