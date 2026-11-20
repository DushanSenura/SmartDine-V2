# Environment reference

The API reads its configuration from environment variables and **refuses to start** if they are wrong
(`apps/api/src/config/env.ts`). In Docker the variables come from a `.env` file next to
`docker-compose.yml`; copy [.env.example](../.env.example) and edit it. Never commit `.env`.

## Required

| Variable            | Meaning                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string (`postgresql://user:pass@host:5432/db?schema=public`). Compose builds it for you. |
| `JWT_ACCESS_SECRET` | Signs access tokens. At least 32 characters. Generate one (below). Rotating it signs everyone out.             |
| `POSTGRES_PASSWORD` | Compose only. The database password; compose refuses to start without it.                                      |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Production rules enforced at boot

When `NODE_ENV=production` the API additionally refuses to start if:

- `JWT_ACCESS_SECRET` looks like a placeholder (contains `change-me`, `example`, `password`, …);
- `BCRYPT_ROUNDS` is below 10.

## Optional

| Variable                   | Default                 | Meaning                                                                                         |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`           | `production` in the Docker images.                                                              |
| `API_PORT`                 | `4000`                  | Port the API listens on.                                                                        |
| `LOG_LEVEL`                | `info`                  | `fatal` … `trace`, or `silent`. Logs are JSON lines on stdout.                                  |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`                   | Access token lifetime.                                                                          |
| `REFRESH_TOKEN_TTL_DAYS`   | `7`                     | Refresh cookie lifetime (rotated on every use).                                                 |
| `BCRYPT_ROUNDS`            | `12`                    | Password hashing cost (4–15).                                                                   |
| `COOKIE_SECURE`            | `true` in production    | Sets the `Secure` flag on the refresh cookie. `false` only for plain-http local Docker.         |
| `CORS_ORIGINS`             | `http://localhost:5173` | Comma-separated browser origins allowed to call the API. In compose this is `PUBLIC_ORIGIN`.    |
| `SMTP_URL`                 | _(empty)_               | Outgoing mail, e.g. `smtps://user:pass@smtp.example.com:465`. Empty: dev logs mail; production refuses to email receipts. |
| `MAIL_FROM`                | `SmartDine <no-reply@smartdine.local>` | Sender shown on emailed receipts.                                            |
| `RESERVATION_REMINDER_HOURS` | `2`                   | How far ahead customers are reminded of a confirmed reservation.                                |
| `REMINDER_JOB_INTERVAL_MINUTES` | `5`                | How often the reminder job runs; `0` turns it off.                                              |
| `AUTH_RATE_LIMIT_MAX`      | `20`                    | Sign-in / register attempts per IP per 15 minutes. Raise only for automated tests.              |
| `BOOKING_RATE_LIMIT_MAX`   | `30`                    | Public booking submissions per IP per 15 minutes.                                               |
| `PUBLIC_ORIGIN`            | `http://localhost:8080` | Compose only. The public address of the site, e.g. `https://dine.example.com`.                  |
| `WEB_PORT`                 | `8080`                  | Compose only. Host port for the web container.                                                  |
| `POSTGRES_USER` / `_DB`    | `smartdine`             | Compose only.                                                                                   |
| `SEED_OWNER_EMAIL`         | –                       | First Owner account, created by `node dist/seed.js` in production.                              |
| `SEED_OWNER_PASSWORD`      | –                       | Its password. Change it after the first sign-in.                                                |
| `SEED_DEMO_PASSWORD`       | –                       | Development seed only; the seed **refuses** to create demo accounts when `NODE_ENV=production`. |
| `VITE_API_PROXY_TARGET`    | `http://localhost:4000` | Development only: where the Vite dev server proxies `/api` and `/socket.io`.                    |

## Fixed limits (not configurable)

| Limit                | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| All API calls        | 300 / minute, per signed-in user (per IP when anonymous)             |
| Dashboards / reports | 40 / minute per user                                                 |
| Public catalogue     | 120 / minute per IP                                                  |
| Request body         | 1 MB                                                                 |
| Page size            | Capped on every list endpoint (see each module's doc in `docs/api/`) |
