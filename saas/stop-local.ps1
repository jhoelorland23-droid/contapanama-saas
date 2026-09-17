$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $Root ".local-runtime"

function Stop-FromPidFile {
  param(
    [string]$Name,
    [string]$PidFile
  )

  if (!(Test-Path -LiteralPath $PidFile)) {
    Write-Output "${Name}: sin PID guardado."
    return
  }

  $processId = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if (!$processId) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Output "${Name}: PID vacio retirado."
    return
  }

  $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
  if (!$process) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Output "${Name}: proceso no encontrado; PID retirado."
    return
  }

  Stop-Process -Id $process.Id -Force
  Remove-Item -LiteralPath $PidFile -Force
  Write-Output "$Name detenido. PID $processId."
}

Stop-FromPidFile -Name "Frontend ContaPanama" -PidFile (Join-Path $RuntimeDir "frontend.pid")
Stop-FromPidFile -Name "Backend ContaPanama" -PidFile (Join-Path $RuntimeDir "backend.pid")
