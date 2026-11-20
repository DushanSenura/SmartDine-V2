import {
  inventoryStatus,
  INVENTORY_STATUS_LABELS,
  OWNER_ONLY_REPORTS,
  REPORT_LABELS,
  type ReportCell,
  type ReportColumn,
  type ReportDto,
  type ReportFormat,
  type ReportGroup,
  type ReportType,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import type { AuthContext } from "../../types/express";
import {
  addDays,
  eachDate,
  instants,
  isoWeekday,
  localDate,
  resolveScope,
  round2,
  sum,
  todayIn,
  type Scope,
} from "./scope";

export const ROW_CAP = 5000;
const NOT_COUNTED = ["DRAFT", "CANCELLED", "VOID"] as const;

interface Table {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals?: Record<string, ReportCell> | null;
  truncated?: boolean;
}

interface Ctx {
  scope: Scope;
  from: string;
  to: string;
  group: ReportGroup;
  start: Date;
  end: Date;
  inBranches: { in: string[] };
}

const col = (key: string, label: string, format: ReportFormat = "text"): ReportColumn => ({
  key,
  label,
  format,
});
const money = (n: number) => round2(n);
const cap = <T>(rows: T[]) => ({ rows: rows.slice(0, ROW_CAP), truncated: rows.length > ROW_CAP });
const fullName = (u: { firstName: string; lastName: string } | null | undefined) =>
  u ? `${u.firstName} ${u.lastName}` : "—";

/** "2026-11-04 19:30" in the report's timezone. */
function stamp(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** The label of the day / week / month a date belongs to. */
function bucket(date: string, group: ReportGroup): string {
  if (group === "month") return date.slice(0, 7);
  if (group === "week") return `Week of ${addDays(date, -(isoWeekday(date) - 1))}`;
  return date;
}

/** Adds a Branch column when an owner is looking at more than one branch. */
const branchCol = (c: Ctx): ReportColumn[] =>
  c.scope.branchId === null ? [col("branch", "Branch")] : [];
const branchCell = (c: Ctx, id: string): Record<string, ReportCell> =>
  c.scope.branchId === null ? { branch: c.scope.names.get(id) ?? "—" } : {};

// ── Builders ──────────────────────────────────────────────────────

async function sales(c: Ctx): Promise<Table> {
  const [payments, refunds, bills] = await Promise.all([
    prisma.payment.findMany({
      where: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        method: { not: "LOYALTY_POINTS" },
      },
      select: { createdAt: true, amount: true },
    }),
    prisma.refund.findMany({
      where: {
        createdAt: { gte: c.start, lt: c.end },
        payment: { branchId: c.inBranches, method: { not: "LOYALTY_POINTS" } },
      },
      select: { createdAt: true, amount: true },
    }),
    prisma.bill.findMany({
      where: {
        branchId: c.inBranches,
        status: { in: ["PAID", "REFUNDED"] },
        paidAt: { gte: c.start, lt: c.end },
      },
      select: { paidAt: true },
    }),
  ]);
  const rows = new Map<string, { bills: number; gross: number; refunds: number }>();
  const row = (key: string) =>
    rows.get(key) ?? rows.set(key, { bills: 0, gross: 0, refunds: 0 }).get(key)!;
  const key = (d: Date) => bucket(localDate(d, c.scope.timezone), c.group);
  for (const p of payments) row(key(p.createdAt)).gross += Number(p.amount);
  for (const r of refunds) row(key(r.createdAt)).refunds += Number(r.amount);
  for (const b of bills) row(key(b.paidAt!)).bills += 1;

  const table = [...rows]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      period,
      bills: v.bills,
      gross: money(v.gross),
      refunds: money(v.refunds),
      net: money(v.gross - v.refunds),
      average: v.bills > 0 ? money((v.gross - v.refunds) / v.bills) : 0,
    }));
  const totalBills = sum(table.map((r) => r.bills));
  const net = sum(table.map((r) => r.net));
  return {
    columns: [
      col("period", c.group === "day" ? "Day" : c.group === "week" ? "Week" : "Month"),
      col("bills", "Bills paid", "number"),
      col("gross", "Collected", "money"),
      col("refunds", "Refunds", "money"),
      col("net", "Net revenue", "money"),
      col("average", "Average bill", "money"),
    ],
    rows: table,
    totals: {
      period: "Total",
      bills: totalBills,
      gross: money(sum(table.map((r) => r.gross))),
      refunds: money(sum(table.map((r) => r.refunds))),
      net: money(net),
      average: totalBills > 0 ? money(net / totalBills) : 0,
    },
  };
}

async function orders(c: Ctx): Promise<Table> {
  const found = await prisma.order.findMany({
    where: { branchId: c.inBranches, createdAt: { gte: c.start, lt: c.end } },
    include: {
      table: { select: { tableNumber: true } },
      room: { select: { roomNumber: true } },
      waiter: { select: { firstName: true, lastName: true } },
      items: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP + 1,
  });
  const all = found.map((o) => ({
    ...branchCell(c, o.branchId),
    order: o.orderNumber,
    date: stamp(o.createdAt, c.scope.timezone),
    type: o.type === "DINE_IN" ? "Dine-in" : "Room service",
    location: o.table ? `Table ${o.table.tableNumber}` : `Room ${o.room?.roomNumber ?? ""}`.trim(),
    waiter: fullName(o.waiter),
    status: o.status.toLowerCase().replaceAll("_", " "),
    dishes: o.items.filter((i) => i.status !== "CANCELLED").length,
    subtotal: money(Number(o.subtotal)),
  }));
  const { rows, truncated } = cap(all);
  return {
    columns: [
      ...branchCol(c),
      col("order", "Order"),
      col("date", "Created", "datetime"),
      col("type", "Type"),
      col("location", "Where"),
      col("waiter", "Waiter"),
      col("status", "Status"),
      col("dishes", "Dishes", "number"),
      col("subtotal", "Subtotal", "money"),
    ],
    rows,
    truncated,
    totals: {
      order: "Total",
      dishes: sum(rows.map((r) => r.dishes as number)),
      subtotal: money(sum(rows.map((r) => r.subtotal as number))),
    },
  };
}

async function menuPerformance(c: Ctx): Promise<Table> {
  const items = await prisma.orderItem.findMany({
    where: {
      status: { not: "CANCELLED" },
      order: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        status: "COMPLETED",
      },
    },
    select: {
      name: true,
      quantity: true,
      unitPrice: true,
      orderId: true,
      menuItem: { select: { category: { select: { name: true } } } },
    },
  });
  const byName = new Map<
    string,
    { category: string; quantity: number; revenue: number; orders: Set<string> }
  >();
  for (const i of items) {
    const row =
      byName.get(i.name) ??
      byName
        .set(i.name, {
          category: i.menuItem?.category?.name ?? "—",
          quantity: 0,
          revenue: 0,
          orders: new Set(),
        })
        .get(i.name)!;
    row.quantity += i.quantity;
    row.revenue += Number(i.unitPrice) * i.quantity;
    row.orders.add(i.orderId);
  }
  const rows = [...byName]
    .map(([name, v]) => ({
      item: name,
      category: v.category,
      quantity: v.quantity,
      orders: v.orders.size,
      revenue: money(v.revenue),
      average: money(v.revenue / v.quantity),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  return {
    columns: [
      col("item", "Dish"),
      col("category", "Category"),
      col("quantity", "Sold", "number"),
      col("orders", "Orders", "number"),
      col("revenue", "Revenue", "money"),
      col("average", "Average price", "money"),
    ],
    rows,
    totals: {
      item: "Total",
      quantity: sum(rows.map((r) => r.quantity)),
      revenue: money(sum(rows.map((r) => r.revenue))),
    },
  };
}

async function employeePerformance(c: Ctx): Promise<Table> {
  const [orderRows, paymentRows, refundRows] = await Promise.all([
    prisma.order.groupBy({
      by: ["waiterId"],
      where: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        status: { notIn: [...NOT_COUNTED] },
      },
      _count: true,
      _sum: { subtotal: true },
    }),
    prisma.payment.groupBy({
      by: ["cashierId"],
      where: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        method: { not: "LOYALTY_POINTS" },
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.refund.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: c.start, lt: c.end },
        payment: { branchId: c.inBranches, method: { not: "LOYALTY_POINTS" } },
      },
      _count: true,
      _sum: { amount: true },
    }),
  ]);
  const ids = [
    ...new Set([
      ...orderRows.map((r) => r.waiterId),
      ...paymentRows.map((r) => r.cashierId),
      ...refundRows.map((r) => r.userId),
    ]),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
  });
  const people = new Map<string, Record<string, ReportCell>>();
  const person = (id: string) => {
    const u = users.find((x) => x.id === id);
    return (
      people.get(id) ??
      people
        .set(id, {
          employee: fullName(u),
          role: u?.role.name.toLowerCase() ?? "—",
          orders: 0,
          orderValue: 0,
          payments: 0,
          collected: 0,
          refunds: 0,
          refunded: 0,
        })
        .get(id)!
    );
  };
  for (const r of orderRows)
    Object.assign(person(r.waiterId), {
      orders: r._count,
      orderValue: money(Number(r._sum.subtotal ?? 0)),
    });
  for (const r of paymentRows)
    Object.assign(person(r.cashierId), {
      payments: r._count,
      collected: money(Number(r._sum.amount ?? 0)),
    });
  for (const r of refundRows)
    Object.assign(person(r.userId), {
      refunds: r._count,
      refunded: money(Number(r._sum.amount ?? 0)),
    });
  const rows = [...people.values()].sort((a, b) =>
    String(a.employee).localeCompare(String(b.employee)),
  );
  const total = (key: string) => sum(rows.map((r) => Number(r[key])));
  return {
    columns: [
      col("employee", "Employee"),
      col("role", "Role"),
      col("orders", "Orders taken", "number"),
      col("orderValue", "Order value", "money"),
      col("payments", "Payments taken", "number"),
      col("collected", "Collected", "money"),
      col("refunds", "Refunds", "number"),
      col("refunded", "Refunded", "money"),
    ],
    rows,
    totals: {
      employee: "Total",
      orders: total("orders"),
      orderValue: money(total("orderValue")),
      payments: total("payments"),
      collected: money(total("collected")),
      refunds: total("refunds"),
      refunded: money(total("refunded")),
    },
  };
}

async function reservations(c: Ctx): Promise<Table> {
  const found = await prisma.restaurantReservation.findMany({
    where: { branchId: c.inBranches, startsAt: { gte: c.start, lt: c.end } },
    select: { startsAt: true, status: true, partySize: true },
  });
  const days = new Map<
    string,
    { total: number; guests: number; completed: number; cancelled: number; noShow: number }
  >();
  for (const r of found) {
    const key = bucket(localDate(r.startsAt, c.scope.timezone), c.group);
    const row =
      days.get(key) ??
      days.set(key, { total: 0, guests: 0, completed: 0, cancelled: 0, noShow: 0 }).get(key)!;
    row.total += 1;
    if (r.status === "CANCELLED") row.cancelled += 1;
    else if (r.status === "NO_SHOW") row.noShow += 1;
    else {
      row.guests += r.partySize;
      if (r.status === "COMPLETED") row.completed += 1;
    }
  }
  const rows = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, ...v }));
  const t = (k: "total" | "guests" | "completed" | "cancelled" | "noShow") =>
    sum(rows.map((r) => r[k]));
  return {
    columns: [
      col("period", c.group === "day" ? "Day" : c.group === "week" ? "Week" : "Month"),
      col("total", "Reservations", "number"),
      col("guests", "Guests expected", "number"),
      col("completed", "Completed", "number"),
      col("cancelled", "Cancelled", "number"),
      col("noShow", "No-shows", "number"),
    ],
    rows,
    totals: {
      period: "Total",
      total: t("total"),
      guests: t("guests"),
      completed: t("completed"),
      cancelled: t("cancelled"),
      noShow: t("noShow"),
    },
  };
}

async function roomOccupancy(c: Ctx): Promise<Table> {
  const [rooms, bookings] = await Promise.all([
    prisma.room.count({ where: { branchId: c.inBranches, deletedAt: null } }),
    prisma.roomBooking.findMany({
      where: {
        branchId: c.inBranches,
        bookingStatus: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkOutDate: { gt: new Date(`${c.from}T00:00:00Z`) },
        checkInDate: { lte: new Date(`${c.to}T00:00:00Z`) },
      },
      select: { checkInDate: true, checkOutDate: true },
    }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const rows = eachDate(c.from, c.to).map((date) => {
    const occupied = bookings.filter(
      (b) => day(b.checkInDate) <= date && date < day(b.checkOutDate),
    ).length;
    return {
      date,
      rooms,
      occupied,
      available: Math.max(0, rooms - occupied),
      occupancy: rooms > 0 ? Math.round((occupied / rooms) * 1000) / 10 : 0,
    };
  });
  const nights = sum(rows.map((r) => r.occupied));
  return {
    columns: [
      col("date", "Night", "date"),
      col("rooms", "Rooms", "number"),
      col("occupied", "Occupied", "number"),
      col("available", "Free", "number"),
      col("occupancy", "Occupancy", "percent"),
    ],
    rows,
    totals: {
      date: "Average",
      rooms,
      occupied: rows.length ? Math.round((nights / rows.length) * 10) / 10 : 0,
      available: null,
      occupancy:
        rooms > 0 && rows.length ? Math.round((nights / (rooms * rows.length)) * 1000) / 10 : 0,
    },
  };
}

async function roomRevenue(c: Ctx): Promise<Table> {
  const found = await prisma.roomBooking.findMany({
    where: {
      branchId: c.inBranches,
      bookingStatus: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      checkInDate: { gte: new Date(`${c.from}T00:00:00Z`), lte: new Date(`${c.to}T00:00:00Z`) },
    },
    include: { roomType: { select: { name: true } } },
    orderBy: { checkInDate: "asc" },
    take: ROW_CAP + 1,
  });
  const { rows, truncated } = cap(
    found.map((b) => ({
      ...branchCell(c, b.branchId),
      reference: b.reference,
      guest: b.guestName,
      roomType: b.roomType.name,
      checkIn: b.checkInDate.toISOString().slice(0, 10),
      nights: b.nightCount,
      status: b.bookingStatus.toLowerCase().replaceAll("_", " "),
      payment: b.paymentStatus.toLowerCase().replaceAll("_", " "),
      total: money(Number(b.total)),
    })),
  );
  return {
    columns: [
      ...branchCol(c),
      col("reference", "Reference"),
      col("guest", "Guest"),
      col("roomType", "Room type"),
      col("checkIn", "Check-in", "date"),
      col("nights", "Nights", "number"),
      col("status", "Stay"),
      col("payment", "Payment"),
      col("total", "Total", "money"),
    ],
    rows,
    truncated,
    totals: {
      reference: "Total",
      nights: sum(rows.map((r) => r.nights as number)),
      total: money(sum(rows.map((r) => r.total as number))),
    },
  };
}

async function paymentsReport(c: Ctx): Promise<Table> {
  const found = await prisma.payment.findMany({
    where: { branchId: c.inBranches, createdAt: { gte: c.start, lt: c.end } },
    include: {
      cashier: { select: { firstName: true, lastName: true } },
      refunds: { select: { amount: true } },
      bill: { select: { billNumber: true, order: { select: { orderNumber: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP + 1,
  });
  const { rows, truncated } = cap(
    found.map((p) => ({
      ...branchCell(c, p.branchId),
      time: stamp(p.createdAt, c.scope.timezone),
      bill: p.bill.billNumber,
      order: p.bill.order.orderNumber,
      method: p.method.toLowerCase().replaceAll("_", " "),
      amount: money(Number(p.amount)),
      refunded: money(sum(p.refunds.map((r) => Number(r.amount)))),
      cashier: fullName(p.cashier),
    })),
  );
  return {
    columns: [
      ...branchCol(c),
      col("time", "Time", "datetime"),
      col("bill", "Bill"),
      col("order", "Order"),
      col("method", "Method"),
      col("amount", "Amount", "money"),
      col("refunded", "Refunded", "money"),
      col("cashier", "Cashier"),
    ],
    rows,
    truncated,
    totals: {
      time: "Total",
      amount: money(sum(rows.map((r) => r.amount as number))),
      refunded: money(sum(rows.map((r) => r.refunded as number))),
    },
  };
}

async function refundsReport(c: Ctx): Promise<Table> {
  const found = await prisma.refund.findMany({
    where: { createdAt: { gte: c.start, lt: c.end }, payment: { branchId: c.inBranches } },
    include: {
      user: { select: { firstName: true, lastName: true } },
      bill: { select: { billNumber: true } },
      payment: { select: { method: true, branchId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP + 1,
  });
  const { rows, truncated } = cap(
    found.map((r) => ({
      ...branchCell(c, r.payment.branchId),
      time: stamp(r.createdAt, c.scope.timezone),
      bill: r.bill.billNumber,
      method: r.payment.method.toLowerCase().replaceAll("_", " "),
      amount: money(Number(r.amount)),
      reason: r.reason,
      by: fullName(r.user),
    })),
  );
  return {
    columns: [
      ...branchCol(c),
      col("time", "Time", "datetime"),
      col("bill", "Bill"),
      col("method", "Method"),
      col("amount", "Amount", "money"),
      col("reason", "Reason"),
      col("by", "Processed by"),
    ],
    rows,
    truncated,
    totals: { time: "Total", amount: money(sum(rows.map((r) => r.amount as number))) },
  };
}

async function inventoryReport(c: Ctx): Promise<Table> {
  const items = await prisma.inventoryItem.findMany({
    where: { branchId: c.inBranches, deletedAt: null },
    include: { supplier: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: ROW_CAP + 1,
  });
  const today = todayIn(c.scope.timezone);
  const { rows, truncated } = cap(
    items.map((i) => {
      const quantity = Number(i.quantity);
      const status = inventoryStatus(
        {
          quantity,
          minimumQuantity: Number(i.minimumQuantity),
          expiryDate: i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : null,
        },
        today,
      );
      return {
        ...branchCell(c, i.branchId),
        sku: i.sku,
        item: i.name,
        category: i.category,
        quantity,
        unit: i.unit,
        reorder: Number(i.minimumQuantity),
        status: INVENTORY_STATUS_LABELS[status],
        expiry: i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : null,
        supplier: i.supplier?.name ?? "—",
        value: money(quantity * Number(i.cost)),
      };
    }),
  );
  return {
    columns: [
      ...branchCol(c),
      col("sku", "SKU"),
      col("item", "Item"),
      col("category", "Category"),
      col("quantity", "On hand", "number"),
      col("unit", "Unit"),
      col("reorder", "Reorder at", "number"),
      col("status", "Status"),
      col("expiry", "Expires", "date"),
      col("supplier", "Supplier"),
      col("value", "Stock value", "money"),
    ],
    rows,
    truncated,
    totals: { sku: "Total", value: money(sum(rows.map((r) => r.value as number))) },
  };
}

async function waste(c: Ctx): Promise<Table> {
  const found = await prisma.stockTransaction.findMany({
    where: { branchId: c.inBranches, type: "WASTE", createdAt: { gte: c.start, lt: c.end } },
    include: {
      item: { select: { name: true, sku: true, unit: true, cost: true } },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP + 1,
  });
  const { rows, truncated } = cap(
    found.map((t) => {
      const quantity = Math.abs(Number(t.quantityChange));
      return {
        ...branchCell(c, t.branchId),
        time: stamp(t.createdAt, c.scope.timezone),
        item: t.item.name,
        sku: t.item.sku,
        quantity,
        unit: t.item.unit,
        cost: money(quantity * Number(t.unitCost ?? t.item.cost)),
        note: t.note,
        by: fullName(t.user),
      };
    }),
  );
  return {
    columns: [
      ...branchCol(c),
      col("time", "When", "datetime"),
      col("item", "Item"),
      col("sku", "SKU"),
      col("quantity", "Quantity", "number"),
      col("unit", "Unit"),
      col("cost", "Cost of waste", "money"),
      col("note", "Note"),
      col("by", "Recorded by"),
    ],
    rows,
    truncated,
    totals: { time: "Total", cost: money(sum(rows.map((r) => r.cost as number))) },
  };
}

async function loyalty(c: Ctx): Promise<Table> {
  const ledger = await prisma.loyaltyTransaction.findMany({
    where: { createdAt: { gte: c.start, lt: c.end } },
    select: { type: true, points: true, account: { select: { userId: true, points: true } } },
  });
  const ids = [...new Set(ledger.map((l) => l.account.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const byUser = new Map<
    string,
    { earned: number; redeemed: number; adjusted: number; balance: number }
  >();
  for (const l of ledger) {
    const row =
      byUser.get(l.account.userId) ??
      byUser
        .set(l.account.userId, { earned: 0, redeemed: 0, adjusted: 0, balance: l.account.points })
        .get(l.account.userId)!;
    if (l.type === "EARN") row.earned += l.points;
    else if (l.type === "REDEEM") row.redeemed += -l.points;
    else row.adjusted += l.points;
  }
  const rows = [...byUser]
    .map(([id, v]) => {
      const u = users.find((x) => x.id === id);
      return { customer: fullName(u), email: u?.email ?? "—", ...v };
    })
    .sort((a, b) => b.earned - a.earned);
  const t = (k: "earned" | "redeemed" | "adjusted" | "balance") => sum(rows.map((r) => r[k]));
  return {
    columns: [
      col("customer", "Customer"),
      col("email", "Email"),
      col("earned", "Earned", "number"),
      col("redeemed", "Redeemed", "number"),
      col("adjusted", "Adjusted / returned", "number"),
      col("balance", "Balance now", "number"),
    ],
    rows,
    totals: {
      customer: "Total",
      earned: t("earned"),
      redeemed: t("redeemed"),
      adjusted: t("adjusted"),
      balance: t("balance"),
    },
  };
}

async function branchPerformance(c: Ctx): Promise<Table> {
  const [payments, refunds, orderRows, bills, rooms, bookings] = await Promise.all([
    prisma.payment.findMany({
      where: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        method: { not: "LOYALTY_POINTS" },
      },
      select: { branchId: true, amount: true },
    }),
    prisma.refund.findMany({
      where: {
        createdAt: { gte: c.start, lt: c.end },
        payment: { branchId: c.inBranches, method: { not: "LOYALTY_POINTS" } },
      },
      select: { amount: true, payment: { select: { branchId: true } } },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: {
        branchId: c.inBranches,
        createdAt: { gte: c.start, lt: c.end },
        status: { notIn: [...NOT_COUNTED] },
      },
      _count: true,
    }),
    prisma.bill.groupBy({
      by: ["branchId"],
      where: {
        branchId: c.inBranches,
        status: { in: ["PAID", "REFUNDED"] },
        paidAt: { gte: c.start, lt: c.end },
      },
      _count: true,
    }),
    prisma.room.groupBy({
      by: ["branchId"],
      where: { branchId: c.inBranches, deletedAt: null },
      _count: true,
    }),
    prisma.roomBooking.findMany({
      where: {
        branchId: c.inBranches,
        bookingStatus: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkOutDate: { gt: new Date(`${c.from}T00:00:00Z`) },
        checkInDate: { lte: new Date(`${c.to}T00:00:00Z`) },
      },
      select: { branchId: true, checkInDate: true, checkOutDate: true },
    }),
  ]);
  const dates = eachDate(c.from, c.to);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const rows = c.scope.branchIds.map((id) => {
    const net =
      sum(payments.filter((p) => p.branchId === id).map((p) => Number(p.amount))) -
      sum(refunds.filter((r) => r.payment.branchId === id).map((r) => Number(r.amount)));
    const billCount = bills.find((b) => b.branchId === id)?._count ?? 0;
    const roomCount = rooms.find((r) => r.branchId === id)?._count ?? 0;
    const nights = sum(
      dates.map(
        (d) =>
          bookings.filter(
            (b) => b.branchId === id && day(b.checkInDate) <= d && d < day(b.checkOutDate),
          ).length,
      ),
    );
    return {
      branch: c.scope.names.get(id) ?? "—",
      orders: orderRows.find((o) => o.branchId === id)?._count ?? 0,
      bills: billCount,
      net: money(net),
      average: billCount > 0 ? money(net / billCount) : 0,
      occupancy:
        roomCount > 0 && dates.length
          ? Math.round((nights / (roomCount * dates.length)) * 1000) / 10
          : 0,
    };
  });
  return {
    columns: [
      col("branch", "Branch"),
      col("orders", "Orders", "number"),
      col("bills", "Bills paid", "number"),
      col("net", "Net revenue", "money"),
      col("average", "Average bill", "money"),
      col("occupancy", "Room occupancy", "percent"),
    ],
    rows,
    totals: {
      branch: "Company",
      orders: sum(rows.map((r) => r.orders)),
      bills: sum(rows.map((r) => r.bills)),
      net: money(sum(rows.map((r) => r.net))),
    },
  };
}

const BUILDERS: Record<ReportType, (c: Ctx) => Promise<Table>> = {
  sales,
  orders,
  "menu-performance": menuPerformance,
  "employee-performance": employeePerformance,
  reservations,
  "room-occupancy": roomOccupancy,
  "room-revenue": roomRevenue,
  payments: paymentsReport,
  refunds: refundsReport,
  inventory: inventoryReport,
  waste,
  loyalty,
  "branch-performance": branchPerformance,
};

export const reportService = {
  async run(
    auth: AuthContext,
    type: ReportType,
    query: { branchId?: string; from?: string; to?: string; group: ReportGroup },
  ): Promise<ReportDto> {
    if ((OWNER_ONLY_REPORTS as readonly string[]).includes(type) && auth.role !== "OWNER") {
      throw AppError.forbidden("Only owners can run this report.");
    }
    // Comparing branches is always company-wide, whatever branch is selected in the page.
    const scope = await resolveScope(
      auth,
      OWNER_ONLY_REPORTS.includes(type) ? undefined : query.branchId,
    );
    const today = todayIn(scope.timezone);
    const to = query.to ?? today;
    const from = query.from ?? addDays(to, -29);
    if (from > to) throw AppError.validation("The start date is after the end date.");
    if (eachDate(from, to).length >= 400)
      throw AppError.validation("Choose a range of less than a year.");
    const { start, end } = instants(from, to, scope.timezone);

    const table = await BUILDERS[type]({
      scope,
      from,
      to,
      group: query.group,
      start,
      end,
      inBranches: { in: scope.branchIds },
    });
    return {
      type,
      title: REPORT_LABELS[type],
      subtitle: `${scope.name} · ${type === "inventory" ? "stock as of now" : `${from} to ${to}`}`,
      currency: scope.currency,
      from,
      to,
      group: query.group,
      columns: table.columns,
      rows: table.rows,
      totals: table.totals ?? null,
      truncated: table.truncated ?? false,
      generatedAt: new Date().toISOString(),
    };
  },
};
