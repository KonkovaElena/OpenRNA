import type { Express, RequestHandler } from "express";
import { parseRecordAdministrationInput, parseRecordClinicalFollowUpInput, parseRecordImmuneMonitoringInput } from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";

type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface OutcomeRouteDependencies {
  store: CaseStore;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerOutcomeRoutes(
  app: Express,
  { store, rbacProvider, consentGateMw, getRequiredRouteParam }: OutcomeRouteDependencies,
): void {
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
}