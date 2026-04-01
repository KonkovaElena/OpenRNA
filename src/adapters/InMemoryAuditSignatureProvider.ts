import { createHmac, timingSafeEqual } from "node:crypto";
import type { IAuditSignatureProvider, AuditEntry, SignedAuditEntry } from "../ports/IAuditSignatureProvider";

/**
 * HMAC-SHA256 based audit entry signing.
 *
 * This is a preparation layer for 21 CFR Part 11 §11.50 electronic signature
 * compliance. The production implementation would use PKI (X.509 certificates)
 * with hardware security modules (HSMs) for non-repudiation.
 *
 * Current scope: integrity verification (tamper detection), not legal non-repudiation.
 */
export class InMemoryAuditSignatureProvider implements IAuditSignatureProvider {
  private readonly secret: string;

  constructor(secret: string = "openrna-audit-hmac-default-key") {
    this.secret = secret;
  }

  async signAuditEntry(entry: AuditEntry, principal: string): Promise<SignedAuditEntry> {
    const signedAt = new Date().toISOString();
    const payload = this.buildSignaturePayload(entry, principal, signedAt);
    const signatureHash = this.computeHmac(payload);

    return {
      ...entry,
      signatureHash,
      signedBy: principal,
      signedAt,
      signatureMethod: "hmac-sha256",
    };
  }

  async verifySignature(entry: SignedAuditEntry): Promise<boolean> {
    const payload = this.buildSignaturePayload(
      {
        eventId: entry.eventId,
        caseId: entry.caseId,
        type: entry.type,
        detail: entry.detail,
        occurredAt: entry.occurredAt,
        correlationId: entry.correlationId,
      },
      entry.signedBy,
      entry.signedAt,
    );

    const expectedHash = this.computeHmac(payload);
    const expectedBuffer = Buffer.from(expectedHash, "utf-8");
    const actualBuffer = Buffer.from(entry.signatureHash, "utf-8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private buildSignaturePayload(entry: AuditEntry, principal: string, signedAt: string): string {
    return JSON.stringify({
      eventId: entry.eventId,
      caseId: entry.caseId,
      type: entry.type,
      detail: entry.detail,
      occurredAt: entry.occurredAt,
      correlationId: entry.correlationId,
      signedBy: principal,
      signedAt,
    });
  }

  private computeHmac(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}
