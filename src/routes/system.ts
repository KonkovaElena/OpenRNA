import type { Express, NextFunction, Request, Response } from "express";
import type { CaseStore } from "../store";

const API_SURFACE = [
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
];

export function registerSystemRoutes(app: Express, store: CaseStore): void {
  app.get("/", (_req, res) => {
    res.json({
      name: "OpenRNA",
      status: "bootstrap-shell",
      message: "OpenRNA bootstrap API is available.",
      api: API_SURFACE,
    });
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ready" });
  });

  app.get("/metrics", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await store.getOperationsSummary();
      const lines = [
        "# HELP openrna_cases_total Total cases in the workflow store",
        "# TYPE openrna_cases_total gauge",
        `openrna_cases_total ${summary.totalCases}`,
        "# HELP openrna_cases_by_status Cases by control-plane status",
        "# TYPE openrna_cases_by_status gauge",
        ...Object.entries(summary.statusCounts).map(
          ([status, count]) => `openrna_cases_by_status{status=\"${status}\"} ${count}`,
        ),
      ];

      res.type("text/plain").send(`${lines.join("\n")}\n`);
    } catch (error) {
      next(error);
    }
  });
}
