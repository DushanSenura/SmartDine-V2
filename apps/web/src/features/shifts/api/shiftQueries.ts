import type {
  AttendanceDto,
  CreateShiftInput,
  ScheduledShiftDto,
  ScheduleEntryInput,
  ShiftDto,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function useShifts() {
  return useQuery({
    queryKey: ["shifts"],
    queryFn: ({ signal }) => apiRequest<ShiftDto[]>("/shifts", { signal }),
  });
}

export function useSaveShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateShiftInput }) =>
      id
        ? apiRequest<ShiftDto>(`/shifts/${id}`, { method: "PATCH", body: input })
        : apiRequest<ShiftDto>("/shifts", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/shifts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useSchedule(branchId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["schedule", branchId, from, to],
    queryFn: ({ signal }) =>
      apiRequest<ScheduledShiftDto[]>(
        `/shifts/schedule?branchId=${branchId}&from=${from}&to=${to}`,
        {
          signal,
        },
      ),
    enabled: !!branchId,
  });
}

export function useSetScheduleEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      entry: ScheduleEntryInput;
      existingId?: string;
      clear?: boolean;
    }) =>
      args.clear && args.existingId
        ? apiRequest<null>(`/shifts/schedule/${args.existingId}`, { method: "DELETE" })
        : apiRequest<ScheduledShiftDto>("/shifts/schedule", { method: "PUT", body: args.entry }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedule"] }),
  });
}

export function useAttendanceRoster(branchId: string | undefined, date: string) {
  return useQuery({
    queryKey: ["attendance", branchId, date],
    queryFn: ({ signal }) =>
      apiRequest<AttendanceDto[]>(`/shifts/attendance?branchId=${branchId}&date=${date}`, {
        signal,
      }),
    enabled: !!branchId,
  });
}

export function useMyAttendance() {
  return useQuery({
    queryKey: ["attendance", "me"],
    queryFn: ({ signal }) => apiRequest<AttendanceDto | null>("/shifts/attendance/me", { signal }),
  });
}

export function useClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (direction: "in" | "out") =>
      apiRequest<AttendanceDto>(`/shifts/attendance/clock-${direction}`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });
}
