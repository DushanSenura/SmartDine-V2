import { AppError } from "../errors/AppError";
import type { AuthContext } from "../../types/express";

/**
 * Branch-level data isolation (IDOR protection). Owners reach every branch; all other staff
 * are confined to the branch on their account. Call this for every resource that belongs to a branch.
 */
export function assertBranchAccess(auth: AuthContext, branchId: string): void {
  if (auth.role === "OWNER") return;
  if (auth.branchId !== branchId) {
    throw AppError.forbidden("You do not have access to this branch.");
  }
}

/** For list endpoints. Owners may omit the branch (= all); everyone else is forced to their own. */
export function scopeBranch(auth: AuthContext, requested?: string): string | undefined {
  if (auth.role === "OWNER") return requested;
  if (!auth.branchId) throw AppError.forbidden("Your account is not assigned to a branch.");
  if (requested && requested !== auth.branchId) {
    throw AppError.forbidden("You do not have access to this branch.");
  }
  return auth.branchId;
}

/** Like `scopeBranch` but a branch must be determinable (owners must pass one explicitly). */
export function requireBranch(auth: AuthContext, requested?: string): string {
  const branchId = scopeBranch(auth, requested);
  if (!branchId) throw AppError.validation("branchId is required.");
  return branchId;
}
