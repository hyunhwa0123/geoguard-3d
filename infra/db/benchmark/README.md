# Telemetry index benchmark

`compare_indexes.sql` runs the same bounding-box and 30-minute time-window query twice:

1. after removing the telemetry GiST and time indexes;
2. after recreating the GiST `position` index and B-tree time indexes.

Both runs use `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`. The whole operation is a
transaction, so an error or interrupted database connection rolls the index changes back.
The script takes table locks while rebuilding indexes; run it only against local test data.

Generate at least 100,000 rows first, then run `scripts/run-benchmark.ps1` on Windows or
`scripts/run-benchmark.sh` on macOS/Linux. Record the actual `Execution Time`, returned
row count, PostgreSQL/PostGIS version, host CPU, and dataset size. Do not claim an
improvement until a real run has been captured.

