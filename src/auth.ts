import { createHmac, createVerify, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { DEFAULT_ANONYMOUS_ACTOR_ID } from "./audit-context";
import type { AuditContext, AuthMechanism } from "./types";

const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_API_KEY_PRINCIPAL_ID = "api-key-client";
const DEFAULT_PRINCIPAL_CLAIM = "sub";
const DEFAULT_ROLE_CLAIM = "roles";

type JwtSignatureAlgorithm = "HS256" | "RS256";

export interface JwtAuthOptions {
  sharedSecret?: string;
  publicKeyPem?: string;
  expectedIssuer?: string;
  expectedAudience?: string;
  principalClaim?: string;
  roleClaim?: string;
}

export interface AuthSettings {
  apiKey?: string;
  apiKeyPrincipalId?: string;
  jwt?: JwtAuthOptions;
}

export interface RequestPrincipal {
  principalId: string;
  actorId: string;
  authMechanism: AuthMechanism;
  roles: string[];
  claims?: Record<string, unknown>;
}

export class AuthResolutionError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    public readonly code: "missing_credentials" | "invalid_api_key" | "invalid_token",
    message: string,
  ) {
    super(message);
    this.name = "AuthResolutionError";
  }
}

export function hasAuthenticationConfig(settings: AuthSettings): boolean {
  return Boolean(settings.apiKey || settings.jwt?.sharedSecret || settings.jwt?.publicKeyPem);
}

export function anonymousPrincipal(): RequestPrincipal {
  return {
    principalId: DEFAULT_ANONYMOUS_ACTOR_ID,
    actorId: DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: "anonymous",
    roles: [],
  };
}

export function resolveUnsignedPrincipalHint(headers: IncomingHttpHeaders): RequestPrincipal {
  void headers;
  return anonymousPrincipal();
}

export function toAuditContext(correlationId: string, principal: RequestPrincipal): AuditContext {
  return {
    correlationId,
    actorId: principal.actorId,
    authMechanism: principal.authMechanism,
  };
}

export function resolveRequestPrincipal(headers: IncomingHttpHeaders, settings: AuthSettings): RequestPrincipal {
  if (!hasAuthenticationConfig(settings)) {
    return anonymousPrincipal();
  }

  const bearerToken = readBearerToken(headers.authorization);
  if (bearerToken) {
    return resolveJwtPrincipal(bearerToken, settings.jwt ?? {});
  }

  const apiKey = readSingleHeaderValue(headers["x-api-key"]);
  if (settings.apiKey && apiKey) {
    return resolveApiKeyPrincipal(apiKey, settings.apiKey, settings.apiKeyPrincipalId);
  }

  if (settings.apiKey && settings.jwt) {
    throw new AuthResolutionError(401, "missing_credentials", "Missing authentication credentials.");
  }

  if (settings.apiKey) {
    throw new AuthResolutionError(401, "missing_credentials", "Missing x-api-key header.");
  }

  throw new AuthResolutionError(401, "missing_credentials", "Missing bearer token.");
}

function resolveApiKeyPrincipal(providedKey: string, expectedKey: string, principalId?: string): RequestPrincipal {
  const expectedBuffer = Buffer.from(expectedKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new AuthResolutionError(403, "invalid_api_key", "Invalid API key.");
  }

  const resolvedPrincipalId = principalId?.trim() || DEFAULT_API_KEY_PRINCIPAL_ID;
  return {
    principalId: resolvedPrincipalId,
    actorId: resolvedPrincipalId,
    authMechanism: "api-key",
    roles: [],
  };
}

function resolveJwtPrincipal(token: string, options: JwtAuthOptions): RequestPrincipal {
  const [encodedHeader, encodedPayload, encodedSignature, ...rest] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length > 0) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  const header = decodeJwtSegment(encodedHeader);
  const payload = decodeJwtSegment(encodedPayload);

  const algorithm = getJwtAlgorithm(header.alg);
  if (!verifyJwtSignature(algorithm, `${encodedHeader}.${encodedPayload}`, encodedSignature, options)) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  validateRegisteredClaims(payload, options);

  const principalClaim = options.principalClaim ?? DEFAULT_PRINCIPAL_CLAIM;
  const principalValue = getNestedClaim(payload, principalClaim);
  if (typeof principalValue !== "string" || principalValue.trim().length === 0) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  const roles = coerceRoles(getNestedClaim(payload, options.roleClaim ?? DEFAULT_ROLE_CLAIM));
  return {
    principalId: principalValue,
    actorId: principalValue,
    authMechanism: "jwt-bearer",
    roles,
    claims: payload,
  };
}

function verifyJwtSignature(
  algorithm: JwtSignatureAlgorithm,
  signingInput: string,
  encodedSignature: string,
  options: JwtAuthOptions,
): boolean {
  const signature = decodeBase64Url(encodedSignature);

  if (algorithm === "HS256") {
    const secret = options.sharedSecret;
    if (!secret) {
      return false;
    }
    const expectedSignature = createHmac("sha256", secret).update(signingInput).digest();
    return expectedSignature.length === signature.length && timingSafeEqual(expectedSignature, signature);
  }

  if (!options.publicKeyPem) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify(options.publicKeyPem, signature);
}

function validateRegisteredClaims(payload: Record<string, unknown>, options: JwtAuthOptions): void {
  const now = Math.floor(Date.now() / 1000);
  const skewedNow = now + CLOCK_SKEW_SECONDS;

  if (options.expectedIssuer && payload.iss !== options.expectedIssuer) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  if (options.expectedAudience && !matchesAudience(payload.aud, options.expectedAudience)) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || skewedNow >= payload.exp) {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }

  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || now < payload.nbf - CLOCK_SKEW_SECONDS) {
      throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
    }
  }

  if (payload.iat !== undefined) {
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > skewedNow) {
      throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
    }
  }
}

function matchesAudience(audience: unknown, expectedAudience: string): boolean {
  if (typeof audience === "string") {
    return audience === expectedAudience;
  }

  if (Array.isArray(audience)) {
    return audience.some((candidate) => typeof candidate === "string" && candidate === expectedAudience);
  }

  return false;
}

function getJwtAlgorithm(value: unknown): JwtSignatureAlgorithm {
  if (value === "HS256" || value === "RS256") {
    return value;
  }

  throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  try {
    const decoded = decodeBase64Url(segment).toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JWT segment must decode to an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }
}

function decodeBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new AuthResolutionError(403, "invalid_token", "Invalid bearer token.");
  }
}

function readBearerToken(value: string | string[] | undefined): string | undefined {
  const header = readSingleHeaderValue(value);
  if (!header) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

function readSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getNestedClaim(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, payload);
}

function coerceRoles(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.filter((candidate): candidate is string => typeof candidate === "string");
  }

  return [];
}