import { createHmac, createVerify, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { DEFAULT_ANONYMOUS_ACTOR_ID } from "./audit-context";
import type { AuditContext, AuthMechanism } from "./types";

const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_API_KEY_PRINCIPAL_ID = "api-key-client";
const DEFAULT_PRINCIPAL_CLAIM = "sub";
const DEFAULT_ROLE_CLAIM = "roles";
const DEFAULT_JWKS_CACHE_TTL_SEC = 300;

type JwtSignatureAlgorithm = "HS256" | "RS256";

export interface JwtAuthOptions {
  sharedSecret?: string;
  publicKeyPem?: string;
  /**
   * OIDC/JWKS URI for RS256 key discovery.
   * When set, the RS256 verification path fetches the public key from this
   * endpoint rather than requiring `publicKeyPem`.
   * Example: https://accounts.example.com/.well-known/jwks.json
   *
   * Enables per-user identity via standard OIDC Authorization Server
   * (Keycloak, Azure AD, Auth0, etc.) without manual PEM management.
   * Satisfies 21 CFR Part 11 §11.10(d) per-user identity requirement.
   */
  jwksUri?: string;
  /** TTL in seconds for cached JWKS keys (default 300). */
  jwksCacheTtlSec?: number;
  expectedIssuer?: string;
  expectedAudience?: string;
  principalClaim?: string;
  roleClaim?: string;
}

// ─── JWKS key cache ───────────────────────────────────────────────────────────
// kid → { key: CryptoKey, expiresAt: millisecond timestamp }
const jwksKeyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

async function fetchJwkForKid(
  jwksUri: string,
  kid: string | undefined,
  ttlSec: number,
): Promise<CryptoKey> {
  const cacheKey = `${jwksUri}#${kid ?? ""}`;
  const cached = jwksKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const response = await fetch(jwksUri, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "JWKS endpoint returned non-OK status.",
    );
  }

  type JwksDocument = { keys: Array<Record<string, unknown>> };
  const jwks = (await response.json()) as JwksDocument;
  if (!Array.isArray(jwks.keys)) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "JWKS document has no keys array.",
    );
  }

  const jwk = kid
    ? jwks.keys.find((k) => k.kid === kid)
    : jwks.keys.find((k) => k.use === "sig" || !k.use);

  if (!jwk) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "No matching key found in JWKS.",
    );
  }

  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey("jwk", jwk, algorithm, false, [
      "verify",
    ]);
  } catch {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Failed to import JWK public key.",
    );
  }

  jwksKeyCache.set(cacheKey, {
    key: cryptoKey,
    expiresAt: Date.now() + ttlSec * 1000,
  });
  return cryptoKey;
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
  /**
   * Human-readable display name from the `name` JWT claim or equivalent.
   * Used for identity-bound signature manifestations (21 CFR Part 11 §11.50).
   */
  principalName?: string;
}

export class AuthResolutionError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    public readonly code:
      | "missing_credentials"
      | "invalid_api_key"
      | "invalid_token",
    message: string,
  ) {
    super(message);
    this.name = "AuthResolutionError";
  }
}

export function hasAuthenticationConfig(settings: AuthSettings): boolean {
  return Boolean(
    settings.apiKey ||
    settings.jwt?.sharedSecret ||
    settings.jwt?.publicKeyPem ||
    settings.jwt?.jwksUri,
  );
}

export function anonymousPrincipal(): RequestPrincipal {
  return {
    principalId: DEFAULT_ANONYMOUS_ACTOR_ID,
    actorId: DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: "anonymous",
    roles: [],
  };
}

export function resolveUnsignedPrincipalHint(
  headers: IncomingHttpHeaders,
): RequestPrincipal {
  const hintedPrincipal = readSingleHeaderValue(headers["x-principal-id"]);

  if (hintedPrincipal && hintedPrincipal.trim().length > 0) {
    const principalId = hintedPrincipal.trim();
    return {
      principalId,
      actorId: principalId,
      authMechanism: "api-key",
      roles: [],
    };
  }

  return anonymousPrincipal();
}

export function toAuditContext(
  correlationId: string,
  principal: RequestPrincipal,
): AuditContext {
  return {
    correlationId,
    actorId: principal.actorId,
    authMechanism: principal.authMechanism,
  };
}

export async function resolveRequestPrincipal(
  headers: IncomingHttpHeaders,
  settings: AuthSettings,
): Promise<RequestPrincipal> {
  if (!hasAuthenticationConfig(settings)) {
    return anonymousPrincipal();
  }

  const bearerToken = readBearerToken(headers.authorization);
  if (bearerToken) {
    return resolveJwtPrincipal(bearerToken, settings.jwt ?? {});
  }
  // (continued after async call)

  const apiKey = readSingleHeaderValue(headers["x-api-key"]);
  if (settings.apiKey && apiKey) {
    return resolveApiKeyPrincipal(
      apiKey,
      settings.apiKey,
      settings.apiKeyPrincipalId,
    );
  }

  if (settings.apiKey && settings.jwt) {
    throw new AuthResolutionError(
      401,
      "missing_credentials",
      "Missing authentication credentials.",
    );
  }

  if (settings.apiKey) {
    throw new AuthResolutionError(
      401,
      "missing_credentials",
      "Missing x-api-key header.",
    );
  }

  throw new AuthResolutionError(
    401,
    "missing_credentials",
    "Missing bearer token.",
  );
}

function resolveApiKeyPrincipal(
  providedKey: string,
  expectedKey: string,
  principalId?: string,
): RequestPrincipal {
  const expectedBuffer = Buffer.from(expectedKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new AuthResolutionError(403, "invalid_api_key", "Invalid API key.");
  }

  const resolvedPrincipalId =
    principalId?.trim() || DEFAULT_API_KEY_PRINCIPAL_ID;
  return {
    principalId: resolvedPrincipalId,
    actorId: resolvedPrincipalId,
    authMechanism: "api-key",
    roles: [],
  };
}

async function resolveJwtPrincipal(
  token: string,
  options: JwtAuthOptions,
): Promise<RequestPrincipal> {
  const [encodedHeader, encodedPayload, encodedSignature, ...rest] =
    token.split(".");
  if (
    !encodedHeader ||
    !encodedPayload ||
    !encodedSignature ||
    rest.length > 0
  ) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  const header = decodeJwtSegment(encodedHeader);
  const payload = decodeJwtSegment(encodedPayload);

  const algorithm = getJwtAlgorithm(header.alg);
  const sigValid = await verifyJwtSignature(
    algorithm,
    header,
    `${encodedHeader}.${encodedPayload}`,
    encodedSignature,
    options,
  );
  if (!sigValid) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  validateRegisteredClaims(payload, options);

  const principalClaim = options.principalClaim ?? DEFAULT_PRINCIPAL_CLAIM;
  const principalValue = getNestedClaim(payload, principalClaim);
  if (
    typeof principalValue !== "string" ||
    principalValue.trim().length === 0
  ) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  const roles = coerceRoles(
    getNestedClaim(payload, options.roleClaim ?? DEFAULT_ROLE_CLAIM),
  );
  const nameValue = getNestedClaim(payload, "name");
  const principalName =
    typeof nameValue === "string" && nameValue.trim().length > 0
      ? nameValue.trim()
      : principalValue;
  return {
    principalId: principalValue,
    actorId: principalValue,
    authMechanism: "jwt-bearer",
    roles,
    claims: payload,
    principalName,
  };
}

async function verifyJwtSignature(
  algorithm: JwtSignatureAlgorithm,
  header: Record<string, unknown>,
  signingInput: string,
  encodedSignature: string,
  options: JwtAuthOptions,
): Promise<boolean> {
  const signature = decodeBase64Url(encodedSignature);

  if (algorithm === "HS256") {
    const secret = options.sharedSecret;
    if (!secret) {
      return false;
    }
    const expectedSignature = createHmac("sha256", secret)
      .update(signingInput)
      .digest();
    return (
      expectedSignature.length === signature.length &&
      timingSafeEqual(expectedSignature, signature)
    );
  }

  // RS256 — JWKS path (preferred: key rotation handled automatically)
  if (options.jwksUri) {
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const ttl = options.jwksCacheTtlSec ?? DEFAULT_JWKS_CACHE_TTL_SEC;
    const key = await fetchJwkForKid(options.jwksUri, kid, ttl);
    // webcrypto.subtle requires ArrayBuffer, not Node.js Buffer
    const signingInputBytes = new TextEncoder().encode(signingInput);
    const signatureBytes = new Uint8Array(signature);
    return crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      signatureBytes,
      signingInputBytes,
    );
  }

  // RS256 — static PEM path (backward compat)
  if (!options.publicKeyPem) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify(options.publicKeyPem, signature);
}

function validateRegisteredClaims(
  payload: Record<string, unknown>,
  options: JwtAuthOptions,
): void {
  const now = Math.floor(Date.now() / 1000);
  const skewedNow = now + CLOCK_SKEW_SECONDS;

  if (options.expectedIssuer && payload.iss !== options.expectedIssuer) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  if (
    options.expectedAudience &&
    !matchesAudience(payload.aud, options.expectedAudience)
  ) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  if (
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    skewedNow >= payload.exp
  ) {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }

  if (payload.nbf !== undefined) {
    if (
      typeof payload.nbf !== "number" ||
      !Number.isFinite(payload.nbf) ||
      now < payload.nbf - CLOCK_SKEW_SECONDS
    ) {
      throw new AuthResolutionError(
        403,
        "invalid_token",
        "Invalid bearer token.",
      );
    }
  }

  if (payload.iat !== undefined) {
    if (
      typeof payload.iat !== "number" ||
      !Number.isFinite(payload.iat) ||
      payload.iat > skewedNow
    ) {
      throw new AuthResolutionError(
        403,
        "invalid_token",
        "Invalid bearer token.",
      );
    }
  }
}

function matchesAudience(audience: unknown, expectedAudience: string): boolean {
  if (typeof audience === "string") {
    return audience === expectedAudience;
  }

  if (Array.isArray(audience)) {
    return audience.some(
      (candidate) =>
        typeof candidate === "string" && candidate === expectedAudience,
    );
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
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }
}

function decodeBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new AuthResolutionError(
      403,
      "invalid_token",
      "Invalid bearer token.",
    );
  }
}

function readBearerToken(
  value: string | string[] | undefined,
): string | undefined {
  const header = readSingleHeaderValue(value);
  if (!header) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

function readSingleHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getNestedClaim(
  payload: Record<string, unknown>,
  path: string,
): unknown {
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
    return value.filter(
      (candidate): candidate is string => typeof candidate === "string",
    );
  }

  return [];
}
