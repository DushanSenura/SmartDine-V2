import type {
  PaymentMethod,
  UpdateCompanyInput,
  UpdateCompanySettingsInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export interface SettingsDto {
  company: {
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  settings: {
    taxRatePercent: number;
    serviceChargePercent: number;
    reservationDurationMinutes: number;
    cancellationWindowHours: number;
    receiptFooter: string | null;
    roomDepositPercent: number;
    checkInTime: string;
    checkOutTime: string;
    loyaltyEnabled: boolean;
    loyaltyCurrencyPerPoint: number;
    loyaltyPointValue: number;
    cashierDiscountLimitPercent: number;
    enabledPaymentMethods: Exclude<PaymentMethod, "LOYALTY_POINTS">[];
  };
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: ({ signal }) => apiRequest<SettingsDto>("/settings", { signal }),
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { company?: UpdateCompanyInput; settings?: UpdateCompanySettingsInput }) =>
      apiRequest<SettingsDto>("/settings", { method: "PUT", body: input }),
    onSuccess: (data) => queryClient.setQueryData(["settings"], data),
  });
}
