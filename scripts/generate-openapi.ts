/**
 * Generate OpenAPI 3.1 specification from route definitions and Zod schemas.
 * Usage: npx tsx scripts/generate-openapi.ts > docs/openapi.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API_VERSION = "0.1.4";
const SERVER_URL = "http://localhost:3000";

interface PathOperation {
  summary: string;
  tags: string[];
  operationId: string;
  parameters?: Array<{
    name: string;
    in: "path" | "query";
    required: boolean;
    schema: { type: string };
  }>;
  requestBody?: {
    required: boolean;
    content: { "application/json": { schema: { $ref?: string; type?: string } } };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: { "application/json": { schema: { type: string; properties?: Record<string, unknown> } } };
    }
  >;
}

function caseIdParam() {
  return { name: "caseId", in: "path" as const, required: true, schema: { type: "string" } };
}

function runIdParam() {
  return { name: "runId", in: "path" as const, required: true, schema: { type: "string" } };
}

function caseResponse(description: string) {
  return {
    "200": {
      description,
      content: { "application/json": { schema: { type: "object", properties: { case: { type: "object" } } } } },
    },
    "400": { description: "Invalid input" },
    "404": { description: "Not found" },
    "409": { description: "Conflict / invalid transition" },
  };
}

function jsonBody(ref?: string) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: ref ? { $ref: `#/components/schemas/${ref}` } : { type: "object" as const },
      },
    },
  };
}

const paths: Record<string, Record<string, PathOperation>> = {
  // ─── Case CRUD ──────────────────────────────────────────────
  "/api/cases": {
    post: {
      summary: "Create a new oncology case",
      tags: ["Cases"],
      operationId: "createCase",
      requestBody: jsonBody("CreateCaseInput"),
      responses: caseResponse("Case created"),
    },
    get: {
      summary: "List all cases",
      tags: ["Cases"],
      operationId: "listCases",
      parameters: [
        { name: "limit", in: "query", required: false, schema: { type: "integer" } },
        { name: "offset", in: "query", required: false, schema: { type: "integer" } },
      ],
      responses: {
        "200": {
          description: "Paginated case list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { cases: { type: "array" }, totalCount: { type: "integer" } },
              },
            },
          },
        },
      },
    },
  },
  "/api/cases/{caseId}": {
    get: {
      summary: "Get a single case by ID",
      tags: ["Cases"],
      operationId: "getCase",
      parameters: [caseIdParam()],
      responses: caseResponse("Case details"),
    },
  },

  // ─── Sample & Artifact Registration ─────────────────────────
  "/api/cases/{caseId}/samples": {
    post: {
      summary: "Register a sample provenance record",
      tags: ["Samples"],
      operationId: "registerSample",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RegisterSampleInput"),
      responses: caseResponse("Sample registered"),
    },
  },
  "/api/cases/{caseId}/artifacts": {
    post: {
      summary: "Register a source artifact",
      tags: ["Artifacts"],
      operationId: "registerArtifact",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RegisterArtifactInput"),
      responses: caseResponse("Artifact registered"),
    },
  },

  // ─── Workflow Lifecycle ─────────────────────────────────────
  "/api/cases/{caseId}/workflows": {
    post: {
      summary: "Request a workflow run",
      tags: ["Workflows"],
      operationId: "requestWorkflow",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RequestWorkflowInput"),
      responses: caseResponse("Workflow requested"),
    },
  },
  "/api/cases/{caseId}/runs": {
    get: {
      summary: "List workflow runs for a case",
      tags: ["Workflows"],
      operationId: "listWorkflowRuns",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Workflow run list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/runs/{runId}": {
    get: {
      summary: "Get a single workflow run",
      tags: ["Workflows"],
      operationId: "getWorkflowRun",
      parameters: [caseIdParam(), runIdParam()],
      responses: {
        "200": {
          description: "Workflow run details",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Run not found" },
      },
    },
  },
  "/api/cases/{caseId}/runs/{runId}/start": {
    post: {
      summary: "Start a workflow run",
      tags: ["Workflows"],
      operationId: "startWorkflowRun",
      parameters: [caseIdParam(), runIdParam()],
      requestBody: jsonBody("StartWorkflowRunInput"),
      responses: caseResponse("Run started"),
    },
  },
  "/api/cases/{caseId}/runs/{runId}/complete": {
    post: {
      summary: "Complete a workflow run with derived artifacts",
      tags: ["Workflows"],
      operationId: "completeWorkflowRun",
      parameters: [caseIdParam(), runIdParam()],
      requestBody: jsonBody("CompleteWorkflowRunInput"),
      responses: caseResponse("Run completed"),
    },
  },
  "/api/cases/{caseId}/runs/{runId}/fail": {
    post: {
      summary: "Fail a workflow run",
      tags: ["Workflows"],
      operationId: "failWorkflowRun",
      parameters: [caseIdParam(), runIdParam()],
      requestBody: jsonBody("FailWorkflowRunInput"),
      responses: caseResponse("Run failed"),
    },
  },
  "/api/cases/{caseId}/runs/{runId}/cancel": {
    post: {
      summary: "Cancel a workflow run",
      tags: ["Workflows"],
      operationId: "cancelWorkflowRun",
      parameters: [caseIdParam(), runIdParam()],
      responses: caseResponse("Run cancelled"),
    },
  },

  // ─── HLA Consensus ─────────────────────────────────────────
  "/api/cases/{caseId}/hla-consensus": {
    post: {
      summary: "Record HLA consensus result",
      tags: ["HLA"],
      operationId: "recordHlaConsensus",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordHlaConsensusInput"),
      responses: caseResponse("HLA consensus recorded"),
    },
    get: {
      summary: "Get HLA consensus for a case",
      tags: ["HLA"],
      operationId: "getHlaConsensus",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "HLA consensus data",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },

  // ─── QC Gate ────────────────────────────────────────────────
  "/api/cases/{caseId}/runs/{runId}/qc": {
    post: {
      summary: "Evaluate QC gate for a completed run",
      tags: ["QC"],
      operationId: "evaluateQcGate",
      parameters: [caseIdParam(), runIdParam()],
      requestBody: jsonBody("EvaluateQcGateInput"),
      responses: caseResponse("QC gate evaluated"),
    },
    get: {
      summary: "Get QC gate result for a run",
      tags: ["QC"],
      operationId: "getQcGate",
      parameters: [caseIdParam(), runIdParam()],
      responses: {
        "200": {
          description: "QC gate result",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },

  // ─── Neoantigen Ranking & Construct Design ──────────────────
  "/api/cases/{caseId}/neoantigen-ranking": {
    post: {
      summary: "Record neoantigen ranking candidates",
      tags: ["Design"],
      operationId: "recordNeoantigenRanking",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordNeoantigenRankingInput"),
      responses: caseResponse("Ranking recorded"),
    },
    get: {
      summary: "Get neoantigen ranking for a case",
      tags: ["Design"],
      operationId: "getNeoantigenRanking",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Ranking result",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/construct-design": {
    post: {
      summary: "Design an mRNA construct from ranked candidates",
      tags: ["Design"],
      operationId: "designConstruct",
      parameters: [caseIdParam()],
      requestBody: jsonBody("DesignConstructInput"),
      responses: caseResponse("Construct designed"),
    },
    get: {
      summary: "Get construct design for a case",
      tags: ["Design"],
      operationId: "getConstructDesign",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Construct design package",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── Modalities ─────────────────────────────────────────────
  "/api/modalities": {
    get: {
      summary: "List all delivery modalities",
      tags: ["Modalities"],
      operationId: "listModalities",
      responses: {
        "200": {
          description: "Modality list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/modalities/{modality}": {
    get: {
      summary: "Get a specific delivery modality",
      tags: ["Modalities"],
      operationId: "getModality",
      parameters: [{ name: "modality", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": {
          description: "Modality details",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/modalities/{modality}/activate": {
    post: {
      summary: "Activate a delivery modality",
      tags: ["Modalities"],
      operationId: "activateModality",
      parameters: [{ name: "modality", in: "path", required: true, schema: { type: "string" } }],
      requestBody: jsonBody("ActivateModalityInput"),
      responses: {
        "200": {
          description: "Modality activated",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── Outcomes ───────────────────────────────────────────────
  "/api/cases/{caseId}/outcomes/administration": {
    post: {
      summary: "Record vaccine administration",
      tags: ["Outcomes"],
      operationId: "recordAdministration",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordAdministrationInput"),
      responses: caseResponse("Administration recorded"),
    },
  },
  "/api/cases/{caseId}/outcomes/immune-monitoring": {
    post: {
      summary: "Record immune monitoring data",
      tags: ["Outcomes"],
      operationId: "recordImmuneMonitoring",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordImmuneMonitoringInput"),
      responses: caseResponse("Immune monitoring recorded"),
    },
  },
  "/api/cases/{caseId}/outcomes/clinical-follow-up": {
    post: {
      summary: "Record clinical follow-up",
      tags: ["Outcomes"],
      operationId: "recordClinicalFollowUp",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordClinicalFollowUpInput"),
      responses: caseResponse("Clinical follow-up recorded"),
    },
  },
  "/api/cases/{caseId}/outcomes": {
    get: {
      summary: "Get outcome timeline for a case",
      tags: ["Outcomes"],
      operationId: "getOutcomeTimeline",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Outcome timeline",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/traceability": {
    get: {
      summary: "Get full traceability record",
      tags: ["Outcomes"],
      operationId: "getFullTraceability",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Full traceability record",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── Review & Board Packets ─────────────────────────────────
  "/api/cases/{caseId}/board-packets": {
    post: {
      summary: "Generate a board review packet",
      tags: ["Review"],
      operationId: "generateBoardPacket",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Board packet generated",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
    get: {
      summary: "List board packets for a case",
      tags: ["Review"],
      operationId: "listBoardPackets",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Board packet list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/board-packets/{packetId}": {
    get: {
      summary: "Get a specific board packet",
      tags: ["Review"],
      operationId: "getBoardPacket",
      parameters: [
        caseIdParam(),
        { name: "packetId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Board packet details",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },
  "/api/cases/{caseId}/review-outcomes": {
    post: {
      summary: "Record a review outcome",
      tags: ["Review"],
      operationId: "recordReviewOutcome",
      parameters: [caseIdParam()],
      requestBody: jsonBody("RecordReviewOutcomeInput"),
      responses: {
        "200": {
          description: "Review outcome recorded",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
    get: {
      summary: "List review outcomes for a case",
      tags: ["Review"],
      operationId: "listReviewOutcomes",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Review outcome list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/review-outcomes/{reviewId}": {
    get: {
      summary: "Get a specific review outcome",
      tags: ["Review"],
      operationId: "getReviewOutcome",
      parameters: [
        caseIdParam(),
        { name: "reviewId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Review outcome details",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },
  "/api/cases/{caseId}/final-releases": {
    post: {
      summary: "Authorize final release for manufacturing",
      tags: ["Review"],
      operationId: "authorizeFinalRelease",
      parameters: [caseIdParam()],
      requestBody: jsonBody("AuthorizeFinalReleaseInput"),
      responses: {
        "200": {
          description: "Final release authorized",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/handoff-packets": {
    post: {
      summary: "Generate a manufacturing handoff packet",
      tags: ["Review"],
      operationId: "generateHandoffPacket",
      parameters: [caseIdParam()],
      requestBody: jsonBody("GenerateHandoffPacketInput"),
      responses: {
        "200": {
          description: "Handoff packet generated",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
    get: {
      summary: "List handoff packets for a case",
      tags: ["Review"],
      operationId: "listHandoffPackets",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Handoff packet list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/handoff-packets/{handoffId}": {
    get: {
      summary: "Get a specific handoff packet",
      tags: ["Review"],
      operationId: "getHandoffPacket",
      parameters: [
        caseIdParam(),
        { name: "handoffId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Handoff packet details",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },

  // ─── Governance ─────────────────────────────────────────────
  "/api/reference-bundles": {
    get: {
      summary: "List all reference bundles",
      tags: ["Governance"],
      operationId: "listReferenceBundles",
      responses: {
        "200": {
          description: "Reference bundle list",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
    post: {
      summary: "Register a reference bundle",
      tags: ["Governance"],
      operationId: "registerBundle",
      requestBody: jsonBody("ReferenceBundleManifest"),
      responses: {
        "200": {
          description: "Bundle registered",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/reference-bundles/{bundleId}": {
    get: {
      summary: "Get a specific reference bundle",
      tags: ["Governance"],
      operationId: "getReferenceBundle",
      parameters: [{ name: "bundleId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": {
          description: "Reference bundle details",
          content: { "application/json": { schema: { type: "object" } } },
        },
        "404": { description: "Not found" },
      },
    },
  },
  "/api/operations/summary": {
    get: {
      summary: "Get operations summary with case status counts",
      tags: ["Governance"],
      operationId: "getOperationsSummary",
      responses: {
        "200": {
          description: "Operations summary",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/allowed-transitions": {
    get: {
      summary: "Get allowed state transitions for a case",
      tags: ["Governance"],
      operationId: "getAllowedTransitions",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Allowed transitions",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/validate-transition": {
    post: {
      summary: "Validate a proposed state transition",
      tags: ["Governance"],
      operationId: "validateTransition",
      parameters: [caseIdParam()],
      requestBody: jsonBody(),
      responses: {
        "200": {
          description: "Transition validation result",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/consent": {
    post: {
      summary: "Record a consent event",
      tags: ["Governance"],
      operationId: "recordConsentEvent",
      parameters: [caseIdParam()],
      requestBody: jsonBody("ConsentEventInput"),
      responses: caseResponse("Consent event recorded"),
    },
    get: {
      summary: "Get consent status for a case",
      tags: ["Governance"],
      operationId: "getConsentStatus",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Consent status",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/restart-from-revision": {
    post: {
      summary: "Restart a case from board revision",
      tags: ["Governance"],
      operationId: "restartFromRevision",
      parameters: [caseIdParam()],
      responses: caseResponse("Case restarted from revision"),
    },
  },
  "/api/cases/{caseId}/resolve-hla-review": {
    post: {
      summary: "Resolve an HLA review requirement",
      tags: ["Governance"],
      operationId: "resolveHlaReview",
      parameters: [caseIdParam()],
      requestBody: jsonBody(),
      responses: caseResponse("HLA review resolved"),
    },
  },
  "/api/cases/{caseId}/audit-chain/verify": {
    get: {
      summary: "Verify audit chain integrity for a case",
      tags: ["Audit"],
      operationId: "verifyAuditChain",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "Audit chain verification result",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── FHIR ──────────────────────────────────────────────────
  "/api/cases/{caseId}/fhir/bundle": {
    get: {
      summary: "Export case as FHIR Bundle",
      tags: ["FHIR"],
      operationId: "exportFhirBundle",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "FHIR Bundle",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/cases/{caseId}/fhir/hla-consensus": {
    get: {
      summary: "Export HLA consensus as FHIR Observation",
      tags: ["FHIR"],
      operationId: "exportFhirHlaConsensus",
      parameters: [caseIdParam()],
      responses: {
        "200": {
          description: "FHIR HLA consensus observation",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── Audit ──────────────────────────────────────────────────
  "/api/audit/sign": {
    post: {
      summary: "Sign an audit entry",
      tags: ["Audit"],
      operationId: "signAuditEntry",
      requestBody: jsonBody("AuditSignInput"),
      responses: {
        "200": {
          description: "Signed audit entry",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/audit/verify": {
    post: {
      summary: "Verify a signed audit entry",
      tags: ["Audit"],
      operationId: "verifyAuditEntry",
      requestBody: jsonBody("AuditVerifyInput"),
      responses: {
        "200": {
          description: "Verification result",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },

  // ─── System ─────────────────────────────────────────────────
  "/healthz": {
    get: {
      summary: "Health check",
      tags: ["System"],
      operationId: "healthCheck",
      responses: {
        "200": {
          description: "Service is healthy",
          content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" } } } } },
        },
      },
    },
  },
  "/readyz": {
    get: {
      summary: "Readiness probe",
      tags: ["System"],
      operationId: "readinessCheck",
      responses: {
        "200": {
          description: "Service is ready",
          content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" } } } } },
        },
        "503": { description: "Service is not ready" },
      },
    },
  },
  "/metrics": {
    get: {
      summary: "Prometheus-compatible metrics",
      tags: ["System"],
      operationId: "getMetrics",
      responses: {
        "200": {
          description: "Prometheus text format metrics",
          content: { "text/plain": { schema: { type: "string" } } },
        },
      },
    },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "OpenRNA Control Plane API",
    version: API_VERSION,
    description:
      "Control plane for personalized neoantigen RNA vaccine workflows. Manages oncology cases through sample registration, workflow orchestration, QC gating, board review, and manufacturing handoff.",
    license: { name: "Apache-2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    contact: { url: "https://github.com/KonkovaElena/OpenRNA" },
  },
  servers: [{ url: SERVER_URL, description: "Local development server" }],
  tags: [
    { name: "Cases", description: "Oncology case lifecycle management" },
    { name: "Samples", description: "Sample provenance registration" },
    { name: "Artifacts", description: "Source artifact cataloging" },
    { name: "Workflows", description: "Workflow request and run lifecycle" },
    { name: "HLA", description: "HLA consensus recording" },
    { name: "QC", description: "Quality control gate evaluation" },
    { name: "Design", description: "Neoantigen ranking and construct design" },
    { name: "Modalities", description: "Delivery modality management" },
    { name: "Outcomes", description: "Administration, immune monitoring, clinical follow-up" },
    { name: "Review", description: "Board review, final release, manufacturing handoff" },
    { name: "Governance", description: "Reference bundles, consent, state transitions" },
    { name: "Audit", description: "Audit chain integrity and digital signatures" },
    { name: "FHIR", description: "FHIR R4 export" },
    { name: "System", description: "Health, readiness, and metrics" },
  ],
  paths,
  components: {
    schemas: {
      CreateCaseInput: {
        type: "object",
        required: ["caseProfile"],
        properties: {
          caseProfile: {
            type: "object",
            required: ["patientKey", "indication", "siteId", "protocolVersion", "consentStatus"],
            properties: {
              patientKey: { type: "string" },
              indication: { type: "string" },
              siteId: { type: "string" },
              protocolVersion: { type: "string" },
              consentStatus: { type: "string", enum: ["granted", "pending", "withdrawn"] },
              boardRoute: { type: "string" },
            },
          },
        },
      },
      RegisterSampleInput: {
        type: "object",
        required: ["sampleId", "sampleType", "assayType", "accessionId", "sourceSite"],
        properties: {
          sampleId: { type: "string" },
          sampleType: { type: "string", enum: ["tumor_dna", "normal_dna", "tumor_rna"] },
          assayType: { type: "string", enum: ["WES", "WGS", "RNA-Seq", "Targeted-Panel"] },
          accessionId: { type: "string" },
          sourceSite: { type: "string" },
        },
      },
      RegisterArtifactInput: {
        type: "object",
        required: ["sampleId", "semanticType", "schemaVersion", "artifactHash"],
        properties: {
          sampleId: { type: "string" },
          semanticType: { type: "string" },
          schemaVersion: { type: "integer", minimum: 1 },
          artifactHash: { type: "string" },
          storageUri: { type: "string" },
          mediaType: { type: "string" },
        },
      },
      RequestWorkflowInput: {
        type: "object",
        required: ["workflowName", "referenceBundleId", "executionProfile"],
        properties: {
          workflowName: { type: "string" },
          referenceBundleId: { type: "string" },
          executionProfile: { type: "string" },
          requestedBy: { type: "string" },
          idempotencyKey: { type: "string" },
        },
      },
      ApiError: {
        type: "object",
        required: ["status", "code", "message", "nextStep"],
        properties: {
          status: { type: "integer" },
          code: { type: "string" },
          message: { type: "string" },
          nextStep: { type: "string" },
        },
      },
    },
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: [{ apiKey: [] }, { bearerAuth: [] }],
};

const output = JSON.stringify(spec, null, 2);
const outPath = join(process.cwd(), "docs", "openapi.json");

mkdirSync(join(process.cwd(), "docs"), { recursive: true });

writeFileSync(outPath, `${output}\n`, "utf8");
process.stdout.write(`OpenAPI 3.1 spec written to ${outPath} (${paths ? Object.keys(paths).length : 0} paths)\n`);
