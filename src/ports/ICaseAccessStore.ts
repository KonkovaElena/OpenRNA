export type CaseAccessLevel = "OWNER" | "REVIEWER" | "MANUFACTURING";

export interface CaseAccessGrant {
  caseId: string;
  principalId: string;
  accessLevel: CaseAccessLevel;
  grantedAt: string;
}

export interface ICaseAccessStore {
  setOwner(caseId: string, principalId: string): Promise<void>;
  grantAccess(caseId: string, principalId: string, accessLevel: CaseAccessLevel): Promise<void>;
  revokeAccess(caseId: string, principalId: string, accessLevel?: CaseAccessLevel): Promise<void>;
  canAccess(caseId: string, principalId: string): Promise<boolean>;
  listAccessibleCaseIds(principalId: string): Promise<string[]>;
}
