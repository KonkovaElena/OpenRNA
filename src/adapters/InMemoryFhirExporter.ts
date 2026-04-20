import { randomUUID } from "node:crypto";
import type {
  IFhirExporter,
  FhirBundle,
  FhirObservation,
  FhirPatient,
  FhirDiagnosticReport,
} from "../ports/IFhirExporter";
import type { CaseRecord, HlaConsensusRecord } from "../types";

/**
 * In-memory FHIR R4 exporter based on HL7 FHIR Genomics Reporting IG v4.0.0.
 *
 * Mapping strategy:
 * - CaseRecord → FHIR Patient + DiagnosticReport
 * - HlaConsensusRecord → FHIR Observation (Histocompatibility Genotype profile)
 * - Each HLA allele → Observation component
 *
 * Reference profiles:
 * - http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genotype
 * - http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genomics-report
 */
export class InMemoryFhirExporter implements IFhirExporter {
  async exportCase(caseRecord: CaseRecord): Promise<FhirBundle> {
    const patientId = `Patient/${randomUUID()}`;
    const reportId = `DiagnosticReport/${randomUUID()}`;

    const patient: FhirPatient = {
      resourceType: "Patient",
      id: patientId,
      identifier: [
        {
          system: "urn:openrna:patient-key",
          value: caseRecord.caseProfile.patientKey,
        },
      ],
    };

    const observations: FhirObservation[] = [];
    if (caseRecord.hlaConsensus) {
      observations.push(
        ...this.buildHlaObservations(caseRecord.caseId, caseRecord.hlaConsensus, patientId),
      );
    }

    const report: FhirDiagnosticReport = {
      resourceType: "DiagnosticReport",
      id: reportId,
      status: caseRecord.status === "APPROVED_FOR_HANDOFF" ? "final" : "preliminary",
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "81247-9",
            display: "Master HL7 genetic  variant reporting panel",
          },
        ],
      },
      subject: { reference: patientId },
      result: observations.map((obs) => ({ reference: `Observation/${obs.id}` })),
      issued: caseRecord.updatedAt,
    };

    const bundle: FhirBundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        { resource: patient, fullUrl: `urn:uuid:${patientId}` },
        { resource: report, fullUrl: `urn:uuid:${reportId}` },
        ...observations.map((obs) => ({
          resource: obs as FhirObservation,
          fullUrl: `urn:uuid:Observation/${obs.id}`,
        })),
      ],
    };

    return bundle;
  }

  async exportHlaConsensus(caseId: string, consensus: HlaConsensusRecord): Promise<FhirObservation[]> {
    return this.buildHlaObservations(caseId, consensus);
  }

  private buildHlaObservations(
    caseId: string,
    consensus: HlaConsensusRecord,
    patientReference?: string,
  ): FhirObservation[] {
    const genotypeObs: FhirObservation = {
      resourceType: "Observation",
      id: `hla-genotype-${randomUUID()}`,
      meta: {
        profile: [
          "http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genotype",
        ],
      },
      status: "final",
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "84413-4",
            display: "Genotype display name",
          },
        ],
      },
      ...(patientReference ? { subject: { reference: patientReference } } : {}),
      component: consensus.alleles.map((allele) => ({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "48018-6",
              display: "Gene studied [ID]",
            },
          ],
        },
        valueCodeableConcept: {
          coding: [
            {
              system: "http://glstring.org",
              code: allele,
              display: allele,
            },
          ],
        },
      })),
    };

    // Per-tool evidence as separate observations
    const toolObservations: FhirObservation[] = consensus.perToolEvidence.map((tool) => ({
      resourceType: "Observation" as const,
      id: `hla-tool-${tool.toolName}-${randomUUID()}`,
      status: "final" as const,
      code: {
        coding: [
          {
            system: "urn:openrna:hla-typing-tool",
            code: tool.toolName,
            display: `HLA typing by ${tool.toolName}`,
          },
        ],
      },
      component: [
        {
          code: {
            coding: [{ system: "urn:openrna:metric", code: "confidence", display: "Confidence score" }],
          },
          valueQuantity: { value: tool.confidence, unit: "score" },
        },
        ...tool.alleles.map((allele) => ({
          code: {
            coding: [{ system: "http://loinc.org", code: "48018-6", display: "Gene studied [ID]" }],
          },
          valueString: allele,
        })),
      ],
    }));

    return [genotypeObs, ...toolObservations];
  }
}
