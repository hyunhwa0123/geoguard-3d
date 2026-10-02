# Local data utilities

From the repository root:

```powershell
docker compose up -d --wait db
./scripts/load-test-data.ps1 -Count 100000
./scripts/run-benchmark.ps1
```

For one million rows, pass `-Count 1000000`. Shell equivalents are available for
macOS/Linux. Data generation is deterministic in shape but uses the invocation time as
the end of the flight window. It creates 20 synthetic drones and calculates SAFE,
WARNING, and DANGER from the seeded zones with PostGIS operations.

The generator appends rows. To start with an empty local database, explicitly remove the
Compose volume (`docker compose down -v`) and start the database again. That command is
destructive and should never be used against a volume containing data you need.

