export interface AuditEntry {
  eventId: string;
  caseId: string;
  type: string;
  detail: string;
  occurredAt: string;
  correlationId: string;
}

export interface SignedAuditEntry extends AuditEntry {
  signatureHash: string;
  signedBy: string;
  signedAt: string;
  signatureMethod: string;
}

export interface IAuditSignatureProvider {
  signAuditEntry(entry: AuditEntry, principal: string): Promise<SignedAuditEntry>;
  verifySignature(entry: SignedAuditEntry): Promise<boolean>;
}
