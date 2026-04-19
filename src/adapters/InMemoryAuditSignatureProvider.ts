import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  IAuditSignatureProvider,
  AuditEntry,
  SignatureMetadataInput,
  SignedAuditEntry,
  StepUpAuthInput,
} from "../ports/IAuditSignatureProvider";

export interface AuditSignatureProviderOptions {
  secret?: string;
  totpSecretBase32?: string;
  totpWindow?: number;
}

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
  private readonly totpSecret: Buffer;
  private readonly totpWindow: number;

  constructor(options: AuditSignatureProviderOptions = {}) {
    this.secret = options.secret ?? "openrna-audit-hmac-default-key";
    this.totpSecret = this.decodeBase32Secret(options.totpSecretBase32 ?? "JBSWY3DPEHPK3PXP");
    this.totpWindow = options.totpWindow ?? 1;
  }

  async signAuditEntry(
    entry: AuditEntry,
    principal: string,
    metadata?: SignatureMetadataInput,
    stepUpAuth?: StepUpAuthInput,
  ): Promise<SignedAuditEntry> {
    if (stepUpAuth) {
      const validStepUp = await this.verifyStepUpAuth(stepUpAuth);
      if (!validStepUp) {
        throw new Error("Step-up authentication failed.");
      }
    }

    const signedAt = new Date().toISOString();
    const payload = this.buildSignaturePayload(entry, principal, signedAt, metadata, stepUpAuth?.method);
    const signatureHash = this.computeHmac(payload);

    return {
      ...entry,
      signatureHash,
      signedBy: principal,
      signedAt,
      signatureMethod: "hmac-sha256",
      printedName: metadata?.printedName,
      meaning: metadata?.meaning,
      stepUpMethod: stepUpAuth?.method,
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
      entry.printedName && entry.meaning
        ? {
            printedName: entry.printedName,
            meaning: entry.meaning,
          }
        : undefined,
      entry.stepUpMethod,
    );

    const expectedHash = this.computeHmac(payload);
    const expectedBuffer = Buffer.from(expectedHash, "utf-8");
    const actualBuffer = Buffer.from(entry.signatureHash, "utf-8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  async verifyStepUpAuth(input: StepUpAuthInput): Promise<boolean> {
    if (input.method === "totp") {
      if (!input.totpCode || !/^\d{6}$/.test(input.totpCode)) {
        return false;
      }

      const nowStep = Math.floor(Date.now() / 30000);
      for (let delta = -this.totpWindow; delta <= this.totpWindow; delta += 1) {
        const step = nowStep + delta;
        if (step < 0) {
          continue;
        }

        const expected = this.generateTotp(step);
        const expectedBuffer = Buffer.from(expected, "utf-8");
        const providedBuffer = Buffer.from(input.totpCode, "utf-8");

        if (expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)) {
          return true;
        }
      }

      return false;
    }

    if (input.method === "webauthn") {
      if (!input.webAuthnAssertion || !input.challengeId) {
        return false;
      }

      // Minimal in-memory assertion format for tests/local simulations:
      // webauthn:<challengeId>:<hmac-prefix>
      const expectedPrefix = this.computeHmac(`webauthn:${input.challengeId}`).slice(0, 16);
      const expectedAssertion = `webauthn:${input.challengeId}:${expectedPrefix}`;
      return input.webAuthnAssertion === expectedAssertion;
    }

    return false;
  }

  private buildSignaturePayload(
    entry: AuditEntry,
    principal: string,
    signedAt: string,
    metadata?: SignatureMetadataInput,
    stepUpMethod?: StepUpAuthInput["method"],
  ): string {
    return JSON.stringify({
      eventId: entry.eventId,
      caseId: entry.caseId,
      type: entry.type,
      detail: entry.detail,
      occurredAt: entry.occurredAt,
      correlationId: entry.correlationId,
      signedBy: principal,
      signedAt,
      printedName: metadata?.printedName,
      meaning: metadata?.meaning,
      stepUpMethod,
    });
  }

  private computeHmac(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  private decodeBase32Secret(secret: string): Buffer {
    const normalized = secret.toUpperCase().replace(/=+$/u, "").replace(/\s+/gu, "");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";

    for (const char of normalized) {
      const index = alphabet.indexOf(char);
      if (index < 0) {
        throw new Error("Invalid Base32 secret for TOTP.");
      }
      bits += index.toString(2).padStart(5, "0");
    }

    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
    }

    return Buffer.from(bytes);
  }

  private generateTotp(timeStep: number): string {
    const counter = Buffer.alloc(8);
    counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
    counter.writeUInt32BE(timeStep >>> 0, 4);

    const hmac = createHmac("sha1", this.totpSecret).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24)
      | ((hmac[offset + 1] & 0xff) << 16)
      | ((hmac[offset + 2] & 0xff) << 8)
      | (hmac[offset + 3] & 0xff);

    return (code % 1_000_000).toString().padStart(6, "0");
  }
}
