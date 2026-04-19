import { hasAuthenticationConfig } from "../auth";
import type { AppConfig } from "../config";

type SecurityConfig = Pick<AppConfig, "apiKey" | "jwt" | "requireAuth" | "rbacAllowAll">;

export interface SecurityPosture {
  hasAuthenticationConfig: boolean;
}

export function assertSecurityPosture(config: SecurityConfig): SecurityPosture {
  const authConfigured = hasAuthenticationConfig({
    apiKey: config.apiKey,
    jwt: config.jwt,
  });

  if (config.requireAuth && !authConfigured) {
    throw new Error("REQUIRE_AUTH=true requires API_KEY or JWT_SHARED_SECRET/JWT_PUBLIC_KEY_PEM.");
  }

  if (config.requireAuth && config.rbacAllowAll) {
    throw new Error("REQUIRE_AUTH=true cannot be used with RBAC_ALLOW_ALL=true.");
  }

  return {
    hasAuthenticationConfig: authConfigured,
  };
}
