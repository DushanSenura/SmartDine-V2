import {
  LOYALTY_TRANSACTION_LABELS,
  type CustomerDetailDto,
  type UpdateCustomerInput,
} from "@smartdine/shared";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { formatDate, formatDateTime, formatMoney, titleCase } from "@/utils/format";

import { useAdjustPoints, useCustomer, useUpdateCustomer } from "../api/customerQueries";

const list = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function ProfileForm({ customer }: { customer: CustomerDetailDto }) {
  const update = useUpdateCustomer();
  const [firstName, setFirstName] = useState(customer.firstName);
  const [lastName, setLastName] = useState(customer.lastName);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [birthday, setBirthday] = useState(customer.birthday ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [preferences, setPreferences] = useState(customer.preferences ?? "");
  const [dietary, setDietary] = useState(customer.dietaryPreferences.join(", "));
  const [allergies, setAllergies] = useState(customer.allergies.join(", "));
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      aria-label="Customer details"
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        const input: UpdateCustomerInput = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          birthday: birthday || null,
          address,
          preferences,
          dietaryPreferences: list(dietary),
          allergies: list(allergies),
          notes,
        };
        try {
          await update.mutateAsync({ id: customer.id, input });
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save.");
        }
      }}
    >
      <h2 className="font-display text-xl font-semibold">Details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField
          label="Birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
      </div>
      <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      <TextField
        label="Preferences"
        value={preferences}
        onChange={(e) => setPreferences(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Dietary preferences"
          hint="Comma-separated"
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
        />
        <TextField
          label="Allergies"
          hint="Comma-separated"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
        />
      </div>
      <TextAreaField
        label="Staff notes"
        hint="Private to staff — the customer never sees these"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

function Loyalty({ customer }: { customer: CustomerDetailDto }) {
  const adjust = useAdjustPoints();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { loyalty } = customer;

  return (
    <section
      aria-label="Loyalty"
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Loyalty</h2>
        {!loyalty.enabled && <Badge tone="neutral">Programme is off</Badge>}
      </div>
      <p className="text-3xl font-semibold" aria-label="Points balance">
        {loyalty.points} <span className="text-base font-normal text-muted-foreground">points</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {loyalty.lifetimePoints} earned in total · 1 point per{" "}
        {formatMoney(loyalty.currencyPerPoint, loyalty.currency)} spent · each point is worth{" "}
        {formatMoney(loyalty.pointValue, loyalty.currency)}
      </p>
      <form
        aria-label="Adjust points"
        className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await adjust.mutateAsync({
              id: customer.id,
              input: { points: Number(points), note: note.trim() },
            });
            setPoints("");
            setNote("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't adjust the points.");
          }
        }}
      >
        <TextField
          label="Points to add or remove"
          type="number"
          step={1}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          hint="Use a minus to remove"
        />
        <TextField
          label="Reason"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={adjust.isPending || !points || note.trim().length < 3}
        >
          Adjust
        </Button>
      </form>
      <FormError message={error} />
      {loyalty.transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No points activity yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {loyalty.transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="font-medium">{LOYALTY_TRANSACTION_LABELS[t.type]}</span>
                {t.note && <span className="text-muted-foreground"> · {t.note}</span>}
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(t.createdAt, "UTC")}
                </span>
              </span>
              <span
                className={t.points < 0 ? "tabular-nums text-danger" : "tabular-nums text-success"}
              >
                {t.points > 0 ? "+" : ""}
                {t.points}
                <span className="block text-right text-xs text-muted-foreground">
                  {t.balanceAfter} left
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function History({ customer }: { customer: CustomerDetailDto }) {
  const money = (n: number) => formatMoney(n, customer.currency);
  return (
    <section
      aria-label="History"
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="font-display text-xl font-semibold">History</h2>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Paid bills</h3>
        {customer.bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {customer.bills.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 p-3">
                <span>
                  {b.billNumber}
                  {b.paidAt && (
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(b.paidAt, "UTC")}
                    </span>
                  )}
                </span>
                <span>{money(b.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Table reservations</h3>
        {customer.reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {customer.reservations.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 p-3">
                <span>
                  {r.reference} · party of {r.partySize}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(r.startsAt, "UTC")}
                  </span>
                </span>
                <Badge>{titleCase(r.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Room stays</h3>
        {customer.stays.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {customer.stays.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 p-3">
                <span>
                  {s.reference}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(s.checkIn)} → {formatDate(s.checkOut)}
                  </span>
                </span>
                <span>
                  {money(s.total)} <Badge>{titleCase(s.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useCustomer(id);
  if (isPending) return <ListSkeleton rows={6} />;
  if (isError || !data)
    return <ErrorState message="Couldn't load this customer." onRetry={() => void refetch()} />;
  const money = (n: number) => formatMoney(n, data.currency);

  return (
    <div className="space-y-6">
      <Link
        to="/app/customers"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> All customers
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">
          {data.firstName} {data.lastName}
        </h1>
        <p className="text-muted-foreground">
          {data.email} · member since {formatDate(data.createdAt.slice(0, 10))}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Visits", String(data.visitCount)],
            ["Total spent", money(data.totalSpent)],
            ["Points", String(data.points)],
            ["Last visit", data.lastVisit ? formatDate(data.lastVisit.slice(0, 10)) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ProfileForm customer={data} />
        </div>
        <div className="space-y-6">
          <Loyalty customer={data} />
          <History customer={data} />
        </div>
      </div>
    </div>
  );
}
