import { z } from "zod";
import { type CaseProfile, type ConsentStatus, type CreateCaseInput, consentStatuses } from "./types";
import { enumText, optionalText, parseObjectWithSchema, requiredText } from "./validation-helpers";

const caseProfileSchema = z
  .object({
    patientKey: requiredText("caseProfile.patientKey"),
    indication: requiredText("caseProfile.indication"),
    siteId: requiredText("caseProfile.siteId"),
    protocolVersion: requiredText("caseProfile.protocolVersion"),
    consentStatus: enumText(consentStatuses, "caseProfile.consentStatus", "Unsupported consent status.").transform(
      (value) => value as ConsentStatus,
    ),
    boardRoute: optionalText("caseProfile.boardRoute"),
  })
  .strict() satisfies z.ZodType<CaseProfile>;

const createCaseInputSchema = z
  .object({
    caseProfile: caseProfileSchema,
  })
  .strict() satisfies z.ZodType<CreateCaseInput>;

export function parseCreateCaseInput(value: unknown): CreateCaseInput {
  return parseObjectWithSchema(value, createCaseInputSchema, "Submit a JSON object with case profile data.");
}
