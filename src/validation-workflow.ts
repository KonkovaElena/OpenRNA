import { z } from "zod";
import {
  type CompleteWorkflowRunInput,
  type DerivedArtifactSemanticType,
  derivedArtifactSemanticTypes,
  type FailWorkflowRunInput,
  type RequestWorkflowInput,
  type StartWorkflowRunInput,
  workflowFailureCategories,
} from "./types";
import { enumText, optionalText, parseObjectWithSchema, requiredText } from "./validation-helpers";

const requestWorkflowInputSchema = z
  .object({
    workflowName: requiredText("workflowName"),
    referenceBundleId: requiredText("referenceBundleId"),
    executionProfile: requiredText("executionProfile"),
    requestedBy: optionalText("requestedBy"),
    idempotencyKey: optionalText("idempotencyKey"),
  })
  .strict() satisfies z.ZodType<RequestWorkflowInput>;

const startWorkflowRunInputSchema = z
  .object({
    runId: requiredText("runId"),
  })
  .strict() satisfies z.ZodType<StartWorkflowRunInput>;

const completeWorkflowRunInputSchema = z
  .object({
    derivedArtifacts: z
      .array(
        z
          .object({
            semanticType: enumText(
              derivedArtifactSemanticTypes,
              "derivedArtifacts[].semanticType",
              "Unsupported derived artifact semantic type.",
            ).transform((value) => value as DerivedArtifactSemanticType),
            artifactHash: requiredText("derivedArtifacts[].artifactHash"),
            producingStep: requiredText("derivedArtifacts[].producingStep"),
          })
          .strict(),
        { error: "derivedArtifacts must be an array of artifact objects." },
      )
      .default([]),
  })
  .strict() satisfies z.ZodType<CompleteWorkflowRunInput>;

const failWorkflowRunInputSchema = z
  .object({
    reason: requiredText("reason"),
    failureCategory: z
      .enum(workflowFailureCategories, {
        error: `failureCategory must be one of: ${workflowFailureCategories.join(", ")}`,
      })
      .optional(),
  })
  .strict() satisfies z.ZodType<FailWorkflowRunInput>;

export function parseRequestWorkflowInput(value: unknown): RequestWorkflowInput {
  return parseObjectWithSchema(
    value,
    requestWorkflowInputSchema,
    "Submit a JSON object with workflow request details.",
  );
}

export function parseStartWorkflowRunInput(value: unknown): StartWorkflowRunInput {
  return parseObjectWithSchema(value, startWorkflowRunInputSchema, "Submit a JSON object with run details.");
}

export function parseCompleteWorkflowRunInput(value: unknown): CompleteWorkflowRunInput {
  return parseObjectWithSchema(value, completeWorkflowRunInputSchema, "Submit a JSON object with completion details.");
}

export function parseFailWorkflowRunInput(value: unknown): FailWorkflowRunInput {
  return parseObjectWithSchema(value, failWorkflowRunInputSchema, "Submit a JSON object with failure reason.");
}
