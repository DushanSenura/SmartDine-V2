import { LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { PreferencesForm } from "@/features/customers/components/PreferencesForm";
import { ProfileForms } from "@/features/profile/components/ProfileForms";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/account/reservations", label: "Reservations" },
  { to: "/account/stays", label: "Stays" },
  { to: "/account/favourites", label: "Favourites" },
  { to: "/account/loyalty", label: "Loyalty" },
  { to: "/account/invoices", label: "Invoices" },
  { to: "/account/reviews", label: "Reviews" },
  { to: "/account/profile", label: "Profile" },
];

/** Customer account area (inside the public site layout): reservations and profile. */
export function AccountShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Hello, {user?.firstName}</h1>
          <p className="text-sm text-muted-foreground">Manage your bookings and details.</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              navigate("/", { replace: true });
            }}
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </header>
      <nav aria-label="Account" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export function AccountProfilePage() {
  return (
    <div className="space-y-6">
      <ProfileForms />
      <PreferencesForm />
    </div>
  );
}
