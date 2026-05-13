import type { CasePermission, IRbacProvider, PermissionCheckResult, RbacAction, Role } from "../ports/IRbacProvider";

/**
 * Default role → permission mapping.
 * SYSTEM and ADMIN have full access.
 * REVIEWER can view cases and approve reviews.
 * OPERATOR can create cases, register samples, request workflows, and view cases.
 */
const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Role, readonly RbacAction[]>> = {
  SYSTEM: [
    "CREATE_CASE",
    "REGISTER_SAMPLE",
    "REQUEST_WORKFLOW",
    "APPROVE_REVIEW",
    "RELEASE_CASE",
    "VIEW_CASE",
    "ADMIN_OPERATIONS",
  ],
  ADMIN: [
    "CREATE_CASE",
    "REGISTER_SAMPLE",
    "REQUEST_WORKFLOW",
    "APPROVE_REVIEW",
    "RELEASE_CASE",
    "VIEW_CASE",
    "ADMIN_OPERATIONS",
  ],
  REVIEWER: ["VIEW_CASE", "APPROVE_REVIEW"],
  QUALITY_PERSON: ["VIEW_CASE", "RELEASE_CASE"],
  OPERATOR: ["CREATE_CASE", "REGISTER_SAMPLE", "REQUEST_WORKFLOW", "VIEW_CASE"],
};

export interface RbacProviderOptions {
  /** When true, all permission checks return allowed (backward-compatible default). */
  allowAll?: boolean;
  rolePermissions?: Record<Role, readonly RbacAction[]>;
}

export class InMemoryRbacProvider implements IRbacProvider {
  private readonly principalRoles = new Map<string, Set<Role>>();
  private readonly casePermissionsByCaseId = new Map<string, Map<string, Set<CasePermission>>>();
  private readonly allowAll: boolean;
  private readonly rolePermissions: Record<Role, readonly RbacAction[]>;

  constructor(options: RbacProviderOptions = {}) {
    this.allowAll = options.allowAll ?? false; // deny-by-default (hardening 2026-04)
    this.rolePermissions = options.rolePermissions ?? {
      ...DEFAULT_ROLE_PERMISSIONS,
    };
  }

  async checkPermission(principal: string, action: RbacAction, _resource?: string): Promise<PermissionCheckResult> {
    if (this.allowAll) {
      return { allowed: true };
    }

    const roles = this.principalRoles.get(principal);
    if (!roles || roles.size === 0) {
      return {
        allowed: false,
        reason: `Principal '${principal}' has no assigned roles`,
      };
    }

    for (const role of roles) {
      const permissions = this.rolePermissions[role];
      if (permissions && permissions.includes(action)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Principal '${principal}' lacks permission for action '${action}'`,
    };
  }

  async canAccessCase(principalId: string, caseId: string, requiredPermission: CasePermission): Promise<boolean> {
    if (this.allowAll) {
      return true;
    }

    const roles = await this.getPrincipalRoles(principalId);
    if (roles.includes("ADMIN") || roles.includes("SYSTEM")) {
      return true;
    }

    const principalCasePermissions = this.casePermissionsByCaseId.get(caseId)?.get(principalId);

    return Boolean(principalCasePermissions?.has(requiredPermission));
  }

  async getPrincipalRoles(principal: string): Promise<Role[]> {
    const roles = this.principalRoles.get(principal);
    return roles ? [...roles] : [];
  }

  async assignRole(principal: string, role: Role): Promise<void> {
    let roles = this.principalRoles.get(principal);
    if (!roles) {
      roles = new Set();
      this.principalRoles.set(principal, roles);
    }
    roles.add(role);
  }

  async revokeRole(principal: string, role: Role): Promise<void> {
    const roles = this.principalRoles.get(principal);
    if (roles) {
      roles.delete(role);
    }
  }

  async setCaseOwner(caseId: string, principalId: string): Promise<void> {
    await this.grantCaseAccess(caseId, principalId, ["VIEW_CASE", "MUTATE_CASE", "REVIEW_CASE", "RELEASE_CASE"]);
  }

  async grantCaseAccess(caseId: string, principalId: string, permissions: readonly CasePermission[]): Promise<void> {
    let casePermissions = this.casePermissionsByCaseId.get(caseId);
    if (!casePermissions) {
      casePermissions = new Map();
      this.casePermissionsByCaseId.set(caseId, casePermissions);
    }

    let principalPermissions = casePermissions.get(principalId);
    if (!principalPermissions) {
      principalPermissions = new Set();
      casePermissions.set(principalId, principalPermissions);
    }

    for (const permission of permissions) {
      principalPermissions.add(permission);
    }
  }
}

export { DEFAULT_ROLE_PERMISSIONS };
