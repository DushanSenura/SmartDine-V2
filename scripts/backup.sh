#!/usr/bin/env bash
# Dumps the SmartDine database from the compose `postgres` service to a compressed custom-format file.
#
#   scripts/backup.sh [output-dir]        (default: ./backups, keeps the newest $KEEP files, default 14)
#
# Run it from cron / a systemd timer on the host. The file is a pg_dump -Fc archive: restore it with
# scripts/restore.sh. Copy the backups off the machine (object storage, another host) - a backup that
# lives only on the database server is not a backup.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="${1:-backups}"
KEEP="${KEEP:-14}"
DB_USER="${POSTGRES_USER:-smartdine}"
DB_NAME="${POSTGRES_DB:-smartdine}"

mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$OUT_DIR/smartdine-$stamp.dump"
tmp="$file.partial"

# Written to a temp name first so a failed dump never leaves a file that looks valid.
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-privileges >"$tmp"

# A custom-format archive that pg_restore can list is at least structurally sound.
docker compose exec -T postgres pg_restore --list <"$tmp" >/dev/null
mv "$tmp" "$file"

# Retention: drop everything but the newest $KEEP dumps.
ls -1t "$OUT_DIR"/smartdine-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --

echo "Backup written: $file ($(du -h "$file" | cut -f1))"
