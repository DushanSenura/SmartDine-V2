import { inventoryStatus, type DashboardDto, type PaymentMethod } from "@smartdine/shared";

import { prisma } from "../../config/database";
import type { AuthContext } from "../../types/express";
import {
  addDays,
  eachDate,
  instants,
  isoWeekday,
  localDate,
  localHour,
  resolveScope,
  round2,
  sum,
  todayIn,
} from "./scope";

const NOT_COUNTED = ["DRAFT", "CANCELLED", "VOID"] as const;
const ACTIVE_TABLE_STATUSES = [
  "OCCUPIED",
  "ORDERING",
  "WAITING_FOR_FOOD",
  "DINING",
  "PAYMENT_PENDING",
] as const;

const bump = <K>(map: Map<K, number>, key: K, by: number) => map.set(key, (map.get(key) ?? 0) + by);

/**
 * The owner / manager dashboard. One pass over the period's payments, orders and bookings, bucketed
 * by the branch's own calendar day, so "today" means the same thing everywhere on the screen.
 * Revenue is money actually collected, net of refunds; loyalty points are a tender, not takings.
 */
export async function buildDashboard(
  auth: AuthContext,
  query: { branchId?: string; days: number },
): Promise<DashboardDto> {
  const scope = await resolveScope(auth, query.branchId);
  const { timezone, branchIds } = scope;
  const today = todayIn(timezone);
  const dates = eachDate(addDays(today, -(query.days - 1)), today);
  const { start } = instants(dates[0]!, today, timezone);
  const inBranches = { in: branchIds };

  const [
    payments,
    refunds,
    orders,
    items,
    bills,
    reservations,
    bookings,
    rooms,
    tables,
    prepared,
    stock,
  ] = await Promise.all([
    prisma.payment.findMany({
      where: { branchId: inBranches, createdAt: { gte: start } },
      select: { branchId: true, createdAt: true, amount: true, method: true },
    }),
    prisma.refund.findMany({
      where: { createdAt: { gte: start }, payment: { branchId: inBranches } },
      select: {
        createdAt: true,
        amount: true,
        payment: { select: { method: true, branchId: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        branchId: inBranches,
        createdAt: { gte: start },
        status: { notIn: [...NOT_COUNTED] },
      },
      select: { branchId: true, createdAt: true },
    }),
    prisma.orderItem.findMany({
      where: {
        status: { not: "CANCELLED" },
        order: { branchId: inBranches, createdAt: { gte: start }, status: "COMPLETED" },
      },
      select: {
        name: true,
        quantity: true,
        unitPrice: true,
        menuItem: { select: { category: { select: { name: true } } } },
      },
    }),
    prisma.bill.findMany({
      where: { branchId: inBranches, status: "PAID", paidAt: { gte: start } },
      select: { paidAt: true, customerId: true },
    }),
    prisma.restaurantReservation.findMany({
      where: {
        branchId: inBranches,
        startsAt: { gte: start },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { startsAt: true },
    }),
    prisma.roomBooking.findMany({
      where: {
        branchId: inBranches,
        bookingStatus: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkOutDate: { gt: new Date(`${dates[0]}T00:00:00Z`) },
        checkInDate: { lte: new Date(`${today}T00:00:00Z`) },
      },
      select: { branchId: true, checkInDate: true, checkOutDate: true },
    }),
    prisma.room.groupBy({
      by: ["branchId", "status"],
      where: { branchId: inBranches, deletedAt: null },
      _count: true,
    }),
    prisma.restaurantTable.groupBy({
      by: ["status"],
      where: { branchId: inBranches, deletedAt: null },
      _count: true,
    }),
    prisma.orderItem.findMany({
      where: {
        preparedAt: { gte: start },
        order: { branchId: inBranches, sentToKitchenAt: { not: null } },
      },
      select: { preparedAt: true, order: { select: { sentToKitchenAt: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { branchId: inBranches, deletedAt: null },
      select: { quantity: true, minimumQuantity: true, expiryDate: true },
    }),
  ]);

  // ── Money ──────────────────────────────────────────────────────
  const money = payments.filter((p) => p.method !== "LOYALTY_POINTS");
  const revenueByDay = new Map<string, number>();
  const revenueByBranch = new Map<string, number>();
  const hourly = new Map<number, number>();
  for (const p of money) {
    const amount = Number(p.amount);
    bump(revenueByDay, localDate(p.createdAt, timezone), amount);
    bump(revenueByBranch, p.branchId, amount);
    bump(hourly, localHour(p.createdAt, timezone), amount);
  }
  for (const r of refunds.filter((r) => r.payment.method !== "LOYALTY_POINTS")) {
    const amount = Number(r.amount);
    bump(revenueByDay, localDate(r.createdAt, timezone), -amount);
    bump(revenueByBranch, r.payment.branchId, -amount);
  }

  const ordersByDay = new Map<string, number>();
  const ordersByBranch = new Map<string, number>();
  for (const o of orders) {
    bump(ordersByDay, localDate(o.createdAt, timezone), 1);
    bump(ordersByBranch, o.branchId, 1);
  }

  const methodTotals = new Map<PaymentMethod, { total: number; count: number }>();
  for (const p of payments) {
    const row = methodTotals.get(p.method) ?? { total: 0, count: 0 };
    row.total += Number(p.amount);
    row.count += 1;
    methodTotals.set(p.method, row);
  }

  // ── Menu ───────────────────────────────────────────────────────
  const categoryRevenue = new Map<string, number>();
  const itemTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const i of items) {
    const revenue = Number(i.unitPrice) * i.quantity;
    bump(categoryRevenue, i.menuItem?.category?.name ?? "Other", revenue);
    const row = itemTotals.get(i.name) ?? { quantity: 0, revenue: 0 };
    row.quantity += i.quantity;
    row.revenue += revenue;
    itemTotals.set(i.name, row);
  }

  // ── Rooms ──────────────────────────────────────────────────────
  const roomsTotal = sum(rooms.map((r) => r._count));
  const roomsOccupied = sum(rooms.filter((r) => r.status === "OCCUPIED").map((r) => r._count));
  const roomsAvailable = sum(rooms.filter((r) => r.status === "AVAILABLE").map((r) => r._count));
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
  const night = (d: Date) => d.toISOString().slice(0, 10);
  const occupancyTrend = dates.map((date) => ({
    date,
    occupancyPercent: pct(
      bookings.filter((b) => night(b.checkInDate) <= date && date < night(b.checkOutDate)).length,
      roomsTotal,
    ),
  }));

  // ── Reservations ───────────────────────────────────────────────
  const reservationDays = reservations.map((r) => localDate(r.startsAt, timezone));
  const weekdayCounts = new Map<number, number>();
  for (const d of reservationDays) bump(weekdayCounts, isoWeekday(d), 1);

  // ── Kitchen & stock ────────────────────────────────────────────
  const todayPrep = prepared
    .filter(
      (p) => p.preparedAt && p.order.sentToKitchenAt && localDate(p.preparedAt, timezone) === today,
    )
    .map((p) => (p.preparedAt!.getTime() - p.order.sentToKitchenAt!.getTime()) / 60_000)
    .filter((m) => m >= 0);
  const lowStockItems = stock.filter((s) => {
    const status = inventoryStatus(
      {
        quantity: Number(s.quantity),
        minimumQuantity: Number(s.minimumQuantity),
        expiryDate: s.expiryDate ? s.expiryDate.toISOString().slice(0, 10) : null,
      },
      today,
    );
    return status === "LOW_STOCK" || status === "OUT_OF_STOCK";
  }).length;

  const paidToday = bills.filter((b) => b.paidAt && localDate(b.paidAt, timezone) === today);
  const revenueToday = round2(revenueByDay.get(today) ?? 0);

  return {
    scope: {
      branchId: scope.branchId,
      name: scope.name,
      currency: scope.currency,
      timezone,
      days: query.days,
      today,
    },
    cards: {
      revenueToday,
      ordersToday: ordersByDay.get(today) ?? 0,
      averageOrderValue: paidToday.length > 0 ? round2(revenueToday / paidToday.length) : 0,
      activeTables: sum(
        tables
          .filter((t) => (ACTIVE_TABLE_STATUSES as readonly string[]).includes(t.status))
          .map((t) => t._count),
      ),
      totalTables: sum(tables.map((t) => t._count)),
      reservationsToday: reservationDays.filter((d) => d === today).length,
      roomOccupancyPercent: pct(roomsOccupied, roomsTotal),
      roomsOccupied,
      roomsTotal,
      roomsAvailable,
      kitchenAverageMinutes:
        todayPrep.length > 0 ? Math.round((sum(todayPrep) / todayPrep.length) * 10) / 10 : null,
      customersToday: new Set(paidToday.map((b) => b.customerId).filter(Boolean)).size,
      lowStockItems,
    },
    revenueTrend: dates.map((date) => ({
      date,
      revenue: round2(revenueByDay.get(date) ?? 0),
      orders: ordersByDay.get(date) ?? 0,
    })),
    salesByCategory: [...categoryRevenue]
      .map(([category, revenue]) => ({ category, revenue: round2(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    popularItems: [...itemTotals]
      .map(([name, v]) => ({ name, quantity: v.quantity, revenue: round2(v.revenue) }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8),
    paymentMethods: [...methodTotals]
      .map(([method, v]) => ({ method, total: round2(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total),
    hourlySales: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: round2(hourly.get(hour) ?? 0),
    })),
    occupancyTrend,
    reservationPatterns: Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      count: weekdayCounts.get(i + 1) ?? 0,
    })),
    branchComparison:
      scope.branchId === null
        ? branchIds.map((id) => ({
            branchId: id,
            name: scope.names.get(id) ?? "Branch",
            revenue: round2(revenueByBranch.get(id) ?? 0),
            orders: ordersByBranch.get(id) ?? 0,
            occupancyPercent: pct(
              sum(
                rooms
                  .filter((r) => r.branchId === id && r.status === "OCCUPIED")
                  .map((r) => r._count),
              ),
              sum(rooms.filter((r) => r.branchId === id).map((r) => r._count)),
            ),
          }))
        : null,
  };
}
