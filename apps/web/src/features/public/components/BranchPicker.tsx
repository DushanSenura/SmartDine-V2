import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

import { usePublicBranch } from "../hooks/usePublicBranch";

/** Lets visitors choose a location; renders nothing when there is only one. */
export function BranchPicker({
  className,
  label = "Location",
}: {
  className?: string;
  label?: string;
}) {
  const { branch, branches, select } = usePublicBranch();
  if (branches.length < 2 || !branch) return null;
  return (
    <label className={cn("flex items-center gap-2 text-sm", className)}>
      <MapPin className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={branch.id}
        onChange={(e) => select(e.target.value)}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
