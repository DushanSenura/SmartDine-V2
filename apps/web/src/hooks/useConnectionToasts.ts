import { useEffect } from "react";

import { toast } from "@/stores/toastStore";

/** Tells the person when the browser loses the network, and when it is back. */
export function useConnectionToasts() {
  useEffect(() => {
    let offlineId: number | undefined;
    const onOffline = () => {
      offlineId = toast.show(
        {
          tone: "warning",
          title: "You're offline",
          description: "Changes won't save until the connection returns.",
        },
        0,
      );
    };
    const onOnline = () => {
      if (offlineId !== undefined) toast.dismiss(offlineId);
      offlineId = undefined;
      toast.show({ tone: "success", title: "Back online" }, 3000);
    };
    if (!navigator.onLine) onOffline();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
