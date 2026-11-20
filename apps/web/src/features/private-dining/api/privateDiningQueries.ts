import type {
  CreatePrivateRoomInput,
  PrivateRoomDto,
  UpdatePrivateRoomInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export function usePrivateRooms(branchId: string | undefined) {
  return useQuery({
    queryKey: ["private-rooms", branchId],
    queryFn: ({ signal }) =>
      apiRequest<PrivateRoomDto[]>(`/private-dining?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useSavePrivateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: CreatePrivateRoomInput | UpdatePrivateRoomInput;
    }) =>
      id
        ? apiRequest<PrivateRoomDto>(`/private-dining/${id}`, { method: "PATCH", body: input })
        : apiRequest<PrivateRoomDto>("/private-dining", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["private-rooms"] }),
  });
}

export function useDeletePrivateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/private-dining/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["private-rooms"] }),
  });
}
