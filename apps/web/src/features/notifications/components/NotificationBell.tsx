import {
  NOTIFICATION_GROUP_OF,
  NOTIFICATION_GROUPS,
  type NotificationDto,
} from "@smartdine/shared";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";

import { useMarkAllRead, useMarkRead, useNotifications } from "../api/notificationQueries";

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * The header bell: an unread count, notifications grouped by topic, deep links, mark read and mark
 * all read. Opens as a disclosure (Escape and outside clicks close it) rather than a modal, so the
 * page behind stays usable.
 */
export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = data?.unreadCount ?? 0;
  const shown = unread > 99 ? "99+" : String(unread);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) return e.key === "Escape" && setOpen(false);
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const grouped = NOTIFICATION_GROUPS.map((group) => ({
    group,
    items: (data?.notifications ?? []).filter((n) => NOTIFICATION_GROUP_OF[n.type] === group),
  })).filter((g) => g.items.length > 0);

  const openItem = (n: NotificationDto) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={unread > 0 ? `Notifications, ${shown} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white dark:text-black"
          >
            {shown}
          </span>
        )}
      </Button>

      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="size-4" aria-hidden /> Mark all read
            </Button>
          </header>
          <div className="max-h-[26rem] overflow-y-auto">
            {grouped.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group}>
                  <h3 className="bg-surface-muted px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group}
                  </h3>
                  <ul>
                    {items.map((n) => (
                      <li key={n.id} className="border-b border-border last:border-0">
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted",
                            !n.read && "bg-primary/5",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              n.read ? "bg-transparent" : "bg-primary",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-sm", !n.read && "font-semibold")}>
                              {n.title}
                              {!n.read && <span className="sr-only"> (unread)</span>}
                            </span>
                            {n.body && (
                              <span className="block text-xs text-muted-foreground">{n.body}</span>
                            )}
                            <time
                              dateTime={n.createdAt}
                              className="mt-0.5 block text-xs text-muted-foreground"
                            >
                              {sameDay(n.createdAt)
                                ? new Date(n.createdAt).toLocaleTimeString([], {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })
                                : formatDateTime(
                                    n.createdAt,
                                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                                  )}
                            </time>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
