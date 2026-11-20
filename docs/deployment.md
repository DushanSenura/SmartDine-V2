# Deployment & operations

SmartDine V2 ships as three containers: **postgres** (PostgreSQL 17), **api** (Node 22, Express) and
**web** (nginx serving the built SPA and proxying `/api` and `/socket.io` to the API). One host with
Docker Compose is enough for a restaurant group; the images are also published to GHCR on every release tag.

## 1. Prepare the host

- Linux with Docker Engine and the Compose plugin (v2.24+, needed for `docker-compose.prod.yml`).
- A DNS name pointing at the host, and a TLS terminator in front of the `web` container (below).

## 2. Configure

```bash
git clone <repository> smartdine && cd smartdine
cp .env.example .env
```

Edit `.env` (full reference: [environment.md](environment.md)). For production set at least:

| Variable                         | Value                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`              | a long random password                                                           |
| `JWT_ACCESS_SECRET`              | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `PUBLIC_ORIGIN`                  | `https://dine.example.com`                                                       |
| `SEED_OWNER_EMAIL` / `_PASSWORD` | the first Owner account                                                          |

The API refuses to start with a placeholder secret or weak hashing in production, so a copy-pasted
`.env.example` fails loudly instead of running insecurely.

## 3. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production override removes the published database port, makes cookies `Secure`, and caps log size.
On start the API container runs `prisma migrate deploy`, so **database migrations are applied
automatically and in order**; it only ever applies migrations that have not run yet.

Create the first Owner (once; safe to repeat — existing accounts are left alone):

```bash
docker compose exec -e SEED_OWNER_EMAIL -e SEED_OWNER_PASSWORD api node dist/seed.js
```

This creates the roles and permissions, the company, one starter branch (rename it in **Branches**), the
default shifts and the Owner. **No demo data or demo accounts are created in production.** Sign in, change
the password, then add branches, staff, tables, the menu and rooms from the Owner screens.

## 4. TLS and HSTS

The `web` container speaks plain HTTP on port 80 (published as `WEB_PORT`, default 8080). Put a TLS
terminator in front — Caddy, Traefik, an nginx/HAProxy host, or your cloud load balancer — that:

1. redirects HTTP → HTTPS and serves a valid certificate;
2. forwards to `web:80`, preserving `Host` and sending `X-Forwarded-For` / `X-Forwarded-Proto`;
3. passes WebSocket upgrades (`/socket.io/`);
4. adds `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

Example Caddyfile:

```
dine.example.com {
  reverse_proxy localhost:8080
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

`PUBLIC_ORIGIN` must match the address people type, exactly (scheme and host), or sign-in cookies and CORS
will be refused.

## 5. Health checks

| Endpoint                   | Meaning                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/v2/health`       | The API process is up (used by the Docker `HEALTHCHECK`).                                     |
| `GET /api/v2/health/ready` | Up **and** the database answers; `503` otherwise. Use for load balancers and uptime monitors. |
| `GET /healthz`             | The nginx container is serving.                                                               |

`docker compose ps` shows each container's health. Logs are JSON lines: `docker compose logs -f api`.
Health probes are not logged; client errors log at `warn`, server errors at `error` with a request id
(`x-request-id` is returned on every response — quote it when reporting a problem).

## 6. Backups

All state is in PostgreSQL. Two scripts wrap `pg_dump` / `pg_restore` for the compose database:

```bash
scripts/backup.sh                       # → backups/smartdine-<UTC timestamp>.dump (keeps the newest 14)
scripts/restore.sh --verify backups/smartdine-….dump    # restore into a scratch DB, check, drop it
scripts/restore.sh --replace backups/smartdine-….dump   # REPLACE the live database (asks first)
```

Recommended practice:

- **Schedule** `scripts/backup.sh` daily (cron: `15 3 * * * cd /srv/smartdine && scripts/backup.sh`).
  Set `KEEP=30` for a month of history.
- **Copy the dumps off the host** (object storage, another machine). A backup on the same disk is lost with it.
- **Test restores.** Run `--verify` on the newest dump weekly (add it to the same cron). An untested backup
  is a hope, not a backup.
- Before a risky upgrade take a manual backup.
- To recover: `docker compose stop api`, `scripts/restore.sh --replace <dump>`, `docker compose start api`.
  You lose changes made after the dump, so keep the schedule frequent enough for your tolerance
  (for point-in-time recovery, enable PostgreSQL WAL archiving or use a managed database).

## 7. Upgrading

```bash
scripts/backup.sh
git pull            # or: set the image tags to the new release
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run on start. If the new version fails to start, the old containers have already been replaced,
so **roll back by redeploying the previous version and, if a migration had been applied, restoring the
backup** — migrations are forward-only. Releases are tagged `vX.Y.Z`; pushing a tag builds
`ghcr.io/<owner>/<repo>-api` and `-web` images (see `.github/workflows/release.yml`), which you can pin
instead of building on the host.

## 8. Database maintenance

- Migrations live in `apps/api/prisma/migrations`. CI fails if `schema.prisma` and the migrations drift apart.
- PostgreSQL's autovacuum is sufficient at this scale. Monitor disk usage of the `smartdine-pgdata` volume.
- Expired refresh tokens and old notifications accumulate slowly; a periodic cleanup job is a future item.

## 9. Scaling notes

A single API instance handles a restaurant group comfortably. To run several API replicas you need:
a shared store for rate-limit counters (Redis), and the Socket.IO Redis adapter so realtime events reach
clients connected to other replicas. Neither is configured today.

## 10. Troubleshooting

| Symptom                                                     | Check                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| API exits at start with "Invalid environment configuration" | The message lists every bad variable. Fix `.env`.                                                |
| Can sign in but is signed out on reload                     | `PUBLIC_ORIGIN` mismatch, or `COOKIE_SECURE=true` while serving over plain http.                 |
| Browser shows CORS errors                                   | `PUBLIC_ORIGIN` / `CORS_ORIGINS` must equal the page's origin.                                   |
| Live updates stop                                           | The proxy must pass WebSocket upgrades on `/socket.io/` and not time out idle sockets.           |
| `429 Too Many Requests`                                     | Rate limit hit; see [environment.md](environment.md#fixed-limits-not-configurable).              |
| `readiness` returns 503                                     | PostgreSQL is down or unreachable: `docker compose ps postgres`, `docker compose logs postgres`. |
