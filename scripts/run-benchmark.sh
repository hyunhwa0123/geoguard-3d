#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if ! docker compose ps --status running --services | grep -qx db; then
  echo "The db service is not running. Start it with: docker compose up -d --wait db" >&2
  exit 1
fi

timestamp=$(date +%Y%m%d-%H%M%S)
output_path="${1:-$repo_root/infra/db/benchmark/results/$timestamp.txt}"
mkdir -p "$(dirname -- "$output_path")"

docker compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /opt/geoguard/benchmark/compare_indexes.sql' \
  2>&1 | tee "$output_path"

echo "Benchmark output: $output_path"

