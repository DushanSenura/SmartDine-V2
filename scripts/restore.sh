#!/usr/bin/env bash
# Restores a dump made by scripts/backup.sh.
#
#   scripts/restore.sh --verify <dump>    Restore into a throwaway database, check it, drop it.
#                                         Safe to run any time: the live database is not touched.
#   scripts/restore.sh --replace <dump>   REPLACE the live database with the dump (asks first).
#
# Stop the API before --replace so nothing writes while the data is swapped:
#   docker compose stop api && scripts/restore.sh --replace backups/<file> && docker compose start api
set -euo pipefail

cd "$(dirname "$0")/.."
MODE="${1:-}"
DUMP="${2:-}"
DB_USER="${POSTGRES_USER:-smartdine}"
DB_NAME="${POSTGRES_DB:-smartdine}"

if [[ ("$MODE" != "--verify" && "$MODE" != "--replace") || -z "$DUMP" || ! -f "$DUMP" ]]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

psql_admin() { docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 "$@"; }

restore_into() {
  docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$1" --no-owner --no-privileges \
    --exit-on-error <"$DUMP"
}

if [[ "$MODE" == "--verify" ]]; then
  scratch="restore_check_$(date +%s)"
  trap 'psql_admin -c "DROP DATABASE IF EXISTS \"'"$scratch"'\"" >/dev/null' EXIT
  psql_admin -c "CREATE DATABASE \"$scratch\"" >/dev/null
  restore_into "$scratch"
  tables="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$scratch" -tAc \
    "select count(*) from information_schema.tables where table_schema='public'")"
  migrations="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$scratch" -tAc \
    'select count(*) from _prisma_migrations where finished_at is not null')"
  users="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$scratch" -tAc \
    'select count(*) from users')"
  echo "Restore verified: $tables tables, $migrations applied migrations, $users users."
  exit 0
fi

read -r -p "This DELETES database '$DB_NAME' and replaces it with $DUMP. Type the database name to continue: " answer
[[ "$answer" == "$DB_NAME" ]] || { echo "Aborted."; exit 1; }

psql_admin -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" >/dev/null
psql_admin -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null
restore_into "$DB_NAME"
echo "Database '$DB_NAME' restored from $DUMP. Start the API again."
