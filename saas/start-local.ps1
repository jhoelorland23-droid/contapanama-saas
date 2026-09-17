param([int]$BackendPort = 4000, [int]$FrontendPort = 5173)
$ErrorActionPreference = 'Stop'
$env:CONTAPANAMA_REVIEW_API_PORT = "$BackendPort"
$env:CONTAPANAMA_REVIEW_WEB_PORT = "$FrontendPort"
& node (Join-Path $PSScriptRoot 'backend/scripts/sqlReview.js') start
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la revision PostgreSQL.' }
