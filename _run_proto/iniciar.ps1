# ContaPanamá — arranque completo (Postgres + backend + frontend live)
$ErrorActionPreference = "Stop"
foreach ($name in @('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB')) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name requerido. No se inicio ningun contenedor."
  }
}
$root    = Split-Path -Parent $PSScriptRoot
$backend = "$root\PROYECTO APP\files_extracted\saas\backend"
$runDir  = "$root\_run_proto"
$dockerBin = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path $dockerBin) { $env:Path = "$dockerBin;$env:Path" }

Write-Host "`n=== ContaPanama: iniciando ===`n" -ForegroundColor Cyan

# 1) Docker disponible?
try { docker version --format '{{.Server.Version}}' | Out-Null }
catch {
  Write-Host "Docker no esta corriendo. Abre Docker Desktop y espera la ballena verde, luego vuelve a ejecutar este archivo." -ForegroundColor Red
  Read-Host "Enter para salir"; exit 1
}

# 2) Contenedor PostgreSQL (crea o reinicia)
Write-Host "[1/4] PostgreSQL..." -ForegroundColor Yellow
$exists = docker ps -a --filter "name=contapanama_db" --format "{{.Names}}"
if ($exists -eq "contapanama_db") { docker start contapanama_db | Out-Null }
else {
  docker run -d --name contapanama_db -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB -p 5432:5432 postgres:16-alpine | Out-Null
}
for ($i=0; $i -lt 40; $i++) { docker exec contapanama_db pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep 2 }
Write-Host "      PostgreSQL listo." -ForegroundColor Green

# 3) Backend en ventana propia
Write-Host "[2/4] Backend (puerto 4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit','-Command', "Set-Location '$backend'; node server.js"

# 4) Frontend live en ventana propia
Write-Host "[3/4] Frontend (puerto 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit','-Command', "Set-Location '$runDir'; node _serve.js 5173 index-live.html"

# 5) Esperar al backend y abrir navegador
Write-Host "[4/4] Esperando al backend..." -ForegroundColor Yellow
$ok=$false
for ($i=0; $i -lt 30; $i++) {
  try { Invoke-RestMethod -Uri "http://localhost:4000/health" -TimeoutSec 3 | Out-Null; $ok=$true; break } catch { Start-Sleep 2 }
}
if ($ok) {
  Start-Process "http://localhost:5173"
  Write-Host "`n=== LISTO ===" -ForegroundColor Green
  Write-Host "App:   http://localhost:5173" -ForegroundColor Green
  Write-Host "Login: admin@contapanama.pa  /  [credencial configurada por el operador]" -ForegroundColor Green
  Write-Host "`n(Deja abiertas las dos ventanas de PowerShell mientras uses la app.)`n"
} else {
  Write-Host "El backend no respondio. Revisa la ventana del backend por errores." -ForegroundColor Red
}
Read-Host "Enter para cerrar esta ventana"
