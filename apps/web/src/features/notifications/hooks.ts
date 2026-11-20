import { SocketEvents, type NotificationDto } from "@smartdine/shared";
import { useEffect } from "react";

import { getSocket } from "@/services/socket/socket";
import { toast } from "@/stores/toastStore";

/** Pops a toast for each notification pushed to the signed-in person while they work. */
export function useNotificationToasts() {
  useEffect(() => {
    const socket = getSocket();
    const onNew = (n: NotificationDto) => {
      toast.show({
        tone: "info",
        title: n.title,
        description: n.body ?? undefined,
        to: n.link ?? undefined,
      });
    };
    socket.on(SocketEvents.NOTIFICATION_NEW, onNew);
    return () => {
      socket.off(SocketEvents.NOTIFICATION_NEW, onNew);
    };
  }, []);
}
