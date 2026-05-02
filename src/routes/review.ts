import { createHmac } from "node:crypto";
import type { Express, RequestHandler } from "express";
import {
  parseAuthorizeFinalReleaseInput,
  parseGenerateHandoffPacketInput,
  parseRecordReviewOutcomeInput,
} from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";
import type { SignatureManifestation } from "../types";

type RouteParamResolver = (
  req: Parameters<RequestHandler>[0],
  name: string,
) => string;

interface ReviewRouteDependencies {
  store: CaseStore;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
  /**
   * When true, `reviewerId` / `releaserId` are derived from the verified JWT
   * `sub` claim (res.locals.principalId) rather than from the request body,
   * satisfying 21 CFR Part 11 §11.50 signer-identity requirements.
   */
  enforceIdentityBoundSignatures?: boolean;
  /**
   * HMAC-SHA256 key for server-side signature seals (§11.70).
   * Must be ≥32 bytes. When omitted, seals are not computed.
   */
  signatureSealKey?: string;
}

/**
 * Computes the 21 CFR Part 11 §11.70-compliant HMAC-SHA256 server seal for a
 * signature manifestation. The payload is a pipe-separated canonical string:
 *   caseId | recordId | signedBy | meaning | signedAt
 *
 * The seal is stored alongside the manifestation. On read, it is recomputed
 * and compared to detect tampering (record-signature linking).
 */
function computeServerSeal(
  sealKey: string,
  params: {
    caseId: string;
    recordId: string;
    signedBy: string;
    meaning: string;
    signedAt: string;
  },
): string {
  const payload = [
    params.caseId,
    params.recordId,
    params.signedBy,
    params.meaning,
    params.signedAt,
  ].join("|");
  return createHmac("sha256", sealKey).update(payload, "utf8").digest("hex");
}

/**
 * Applies identity-bound signature enforcement when enabled.
 * Overrides client-supplied `reviewerId` / `releaserId` with the verified
 * principal from the authentication layer, and optionally computes a server seal.
 */
function applyIdentityBinding(
  manifestation: SignatureManifestation | undefined,
  context: {
    enforceIdentityBoundSignatures: boolean;
    signatureSealKey: string | undefined;
    principalId: string;
    principalName: string;
    caseId: string;
    recordId: string;
  },
): SignatureManifestation | undefined {
  if (!manifestation) {
    return undefined;
  }

  let result = { ...manifestation };

  if (context.enforceIdentityBoundSignatures) {
    // Override caller-supplied signedBy with the verified IdP identity
    result = { ...result, signedBy: context.principalId };
  }

  if (context.signatureSealKey) {
    const seal = computeServerSeal(context.signatureSealKey, {
      caseId: context.caseId,
      recordId: context.recordId,
      signedBy: result.signedBy,
      meaning: result.meaning,
      signedAt: result.signedAt,
    });
    result = { ...result, serverSeal: seal };
  }

  return result;
}

export function registerReviewRoutes(
  app: Express,
  {
    store,
    rbacProvider,
    consentGateMw,
    getRequiredRouteParam,
    enforceIdentityBoundSignatures = false,
    signatureSealKey,
  }: ReviewRouteDependencies,
): void {
  app.post(
    "/api/cases/:caseId/board-packets",
    rbacAuth(rbacProvider, "REQUEST_WORKFLOW"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const correlationId = String(res.locals.correlationId ?? "");
        const result = await store.generateBoardPacket(caseId, correlationId);
        res.status(result.created ? 201 : 200).json({
          case: result.case,
          packet: result.packet,
          meta: { created: result.created },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/board-packets",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const packets = await store.listBoardPackets(caseId);
        res.json({ packets, meta: { totalPackets: packets.length } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/board-packets/:packetId",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const packetId = getRequiredRouteParam(req, "packetId");
        const packet = await store.getBoardPacket(caseId, packetId);
        res.json({ packet });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/cases/:caseId/review-outcomes",
    rbacAuth(rbacProvider, "APPROVE_REVIEW"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const correlationId = String(res.locals.correlationId ?? "");
        const rawInput = parseRecordReviewOutcomeInput(req.body);
        const principalId = String(
          res.locals.principalId ?? "system:anonymous",
        );
        const principalName = String(res.locals.principalName ?? principalId);
        const reviewId = `review_pending_${correlationId}`; // placeholder for seal; actual reviewId assigned by store
        const inputWithIdentity = enforceIdentityBoundSignatures
          ? { ...rawInput, reviewerId: principalId }
          : rawInput;
        const inputWithSeal = {
          ...inputWithIdentity,
          signatureManifestation: applyIdentityBinding(
            rawInput.signatureManifestation,
            {
              enforceIdentityBoundSignatures,
              signatureSealKey,
              principalId,
              principalName,
              caseId,
              recordId: reviewId,
            },
          ),
        };
        const result = await store.recordReviewOutcome(
          caseId,
          inputWithSeal,
          correlationId,
        );
        res.status(result.created ? 201 : 200).json({
          case: result.case,
          reviewOutcome: result.reviewOutcome,
          meta: {
            created: result.created,
            identityBound: enforceIdentityBoundSignatures,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/review-outcomes",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const reviewOutcomes = await store.listReviewOutcomes(caseId);
        res.json({
          reviewOutcomes,
          meta: { totalReviewOutcomes: reviewOutcomes.length },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/review-outcomes/:reviewId",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const reviewId = getRequiredRouteParam(req, "reviewId");
        const reviewOutcome = await store.getReviewOutcome(caseId, reviewId);
        res.json({ reviewOutcome });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/cases/:caseId/final-releases",
    rbacAuth(rbacProvider, "RELEASE_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const correlationId = String(res.locals.correlationId ?? "");
        const rawInput = parseAuthorizeFinalReleaseInput(req.body);
        const principalId = String(
          res.locals.principalId ?? "system:anonymous",
        );
        const principalName = String(res.locals.principalName ?? principalId);
        const inputWithIdentity = enforceIdentityBoundSignatures
          ? { ...rawInput, releaserId: principalId }
          : rawInput;
        const inputWithSeal = {
          ...inputWithIdentity,
          signatureManifestation: applyIdentityBinding(
            rawInput.signatureManifestation,
            {
              enforceIdentityBoundSignatures,
              signatureSealKey,
              principalId,
              principalName,
              caseId,
              recordId: rawInput.reviewId, // seals against the review record being released
            },
          ),
        };
        const result = await store.authorizeFinalRelease(
          caseId,
          inputWithSeal,
          correlationId,
        );
        res.status(result.created ? 201 : 200).json({
          case: result.case,
          reviewOutcome: result.reviewOutcome,
          finalRelease: result.reviewOutcome.finalRelease,
          meta: {
            created: result.created,
            identityBound: enforceIdentityBoundSignatures,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/cases/:caseId/handoff-packets",
    rbacAuth(rbacProvider, "RELEASE_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const correlationId = String(res.locals.correlationId ?? "");
        const input = parseGenerateHandoffPacketInput(req.body);
        const result = await store.generateHandoffPacket(
          caseId,
          input,
          correlationId,
        );
        res.status(result.created ? 201 : 200).json({
          case: result.case,
          handoff: result.handoff,
          meta: { created: result.created },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/handoff-packets",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const handoffs = await store.listHandoffPackets(caseId);
        res.json({ handoffs, meta: { totalHandoffs: handoffs.length } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/cases/:caseId/handoff-packets/:handoffId",
    rbacAuth(rbacProvider, "VIEW_CASE"),
    consentGateMw,
    async (req, res, next) => {
      try {
        const caseId = getRequiredRouteParam(req, "caseId");
        const handoffId = getRequiredRouteParam(req, "handoffId");
        const handoff = await store.getHandoffPacket(caseId, handoffId);
        res.json({ handoff });
      } catch (error) {
        next(error);
      }
    },
  );
}
