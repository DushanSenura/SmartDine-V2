import type { Role } from "@smartdine/shared";

/** Landing route for each role after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  OWNER: "/app/owner",
  MANAGER: "/app/manager",
  WAITER: "/app/waiter",
  KITCHEN: "/app/kitchen",
  CASHIER: "/app/cashier",
  CUSTOMER: "/account",
};

/**
 * Where to send a user after signing in: the page they were trying to reach if their role may open
 * it, otherwise their role's home. Customers are never sent into the staff app, and the target must
 * be a same-site path (guards against open redirects).
 */
export function postLoginPath(role: Role, from: unknown): string {
  const target =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : null;
  if (!target) return ROLE_HOME[role];
  if (role === "CUSTOMER" && target.startsWith("/app")) return ROLE_HOME[role];
  return target;
}
