# Integracion del ledger auditado

## Procedencia y limites

- Fuente: rama `ledger-audit`, commit `historical-revision-03`, precedido por `historical-revision-02`.
- Rama de trabajo: `codex-ledger-integration`.
- Commit de implementacion: `historical-revision-04` (33 archivos, sobre `historical-revision-03`).
- Evidencia y este informe se registran en un segundo commit local; ambos sin push/merge/deploy.
- Se leyeron ADR-001, ADR-002, FUENTE-UNICA-CONTABLE y AUDITORIA_LEDGER_2026-09-17.
- No se usa la antigua copia aislada. No se realizan push, merge ni despliegues.
- No se leen/importan datos reales. Las pruebas crean datos QA en clusters propios.
- `.claude/data/` permanece intacto. `server.local.js` queda congelado.

## Baseline previo a cambios

`npm run qa`: **19 PASS / 0 FAIL / 1 SKIPPED**. El omitido fue navegador, por Playwright no configurado.
Evidencia: `outputs/codex-ledger-baseline-20260917/summary.json` y logs por suite.

## Entorno de revision

`start-local.ps1` inicia `server.js` y PostgreSQL, no el servidor JSON.
`stop-local.ps1` detiene exclusivamente el supervisor autenticado de este entorno.
El cluster persiste fuera de OneDrive en `%LOCALAPPDATA%/ContaPanama/sql-review/<identificador-del-repo>`.
Se liga a 127.0.0.1 y usa password PostgreSQL/JWT aleatorios. No hereda `DATABASE_URL` real.
Si un puerto preferido esta ocupado se elige otro; el iniciador informa la URL efectiva.
No se borran clusters al detener. No se restablecen contrasenas ni documentos al reiniciar.

Prerequisito: PostgreSQL local (`CONTAPANAMA_PG_BIN`, con `initdb` y `pg_ctl`) y dependencias instaladas.
Comando alternativo, desde backend: `node scripts/sqlReview.js start`.
Estado: `node scripts/sqlReview.js status`. Reinicio de API: `node scripts/sqlReview.js restart-api`.

Cuenta exclusivamente sintetica: `qa-review@example.test`, clave `[REDACTED_QA_PASSWORD]`.
Dos clientes QA y dos documentos QA. No representa la cartera del usuario ni certifica saldos reales.
El seed entra por la misma API financiera y usa claves de idempotencia estables.
La interfaz configura proxy y puerto desde el lanzador; HMR deja de fijar 5173.
La opcion Demo usa la cuenta SQL del seed y no se publica en builds de produccion.
Comprobacion final tras detener/iniciar el entorno completo: `/health` responde `ok`,
base `contapanama_review`; login persistente y libro CONSISTENTE con los mismos dos asientos,
dos libros por cliente y Debe = Haber = 321.00. URL local: `http://localhost:5173/`.

## Importador

`backend/db/importLocalState.js` no tiene una fuente predeterminada y no busca `.local-data`.
Ejemplo de vista previa, sobre una copia expresamente seleccionada:

```powershell
node db/importLocalState.js --source=C:/QA/copia-sintetica.json --source-owner=<UUID>
```

Por defecto no abre conexion SQL. Informa cantidades, pagos, saldos, periodos, inconsistencias,
hash SHA-256 de los bytes originales y resultado esperado de incorporacion.
No importa credenciales. No inventa perfiles fiscales ni evidencia bancaria.
Rechaza conciliaciones sin soporte, cuentas/extractos/folios/libros/cierres que requieren un migrador especializado.

Aplicar requiere todas estas opciones:
`--apply`, `--target-owner=<CPA-existente>`, `--target-database=<base>`,
`--expect-source-hash=<SHA256>` y `--confirm="IMPORTAR DOCUMENTOS SIN PUBLICAR"`.
El destino del propietario debe estar vacio. Nunca combina historiales ni sobreescribe registros.
Una copia no sintetica requiere ademas `--authorize-real-copy=<SHA256>`.
Una base distinta de `contapanama_qa`/`contapanama_review` requiere
`CONTAPANAMA_IMPORT_TARGET_AUTH=<base>:<SHA256>`.
Produccion exige separadamente `CONTAPANAMA_IMPORT_PRODUCTION_AUTH=<base>:<SHA256>`.
Estas autorizaciones NO se han otorgado ni utilizado con datos reales.

Toda la escritura, cola y auditoria ocurren en una transaccion bajo el bloqueo contable del propietario.
Un hash ya importado devuelve el resultado original. Otra fuente para un propietario ocupado se rechaza.
La auditoria conserva el mapeo de identificadores y el hash. No se crean libros ni asientos:
la aprobacion CPA posterior usa la vista previa actual del destino, no el fingerprint contable de la fuente.

## Consistencia visible

La pantalla Contabilidad muestra CONSISTENTE, DIVERGENTE, PENDIENTE / NO VERIFICADO o ERROR DE VERIFICACION.
Consulta `/api/contabilidad/consistencia` con cliente/periodo y muestra documentos, asientos originales,
importes y diferencias por cuenta. El resumen `/libro.consistencia` alerta sobre divergencia en la cartera.
No hay boton de reparacion automatica. Las respuestas antiguas no sustituyen el filtro vigente.
La lectura SQL usa una sola instantanea repetible; no combina documentos nuevos con asientos antiguos.
Se corrigio el filtro por cliente de los totales documentales y se exponen pendientes fuera del filtro.

## Sincronizacion defensiva

- `CONTAPANAMA_JOURNAL_SYNC=full`: predeterminado y modo del entorno de revision.
- `shadow`: compara planes completos y parciales; publica exclusivamente el completo.
- `incremental`: valida y planifica documentos afectados; mantiene bloqueos, triggers y atomicidad.

Se comparan lineas, importes, cuentas, origen, version, referencias de reverso, fechas,
numero global y folio por cliente. UUIDs nuevos aleatorios no se consideran diferencias contables.
Coincidencias y divergencias quedan en auditoria. Las discrepancias tambien se registran en el log.
Un fallo de la prueba shadow queda aislado por savepoint; la verificacion completa sigue siendo obligatoria.

`journal_pending_sources` registra cambios SQL de documentos/pagos en la misma transaccion.
No modifica triggers de inmutabilidad. Si hay cambios ajenos al conjunto afectado, se aplica el algoritmo
completo y su control de correccion CPA. Los flujos no instrumentados, incorporaciones y cierres
conservan la verificacion completa. La cola se vacia solo para cambios verificados al confirmar.
Cada pendiente lleva una version: una verificacion antigua no puede eliminar un cambio SQL posterior.
La primera migracion llena la cola; reaplicar el schema no altera filas existentes.

La lectura incremental recupera solo documentos/pagos, asientos, folios y dimensiones relacionados.
Conserva una comprobacion global de folios ausentes. Las lecturas globales y el diagnostico siguen
recorriendo el libro: el objetivo de rendimiento corresponde a escritura, no a todas las pantallas.

## Validacion final

- Contrato aleatorio: 120 historias x 25 cambios, mas historias largas; aprobado tras integracion inicial.
- Importacion sintetica: fallo de auditoria revierte todo; 8 reintentos concurrentes importan una sola vez.
- Comparator shadow: alteraciones en campos contables y numeracion detectadas.
- Auxiliar: se corrigio orden no determinista descubierto despues de pg_dump/pg_restore; regresion incluida.
- Navegador SQL: instancia Vite y cluster desechables, sin depender del archivo JSON real.
- `npm run qa` final en modo shadow: **21 PASS / 0 FAIL / 0 SKIPPED**.
- PostgreSQL: 90 grupos aprobados; suite navegador SQL: 106 grupos aprobados.
- Frontend: 25 pruebas unitarias y build aprobados. Importador: 3 pruebas aprobadas;
  se repitieron tras endurecer el requisito del tipo fiscal del cliente.
- Evidencia principal: `outputs/qa-acceptance-shadow/summary.json`,
  `outputs/qa-acceptance-shadow/postgres-evidence/results.json` y `browser-results.json`.
- Playwright real con Microsoft Edge 153: login, documento nuevo, doble clic (un solo documento),
  pago parcial, reintento, conciliacion, anulacion, libro, consistencia, reinicio real de API
  y persistencia posterior. Desktop 1440 y movil 390 px; capturas locales en la misma carpeta.
- Shadow: 127 comparaciones coincidentes en la ronda SQL+navegador, cero discrepancias
  espontaneas y cero errores ocultos. Se excluye del recuento una divergencia intencional:
  numero incremental 11 frente a numero completo 1. Quedo auditada y solo se publico el 1.
- Contrato aleatorio y comparador verifican importes, cuentas, lineas, origen, revision,
  reversos, fechas y numeracion/folios. No hubo una diferencia contable no provocada.
- Ronda adicional incremental con benchmark y restauracion completa: aprobada.

### Incidencias encontradas y corregidas

- El auxiliar bancario dependia del orden fisico SQL despues de restaurar: orden estable
  por cliente/cuenta/periodo, sin cambiar importes; prueba de regresion incluida.
- La carga simultanea de Contabilidad podia saturar conexiones despues del reinicio:
  limite de cuatro lecturas GET y cancelacion de consultas de filtros anteriores.
  Las escrituras no se reintentan automaticamente. Se preservo la proteccion de sesion
  ante respuestas 401 antiguas y se probaron ambos comportamientos.
- En movil, el menu lateral y rejillas reducian demasiado el espacio: barra compacta
  con etiquetas accesibles y rejillas de una columna. Verificado sin desborde horizontal.
- La UI explica el gasto que incluye ITBMS no deducible frente al importe documental;
  no oculta esa diferencia bajo el estado CONSISTENTE.
- Primer intento de QA posterior a cambios: 20 PASS / 1 FAIL (prueba de sesion frente
  a respuesta antigua). Se corrigio y la ronda completa final es la de 21 PASS indicada arriba.
- Intentos exploratorios de navegador/importador y primer benchmark no constituyen
  aceptacion final. Se mantienen como evidencia local, sin presentarlos como PASS.

## Rendimiento

Mismo escenario de Claude: 300 documentos, 4 clientes, 12 meses, ventanas de 50.

| Ejecucion | p50 ventana inicial | p50 ventana final | Pendiente ms/documento |
| --- | ---: | ---: | ---: |
| Referencia Claude | 129 | 289 | 0.640 |
| Baseline local full antes de cambios | 93 | 222 | 0.516 |
| Incremental, primera medicion | 75 | 67 | -0.032 |
| Incremental final, QA y restauracion aprobadas | 75 | 59 | -0.064 |

La primera medicion incremental termino con un fallo posterior de orden en el auxiliar restaurado.
Los tiempos son evidencia de esa medicion, no una afirmacion de QA completa aprobada.
La repeticion final si aprobo todas las comprobaciones, incluida restauracion.
Ventanas finales p50 (ms): **75, 64, 59, 65, 65, 59**.
La pendiente usa el mismo metodo de Claude: (ultima p50 - primera p50) / 250.
Cumple **-0.064 < 0.05 ms/documento**. Una pendiente negativa en esta muestra refleja
calentamiento/variabilidad, no una garantia de que la latencia decrezca indefinidamente.
Evidencia: `outputs/benchmark-full-before/results.json` y
`outputs/benchmark-incremental-final/results.json`.
Las lecturas finales de asientos/balance crecieron de 36/36 a 104/105 ms entre 50 y 300
documentos: siguen recorriendo el libro. El modo full tambien conserva su costo original.

Benchmark CPU original (10 repeticiones por caso, Node 24.18.0):

| Pasos de historia | Documentos | Asientos | Full ms | Incremental ms |
| ---: | ---: | ---: | ---: | ---: |
| 250 | 102 | 205 | 12.30 | 0.376 |
| 1000 | 385 | 802 | 52.39 | 0.119 |
| 2500 | 921 | 1972 | 240.52 | 0.508 |

Se conserva evidencia en `outputs/benchmark-incremental-final/plan-cpu.json` y log local.
No todos los tiempos CPU igualan la referencia Claude de 0.12-0.17 ms; permanecen por
debajo de 1 ms en esta muestra, frente al crecimiento del plan completo. El criterio
de aceptacion principal sigue siendo la pendiente de escritura PostgreSQL, no el factor CPU.

## Antes de usar historial real

Requiere autorizacion separada, copia inmutable inventariada, respaldo/restauracion comprobados,
propietario SQL vacio, perfil fiscal completo, conciliaciones respaldadas y conciliacion de los saldos
de origen contra el preview SQL. No importar automaticamente banderas de conciliado.
El CPA debe aprobar explicitamente incorporacion y folios. El modo full sigue siendo el default.

## Riesgos y pasos pendientes

| Severidad | Riesgo o limite | Siguiente control |
| --- | --- | --- |
| CRITICO | Ningun fallo critico reproducido pendiente dentro del alcance ledger ejercitado; esto no certifica toda la app ni seguridad productiva. | Mantener las pruebas y la revision profesional antes de uso real. |
| ALTO | Historial real no inspeccionado ni migrado; este importador no soporta libros ya publicados, cuentas/extractos/conciliaciones ni cierres. | Autorizacion, inventario de copia inmutable y migrador especifico si existen esas estructuras; nunca descartarlas para forzar importacion. |
| ALTO | El resultado de QA sintetico no autoriza publicacion o mezcla de historiales. | Propietario destino vacio, cuadre documental/contable y aprobacion CPA separada antes de incorporacion. |
| MEDIO | Lecturas globales y modo full siguen creciendo con el libro; benchmark limitado a 300 documentos y una maquina. | Medir volumen objetivo y pruebas de carga prolongada antes de habilitar incremental en produccion. |
| MEDIO | Resumen de 12 meses/cartera conserva totales documentales: gasto 200 frente a 214 en el libro por ITBMS no deducible en el seed. | La diferencia esta explicada en la UI; usar libro/balance para estados contables y separar o renombrar claramente resumen documental en una fase posterior, sin cambiar formulas fiscales para ocultarla. |
| MEDIO | Usuarios SQL privilegiados pueden alterar documentos fuera de la API. | Restringir privilegios operativos; conservar cola versionada, diagnostico y control de correcciones CPA. |
| BAJO | Lanzador local no es un servicio productivo ni tiene bloqueo para dos arranques simultaneos. | Usar una sola instancia; comprobar status/health. Preparar gestion de servicios solo en fase de despliegue autorizada. |
| BAJO | PostgreSQL, Python/PyMuPDF y Playwright/Edge son dependencias del equipo de QA. | Configurar rutas de herramientas al reproducir QA en otro equipo; no confundir falta de herramienta con prueba aprobada. |

Para probar una copia controlada real, en este orden:
1. Autorizacion escrita del alcance y copia concreta, sin tocar el original.
2. Respaldo inmutable con hash e inventario de clientes/documentos/pagos/libros/bancos/cierres.
3. Confirmar si el importador documental es compatible; detenerse ante estructuras no soportadas.
4. Preview sin escritura, perfil fiscal completo, fechas y pagos soportados, diferencias resueltas por CPA.
5. Destino aislado y vacio, respaldo/restauracion probados, autorizaciones vinculadas a base y hash.
6. Aplicacion documental transaccional; comparar recuentos, saldos y periodos antes de incorporar.
7. Aprobacion CPA explicita del historial, folios y cuadre posterior; iniciar con full y observar shadow.

No se modificaron formulas fiscales. No se agregaron inventario, activos, cierre anual nuevo,
ITBMS avanzado, IA, OCR, facturacion electronica ni modulos comerciales.

## Reproduccion de QA

Desde `saas/backend`, configurar rutas locales a PostgreSQL, Python con PyMuPDF y Playwright:

```powershell
$env:CONTAPANAMA_PG_BIN='<PostgreSQL>/bin'
$env:CONTAPANAMA_PYTHON='<Python>/python.exe'
$env:CONTAPANAMA_PLAYWRIGHT='<node_modules>/playwright'
$env:CONTAPANAMA_BROWSER_CHANNEL='msedge'
$env:CONTAPANAMA_JOURNAL_SYNC='shadow'
$env:CONTAPANAMA_POSTGRES_BROWSER='0'
$env:CONTAPANAMA_QA_LOG_DIR='<carpeta-evidencia>/qa'
$env:CONTAPANAMA_POSTGRES_QA_OUTPUT='<carpeta-evidencia>/postgres'
npm.cmd run qa
```

La suite `frontend-browser` habilita por si misma el navegador SQL. El `0` anterior evita
duplicarlo en la suite PostgreSQL previa; no omite la suite final del navegador.
Para repetir rendimiento, terminar primero QA, cambiar a `CONTAPANAMA_JOURNAL_SYNC=incremental`,
establecer `CONTAPANAMA_PG_BENCH=300` y ejecutar `node test/postgresIntegration.test.js`.
El benchmark CPU original se ejecuta con `node test/journalPlan.bench.js`.
Estas pruebas levantan clusters propios desechables; no apuntarlas a datos reales.

## Archivos de implementacion

Rutas relativas a `saas/`; la lista corresponde exclusivamente a esta integracion.

```text
backend/db/importLocalState.js (nuevo)
backend/db/reviewSeed.js (nuevo)
backend/routes/transacciones.js
backend/scripts/qa.js
backend/scripts/sqlBrowserQa.js (nuevo)
backend/scripts/sqlReview.js (nuevo)
backend/services/accountingWrite.js
backend/services/bankSubledger.js
backend/services/journalIncremental.js (comentario de estado)
backend/services/journalIncrementalSql.js (nuevo)
backend/services/journalRepository.js
backend/services/ledgerConsistency.js
backend/services/paymentRepository.js
backend/test/bankSubledger.test.js
backend/test/importLocalFixture.js (nuevo)
backend/test/importLocalState.scenario.js (nuevo)
backend/test/importLocalState.test.js (nuevo)
backend/test/journalShadow.scenario.js (nuevo)
backend/test/journalShadow.test.js (nuevo)
backend/test/ledgerConsistency.test.js
backend/test/postgresIntegration.test.js
database/schema.sql
frontend/src/App.jsx
frontend/src/api.mjs
frontend/src/LedgerConsistency.jsx (nuevo)
frontend/src/ledgerConsistency.mjs (nuevo)
frontend/test/ledgerConsistency.test.mjs (nuevo)
frontend/test/ledgerSql.browser.scenario.cjs (nuevo)
frontend/test/payments.browser.cjs
frontend/test/readQueue.test.mjs (nuevo)
frontend/vite.config.js
start-local.ps1
stop-local.ps1
docs/REVISION-SQL-2026-09-17.md (nuevo)
```
