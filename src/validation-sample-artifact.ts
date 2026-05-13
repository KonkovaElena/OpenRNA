import { z } from "zod";
import {
  type AssayType,
  assayTypes,
  type RegisterArtifactInput,
  type RegisterSampleInput,
  type SampleType,
  sampleTypes,
  sourceArtifactSemanticTypes,
} from "./types";
import { enumText, optionalText, parseObjectWithSchema, positiveInteger, requiredText } from "./validation-helpers";

const registerSampleInputSchema = z
  .object({
    sampleId: requiredText("sampleId"),
    sampleType: enumText(sampleTypes, "sampleType", "Unsupported sample type.").transform(
      (value) => value as SampleType,
    ),
    assayType: enumText(assayTypes, "assayType", "Unsupported assay type.").transform((value) => value as AssayType),
    accessionId: requiredText("accessionId"),
    sourceSite: requiredText("sourceSite"),
  })
  .strict() satisfies z.ZodType<RegisterSampleInput>;

const registerArtifactInputSchema = z
  .object({
    sampleId: requiredText("sampleId"),
    semanticType: enumText(sourceArtifactSemanticTypes, "semanticType", "Unsupported source artifact semantic type."),
    schemaVersion: positiveInteger("schemaVersion"),
    artifactHash: requiredText("artifactHash"),
    storageUri: optionalText("storageUri"),
    mediaType: optionalText("mediaType"),
  })
  .strict() satisfies z.ZodType<RegisterArtifactInput>;

export function parseRegisterSampleInput(value: unknown): RegisterSampleInput {
  return parseObjectWithSchema(value, registerSampleInputSchema, "Submit a JSON object with sample provenance.");
}

export function parseRegisterArtifactInput(value: unknown): RegisterArtifactInput {
  return parseObjectWithSchema(value, registerArtifactInputSchema, "Submit a JSON object with artifact catalog data.");
}
