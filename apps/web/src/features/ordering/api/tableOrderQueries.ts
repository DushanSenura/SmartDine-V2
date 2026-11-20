import type { OrderDto, TableLookupDto, TableOrderInput, WaiterOptionDto } from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export const tableOrderKeys = {
  mine: ["table-orders", "mine"] as const,
  waiters: (branchId?: string) => ["table-orders", "waiters", branchId] as const,
};

/** Waiters the guest may ask for at this branch. */
export function useWaiterOptions(branchId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: tableOrderKeys.waiters(branchId),
    queryFn: ({ signal }) =>
      apiRequest<WaiterOptionDto[]>(`/table-orders/waiters?branchId=${branchId}`, { signal }),
    enabled: enabled && !!branchId,
    staleTime: 60_000,
  });
}

/** Checks a typed table number so a typo is caught before anything is ordered. */
export const lookupTable = (branchId: string, tableNumber: string) =>
  apiRequest<TableLookupDto>(
    `/table-orders/table?branchId=${branchId}&tableNumber=${encodeURIComponent(tableNumber)}`,
  );

/** The guest's own recent orders; refreshed while the page is open so progress shows up. */
export function useMyTableOrders(enabled: boolean) {
  return useQuery({
    queryKey: tableOrderKeys.mine,
    queryFn: ({ signal }) => apiRequest<OrderDto[]>("/table-orders/mine", { signal }),
    enabled,
    refetchInterval: 8_000,
  });
}

export function usePlaceTableOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TableOrderInput) =>
      apiRequest<OrderDto>("/table-orders", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tableOrderKeys.mine }),
  });
}
