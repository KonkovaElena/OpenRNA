import { z } from "zod";
import {
  type AdministrationRecord,
  administrationRoutes,
  type ClinicalFollowUpRecord,
  clinicalResponseCategories,
  type ImmuneMonitoringRecord,
} from "./types";
import {
  enumText,
  isoTimestamp,
  numberField,
  optionalText,
  parseObjectWithSchema,
  positiveInteger,
  requiredText,
} from "./validation-helpers";

type RecordAdministrationInput = Omit<AdministrationRecord, "caseId">;
type RecordImmuneMonitoringInput = Omit<ImmuneMonitoringRecord, "caseId">;
type RecordClinicalFollowUpInput = Omit<ClinicalFollowUpRecord, "caseId">;

const recordAdministrationInputSchema = z
  .object({
    administrationId: requiredText("administrationId"),
    constructId: requiredText("constructId"),
    constructVersion: positiveInteger("constructVersion"),
    administeredAt: isoTimestamp("administeredAt"),
    route: enumText(administrationRoutes, "route", "Unsupported administration route.").transform(
      (value) => value as AdministrationRecord["route"],
    ),
    doseMicrograms: numberField("doseMicrograms").positive("doseMicrograms must be a positive number."),
    batchId: optionalText("batchId"),
    notes: optionalText("notes"),
  })
  .strict() satisfies z.ZodType<RecordAdministrationInput>;

const recordImmuneMonitoringInputSchema = z
  .object({
    monitoringId: requiredText("monitoringId"),
    constructId: requiredText("constructId"),
    constructVersion: positiveInteger("constructVersion"),
    collectedAt: isoTimestamp("collectedAt"),
    assayType: requiredText("assayType"),
    biomarker: requiredText("biomarker"),
    value: numberField("value"),
    unit: requiredText("unit"),
    baselineDelta: numberField("baselineDelta").optional(),
    notes: optionalText("notes"),
  })
  .strict() satisfies z.ZodType<RecordImmuneMonitoringInput>;

const recordClinicalFollowUpInputSchema = z
  .object({
    followUpId: requiredText("followUpId"),
    constructId: requiredText("constructId"),
    constructVersion: positiveInteger("constructVersion"),
    evaluatedAt: isoTimestamp("evaluatedAt"),
    responseCategory: enumText(
      clinicalResponseCategories,
      "responseCategory",
      "Unsupported clinical response category.",
    ).transform((value) => value as ClinicalFollowUpRecord["responseCategory"]),
    progressionFreeDays: positiveInteger("progressionFreeDays").optional(),
    overallSurvivalDays: positiveInteger("overallSurvivalDays").optional(),
    notes: optionalText("notes"),
  })
  .strict() satisfies z.ZodType<RecordClinicalFollowUpInput>;

export function parseRecordAdministrationInput(value: unknown): RecordAdministrationInput {
  return parseObjectWithSchema(
    value,
    recordAdministrationInputSchema,
    "Submit a JSON object with administration outcome data and omit caseId from the body.",
  );
}

export function parseRecordImmuneMonitoringInput(value: unknown): RecordImmuneMonitoringInput {
  return parseObjectWithSchema(
    value,
    recordImmuneMonitoringInputSchema,
    "Submit a JSON object with immune monitoring outcome data and omit caseId from the body.",
  );
}

export function parseRecordClinicalFollowUpInput(value: unknown): RecordClinicalFollowUpInput {
  return parseObjectWithSchema(
    value,
    recordClinicalFollowUpInputSchema,
    "Submit a JSON object with clinical follow-up outcome data and omit caseId from the body.",
  );
}
