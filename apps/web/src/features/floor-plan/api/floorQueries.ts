import type {
  CreateDiningAreaInput,
  CreateTableInput,
  DiningAreaDto,
  SaveLayoutInput,
  TableDto,
  TableStatus,
  UpdateDiningAreaInput,
  UpdateTableInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export const floorKeys = {
  tables: (branchId?: string) => ["tables", branchId] as const,
  areas: (branchId?: string) => ["areas", branchId] as const,
};

export function useTables(branchId: string | undefined) {
  return useQuery({
    queryKey: floorKeys.tables(branchId),
    queryFn: ({ signal }) => apiRequest<TableDto[]>(`/tables?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useAreas(branchId: string | undefined) {
  return useQuery({
    queryKey: floorKeys.areas(branchId),
    queryFn: ({ signal }) =>
      apiRequest<DiningAreaDto[]>(`/tables/areas?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

/** Writes are followed by a refetch; live socket events keep other screens in sync. */
function useFloorMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tables"] });
      void queryClient.invalidateQueries({ queryKey: ["areas"] });
    },
  });
}

export const useSaveArea = () =>
  useFloorMutation(
    ({ id, input }: { id?: string; input: CreateDiningAreaInput | UpdateDiningAreaInput }) =>
      id
        ? apiRequest<DiningAreaDto>(`/tables/areas/${id}`, { method: "PATCH", body: input })
        : apiRequest<DiningAreaDto>("/tables/areas", { method: "POST", body: input }),
  );

export const useDeleteArea = () =>
  useFloorMutation((id: string) => apiRequest<null>(`/tables/areas/${id}`, { method: "DELETE" }));

export const useSaveTable = () =>
  useFloorMutation(({ id, input }: { id?: string; input: CreateTableInput | UpdateTableInput }) =>
    id
      ? apiRequest<TableDto>(`/tables/${id}`, { method: "PATCH", body: input })
      : apiRequest<TableDto>("/tables", { method: "POST", body: input }),
  );

export const useDeleteTable = () =>
  useFloorMutation((id: string) => apiRequest<null>(`/tables/${id}`, { method: "DELETE" }));

export const useSetTableStatus = () =>
  useFloorMutation(({ id, status }: { id: string; status: TableStatus }) =>
    apiRequest<TableDto>(`/tables/${id}/status`, { method: "PATCH", body: { status } }),
  );

export const useSaveLayout = () =>
  useFloorMutation((input: SaveLayoutInput) =>
    apiRequest<TableDto[]>("/tables/layout", { method: "PUT", body: input }),
  );

export const useAssignWaiter = () =>
  useFloorMutation((vars: { tableIds: string[]; waiterId: string | null }) =>
    apiRequest<TableDto[]>("/tables/assign-waiter", { method: "POST", body: vars }),
  );
