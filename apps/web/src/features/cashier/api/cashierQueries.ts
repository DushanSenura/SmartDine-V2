import {
  SocketEvents,
  type ApplyDiscountInput,
  type BillDto,
  type BillQueueItemDto,
  type FolioDto,
  type PayBillInput,
  type PaymentDto,
  type PaymentMethod,
  type PaymentSummaryDto,
  type ReceiptDto,
  type RefundInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

export function useBillQueue(branchId: string | undefined) {
  return useQuery({
    queryKey: ["bills", "queue", branchId],
    queryFn: ({ signal }) =>
      apiRequest<BillQueueItemDto[]>(`/bills/queue?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function usePaymentSummary(branchId: string | undefined, scope: "mine" | "branch" = "mine") {
  return useQuery({
    queryKey: ["payments", "summary", branchId, scope],
    queryFn: ({ signal }) =>
      apiRequest<PaymentSummaryDto>(`/payments/summary?branchId=${branchId}&scope=${scope}`, {
        signal,
      }),
    enabled: !!branchId,
  });
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: ["bills", "detail", id],
    queryFn: ({ signal }) => apiRequest<BillDto>(`/bills/${id}`, { signal }),
    enabled: !!id,
  });
}

export function usePayments(
  branchId: string | undefined,
  filters: { from?: string; to?: string; method?: PaymentMethod },
) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.method) params.set("method", filters.method);
  return useQuery({
    queryKey: ["payments", "list", branchId, filters],
    queryFn: ({ signal }) => apiRequest<PaymentDto[]>(`/payments?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["receipts", id],
    queryFn: ({ signal }) => apiRequest<ReceiptDto>(`/receipts/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useEmailReceipt() {
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to?: string }) =>
      apiRequest<{ sentTo: string }>(`/receipts/${id}/email`, {
        method: "POST",
        body: to ? { to } : {},
      }),
  });
}

export function useFolio(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["folios", bookingId],
    queryFn: ({ signal }) => apiRequest<FolioDto>(`/folios/${bookingId}`, { signal }),
    enabled: !!bookingId,
  });
}

function useBillMutation<TVars>(fn: (vars: TVars) => Promise<BillDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (bill) => {
      queryClient.setQueryData(["bills", "detail", bill.id], bill);
      for (const key of ["bills", "payments", "orders", "receipts", "folios"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const useGenerateBill = () =>
  useBillMutation((orderId: string) =>
    apiRequest<BillDto>("/bills", { method: "POST", body: { orderId } }),
  );
export const useApplyDiscount = () =>
  useBillMutation(({ id, input }: { id: string; input: ApplyDiscountInput }) =>
    apiRequest<BillDto>(`/bills/${id}/discount`, { method: "PATCH", body: input }),
  );
export const usePayBill = () =>
  useBillMutation(({ id, input }: { id: string; input: PayBillInput }) =>
    apiRequest<BillDto>(`/bills/${id}/payments`, { method: "POST", body: input }),
  );
export const useRefundPayment = () =>
  useBillMutation(({ paymentId, input }: { paymentId: string; input: RefundInput }) =>
    apiRequest<BillDto>(`/payments/${paymentId}/refund`, { method: "POST", body: input }),
  );

/**
 * Payment and order events refresh the till. Events carry ids only; each screen refetches through
 * its own authorised endpoint, and a reconnect recovers anything missed while offline.
 */
export function useLivePayments(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const refresh = () => {
      for (const key of ["bills", "payments", "orders"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    socket.on(SocketEvents.PAYMENT_CHANGED, refresh);
    socket.on(SocketEvents.ORDER_CHANGED, refresh);
    socket.io.on("reconnect", refresh);
    return () => {
      socket.off(SocketEvents.PAYMENT_CHANGED, refresh);
      socket.off(SocketEvents.ORDER_CHANGED, refresh);
      socket.io.off("reconnect", refresh);
    };
  }, [branchId, queryClient]);
}
