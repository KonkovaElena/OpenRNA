import { type ZodError, z } from "zod";
import { ApiError } from "./errors";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredText(fieldName: string) {
  return z
    .string({ error: `${fieldName} is required.` })
    .trim()
    .min(1, `${fieldName} is required.`);
}

export function optionalText(fieldName: string) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z
      .string({ error: `${fieldName} must be a string.` })
      .trim()
      .optional(),
  );
}

export function positiveInteger(fieldName: string) {
  return z
    .number({ error: `${fieldName} must be a positive integer.` })
    .int()
    .min(1, `${fieldName} must be a positive integer.`);
}

export function numberField(fieldName: string) {
  return z.number({ error: `${fieldName} must be a number.` });
}

export function isoTimestamp(fieldName: string) {
  return z
    .string({ error: `${fieldName} is required.` })
    .trim()
    .min(1, `${fieldName} is required.`)
    .datetime({ message: `${fieldName} must be a valid ISO 8601 timestamp.` });
}

export function booleanField(fieldName: string) {
  return z.boolean({ error: `${fieldName} must be a boolean.` });
}

export function enumText<const TValues extends readonly [string, ...string[]]>(
  values: TValues,
  fieldName: string,
  unsupportedMessage: string,
) {
  return requiredText(fieldName).refine(
    (value): value is TValues[number] => values.includes(value as TValues[number]),
    {
      message: unsupportedMessage,
    },
  );
}

export function nonEmptyStringArray(fieldName: string, itemFieldName: string) {
  return z
    .array(requiredText(itemFieldName), {
      error: `${fieldName} must be a non-empty array of strings.`,
    })
    .min(1, `${fieldName} must be a non-empty array of strings.`);
}

export function firstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export function parseObjectWithSchema<T>(value: unknown, schema: z.ZodType<T>, nextStep: string): T {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_input", "Request body must be an object.", nextStep);
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "invalid_input", firstIssueMessage(result.error), nextStep);
  }

  return result.data;
}
