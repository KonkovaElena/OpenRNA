import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import { resolveAppDependencies, type AppDependencies } from "./bootstrap/app-dependencies";
import { authenticationContext } from "./middleware/auth-context";
import { requestLogger, type RequestLogWriter } from "./middleware/request-logger";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { rbacAuth } from "./middleware/rbac-auth";
import { caseAccessAuth } from "./middleware/case-access-auth";
import { registerSystemRoutes } from "./routes/system";
import { registerModalityRoutes } from "./routes/modalities";
import { registerFhirRoutes } from "./routes/fhir";
import { registerAuditRoutes } from "./routes/audit";
import { registerReviewRoutes } from "./routes/review";
import { registerDesignRoutes } from "./routes/design";
import { registerGovernanceRoutes } from "./routes/governance";
import { registerOutcomeRoutes } from "./routes/outcomes";
import { registerWorkflowRoutes } from "./routes/workflow";

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
  const {
    modalityRegistry,
    constructDesigner,
    workflowRunner,
    store,
    referenceBundleRegistry,
    qcGateEvaluator,
    hlaConsensusProvider,
    neoantigenRankingEngine,
    stateMachineGuard,
    consentTracker,
    consentGateMw,
    rbacProvider,
    caseAccessStore,
    auditSignatureProvider,
    fhirExporter,
    readinessCheck,
  } = resolveAppDependencies(dependencies);

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

  app.use("/api/cases/:caseId", caseAccessAuth(caseAccessStore, rbacProvider));

  registerSystemRoutes(app, store, readinessCheck);
  registerModalityRoutes(app, modalityRegistry);
  registerFhirRoutes(app, { store, fhirExporter, rbacProvider, consentGateMw, getRequiredRouteParam });
  registerAuditRoutes(app, { rbacProvider, auditSignatureProvider });
  registerReviewRoutes(app, { store, rbacProvider, auditSignatureProvider, consentGateMw, getRequiredRouteParam });
  registerGovernanceRoutes(app, {
    store,
    referenceBundleRegistry,
    stateMachineGuard,
    consentTracker,
    consentGateMw,
    rbacProvider,
    getRequiredRouteParam,
  });
  registerWorkflowRoutes(app, {
    store,
    workflowRunner,
    referenceBundleRegistry,
    qcGateEvaluator,
    hlaConsensusProvider,
    rbacProvider,
    consentGateMw,
    getRequiredRouteParam,
  });
  registerDesignRoutes(app, {
    store,
    constructDesigner,
    neoantigenRankingEngine,
    rbacProvider,
    consentGateMw,
    getRequiredRouteParam,
  });
  registerOutcomeRoutes(app, { store, rbacProvider, consentGateMw, getRequiredRouteParam });

  app.post("/api/cases", rbacAuth(rbacProvider, "CREATE_CASE"), async (req, res, next) => {
    try {
      const correlationId = String(res.locals.correlationId ?? "");
      const createPayload = dependencies.enforceServerDerivedConsentOnCreate
        ? {
            ...(typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {}),
            caseProfile: {
              ...((typeof req.body === "object" && req.body !== null && typeof (req.body as Record<string, unknown>).caseProfile === "object" && (req.body as Record<string, unknown>).caseProfile !== null)
                ? ((req.body as { caseProfile: Record<string, unknown> }).caseProfile)
                : {}),
              consentStatus: "missing",
            },
          }
        : req.body;

      const createdCase = await store.createCase(createPayload, correlationId);
      const principalId = String(res.locals.principalId ?? "system:anonymous");
      await caseAccessStore.setOwner(createdCase.caseId, principalId);
      res.status(201).json({ case: createdCase });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const principalId = String(res.locals.principalId ?? "system:anonymous");
      const roles = await rbacProvider.getPrincipalRoles(principalId);
      const isPrivileged = roles.includes("ADMIN") || roles.includes("SYSTEM");

      const { cases } = await store.listCases({ limit: 2000, offset: 0 });
      const filteredCases = isPrivileged
        ? cases
        : (await Promise.all(cases.map(async (candidate) => {
            const allowed = await caseAccessStore.canAccess(candidate.caseId, principalId);
            return allowed ? candidate : undefined;
          }))).filter((candidate): candidate is (typeof cases)[number] => candidate !== undefined);

      const pagedCases = filteredCases.slice(offset, offset + limit);
      res.json({
        cases: pagedCases,
        meta: {
          totalCases: filteredCases.length,
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
