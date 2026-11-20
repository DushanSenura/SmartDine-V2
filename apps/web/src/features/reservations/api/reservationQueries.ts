import type {
  CreatePrivateReservationInput,
  CreateReservationInput,
  CreateStaffReservationInput,
  ReservationDto,
  ReservationStatus,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function useMyReservations() {
  return useQuery({
    queryKey: ["reservations", "mine"],
    queryFn: ({ signal }) => apiRequest<ReservationDto[]>("/reservations/mine", { signal }),
  });
}

function useInvalidateReservations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["availability"] });
  };
}

export function useCreateReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiRequest<ReservationDto>("/reservations", { method: "POST", body: input }),
    onSettled: invalidate,
  });
}

export function useCreatePrivateReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (input: CreatePrivateReservationInput) =>
      apiRequest<ReservationDto>("/reservations/private", { method: "POST", body: input }),
    onSettled: invalidate,
  });
}

export function useCancelReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ReservationDto>(`/reservations/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

// ── Staff ────────────────────────────────────────────────────────

/** One day's bookings, or (with `date` null) everything that hasn't ended yet. */
export function useStaffReservations(branchId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: ["reservations", "staff", branchId, date ?? "upcoming"],
    queryFn: ({ signal }) =>
      apiRequest<ReservationDto[]>(
        `/reservations?branchId=${branchId}&${date ? `date=${date}` : "upcoming=true"}`,
        { signal },
      ),
    enabled: !!branchId,
  });
}

export function useSetReservationStatus() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: ReservationStatus;
      reason?: string;
    }) =>
      apiRequest<ReservationDto>(`/reservations/${id}/status`, {
        method: "PATCH",
        body: { status, reason },
      }),
    onSuccess: invalidate,
  });
}

export function useCreateStaffReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (input: CreateStaffReservationInput) =>
      apiRequest<ReservationDto>("/reservations/staff", { method: "POST", body: input }),
    onSettled: invalidate,
  });
}
