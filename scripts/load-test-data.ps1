[CmdletBinding()]
param(
    [ValidateRange(100000, 10000000)]
    [int]$Count = 100000
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $databaseState = docker compose ps --status running --services
    if ($LASTEXITCODE -ne 0 -or $databaseState -notcontains 'db') {
        throw 'The db service is not running. Start it with: docker compose up -d --wait db'
    }

    $command = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" ' +
        "-v row_count=$Count -f /opt/geoguard/sql/generate_telemetry.sql"
    docker compose exec -T db sh -c $command
    if ($LASTEXITCODE -ne 0) {
        throw "Telemetry generation failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

