import type { HlaConsensusRecord, CaseRecord } from "../types";

/**
 * FHIR R4 resource type stubs based on HL7 FHIR Genomics Reporting IG v4.0.0.
 * These are simplified type representations — a full FHIR SDK would use
 * the complete resource schemas.
 */
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: { profile?: string[] };
}

export interface FhirObservation extends FhirResource {
  resourceType: "Observation";
  status: "final" | "preliminary";
  code: { coding: Array<{ system: string; code: string; display: string }> };
  subject?: { reference: string };
  valueCodeableConcept?: { coding: Array<{ system: string; code: string; display: string }> };
  component?: Array<{
    code: { coding: Array<{ system: string; code: string; display: string }> };
    valueCodeableConcept?: { coding: Array<{ system: string; code: string; display: string }> };
    valueString?: string;
    valueQuantity?: { value: number; unit: string };
  }>;
}

export interface FhirPatient extends FhirResource {
  resourceType: "Patient";
  identifier?: Array<{ system: string; value: string }>;
}

export interface FhirDiagnosticReport extends FhirResource {
  resourceType: "DiagnosticReport";
  status: "final" | "preliminary" | "registered";
  code: { coding: Array<{ system: string; code: string; display: string }> };
  subject?: { reference: string };
  result?: Array<{ reference: string }>;
  issued?: string;
}

export interface FhirBundle extends FhirResource {
  resourceType: "Bundle";
  type: "collection" | "transaction" | "document";
  entry?: Array<{ resource: FhirResource; fullUrl?: string }>;
}

export interface IFhirExporter {
  exportCase(caseRecord: CaseRecord): Promise<FhirBundle>;
  exportHlaConsensus(caseId: string, consensus: HlaConsensusRecord): Promise<FhirObservation[]>;
}
