export interface AuditEntry {
  eventId: string;
  caseId: string;
  type: string;
  detail: string;
  occurredAt: string;
  correlationId: string;
}

export const stepUpAuthMethods = ["totp", "webauthn"] as const;

export type StepUpAuthMethod = (typeof stepUpAuthMethods)[number];

export interface StepUpAuthInput {
  method: StepUpAuthMethod;
  totpCode?: string;
  webAuthnAssertion?: string;
  challengeId?: string;
}

export interface SignatureMetadataInput {
  printedName: string;
  meaning: string;
}

export interface SignedAuditEntry extends AuditEntry {
  signatureHash: string;
  signedBy: string;
  signedAt: string;
  signatureMethod: string;
  printedName?: string;
  meaning?: string;
  stepUpMethod?: StepUpAuthMethod;
}

export interface IAuditSignatureProvider {
  signAuditEntry(
    entry: AuditEntry,
    principal: string,
    metadata?: SignatureMetadataInput,
    stepUpAuth?: StepUpAuthInput,
  ): Promise<SignedAuditEntry>;
  verifySignature(entry: SignedAuditEntry): Promise<boolean>;
  verifyStepUpAuth(input: StepUpAuthInput): Promise<boolean>;
}
