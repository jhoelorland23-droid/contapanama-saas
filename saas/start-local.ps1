param(
  [int]$BackendPort = 4000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$RuntimeDir = Join-Path $Root ".local-runtime"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Test-PortInUse {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$connection
}

function Wait-LocalEndpoint {
  param([string]$Url, [string]$Name, [scriptblock]$Validate)
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($response.StatusCode -eq 200 -and (& $Validate $response.Content)) {
        Write-Output "$Name verificado: $Url"
        return
      }
    } catch { }
    Start-Sleep -Milliseconds 750
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "$Name no respondio correctamente en $Url. Revise los archivos .local-runtime/*.log; no se iniciara otro proceso automaticamente."
}

function Start-LocalProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$PidFile,
    [string]$OutFile,
    [string]$ErrFile
  )

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $OutFile `
    -RedirectStandardError $ErrFile `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ascii
  Write-Output "$Name iniciado. PID $($process.Id). Log: $OutFile"
}

if (Test-PortInUse -Port $BackendPort) {
  Write-Output "Backend ya parece activo en http://127.0.0.1:$BackendPort"
} else {
  Start-LocalProcess `
    -Name "Backend ContaPanama" `
    -FilePath "node" `
    -Arguments "server.local.js" `
    -WorkingDirectory $BackendDir `
    -PidFile (Join-Path $RuntimeDir "backend.pid") `
    -OutFile (Join-Path $RuntimeDir "backend.out.log") `
    -ErrFile (Join-Path $RuntimeDir "backend.err.log")
}

Wait-LocalEndpoint -Name "API local" -Url "http://127.0.0.1:$BackendPort/health" -Validate {
  param($Content)
  $health = $Content | ConvertFrom-Json
  return $health.status -eq 'ok' -and $health.env -eq 'local-review'
}

if (Test-PortInUse -Port $FrontendPort) {
  Write-Output "Frontend ya parece activo en http://localhost:$FrontendPort"
} else {
  Start-LocalProcess `
    -Name "Frontend ContaPanama" `
    -FilePath "npm.cmd" `
    -Arguments "run dev -- --host 127.0.0.1 --port $FrontendPort" `
    -WorkingDirectory $FrontendDir `
    -PidFile (Join-Path $RuntimeDir "frontend.pid") `
    -OutFile (Join-Path $RuntimeDir "frontend.out.log") `
    -ErrFile (Join-Path $RuntimeDir "frontend.err.log")
}

Wait-LocalEndpoint -Name "Web ContaPanama" -Url "http://127.0.0.1:$FrontendPort/" -Validate {
  param($Content)
  return $Content -match '<title>ContaPanam'
}

Write-Output ""
Write-Output "ContaPanama web: http://localhost:$FrontendPort"
Write-Output "ContaPanama API: http://127.0.0.1:$BackendPort"
Write-Output "Login local: admin@contapanama.pa / [REDACTED_QA_PASSWORD]"
Write-Output "Estado local persistente: backend/.local-data/contapanama-state.json"
