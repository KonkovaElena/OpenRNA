export const roles = ["OPERATOR", "REVIEWER", "QUALITY_PERSON", "ADMIN", "SYSTEM"] as const;
export type Role = (typeof roles)[number];

export const rbacActions = [
  "CREATE_CASE",
  "REGISTER_SAMPLE",
  "REQUEST_WORKFLOW",
  "APPROVE_REVIEW",
  "RELEASE_CASE",
  "VIEW_CASE",
  "ADMIN_OPERATIONS",
] as const;
export type RbacAction = (typeof rbacActions)[number];

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface IRbacProvider {
  checkPermission(principal: string, action: RbacAction, resource?: string): Promise<PermissionCheckResult>;
  getPrincipalRoles(principal: string): Promise<Role[]>;
  assignRole(principal: string, role: Role): Promise<void>;
  revokeRole(principal: string, role: Role): Promise<void>;
}
