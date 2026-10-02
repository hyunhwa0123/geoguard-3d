\set ON_ERROR_STOP on
\timing on

\echo 'Benchmark query: Seoul bbox + final 30 minutes of generated telemetry'
\echo 'The transaction guarantees dropped indexes are restored if the script fails.'

BEGIN;

DROP INDEX IF EXISTS idx_telemetry_position_gist;
DROP INDEX IF EXISTS idx_telemetry_drone_recorded_at;
DROP INDEX IF EXISTS idx_telemetry_recorded_at;
ANALYZE telemetry;

\echo ''
\echo '=== BEFORE: no telemetry GiST/time indexes ==='
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT id, drone_id, recorded_at, status
FROM telemetry
WHERE recorded_at >= (SELECT max(recorded_at) - INTERVAL '30 minutes' FROM telemetry)
  AND recorded_at <= (SELECT max(recorded_at) FROM telemetry)
  AND position && ST_MakeEnvelope(126.9680, 37.5500, 126.9770, 37.5590, 4326)
  AND ST_Intersects(
    position,
    ST_MakeEnvelope(126.9680, 37.5500, 126.9770, 37.5590, 4326)
  )
ORDER BY recorded_at DESC;

CREATE INDEX idx_telemetry_position_gist
  ON telemetry USING GIST (position);
CREATE INDEX idx_telemetry_drone_recorded_at
  ON telemetry (drone_id, recorded_at DESC);
CREATE INDEX idx_telemetry_recorded_at
  ON telemetry (recorded_at DESC);
ANALYZE telemetry;

\echo ''
\echo '=== AFTER: GiST position + B-tree time indexes ==='
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT id, drone_id, recorded_at, status
FROM telemetry
WHERE recorded_at >= (SELECT max(recorded_at) - INTERVAL '30 minutes' FROM telemetry)
  AND recorded_at <= (SELECT max(recorded_at) FROM telemetry)
  AND position && ST_MakeEnvelope(126.9680, 37.5500, 126.9770, 37.5590, 4326)
  AND ST_Intersects(
    position,
    ST_MakeEnvelope(126.9680, 37.5500, 126.9770, 37.5590, 4326)
  )
ORDER BY recorded_at DESC;

COMMIT;

\echo ''
\echo 'Copy the Execution Time and row count from both plans into the project README.'

