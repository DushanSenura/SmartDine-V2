import type { PromotionDto, PromotionInput, PublicOfferDto } from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function usePromotions() {
  return useQuery({
    queryKey: ["promotions"],
    queryFn: ({ signal }) => apiRequest<PromotionDto[]>("/promotions", { signal }),
  });
}

export function useSavePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<PromotionInput> }) =>
      id
        ? apiRequest<PromotionDto>(`/promotions/${id}`, { method: "PATCH", body: input })
        : apiRequest<PromotionDto>("/promotions", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "offers"] });
    },
  });
}

export function useArchivePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "offers"] });
    },
  });
}

export function usePublicOffers(branchId: string | undefined) {
  return useQuery({
    queryKey: ["public", "offers", branchId],
    queryFn: ({ signal }) =>
      apiRequest<PublicOfferDto[]>(`/public/offers?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}
