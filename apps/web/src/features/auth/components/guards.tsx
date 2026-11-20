import type { Permission, Role } from "@smartdine/shared";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Skeleton } from "@/components/feedback/Skeleton";

import { useAuth } from "../hooks/useAuth";
import { postLoginPath, ROLE_HOME } from "../utils/roleHome";

function SessionLoading() {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-24" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

/** Renders child routes only for signed-in users whose role is allowed (any role if omitted). */
export function RequireRole({ roles }: { roles?: readonly Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

const GUEST_PATHS = new Set(["/login", "/register"]);

/** Keeps signed-in users away from login/register. */
export function GuestOnly() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === "loading") return <SessionLoading />;
  // Signing in flips this guard before the form's own navigate() runs, so it must honour `from`.
  // It only acts on the guest routes themselves: while the page-transition wrapper fades the old
  // page out, this component can still be mounted under the *new* location and must stay passive.
  if (user && GUEST_PATHS.has(location.pathname)) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={postLoginPath(user.role, from)} replace />;
  }
  return <Outlet />;
}

/** Sends a signed-in user to their role's landing page. */
export function RoleRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? ROLE_HOME[user.role] : "/login"} replace />;
}

/** Renders child routes only when the signed-in user holds the permission. */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { status, user, can } = useAuth();
  if (status === "loading") return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!can(permission)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
