import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import {
  parseActivateModalityInput,
  type CaseStore,
  MemoryCaseStore,
  parseCompleteWorkflowRunInput,
  parseConstructDesignInput,
  parseRecordNeoantigenRankingInput,
  parseFailWorkflowRunInput,
  parseGenerateHandoffPacketInput,
  parseRecordAdministrationInput,
  parseRecordClinicalFollowUpInput,
  parseRecordHlaConsensusInput,
  parseRecordImmuneMonitoringInput,
  parseRecordReviewOutcomeInput,
  parseEvaluateQcGateInput,
  parseRegisterBundleInput,
  parseWorkflowRunManifest,
} from "./store";
import type { IConstructDesigner } from "./ports/IConstructDesigner";
import type { IModalityRegistry } from "./ports/IModalityRegistry";
import type { IReferenceBundleRegistry } from "./ports/IReferenceBundleRegistry";
import type { IQcGateEvaluator } from "./ports/IQcGateEvaluator";
import type { IWorkflowRunner } from "./ports/IWorkflowRunner";
import type { IStateMachineGuard } from "./ports/IStateMachineGuard";
import type { IConsentTracker } from "./ports/IConsentTracker";
import type { IHlaConsensusProvider } from "./ports/IHlaConsensusProvider";
import type { INeoantigenRankingEngine } from "./ports/INeoantigenRankingEngine";
import type { IRbacProvider } from "./ports/IRbacProvider";
import type { IAuditSignatureProvider } from "./ports/IAuditSignatureProvider";
import type { IFhirExporter } from "./ports/IFhirExporter";
import { InMemoryConstructDesigner } from "./adapters/InMemoryConstructDesigner";
import { InMemoryHlaConsensusProvider } from "./adapters/InMemoryHlaConsensusProvider";
import { InMemoryModalityRegistry } from "./adapters/InMemoryModalityRegistry";
import { InMemoryNeoantigenRankingEngine } from "./adapters/InMemoryNeoantigenRankingEngine";
import { InMemoryReferenceBundleRegistry } from "./adapters/InMemoryReferenceBundleRegistry";
import { InMemoryQcGateEvaluator } from "./adapters/InMemoryQcGateEvaluator";
import { InMemoryWorkflowRunner } from "./adapters/InMemoryWorkflowRunner";
import { InMemoryStateMachineGuard } from "./adapters/InMemoryStateMachineGuard";
import { InMemoryConsentTracker } from "./adapters/InMemoryConsentTracker";
import { InMemoryRbacProvider } from "./adapters/InMemoryRbacProvider";
import { InMemoryAuditSignatureProvider } from "./adapters/InMemoryAuditSignatureProvider";
import { InMemoryFhirExporter } from "./adapters/InMemoryFhirExporter";
import type { JwtAuthOptions } from "./auth";
import type { DeliveryModality, RunArtifact, HlaConsensusRecord } from "./types";
import { authenticationContext } from "./middleware/auth-context";
import { requestLogger, type RequestLogWriter } from "./middleware/request-logger";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { rbacAuth } from "./middleware/rbac-auth";
import { requireActiveConsent } from "./middleware/consent-gate";

export interface AppDependencies {
  store?: CaseStore;
  constructDesigner?: IConstructDesigner;
  modalityRegistry?: IModalityRegistry;
  referenceBundleRegistry?: IReferenceBundleRegistry;
  qcGateEvaluator?: IQcGateEvaluator;
  hlaConsensusProvider?: IHlaConsensusProvider;
  neoantigenRankingEngine?: INeoantigenRankingEngine;
  workflowRunner?: IWorkflowRunner;
  stateMachineGuard?: IStateMachineGuard;
  consentTracker?: IConsentTracker;
  rbacProvider?: IRbacProvider;
  auditSignatureProvider?: IAuditSignatureProvider;
  fhirExporter?: IFhirExporter;
  apiKey?: string;
  apiKeyPrincipalId?: string;
  jwtAuthOptions?: JwtAuthOptions;
  rbacAllowAll?: boolean;
  /** When false, consent gate middleware is disabled (default: true). */
  consentGateEnabled?: boolean;
  requestLogWriter?: RequestLogWriter;
  enableRateLimiting?: boolean;
  rateLimitOptions?: import("./middleware/rate-limiter").RateLimiterOptions;
}

function getRequiredRouteParam(req: Request, name: string): string {
  const value = req.params[name];

  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    throw new ApiError(
      400,
      "invalid_input",
      `${name} is required in the request URL.`,
      `Provide a valid ${name} in the route path before retrying.`,
    );
  }

  throw new ApiError(
    400,
    "invalid_input",
    `${name} must be a single route path segment.`,
    `Provide a valid ${name} in the route path before retrying.`,
  );
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const modalityRegistry = dependencies.modalityRegistry ?? new InMemoryModalityRegistry();
  const constructDesigner = dependencies.constructDesigner ?? new InMemoryConstructDesigner(modalityRegistry);
  const workflowRunner = dependencies.workflowRunner ?? new InMemoryWorkflowRunner();
  const store = dependencies.store ?? new MemoryCaseStore();
  const referenceBundleRegistry = dependencies.referenceBundleRegistry ?? new InMemoryReferenceBundleRegistry();
  const qcGateEvaluator = dependencies.qcGateEvaluator ?? new InMemoryQcGateEvaluator();
  const hlaConsensusProvider = dependencies.hlaConsensusProvider ?? new InMemoryHlaConsensusProvider();
  const neoantigenRankingEngine = dependencies.neoantigenRankingEngine ?? new InMemoryNeoantigenRankingEngine();
  const stateMachineGuard = dependencies.stateMachineGuard ?? new InMemoryStateMachineGuard();
  const consentTracker = dependencies.consentTracker ?? new InMemoryConsentTracker();
  const consentGateEnabled = dependencies.consentGateEnabled !== false; // default: true
  const consentGateMw = consentGateEnabled ? requireActiveConsent(consentTracker) : (_req: Request, _res: Response, next: NextFunction) => next();
  const rbacProvider = dependencies.rbacProvider ?? new InMemoryRbacProvider({ allowAll: dependencies.rbacAllowAll });
  const auditSignatureProvider = dependencies.auditSignatureProvider ?? new InMemoryAuditSignatureProvider();
  const fhirExporter = dependencies.fhirExporter ?? new InMemoryFhirExporter();

  app.disable("x-powered-by");
  app.use(securityHeaders());
  app.use(express.json({ limit: "1mb" }));
  if (dependencies.enableRateLimiting) {
    app.use(rateLimiter(dependencies.rateLimitOptions));
  }
  app.use((req, res, next) => {
    const correlationId = req.header("x-correlation-id") ?? `corr_${randomUUID()}`;
    res.locals.correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    next();
  });

  app.use(requestLogger(dependencies.requestLogWriter));
  app.use(
    authenticationContext({
      apiKey: dependencies.apiKey,
      apiKeyPrincipalId: dependencies.apiKeyPrincipalId,
      jwt: dependencies.jwtAuthOptions,
    }),
  );

  app.get("/", (_req, res) => {
    res.json({
      name: "personalized-mrna-control-plane",
      status: "bootstrap-shell",
      message: "Human oncology control-plane bootstrap API is available.",
      api: [
        "POST /api/cases",
        "GET /api/cases",
        "GET /api/cases/:caseId",
        "POST /api/cases/:caseId/samples",
        "POST /api/cases/:caseId/artifacts",
        "POST /api/cases/:caseId/workflows",
        "POST /api/cases/:caseId/runs/:runId/start",
        "POST /api/cases/:caseId/runs/:runId/complete",
        "POST /api/cases/:caseId/runs/:runId/fail",
        "POST /api/cases/:caseId/runs/:runId/cancel",
        "GET /api/cases/:caseId/runs",
        "GET /api/cases/:caseId/runs/:runId",
        "POST /api/cases/:caseId/hla-consensus",
        "GET /api/cases/:caseId/hla-consensus",
        "POST /api/cases/:caseId/runs/:runId/qc",
        "GET /api/cases/:caseId/runs/:runId/qc",
        "POST /api/cases/:caseId/neoantigen-ranking",
        "GET /api/cases/:caseId/neoantigen-ranking",
        "POST /api/cases/:caseId/construct-design",
        "GET /api/cases/:caseId/construct-design",
        "GET /api/modalities",
        "GET /api/modalities/:modality",
        "POST /api/modalities/:modality/activate",
        "POST /api/cases/:caseId/outcomes/administration",
        "POST /api/cases/:caseId/outcomes/immune-monitoring",
        "POST /api/cases/:caseId/outcomes/clinical-follow-up",
        "GET /api/cases/:caseId/outcomes",
        "GET /api/cases/:caseId/traceability",
        "POST /api/cases/:caseId/board-packets",
        "GET /api/cases/:caseId/board-packets",
        "GET /api/cases/:caseId/board-packets/:packetId",
        "POST /api/cases/:caseId/review-outcomes",
        "GET /api/cases/:caseId/review-outcomes",
        "GET /api/cases/:caseId/review-outcomes/:reviewId",
        "POST /api/cases/:caseId/handoff-packets",
        "GET /api/cases/:caseId/handoff-packets",
        "GET /api/cases/:caseId/handoff-packets/:handoffId",
        "GET /api/reference-bundles",
        "GET /api/reference-bundles/:bundleId",
        "POST /api/reference-bundles",
        "GET /api/operations/summary",
        "GET /api/cases/:caseId/allowed-transitions",
        "POST /api/cases/:caseId/validate-transition",
        "POST /api/cases/:caseId/consent",
        "GET /api/cases/:caseId/consent",
        "GET /api/cases/:caseId/fhir/bundle",
        "GET /api/cases/:caseId/fhir/hla-consensus",
        "POST /api/audit/sign",
        "POST /api/audit/verify",
        "GET /healthz",
        "GET /readyz",
        "GET /metrics",
      ],
    });
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ready" });
  });

  app.get("/metrics", async (_req, res, next) => {
    try {
      const summary = await store.getOperationsSummary();
      const lines = [
        "# HELP human_mrna_cases_total Total cases in the workflow store",
        "# TYPE human_mrna_cases_total gauge",
        `human_mrna_cases_total ${summary.totalCases}`,
        "# HELP human_mrna_cases_by_status Cases by control-plane status",
        "# TYPE human_mrna_cases_by_status gauge",
        ...Object.entries(summary.statusCounts).map(
          ([status, count]) => `human_mrna_cases_by_status{status=\"${status}\"} ${count}`,
        ),
      ];

      res.type("text/plain").send(`${lines.join("\n")}\n`);
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Wave 14: Modality Governance в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.get("/api/modalities", async (_req, res, next) => {
    try {
      const modalities = await modalityRegistry.listModalities();
      res.json({ modalities });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/modalities/:modality", async (req, res, next) => {
    try {
      const modality = await modalityRegistry.getModality(req.params.modality as DeliveryModality);
      res.json({ modality });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/modalities/:modality/activate", async (req, res, next) => {
    try {
      const input = parseActivateModalityInput(req.body);
      const modality = await modalityRegistry.activateModality(
        req.params.modality as DeliveryModality,
        input.activationReason,
      );
      res.json({ modality });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases", rbacAuth(rbacProvider, "CREATE_CASE"), async (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      res.status(201).json({ case: await store.createCase(req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const { cases, totalCount } = await store.listCases({ limit, offset });
      res.json({
        cases,
        meta: {
          totalCases: totalCount,
          limit,
          offset,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      res.json({ case: await store.getCase(caseId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/samples", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      res.json({ case: await store.registerSample(caseId, req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/artifacts", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      res.json({ case: await store.registerArtifact(caseId, req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/workflows", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const workflowRequestBody =
        typeof req.body === "object" && req.body !== null
          ? { ...(req.body as Record<string, unknown>) }
          : {};
      const idempotencyKey = req.header("x-idempotency-key");

      if (idempotencyKey) {
        workflowRequestBody.idempotencyKey = idempotencyKey;
      }

      const requestedBundleId = workflowRequestBody.referenceBundleId;
      if (typeof requestedBundleId !== "string" || requestedBundleId.trim().length === 0) {
        throw new ApiError(
          400,
          "invalid_input",
          "referenceBundleId is required.",
          "Choose a valid bundleId from GET /api/reference-bundles before requesting a workflow.",
        );
      }

      const referenceBundle = await referenceBundleRegistry.getBundle(requestedBundleId);
      if (!referenceBundle) {
        throw new ApiError(
          404,
          "reference_bundle_not_found",
          "Reference bundle not found for workflow request.",
          "Use a valid bundleId from GET /api/reference-bundles before requesting a workflow.",
        );
      }

      const correlationId = String(res.locals.correlationId ?? "");
      const updated = await store.requestWorkflow(caseId, workflowRequestBody, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Phase 2: Workflow Run Lifecycle в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/runs/:runId/start", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const correlationId = String(res.locals.correlationId ?? "");
      const currentCase = await store.getCase(caseId);
      const latestRequest = currentCase.workflowRequests[currentCase.workflowRequests.length - 1];

      if (!latestRequest?.referenceBundleId) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Case must have a requested workflow and reference bundle before starting a run.",
          "Request a workflow before starting a run.",
        );
      }

      const pinnedReferenceBundle = await referenceBundleRegistry.getBundle(latestRequest.referenceBundleId);
      if (!pinnedReferenceBundle) {
        throw new ApiError(
          404,
          "reference_bundle_not_found",
          "Reference bundle not found for workflow start.",
          "Use a valid bundleId from GET /api/reference-bundles before starting the workflow.",
        );
      }

      const startedRun = await workflowRunner.startRun({
        runId,
        caseId,
        requestId: latestRequest.requestId,
        workflowName: latestRequest.workflowName,
        referenceBundleId: latestRequest.referenceBundleId,
        executionProfile: latestRequest.executionProfile,
        ...(req.body.manifest ? { manifest: parseWorkflowRunManifest(req.body.manifest) } : {}),
      });

      const updated = await store.startWorkflowRun(
        caseId,
        {
          ...startedRun,
          runId,
          caseId,
          requestId: latestRequest.requestId,
          workflowName: latestRequest.workflowName,
          referenceBundleId: latestRequest.referenceBundleId,
          executionProfile: latestRequest.executionProfile,
          pinnedReferenceBundle: startedRun.pinnedReferenceBundle ?? pinnedReferenceBundle,
        },
        correlationId,
      );
      const persistedRun = updated.workflowRuns.find((run) => run.runId === runId);
      if (persistedRun) {
        referenceBundleRegistry.pinBundle(persistedRun.referenceBundleId, persistedRun.runId);
      }
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/runs/:runId/complete", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseCompleteWorkflowRunInput(req.body);
      const completedRun = await workflowRunner.completeRun(runId, input.derivedArtifacts ?? []);
      const terminalAt = completedRun.completedAt ?? new Date().toISOString();
      const derivedArtifacts: RunArtifact[] = (input.derivedArtifacts ?? []).map((a) => ({
        artifactId: `art_${randomUUID()}`,
        runId,
        artifactClass: "DERIVED" as const,
        semanticType: a.semanticType,
        artifactHash: a.artifactHash,
        producingStep: a.producingStep,
        registeredAt: terminalAt,
      }));
      const updated = await store.completeWorkflowRun(
        caseId,
        {
          ...completedRun,
          runId,
          caseId,
          completedAt: terminalAt,
        },
        derivedArtifacts,
        correlationId,
      );
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/runs/:runId/fail", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseFailWorkflowRunInput(req.body);
      const failedRun = await workflowRunner.failRun(runId, input.reason, input.failureCategory);
      const updated = await store.failWorkflowRun(
        caseId,
        {
          ...failedRun,
          runId,
          caseId,
          failureReason: failedRun.failureReason ?? input.reason,
          completedAt: failedRun.completedAt ?? new Date().toISOString(),
        },
        correlationId,
      );
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/runs/:runId/cancel", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const correlationId = String(res.locals.correlationId ?? "");
      const cancelledRun = await workflowRunner.cancelRun(runId);
      const updated = await store.cancelWorkflowRun(
        caseId,
        {
          ...cancelledRun,
          runId,
          caseId,
          completedAt: cancelledRun.completedAt ?? new Date().toISOString(),
        },
        correlationId,
      );
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runs = await store.listWorkflowRuns(caseId);
      res.json({ runs, meta: { totalRuns: runs.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs/:runId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const run = await store.getWorkflowRun(caseId, runId);
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Phase 2: HLA Consensus в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/hla-consensus", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordHlaConsensusInput(req.body);
      const derivedConsensus = await hlaConsensusProvider.produceConsensus(
        caseId,
        input.perToolEvidence,
        input.referenceVersion,
      );
      const consensus: HlaConsensusRecord = {
        caseId,
        alleles: input.alleles,
        perToolEvidence: input.perToolEvidence,
        confidenceScore: input.confidenceScore,
        tieBreakNotes: input.tieBreakNotes,
        referenceVersion: input.referenceVersion,
        producedAt: derivedConsensus.producedAt,
        disagreements: derivedConsensus.disagreements,
        confidenceDecomposition: derivedConsensus.confidenceDecomposition,
      };
      const updated = await store.recordHlaConsensus(caseId, consensus, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/hla-consensus", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const consensus = await store.getHlaConsensus(caseId);
      if (!consensus) {
        throw new ApiError(404, "not_found", "No HLA consensus found for this case.", "Record HLA consensus first.");
      }
      res.json({ consensus });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Phase 2: QC Gate в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/runs/:runId/qc", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseEvaluateQcGateInput(req.body);
      const gate = await qcGateEvaluator.evaluate(runId, input);
      const updated = await store.recordQcGate(caseId, runId, gate, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs/:runId/qc", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const gate = await store.getQcGate(caseId, runId);
      if (!gate) {
        throw new ApiError(404, "not_found", "No QC gate found for this run.", "Evaluate QC gate first.");
      }
      res.json({ gate });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Wave 8: Neoantigen Ranking в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/neoantigen-ranking", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordNeoantigenRankingInput(req.body);
      const ranking = await neoantigenRankingEngine.rank(caseId, input.candidates);
      const updated = await store.recordNeoantigenRanking(caseId, ranking, correlationId);
      res.status(201).json({ case: updated, ranking });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/neoantigen-ranking", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const ranking = await store.getNeoantigenRanking(caseId);
      if (!ranking) {
        throw new ApiError(404, "not_found", "No neoantigen ranking found for this case.", "Generate neoantigen ranking first.");
      }
      res.json({ ranking });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Wave 9: Construct Design в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/construct-design", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseConstructDesignInput(req.body);
      const constructDesign = await constructDesigner.designConstruct({
        caseId,
        rankedCandidates: input.rankedCandidates,
        deliveryModality: input.deliveryModality,
      });
      const updated = await store.recordConstructDesign(caseId, constructDesign, correlationId);
      res.status(201).json({ case: updated, constructDesign });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/construct-design", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const constructDesign = await store.getConstructDesign(caseId);
      if (!constructDesign) {
        throw new ApiError(404, "not_found", "No construct design found for this case.", "Generate a construct design first.");
      }
      res.json({ constructDesign });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Wave 13: Outcome HTTP Surfaces в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/outcomes/administration", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordAdministrationInput(req.body);
      const administration = {
        ...input,
        caseId,
      };
      const updated = await store.recordAdministration(caseId, administration, correlationId);
      res.status(201).json({ case: updated, administration });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/outcomes/immune-monitoring", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordImmuneMonitoringInput(req.body);
      const immuneMonitoring = {
        ...input,
        caseId,
      };
      const updated = await store.recordImmuneMonitoring(caseId, immuneMonitoring, correlationId);
      res.status(201).json({ case: updated, immuneMonitoring });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/outcomes/clinical-follow-up", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordClinicalFollowUpInput(req.body);
      const clinicalFollowUp = {
        ...input,
        caseId,
      };
      const updated = await store.recordClinicalFollowUp(caseId, clinicalFollowUp, correlationId);
      res.status(201).json({ case: updated, clinicalFollowUp });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/outcomes", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const timeline = await store.getOutcomeTimeline(caseId);
      res.json({ timeline, meta: { totalEntries: timeline.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/traceability", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const traceability = await store.getFullTraceability(caseId);
      res.json({ traceability });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Phase 2: Multidisciplinary Review Packets в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/board-packets", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const result = await store.generateBoardPacket(caseId, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        packet: result.packet,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const packets = await store.listBoardPackets(caseId);
      res.json({ packets, meta: { totalPackets: packets.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets/:packetId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const packetId = getRequiredRouteParam(req, "packetId");
      const packet = await store.getBoardPacket(caseId, packetId);
      res.json({ packet });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/review-outcomes", rbacAuth(rbacProvider, "APPROVE_REVIEW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordReviewOutcomeInput(req.body);
      const result = await store.recordReviewOutcome(caseId, input, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        reviewOutcome: result.reviewOutcome,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/review-outcomes", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const reviewOutcomes = await store.listReviewOutcomes(caseId);
      res.json({ reviewOutcomes, meta: { totalReviewOutcomes: reviewOutcomes.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/review-outcomes/:reviewId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const reviewId = getRequiredRouteParam(req, "reviewId");
      const reviewOutcome = await store.getReviewOutcome(caseId, reviewId);
      res.json({ reviewOutcome });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/handoff-packets", rbacAuth(rbacProvider, "APPROVE_REVIEW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseGenerateHandoffPacketInput(req.body);
      const result = await store.generateHandoffPacket(caseId, input, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        handoff: result.handoff,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/handoff-packets", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const handoffs = await store.listHandoffPackets(caseId);
      res.json({ handoffs, meta: { totalHandoffs: handoffs.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/handoff-packets/:handoffId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const handoffId = getRequiredRouteParam(req, "handoffId");
      const handoff = await store.getHandoffPacket(caseId, handoffId);
      res.json({ handoff });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Phase 2: Reference Bundle Registry в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.get("/api/reference-bundles", rbacAuth(rbacProvider, "VIEW_CASE"), async (_req, res, next) => {
    try {
      const bundles = await referenceBundleRegistry.listBundles();
      res.json({ bundles, meta: { totalBundles: bundles.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reference-bundles/:bundleId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const bundleId = getRequiredRouteParam(req, "bundleId");
      const bundle = await referenceBundleRegistry.getBundle(bundleId);
      if (!bundle) {
        throw new ApiError(404, "not_found", "Reference bundle not found.", "Use a valid bundleId from GET /api/reference-bundles.");
      }
      res.json({ bundle });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reference-bundles", rbacAuth(rbacProvider, "ADMIN_OPERATIONS"), async (req, res, next) => {
    try {
      const input = parseRegisterBundleInput(req.body);
      const bundle = await referenceBundleRegistry.registerBundle(input);
      res.status(201).json({ bundle });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/operations/summary", rbacAuth(rbacProvider, "VIEW_CASE"), async (_req, res, next) => {
    try {
      res.json({ summary: await store.getOperationsSummary() });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ State Machine Guard API в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.get("/api/cases/:caseId/allowed-transitions", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      const allowed = stateMachineGuard.getAllowedTransitions(record.status);
      res.json({ caseId, currentStatus: record.status, allowedTransitions: allowed });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/validate-transition", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      const targetStatus = req.body?.targetStatus;
      if (!targetStatus) {
        throw new ApiError(400, "missing_field", "targetStatus is required.", "Provide a valid CaseStatus in the request body.");
      }
      const result = await stateMachineGuard.validateTransition(caseId, record.status, targetStatus);
      res.json({ caseId, fromStatus: record.status, toStatus: targetStatus, ...result });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Consent Tracking API в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/cases/:caseId/consent", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const event = req.body;
      const CONSENT_TYPES = ["granted", "withdrawn", "renewed"] as const;
      if (!event?.type || !CONSENT_TYPES.includes(event.type) || !event?.scope || !event?.version) {
        throw new ApiError(400, "invalid_input", "Consent event requires type (granted|withdrawn|renewed), scope, and version.", "Provide a valid consent event.");
      }
      const consentEvent = {
        type: event.type,
        timestamp: event.timestamp ?? new Date().toISOString(),
        scope: event.scope,
        version: event.version,
        witnessId: event.witnessId,
        notes: event.notes,
      };
      await consentTracker.recordConsent(caseId, consentEvent);
      res.status(201).json({ recorded: true, event: consentEvent });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/consent", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const history = await consentTracker.getConsentHistory(caseId);
      const active = await consentTracker.isConsentActive(caseId);
      res.json({ caseId, consentActive: active, history });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ FHIR Export API в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.get("/api/cases/:caseId/fhir/bundle", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      const bundle = await fhirExporter.exportCase(record);
      res.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/fhir/hla-consensus", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      if (!record.hlaConsensus) {
        throw new ApiError(404, "not_found", "No HLA consensus recorded for this case.", "Record HLA consensus first via POST /api/cases/:caseId/hla-consensus.");
      }
      const observations = await fhirExporter.exportHlaConsensus(caseId, record.hlaConsensus);
      res.json({ observations });
    } catch (error) {
      next(error);
    }
  });

  // в”Ђв”Ђв”Ђ Audit Signature API в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  app.post("/api/audit/sign", rbacAuth(rbacProvider, "ADMIN_OPERATIONS"), async (req, res, next) => {
    try {
      const { entry, principal } = req.body;
      if (!entry || !principal) {
        throw new ApiError(400, "invalid_input", "Both entry and principal are required.", "Provide an audit entry and signing principal.");
      }
      const signed = await auditSignatureProvider.signAuditEntry(entry, principal);
      res.status(201).json({ signedEntry: signed });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/audit/verify", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const { entry } = req.body;
      if (!entry) {
        throw new ApiError(400, "invalid_input", "Signed entry is required.", "Provide a signed audit entry to verify.");
      }
      const valid = await auditSignatureProvider.verifySignature(entry);
      res.json({ valid });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const correlationId = String(res.locals.correlationId ?? "");

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        nextStep: error.nextStep,
        correlationId,
      });
      return;
    }

    res.status(500).json({
      code: "internal_error",
      message: "Internal server error.",
      nextStep: "Retry the request or inspect server logs.",
      correlationId,
    });
  });

  return app;
}
