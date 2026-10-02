\set ON_ERROR_STOP on

-- Override at invocation time with: psql -v row_count=1000000 -f generate_telemetry.sql
\if :{?row_count}
\else
  \set row_count 100000
\endif

BEGIN;
SET LOCAL synchronous_commit = off;

CREATE TEMP TABLE seed_parameters (
  row_count BIGINT NOT NULL CHECK (row_count >= 100000)
) ON COMMIT DROP;

INSERT INTO seed_parameters(row_count) VALUES (:'row_count'::BIGINT);

WITH generated AS (
  SELECT
    sample_no,
    ((sample_no - 1) % 20 + 1)::INTEGER AS drone_no,
    floor((sample_no - 1) / 20.0)::BIGINT AS flight_step,
    row_count
  FROM seed_parameters
  CROSS JOIN LATERAL generate_series(1, row_count) AS series(sample_no)
),
coordinates AS (
  SELECT
    sample_no,
    drone_no,
    flight_step,
    row_count,
    126.9724
      + 0.0100 * sin(flight_step / 75.0 + drone_no * 0.11)
      + (drone_no - 10.5) * 0.00004 AS longitude,
    37.5545
      + 0.0012 * cos(flight_step / 75.0 + drone_no * 0.11)
      + (drone_no - 10.5) * 0.00003 AS latitude,
    35.0 + mod(flight_step + drone_no * 11, 210)::DOUBLE PRECISION AS altitude
  FROM generated
),
points AS (
  SELECT
    sample_no,
    'DRONE-' || lpad(drone_no::TEXT, 3, '0') AS drone_id,
    CURRENT_TIMESTAMP
      - ((row_count - sample_no)::DOUBLE PRECISION / 20.0) * INTERVAL '1 second'
        AS recorded_at,
    longitude,
    latitude,
    altitude,
    mod((degrees(atan2(
      0.0100 / 75.0 * cos(flight_step / 75.0 + drone_no * 0.11),
      -0.0012 / 75.0 * sin(flight_step / 75.0 + drone_no * 0.11)
    )) + 360.0)::NUMERIC, 360.0)::DOUBLE PRECISION AS heading,
    12.0 + mod(drone_no, 7) AS speed,
    ST_SetSRID(ST_MakePoint(longitude, latitude, altitude), 4326) AS position,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS horizontal_position
  FROM coordinates
),
classified AS (
  SELECT
    p.*,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM restricted_zone z
        WHERE p.altitude BETWEEN z.min_altitude AND z.max_altitude
          AND ST_Covers(z.boundary, p.horizontal_position)
      ) THEN 'DANGER'
      WHEN EXISTS (
        SELECT 1
        FROM restricted_zone z
        WHERE p.altitude BETWEEN z.min_altitude AND z.max_altitude
          AND ST_DWithin(
            z.boundary::geography,
            p.horizontal_position::geography,
            200.0
          )
      ) THEN 'WARNING'
      ELSE 'SAFE'
    END AS status
  FROM points p
)
INSERT INTO telemetry (
  drone_id,
  recorded_at,
  position,
  altitude,
  heading,
  speed,
  status
)
SELECT
  drone_id,
  recorded_at,
  position,
  altitude,
  heading,
  speed,
  status
FROM classified;

COMMIT;

ANALYZE telemetry;

SELECT
  count(*) AS total_rows,
  count(DISTINCT drone_id) AS drones,
  min(recorded_at) AS first_recorded_at,
  max(recorded_at) AS last_recorded_at,
  count(*) FILTER (WHERE status = 'SAFE') AS safe_rows,
  count(*) FILTER (WHERE status = 'WARNING') AS warning_rows,
  count(*) FILTER (WHERE status = 'DANGER') AS danger_rows
FROM telemetry;

