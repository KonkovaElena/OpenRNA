import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { ApiError } from "../errors";
import {
  parseCompleteWorkflowRunInput,
  parseEvaluateQcGateInput,
  parseFailWorkflowRunInput,
  parseRecordHlaConsensusInput,
  parseWorkflowRunManifest,
} from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IHlaConsensusProvider } from "../ports/IHlaConsensusProvider";
import type { IQcGateEvaluator } from "../ports/IQcGateEvaluator";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { IReferenceBundleRegistry } from "../ports/IReferenceBundleRegistry";
import type { IWorkflowRunner } from "../ports/IWorkflowRunner";
import type { HlaConsensusRecord, RunArtifact } from "../types";
import type { CaseStore } from "../store";

type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface WorkflowRouteDependencies {
  store: CaseStore;
  workflowRunner: IWorkflowRunner;
  referenceBundleRegistry: IReferenceBundleRegistry;
  qcGateEvaluator: IQcGateEvaluator;
  hlaConsensusProvider: IHlaConsensusProvider;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerWorkflowRoutes(
  app: Express,
  {
    store,
    workflowRunner,
    referenceBundleRegistry,
    qcGateEvaluator,
    hlaConsensusProvider,
    rbacProvider,
    consentGateMw,
    getRequiredRouteParam,
  }: WorkflowRouteDependencies,
): void {
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
      const derivedArtifacts: RunArtifact[] = (input.derivedArtifacts ?? []).map((artifact) => ({
        artifactId: `art_${randomUUID()}`,
        runId,
        artifactClass: "DERIVED" as const,
        semanticType: artifact.semanticType,
        artifactHash: artifact.artifactHash,
        producingStep: artifact.producingStep,
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

  app.get("/api/cases/:caseId/runs", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runs = await store.listWorkflowRuns(caseId);
      res.json({ runs, meta: { totalRuns: runs.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs/:runId", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const runId = getRequiredRouteParam(req, "runId");
      const run = await store.getWorkflowRun(caseId, runId);
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/hla-consensus", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordHlaConsensusInput(req.body);
      const derivedConsensus = await hlaConsensusProvider.produceConsensus(
        caseId,
        input.perToolEvidence,
        input.referenceVersion,
        input.operatorReviewThreshold,
      );
      const consensus: HlaConsensusRecord = {
        caseId,
        alleles: input.alleles,
        perToolEvidence: input.perToolEvidence,
        confidenceScore: input.confidenceScore,
        operatorReviewThreshold: derivedConsensus.operatorReviewThreshold,
        unresolvedDisagreementCount: derivedConsensus.unresolvedDisagreementCount,
        manualReviewRequired: derivedConsensus.manualReviewRequired,
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

  app.get("/api/cases/:caseId/hla-consensus", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
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

  app.get("/api/cases/:caseId/runs/:runId/qc", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
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
}