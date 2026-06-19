#!/usr/bin/env bash
# 마이그레이션 적용 — bible-db 컨테이너에 migrations/0*.sql 순차 실행 + PostgREST 스키마 갱신.
#   docker compose up -d  후:  bash apply-migrations.sh
set -euo pipefail

CONTAINER="${CONTAINER:-bible-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$SCRIPT_DIR/migrations}"

echo "== bible migrations =="
echo "container:  $CONTAINER"
echo "migrations: $MIGRATIONS_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[fatal] '$CONTAINER' 미실행. 'docker compose up -d' 먼저."
  exit 1
fi

run_sql() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"; }

for f in "$MIGRATIONS_DIR"/0*.sql; do
  echo "  apply $(basename "$f")"
  run_sql < "$f"
done

run_sql -c "NOTIFY pgrst, 'reload schema';" || true
echo "== done ==  검증: docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -c '\\dt'"
