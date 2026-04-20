import type { CaseAccessLevel, ICaseAccessStore } from "../ports/ICaseAccessStore";

interface StoredGrant {
  principalId: string;
  accessLevel: CaseAccessLevel;
  grantedAt: string;
}

export class InMemoryCaseAccessStore implements ICaseAccessStore {
  private readonly grantsByCaseId = new Map<string, StoredGrant[]>();

  async setOwner(caseId: string, principalId: string): Promise<void> {
    const grants = this.grantsByCaseId.get(caseId) ?? [];
    const hasOwner = grants.some((grant) => grant.principalId === principalId && grant.accessLevel === "OWNER");
    if (hasOwner) {
      return;
    }

    grants.push({
      principalId,
      accessLevel: "OWNER",
      grantedAt: new Date().toISOString(),
    });
    this.grantsByCaseId.set(caseId, grants);
  }

  async grantAccess(caseId: string, principalId: string, accessLevel: CaseAccessLevel): Promise<void> {
    const grants = this.grantsByCaseId.get(caseId) ?? [];
    const exists = grants.some(
      (grant) => grant.principalId === principalId && grant.accessLevel === accessLevel,
    );
    if (exists) {
      return;
    }

    grants.push({
      principalId,
      accessLevel,
      grantedAt: new Date().toISOString(),
    });
    this.grantsByCaseId.set(caseId, grants);
  }

  async revokeAccess(caseId: string, principalId: string, accessLevel?: CaseAccessLevel): Promise<void> {
    const grants = this.grantsByCaseId.get(caseId);
    if (!grants) {
      return;
    }

    const filtered = grants.filter((grant) => {
      if (grant.principalId !== principalId) {
        return true;
      }

      if (!accessLevel) {
        return false;
      }

      return grant.accessLevel !== accessLevel;
    });

    if (filtered.length === 0) {
      this.grantsByCaseId.delete(caseId);
      return;
    }

    this.grantsByCaseId.set(caseId, filtered);
  }

  async canAccess(caseId: string, principalId: string): Promise<boolean> {
    const grants = this.grantsByCaseId.get(caseId);
    if (!grants || grants.length === 0) {
      // Transitional behavior for legacy records without ACL rows.
      return true;
    }

    return grants.some((grant) => grant.principalId === principalId);
  }

  async listAccessibleCaseIds(principalId: string): Promise<string[]> {
    const result: string[] = [];
    for (const [caseId, grants] of this.grantsByCaseId) {
      if (grants.some((grant) => grant.principalId === principalId)) {
        result.push(caseId);
      }
    }

    return result;
  }
}
