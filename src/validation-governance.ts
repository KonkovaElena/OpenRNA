import { z } from "zod";
import type { ReferenceBundleManifest } from "./types";
import { isoTimestamp, optionalText, parseObjectWithSchema, requiredText } from "./validation-helpers";

// ─── Register Reference Bundle (Wave 6) ─────────────────────────────

const retrievalProvenanceSchema = z
  .object({
    uri: requiredText("retrievalProvenance.uri"),
    retrievedAt: isoTimestamp("retrievalProvenance.retrievedAt"),
    integrityHash: requiredText("retrievalProvenance.integrityHash"),
  })
  .strict();

const registerBundleSchema = z
  .object({
    bundleId: requiredText("bundleId"),
    genomeAssembly: requiredText("genomeAssembly"),
    annotationVersion: requiredText("annotationVersion"),
    knownSitesVersion: requiredText("knownSitesVersion"),
    hlaDatabaseVersion: requiredText("hlaDatabaseVersion"),
    frozenAt: isoTimestamp("frozenAt"),
    transcriptSet: optionalText("transcriptSet"),
    callerBundleVersion: optionalText("callerBundleVersion"),
    pipelineRevision: optionalText("pipelineRevision"),
    retrievalProvenance: z.preprocess(
      (v) => (v === null || v === undefined ? undefined : v),
      retrievalProvenanceSchema.optional(),
    ),
  })
  .strict() satisfies z.ZodType<ReferenceBundleManifest>;

export function parseRegisterBundleInput(value: unknown): ReferenceBundleManifest {
  return parseObjectWithSchema(value, registerBundleSchema, "Submit a JSON object describing the reference bundle.");
}

// ─── Consent Event (HD-004: replace inline validation) ───────────────

const consentTypes = ["granted", "withdrawn", "renewed"] as const;

const consentEventSchema = z
  .object({
    type: z.enum(consentTypes, { error: "type must be one of: granted, withdrawn, renewed." }),
    timestamp: isoTimestamp("timestamp").optional(),
    scope: requiredText("scope"),
    version: requiredText("version"),
    witnessId: optionalText("witnessId"),
    notes: optionalText("notes"),
  })
  .strict();

export interface ConsentEventInput {
  type: "granted" | "withdrawn" | "renewed";
  timestamp?: string;
  scope: string;
  version: string;
  witnessId?: string;
  notes?: string;
}

export function parseConsentEventInput(value: unknown): ConsentEventInput {
  return parseObjectWithSchema(
    value,
    consentEventSchema,
    "Submit a JSON object with type (granted|withdrawn|renewed), scope, and version.",
  );
}

// ─── Audit Sign / Verify (HD-004: replace inline validation) ─────────

const auditSignInputSchema = z
  .object({
    entry: z.record(z.string(), z.unknown(), { error: "entry is required." }),
    principal: requiredText("principal"),
  })
  .strict();

export interface AuditSignInput {
  entry: Record<string, unknown>;
  principal: string;
}

export function parseAuditSignInput(value: unknown): AuditSignInput {
  return parseObjectWithSchema(
    value,
    auditSignInputSchema,
    "Submit a JSON object with an audit entry and signing principal.",
  );
}

const auditVerifyInputSchema = z
  .object({
    entry: z.record(z.string(), z.unknown(), { error: "entry is required." }),
  })
  .strict();

export interface AuditVerifyInput {
  entry: Record<string, unknown>;
}

export function parseAuditVerifyInput(value: unknown): AuditVerifyInput {
  return parseObjectWithSchema(
    value,
    auditVerifyInputSchema,
    "Submit a JSON object with a signed audit entry to verify.",
  );
}
