import type { Express, RequestHandler } from "express";
import { ApiError } from "../errors";
import { parseConstructDesignInput, parseRecordNeoantigenRankingInput } from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IConstructDesigner } from "../ports/IConstructDesigner";
import type { INeoantigenRankingEngine } from "../ports/INeoantigenRankingEngine";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";
 
type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface DesignRouteDependencies {
  store: CaseStore;
  constructDesigner: IConstructDesigner;
  neoantigenRankingEngine: INeoantigenRankingEngine;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerDesignRoutes(
  app: Express,
  {
    store,
    constructDesigner,
    neoantigenRankingEngine,
    rbacProvider,
    consentGateMw,
    getRequiredRouteParam,
  }: DesignRouteDependencies,
): void {
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

  app.get("/api/cases/:caseId/neoantigen-ranking", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
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

  app.post("/api/cases/:caseId/construct-design", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseConstructDesignInput(req.body);
      const constructDesign = await constructDesigner.designConstruct({
        caseId,
        rankedCandidates: input.rankedCandidates,
        deliveryModality: input.deliveryModality,
        linkerStrategy: input.linkerStrategy,
      });
      const updated = await store.recordConstructDesign(caseId, constructDesign, correlationId);
      res.status(201).json({ case: updated, constructDesign });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/construct-design", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
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
}