# Authentication, RBAC & Users (API v2)

Base path: `/api/v2`. All responses use the `{ success, data, meta }` / `{ success: false, error }` envelope.

## Session model

- **Access token** — short-lived JWT (HS256, default 15 min) returned in the response body, sent as
  `Authorization: Bearer <token>`. The web app keeps it in memory only.
- **Refresh token** — opaque 256-bit random value in an `HttpOnly`, `SameSite=Strict`, `Secure`
  (in production) cookie named `sd_refresh`, scoped to `Path=/api/v2/auth`. Only its SHA-256 hash is
  stored in the database.
- **Rotation + reuse detection** — every refresh revokes the presented token and issues a new one in
  the same _family_. Presenting an already-rotated token (outside a 10 s grace window for client
  races) revokes the entire family.
- **CSRF** — SameSite=Strict, cookie path scoping, and an `Origin` allow-list check on
  `/auth/refresh` and `/auth/logout`.
- **Passwords** — bcrypt (cost 12). Login runs one bcrypt comparison even for unknown emails and
  returns one generic error, so neither timing nor message reveals which emails exist.

## Endpoints

| Method | Path                 | Auth           | Description                                      |
| ------ | -------------------- | -------------- | ------------------------------------------------ |
| POST   | `/auth/register`     | –              | Create a **customer** account and sign in        |
| POST   | `/auth/login`        | –              | Sign in (customers and staff)                    |
| POST   | `/auth/refresh`      | refresh cookie | Rotate refresh token, return a new session       |
| POST   | `/auth/logout`       | refresh cookie | Revoke the session family, clear the cookie      |
| GET    | `/auth/me`           | Bearer         | Current user + permissions                       |
| PATCH  | `/users/me`          | Bearer         | Update own name / phone                          |
| POST   | `/users/me/password` | Bearer         | Change password; signs out all other sessions    |
| GET    | `/users`             | Owner, Manager | Paginated users (managers see staff they manage) |
| POST   | `/users`             | Owner, Manager | Create a staff account (see role limits below)   |

Error codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_CREDENTIALS`,
`ACCOUNT_DISABLED`, `EMAIL_TAKEN`, `INVALID_CURRENT_PASSWORD`, `RATE_LIMITED`.

## RBAC

The role → permission matrix lives in `packages/shared/src/constants/rbac.ts` and is the single
source of truth for the API (`requirePermission`, `requireRole`), the web app (navigation, guards)
and the database (`roles`, `permissions`, `role_permissions` are synchronised from it by the seed
script via `syncRbac`). Permissions are derived from the role at request time; the access token
carries only the role.

Role creation limits (`ASSIGNABLE_ROLES`): Owner may create any staff role; Manager may create
Waiter, Kitchen and Cashier; nobody can create a Customer through `/users`.

Sockets: `io` requires `handshake.auth.token` (a valid access token) and joins the rooms
`user:<id>`, `role:<ROLE>`, and `branch:<id>`.

## Demo accounts (development seed only)

`npm run db:seed` creates `owner|manager|waiter|kitchen|cashier|customer@smartdine.test` with the
password in `SEED_DEMO_PASSWORD`. In production the seed refuses demo accounts and instead creates
one Owner from `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`.
