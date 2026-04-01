import type { CaseStatus } from "../types";

export interface TransitionGuardResult {
  allowed: boolean;
  reason?: string;
}

export interface IStateMachineGuard {
  validateTransition(caseId: string, fromStatus: CaseStatus, toStatus: CaseStatus): Promise<TransitionGuardResult>;
  getAllowedTransitions(fromStatus: CaseStatus): CaseStatus[];
}
