param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SchemaPath = Join-Path $Root "database\schema.sql"
$BackendDir = Join-Path $Root "backend"
$BackendEnv = Join-Path $Root "backend\.env"

function Read-EnvFile {
  param([string]$Path)
  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $values
}

$envFile = Read-EnvFile -Path $BackendEnv
$databaseUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { $envFile["DATABASE_URL"] }

if (!$databaseUrl) {
  throw "DATABASE_URL no esta configurado. Agreguelo al entorno o a backend/.env antes de validar PostgreSQL."
}

if (!(Test-Path -LiteralPath $SchemaPath)) {
  throw "No se encontro database/schema.sql."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue

Write-Output "Schema: $SchemaPath"
if ($psql) {
  Write-Output "Migrador: psql ($($psql.Source))"
} else {
  Write-Output "Migrador: node backend/db/migrate.js (psql no disponible)"
}
Write-Output "DATABASE_URL: configurado (valor oculto)"

$env:PGOPTIONS = "--client-min-messages=warning"
$env:DATABASE_URL = $databaseUrl

if ($psql) {
  Write-Output "Probando conexion..."
  psql $databaseUrl -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database, current_user AS user, version();" | Out-Host

  if (!$Apply) {
    Write-Output ""
    Write-Output "Modo solo verificacion. No se aplico schema.sql."
    Write-Output "Para aplicar la migracion ejecute: .\check-postgres.ps1 -Apply"
    exit 0
  }

  Write-Output ""
  Write-Output "Aplicando database/schema.sql..."
  psql $databaseUrl -v ON_ERROR_STOP=1 -f $SchemaPath | Out-Host

  Write-Output ""
  Write-Output "Validando objetos criticos..."
  psql $databaseUrl -v ON_ERROR_STOP=1 -c @"
SELECT
  to_regclass('public.work_orders') AS work_orders,
  to_regclass('public.ai_proposals') AS ai_proposals,
  to_regclass('public.audit_events') AS audit_events,
  to_regclass('public.transacciones') AS transacciones;
"@ | Out-Host

  Write-Output "Migracion PostgreSQL aplicada y objetos criticos verificados."
  exit 0
}

Push-Location $BackendDir
try {
  if ($Apply) {
    npm.cmd run db:migrate
  } else {
    npm.cmd run db:check
    Write-Output ""
    Write-Output "Modo solo verificacion. No se aplico schema.sql."
    Write-Output "Para aplicar la migracion ejecute: .\check-postgres.ps1 -Apply"
  }
} finally {
  Pop-Location
}
