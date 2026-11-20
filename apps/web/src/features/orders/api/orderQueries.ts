import {
  SocketEvents,
  type CreateOrderInput,
  type KitchenStation,
  type KitchenTicketDto,
  type OrderDto,
  type OrderLineInput,
  type OrderStatus,
  type UpdateOrderInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

export function useOrders(
  branchId: string | undefined,
  scope: "active" | "history" = "active",
  options: { tableId?: string; status?: OrderStatus } = {},
) {
  const params = new URLSearchParams({ branchId: branchId ?? "", scope });
  if (options.tableId) params.set("tableId", options.tableId);
  if (options.status) params.set("status", options.status);
  return useQuery({
    queryKey: ["orders", "list", branchId, scope, options],
    queryFn: ({ signal }) => apiRequest<OrderDto[]>(`/orders?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: ({ signal }) => apiRequest<OrderDto>(`/orders/${id}`, { signal }),
    enabled: !!id,
  });
}

function useOrderMutation<TVars>(fn: (vars: TVars) => Promise<OrderDto | null>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

const post = (path: string, body?: unknown) =>
  apiRequest<OrderDto>(path, { method: "POST", body: body ?? {} });

export const useCreateOrder = () =>
  useOrderMutation(
    (input: CreateOrderInput | (Omit<CreateOrderInput, "items"> & { items: OrderLineInput[] })) =>
      post("/orders", input),
  );
export const useUpdateOrder = () =>
  useOrderMutation(({ id, input }: { id: string; input: UpdateOrderInput }) =>
    apiRequest<OrderDto>(`/orders/${id}`, { method: "PATCH", body: input }),
  );
export const useAddItems = () =>
  useOrderMutation(({ id, items }: { id: string; items: OrderLineInput[] }) =>
    post(`/orders/${id}/items`, { items }),
  );
export const useUpdateDraftItem = () =>
  useOrderMutation(
    ({
      id,
      itemId,
      ...input
    }: {
      id: string;
      itemId: string;
      quantity?: number;
      notes?: string | null;
    }) => apiRequest<OrderDto>(`/orders/${id}/items/${itemId}`, { method: "PATCH", body: input }),
  );
export const useCancelItem = () =>
  useOrderMutation(({ id, itemId, reason }: { id: string; itemId: string; reason?: string }) =>
    post(`/orders/${id}/items/${itemId}/cancel`, { reason }),
  );
export const useSubmitOrder = () => useOrderMutation((id: string) => post(`/orders/${id}/submit`));
export const useApproveOrder = () =>
  useOrderMutation((id: string) => post(`/orders/${id}/approve`));
export const useRejectOrder = () =>
  useOrderMutation(({ id, reason }: { id: string; reason?: string }) =>
    post(`/orders/${id}/reject`, { reason }),
  );
export const useCancelOrder = () =>
  useOrderMutation(({ id, reason }: { id: string; reason?: string }) =>
    post(`/orders/${id}/cancel`, { reason }),
  );
export const useServeItems = () =>
  useOrderMutation(({ id, itemIds }: { id: string; itemIds?: string[] }) =>
    post(`/orders/${id}/serve`, { itemIds }),
  );
export const useRequestPayment = () =>
  useOrderMutation((id: string) => post(`/orders/${id}/request-payment`));

// ── Kitchen ──────────────────────────────────────────────────────

export function useKitchenTickets(branchId: string | undefined, station?: KitchenStation) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  if (station) params.set("station", station);
  return useQuery({
    queryKey: ["kitchen", "tickets", branchId, station ?? "all"],
    queryFn: ({ signal }) =>
      apiRequest<KitchenTicketDto[]>(`/kitchen/tickets?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export const useSetKitchenItem = () =>
  useOrderMutation(({ itemId, status }: { itemId: string; status: "PREPARING" | "PREPARED" }) =>
    apiRequest<null>(`/kitchen/items/${itemId}/status`, { method: "PATCH", body: { status } }).then(
      () => null,
    ),
  );
export const useMarkTicketReady = () =>
  useOrderMutation(({ orderId, station }: { orderId: string; station?: KitchenStation }) =>
    apiRequest<null>(`/kitchen/orders/${orderId}/ready`, {
      method: "POST",
      body: { station },
    }).then(() => null),
  );

/**
 * Order changes made anywhere refresh every order and kitchen screen. The event carries only ids,
 * so each screen refetches through its own authorised endpoint (the kitchen never receives prices).
 */
export function useLiveOrders(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["kitchen"] });
    };
    socket.on(SocketEvents.ORDER_CHANGED, refresh);
    // Anything missed while offline is recovered on reconnect.
    socket.io.on("reconnect", refresh);
    return () => {
      socket.off(SocketEvents.ORDER_CHANGED, refresh);
      socket.io.off("reconnect", refresh);
    };
  }, [branchId, queryClient]);
}
