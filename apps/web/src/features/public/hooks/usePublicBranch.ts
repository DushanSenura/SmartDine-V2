import { usePublicBranchStore } from "@/stores/publicBranchStore";

import { usePublicBranches, usePublicCompany } from "../api/publicQueries";

/** The branch the visitor is browsing: their saved choice, else the first open branch. */
export function usePublicBranch() {
  const branches = usePublicBranches();
  const company = usePublicCompany();
  const savedId = usePublicBranchStore((s) => s.branchId);
  const select = usePublicBranchStore((s) => s.select);

  const list = branches.data ?? [];
  const branch =
    list.find((b) => b.id === savedId) ?? list.find((b) => b.status === "OPEN") ?? list[0];

  return {
    branch,
    branches: list,
    select,
    currency: branch?.currency ?? company.data?.currency ?? "LKR",
    company: company.data,
    isPending: branches.isPending,
    isError: branches.isError,
  };
}
