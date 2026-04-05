import { Pool, type PoolConfig } from "pg";

const DEFAULT_POOL_CONFIG: Omit<PoolConfig, "connectionString"> = {
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
};

export function createPostgresPool(
  connectionString: string,
  overrides: Omit<PoolConfig, "connectionString"> = {},
): Pool {
  return new Pool({
    connectionString,
    ...DEFAULT_POOL_CONFIG,
    ...overrides,
  });
}