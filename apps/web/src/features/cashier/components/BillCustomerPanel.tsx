import { pointsValue, type BillDto } from "@smartdine/shared";
import { Gift, Tag, UserRound, X } from "lucide-react";
import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import {
  useApplyPromo,
  useAttachCustomer,
  useCustomerLookup,
  useRedeemPoints,
  useRemovePromo,
} from "@/features/customers/api/customerQueries";
import { formatMoney } from "@/utils/format";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function CustomerSection({ bill }: { bill: BillDto }) {
  const attach = useAttachCustomer();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const results = useCustomerLookup(q.trim());

  const run = async (customerId: string | null) => {
    setError(null);
    try {
      await attach.mutateAsync({ billId: bill.id, customerId });
      setQ("");
    } catch (e) {
      setError(errorText(e, "Couldn't update the customer."));
    }
  };

  if (bill.customer) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <UserRound className="size-4" aria-hidden /> {bill.customer.name}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Remove customer from bill"
            disabled={attach.isPending}
            onClick={() => void run(null)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </p>
        <p className="text-xs text-muted-foreground">{bill.customer.email}</p>
        {bill.loyalty.enabled && (
          <p className="text-xs text-muted-foreground" aria-label="Customer points">
            {bill.customer.points} points available
          </p>
        )}
        <FormError message={error} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <TextField
        label="Find a customer"
        placeholder="Name, email or phone"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        hint="Attach an account to earn points and keep the receipt on their profile"
      />
      {results.data?.length === 0 && q.trim().length >= 2 && (
        <p className="text-xs text-muted-foreground">No customers found.</p>
      )}
      {results.data && results.data.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {results.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={attach.isPending}
                className="flex w-full items-center justify-between gap-2 p-2 text-left hover:bg-surface-muted"
                onClick={() => void run(c.id)}
              >
                <span>
                  {c.name}
                  <span className="block text-xs text-muted-foreground">{c.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{c.points} pts</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
    </div>
  );
}

function PromoSection({ bill }: { bill: BillDto }) {
  const apply = useApplyPromo();
  const remove = useRemovePromo();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canChange = bill.payments.length === 0;

  if (bill.promotionCode) {
    return (
      <div className="space-y-1">
        <p className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Tag className="size-4" aria-hidden /> {bill.promotionName}
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
              {bill.promotionCode}
            </span>
          </span>
          {canChange && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove promo code"
              disabled={remove.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await remove.mutateAsync(bill.id);
                } catch (e) {
                  setError(errorText(e, "Couldn't remove the code."));
                }
              }}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </p>
        <FormError message={error} />
      </div>
    );
  }
  if (!canChange) return null;
  return (
    <form
      aria-label="Apply a promo code"
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await apply.mutateAsync({ billId: bill.id, code: code.trim() });
          setCode("");
        } catch (err) {
          setError(errorText(err, "Couldn't apply the code."));
        }
      }}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="Promo code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={apply.isPending || code.trim().length === 0}
        >
          Apply
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

function RedeemSection({ bill }: { bill: BillDto }) {
  const redeem = useRedeemPoints();
  const [points, setPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const max = bill.loyalty.maxRedeemablePoints;
  if (!bill.loyalty.enabled || !bill.customer || max <= 0) return null;
  const entered = Number(points) || 0;

  return (
    <form
      aria-label="Redeem points"
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await redeem.mutateAsync({ billId: bill.id, points: entered });
          setPoints("");
        } catch (err) {
          setError(errorText(err, "Couldn't redeem the points."));
        }
      }}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="Points to use"
            type="number"
            min={1}
            max={max}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            hint={`Up to ${max} points (${formatMoney(pointsValue(max, bill.loyalty.pointValue), bill.currency)})`}
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPoints(String(max))}>
          Max
        </Button>
        <Button
          type="submit"
          variant="outline"
          disabled={redeem.isPending || entered < 1 || entered > max}
        >
          <Gift className="size-4" aria-hidden /> Use
          {entered > 0
            ? ` ${formatMoney(pointsValue(entered, bill.loyalty.pointValue), bill.currency)}`
            : ""}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

/** Customer, promo code and loyalty points for an open bill. */
export function BillCustomerPanel({ bill }: { bill: BillDto }) {
  return (
    <section aria-label="Customer and offers" className="space-y-4 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">Customer &amp; offers</h2>
      <CustomerSection bill={bill} />
      <PromoSection bill={bill} />
      <RedeemSection bill={bill} />
    </section>
  );
}
