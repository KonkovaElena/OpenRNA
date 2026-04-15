import type { Express, RequestHandler } from "express";
import { ApiError } from "../errors";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IConsentTracker } from "../ports/IConsentTracker";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { IReferenceBundleRegistry } from "../ports/IReferenceBundleRegistry";
import type { IStateMachineGuard } from "../ports/IStateMachineGuard";
import { parseRegisterBundleInput } from "../store";
import type { CaseStore } from "../store";
import { parseConsentEventInput } from "../validation";

type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface GovernanceRouteDependencies {
  store: CaseStore;
  referenceBundleRegistry: IReferenceBundleRegistry;
  stateMachineGuard: IStateMachineGuard;
  consentTracker: IConsentTracker;
  rbacProvider: IRbacProvider;
  getRequiredRouteParam: RouteParamResolver;
}

const CONSENT_TYPES = ["granted", "withdrawn", "renewed"] as const;

export function registerGovernanceRoutes(
  app: Express,
  {
    store,
    referenceBundleRegistry,
    stateMachineGuard,
    consentTracker,
    rbacProvider,
    getRequiredRouteParam,
  }: GovernanceRouteDependencies,
): void {
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

  app.post("/api/cases/:caseId/consent", rbacAuth(rbacProvider, "REGISTER_SAMPLE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const input = parseConsentEventInput(req.body);
      const consentEvent = {
        type: input.type,
        timestamp: input.timestamp ?? new Date().toISOString(),
        scope: input.scope,
        version: input.version,
        witnessId: input.witnessId,
        notes: input.notes,
      };
      await consentTracker.recordConsent(caseId, consentEvent);
      // Synchronize caseProfile.consentStatus so deriveCaseStatus re-evaluates
      const newConsentStatus = input.type === "withdrawn" ? "missing" as const : "complete" as const;
      const correlationId = String(res.locals.correlationId ?? "");
      const updated = await store.syncConsentStatus(caseId, newConsentStatus, correlationId);
      res.status(201).json({ recorded: true, event: consentEvent, case: updated });
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

  app.post("/api/cases/:caseId/restart-from-revision", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const updated = await store.restartFromRevision(caseId, correlationId);
      res.json({ case: updated });
    } catch (error) {
      next(error);
    }
  });
}