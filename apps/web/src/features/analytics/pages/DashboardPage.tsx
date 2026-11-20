import { PAYMENT_METHOD_LABELS, type DashboardDto } from "@smartdine/shared";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranches } from "@/features/branches/api/branchQueries";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { ClockCard } from "@/features/shifts/components/ClockCard";
import { useBranchStore } from "@/stores/branchStore";
import { formatMoney } from "@/utils/format";

import { useDashboard } from "../api/analyticsQueries";
import { compact } from "../components/chartMath";
import { ChartCard, HorizontalBars, LineChart, VerticalBars } from "../components/charts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

function Stat({
  label,
  value,
  note,
  to,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  to?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={
        to
          ? "relative rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
          : "rounded-lg border border-border bg-surface p-4"
      }
    >
      <dt className="text-xs text-muted-foreground">
        {to ? (
          // A stretched link: the whole card is the target, while dt/dd stay valid list markup.
          <Link to={to} className="after:absolute after:inset-0 after:rounded-lg">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd
        className={
          warn ? "mt-1 text-2xl font-semibold text-warning" : "mt-1 text-2xl font-semibold"
        }
      >
        {value}
      </dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** The owner and manager home: today at a glance, then the trends behind it. */
export function DashboardPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const branches = useBranches();
  const { branchId: working } = useCurrentBranch();
  const selected = useBranchStore((s) => s.selectedBranchId);
  const select = useBranchStore((s) => s.select);
  const [days, setDays] = useState(14);

  // Owners can look at everything or one branch; managers always see their own.
  const branchId = isOwner ? (selected ?? undefined) : working;
  const { data, isPending, isError, refetch } = useDashboard(branchId, days);

  return (
    <>
      <PageHeader
        title={isOwner ? "Owner dashboard" : "Manager dashboard"}
        description={data ? `${data.scope.name} · ${data.scope.today}` : "Loading…"}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {isOwner && (branches.data?.length ?? 0) > 0 && (
              <SelectField
                label="Branch"
                value={selected ?? ""}
                placeholder="All branches"
                onChange={(e) => select(e.target.value || null)}
                options={branches.data!.map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
            <SelectField
              label="Period"
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
              options={[7, 14, 30, 90].map((d) => ({ value: String(d), label: `Last ${d} days` }))}
            />
          </div>
        }
      />
      {isPending && <ListSkeleton rows={4} />}
      {isError && (
        <ErrorState message="Couldn't load the dashboard." onRetry={() => void refetch()} />
      )}
      {data && <Body data={data} />}
      {!isOwner && (
        <div className="mt-6 max-w-md">
          <ClockCard />
        </div>
      )}
    </>
  );
}

function Body({ data }: { data: DashboardDto }) {
  const { cards, scope } = data;
  const money = (n: number) => formatMoney(n, scope.currency);
  const moneyShort = (n: number) =>
    Math.abs(n) >= 10_000 ? compact(n) : formatMoney(n, scope.currency).replace(/\.00$/, "");
  const pct = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
  const count = (n: number) => String(Math.round(n));

  const trend = data.revenueTrend.map((p) => ({ label: shortDate(p.date), value: p.revenue }));
  const orders = data.revenueTrend.map((p) => ({ label: shortDate(p.date), value: p.orders }));
  const every = Math.ceil(trend.length / 8);

  return (
    <div className="space-y-6">
      <dl aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Revenue today"
          value={money(cards.revenueToday)}
          note="Collected, net of refunds"
        />
        <Stat label="Orders today" value={String(cards.ordersToday)} />
        <Stat label="Average order value" value={money(cards.averageOrderValue)} />
        <Stat
          label="Active tables"
          value={`${cards.activeTables} of ${cards.totalTables}`}
          to="/app/floor-plan"
        />
        <Stat
          label="Reservations today"
          value={String(cards.reservationsToday)}
          to="/app/reservations"
        />
        <Stat
          label="Room occupancy"
          value={pct(cards.roomOccupancyPercent)}
          note={`${cards.roomsOccupied} of ${cards.roomsTotal} rooms`}
          to="/app/rooms"
        />
        <Stat label="Rooms available" value={String(cards.roomsAvailable)} />
        <Stat
          label="Kitchen average time"
          value={cards.kitchenAverageMinutes === null ? "—" : `${cards.kitchenAverageMinutes} min`}
          note="Sent to ready, today"
        />
        <Stat
          label="Customers today"
          value={String(cards.customersToday)}
          note="Known customers who paid"
        />
        <Stat
          label="Low stock items"
          value={String(cards.lowStockItems)}
          to="/app/inventory"
          warn={cards.lowStockItems > 0}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue trend"
          description="Net revenue per day"
          data={trend}
          valueLabel="Revenue"
          categoryLabel="Day"
          format={money}
        >
          <LineChart
            data={trend}
            format={moneyShort}
            labelEvery={every}
            ariaLabel={`Revenue per day, last ${scope.days} days`}
          />
        </ChartCard>
        <ChartCard
          title="Orders trend"
          description="Orders created per day"
          data={orders}
          valueLabel="Orders"
          categoryLabel="Day"
          format={count}
        >
          <VerticalBars
            data={orders}
            format={count}
            labelEvery={every}
            ariaLabel={`Orders per day, last ${scope.days} days`}
          />
        </ChartCard>

        <ChartCard
          title="Sales by category"
          description="Completed orders"
          data={data.salesByCategory.map((c) => ({ label: c.category, value: c.revenue }))}
          valueLabel="Revenue"
          categoryLabel="Category"
          format={money}
        >
          <HorizontalBars
            data={data.salesByCategory.map((c) => ({ label: c.category, value: c.revenue }))}
            format={money}
          />
        </ChartCard>
        <ChartCard
          title="Popular dishes"
          description="Most ordered, by quantity"
          data={data.popularItems.map((i) => ({ label: i.name, value: i.quantity }))}
          valueLabel="Sold"
          categoryLabel="Dish"
          format={count}
        >
          <HorizontalBars
            data={data.popularItems.map((i) => ({ label: i.name, value: i.quantity }))}
            format={(n) => `${n} sold`}
          />
        </ChartCard>

        <ChartCard
          title="Payment methods"
          description="Amount taken by each method"
          data={data.paymentMethods.map((m) => ({
            label: PAYMENT_METHOD_LABELS[m.method],
            value: m.total,
          }))}
          valueLabel="Amount"
          categoryLabel="Method"
          format={money}
        >
          <HorizontalBars
            data={data.paymentMethods.map((m) => ({
              label: PAYMENT_METHOD_LABELS[m.method],
              value: m.total,
            }))}
            format={money}
          />
        </ChartCard>
        <ChartCard
          title="Hourly sales"
          description="Money collected by hour of day"
          data={data.hourlySales.map((h) => ({ label: `${h.hour}:00`, value: h.revenue }))}
          valueLabel="Collected"
          categoryLabel="Hour"
          format={money}
        >
          <VerticalBars
            data={data.hourlySales.map((h) => ({ label: hourLabel(h.hour), value: h.revenue }))}
            format={moneyShort}
            labelEvery={3}
            ariaLabel="Sales by hour of day"
          />
        </ChartCard>

        <ChartCard
          title="Room occupancy"
          description="Share of rooms occupied each night"
          data={data.occupancyTrend.map((o) => ({
            label: shortDate(o.date),
            value: o.occupancyPercent,
          }))}
          valueLabel="Occupancy"
          categoryLabel="Night"
          format={pct}
        >
          <LineChart
            data={data.occupancyTrend.map((o) => ({
              label: shortDate(o.date),
              value: o.occupancyPercent,
            }))}
            format={(n) => `${Math.round(n)}%`}
            ceiling={100}
            labelEvery={every}
            ariaLabel="Room occupancy per night"
          />
        </ChartCard>
        <ChartCard
          title="Reservation patterns"
          description="Table reservations by weekday"
          data={data.reservationPatterns.map((p) => ({
            label: WEEKDAYS[p.weekday - 1]!,
            value: p.count,
          }))}
          valueLabel="Reservations"
          categoryLabel="Weekday"
          format={count}
        >
          <VerticalBars
            data={data.reservationPatterns.map((p) => ({
              label: WEEKDAYS[p.weekday - 1]!,
              value: p.count,
            }))}
            format={count}
            ariaLabel="Reservations by weekday"
          />
        </ChartCard>
      </div>

      {data.branchComparison && (
        <section
          aria-label="Branch comparison"
          className="space-y-3 rounded-xl border border-border bg-surface p-4"
        >
          <h2 className="font-display text-lg font-semibold">Branch comparison</h2>
          <HorizontalBars
            data={data.branchComparison.map((b) => ({ label: b.name, value: b.revenue }))}
            format={money}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">Branch</th>
                  <th className="py-1.5 text-right font-medium">Revenue</th>
                  <th className="py-1.5 text-right font-medium">Orders</th>
                  <th className="py-1.5 text-right font-medium">Room occupancy</th>
                </tr>
              </thead>
              <tbody>
                {data.branchComparison.map((b) => (
                  <tr key={b.branchId} className="border-b border-border last:border-0">
                    <td className="py-1.5">{b.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(b.revenue)}</td>
                    <td className="py-1.5 text-right tabular-nums">{b.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(b.occupancyPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
