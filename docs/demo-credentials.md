# Demo credentials

**Development and demo only.** Created by `npm run db:seed`, which refuses to run in production.
Never reuse these passwords on a deployed system. Change them or remove the accounts before going live.

Sign in at <http://localhost:5173/login> (Docker: <http://localhost:8080/login>).

| Role     | Email                     | Password             | Opens at       |
| -------- | ------------------------- | -------------------- | -------------- |
| Owner    | `owner@smartdine.test`    | `Demo-Passw0rd-2026` | `/app/owner`   |
| Manager  | `manager@smartdine.test`  | `Demo-Passw0rd-2026` | `/app/manager` |
| Waiter   | `waiter@smartdine.test`   | `Demo-Passw0rd-2026` | `/app/waiter`  |
| Kitchen  | `kitchen@smartdine.test`  | `Demo-Passw0rd-2026` | `/app/kitchen` |
| Cashier  | `cashier@smartdine.test`  | `Demo-Passw0rd-2026` | `/app/cashier` |
| Customer | `customer@smartdine.test` | `Demo-Passw0rd-2026` | `/account`     |

The shared password is the `SEED_DEMO_PASSWORD` value in `.env`. If you change it, update this
file and re-run `npm run db:seed`.

See [roles-and-logins.md](roles-and-logins.md) for what each role can do.
