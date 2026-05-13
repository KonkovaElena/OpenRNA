import { z } from "zod";
import {
  type AuthorizeFinalReleaseInput,
  type GenerateHandoffPacketInput,
  type RecordReviewOutcomeInput,
  reviewDispositions,
} from "./types";
import { isoTimestamp, optionalText, parseObjectWithSchema, positiveInteger, requiredText } from "./validation-helpers";

const signatureManifestationSchema = z
  .object({
    meaning: z.enum(["review", "release", "consent"], {
      error: "meaning must be one of: review, release, consent.",
    }),
    signedBy: requiredText("signatureManifestation.signedBy"),
    signedAt: isoTimestamp("signatureManifestation.signedAt"),
    signatureHash: requiredText("signatureManifestation.signatureHash"),
    signatureMethod: requiredText("signatureManifestation.signatureMethod"),
  })
  .strict();

const reviewSignatureManifestationSchema = signatureManifestationSchema.extend({
  meaning: z.literal("review", { error: "signatureManifestation.meaning must be 'review'." }),
});

const releaseSignatureManifestationSchema = signatureManifestationSchema.extend({
  meaning: z.literal("release", { error: "signatureManifestation.meaning must be 'release'." }),
});

const recordReviewOutcomeInputSchema = z
  .object({
    packetId: requiredText("packetId"),
    reviewerId: requiredText("reviewerId"),
    reviewerRole: optionalText("reviewerRole"),
    reviewDisposition: z.enum(reviewDispositions, {
      error: `reviewDisposition must be one of: ${reviewDispositions.join(", ")}.`,
    }),
    rationale: requiredText("rationale"),
    comments: optionalText("comments"),
    signatureManifestation: reviewSignatureManifestationSchema.optional(),
  })
  .strict() satisfies z.ZodType<RecordReviewOutcomeInput>;

const authorizeFinalReleaseInputSchema = z
  .object({
    reviewId: requiredText("reviewId"),
    releaserId: requiredText("releaserId"),
    releaserRole: optionalText("releaserRole"),
    rationale: requiredText("rationale"),
    comments: optionalText("comments"),
    signatureManifestation: releaseSignatureManifestationSchema.optional(),
  })
  .strict() satisfies z.ZodType<AuthorizeFinalReleaseInput>;

const generateHandoffPacketInputSchema = z
  .object({
    reviewId: requiredText("reviewId"),
    handoffTarget: requiredText("handoffTarget"),
    requestedBy: requiredText("requestedBy"),
    turnaroundDays: positiveInteger("turnaroundDays"),
    notes: optionalText("notes"),
  })
  .strict() satisfies z.ZodType<GenerateHandoffPacketInput>;

export function parseRecordReviewOutcomeInput(value: unknown): RecordReviewOutcomeInput {
  return parseObjectWithSchema(
    value,
    recordReviewOutcomeInputSchema,
    "Submit a JSON object with packetId, reviewer identity, reviewDisposition, and rationale.",
  );
}

export function parseAuthorizeFinalReleaseInput(value: unknown): AuthorizeFinalReleaseInput {
  return parseObjectWithSchema(
    value,
    authorizeFinalReleaseInputSchema,
    "Submit a JSON object with reviewId, releaser identity, and release rationale.",
  );
}

export function parseGenerateHandoffPacketInput(value: unknown): GenerateHandoffPacketInput {
  return parseObjectWithSchema(
    value,
    generateHandoffPacketInputSchema,
    "Submit a JSON object with reviewId, handoffTarget, requestedBy, and turnaroundDays.",
  );
}
