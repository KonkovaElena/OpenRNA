import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import {
  type CaseStore,
  MemoryCaseStore,
  parseStartWorkflowRunInput,
  parseCompleteWorkflowRunInput,
  parseFailWorkflowRunInput,
  parseRecordHlaConsensusInput,
  parseEvaluateQcGateInput,
} from "./store";
import type { IReferenceBundleRegistry } from "./ports/IReferenceBundleRegistry";
import { InMemoryReferenceBundleRegistry } from "./adapters/InMemoryReferenceBundleRegistry";
import type { RunArtifact, HlaConsensusRecord } from "./types";

export interface AppDependencies {
  store?: CaseStore;
  referenceBundleRegistry?: IReferenceBundleRegistry;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const store = dependencies.store ?? new MemoryCaseStore();
  const referenceBundleRegistry = dependencies.referenceBundleRegistry ?? new InMemoryReferenceBundleRegistry();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const correlationId = req.header("x-correlation-id") ?? `corr_${randomUUID()}`;
    res.locals.correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    next();
  });

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
        "GET /api/cases/:caseId/runs",
        "GET /api/cases/:caseId/runs/:runId",
        "POST /api/cases/:caseId/hla-consensus",
        "GET /api/cases/:caseId/hla-consensus",
        "POST /api/cases/:caseId/runs/:runId/qc",
        "GET /api/cases/:caseId/runs/:runId/qc",
        "POST /api/cases/:caseId/board-packets",
        "GET /api/cases/:caseId/board-packets",
        "GET /api/cases/:caseId/board-packets/:packetId",
        "GET /api/reference-bundles",
        "GET /api/reference-bundles/:bundleId",
        "GET /api/operations/summary",
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

  app.get("/metrics", (_req, res) => {
    const summary = store.getOperationsSummary();
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
  });

  app.post("/api/cases", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      res.status(201).json({ case: store.createCase(req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases", (_req, res) => {
    const cases = store.listCases();
    res.json({
      cases,
      meta: {
        totalCases: cases.length,
      },
    });
  });

  app.get("/api/cases/:caseId", (req, res, next) => {
    try {
      res.json({ case: store.getCase(req.params.caseId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/samples", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      res.json({ case: store.registerSample(req.params.caseId, req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/artifacts", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      res.json({ case: store.registerArtifact(req.params.caseId, req.body, correlationId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/workflows", async (req, res, next) => {
    try {
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
      const updated = await store.requestWorkflow(req.params.caseId, workflowRequestBody, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 2: Workflow Run Lifecycle ──────────────────────────────

  app.post("/api/cases/:caseId/runs/:runId/start", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const updated = store.startWorkflowRun(req.params.caseId, req.params.runId, correlationId);
      const startedRun = updated.workflowRuns.find((run) => run.runId === req.params.runId);
      if (startedRun) {
        referenceBundleRegistry.pinBundle(startedRun.referenceBundleId, startedRun.runId);
      }
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/runs/:runId/complete", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseCompleteWorkflowRunInput(req.body);
      const clock = new Date().toISOString();
      const derivedArtifacts: RunArtifact[] = (input.derivedArtifacts ?? []).map((a) => ({
        artifactId: `art_${randomUUID()}`,
        runId: req.params.runId,
        artifactClass: "DERIVED" as const,
        semanticType: a.semanticType,
        artifactHash: a.artifactHash,
        producingStep: a.producingStep,
        registeredAt: clock,
      }));
      const updated = store.completeWorkflowRun(req.params.caseId, req.params.runId, derivedArtifacts, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/runs/:runId/fail", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseFailWorkflowRunInput(req.body);
      const updated = store.failWorkflowRun(req.params.caseId, req.params.runId, input.reason, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs", (req, res, next) => {
    try {
      const runs = store.listWorkflowRuns(req.params.caseId);
      res.json({ runs, meta: { totalRuns: runs.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs/:runId", (req, res, next) => {
    try {
      const run = store.getWorkflowRun(req.params.caseId, req.params.runId);
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 2: HLA Consensus ──────────────────────────────────────

  app.post("/api/cases/:caseId/hla-consensus", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordHlaConsensusInput(req.body);
      const consensus: HlaConsensusRecord = {
        caseId: req.params.caseId,
        alleles: input.alleles,
        perToolEvidence: input.perToolEvidence,
        confidenceScore: input.confidenceScore,
        tieBreakNotes: input.tieBreakNotes,
        referenceVersion: input.referenceVersion,
        producedAt: new Date().toISOString(),
      };
      const updated = store.recordHlaConsensus(req.params.caseId, consensus, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/hla-consensus", (req, res, next) => {
    try {
      const consensus = store.getHlaConsensus(req.params.caseId);
      if (!consensus) {
        throw new ApiError(404, "not_found", "No HLA consensus found for this case.", "Record HLA consensus first.");
      }
      res.json({ consensus });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 2: QC Gate ────────────────────────────────────────────

  app.post("/api/cases/:caseId/runs/:runId/qc", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseEvaluateQcGateInput(req.body);
      const allPassed = input.results.every((r) => r.pass);
      const hasWarnNotes = input.results.some((r) => !r.pass === false && r.notes);
      const outcome = allPassed
        ? (hasWarnNotes ? "WARN" : "PASSED")
        : "FAILED";
      const gate = {
        runId: req.params.runId,
        outcome: outcome as "PASSED" | "FAILED" | "WARN",
        results: input.results,
        evaluatedAt: new Date().toISOString(),
      };
      const updated = store.recordQcGate(req.params.caseId, req.params.runId, gate, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/runs/:runId/qc", (req, res, next) => {
    try {
      const gate = store.getQcGate(req.params.caseId, req.params.runId);
      if (!gate) {
        throw new ApiError(404, "not_found", "No QC gate found for this run.", "Evaluate QC gate first.");
      }
      res.json({ gate });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 2: Multidisciplinary Review Packets ───────────────────

  app.post("/api/cases/:caseId/board-packets", (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const result = store.generateBoardPacket(req.params.caseId, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        packet: result.packet,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets", (req, res, next) => {
    try {
      const packets = store.listBoardPackets(req.params.caseId);
      res.json({ packets, meta: { totalPackets: packets.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets/:packetId", (req, res, next) => {
    try {
      const packet = store.getBoardPacket(req.params.caseId, req.params.packetId);
      res.json({ packet });
    } catch (error) {
      next(error);
    }
  });

  // ─── Phase 2: Reference Bundle Registry ──────────────────────────

  app.get("/api/reference-bundles", async (_req, res, next) => {
    try {
      const bundles = await referenceBundleRegistry.listBundles();
      res.json({ bundles, meta: { totalBundles: bundles.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reference-bundles/:bundleId", async (req, res, next) => {
    try {
      const bundle = await referenceBundleRegistry.getBundle(req.params.bundleId);
      if (!bundle) {
        throw new ApiError(404, "not_found", "Reference bundle not found.", "Use a valid bundleId from GET /api/reference-bundles.");
      }
      res.json({ bundle });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/operations/summary", (_req, res) => {
    res.json({ summary: store.getOperationsSummary() });
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