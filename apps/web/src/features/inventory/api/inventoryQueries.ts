import type {
  CreateInventoryItemInput,
  InventoryItemDto,
  InventoryStatus,
  InventorySummaryDto,
  StockMovementInput,
  StockTransactionDto,
  StockTransactionType,
  SupplierDto,
  SupplierInput,
  UpdateInventoryItemInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function useInventoryItems(
  branchId: string | undefined,
  filters: { status?: InventoryStatus; q?: string; category?: string } = {},
) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return useQuery({
    queryKey: ["inventory", "items", branchId, filters],
    queryFn: ({ signal }) =>
      apiRequest<InventoryItemDto[]>(`/inventory/items?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useInventorySummary(branchId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "summary", branchId],
    queryFn: ({ signal }) =>
      apiRequest<InventorySummaryDto>(`/inventory/summary?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useStockTransactions(
  branchId: string | undefined,
  filters: { itemId?: string; type?: StockTransactionType; from?: string; to?: string } = {},
) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return useQuery({
    queryKey: ["inventory", "transactions", branchId, filters],
    queryFn: ({ signal }) =>
      apiRequest<StockTransactionDto[]>(`/inventory/transactions?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: ({ signal }) => apiRequest<SupplierDto[]>("/suppliers", { signal }),
  });
}

function useInventoryMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export const useCreateItem = () =>
  useInventoryMutation(
    (input: CreateInventoryItemInput | (Omit<CreateInventoryItemInput, "sku"> & { sku: string })) =>
      apiRequest<InventoryItemDto>("/inventory/items", { method: "POST", body: input }),
  );
export const useUpdateItem = () =>
  useInventoryMutation(({ id, input }: { id: string; input: UpdateInventoryItemInput }) =>
    apiRequest<InventoryItemDto>(`/inventory/items/${id}`, { method: "PATCH", body: input }),
  );
export const useArchiveItem = () =>
  useInventoryMutation((id: string) =>
    apiRequest<null>(`/inventory/items/${id}`, { method: "DELETE" }),
  );
export const useMoveStock = () =>
  useInventoryMutation(({ id, input }: { id: string; input: StockMovementInput }) =>
    apiRequest<InventoryItemDto>(`/inventory/items/${id}/movements`, {
      method: "POST",
      body: input,
    }),
  );
export const useSaveSupplier = () =>
  useInventoryMutation(({ id, input }: { id?: string; input: Partial<SupplierInput> }) =>
    id
      ? apiRequest<SupplierDto>(`/suppliers/${id}`, { method: "PATCH", body: input })
      : apiRequest<SupplierDto>("/suppliers", { method: "POST", body: input }),
  );
export const useArchiveSupplier = () =>
  useInventoryMutation((id: string) => apiRequest<null>(`/suppliers/${id}`, { method: "DELETE" }));
