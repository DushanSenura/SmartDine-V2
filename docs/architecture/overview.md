# SmartDine V2 — Architecture Overview

## Shape

npm-workspaces monorepo orchestrated by Turborepo.

| Path                     | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `apps/api`               | Express + Prisma REST API (`/api/v2`) and Socket.IO server                 |
| `apps/web`               | React 19 + Vite SPA (public website and staff dashboards)                  |
| `packages/shared`        | Types, Zod schemas and constants used by both apps (consumed as TS source) |
| `packages/tsconfig`      | Shared strict TypeScript configs                                           |
| `packages/eslint-config` | Shared ESLint flat configs                                                 |

## Key decisions

- **No QR ordering.** There are no QR tokens, QR routes or `channel: qr` anywhere. Customers browse
  a public `/menu`; dine-in orders are created by staff.
- **Modular API.** Each domain lives in `apps/api/src/modules/<domain>/` (routes → controller →
  service → repository). Controllers hold no business logic. `src/routes.ts` only mounts modules.
- **Consistent envelope.** Success: `{ success: true, data, meta }`. Failure:
  `{ success: false, error: { code, message, details? } }`. Types live in `@smartdine/shared`.
- **Internal shared package.** `@smartdine/shared` exports TypeScript source directly. Vite, tsx and
  tsc read it natively; the API bundle inlines it via `noExternal` in `tsup.config.ts`. No stale
  `dist/` to rebuild.
- **Health probes.** `GET /api/v2/health` (liveness, no DB) and `GET /api/v2/health/ready`
  (readiness, checks PostgreSQL, 503 when down).
- **Config.** All configuration is read from environment variables and validated with Zod at boot
  (`apps/api/src/config/env.ts`). One `.env` at the repository root.
- **Design tokens.** `apps/web/src/styles/tokens.css` (colours incl. dark, elevation, glass,
  animation timing) mapped into Tailwind in `index.css`; matching Motion constants in
  `src/lib/motion.ts`. Reduced motion is honoured globally (CSS + `MotionConfig`).

- **Branch isolation.** Every branch-owned resource is checked with `assertBranchAccess` /
  `scopeBranch` (`apps/api/src/shared/auth/branchAccess.ts`). See
  [../api/restaurant-setup.md](../api/restaurant-setup.md).
- **Live operations.** Domain services publish events through `emitToBranch`; clients patch their
  TanStack Query cache from them (`useLiveTables`). Rooms: `user:<id>`, `role:<ROLE>`, `branch:<id>`.
- **Database-only constraints.** Table numbers are unique per branch among non-deleted tables via a
  partial unique index maintained in a hand-written migration (Prisma cannot express it).

- **Reservations are correct by construction.** Exclusion constraints in PostgreSQL forbid
  overlapping active bookings on a table or room; the service only decides _which_ table to try
  (see [../api/menu-and-reservations.md](../api/menu-and-reservations.md)).
- **Branch-local time.** Booking dates and times are interpreted in the branch's timezone and stored
  in UTC (`reservation.timing.ts`, DST-tested).
- **Public vs. staff data.** Public endpoints return customer-safe DTOs (no cost price, no manager
  identity) and are rate limited; staff endpoints are permission- and branch-scoped.
- **Web architecture.** The customer site (`PublicLayout`) and the staff app (`StaffLayout`) are
  separate shells under one router. Booking wizards keep their draft in `sessionStorage` so a visitor
  can sign in mid-booking and resume.

- **Concurrency under load.** Exclusion constraints guarantee no overlap; per-resource advisory locks
  (`withResourceLock`) make contenders queue rather than deadlock, and transient `40P01` / `40001`
  errors are retried. See [../api/rooms.md](../api/rooms.md#no-double-booking).
- **One pricing implementation.** Room pricing lives in `packages/shared` and is used by both the API
  (authoritative) and the booking review screen, so the quoted and charged amounts cannot drift.

## Toolchain notes

- TypeScript is pinned to `~6.0` because typescript-eslint does not yet support TypeScript 7
  (which removed the JS compiler API). Revisit when typescript-eslint adds support.
- Prisma is pinned to v6 (`prisma-client-js`). Upgrading to a newer major requires migrating to
  `prisma.config.ts` and driver adapters.
- npm install scripts are allow-listed in the root `package.json` (`allowScripts`) for Prisma and
  esbuild only.

## Phase status

All ten phases are complete: 1 Foundation, 2 Authentication, RBAC & Users, 3 Branches, Staff &
Restaurant Setup, 4 Public website, Menu & Reservations, 5 Accommodation Rooms & Booking, 6 Ordering,
Waiter & Kitchen, 7 Cashier, POS & Payments, 8 Inventory, CRM, Loyalty, Promotions & Reviews,
9 Analytics, Reports & System Management, 10 Polish, Testing, Security & Production.

Operational documents: [deployment.md](../deployment.md), [environment.md](../environment.md),
[security.md](../security.md).
