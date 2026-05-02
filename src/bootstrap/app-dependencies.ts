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
import type { ICaseAccessStore } from "../ports/ICaseAccessStore";
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
import { InMemoryCaseAccessStore } from "../adapters/InMemoryCaseAccessStore";
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
  caseAccessStore?: ICaseAccessStore;
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
  enforceServerDerivedConsentOnCreate?: boolean;
  /**
   * When true, the `reviewerId` (review-outcomes) and `releaserId` (final-releases)
   * fields are derived from the verified JWT `sub` claim rather than from the request
   * body. Satisfies 21 CFR Part 11 §11.50: "electronic signature includes printed
   * name of the signer, the date and time the signature was executed, and the
   * meaning of the signature."  Requires `signatureSealKey` to generate the
   * corresponding server-side HMAC seal (§11.70 record-signature linking).
   */
  enforceIdentityBoundSignatures?: boolean;
  /**
   * HMAC-SHA256 key for server-side signature seals (21 CFR Part 11 §11.70).
   * Minimum 32 bytes. Manage via secrets manager in production. When absent and
   * `enforceIdentityBoundSignatures` is true, server seals are omitted with a
   * warning rather than blocking the request.
   */
  signatureSealKey?: string;
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
  caseAccessStore: ICaseAccessStore;
  readinessCheck: () => Promise<boolean>;
}

const passThroughConsentGate: RequestHandler = (_req, _res, next) => {
  next();
};

export function resolveAppDependencies(
  dependencies: AppDependencies = {},
): ResolvedAppDependencies {
  const modalityRegistry =
    dependencies.modalityRegistry ?? new InMemoryModalityRegistry();
  const constructDesigner =
    dependencies.constructDesigner ??
    new InMemoryConstructDesigner(modalityRegistry);
  const workflowRunner =
    dependencies.workflowRunner ?? new InMemoryWorkflowRunner();
  const store = dependencies.store ?? new MemoryCaseStore();
  const referenceBundleRegistry =
    dependencies.referenceBundleRegistry ??
    new InMemoryReferenceBundleRegistry();
  const qcGateEvaluator =
    dependencies.qcGateEvaluator ?? new InMemoryQcGateEvaluator();
  const hlaConsensusProvider =
    dependencies.hlaConsensusProvider ?? new InMemoryHlaConsensusProvider();
  const neoantigenRankingEngine =
    dependencies.neoantigenRankingEngine ??
    new InMemoryNeoantigenRankingEngine();
  const stateMachineGuard =
    dependencies.stateMachineGuard ?? new InMemoryStateMachineGuard();
  const consentTracker =
    dependencies.consentTracker ?? new InMemoryConsentTracker();
  const consentGateMw =
    dependencies.consentGateEnabled === false
      ? passThroughConsentGate
      : requireActiveConsent(consentTracker);
  const rbacProvider =
    dependencies.rbacProvider ??
    new InMemoryRbacProvider({ allowAll: dependencies.rbacAllowAll });
  const auditSignatureProvider =
    dependencies.auditSignatureProvider ?? new InMemoryAuditSignatureProvider();
  const fhirExporter = dependencies.fhirExporter ?? new InMemoryFhirExporter();
  const caseAccessStore =
    dependencies.caseAccessStore ?? new InMemoryCaseAccessStore();

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
    caseAccessStore,
    readinessCheck: dependencies.readinessCheck ?? (async () => true),
  };
}
