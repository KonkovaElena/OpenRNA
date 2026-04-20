import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRbacProvider } from "../src/adapters/InMemoryRbacProvider";

test("RBAC Provider", async (t) => {
  await t.test("default mode denies unassigned principals (deny-by-default)", async () => {
    const provider = new InMemoryRbacProvider();
    const result = await provider.checkPermission("unknown-principal", "CREATE_CASE");
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason);
  });

  await t.test("allowAll mode permits any action (explicit opt-in)", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: true });
    const result = await provider.checkPermission("unknown-principal", "CREATE_CASE");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("strict mode denies unassigned principals", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    const result = await provider.checkPermission("unknown-principal", "CREATE_CASE");
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason);
  });

  await t.test("assigns role and permits corresponding action", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "OPERATOR");
    const result = await provider.checkPermission("user-1", "CREATE_CASE");
    assert.strictEqual(result.allowed, true);
  });

  await t.test("OPERATOR cannot APPROVE_REVIEW", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "OPERATOR");
    const result = await provider.checkPermission("user-1", "APPROVE_REVIEW");
    assert.strictEqual(result.allowed, false);
  });

  await t.test("REVIEWER can APPROVE_REVIEW and VIEW_CASE", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "REVIEWER");
    const approve = await provider.checkPermission("user-1", "APPROVE_REVIEW");
    assert.strictEqual(approve.allowed, true);
    const view = await provider.checkPermission("user-1", "VIEW_CASE");
    assert.strictEqual(view.allowed, true);
  });

  await t.test("ADMIN has all permissions", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("admin-1", "ADMIN");
    for (const action of ["CREATE_CASE", "REGISTER_SAMPLE", "REQUEST_WORKFLOW", "APPROVE_REVIEW", "VIEW_CASE", "ADMIN_OPERATIONS"] as const) {
      const result = await provider.checkPermission("admin-1", action);
      assert.strictEqual(result.allowed, true, `ADMIN should have ${action}`);
    }
  });

  await t.test("revokeRole removes access", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "OPERATOR");
    const before = await provider.checkPermission("user-1", "CREATE_CASE");
    assert.strictEqual(before.allowed, true);

    await provider.revokeRole("user-1", "OPERATOR");
    const after = await provider.checkPermission("user-1", "CREATE_CASE");
    assert.strictEqual(after.allowed, false);
  });

  await t.test("getPrincipalRoles returns assigned roles", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "OPERATOR");
    await provider.assignRole("user-1", "REVIEWER");
    const roles = await provider.getPrincipalRoles("user-1");
    assert.deepStrictEqual(roles.sort(), ["OPERATOR", "REVIEWER"]);
  });

  await t.test("multiple roles union permissions", async () => {
    const provider = new InMemoryRbacProvider({ allowAll: false });
    await provider.assignRole("user-1", "OPERATOR");
    await provider.assignRole("user-1", "REVIEWER");
    // OPERATOR has CREATE_CASE, REVIEWER has APPROVE_REVIEW
    const create = await provider.checkPermission("user-1", "CREATE_CASE");
    const approve = await provider.checkPermission("user-1", "APPROVE_REVIEW");
    assert.strictEqual(create.allowed, true);
    assert.strictEqual(approve.allowed, true);
  });
});
