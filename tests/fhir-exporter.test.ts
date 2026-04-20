import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryFhirExporter } from "../src/adapters/InMemoryFhirExporter";
import type { CaseRecord, HlaConsensusRecord } from "../src/types";

function buildMinimalCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: "case-fhir-001",
    status: "APPROVED_FOR_HANDOFF",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T12:00:00Z",
    caseProfile: {
      patientKey: "pt-fhir-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
    samples: [],
    artifacts: [],
    workflowRequests: [],
    timeline: [],
    auditEvents: [],
    workflowRuns: [],
    derivedArtifacts: [],
    qcGates: [],
    boardPackets: [],
    reviewOutcomes: [],
    handoffPackets: [],
    outcomeTimeline: [],
    ...overrides,
  } as CaseRecord;
}

function buildHlaConsensus(): HlaConsensusRecord {
  return {
    caseId: "case-fhir-001",
    alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-B*07:02", "HLA-B*44:02"],
    perToolEvidence: [
      {
        toolName: "OptiType",
        alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-B*07:02", "HLA-B*44:02"],
        confidence: 0.95,
      },
    ],
    confidenceScore: 0.95,
    operatorReviewThreshold: 0,
    unresolvedDisagreementCount: 0,
    manualReviewRequired: false,
    referenceVersion: "IPD-IMGT/HLA 3.56.0",
    producedAt: "2026-04-01T06:00:00Z",
  };
}

test("FHIR Exporter", async (t) => {
  const exporter = new InMemoryFhirExporter();

  await t.test("exportCase returns a valid FHIR Bundle", async () => {
    const caseRecord = buildMinimalCase();
    const bundle = await exporter.exportCase(caseRecord);

    assert.strictEqual(bundle.resourceType, "Bundle");
    assert.strictEqual(bundle.type, "collection");
    assert.ok(bundle.entry);
    assert.ok(bundle.entry.length >= 2, "should have at least Patient + DiagnosticReport");
  });

  await t.test("exportCase includes a Patient resource with patient key identifier", async () => {
    const caseRecord = buildMinimalCase();
    const bundle = await exporter.exportCase(caseRecord);

    const patient = bundle.entry!.find(
      (e) => e.resource.resourceType === "Patient",
    );
    assert.ok(patient, "Bundle must contain a Patient resource");
    const patientRes = patient.resource as { identifier?: Array<{ system: string; value: string }> };
    assert.ok(patientRes.identifier);
    assert.strictEqual(patientRes.identifier[0].system, "urn:openrna:patient-key");
    assert.strictEqual(patientRes.identifier[0].value, "pt-fhir-001");
  });

  await t.test("exportCase includes a DiagnosticReport linked to patient", async () => {
    const caseRecord = buildMinimalCase();
    const bundle = await exporter.exportCase(caseRecord);

    const report = bundle.entry!.find(
      (e) => e.resource.resourceType === "DiagnosticReport",
    );
    assert.ok(report, "Bundle must contain a DiagnosticReport");
    const reportRes = report.resource as unknown as { status: string; subject?: { reference: string } };
    assert.strictEqual(reportRes.status, "final"); // APPROVED_FOR_HANDOFF → final
    assert.ok(reportRes.subject?.reference, "DiagnosticReport must reference a patient");
  });

  await t.test("DiagnosticReport status is preliminary for non-approved cases", async () => {
    const caseRecord = buildMinimalCase({ status: "WORKFLOW_RUNNING" });
    const bundle = await exporter.exportCase(caseRecord);

    const report = bundle.entry!.find(
      (e) => e.resource.resourceType === "DiagnosticReport",
    );
    const reportRes = report!.resource as unknown as { status: string };
    assert.strictEqual(reportRes.status, "preliminary");
  });

  await t.test("exportCase includes HLA Observations when consensus present", async () => {
    const consensus = buildHlaConsensus();
    const caseRecord = buildMinimalCase({ hlaConsensus: consensus });
    const bundle = await exporter.exportCase(caseRecord);

    const observations = bundle.entry!.filter(
      (e) => e.resource.resourceType === "Observation",
    );
    assert.ok(observations.length >= 1, "should have HLA genotype observation(s)");

    // First observation should be a genotype observation with HLA alleles as components
    const genotypeObs = observations[0].resource as {
      component?: Array<{ valueCodeableConcept?: { coding: Array<{ display: string }> }; valueString?: string }>;
      meta?: { profile?: string[] };
    };
    assert.ok(genotypeObs.meta?.profile?.includes(
      "http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genotype",
    ), "should use FHIR Genomics Reporting genotype profile");
    assert.ok(genotypeObs.component, "genotype observation must have allele components");
    assert.strictEqual(genotypeObs.component!.length, 4, "should have 4 allele components");
  });

  await t.test("exportHlaConsensus returns Observations", async () => {
    const consensus = buildHlaConsensus();
    const observations = await exporter.exportHlaConsensus("case-fhir-001", consensus);

    assert.ok(Array.isArray(observations));
    assert.ok(observations.length >= 1);
    assert.strictEqual(observations[0].resourceType, "Observation");
    assert.strictEqual(observations[0].status, "final");
  });

  await t.test("FHIR Observations use LOINC coding where applicable", async () => {
    const consensus = buildHlaConsensus();
    const observations = await exporter.exportHlaConsensus("case-fhir-001", consensus);

    const obs = observations[0];
    const coding = obs.code.coding[0];
    assert.strictEqual(coding.system, "http://loinc.org");
    assert.ok(coding.code, "LOINC code must be present");
  });

  await t.test("exportCase handles missing HLA consensus gracefully", async () => {
    const caseRecord = buildMinimalCase({ hlaConsensus: undefined });
    const bundle = await exporter.exportCase(caseRecord);

    const observations = bundle.entry!.filter(
      (e) => e.resource.resourceType === "Observation",
    );
    assert.strictEqual(observations.length, 0, "no observations without HLA consensus");
  });
});
