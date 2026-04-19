import test from "node:test";
import assert from "node:assert/strict";
import { assertSecurityPosture } from "../src/bootstrap/security-posture";

test("assertSecurityPosture reports auth configured when API key is present", () => {
  const posture = assertSecurityPosture({
    apiKey: "secret-key-42",
    jwt: undefined,
    requireAuth: true,
    rbacAllowAll: false,
  });

  assert.equal(posture.hasAuthenticationConfig, true);
});

test("assertSecurityPosture rejects strict mode without auth config", () => {
  assert.throws(
    () =>
      assertSecurityPosture({
        apiKey: undefined,
        jwt: undefined,
        requireAuth: true,
        rbacAllowAll: false,
      }),
    /REQUIRE_AUTH=true requires API_KEY or JWT_SHARED_SECRET\/JWT_PUBLIC_KEY_PEM/,
  );
});

test("assertSecurityPosture rejects strict mode with permissive RBAC", () => {
  assert.throws(
    () =>
      assertSecurityPosture({
        apiKey: "secret-key-42",
        jwt: undefined,
        requireAuth: true,
        rbacAllowAll: true,
      }),
    /REQUIRE_AUTH=true cannot be used with RBAC_ALLOW_ALL=true/,
  );
});

test("assertSecurityPosture allows non-strict mode without auth config", () => {
  const posture = assertSecurityPosture({
    apiKey: undefined,
    jwt: undefined,
    requireAuth: false,
    rbacAllowAll: false,
  });

  assert.equal(posture.hasAuthenticationConfig, false);
});
