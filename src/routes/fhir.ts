import type { Express, Request, RequestHandler } from "express";
import { ApiError } from "../errors";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IFhirExporter } from "../ports/IFhirExporter";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";

type RouteParamResolver = (req: Request, name: string) => string;

interface FhirRouteDependencies {
  store: CaseStore;
  fhirExporter: IFhirExporter;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerFhirRoutes(
  app: Express,
  { store, fhirExporter, rbacProvider, consentGateMw, getRequiredRouteParam }: FhirRouteDependencies,
): void {
  app.get("/api/cases/:caseId/fhir/bundle", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      const bundle = await fhirExporter.exportCase(record);
      res.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/fhir/hla-consensus", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const record = await store.getCase(caseId);
      if (!record.hlaConsensus) {
        throw new ApiError(
          404,
          "not_found",
          "No HLA consensus recorded for this case.",
          "Record HLA consensus first via POST /api/cases/:caseId/hla-consensus.",
        );
      }
      const observations = await fhirExporter.exportHlaConsensus(caseId, record.hlaConsensus);
      res.json({ observations });
    } catch (error) {
      next(error);
    }
  });
}