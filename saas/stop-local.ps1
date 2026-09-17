$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'backend/scripts/sqlReview.js') stop
if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener el entorno SQL propio. No se detuvieron procesos ajenos.' }
