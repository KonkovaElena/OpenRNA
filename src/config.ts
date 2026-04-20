import { z } from "zod";

export interface AppConfig {
  port: number;
  caseStoreDatabaseUrl?: string;
  caseStoreTableName: string;
  workflowDispatchDatabaseUrl?: string;
  workflowDispatchTableName: string;
  apiKey?: string;
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
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return {
    port: result.data.PORT,
    caseStoreDatabaseUrl: result.data.CASE_STORE_DATABASE_URL,
    caseStoreTableName: result.data.CASE_STORE_TABLE_NAME,
    workflowDispatchDatabaseUrl: result.data.WORKFLOW_DISPATCH_DATABASE_URL,
    workflowDispatchTableName: result.data.WORKFLOW_DISPATCH_TABLE_NAME,
    apiKey: result.data.API_KEY,
  };
}