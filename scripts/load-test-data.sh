#!/usr/bin/env sh
set -eu

count="${1:-100000}"
case "$count" in
  *[!0-9]*|'')
    echo "Count must be an integer of at least 100000." >&2
    exit 2
    ;;
esac

if [ "$count" -lt 100000 ]; then
  echo "Count must be at least 100000." >&2
  exit 2
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "The db service is not running. Start it with: docker compose up -d --wait db" >&2
  exit 1
fi

docker compose exec -T db sh -c \
  "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v row_count=$count -f /opt/geoguard/sql/generate_telemetry.sql"

