# Security

What SmartDine V2 does to protect itself, how that is tested, and what is knowingly left open.

## Authentication & sessions

- Passwords are hashed with bcrypt (cost `BCRYPT_ROUNDS`, at least 10 in production). Plain passwords are
  never logged or returned.
- A short-lived **access JWT** (15 min) is kept in memory by the web app — never in `localStorage`.
- A long-lived **opaque refresh token** lives in an `HttpOnly`, `SameSite=Strict`, `Secure` cookie. It is
  stored hashed, **rotated on every use**, and a reused (stolen) token revokes its whole family.
- A disabled account cannot sign in or refresh its session. An access token already issued keeps working
  until it expires (at most 15 minutes).
- Sign-in and registration are limited to `AUTH_RATE_LIMIT_MAX` attempts per IP per 15 minutes.

## Authorisation

- Roles (Owner, Manager, Waiter, Kitchen, Cashier, Customer) map to **permissions** in
  `packages/shared/src/constants/rbac.ts`; every route declares the permission it needs.
- **Branch isolation:** everyone except Owners is confined to their own branch; the check is applied in the
  service layer (`assertBranchAccess` / `scopeBranch`), not just the UI.
- Money-sensitive actions need their own permissions (refunds, discounts, reports, audit log).
- Customers can only read their own bookings, bills, receipts, favourites and notifications.

Tested by `tests/integration/permissions.test.ts` and, across the **whole API surface**,
`tests/integration/routeSweep.test.ts`:

- every endpoint that is not on an explicit public allow-list answers `401` without a token;
- no endpoint answers `5xx` to garbage ids, NUL bytes or an empty body.

## Input handling

- Every body, query and path parameter is validated with Zod (schemas shared with the web app).
- JSON bodies are capped at 1 MB (nginx also caps at 1 MB).
- Database access is through Prisma (parameterised). User text used in `contains` searches goes through
  `escapeLike`, so `%` and `_` are literal.
- A malformed id (`/orders/abc`) is a `404`, never a stack trace. Error responses never include internals
  in production.
- CSV exports prefix cells starting with `=`, `+`, `-`, `@` so spreadsheet formulas cannot run.

## Transport & browser protections

- `helmet` on the API; nginx adds `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy` on every response and hides its
  version. The CSP allows scripts only from the site itself plus the hash of the one inline theme script
  (`apps/web/tests/csp.test.ts` fails if that script changes without the hash being updated).
- CORS is an explicit allow-list (`CORS_ORIGINS`); state-changing cookie endpoints also check `Origin`.
- **HSTS and TLS are the job of the proxy in front** (see [deployment.md](deployment.md)): serve the site
  over HTTPS only and send `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

## Concurrency & data integrity

State-sensitive work runs in database transactions: advisory locks around table/room allocation and
payment numbering, exclusion constraints that make double-booking impossible at the database level, row
locks on loyalty balances, and a single conditional `UPDATE` for promotion usage limits. Money is computed
in integer cents. Reservation, room double-booking, order lifecycle and payment races are covered by the
integration tests.

## Auditing

Sensitive actions (price changes, staff changes, refunds, discounts, voids, cancellations, settings,
loyalty adjustments, stock waste) are written to the audit log with actor, IP and a before/after diff; a
refund's entry is written in the same transaction as the refund. Owners read it at **Audit log**.

## Rate limits

300 requests/minute per signed-in user (per IP for anonymous callers), 120/minute for the public
catalogue, 40/minute for dashboards and reports, and the per-15-minute sign-in and booking limits above.
Signed-in staff are counted per user, not per IP, because a whole restaurant shares one address.

## Dependencies & known advisories

CI runs `npm audit --omit=dev --audit-level=critical` on every change.

**Accepted risk — `deepmerge-ts` < 8 (GHSA-ggr8-5vv4-36mx, high), via the Prisma 6 CLI
(`prisma` → `@prisma/config`).** A deeply self-referencing object can exhaust the stack when merged. The
CLI is shipped in the API image only so `prisma migrate deploy` can run at start-up; it merges Prisma's own
config files and never touches request data, so there is no path for an attacker to reach it. The fix needs
Prisma 7, a breaking upgrade (`prisma.config.ts`, driver adapters) scheduled separately. Re-check with
`npm audit` whenever Prisma is upgraded.

## Known limitations

- No two-factor authentication or password-reset e-mail flow yet (no mail service is configured).
- No malware scanning or file uploads exist, so none is needed; menu and gallery images are referenced by URL.
- The audit log has no retention policy or export and does not record reads of sensitive data.
- Rate-limit counters are in process memory: with several API replicas each keeps its own count. Put a
  shared store (Redis) behind `express-rate-limit` before scaling out horizontally.
- Sockets and rate limits assume a single trusted proxy hop (`trust proxy` = 1).

## Reporting a vulnerability

Open a private security advisory on the repository, or e-mail the maintainers. Please do not file public
issues for vulnerabilities.
