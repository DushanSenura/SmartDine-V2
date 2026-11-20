import {
  Permissions,
  roleHasPermission,
  type Permission,
  type SearchResultDto,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { escapeLike } from "../../utils/prisma";
import { scopeBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";

const PER_KIND = 5;

const has = (v: string): Prisma.StringFilter => ({ contains: escapeLike(v), mode: "insensitive" });

/**
 * One search box for the staff app. Each kind of result is only searched when the person's role may
 * open that screen, and branch staff only ever see their own branch, so searching can't be used to
 * read what the menus would hide.
 */
export async function searchEverything(
  auth: AuthContext,
  q: string,
  requestedBranch?: string,
): Promise<SearchResultDto[]> {
  const branchId = scopeBranch(auth, requestedBranch);
  const inBranch = branchId ? { branchId } : {};
  const allowed = (p: Permission) => roleHasPermission(auth.role, p);
  const jobs: Promise<SearchResultDto[]>[] = [];

  if (allowed(Permissions.ORDERS_VIEW)) {
    jobs.push(
      prisma.order
        .findMany({
          where: {
            ...inBranch,
            OR: [{ orderNumber: has(q) }, { guestName: has(q) }, { table: { tableNumber: q } }],
          },
          include: {
            table: { select: { tableNumber: true } },
            room: { select: { roomNumber: true } },
          },
          orderBy: { createdAt: "desc" },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((o) => ({
            kind: "order" as const,
            id: o.id,
            title: `Order ${o.orderNumber}`,
            subtitle: `${o.table ? `Table ${o.table.tableNumber}` : `Room ${o.room?.roomNumber ?? ""}`} · ${o.status.toLowerCase().replaceAll("_", " ")}`,
            link: `/app/orders/${o.id}`,
          })),
        ),
    );
  }
  if (allowed(Permissions.RESERVATIONS_MANAGE)) {
    jobs.push(
      prisma.restaurantReservation
        .findMany({
          where: {
            ...inBranch,
            OR: [
              { reference: has(q) },
              { guestName: has(q) },
              { guestPhone: has(q) },
              { guestEmail: has(q) },
            ],
          },
          orderBy: { startsAt: "desc" },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((r) => ({
            kind: "reservation" as const,
            id: r.id,
            title: `${r.guestName} · ${r.reference}`,
            subtitle: `Party of ${r.partySize} · ${r.status.toLowerCase().replaceAll("_", " ")}`,
            link: "/app/reservations",
          })),
        ),
    );
  }
  if (allowed(Permissions.ROOMS_MANAGE)) {
    jobs.push(
      prisma.roomBooking
        .findMany({
          where: {
            ...inBranch,
            OR: [
              { reference: has(q) },
              { guestName: has(q) },
              { guestPhone: has(q) },
              { guestEmail: has(q) },
            ],
          },
          orderBy: { checkInDate: "desc" },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((b) => ({
            kind: "room-booking" as const,
            id: b.id,
            title: `${b.guestName} · ${b.reference}`,
            subtitle: `${b.checkInDate.toISOString().slice(0, 10)} → ${b.checkOutDate.toISOString().slice(0, 10)} · ${b.bookingStatus.toLowerCase().replaceAll("_", " ")}`,
            link: "/app/rooms/bookings",
          })),
        ),
      prisma.room
        .findMany({
          where: { ...inBranch, deletedAt: null, roomNumber: has(q) },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((r) => ({
            kind: "room" as const,
            id: r.id,
            title: `Room ${r.roomNumber}`,
            subtitle: `Floor ${r.floor} · ${r.status.toLowerCase().replaceAll("_", " ")}`,
            link: "/app/rooms",
          })),
        ),
    );
  }
  if (allowed(Permissions.CUSTOMERS_MANAGE)) {
    jobs.push(
      prisma.user
        .findMany({
          where: {
            deletedAt: null,
            role: { name: "CUSTOMER" },
            OR: [
              { firstName: has(q) },
              { lastName: has(q) },
              { email: has(q) },
              { phone: { contains: escapeLike(q) } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { lastName: "asc" },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((u) => ({
            kind: "customer" as const,
            id: u.id,
            title: `${u.firstName} ${u.lastName}`,
            subtitle: u.email,
            link: `/app/customers/${u.id}`,
          })),
        ),
    );
  }
  if (allowed(Permissions.MENU_AVAILABILITY) || allowed(Permissions.MENU_MANAGE)) {
    jobs.push(
      prisma.menuItem
        .findMany({
          where: { ...inBranch, deletedAt: null, name: has(q) },
          include: { category: { select: { name: true } } },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((m) => ({
            kind: "menu-item" as const,
            id: m.id,
            title: m.name,
            subtitle: `${m.category.name} · ${m.availability.toLowerCase().replaceAll("_", " ")}`,
            link: "/app/menu",
          })),
        ),
    );
  }
  if (allowed(Permissions.TABLES_VIEW)) {
    jobs.push(
      prisma.restaurantTable
        .findMany({
          where: { ...inBranch, deletedAt: null, OR: [{ tableNumber: has(q) }, { name: has(q) }] },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((t) => ({
            kind: "table" as const,
            id: t.id,
            title: `Table ${t.tableNumber}`,
            subtitle: `${t.capacity} seats · ${t.status.toLowerCase().replaceAll("_", " ")}`,
            link: "/app/floor-plan",
          })),
        ),
    );
  }
  if (allowed(Permissions.STAFF_MANAGE)) {
    jobs.push(
      prisma.user
        .findMany({
          where: {
            deletedAt: null,
            role: { name: { not: "CUSTOMER" } },
            ...inBranch,
            OR: [
              { firstName: has(q) },
              { lastName: has(q) },
              { email: has(q) },
              { staffProfile: { employeeId: has(q) } },
            ],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: { select: { name: true } },
          },
          take: PER_KIND,
        })
        .then((rows) =>
          rows.map((u) => ({
            kind: "staff" as const,
            id: u.id,
            title: `${u.firstName} ${u.lastName}`,
            subtitle: `${u.role.name.toLowerCase()} · ${u.email}`,
            link: "/app/staff",
          })),
        ),
    );
  }
  return (await Promise.all(jobs)).flat();
}
