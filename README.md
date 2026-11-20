<div align="center">

<img src="apps/web/public/images/Logo without background.png" alt="SmartDine V2 logo: a serving cloche with circuit lines, fork and spoon" width="220" />

# SmartDine V2

**Restaurant and hospitality management platform: public website, table and room booking, live waiter / kitchen / cashier operations, inventory, CRM and analytics across multiple branches.**

![Version 2.0.0](https://img.shields.io/badge/version-2.0.0-1d4ed8)
![Node >= 20.19](https://img.shields.io/badge/node-%E2%89%A5%2020.19-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)

[Overview](#-overview) · [Features](#-features) · [Architecture](#-architecture) · [Getting started](#-getting-started) · [Scripts](#-scripts) · [Docs](#-documentation) · [Status](#-status-and-known-limitations)

</div>

---

## Table of contents

- [Overview](#-overview)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Technology stack](#-technology-stack)
- [Architecture](#-architecture)
- [Getting started](#-getting-started)
- [Environment variables](#-environment-variables)
- [Scripts](#-scripts)
- [Project structure](#-project-structure)
- [Using the app](#-using-the-app)
- [API](#-api)
- [Database](#-database)
- [Authentication and authorization](#-authentication-and-authorization)
- [Testing](#-testing)
- [Security](#-security)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [Status and known limitations](#-status-and-known-limitations)
- [Contributing](#-contributing)
- [License](#-license)

## 📖 Overview

SmartDine V2 is a full-stack platform for restaurants and small hospitality businesses. It brings the
public website, guest bookings, the restaurant floor, the kitchen, the cashier, a small hotel and the
back office into one system, with several branches supported from one installation.

It is a ground-up rebuild of SmartDine V1, written as a TypeScript monorepo.

**Who it is for**

| Audience            | What they get                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guests              | A public website with the menu, table / private-dining / room booking, an account with their bookings, receipts, loyalty points, favourites and reviews, and the option to order from their table |
| Waiters             | A live dashboard with their tables, orders, guest requests and notifications                                                                                                                      |
| Kitchen             | A live ticket display by station, with no prices shown                                                                                                                                            |
| Cashiers            | Bills, split and partial payments, discounts, loyalty redemption, receipts (printable, PDF, emailed)                                                                                              |
| Managers and owners | Staff and shifts, floor plan, menu, stock, promotions, reports, audit log and settings, scoped by branch                                                                                          |

## 🖼 Screenshots

Captured from the running app with the seeded demo data (development build), at 1440 x 900 for desktop and 390 x 844 for mobile. Every page below is shown in both sizes.

### 🖥 Desktop

<details>
<summary><strong>Public website</strong> (14)</summary>

The pages any visitor can open without signing in.

|                                                                                                            |                                                                                                |                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Home on a desktop screen](docs/images/desktop/home.jpg)<br/>**Home**                                     | ![Menu on a desktop screen](docs/images/desktop/menu.jpg)<br/>**Menu**                         | ![Table reservations on a desktop screen](docs/images/desktop/reservations.jpg)<br/>**Table reservations** |
| ![Private dining on a desktop screen](docs/images/desktop/reservations-private.jpg)<br/>**Private dining** | ![Rooms on a desktop screen](docs/images/desktop/rooms.jpg)<br/>**Rooms**                      | ![Offers on a desktop screen](docs/images/desktop/offers.jpg)<br/>**Offers**                               |
| ![About on a desktop screen](docs/images/desktop/about.jpg)<br/>**About**                                  | ![Gallery on a desktop screen](docs/images/desktop/gallery.jpg)<br/>**Gallery**                | ![Contact on a desktop screen](docs/images/desktop/contact.jpg)<br/>**Contact**                            |
| ![Sign in on a desktop screen](docs/images/desktop/login.jpg)<br/>**Sign in**                              | ![Create account on a desktop screen](docs/images/desktop/register.jpg)<br/>**Create account** | ![Page not found on a desktop screen](docs/images/desktop/not-found.jpg)<br/>**Page not found**            |
| ![Room details on a desktop screen](docs/images/desktop/room-details.jpg)<br/>**Room details**             | ![Room booking on a desktop screen](docs/images/desktop/room-booking.jpg)<br/>**Room booking** |                                                                                                            |

</details>

<details>
<summary><strong>Ordering from the table</strong> (2)</summary>

A signed-in customer adds dishes on the Menu page and sends them to the kitchen.

|                                                                                                                           |                                                                                                                             |     |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --- |
| ![Menu with the order panel on a desktop screen](docs/images/desktop/menu-ordering.jpg)<br/>**Menu with the order panel** | ![Order sent to the kitchen on a desktop screen](docs/images/desktop/menu-order-sent.jpg)<br/>**Order sent to the kitchen** |     |

</details>

<details>
<summary><strong>Customer account</strong> (8)</summary>

What a signed-in customer sees under My account.

|                                                                                                              |                                                                                                                 |                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ![My reservations on a desktop screen](docs/images/desktop/account-reservations.jpg)<br/>**My reservations** | ![My stays on a desktop screen](docs/images/desktop/account-stays.jpg)<br/>**My stays**                         | ![Favourites on a desktop screen](docs/images/desktop/account-favourites.jpg)<br/>**Favourites** |
| ![Loyalty points on a desktop screen](docs/images/desktop/account-loyalty.jpg)<br/>**Loyalty points**        | ![Invoices on a desktop screen](docs/images/desktop/account-invoices.jpg)<br/>**Invoices**                      | ![My reviews on a desktop screen](docs/images/desktop/account-reviews.jpg)<br/>**My reviews**    |
| ![Profile on a desktop screen](docs/images/desktop/account-profile.jpg)<br/>**Profile**                      | ![Invoice and receipt on a desktop screen](docs/images/desktop/account-invoice.jpg)<br/>**Invoice and receipt** |                                                                                                  |

</details>

<details>
<summary><strong>Role dashboards</strong> (5)</summary>

Where each staff role lands after signing in.

|                                                                                                            |                                                                                                               |                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ![Waiter dashboard on a desktop screen](docs/images/desktop/waiter-dashboard.jpg)<br/>**Waiter dashboard** | ![Kitchen display on a desktop screen](docs/images/desktop/kitchen-display.jpg)<br/>**Kitchen display**       | ![Cashier dashboard on a desktop screen](docs/images/desktop/cashier-dashboard.jpg)<br/>**Cashier dashboard** |
| ![Owner dashboard on a desktop screen](docs/images/desktop/owner-dashboard.jpg)<br/>**Owner dashboard**    | ![Manager dashboard on a desktop screen](docs/images/desktop/manager-dashboard.jpg)<br/>**Manager dashboard** |                                                                                                               |

</details>

<details>
<summary><strong>Cashier</strong> (3)</summary>

Billing, payments and receipts.

|                                                                                |                                                                                                    |                                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ![Bill on a desktop screen](docs/images/desktop/cashier-bill.jpg)<br/>**Bill** | ![Payments history on a desktop screen](docs/images/desktop/payments.jpg)<br/>**Payments history** | ![Receipt on a desktop screen](docs/images/desktop/receipt.jpg)<br/>**Receipt** |

</details>

<details>
<summary><strong>Back office</strong> (26)</summary>

Management pages, shown here with the Owner account.

|                                                                                                      |                                                                                                           |                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ![Orders on a desktop screen](docs/images/desktop/orders.jpg)<br/>**Orders**                         | ![New order on a desktop screen](docs/images/desktop/new-order.jpg)<br/>**New order**                     | ![Floor plan on a desktop screen](docs/images/desktop/floor-plan.jpg)<br/>**Floor plan**             |
| ![Reservations on a desktop screen](docs/images/desktop/staff-reservations.jpg)<br/>**Reservations** | ![Private dining on a desktop screen](docs/images/desktop/private-dining.jpg)<br/>**Private dining**      | ![Menu management on a desktop screen](docs/images/desktop/menu-admin.jpg)<br/>**Menu management**   |
| ![Rooms overview on a desktop screen](docs/images/desktop/rooms-overview.jpg)<br/>**Rooms overview** | ![Room bookings on a desktop screen](docs/images/desktop/room-bookings.jpg)<br/>**Room bookings**         | ![Room inventory on a desktop screen](docs/images/desktop/room-inventory.jpg)<br/>**Room inventory** |
| ![Room types on a desktop screen](docs/images/desktop/room-types.jpg)<br/>**Room types**             | ![Housekeeping on a desktop screen](docs/images/desktop/housekeeping.jpg)<br/>**Housekeeping**            | ![Stock on a desktop screen](docs/images/desktop/inventory.jpg)<br/>**Stock**                        |
| ![Stock history on a desktop screen](docs/images/desktop/stock-history.jpg)<br/>**Stock history**    | ![Suppliers on a desktop screen](docs/images/desktop/suppliers.jpg)<br/>**Suppliers**                     | ![Customers on a desktop screen](docs/images/desktop/customers.jpg)<br/>**Customers**                |
| ![Reviews on a desktop screen](docs/images/desktop/reviews.jpg)<br/>**Reviews**                      | ![Promotions on a desktop screen](docs/images/desktop/promotions.jpg)<br/>**Promotions**                  | ![Staff on a desktop screen](docs/images/desktop/staff.jpg)<br/>**Staff**                            |
| ![Shifts on a desktop screen](docs/images/desktop/shifts.jpg)<br/>**Shifts**                         | ![Branches on a desktop screen](docs/images/desktop/branches.jpg)<br/>**Branches**                        | ![Reports on a desktop screen](docs/images/desktop/reports.jpg)<br/>**Reports**                      |
| ![Audit log on a desktop screen](docs/images/desktop/audit.jpg)<br/>**Audit log**                    | ![Settings on a desktop screen](docs/images/desktop/settings.jpg)<br/>**Settings**                        | ![Staff profile on a desktop screen](docs/images/desktop/staff-profile.jpg)<br/>**Staff profile**    |
| ![Order details on a desktop screen](docs/images/desktop/order-detail.jpg)<br/>**Order details**     | ![Customer details on a desktop screen](docs/images/desktop/customer-detail.jpg)<br/>**Customer details** |                                                                                                      |

</details>

### 📱 Mobile

<details>
<summary><strong>Public website</strong> (14)</summary>

The pages any visitor can open without signing in.

|                                                                                                   |                                                                                                    |                                                                                                               |                                                                                                               |                                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![Home on a phone-sized screen](docs/images/mobile/home.jpg)<br/>**Home**                         | ![Menu on a phone-sized screen](docs/images/mobile/menu.jpg)<br/>**Menu**                          | ![Table reservations on a phone-sized screen](docs/images/mobile/reservations.jpg)<br/>**Table reservations** | ![Private dining on a phone-sized screen](docs/images/mobile/reservations-private.jpg)<br/>**Private dining** | ![Rooms on a phone-sized screen](docs/images/mobile/rooms.jpg)<br/>**Rooms**     |
| ![Offers on a phone-sized screen](docs/images/mobile/offers.jpg)<br/>**Offers**                   | ![About on a phone-sized screen](docs/images/mobile/about.jpg)<br/>**About**                       | ![Gallery on a phone-sized screen](docs/images/mobile/gallery.jpg)<br/>**Gallery**                            | ![Contact on a phone-sized screen](docs/images/mobile/contact.jpg)<br/>**Contact**                            | ![Sign in on a phone-sized screen](docs/images/mobile/login.jpg)<br/>**Sign in** |
| ![Create account on a phone-sized screen](docs/images/mobile/register.jpg)<br/>**Create account** | ![Page not found on a phone-sized screen](docs/images/mobile/not-found.jpg)<br/>**Page not found** | ![Room details on a phone-sized screen](docs/images/mobile/room-details.jpg)<br/>**Room details**             | ![Room booking on a phone-sized screen](docs/images/mobile/room-booking.jpg)<br/>**Room booking**             |                                                                                  |

</details>

<details>
<summary><strong>Ordering from the table</strong> (2)</summary>

A signed-in customer adds dishes on the Menu page and sends them to the kitchen.

|                                                                                                                              |                                                                                                                                |     |     |     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --- | --- | --- |
| ![Menu with the order panel on a phone-sized screen](docs/images/mobile/menu-ordering.jpg)<br/>**Menu with the order panel** | ![Order sent to the kitchen on a phone-sized screen](docs/images/mobile/menu-order-sent.jpg)<br/>**Order sent to the kitchen** |     |     |     |

</details>

<details>
<summary><strong>Customer account</strong> (8)</summary>

What a signed-in customer sees under My account.

|                                                                                                                 |                                                                                            |                                                                                                                    |                                                                                                          |                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![My reservations on a phone-sized screen](docs/images/mobile/account-reservations.jpg)<br/>**My reservations** | ![My stays on a phone-sized screen](docs/images/mobile/account-stays.jpg)<br/>**My stays** | ![Favourites on a phone-sized screen](docs/images/mobile/account-favourites.jpg)<br/>**Favourites**                | ![Loyalty points on a phone-sized screen](docs/images/mobile/account-loyalty.jpg)<br/>**Loyalty points** | ![Invoices on a phone-sized screen](docs/images/mobile/account-invoices.jpg)<br/>**Invoices** |
| ![My reviews on a phone-sized screen](docs/images/mobile/account-reviews.jpg)<br/>**My reviews**                | ![Profile on a phone-sized screen](docs/images/mobile/account-profile.jpg)<br/>**Profile** | ![Invoice and receipt on a phone-sized screen](docs/images/mobile/account-invoice.jpg)<br/>**Invoice and receipt** |                                                                                                          |                                                                                               |

</details>

<details>
<summary><strong>Role dashboards</strong> (5)</summary>

Where each staff role lands after signing in.

|                                                                                                               |                                                                                                            |                                                                                                                  |                                                                                                            |                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ![Waiter dashboard on a phone-sized screen](docs/images/mobile/waiter-dashboard.jpg)<br/>**Waiter dashboard** | ![Kitchen display on a phone-sized screen](docs/images/mobile/kitchen-display.jpg)<br/>**Kitchen display** | ![Cashier dashboard on a phone-sized screen](docs/images/mobile/cashier-dashboard.jpg)<br/>**Cashier dashboard** | ![Owner dashboard on a phone-sized screen](docs/images/mobile/owner-dashboard.jpg)<br/>**Owner dashboard** | ![Manager dashboard on a phone-sized screen](docs/images/mobile/manager-dashboard.jpg)<br/>**Manager dashboard** |

</details>

<details>
<summary><strong>Cashier</strong> (3)</summary>

Billing, payments and receipts.

|                                                                                   |                                                                                                       |                                                                                    |     |     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --- | --- |
| ![Bill on a phone-sized screen](docs/images/mobile/cashier-bill.jpg)<br/>**Bill** | ![Payments history on a phone-sized screen](docs/images/mobile/payments.jpg)<br/>**Payments history** | ![Receipt on a phone-sized screen](docs/images/mobile/receipt.jpg)<br/>**Receipt** |     |     |

</details>

<details>
<summary><strong>Back office</strong> (26)</summary>

Management pages, shown here with the Owner account.

|                                                                                                              |                                                                                                         |                                                                                                      |                                                                                                         |                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ![Orders on a phone-sized screen](docs/images/mobile/orders.jpg)<br/>**Orders**                              | ![New order on a phone-sized screen](docs/images/mobile/new-order.jpg)<br/>**New order**                | ![Floor plan on a phone-sized screen](docs/images/mobile/floor-plan.jpg)<br/>**Floor plan**          | ![Reservations on a phone-sized screen](docs/images/mobile/staff-reservations.jpg)<br/>**Reservations** | ![Private dining on a phone-sized screen](docs/images/mobile/private-dining.jpg)<br/>**Private dining** |
| ![Menu management on a phone-sized screen](docs/images/mobile/menu-admin.jpg)<br/>**Menu management**        | ![Rooms overview on a phone-sized screen](docs/images/mobile/rooms-overview.jpg)<br/>**Rooms overview** | ![Room bookings on a phone-sized screen](docs/images/mobile/room-bookings.jpg)<br/>**Room bookings** | ![Room inventory on a phone-sized screen](docs/images/mobile/room-inventory.jpg)<br/>**Room inventory** | ![Room types on a phone-sized screen](docs/images/mobile/room-types.jpg)<br/>**Room types**             |
| ![Housekeeping on a phone-sized screen](docs/images/mobile/housekeeping.jpg)<br/>**Housekeeping**            | ![Stock on a phone-sized screen](docs/images/mobile/inventory.jpg)<br/>**Stock**                        | ![Stock history on a phone-sized screen](docs/images/mobile/stock-history.jpg)<br/>**Stock history** | ![Suppliers on a phone-sized screen](docs/images/mobile/suppliers.jpg)<br/>**Suppliers**                | ![Customers on a phone-sized screen](docs/images/mobile/customers.jpg)<br/>**Customers**                |
| ![Reviews on a phone-sized screen](docs/images/mobile/reviews.jpg)<br/>**Reviews**                           | ![Promotions on a phone-sized screen](docs/images/mobile/promotions.jpg)<br/>**Promotions**             | ![Staff on a phone-sized screen](docs/images/mobile/staff.jpg)<br/>**Staff**                         | ![Shifts on a phone-sized screen](docs/images/mobile/shifts.jpg)<br/>**Shifts**                         | ![Branches on a phone-sized screen](docs/images/mobile/branches.jpg)<br/>**Branches**                   |
| ![Reports on a phone-sized screen](docs/images/mobile/reports.jpg)<br/>**Reports**                           | ![Audit log on a phone-sized screen](docs/images/mobile/audit.jpg)<br/>**Audit log**                    | ![Settings on a phone-sized screen](docs/images/mobile/settings.jpg)<br/>**Settings**                | ![Staff profile on a phone-sized screen](docs/images/mobile/staff-profile.jpg)<br/>**Staff profile**    | ![Order details on a phone-sized screen](docs/images/mobile/order-detail.jpg)<br/>**Order details**     |
| ![Customer details on a phone-sized screen](docs/images/mobile/customer-detail.jpg)<br/>**Customer details** |                                                                                                         |                                                                                                      |                                                                                                         |                                                                                                         |

</details>

## ✨ Features

Everything listed here is implemented in the repository and covered by the API integration tests or the
Playwright end-to-end tests unless noted.

<details open>
<summary><strong>Guest-facing website</strong></summary>

- Home page with animated hero, featured dishes and offers; light and dark themes
- Menu with search, dietary filters (vegetarian, vegan, halal, spicy), categories, allergen information,
  meal-period availability and live "sold out" updates
- Table reservations with real availability, and private dining requests
- Room search and booking (availability by date, extras, stay details)
- Customer account: reservations, stays, favourites, loyalty points, invoices and receipts, reviews, profile
- Register / sign in, with a draft that survives signing in part-way through a booking

</details>

<details open>
<summary><strong>Ordering from the table</strong></summary>

- A signed-in customer adds dishes on the **Menu** page, enters their **table number** and can pick a
  **waiter**. The order goes straight to the kitchen, belongs to the chosen waiter (otherwise the table's
  assigned waiter, otherwise the waiter with the fewest open orders) and reaches the cashier like any
  other table order
- The kitchen, the waiter and the cashier are notified; the customer sees their order status update
- Waiter-entered orders follow the staff workflow: draft, approval, kitchen, serve, bill, payment

</details>

<details>
<summary><strong>Restaurant operations</strong></summary>

- Orders with an approval workflow, per-item kitchen status, rounds for added dishes and a full history
- Kitchen display grouped by station (main kitchen, grill, pizza, dessert, beverage, bar) with priorities
- Waiter dashboard, floor plan with live table status, and **guest service requests** (water, cutlery, bill, assistance)
- Dining areas, tables, assigned waiters, shifts and attendance
- Private dining rooms and bookings

</details>

<details>
<summary><strong>Payments and receipts</strong></summary>

- Bills with service charge and tax, split and partial payments, change handling, refunds
- Discounts, promo codes and loyalty-point redemption
- Receipts: on screen, PDF download and **emailed receipts** (SMTP; logged only in development)
- Payments are recorded by the cashier. No online payment gateway integration exists

</details>

<details>
<summary><strong>Accommodation</strong></summary>

- Room types, rooms, extras and pricing, bookings, check-in and check-out
- Room service orders for checked-in guests, a guest folio and final bill
- Housekeeping tasks that return a room to service

</details>

<details>
<summary><strong>Back office</strong></summary>

- Multi-branch management with branch isolation
- Staff accounts, roles and permissions
- Inventory with stock history, waste and suppliers; low-stock notifications
- Menu management with categories, allergens, modifiers and availability
- Promotions, customer CRM, loyalty programme, reviews with replies
- Analytics dashboard and reports (charts are hand-built SVG, each with a "View as table" alternative), CSV export
- Audit log with before / after diffs, settings, notification centre, global search (Ctrl/Cmd + K)
- **Reservation reminders**: a background job that reminds guests before their booking

</details>

<details>
<summary><strong>Platform</strong></summary>

- Real-time updates over Socket.IO (orders, tables, menu availability, notifications, service requests)
- Role-aware sidebar grouped into sections, a custom animated cursor (fine pointers only, off for reduced motion), keyboard skip link and accessibility checks in the test suite
- Dockerised stack with nginx, backup and restore scripts, GitHub Actions CI and tagged image releases

</details>

## 🧰 Technology stack

Versions are taken from the `package.json` files.

| Area               | Technology                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo**       | npm workspaces, Turborepo                                                                                                                                        |
| **Web**            | React 19, TypeScript, Vite, React Router, Tailwind CSS 4, Motion, TanStack Query, Zustand, React Hook Form, Zod, Radix UI Dialog, Lucide icons, Socket.IO client |
| **API**            | Node.js, Express 5, TypeScript, Prisma 6, Socket.IO, Zod, JSON Web Tokens, bcrypt, Helmet, CORS, express-rate-limit, Pino, Nodemailer, date-fns / date-fns-tz    |
| **Database**       | PostgreSQL 17                                                                                                                                                    |
| **Shared**         | `packages/shared`: Zod schemas, DTO types, the RBAC permission matrix, constants                                                                                 |
| **Build**          | tsup (API bundle), Vite (web), `tsc`                                                                                                                             |
| **Quality**        | ESLint, Prettier, Vitest, Testing Library, Supertest, Playwright with axe-core                                                                                   |
| **Infrastructure** | Docker, Docker Compose, nginx, GitHub Actions                                                                                                                    |

## 🏗 Architecture

An npm-workspaces monorepo: a React single-page app talks to an Express REST API (`/api/v2`) and a
Socket.IO server in the same process. Both use the shared package for schemas and types, so request
validation is identical on both sides.

```mermaid
flowchart LR
  subgraph Browser
    Web["React SPA<br/>(apps/web)"]
  end
  subgraph Server["apps/api (Node.js)"]
    REST["Express REST<br/>/api/v2"]
    WS["Socket.IO"]
    Jobs["Background job<br/>reservation reminders"]
  end
  Shared[["packages/shared<br/>Zod schemas · types · RBAC"]]
  DB[("PostgreSQL 17<br/>via Prisma")]
  Mail[["SMTP<br/>(optional)"]]

  Web -- "HTTPS + JSON" --> REST
  Web -- "live events" --> WS
  REST --> DB
  Jobs --> DB
  Jobs --> Mail
  REST --> Mail
  Web -.-> Shared
  REST -.-> Shared
```

- **Request path:** authenticate (JWT) → permission check → Zod validation → service (transaction,
  branch-isolation check) → Prisma → DTO mapper.
- **Real time:** clients join a room per branch; the API emits events such as order, table and menu
  changes, and the web app refreshes the affected queries.
- **Background work:** the reminder job runs in the API process on an interval and claims each booking
  with a conditional update, so a reminder is never sent twice.
- **Production:** nginx serves the built SPA and proxies `/api` and `/socket.io` to the API container,
  which connects to PostgreSQL.

More detail: [docs/architecture/overview.md](docs/architecture/overview.md).

## 🚀 Getting started

### Prerequisites

- Node.js **20.19 or newer** (CI uses Node 22) and npm 10 or newer (`packageManager` is npm 11)
- Docker Desktop, for PostgreSQL and the containerised stack
- Git

### Install and run

```bash
git clone <repository-url>
cd "SmartDine V2"
npm install
cp .env.example .env        # then set JWT_ACCESS_SECRET (see below) and review the rest
npm run db:up               # start PostgreSQL in Docker
npm run db:deploy           # apply the Prisma migrations
npm run db:seed             # roles, permissions, demo branch, menu, rooms and demo accounts
npm run dev                 # API on :4000 and web on :5173
```

Generate a signing secret for `JWT_ACCESS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`npm install` relies on the `allowScripts` allow-list in the root `package.json` so that Prisma and
esbuild can run their install scripts.

### Verify

- Web: <http://localhost:5173>
- API liveness: <http://localhost:4000/api/v2/health>; readiness (checks the database): `/api/v2/health/ready`
- Sign in at `/login` with a demo account. The accounts and shared development password are in
  [docs/demo-credentials.md](docs/demo-credentials.md). In development the sign-in page also shows
  one-click role buttons when `VITE_DEMO_PASSWORD` is set

### Run everything in Docker

```bash
docker compose up --build         # postgres + api + web  ->  http://localhost:8080
npm run db:seed                   # once, from the host, to create demo data
```

The API container applies pending migrations when it starts.

## 🔐 Environment variables

All variables live in the root `.env`; [.env.example](.env.example) is the reference and contains safe
development placeholders. Secrets are never exposed to the frontend (only `VITE_*` variables are), and
the API refuses to start on invalid configuration.

| Variable                                                       |   Required   | Purpose                                                                                                                                   |
| -------------------------------------------------------------- | :----------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                     |      no      | `development`, `test` or `production`                                                                                                     |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`          | yes (Docker) | Database container credentials                                                                                                            |
| `POSTGRES_PORT`                                                |      no      | Host port for PostgreSQL (default 5432)                                                                                                   |
| `DATABASE_URL`                                                 |     yes      | Prisma / API connection string                                                                                                            |
| `API_PORT`                                                     |      no      | API port (default 4000)                                                                                                                   |
| `LOG_LEVEL`                                                    |      no      | Pino log level                                                                                                                            |
| `JWT_ACCESS_SECRET`                                            |   **yes**    | At least 32 characters; signs access tokens                                                                                               |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS`          |      no      | Session lifetimes (900 s / 7 days)                                                                                                        |
| `BCRYPT_ROUNDS`                                                |      no      | Password hashing cost (12)                                                                                                                |
| `COOKIE_SECURE`                                                |      no      | Leave empty in production (secure cookies); `false` only for plain-http local Docker                                                      |
| `AUTH_RATE_LIMIT_MAX` / `BOOKING_RATE_LIMIT_MAX`               |      no      | Per-IP limits per 15 minutes for sign-in/register and bookings/orders (20 / 30). Raise only for automated tests                           |
| `SMTP_URL` / `MAIL_FROM`                                       |      no      | Outgoing mail for emailed receipts. Empty in development means mail is logged, not sent; in production an unconfigured mailer answers 503 |
| `RESERVATION_REMINDER_HOURS` / `REMINDER_JOB_INTERVAL_MINUTES` |      no      | How far ahead to remind (2) and how often the job runs (5; `0` turns it off)                                                              |
| `CORS_ORIGINS`                                                 |      no      | Comma-separated browser origins allowed to call the API (default `http://localhost:5173`; set it to your domain in production)            |
| `VITE_API_PROXY_TARGET`                                        |      no      | Dev-server proxy target for `/api` and sockets                                                                                            |
| `VITE_DEMO_PASSWORD`                                           |      no      | Development only: enables the one-click role buttons on the sign-in page                                                                  |
| `WEB_PORT` / `PUBLIC_ORIGIN`                                   |      no      | Docker: host port and public address of the site                                                                                          |
| `SEED_DEMO_PASSWORD`                                           |     dev      | Password for the demo accounts (avoid `#`, dotenv treats it as a comment). The seed refuses to run in production                          |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`                     |  production  | Creates the first Owner account                                                                                                           |

Full guide: [docs/environment.md](docs/environment.md).

## 🧪 Scripts

Run from the repository root.

| Command                                               | What it does                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                                         | API and web together with live reload                                     |
| `npm run dev -w @smartdine/api` / `-w @smartdine/web` | One of the two only                                                       |
| `npm run build`                                       | Build the API bundle (`apps/api/dist`) and the web app (`apps/web/dist`)  |
| `npm run lint` · `npm run typecheck`                  | ESLint and TypeScript across all workspaces                               |
| `npm run format` · `npm run format:check`             | Prettier write / check                                                    |
| `npm run test`                                        | Unit and API integration tests (needs PostgreSQL with migrations applied) |
| `npm run test:e2e -w @smartdine/web`                  | Playwright end-to-end tests (needs a migrated and seeded database)        |
| `npm run db:up`                                       | Start PostgreSQL in Docker                                                |
| `npm run db:migrate -- --name <change>`               | Create and apply a development migration                                  |
| `npm run db:deploy`                                   | Apply existing migrations (CI and production)                             |
| `npm run db:generate`                                 | Regenerate the Prisma client                                              |
| `npm run db:seed`                                     | Idempotent baseline and demo data                                         |
| `scripts/backup.sh` · `scripts/restore.sh`            | Database backup and restore                                               |

## 📁 Project structure

```text
.
├── apps
│   ├── api                  Express + Prisma REST API and Socket.IO server
│   │   ├── prisma           schema.prisma, migrations, seed scripts
│   │   ├── src
│   │   │   ├── modules      One folder per domain (orders, payments, rooms, ...)
│   │   │   ├── jobs         Background jobs (reservation reminders)
│   │   │   ├── middleware   Auth, permissions, validation, rate limits
│   │   │   └── shared       Mailer, errors, branch-access helpers, http helpers
│   │   └── tests            Integration tests (Supertest)
│   └── web                  React single-page app
│       ├── src
│       │   ├── features     One folder per feature (menu, orders, cashier, rooms, ...)
│       │   ├── components   Layouts, navigation, UI primitives
│       │   └── styles       Design tokens and Tailwind utilities
│       └── e2e              Playwright end-to-end tests
├── packages
│   ├── shared               Zod schemas, types, constants, RBAC matrix
│   ├── tsconfig             Shared TypeScript configs
│   └── eslint-config        Shared lint rules
├── docker                   Dockerfiles and nginx configuration
├── docs                     Architecture, API, environment, security, deployment
├── scripts                  Backup and restore
├── .github/workflows        CI and release pipelines
├── docker-compose.yml       Development and base stack
└── docker-compose.prod.yml  Production overrides
```

## 🧭 Using the app

1. Start the stack and seed it (see [Getting started](#-getting-started)).
2. Browse the public site at `/`: menu, reservations, rooms, offers, gallery.
3. Sign in at `/login`. Each role lands in its own area:

| Role     | Lands on       | Main tasks                                       |
| -------- | -------------- | ------------------------------------------------ |
| Owner    | `/app/owner`   | Everything, across all branches                  |
| Manager  | `/app/manager` | Their branch: staff, floor, menu, stock, reports |
| Waiter   | `/app/waiter`  | Tables, orders, guest requests                   |
| Kitchen  | `/app/kitchen` | Tickets by station                               |
| Cashier  | `/app/cashier` | Bills, payments, receipts                        |
| Customer | `/account`     | Bookings, receipts, loyalty, favourites, reviews |

4. **Try table ordering:** sign in as the demo customer, open **Menu**, press **Add** on a dish, enter a
   table number from the demo floor, optionally choose a waiter and press **Send to kitchen**. Keep the
   kitchen, waiter and cashier accounts open in other browser profiles to watch the order arrive.

Role details: [docs/roles-and-logins.md](docs/roles-and-logins.md).

## 🔌 API

REST under `/api/v2`, JSON in and out, versioned and validated with Zod. Responses use an envelope:
`{ "success": true, "data": ..., "meta": ... }` or `{ "success": false, "error": { "code", "message" } }`.
Requests carry `Authorization: Bearer <access token>`.

| Prefix                                                                     | Domain                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/auth`, `/users`, `/staff`, `/shifts`                                     | Sign-in, sessions, accounts, staff, shifts                         |
| `/branches`, `/settings`, `/tables`, `/private-dining`                     | Branches, company settings, floor, private rooms                   |
| `/menu`, `/categories`, `/reservations`, `/public`                         | Menu, bookings, anonymous website data                             |
| `/orders`, `/kitchen`, `/service-requests`, `/table-orders`                | Ordering, kitchen tickets, guest requests, customer table ordering |
| `/bills`, `/payments`, `/receipts`, `/folios`                              | Billing, payments, receipts, hotel folios                          |
| `/room-types`, `/rooms`, `/room-extras`, `/room-bookings`, `/housekeeping` | Accommodation                                                      |
| `/inventory`, `/suppliers`                                                 | Stock and suppliers                                                |
| `/customers`, `/favourites`, `/promotions`, `/reviews`                     | CRM, loyalty, offers, reviews                                      |
| `/notifications`, `/audit`, `/analytics`, `/reports`, `/search`            | System features                                                    |

**Example: a customer orders from their table**

```http
POST /api/v2/table-orders
Authorization: Bearer <customer access token>
Content-Type: application/json

{
  "branchId": "<branch id>",
  "tableNumber": "4",
  "waiterId": "<optional waiter id>",
  "kitchenInstructions": "No onions",
  "items": [{ "menuItemId": "<dish id>", "quantity": 2, "modifierIds": [] }]
}
```

Per-area endpoint references: [auth](docs/api/auth.md), [restaurant setup](docs/api/restaurant-setup.md),
[menu and reservations](docs/api/menu-and-reservations.md), [rooms](docs/api/rooms.md),
[orders](docs/api/orders.md), [payments](docs/api/payments.md), [inventory](docs/api/inventory.md),
[customers](docs/api/customers.md), [system](docs/api/system.md).

Rate limits: 300 requests per minute per signed-in user (per IP for anonymous callers), 120 per minute
for the public catalogue, 40 per minute for dashboards and reports, plus the sign-in and booking limits.

## 🗄 Database

PostgreSQL 17 through Prisma 6: 47 models and 16 migrations at the time of writing. Schema:
[apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma). Seeding: `npm run db:seed`. Backups:
`scripts/backup.sh` and `scripts/restore.sh` ([docs/deployment.md](docs/deployment.md)).

Core restaurant relationships (simplified):

```mermaid
erDiagram
  Branch ||--o{ RestaurantTable : has
  Branch ||--o{ MenuItem : offers
  Branch ||--o{ Order : receives
  User ||--o{ Order : "waiter"
  User |o--o{ Order : "placed by (customer)"
  RestaurantTable |o--o{ Order : seats
  Order ||--o{ OrderItem : contains
  Order ||--o| Bill : "billed as"
  Bill ||--o{ Payment : "settled by"
  Branch ||--o{ Room : has
  Room ||--o{ RoomBooking : "booked as"
  RestaurantTable ||--o{ RestaurantReservation : reserved
```

## 🔑 Authentication and authorization

- **Sessions:** a 15-minute access JWT kept in memory by the web app, plus an opaque refresh token in an
  `HttpOnly`, `SameSite=Strict` cookie. The refresh token is stored hashed, rotated on every use, and
  reuse of an old token revokes the whole token family.
- **Roles:** Owner, Manager, Waiter, Kitchen, Cashier, Customer. Roles map to permissions in
  [packages/shared/src/constants/rbac.ts](packages/shared/src/constants/rbac.ts); every route declares the
  permission it needs.
- **Branch isolation:** everyone except Owners is confined to their own branch, enforced in the service layer.
- Customers can only read their own bookings, bills, receipts, favourites and notifications.

Details: [docs/api/auth.md](docs/api/auth.md).

## ✅ Testing

| Layer                        | Tooling                                                  | Location                     |
| ---------------------------- | -------------------------------------------------------- | ---------------------------- |
| API integration              | Vitest + Supertest against PostgreSQL                    | `apps/api/tests/integration` |
| Web unit                     | Vitest + Testing Library                                 | `apps/web/src`               |
| End-to-end and accessibility | Playwright + axe-core (WCAG A/AA checks, light and dark) | `apps/web/e2e`               |

At the time of writing (November 2026) the suites pass: 261 API tests, 29 web unit tests and 42
end-to-end tests. No coverage report is generated, so no coverage figure is claimed.

Notes for running the end-to-end tests: they start `npm run dev` themselves and need the port free. They
raise the sign-in rate limit for that run. If you point them at an already running server with
`E2E_BASE_URL`, many logins can hit the rate limit (HTTP 429).

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs migrations on a clean PostgreSQL, then
format, lint, typecheck, test and build; a second job runs the Playwright tests against a migrated and
seeded database; a third builds the Docker images and smoke-tests the stack; an audit job fails on
critical dependency advisories.

## 🛡 Security

Measures implemented in the code (full list and test coverage in [docs/security.md](docs/security.md)):

- bcrypt password hashing, rotating refresh tokens with reuse detection, Origin checks on cookie endpoints
- Per-route permission checks, branch isolation in the service layer, and a test sweep asserting every
  non-public endpoint answers 401 without a token
- Zod validation of every body, query and path parameter; parameterised database access; CSV export
  formula-injection guard
- Helmet on the API, a Content-Security-Policy and other security headers from nginx, explicit CORS allow-list
- Rate limiting, database transactions and exclusion constraints against double booking
- An audit log of sensitive actions with before / after diffs

TLS and HSTS are the job of the proxy in front of the stack. No security guarantee is implied beyond
what the tests cover. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## 🚢 Deployment

The project ships Dockerfiles ([docker/](docker)), `docker-compose.yml` and a production override.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec api node dist/seed.js    # creates the first Owner from SEED_OWNER_*
```

Production checklist: strong `JWT_ACCESS_SECRET` and database password, `CORS_ORIGINS` and
`PUBLIC_ORIGIN` set to your domain, HTTPS in front, `SMTP_URL` configured if you want emailed receipts,
backups scheduled. Tagged releases (`vX.Y.Z`) publish versioned images to GHCR through
[.github/workflows/release.yml](.github/workflows/release.yml). Health checks, TLS, backups, upgrades and
troubleshooting: [docs/deployment.md](docs/deployment.md).

No hosted demo is published from this repository.

## 📚 Documentation

| Topic                     | File                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Architecture overview     | [docs/architecture/overview.md](docs/architecture/overview.md)                                             |
| Environment variables     | [docs/environment.md](docs/environment.md)                                                                 |
| Deployment and operations | [docs/deployment.md](docs/deployment.md)                                                                   |
| Security                  | [docs/security.md](docs/security.md)                                                                       |
| Roles and sample logins   | [docs/roles-and-logins.md](docs/roles-and-logins.md), [docs/demo-credentials.md](docs/demo-credentials.md) |
| API reference             | [docs/api/](docs/api)                                                                                      |

## 📌 Status and known limitations

The ten planned build phases (foundation, auth and RBAC, setup, public site and reservations, rooms,
ordering, cashier and payments, inventory / CRM / loyalty, analytics and system management, polish and
production) are implemented. Later additions include customer table ordering, guest service requests,
emailed receipts, reservation reminders and a redesigned public site.

Known limitations, confirmed in the code:

- Dishes have no photos yet; the menu uses generated gradient placeholders
- Customer table ordering sends orders straight to the kitchen without waiter approval, and does not
  support dish modifiers (extras are added by staff)
- Payments are recorded manually by the cashier; there is no online payment gateway
- Emailed receipts need `SMTP_URL`; in development mail is only logged
- No hosted demo or release history is published in this repository

## 🤝 Contributing

There is no `CONTRIBUTING.md` yet. A reasonable flow for changes:

1. Create a branch from the main branch.
2. Make the change, following the existing patterns (shared Zod schema first, then API, then web).
3. Run `npm run format`, `npm run lint`, `npm run typecheck` and `npm run test`; run
   `npm run test:e2e -w @smartdine/web` for UI changes.
4. Add a migration with `npm run db:migrate -- --name <change>` if the Prisma schema changed.
5. Open a pull request that describes the change and how it was tested.

## 📄 License

Proprietary. Copyright (c) 2026 NovaCore Techs, all rights reserved. See [LICENSE](LICENSE). No right to
use, copy, modify or distribute the code is granted without written permission. Third-party
dependencies keep their own licenses.

## 👥 Authors

Repository author: [Dushan Senura](https://github.com/DushanSenura) on GitHub.

Bugs and feature requests: open an issue on the repository once it is published. A public repository
URL and a support channel are not yet recorded in the project metadata.
