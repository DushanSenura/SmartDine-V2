import type {
  BillDto,
  CustomerDetailDto,
  CustomerLookupDto,
  CustomerSummaryDto,
  LoyaltyAccountDto,
  LoyaltyAdjustInput,
  ReceiptDto,
  UpdateCustomerInput,
  UpdateMyProfileInput,
} from "@smartdine/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

// ── Staff: the customer book ─────────────────────────────────────

export interface CustomerPage {
  data: CustomerSummaryDto[];
  meta: { total: number; page: number; pageSize: number };
}

export function useCustomers(q: string, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set("q", q);
  return useQuery({
    queryKey: ["customers", "list", q, page],
    queryFn: ({ signal }) =>
      apiRequest<CustomerPage>(`/customers?${params}`, { signal, envelope: true }),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: ({ signal }) => apiRequest<CustomerDetailDto>(`/customers/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      apiRequest<CustomerDetailDto>(`/customers/${id}`, { method: "PATCH", body: input }),
    onSuccess: (customer) => {
      queryClient.setQueryData(["customers", "detail", customer.id], customer);
      void queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
    },
  });
}

export function useAdjustPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LoyaltyAdjustInput }) =>
      apiRequest<LoyaltyAccountDto>(`/customers/${id}/loyalty`, { method: "POST", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

/** Search used at the till to find the customer to attach to a bill. */
export function useCustomerLookup(q: string) {
  return useQuery({
    queryKey: ["customers", "lookup", q],
    queryFn: ({ signal }) =>
      apiRequest<CustomerLookupDto[]>(`/customers/lookup?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.trim().length >= 2,
  });
}

// ── Till: customer, promo code and points on a bill ──────────────

function useBillAction<TVars>(fn: (vars: TVars) => Promise<BillDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (bill) => {
      queryClient.setQueryData(["bills", "detail", bill.id], bill);
      for (const key of ["bills", "payments", "orders", "receipts", "customers"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const useAttachCustomer = () =>
  useBillAction(({ billId, customerId }: { billId: string; customerId: string | null }) =>
    apiRequest<BillDto>(`/bills/${billId}/customer`, { method: "PUT", body: { customerId } }),
  );
export const useApplyPromo = () =>
  useBillAction(({ billId, code }: { billId: string; code: string }) =>
    apiRequest<BillDto>(`/bills/${billId}/promo`, { method: "PUT", body: { code } }),
  );
export const useRemovePromo = () =>
  useBillAction((billId: string) =>
    apiRequest<BillDto>(`/bills/${billId}/promo`, { method: "DELETE" }),
  );
export const useRedeemPoints = () =>
  useBillAction(({ billId, points }: { billId: string; points: number }) =>
    apiRequest<BillDto>(`/bills/${billId}/redeem`, { method: "POST", body: { points } }),
  );

// ── The signed-in customer ───────────────────────────────────────

export function useMyProfile() {
  return useQuery({
    queryKey: ["customers", "me"],
    queryFn: ({ signal }) => apiRequest<CustomerDetailDto>("/customers/me", { signal }),
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMyProfileInput) =>
      apiRequest<CustomerDetailDto>("/customers/me", { method: "PATCH", body: input }),
    onSuccess: (profile) => queryClient.setQueryData(["customers", "me"], profile),
  });
}

export function useMyLoyalty() {
  return useQuery({
    queryKey: ["customers", "me", "loyalty"],
    queryFn: ({ signal }) => apiRequest<LoyaltyAccountDto>("/customers/me/loyalty", { signal }),
  });
}

export interface InvoiceDto {
  billId: string;
  billNumber: string;
  receiptId: string | null;
  branchName: string;
  currency: string;
  location: string;
  total: number;
  refundedAmount: number;
  pointsEarned: number;
  paidAt: string | null;
}

export function useMyInvoices() {
  return useQuery({
    queryKey: ["customers", "me", "invoices"],
    queryFn: ({ signal }) => apiRequest<InvoiceDto[]>("/customers/me/invoices", { signal }),
  });
}

export function useMyReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", "me", "receipt", id],
    queryFn: ({ signal }) => apiRequest<ReceiptDto>(`/customers/me/receipts/${id}`, { signal }),
    enabled: !!id,
  });
}

// ── Favourites ───────────────────────────────────────────────────

export function useFavourites(enabled = true) {
  return useQuery({
    queryKey: ["favourites"],
    queryFn: ({ signal }) => apiRequest<string[]>("/favourites", { signal }),
    enabled,
  });
}

export function useToggleFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, saved }: { menuItemId: string; saved: boolean }) =>
      apiRequest<null>(`/favourites/${menuItemId}`, { method: saved ? "DELETE" : "PUT" }),
    // Flip the heart immediately; roll back if the server refuses.
    onMutate: async ({ menuItemId, saved }) => {
      await queryClient.cancelQueries({ queryKey: ["favourites"] });
      const previous = queryClient.getQueryData<string[]>(["favourites"]) ?? [];
      queryClient.setQueryData<string[]>(
        ["favourites"],
        saved ? previous.filter((id) => id !== menuItemId) : [menuItemId, ...previous],
      );
      return { previous };
    },
    onError: (_error, _vars, context) =>
      queryClient.setQueryData(["favourites"], context?.previous),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["favourites"] }),
  });
}
