import { SocketEvents, type NotificationListDto } from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";

const KEY = ["notifications"] as const;

/**
 * The signed-in person's notifications. New ones arrive over the socket, so there is no polling;
 * a reconnect refetches whatever was missed while offline.
 */
export function useNotifications(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => apiRequest<NotificationListDto>("/notifications?limit=40", { signal }),
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
    socket.on(SocketEvents.NOTIFICATION_NEW, refresh);
    socket.io.on("reconnect", refresh);
    return () => {
      socket.off(SocketEvents.NOTIFICATION_NEW, refresh);
      socket.io.off("reconnect", refresh);
    };
  }, [enabled, queryClient]);

  return query;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/notifications/${id}/read`, { method: "POST" }),
    // Dim it immediately; the refetch confirms.
    onMutate: (id) => {
      queryClient.setQueryData<NotificationListDto>(KEY, (cur) =>
        cur
          ? {
              unreadCount: Math.max(
                0,
                cur.unreadCount - (cur.notifications.find((n) => n.id === id && !n.read) ? 1 : 0),
              ),
              notifications: cur.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
            }
          : cur,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ marked: number }>("/notifications/read-all", { method: "POST" }),
    onMutate: () => {
      queryClient.setQueryData<NotificationListDto>(KEY, (cur) =>
        cur
          ? { unreadCount: 0, notifications: cur.notifications.map((n) => ({ ...n, read: true })) }
          : cur,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
