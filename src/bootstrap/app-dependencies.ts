import type { RequestHandler } from "express";
import type { JwtAuthOptions } from "../auth";
import { MemoryCaseStore, type CaseStore } from "../store";
import type { IConstructDesigner } from "../ports/IConstructDesigner";
import type { IModalityRegistry } from "../ports/IModalityRegistry";
import type { IReferenceBundleRegistry } from "../ports/IReferenceBundleRegistry";
import type { IQcGateEvaluator } from "../ports/IQcGateEvaluator";
import type { IWorkflowRunner } from "../ports/IWorkflowRunner";
import type { IStateMachineGuard } from "../ports/IStateMachineGuard";
import type { IConsentTracker } from "../ports/IConsentTracker";
import type { IHlaConsensusProvider } from "../ports/IHlaConsensusProvider";
import type { INeoantigenRankingEngine } from "../ports/INeoantigenRankingEngine";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { IAuditSignatureProvider } from "../ports/IAuditSignatureProvider";
import type { IFhirExporter } from "../ports/IFhirExporter";
import { InMemoryConstructDesigner } from "../adapters/InMemoryConstructDesigner";
import { InMemoryHlaConsensusProvider } from "../adapters/InMemoryHlaConsensusProvider";
import { InMemoryModalityRegistry } from "../adapters/InMemoryModalityRegistry";
import { InMemoryNeoantigenRankingEngine } from "../adapters/InMemoryNeoantigenRankingEngine";
import { InMemoryReferenceBundleRegistry } from "../adapters/InMemoryReferenceBundleRegistry";
import { InMemoryQcGateEvaluator } from "../adapters/InMemoryQcGateEvaluator";
import { InMemoryWorkflowRunner } from "../adapters/InMemoryWorkflowRunner";
import { InMemoryStateMachineGuard } from "../adapters/InMemoryStateMachineGuard";
import { InMemoryConsentTracker } from "../adapters/InMemoryConsentTracker";
import { InMemoryRbacProvider } from "../adapters/InMemoryRbacProvider";
import { InMemoryAuditSignatureProvider } from "../adapters/InMemoryAuditSignatureProvider";
import { InMemoryFhirExporter } from "../adapters/InMemoryFhirExporter";
import { requireActiveConsent } from "../middleware/consent-gate";
import type { RequestLogWriter } from "../middleware/request-logger";
import type { RateLimiterOptions } from "../middleware/rate-limiter";

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
  rateLimitOptions?: RateLimiterOptions;
  readinessCheck?: () => Promise<boolean>;
}

export interface ResolvedAppDependencies {
  store: CaseStore;
  constructDesigner: IConstructDesigner;
  modalityRegistry: IModalityRegistry;
  referenceBundleRegistry: IReferenceBundleRegistry;
  qcGateEvaluator: IQcGateEvaluator;
  hlaConsensusProvider: IHlaConsensusProvider;
  neoantigenRankingEngine: INeoantigenRankingEngine;
  workflowRunner: IWorkflowRunner;
  stateMachineGuard: IStateMachineGuard;
  consentTracker: IConsentTracker;
  consentGateMw: RequestHandler;
  rbacProvider: IRbacProvider;
  auditSignatureProvider: IAuditSignatureProvider;
  fhirExporter: IFhirExporter;
  readinessCheck: () => Promise<boolean>;
}

const passThroughConsentGate: RequestHandler = (_req, _res, next) => {
  next();
};

export function resolveAppDependencies(
  dependencies: AppDependencies = {},
): ResolvedAppDependencies {
  const modalityRegistry = dependencies.modalityRegistry ?? new InMemoryModalityRegistry();
  const constructDesigner = dependencies.constructDesigner ?? new InMemoryConstructDesigner(modalityRegistry);
  const workflowRunner = dependencies.workflowRunner ?? new InMemoryWorkflowRunner();
  const store = dependencies.store ?? new MemoryCaseStore();
  const referenceBundleRegistry =
    dependencies.referenceBundleRegistry ?? new InMemoryReferenceBundleRegistry();
  const qcGateEvaluator = dependencies.qcGateEvaluator ?? new InMemoryQcGateEvaluator();
  const hlaConsensusProvider = dependencies.hlaConsensusProvider ?? new InMemoryHlaConsensusProvider();
  const neoantigenRankingEngine =
    dependencies.neoantigenRankingEngine ?? new InMemoryNeoantigenRankingEngine();
  const stateMachineGuard = dependencies.stateMachineGuard ?? new InMemoryStateMachineGuard();
  const consentTracker = dependencies.consentTracker ?? new InMemoryConsentTracker();
  const consentGateMw =
    dependencies.consentGateEnabled === false
      ? passThroughConsentGate
      : requireActiveConsent(consentTracker);
  const rbacProvider =
    dependencies.rbacProvider ?? new InMemoryRbacProvider({ allowAll: dependencies.rbacAllowAll });
  const auditSignatureProvider =
    dependencies.auditSignatureProvider ?? new InMemoryAuditSignatureProvider();
  const fhirExporter = dependencies.fhirExporter ?? new InMemoryFhirExporter();

  return {
    store,
    constructDesigner,
    modalityRegistry,
    referenceBundleRegistry,
    qcGateEvaluator,
    hlaConsensusProvider,
    neoantigenRankingEngine,
    workflowRunner,
    stateMachineGuard,
    consentTracker,
    consentGateMw,
    rbacProvider,
    auditSignatureProvider,
    fhirExporter,
    readinessCheck: dependencies.readinessCheck ?? (async () => true),
  };
}