import type {
  CreateReviewInput,
  ModerateReviewInput,
  ReviewableDto,
  ReviewDto,
  ReviewStatus,
  ReviewSummaryDto,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function useReviews(branchId: string | undefined, status?: ReviewStatus) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  if (status) params.set("status", status);
  return useQuery({
    queryKey: ["reviews", "list", branchId, status],
    queryFn: ({ signal }) => apiRequest<ReviewDto[]>(`/reviews?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useModerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ModerateReviewInput }) =>
      apiRequest<ReviewDto>(`/reviews/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
    },
  });
}

export function usePublicReviews(branchId: string | undefined) {
  return useQuery({
    queryKey: ["public", "reviews", branchId],
    queryFn: ({ signal }) =>
      apiRequest<ReviewSummaryDto>(`/public/reviews?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

// ── Customer ─────────────────────────────────────────────────────

export function useMyReviews() {
  return useQuery({
    queryKey: ["reviews", "mine"],
    queryFn: ({ signal }) => apiRequest<ReviewDto[]>("/reviews/mine", { signal }),
  });
}

export function useReviewable() {
  return useQuery({
    queryKey: ["reviews", "reviewable"],
    queryFn: ({ signal }) => apiRequest<ReviewableDto[]>("/reviews/reviewable", { signal }),
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) =>
      apiRequest<ReviewDto>("/reviews", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
    },
  });
}
