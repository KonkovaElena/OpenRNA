import { z } from "zod";
import type { JwtAuthOptions } from "./auth";

/**
 * Structured error emitted when environment configuration fails schema validation.
 * Carries Zod issue details for human-readable bootstrap diagnostics.
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export interface AppConfig {
  port: number;
  caseStoreDatabaseUrl?: string;
  caseStoreTableName: string;
  workflowDispatchDatabaseUrl?: string;
  workflowDispatchTableName: string;
  apiKey?: string;
  apiKeyPrincipalId?: string;
  rbacAllowAll: boolean;
  rateLimitEnabled: boolean;
  rateLimitMaxTokens: number;
  rateLimitRefillRate: number;
  jwt?: JwtAuthOptions;
  /**
   * HMAC-SHA256 key used to generate server-side signature seals on review
   * and final-release records (21 CFR Part 11 §11.70 record-signature binding).
   * Minimum 32 bytes when provided.
   */
  signatureSealKey?: string;
  /**
   * Express `trust proxy` setting. Set to `true` or a number (proxy hop count)
   * when running behind a load balancer (ALB, nginx, etc.) so that `req.ip`
   * reflects the client address rather than the balancer's. Required for
   * accurate per-IP rate limiting and request logging.
   */
  trustProxy?: boolean | number;
}

function optionalEnvText() {
  return z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().trim().optional());
}

function optionalEnvBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return value;
  }, z.boolean().default(defaultValue));
}

const configSchema = z.object({
  PORT: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : value),
    z.coerce
      .number({ error: "PORT must be a number." })
      .int()
      .min(1, "PORT must be between 1 and 65535.")
      .max(65535, "PORT must be between 1 and 65535.")
      .default(4010),
  ),
  CASE_STORE_DATABASE_URL: optionalEnvText(),
  CASE_STORE_TABLE_NAME: optionalEnvText()
    .default("case_records")
    .refine(
      (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value),
      "CASE_STORE_TABLE_NAME must be a valid PostgreSQL identifier.",
    ),
  WORKFLOW_DISPATCH_DATABASE_URL: optionalEnvText(),
  WORKFLOW_DISPATCH_TABLE_NAME: optionalEnvText()
    .default("workflow_dispatches")
    .refine(
      (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value),
      "WORKFLOW_DISPATCH_TABLE_NAME must be a valid PostgreSQL identifier.",
    ),
  API_KEY: optionalEnvText(),
  API_KEY_PRINCIPAL_ID: optionalEnvText(),
  RBAC_ALLOW_ALL: optionalEnvBoolean(false),
  RATE_LIMIT_ENABLED: optionalEnvBoolean(true),
  RATE_LIMIT_MAX_TOKENS: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : value),
    z.coerce
      .number({ error: "RATE_LIMIT_MAX_TOKENS must be a number." })
      .int()
      .min(1, "RATE_LIMIT_MAX_TOKENS must be >= 1.")
      .default(100),
  ),
  RATE_LIMIT_REFILL_RATE: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : value),
    z.coerce
      .number({ error: "RATE_LIMIT_REFILL_RATE must be a number." })
      .min(0, "RATE_LIMIT_REFILL_RATE must be >= 0.")
      .default(10),
  ),
  JWT_SHARED_SECRET: optionalEnvText().refine(
    (value) => value === undefined || Buffer.byteLength(value, "utf-8") >= 32,
    "JWT_SHARED_SECRET must be at least 32 bytes when provided.",
  ),
  JWT_PUBLIC_KEY_PEM: optionalEnvText(),
  /**
   * OIDC JWKS URI for RS256 key discovery.
   * When set, RS256 JWT signatures are verified against keys fetched from this
   * endpoint (standard OIDC discovery, RFC 7517). Enables per-user identity
   * without static PEM management.
   * Example: https://accounts.example.com/.well-known/jwks.json
   */
  JWT_JWKS_URI: optionalEnvText(),
  /** TTL in seconds for cached JWKS keys (default 300). */
  JWT_JWKS_CACHE_TTL_SEC: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : value),
    z.coerce
      .number({ error: "JWT_JWKS_CACHE_TTL_SEC must be a number." })
      .int()
      .min(60, "JWT_JWKS_CACHE_TTL_SEC must be >= 60 seconds.")
      .default(300),
  ),
  JWT_EXPECTED_ISSUER: optionalEnvText(),
  JWT_EXPECTED_AUDIENCE: optionalEnvText(),
  JWT_PRINCIPAL_CLAIM: optionalEnvText().default("sub"),
  JWT_ROLE_CLAIM: optionalEnvText().default("roles"),
  /**
   * HMAC-SHA256 key for server-side signature seals on review/release records.
   * Required when ENFORCE_IDENTITY_BOUND_SIGNATURES=true.
   * Minimum 32 bytes (UTF-8). Manage via secrets manager in production.
   */
  SIGNATURE_SEAL_KEY: optionalEnvText().refine(
    (value) => value === undefined || Buffer.byteLength(value, "utf-8") >= 32,
    "SIGNATURE_SEAL_KEY must be at least 32 bytes when provided.",
  ),
  TRUST_PROXY: optionalEnvBoolean(false),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    }));
    throw new ConfigValidationError(
      `Invalid environment configuration: ${issues.map((i) => i.message).join("; ")}`,
      issues,
    );
  }

  const jwt =
    result.data.JWT_SHARED_SECRET || result.data.JWT_PUBLIC_KEY_PEM || result.data.JWT_JWKS_URI
      ? {
          sharedSecret: result.data.JWT_SHARED_SECRET,
          publicKeyPem: result.data.JWT_PUBLIC_KEY_PEM,
          jwksUri: result.data.JWT_JWKS_URI,
          jwksCacheTtlSec: result.data.JWT_JWKS_CACHE_TTL_SEC,
          expectedIssuer: result.data.JWT_EXPECTED_ISSUER,
          expectedAudience: result.data.JWT_EXPECTED_AUDIENCE,
          principalClaim: result.data.JWT_PRINCIPAL_CLAIM,
          roleClaim: result.data.JWT_ROLE_CLAIM,
        }
      : undefined;

  const config: AppConfig = {
    port: result.data.PORT,
    caseStoreDatabaseUrl: result.data.CASE_STORE_DATABASE_URL,
    caseStoreTableName: result.data.CASE_STORE_TABLE_NAME,
    workflowDispatchDatabaseUrl: result.data.WORKFLOW_DISPATCH_DATABASE_URL,
    workflowDispatchTableName: result.data.WORKFLOW_DISPATCH_TABLE_NAME,
    apiKey: result.data.API_KEY,
    apiKeyPrincipalId: result.data.API_KEY_PRINCIPAL_ID,
    rbacAllowAll: result.data.RBAC_ALLOW_ALL,
    rateLimitEnabled: result.data.RATE_LIMIT_ENABLED,
    rateLimitMaxTokens: result.data.RATE_LIMIT_MAX_TOKENS,
    rateLimitRefillRate: result.data.RATE_LIMIT_REFILL_RATE,
    jwt,
    signatureSealKey: result.data.SIGNATURE_SEAL_KEY,
    trustProxy: result.data.TRUST_PROXY,
  };

  // Production advisory: shared API-key without OIDC does not satisfy
  // 21 CFR Part 11 §11.10(d) per-user identity requirements.
  if (env.NODE_ENV === "production" && config.apiKey && !config.jwt?.jwksUri && !config.jwt?.publicKeyPem) {
    process.stderr.write(
      "[OpenRNA] WARNING: Shared API key auth without OIDC (JWT_JWKS_URI) is not recommended " +
        "for production. Set JWT_JWKS_URI to satisfy 21 CFR Part 11 §11.10(d) per-user identity.\n",
    );
  }

  return config;
}
