import type { CreateStaffInput, StaffDto, UpdateStaffInput } from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export const staffKeys = {
  list: (branchId?: string, role?: string) => ["staff", branchId, role] as const,
};

export function useStaff(branchId: string | undefined, role?: string, enabled = true) {
  const params = new URLSearchParams({ pageSize: "100" });
  if (branchId) params.set("branchId", branchId);
  if (role) params.set("role", role);
  return useQuery({
    queryKey: staffKeys.list(branchId, role),
    queryFn: ({ signal }) => apiRequest<StaffDto[]>(`/staff?${params}`, { signal }),
    enabled: !!branchId && enabled,
  });
}

export function useSaveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateStaffInput | UpdateStaffInput }) =>
      id
        ? apiRequest<StaffDto>(`/staff/${id}`, { method: "PATCH", body: input })
        : apiRequest<StaffDto>("/staff", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}
