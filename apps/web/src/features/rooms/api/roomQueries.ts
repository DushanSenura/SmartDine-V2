import {
  SocketEvents,
  type CreateExtraInput,
  type CreateRoomBookingInput,
  type CreateRoomInput,
  type CreateRoomTypeInput,
  type CreateStaffRoomBookingInput,
  type HousekeepingStatus,
  type HousekeepingTaskDto,
  type RoomAvailabilityDto,
  type RoomBookingDto,
  type RoomBookingStatus,
  type RoomDto,
  type RoomExtraDto,
  type RoomsOverviewDto,
  type RoomStatus,
  type RoomTypeDto,
  type UpdateRoomInput,
  type UpdateRoomTypeInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

export interface StaySearch {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}

const stayParams = (branchId: string, s: StaySearch) =>
  new URLSearchParams({
    branchId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: String(s.adults),
    children: String(s.children),
  }).toString();

// ── Public & customer ────────────────────────────────────────────

export function useRoomAvailability(
  branchId: string | undefined,
  search: StaySearch,
  enabled = true,
) {
  return useQuery({
    queryKey: ["rooms", "availability", branchId, search],
    queryFn: ({ signal }) =>
      apiRequest<RoomAvailabilityDto>(
        `/room-bookings/availability?${stayParams(branchId!, search)}`,
        { signal },
      ),
    enabled: !!branchId && enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function usePublicRoomType(branchId: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "type", branchId, slug],
    queryFn: ({ signal }) =>
      apiRequest<RoomTypeDto>(`/room-types/by-slug/${slug}?branchId=${branchId}`, { signal }),
    enabled: !!branchId && !!slug,
  });
}

export function usePublicRoomExtras(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "extras", branchId],
    queryFn: ({ signal }) =>
      apiRequest<RoomExtraDto[]>(`/room-extras?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useMyRoomBookings() {
  return useQuery({
    queryKey: ["room-bookings", "mine"],
    queryFn: ({ signal }) => apiRequest<RoomBookingDto[]>("/room-bookings/mine", { signal }),
  });
}

function useInvalidateRooms() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["room-bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms"] });
  };
}

export function useCreateRoomBooking() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (input: CreateRoomBookingInput) =>
      apiRequest<RoomBookingDto>("/room-bookings", { method: "POST", body: input }),
    onSettled: invalidate,
  });
}

export function useCancelRoomBooking() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<RoomBookingDto>(`/room-bookings/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

// ── Staff: bookings ──────────────────────────────────────────────

export function useStaffRoomBookings(branchId: string | undefined, status?: RoomBookingStatus) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  if (status) params.set("status", status);
  return useQuery({
    queryKey: ["room-bookings", "staff", branchId, status ?? "all"],
    queryFn: ({ signal }) => apiRequest<RoomBookingDto[]>(`/room-bookings?${params}`, { signal }),
    enabled: !!branchId,
  });
}

export function useSetRoomBookingStatus() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomBookingStatus }) =>
      apiRequest<RoomBookingDto>(`/room-bookings/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: invalidate,
  });
}

export function useFreeRooms(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "free", bookingId],
    queryFn: ({ signal }) =>
      apiRequest<{ id: string; roomNumber: string; floor: number; housekeepingStatus: string }[]>(
        `/room-bookings/${bookingId}/free-rooms`,
        { signal },
      ),
    enabled: !!bookingId,
  });
}

export function useAssignRoom() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, roomId }: { id: string; roomId: string }) =>
      apiRequest<RoomBookingDto>(`/room-bookings/${id}/room`, {
        method: "PATCH",
        body: { roomId },
      }),
    onSuccess: invalidate,
  });
}

export function useCreateStaffRoomBooking() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (input: CreateStaffRoomBookingInput) =>
      apiRequest<RoomBookingDto>("/room-bookings/staff", { method: "POST", body: input }),
    onSettled: invalidate,
  });
}

// ── Staff: inventory ─────────────────────────────────────────────

export function useRoomsOverview(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "overview", branchId],
    queryFn: ({ signal }) =>
      apiRequest<RoomsOverviewDto>(`/rooms/overview?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useRooms(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "list", branchId],
    queryFn: ({ signal }) => apiRequest<RoomDto[]>(`/rooms?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useAdminRoomTypes(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "types", branchId],
    queryFn: ({ signal }) =>
      apiRequest<RoomTypeDto[]>(`/room-types/admin?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useAdminExtras(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "admin-extras", branchId],
    queryFn: ({ signal }) =>
      apiRequest<RoomExtraDto[]>(`/room-extras/admin?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

function useRoomMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const invalidate = useInvalidateRooms();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveRoomType = () =>
  useRoomMutation(
    ({ id, input }: { id?: string; input: CreateRoomTypeInput | UpdateRoomTypeInput }) =>
      id
        ? apiRequest<RoomTypeDto>(`/room-types/${id}`, { method: "PATCH", body: input })
        : apiRequest<RoomTypeDto>("/room-types", { method: "POST", body: input }),
  );
export const useDeleteRoomType = () =>
  useRoomMutation((id: string) => apiRequest<null>(`/room-types/${id}`, { method: "DELETE" }));

export const useSaveRoom = () =>
  useRoomMutation(({ id, input }: { id?: string; input: CreateRoomInput | UpdateRoomInput }) =>
    id
      ? apiRequest<null>(`/rooms/${id}`, { method: "PATCH", body: input })
      : apiRequest<{ id: string }>("/rooms", { method: "POST", body: input }),
  );
export const useDeleteRoom = () =>
  useRoomMutation((id: string) => apiRequest<null>(`/rooms/${id}`, { method: "DELETE" }));
export const useSetRoomStatus = () =>
  useRoomMutation(({ id, status }: { id: string; status: RoomStatus }) =>
    apiRequest<null>(`/rooms/${id}/status`, { method: "PATCH", body: { status } }),
  );

export const useSaveExtra = () =>
  useRoomMutation(
    ({ id, input }: { id?: string; input: CreateExtraInput | Partial<CreateExtraInput> }) =>
      id
        ? apiRequest<RoomExtraDto>(`/room-extras/${id}`, { method: "PATCH", body: input })
        : apiRequest<RoomExtraDto>("/room-extras", { method: "POST", body: input }),
  );
export const useDeleteExtra = () =>
  useRoomMutation((id: string) => apiRequest<null>(`/room-extras/${id}`, { method: "DELETE" }));

// ── Housekeeping ─────────────────────────────────────────────────

export function useHousekeepingTasks(branchId: string | undefined) {
  return useQuery({
    queryKey: ["rooms", "tasks", branchId],
    queryFn: ({ signal }) =>
      apiRequest<HousekeepingTaskDto[]>(`/housekeeping/tasks?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export const useSetHousekeeping = () =>
  useRoomMutation(
    ({ roomId, housekeepingStatus }: { roomId: string; housekeepingStatus: HousekeepingStatus }) =>
      apiRequest<null>(`/housekeeping/rooms/${roomId}`, {
        method: "PATCH",
        body: { housekeepingStatus },
      }),
  );

export const useUpdateTask = () =>
  useRoomMutation(
    ({
      id,
      ...input
    }: {
      id: string;
      status?: "OPEN" | "IN_PROGRESS" | "DONE";
      assignedToId?: string | null;
    }) =>
      apiRequest<HousekeepingTaskDto>(`/housekeeping/tasks/${id}`, {
        method: "PATCH",
        body: input,
      }),
  );

/** Room, booking and housekeeping changes made on any screen refresh this one. */
export function useLiveRooms(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["room-bookings"] });
    };
    socket.on(SocketEvents.ROOM_UPDATED, refresh);
    socket.on(SocketEvents.ROOM_BOOKING_CHANGED, refresh);
    return () => {
      socket.off(SocketEvents.ROOM_UPDATED, refresh);
      socket.off(SocketEvents.ROOM_BOOKING_CHANGED, refresh);
    };
  }, [branchId, queryClient]);
}
