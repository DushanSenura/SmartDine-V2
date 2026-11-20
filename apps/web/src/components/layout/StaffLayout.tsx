import * as RadixDialog from "@radix-ui/react-dialog";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { NAV_GROUPS, navItemsFor } from "@/components/navigation/staffNav";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchSwitcher } from "@/features/branches/components/BranchSwitcher";
import { useNotificationToasts } from "@/features/notifications/hooks";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { CommandPalette } from "@/features/search/CommandPalette";
import { baseTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function StaffLayout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useNotificationToasts();

  // Ctrl/Cmd+K opens search from anywhere in the staff app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  const items = navItemsFor(user.role).filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex min-h-screen">
      <a
        href="#content"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={baseTransition}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface lg:flex"
      >
        <div className="flex h-16 items-center justify-between px-4">
          {!collapsed && <Brand size="sm" />}
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </Button>
        </div>
        <NavList items={items} collapsed={collapsed} label="Main" />
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user.role.toLowerCase()}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Button variant="outline" size="sm" onClick={() => setSearching(true)}>
              <Search className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Search</span>
              <kbd
                aria-hidden
                className="hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground md:inline"
              >
                Ctrl K
              </kbd>
            </Button>
            <BranchSwitcher />
            <NotificationBell />
            <ThemeToggle />
            <Button
              variant="outline"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden md:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main id="content" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">
          <Outlet />
        </main>
        <CommandPalette open={searching} onClose={() => setSearching(false)} />
      </div>

      <RadixDialog.Root open={drawer} onOpenChange={setDrawer}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 lg:hidden" />
          <RadixDialog.Content
            aria-describedby={undefined}
            className="border-border bg-surface fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-lg lg:hidden"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <RadixDialog.Title className="font-display text-primary text-lg font-semibold">
                SmartDine
              </RadixDialog.Title>
              <RadixDialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close navigation">
                  <X className="size-5" aria-hidden />
                </Button>
              </RadixDialog.Close>
            </div>
            <NavList
              items={items}
              collapsed={false}
              label="Mobile"
              onNavigate={() => setDrawer(false)}
            />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </div>
  );
}

interface NavListProps {
  items: ReturnType<typeof navItemsFor>;
  collapsed: boolean;
  label: string;
  /** Picking a destination closes the phone drawer. */
  onNavigate?: () => void;
}

function NavList({ items, collapsed, label, onNavigate }: NavListProps) {
  // Only sections the role can see get a heading; empty ones disappear.
  const sections = NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  return (
    <nav aria-label={label} className="flex-1 overflow-y-auto px-3 pb-4">
      {sections.map(({ group, items: groupItems }, index) => (
        <div key={group} role="group" aria-label={group} className={index > 0 ? "mt-4" : undefined}>
          {/* Overview needs no heading: the dashboard is the obvious starting point. */}
          {group !== "Overview" &&
            (collapsed ? (
              <div aria-hidden className="mx-3 mb-2 border-t border-border" />
            ) : (
              <p
                aria-hidden
                className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
              >
                {group}
              </p>
            ))}
          <div className="space-y-0.5">
            {groupItems.map(({ label: text, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                onClick={onNavigate}
                title={collapsed ? text : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {!collapsed && <span>{text}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
