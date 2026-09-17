param(
  [string]$BackendUrl = "http://127.0.0.1:4000",
  [string]$FrontendUrl = "http://localhost:5173",
  [string]$OrlandoUrl = "http://localhost:3200",
  [switch]$RunTests,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$BackendEnv = Join-Path $BackendDir ".env"
$StateFile = Join-Path $BackendDir ".local-data\contapanama-state.json"

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )
  $script:checks.Add([pscustomobject]@{ Check = $Name; OK = $Ok; Detail = $Detail }) | Out-Null
}

function Write-LocalReport {
  param(
    [string]$Path,
    [bool]$Ready
  )

  if (!$Path) {
    return
  }

  $parent = Split-Path -Parent $Path
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  [pscustomobject]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    readyLocal = $Ready
    runTests = [bool]$RunTests
    backendUrl = $BackendUrl
    frontendUrl = $FrontendUrl
    orlandoUrl = $OrlandoUrl
    checks = @($script:checks | ForEach-Object {
      [pscustomobject]@{
        check = $_.Check
        ok = [bool]$_.OK
        detail = $_.Detail
      }
    })
    failedChecks = @($script:checks | Where-Object { -not $_.OK } | ForEach-Object {
      [pscustomobject]@{
        check = $_.Check
        detail = $_.Detail
      }
    })
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding utf8
}

function Test-EnvKey {
  param([string]$Path, [string]$Key)
  if (!(Test-Path -LiteralPath $Path)) { return $false }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Key))=.+" } | Select-Object -First 1
  return [bool]$line
}

Add-Check "backend .env" (Test-Path -LiteralPath $BackendEnv) $BackendEnv
foreach ($key in @("PORT", "HOST", "FRONTEND_URL", "CONTAPANAMA_INTEGRATION_TOKEN", "JWT_SECRET")) {
  Add-Check "env $key" (Test-EnvKey -Path $BackendEnv -Key $key) "presente sin mostrar valor"
}

Add-Check "estado local persistente" (Test-Path -LiteralPath $StateFile) $StateFile

try {
  $health = Invoke-RestMethod -Uri "$BackendUrl/health" -Method GET -TimeoutSec 5
  Add-Check "backend health" ($health.status -eq "ok") "$BackendUrl/health -> $($health.status)"
} catch {
  Add-Check "backend health" $false $_.Exception.Message
}

try {
  $response = Invoke-WebRequest -Uri $FrontendUrl -Method GET -TimeoutSec 20 -UseBasicParsing
  Add-Check "frontend web" ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) "$FrontendUrl -> HTTP $($response.StatusCode)"
} catch {
  Add-Check "frontend web" $false $_.Exception.Message
}

try {
  $orlandoHealth = Invoke-RestMethod -Uri "$OrlandoUrl/api/contapanama/proposals" -Method GET -TimeoutSec 5
  Add-Check "orlando puente contapanama" ($orlandoHealth.status -eq "ready") "$OrlandoUrl -> $($orlandoHealth.status)"
} catch {
  Add-Check "orlando puente contapanama" $true "omitido: Orlando CPA OS no responde en $OrlandoUrl"
}

Add-Check "script start-local" (Test-Path -LiteralPath (Join-Path $Root "start-local.ps1")) "disponible"
Add-Check "script stop-local" (Test-Path -LiteralPath (Join-Path $Root "stop-local.ps1")) "disponible"

if ($RunTests) {
  Push-Location $BackendDir
  try {
    $testOutput = npm.cmd run test:integration-local 2>&1
    Add-Check "test integracion local" ($LASTEXITCODE -eq 0) (($testOutput | Select-Object -Last 1) -join " ")
  } finally {
    Pop-Location
  }

  Push-Location $BackendDir
  try {
    $testOutput = npm.cmd run test:fiscal 2>&1
    Add-Check "test fiscal" ($LASTEXITCODE -eq 0) (($testOutput | Select-Object -Last 1) -join " ")
  } finally {
    Pop-Location
  }

  Push-Location $BackendDir
  try {
    $testOutput = npm.cmd run test:schema-contract 2>&1
    Add-Check "test contrato schema" ($LASTEXITCODE -eq 0) (($testOutput | Select-Object -Last 1) -join " ")
  } finally {
    Pop-Location
  }

  Push-Location $BackendDir
  try {
    $testOutput = npm.cmd run test:env 2>&1
    Add-Check "test entorno produccion" ($LASTEXITCODE -eq 0) (($testOutput | Select-Object -Last 1) -join " ")
  } finally {
    Pop-Location
  }

  Push-Location $BackendDir
  try {
    $testOutput = npm.cmd run test:auth-security 2>&1
    Add-Check "test seguridad auth" ($LASTEXITCODE -eq 0) (($testOutput | Select-Object -Last 1) -join " ")
  } finally {
    Pop-Location
  }
}

$checks | Format-Table -AutoSize

$failed = @($checks | Where-Object { -not $_.OK })
Write-LocalReport -Path $ReportPath -Ready ($failed.Count -eq 0)

if ($failed.Count -gt 0) {
  if ($ReportPath) {
    Write-Host "Reporte local escrito en: $ReportPath"
  }
  exit 1
}

if ($ReportPath) {
  Write-Host "Reporte local escrito en: $ReportPath"
}
