import type {
  CustomerDetailDto,
  CustomerLookupDto,
  CustomerSummaryDto,
  LoyaltyAccountDto,
  LoyaltyAdjustInput,
  UpdateCustomerInput,
  UpdateMyProfileInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { escapeLike } from "../../utils/prisma";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";
import { postPoints } from "./loyalty";

const PAGE_SIZE = 25;
const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function loyaltySettings() {
  const [settings, company] = await Promise.all([
    prisma.companySettings.findFirst(),
    prisma.company.findFirst({ where: { deletedAt: null } }),
  ]);
  return {
    enabled: settings?.loyaltyEnabled ?? false,
    currencyPerPoint: Number(settings?.loyaltyCurrencyPerPoint ?? 100),
    pointValue: Number(settings?.loyaltyPointValue ?? 1),
    currency: company?.currency ?? "LKR",
  };
}

/** Customers are users holding the CUSTOMER role. */
const customerWhere = (extra: Prisma.UserWhereInput = {}): Prisma.UserWhereInput => ({
  deletedAt: null,
  role: { name: "CUSTOMER" },
  ...extra,
});

interface Stats {
  visitCount: number;
  totalSpent: number;
  lastVisit: Date | null;
}

/**
 * Visits and spend are derived, never stored, so they can't drift from the bills: a visit is a paid
 * bill or a finished stay; spend is what was paid net of refunds, plus the stay total.
 */
async function statsFor(userIds: string[]): Promise<Map<string, Stats>> {
  const stats = new Map<string, Stats>(
    userIds.map((id) => [id, { visitCount: 0, totalSpent: 0, lastVisit: null }]),
  );
  if (userIds.length === 0) return stats;
  const [bills, stays] = await Promise.all([
    prisma.bill.findMany({
      where: { customerId: { in: userIds }, status: { in: ["PAID", "REFUNDED"] } },
      select: { customerId: true, total: true, refundedAmount: true, paidAt: true },
    }),
    prisma.roomBooking.findMany({
      where: { userId: { in: userIds }, bookingStatus: "CHECKED_OUT" },
      select: { userId: true, total: true, checkOutDate: true },
    }),
  ]);
  const bump = (id: string | null, amount: number, at: Date | null) => {
    const s = id ? stats.get(id) : undefined;
    if (!s) return;
    s.visitCount += 1;
    s.totalSpent = Math.round((s.totalSpent + amount) * 100) / 100;
    if (at && (!s.lastVisit || at > s.lastVisit)) s.lastVisit = at;
  };
  for (const b of bills) bump(b.customerId, Number(b.total) - Number(b.refundedAmount), b.paidAt);
  for (const s of stays) bump(s.userId, Number(s.total), s.checkOutDate);
  return stats;
}

type CustomerRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    email: true;
    phone: true;
    createdAt: true;
    loyaltyAccount: { select: { points: true } };
  };
}>;
const summarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  createdAt: true,
  loyaltyAccount: { select: { points: true } },
} satisfies Prisma.UserSelect;

function toSummary(user: CustomerRow, stats: Stats): CustomerSummaryDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    points: user.loyaltyAccount?.points ?? 0,
    visitCount: stats.visitCount,
    totalSpent: stats.totalSpent,
    lastVisit: stats.lastVisit?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function loyaltyAccount(userId: string, transactions = 30): Promise<LoyaltyAccountDto> {
  const [settings, account] = await Promise.all([
    loyaltySettings(),
    prisma.loyaltyAccount.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: transactions } },
    }),
  ]);
  return {
    enabled: settings.enabled,
    points: account?.points ?? 0,
    lifetimePoints: account?.lifetimePoints ?? 0,
    currencyPerPoint: settings.currencyPerPoint,
    pointValue: settings.pointValue,
    currency: settings.currency,
    transactions: (account?.transactions ?? []).map((t) => ({
      id: t.id,
      type: t.type,
      points: t.points,
      balanceAfter: t.balanceAfter,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

async function detail(userId: string, forStaff: boolean): Promise<CustomerDetailDto> {
  const user = await prisma.user.findFirst({
    where: customerWhere({ id: userId }),
    select: { ...summarySelect, customerProfile: true },
  });
  if (!user) throw AppError.notFound("Customer not found.");
  const [stats, loyalty, reservations, stays, bills, settings] = await Promise.all([
    statsFor([userId]),
    loyaltyAccount(userId),
    prisma.restaurantReservation.findMany({
      where: { userId },
      orderBy: { startsAt: "desc" },
      take: 10,
    }),
    prisma.roomBooking.findMany({
      where: { userId },
      orderBy: { checkInDate: "desc" },
      take: 10,
    }),
    prisma.bill.findMany({
      where: { customerId: userId, status: { in: ["PAID", "REFUNDED"] } },
      orderBy: { paidAt: "desc" },
      take: 10,
    }),
    loyaltySettings(),
  ]);
  const profile = user.customerProfile;
  return {
    ...toSummary(user, stats.get(userId)!),
    birthday: dateText(profile?.birthday ?? null),
    address: profile?.address ?? null,
    preferences: profile?.preferences ?? null,
    dietaryPreferences: profile?.dietaryPreferences ?? [],
    allergies: profile?.allergies ?? [],
    // Staff notes are private to staff.
    notes: forStaff ? (profile?.notes ?? null) : null,
    currency: settings.currency,
    loyalty,
    reservations: reservations.map((r) => ({
      id: r.id,
      reference: r.reference,
      startsAt: r.startsAt.toISOString(),
      status: r.status,
      partySize: r.partySize,
    })),
    stays: stays.map((s) => ({
      id: s.id,
      reference: s.reference,
      checkIn: dateText(s.checkInDate)!,
      checkOut: dateText(s.checkOutDate)!,
      status: s.bookingStatus,
      total: Number(s.total),
    })),
    bills: bills.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      total: Number(b.total),
      status: b.status,
      paidAt: b.paidAt?.toISOString() ?? null,
    })),
  };
}

async function writeProfile(userId: string, input: UpdateCustomerInput | UpdateMyProfileInput) {
  const {
    firstName,
    lastName,
    phone,
    birthday,
    address,
    preferences,
    dietaryPreferences,
    allergies,
  } = input as UpdateCustomerInput;
  const notes = "notes" in input ? input.notes : undefined;
  const profile = {
    ...(birthday !== undefined && { birthday: birthday ? parseDateOnly(birthday) : null }),
    ...(address !== undefined && { address }),
    ...(preferences !== undefined && { preferences }),
    ...(dietaryPreferences !== undefined && { dietaryPreferences }),
    ...(allergies !== undefined && { allergies }),
    ...(notes !== undefined && { notes }),
  };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
      },
    }),
    prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, ...profile },
      update: profile,
    }),
  ]);
}

export const customerService = {
  async list(query: { q?: string; page: number }) {
    const where = customerWhere(
      query.q
        ? {
            OR: [
              { firstName: { contains: escapeLike(query.q), mode: "insensitive" } },
              { lastName: { contains: escapeLike(query.q), mode: "insensitive" } },
              { email: { contains: escapeLike(query.q), mode: "insensitive" } },
              { phone: { contains: escapeLike(query.q) } },
            ],
          }
        : {},
    );
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: summarySelect,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.user.count({ where }),
    ]);
    const stats = await statsFor(users.map((u) => u.id));
    return {
      customers: users.map((u) => toSummary(u, stats.get(u.id)!)),
      meta: { total, page: query.page, pageSize: PAGE_SIZE },
    };
  },

  /** Name, email or phone — just enough to attach a customer to a bill at the till. */
  async lookup(q: string): Promise<CustomerLookupDto[]> {
    const users = await prisma.user.findMany({
      where: customerWhere({
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: escapeLike(q) } },
        ],
      }),
      select: summarySelect,
      orderBy: { lastName: "asc" },
      take: 8,
    });
    return users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      phone: u.phone,
      points: u.loyaltyAccount?.points ?? 0,
    }));
  },

  get: (id: string) => detail(id, true),
  me: (auth: AuthContext) => detail(auth.userId, false),

  async update(id: string, input: UpdateCustomerInput) {
    await detail(id, true); // 404 for non-customers
    await writeProfile(id, input);
    return detail(id, true);
  },

  async updateMe(auth: AuthContext, input: UpdateMyProfileInput) {
    await writeProfile(auth.userId, input);
    return detail(auth.userId, false);
  },

  myLoyalty: (auth: AuthContext) => loyaltyAccount(auth.userId, 50),

  async adjustPoints(auth: AuthContext, id: string, input: LoyaltyAdjustInput) {
    await detail(id, true);
    await prisma.$transaction((tx) =>
      postPoints(tx, id, "ADJUST", input.points, { note: input.note, staffId: auth.userId }),
    );
    void audit(auth, {
      action: "loyalty.adjusted",
      entity: "loyalty",
      entityId: id,
      newValue: { points: input.points, note: input.note },
    });
    return loyaltyAccount(id, 50);
  },

  // ── Favourites ───────────────────────────────────────────────────
  async favourites(auth: AuthContext): Promise<string[]> {
    const rows = await prisma.customerFavourite.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => r.menuItemId);
  },

  async addFavourite(auth: AuthContext, menuItemId: string) {
    const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, deletedAt: null } });
    if (!item) throw AppError.notFound("That dish isn't on the menu.");
    await prisma.customerFavourite.upsert({
      where: { userId_menuItemId: { userId: auth.userId, menuItemId } },
      create: { userId: auth.userId, menuItemId },
      update: {},
    });
  },

  async removeFavourite(auth: AuthContext, menuItemId: string) {
    await prisma.customerFavourite.deleteMany({ where: { userId: auth.userId, menuItemId } });
  },

  // ── Invoices ─────────────────────────────────────────────────────
  async myInvoices(auth: AuthContext) {
    const bills = await prisma.bill.findMany({
      where: { customerId: auth.userId, status: { in: ["PAID", "REFUNDED"] } },
      include: {
        receipt: { select: { id: true } },
        branch: { select: { name: true, currency: true } },
        order: {
          select: {
            orderNumber: true,
            table: { select: { tableNumber: true } },
            room: { select: { roomNumber: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    });
    return bills.map((b) => ({
      billId: b.id,
      billNumber: b.billNumber,
      receiptId: b.receipt?.id ?? null,
      branchName: b.branch.name,
      currency: b.branch.currency,
      location: b.order.table
        ? `Table ${b.order.table.tableNumber}`
        : `Room ${b.order.room?.roomNumber ?? ""}`.trim(),
      total: Number(b.total),
      refundedAmount: Number(b.refundedAmount),
      pointsEarned: b.pointsEarned,
      paidAt: b.paidAt?.toISOString() ?? null,
    }));
  },
};
