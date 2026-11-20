const DEMO_ROLES = [
  { role: "Owner", email: "owner@smartdine.test" },
  { role: "Manager", email: "manager@smartdine.test" },
  { role: "Waiter", email: "waiter@smartdine.test" },
  { role: "Kitchen", email: "kitchen@smartdine.test" },
  { role: "Cashier", email: "cashier@smartdine.test" },
  { role: "Customer", email: "customer@smartdine.test" },
] as const;

/** The demo password, set by `VITE_DEMO_PASSWORD`. Only ever read in development builds. */
const demoPassword: string = import.meta.env.DEV ? (import.meta.env.VITE_DEMO_PASSWORD ?? "") : "";

/** One-click sign-in as each seeded demo role. Rendered only in development with a demo password. */
export function DemoRoleButtons({
  onPick,
  disabled,
}: {
  onPick: (email: string, password: string) => void;
  disabled?: boolean;
}) {
  if (!demoPassword) return null;
  return (
    <section aria-label="Demo accounts" className="mt-6 space-y-2 border-t border-border pt-4">
      <p className="text-center text-xs text-muted-foreground">
        Demo: sign in as a role (development only)
      </p>
      <div className="grid grid-cols-3 gap-2">
        {DEMO_ROLES.map(({ role, email }) => (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onPick(email, demoPassword)}
            className="h-9 rounded-md border border-border bg-surface text-sm font-medium transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            {role}
          </button>
        ))}
      </div>
    </section>
  );
}
