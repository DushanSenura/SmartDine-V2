# Roles and sample logins

**Development / demo only.** `npm run db:seed` creates these accounts. The seed refuses to create them
when `NODE_ENV=production`; production gets a single Owner from `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`
(see [deployment.md](deployment.md)).

All demo accounts share one password: the value of `SEED_DEMO_PASSWORD` in `.env`
(`.env.example` ships `Demo-Passw0rd-2026`).

| Role     | Email                    | Name           | Lands on       | Can do                                                                       |
| -------- | ------------------------ | -------------- | -------------- | ---------------------------------------------------------------------------- |
| Owner    | `owner@smartdine.test`   | Olivia Owner   | `/app/owner`   | Everything: branches, staff, roles, menu, reports, audit log, settings.      |
| Manager  | `manager@smartdine.test` | Marcus Manager | `/app/manager` | Branch operations: staff shifts, tables, reservations, rooms, inventory, reports. |
| Waiter   | `waiter@smartdine.test`  | Wendy Waiter   | `/app/waiter`  | Tables, take and edit orders, serve, request bills.                          |
| Kitchen  | `kitchen@smartdine.test` | Kenji Chef     | `/app/kitchen` | Kitchen display: accept, prepare and mark order items ready.                 |
| Cashier  | `cashier@smartdine.test` | Cara Cashier   | `/app/cashier` | Bills, payments, receipts, refunds within permission.                        |
| Customer | `customer@smartdine.test`| Chris Customer | `/account`     | Book tables and rooms, view own reservations, favourites and orders.         |

Staff roles open the staff app under `/app/*`; customers are never sent there. The public site
(home, menu, reservations, rooms) at `/` needs no login. Exact permissions live in the seeded role
and permission tables; see [api/auth.md](api/auth.md).

## Signing in

- Local dev: <http://localhost:5173/login>
- Docker: <http://localhost:8080/login> (`WEB_PORT`)

The Docker database starts empty. Seed it once the stack is up:

```bash
docker compose exec api node dist/seed.js          # production Owner only (SEED_OWNER_*)
npm run db:seed                                    # demo accounts above (host, dev database)
```

## Notes

- Sign-in is rate limited (`AUTH_RATE_LIMIT_MAX`, default 20 per 15 minutes per IP).
- Change every password before exposing an instance beyond your machine.
