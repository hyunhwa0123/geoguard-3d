[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $repoRoot "infra/db/benchmark/results/$timestamp.txt"
}

Push-Location $repoRoot
try {
    $databaseState = docker compose ps --status running --services
    if ($LASTEXITCODE -ne 0 -or $databaseState -notcontains 'db') {
        throw 'The db service is not running. Start it with: docker compose up -d --wait db'
    }

    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutput) | Out-Null

    $command = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" ' +
        '-f /opt/geoguard/benchmark/compare_indexes.sql'
    docker compose exec -T db sh -c $command 2>&1 | Tee-Object -FilePath $resolvedOutput
    if ($LASTEXITCODE -ne 0) {
        throw "Benchmark failed with exit code $LASTEXITCODE."
    }
    Write-Host "Benchmark output: $resolvedOutput"
}
finally {
    Pop-Location
}

