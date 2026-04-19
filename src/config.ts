import { z } from "zod";
import type { JwtAuthOptions } from "./auth";

export interface AppConfig {
  port: number;
  caseStoreDatabaseUrl?: string;
  caseStoreTableName: string;
  workflowDispatchDatabaseUrl?: string;
  workflowDispatchTableName: string;
  apiKey?: string;
  apiKeyPrincipalId?: string;
  requireAuth: boolean;
  rbacAllowAll: boolean;
  rateLimitEnabled: boolean;
  rateLimitMaxTokens: number;
  rateLimitRefillRate: number;
  jwt?: JwtAuthOptions;
}

function optionalEnvText() {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().trim().optional(),
  );
}

function optionalEnvBoolean(defaultValue: boolean) {
  return z.preprocess(
    (value) => {
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
    },
    z.boolean().default(defaultValue),
  );
}

const configSchema = z.object({
  PORT: z.preprocess(
    (value) => value === undefined || value === null || value === "" ? undefined : value,
    z.coerce.number({ error: "PORT must be a number." }).int().min(1, "PORT must be between 1 and 65535.").max(65535, "PORT must be between 1 and 65535.").default(4010),
  ),
  CASE_STORE_DATABASE_URL: optionalEnvText(),
  CASE_STORE_TABLE_NAME: optionalEnvText().default("case_records").refine(
    (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value),
    "CASE_STORE_TABLE_NAME must be a valid PostgreSQL identifier.",
  ),
  WORKFLOW_DISPATCH_DATABASE_URL: optionalEnvText(),
  WORKFLOW_DISPATCH_TABLE_NAME: optionalEnvText().default("workflow_dispatches").refine(
    (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value),
    "WORKFLOW_DISPATCH_TABLE_NAME must be a valid PostgreSQL identifier.",
  ),
  API_KEY: optionalEnvText(),
  API_KEY_PRINCIPAL_ID: optionalEnvText(),
  REQUIRE_AUTH: optionalEnvBoolean(false),
  RBAC_ALLOW_ALL: optionalEnvBoolean(false),
  RATE_LIMIT_ENABLED: optionalEnvBoolean(true),
  RATE_LIMIT_MAX_TOKENS: z.preprocess(
    (value) => value === undefined || value === null || value === "" ? undefined : value,
    z.coerce.number({ error: "RATE_LIMIT_MAX_TOKENS must be a number." }).int().min(1, "RATE_LIMIT_MAX_TOKENS must be >= 1.").default(100),
  ),
  RATE_LIMIT_REFILL_RATE: z.preprocess(
    (value) => value === undefined || value === null || value === "" ? undefined : value,
    z.coerce.number({ error: "RATE_LIMIT_REFILL_RATE must be a number." }).min(0, "RATE_LIMIT_REFILL_RATE must be >= 0.").default(10),
  ),
  JWT_SHARED_SECRET: optionalEnvText().refine(
    (value) => value === undefined || Buffer.byteLength(value, "utf-8") >= 32,
    "JWT_SHARED_SECRET must be at least 32 bytes when provided.",
  ),
  JWT_PUBLIC_KEY_PEM: optionalEnvText(),
  JWT_EXPECTED_ISSUER: optionalEnvText(),
  JWT_EXPECTED_AUDIENCE: optionalEnvText(),
  JWT_PRINCIPAL_CLAIM: optionalEnvText().default("sub"),
  JWT_ROLE_CLAIM: optionalEnvText().default("roles"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const jwt = result.data.JWT_SHARED_SECRET || result.data.JWT_PUBLIC_KEY_PEM
    ? {
        sharedSecret: result.data.JWT_SHARED_SECRET,
        publicKeyPem: result.data.JWT_PUBLIC_KEY_PEM,
        expectedIssuer: result.data.JWT_EXPECTED_ISSUER,
        expectedAudience: result.data.JWT_EXPECTED_AUDIENCE,
        principalClaim: result.data.JWT_PRINCIPAL_CLAIM,
        roleClaim: result.data.JWT_ROLE_CLAIM,
      }
    : undefined;

  return {
    port: result.data.PORT,
    caseStoreDatabaseUrl: result.data.CASE_STORE_DATABASE_URL,
    caseStoreTableName: result.data.CASE_STORE_TABLE_NAME,
    workflowDispatchDatabaseUrl: result.data.WORKFLOW_DISPATCH_DATABASE_URL,
    workflowDispatchTableName: result.data.WORKFLOW_DISPATCH_TABLE_NAME,
    apiKey: result.data.API_KEY,
    apiKeyPrincipalId: result.data.API_KEY_PRINCIPAL_ID,
    requireAuth: result.data.REQUIRE_AUTH,
    rbacAllowAll: result.data.RBAC_ALLOW_ALL,
    rateLimitEnabled: result.data.RATE_LIMIT_ENABLED,
    rateLimitMaxTokens: result.data.RATE_LIMIT_MAX_TOKENS,
    rateLimitRefillRate: result.data.RATE_LIMIT_REFILL_RATE,
    jwt,
  };
}