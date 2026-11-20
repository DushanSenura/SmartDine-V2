import {
  BILL_PROMOTION_TYPES,
  PROMOTION_TYPE_LABELS,
  PROMOTION_TYPES,
  type PromotionDto,
  type PromotionType,
} from "@smartdine/shared";
import { X } from "lucide-react";
import { useState } from "react";

import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranches } from "@/features/branches/api/branchQueries";
import { useCustomerLookup } from "@/features/customers/api/customerQueries";
import { cn } from "@/lib/utils";

import { useSavePromotion } from "../api/promotionQueries";

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

const isBillType = (t: PromotionType) => (BILL_PROMOTION_TYPES as readonly string[]).includes(t);
const hasWindow = (t: PromotionType) => t === "HAPPY_HOUR" || t === "LOYALTY_MULTIPLIER";
const valueLabel = (t: PromotionType) =>
  t === "FIXED"
    ? "Amount off"
    : t === "LOYALTY_MULTIPLIER"
      ? "Points multiplier (×)"
      : "Percent off (%)";

function CustomerPicker({
  chosen,
  onChange,
}: {
  chosen: { id: string; name: string }[];
  onChange: (next: { id: string; name: string }[]) => void;
}) {
  const [q, setQ] = useState("");
  const results = useCustomerLookup(q.trim());
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Only for these customers</legend>
      <p className="text-xs text-muted-foreground">Leave empty to offer it to everyone.</p>
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-0.5 pr-1 pl-2.5 text-xs"
            >
              {c.name}
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                className="rounded-full p-0.5 hover:bg-border"
                onClick={() => onChange(chosen.filter((x) => x.id !== c.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <TextField
        label="Find a customer"
        placeholder="Name, email or phone"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.data && results.data.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {results.data
            .filter((r) => !chosen.some((c) => c.id === r.id))
            .map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 p-2 text-left hover:bg-surface-muted"
                  onClick={() => {
                    onChange([...chosen, { id: r.id, name: r.name }]);
                    setQ("");
                  }}
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">{r.email}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </fieldset>
  );
}

export function PromotionDialog({
  promotion,
  onClose,
}: {
  promotion?: PromotionDto;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const branches = useBranches();
  const save = useSavePromotion();
  const [name, setName] = useState(promotion?.name ?? "");
  const [description, setDescription] = useState(promotion?.description ?? "");
  const [type, setType] = useState<PromotionType>(promotion?.type ?? "PERCENTAGE");
  const [code, setCode] = useState(promotion?.code ?? "");
  const [value, setValue] = useState(promotion ? String(promotion.value) : "");
  const [minimumSpend, setMinimumSpend] = useState(promotion ? String(promotion.minimumSpend) : "");
  const [usageLimit, setUsageLimit] = useState(
    promotion?.usageLimit ? String(promotion.usageLimit) : "",
  );
  const [startsOn, setStartsOn] = useState(promotion?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(promotion?.endsOn ?? "");
  const [days, setDays] = useState<number[]>(promotion?.daysOfWeek ?? []);
  const [startTime, setStartTime] = useState(promotion?.startTime ?? "");
  const [endTime, setEndTime] = useState(promotion?.endTime ?? "");
  const [branchIds, setBranchIds] = useState<string[]>(promotion?.branchIds ?? []);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>(
    (promotion?.customerIds ?? []).map((id) => ({ id, name: `Customer ${id.slice(0, 8)}` })),
  );
  const [active, setActive] = useState(promotion?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const showValue =
    type === "PERCENTAGE" ||
    type === "FIXED" ||
    type === "HAPPY_HOUR" ||
    type === "LOYALTY_MULTIPLIER";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={promotion ? `Edit ${promotion.name}` : "New promotion"}
      description="Codes and happy hours discount a bill at the till; multipliers scale loyalty points; offers are shown to guests."
      size="lg"
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await save.mutateAsync({
              id: promotion?.id,
              input: {
                name: name.trim(),
                description,
                type,
                code: isBillType(type) ? code : "",
                value: showValue ? Number(value) || 0 : 0,
                minimumSpend: Number(minimumSpend) || 0,
                usageLimit: usageLimit ? Number(usageLimit) : null,
                startsOn: startsOn || null,
                endsOn: endsOn || null,
                daysOfWeek: hasWindow(type) ? days : [],
                startTime: hasWindow(type) && startTime ? startTime : null,
                endTime: hasWindow(type) && endTime ? endTime : null,
                // A manager's promotions are always confined to their own branch.
                branchIds: isOwner ? branchIds : user?.branchId ? [user.branchId] : [],
                customerIds: customers.map((c) => c.id),
                active,
              },
            });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save the promotion.");
          }
        }}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as PromotionType)}
            options={PROMOTION_TYPES.map((t) => ({ value: t, label: PROMOTION_TYPE_LABELS[t] }))}
          />
          {isBillType(type) && (
            <TextField
              label="Promo code"
              hint="What the cashier types in. Letters, numbers, - and _"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          )}
          {showValue && (
            <TextField
              label={valueLabel(type)}
              type="number"
              step="0.01"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          <TextField
            label="Minimum spend"
            type="number"
            step="0.01"
            min={0}
            value={minimumSpend}
            onChange={(e) => setMinimumSpend(e.target.value)}
          />
          {isBillType(type) && (
            <TextField
              label="Usage limit"
              type="number"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              hint="Leave empty for unlimited"
            />
          )}
          <TextField
            label="Starts on"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <TextField
            label="Ends on"
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>
        <TextAreaField
          label="Description"
          hint="Shown to guests on the Offers page"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {hasWindow(type) && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">When it runs</legend>
            <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
              {DAYS.map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={days.includes(n)}
                  onClick={() =>
                    setDays((cur) => (cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n]))
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    days.includes(n)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-surface-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">No days selected means every day.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="From"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <TextField
                label="Until"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </fieldset>
        )}

        {isOwner && (branches.data?.length ?? 0) > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Branches</legend>
            <p className="text-xs text-muted-foreground">None selected means every branch.</p>
            <div className="flex flex-wrap gap-4">
              {branches.data!.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={branchIds.includes(b.id)}
                    onChange={(e) =>
                      setBranchIds((cur) =>
                        e.target.checked ? [...cur, b.id] : cur.filter((id) => id !== b.id),
                      )
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <CustomerPicker chosen={customers} onChange={setCustomers} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save promotion"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
