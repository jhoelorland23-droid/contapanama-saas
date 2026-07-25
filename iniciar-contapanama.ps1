# ============================================================================
#  ContaPanamá — Arranque completo (modelo REAL con base de datos)
#  Levanta: Docker + PostgreSQL + Backend (4000) + Frontend (5173) y abre el navegador.
#  Uso: doble clic en "Iniciar ContaPanama.bat"
# ============================================================================

$ErrorActionPreference = "Stop"
$ROOT     = $PSScriptRoot
$BACKEND  = Join-Path $ROOT "PROYECTO APP\files_extracted\saas\backend"
$SERVE    = Join-Path $ROOT "_run_proto\_serve.js"
$DOCKER   = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$DDEXE    = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + $env:Path

function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  ..  $m" -ForegroundColor Yellow }

Write-Host "`n===== ContaPanama — iniciando =====`n" -ForegroundColor White

# 1) Docker engine
Info "Verificando Docker..."
& $DOCKER version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) {
  Warn "Docker no responde. Abriendo Docker Desktop (espera 1-2 min)..."
  if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) { Start-Process $DDEXE }
  for ($i=0; $i -lt 48; $i++) {
    & $DOCKER version --format '{{.Server.Version}}' *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 5
  }
}
& $DOCKER version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "`n  ERROR: Docker no arranco. Abre Docker Desktop manualmente y reintenta.`n" -ForegroundColor Red; Read-Host "Enter para salir"; exit 1 }
Ok "Docker corriendo"

# 2) PostgreSQL
Info "Verificando base de datos..."
$exists = (& $DOCKER ps -a --filter "name=contapanama_db" --format '{{.Names}}') -eq 'contapanama_db'
if ($exists) {
  & $DOCKER start contapanama_db *> $null
} else {
  Warn "Creando base de datos por primera vez..."
  & $DOCKER run -d --name contapanama_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD -e POSTGRES_DB=contapanama -p 5432:5432 postgres:16-alpine *> $null
}
for ($i=0; $i -lt 30; $i++) { & $DOCKER exec contapanama_db pg_isready -U postgres -d contapanama *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 2 }
if (-not $exists) {
  Warn "Aplicando migraciones y datos demo..."
  Push-Location $BACKEND; node db/migrate.js; node db/seed.js; Pop-Location
}
Ok "Base de datos lista"

# 3) Backend (puerto 4000)
Info "Iniciando backend..."
$healthy = $false
try { Invoke-RestMethod "http://localhost:4000/health" -TimeoutSec 3 *> $null; $healthy = $true } catch {}
if (-not $healthy) {
  Start-Process node -ArgumentList "server.js" -WorkingDirectory $BACKEND -WindowStyle Minimized
  for ($i=0; $i -lt 20; $i++) { try { Invoke-RestMethod "http://localhost:4000/health" -TimeoutSec 3 *> $null; $healthy = $true; break } catch { Start-Sleep -Seconds 2 } }
}
if ($healthy) { Ok "Backend en http://localhost:4000" } else { Warn "Backend tardo en responder (revisa la ventana minimizada)" }

# 4) Frontend (puerto 5173)
Info "Iniciando aplicacion..."
$front = $false
try { Invoke-WebRequest "http://localhost:5173" -TimeoutSec 3 -UseBasicParsing *> $null; $front = $true } catch {}
if (-not $front) {
  Start-Process node -ArgumentList "`"$SERVE`" 5173 index-live.html" -WorkingDirectory (Split-Path $SERVE) -WindowStyle Minimized
  for ($i=0; $i -lt 15; $i++) { try { Invoke-WebRequest "http://localhost:5173" -TimeoutSec 3 -UseBasicParsing *> $null; $front = $true; break } catch { Start-Sleep -Seconds 1 } }
}
Ok "Aplicacion en http://localhost:5173"

# 5) Abrir navegador
Start-Process "http://localhost:5173"
Write-Host "`n===== Listo =====" -ForegroundColor Green
Write-Host "  Abierto en el navegador: http://localhost:5173" -ForegroundColor White
Write-Host "  Usuario: admin@contapanama.pa" -ForegroundColor White
Write-Host "  Clave:   [REDACTED_QA_PASSWORD]`n" -ForegroundColor White
Write-Host "  (Deja abiertas las dos ventanas minimizadas de 'node' mientras uses la app.)`n" -ForegroundColor DarkGray
Start-Sleep -Seconds 4
