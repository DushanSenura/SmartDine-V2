import {
  SocketEvents,
  type CreateServiceRequestInput,
  type ServiceRequestDto,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

const key = (branchId?: string) => ["service-requests", branchId] as const;

/** Open guest requests for a branch; refreshed over the socket, never polled. */
export function useServiceRequests(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const refresh = () => void queryClient.invalidateQueries({ queryKey: key(branchId) });
    socket.on(SocketEvents.SERVICE_REQUEST_CHANGED, refresh);
    socket.io.on("reconnect", refresh);
    return () => {
      socket.off(SocketEvents.SERVICE_REQUEST_CHANGED, refresh);
      socket.io.off("reconnect", refresh);
    };
  }, [branchId, queryClient]);

  return useQuery({
    queryKey: key(branchId),
    queryFn: ({ signal }) =>
      apiRequest<ServiceRequestDto[]>(`/service-requests?branchId=${branchId}&status=OPEN`, {
        signal,
      }),
    enabled: !!branchId,
  });
}

export function useCreateServiceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceRequestInput) =>
      apiRequest<ServiceRequestDto>("/service-requests", { method: "POST", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["service-requests"] }),
  });
}

export function useResolveServiceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ServiceRequestDto>(`/service-requests/${id}/resolve`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["service-requests"] }),
  });
}
