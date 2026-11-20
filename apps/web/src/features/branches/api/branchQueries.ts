import type { BranchDto, CreateBranchInput, UpdateBranchInput } from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export const branchKeys = { all: ["branches"] as const };

export function useBranches() {
  return useQuery({
    queryKey: branchKeys.all,
    queryFn: ({ signal }) => apiRequest<BranchDto[]>("/branches", { signal }),
  });
}

export function useSaveBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateBranchInput | UpdateBranchInput }) =>
      id
        ? apiRequest<BranchDto>(`/branches/${id}`, { method: "PATCH", body: input })
        : apiRequest<BranchDto>("/branches", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: branchKeys.all }),
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/branches/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: branchKeys.all }),
  });
}
