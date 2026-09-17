# Auditoria del libro contable persistente (PostgreSQL) — 2026-09-17

Alcance: revision, validacion y mejora del trabajo de Codex sobre el libro contable en PostgreSQL.
Sin migracion de historial, sin cambios destructivos, sin despliegue. Rama `ledger-audit`.

## A. Estado real encontrado

1. **El trabajo de Codex no estaba en el repositorio git** `APP CONTA PANAMA` (rama `master`, un solo commit "Linea base del proyecto").
   Vivia, sin control de versiones, en `[PRIVATE_PATH_REMOVED]`.
   En esta rama se importo esa carpeta como `saas/` excluyendo `node_modules`, `backend/.env`, `backend/.local-data/`
Metadatos privados de la revision local retirados; se conserva la exigencia de revision CPA.
2. El libro persistente existe y es mas amplio de lo reportado: ademas de asientos/lineas hay libros por entidad con folios
   (`libros_entidad`, `folios_libro`), dimensiones bancarias inmutables (`dimensiones_bancarias`), cuentas, extractos y auxiliar bancario.
3. La app de revision local (`server.local.js`) **no usa PostgreSQL**: es un servidor paralelo de 1 890 lineas con estado en memoria
   persistido a `backend/.local-data/contapanama-state.json` (escritura durable: archivo temporal + fsync + rename, antes de responder).
   El libro SQL solo opera en `server.js`.
4. Arquitectura del libro: es un **libro derivado**. En cada escritura (`withAccountingWrite`) se toma un advisory lock por propietario,
   se ejecuta la accion y luego `syncJournal` recompone el diario completo desde `transacciones` + `pagos_transacciones`
   (`buildJournal`) y lo compara con lo persistido; solo se agregan asientos nuevos, reversos exactos y reemplazos versionados.
   Nada publicado se modifica ni se elimina (triggers en BD).

## B. Diferencias entre lo reportado por Codex y lo real

| Afirmacion de Codex | Estado real |
|---|---|
| Archivos en `backend/...` del repositorio | No estaban en el repositorio; estaban en el workspace de Codex sin git |
| 28 grupos PostgreSQL aprobados | Cierto para la etapa "journal" (2026-09-09). La suite actual tenia 76 grupos; hoy, con los nuevos escenarios, son 81 |
| "53 pruebas locales aprobadas" | `test:integration-local` **falla en la copia intacta de Codex**: el cierre anual 2025 del seed se rechaza por la regla nueva "cierre con evidencia bancaria" (8 marcas de conciliacion sin movimiento valido). La prueba quedo desactualizada tras activar esa regla; no es un bug del libro |
| Suite `test:journal-local` aprobada | Fallaba en este equipo por dos causas: (a) `ECONNRESET` por reutilizar sockets keep-alive tras comprobaciones PDF sincronas (Node 24 + Python), y (b) el escenario de auxiliar bancario esperaba 500 donde el store local responde 503 (`outputs/bank-subledger-qa/results.json` de Codex ya registraba `passed=false`). Ambas corregidas en el arnes |
| Idempotencia para evitar duplicaciones | Solo existia para pagos, movimientos bancarios, cuentas y extractos. **La creacion de documentos (`POST /api/transacciones`) no tenia clave de idempotencia**: un doble clic desde otra pestana, una respuesta perdida o un reintento publicaban dos documentos y dos asientos inmutables |
| Controles de timeout | No existia `statement_timeout`: una sentencia colgada retenia el advisory lock del propietario y su conexion del pool indefinidamente |
| Riesgo de rendimiento "identificado" | Medido, no supuesto: ver seccion F |

## C. Bugs y riesgos encontrados

### CRITICO
- Ninguno en la integridad contable del libro SQL. Debe = Haber, reversos exactos, versionado, numeracion, inmutabilidad, atomicidad y
  concurrencia estan respaldados por triggers/indices en BD y verificados con pruebas contra un cluster real.

### ALTO
1. **Creacion de documentos sin idempotencia** (SQL y local). Corregido: clave opcional `idempotencia` (misma regla que pagos),
   indice unico `idx_tx_idempotencia (usuario_id, idempotencia)`, comprobacion bajo el lock del propietario, respuesta `200 {repetido:true}`
   en reintentos, `409` si la misma clave trae otro contenido. El formulario envia una clave por intento y la conserva hasta recibir confirmacion.
2. **Sin `statement_timeout`**: bloqueo indefinido del propietario y agotamiento del pool (`max: 20`) ante una sentencia colgada.
   Corregido: `CONTAPANAMA_STATEMENT_TIMEOUT_MS` (60 s por defecto) aplicado a cada conexion del pool; probado con una sentencia de 6 s y limite de 1.5 s.
3. **Rendimiento lineal por escritura y lectura** (demostrado): p50 de `POST /api/transacciones` pasa de 129 ms a 289 ms entre el
   documento 1 y el 300 del mismo propietario (pendiente 0.64 ms/documento); lecturas del diario/balance de 53 ms a 172 ms.
Metadatos privados de la revision local retirados; se conserva la exigencia de revision CPA.

3b. **Caida de PostgreSQL reportada como `401 Token inválido`** (`middleware/auth.js`): cualquier error de BD al verificar la sesion se
   respondia como 401; el frontend borra el token y expulsa al usuario ante un 401. Detectado por el escenario nuevo de caida de BD.
   Corregido: solo los errores JWT producen 401; un fallo de BD responde 503 "El servicio no está disponible".

### MEDIO
4. **Duplicacion de logica** entre `server.js`/rutas SQL y `server.local.js`: dos implementaciones completas de documentos, cierres,
   conciliacion y reportes, con divergencias ya visibles (p. ej. `fecha_vencimiento` por defecto +30 dias solo en local; distinta forma
   de derivar `tasa_itbms`/`itbms`; validaciones `express-validator` solo en SQL). Cada regla nueva debe escribirse dos veces.
5. Reportes que **no** leen el libro: dashboard, `/estado-resultados`, `/itbms`, `/diario` y `/resumen` agregan directamente
   `transacciones`. Si un documento se altera fuera de la API (caso probado en `journalPostgres.scenario`), esos reportes divergen del
   mayor/balance (que si usan el libro).
6. `ssl: { rejectUnauthorized: false }` en produccion (`db/index.js`): desactiva la verificacion TLS hacia PostgreSQL (MITM). No cambiado:
   depende del proveedor de hosting; debe configurarse la CA.
7. Arnes de pruebas fragil en Windows/Node 24 (`ECONNRESET`): corregido en los tres arneses (`Connection: close`) y el arnes PostgreSQL
   ya no se cae cuando se termina una sesion a proposito.

### BAJO
8. Los errores 500 devuelven `err.message` crudo de PostgreSQL (informacion interna al cliente).
9. `Math.max(0, ...existing.map(...))` en `appendEntries`: con cientos de miles de asientos la expansion de argumentos falla; el indice
   unico `idx_asiento_numero` seria el respaldo. Irrelevante al volumen actual.
10. Dos directorios desechables de pruebas quedaron en `%TEMP%` (`contapanama-pg-qa-2SjL7X` de esta sesion tras una caida del arnes,
    ya corregida, y `contapanama-pg-qa-8xBXWC` del 2026-09-13). No contienen datos reales; no se borraron por la regla de no eliminar sin confirmacion.

## D. Correcciones realizadas

1. Idempotencia de documentos: schema, ruta SQL, servidor local, formulario, `services/documentIdempotency.js`.
2. `statement_timeout` configurable en el pool + `.env.example`.
3. Escenario nuevo `test/journalResilience.scenario.js` (PostgreSQL real): 8 creaciones simultaneas con una clave → 1 documento/1 asiento;
   reintento tardio; misma clave con otro contenido → 409; clave invalida → 422; INSERT directo con la clave → 23505;
   `DELETE` SQL directo de un documento publicado → 23514; segundo reverso del mismo original → 23505; correccion repetida no agrega nada;
   sentencia colgada cancelada por timeout sin confirmar nada y con el lock liberado; **caida de PostgreSQL** (pg_ctl stop) → 503/500 sin
   confirmar nada, y tras reiniciar el cluster el libro esta intacto y las escrituras continuan; el mismo endpoint se verifica tras reinicio
   de API en otra zona horaria y tras `pg_dump`/`pg_restore`.
4. Benchmark opcional `test/journalBench.scenario.js` (`CONTAPANAMA_PG_BENCH=<n>`), evidencia en seccion F.
5. Prueba local de reintento de documentos en `test/integrationLocal.test.js`; contrato de esquema ampliado (`idx_tx_idempotencia`, `idx_asiento_rectificado`).
6. Arneses: sin keep-alive, `error.cause` en el reporte, `api.log` completo en la salida, clientes pg tolerantes a terminacion,
   `restartApi`/`stopCluster`/`startCluster`; expectativa 503 en el fallo de guardado local del auxiliar bancario.

## E. Archivos modificados o creados (rama `ledger-audit`, todo bajo `saas/`)

- `database/schema.sql` — columna `transacciones.idempotencia` + indice unico parcial (aditivo, `IF NOT EXISTS`).
- `backend/db/index.js` — `statement_timeout` por conexion.
- `backend/middleware/auth.js` — 503 (no 401) cuando la BD no responde.
- `backend/routes/transacciones.js` — idempotencia en `POST /`.
- `backend/server.local.js` — idempotencia en `POST /api/transacciones`.
- `backend/services/documentIdempotency.js` — nuevo.
- `backend/.env.example` — nueva variable.
- `frontend/src/App.jsx` — clave por intento en el formulario de documentos.
- `backend/test/journalResilience.scenario.js`, `backend/test/journalBench.scenario.js` — nuevos.
- `backend/test/postgresIntegration.test.js`, `backend/test/localJournalIntegration.test.js`, `backend/test/integrationLocal.test.js`,
  `backend/test/bankSubledger.scenario.js`, `backend/test/schemaContract.test.js` — arneses y expectativas.
- Raiz del repo: `.gitignore` (+`.local-data/`).

## F. Pruebas ejecutadas y resultado

Ejecutadas desde `saas/backend` y `saas/frontend` de esta rama (Node 24.18, PostgreSQL 17.11 desechable):

| Suite | Resultado |
|---|---|
| `test:integration-postgres` (cluster real, `outputs/ledger-audit-postgres-qa/results.json`) | **85/85 grupos, passed=true** (3 min 28 s). Antes de las correcciones: 76 grupos; con el arnes intacto de Codex en este equipo fallaba por `ECONNRESET` |
| `test:journal` (13), `test:corrections` (7), `test:entity-books` (7), `test:local-store` (5) | 32/32 |
| `test:payments`, `test:accounting`, `test:accounting-pdf` no ejecutada, `test:schema-contract` (+2 aserciones), `test:auth-security`, `test:env`, `test:fiscal` | aprobadas |
| `test:journal-local` (servidor local, JSON) | **57 grupos, exit 0** (antes fallaba en este equipo: ECONNRESET y 503 vs 500) |
| `test:integration-local` | Nuevo bloque de idempotencia local aprobado; la suite sigue fallando en el cierre 2025 del seed (fallo preexistente en la copia intacta de Codex, ver B) |
| Frontend: `npm run build` (index-DVn7L48s.js, 409.98 kB) y `node --test test/*.test.mjs` | build correcto, 22/22 |
| Archivo de datos reales `backend/.local-data/contapanama-state.json` | SHA-256 `[PRIVATE_STATE_FINGERPRINT_REMOVED]` antes y despues (identico a STATUS.md) |

No se ejecutaron las pruebas de navegador (Playwright/Chrome) ni `test:journal-pdf-layout`/`test:accounting-pdf` (requieren Python con pypdf configurado).

Benchmark (cluster PostgreSQL 17.11 desechable, un propietario, 300 documentos, 4 clientes):

| Ventana (desde doc.) | p50 ms | p90 ms | max ms |
|---|---|---|---|
| 1 | 129 | 157 | 2311 (primera escritura: creacion del libro y plan de cuentas) |
| 51 | 160 | 185 | 200 |
| 101 | 177 | 210 | 316 |
| 151 | 225 | 259 | 273 |
| 201 | 264 | 331 | 440 |
| 251 | 289 | 348 | 384 |

| Documentos | `GET /asientos` (1 cliente, 1 anio) ms | `GET /balance-comprobacion` ms |
|---|---|---|
| 50 | 53 | 57 |
| 100 | 71 | 72 |
| 200 | 133 | 121 |
| 300 | 172 | 176 |

Causa: por escritura se cargan todas las transacciones (2 veces), todos los asientos con lineas/folios/dimensiones en JSON y se recalculan
~5 pasadas de hash sobre todo el historial (`storedEntries` → `verifyBankDimensions` + `inspectRegistry`; `journalPlan` → `verifyEntry`;
`appendEntityFolios` → `inspectRegistry`; `planBankDimensions` → `verifyBankDimensions`). Las lecturas filtran por cliente/periodo en memoria, no en SQL.

## G. Lo que NO se modifico por seguridad

- `backend/.local-data/` (datos reales): ni copiado al repo ni leido por las pruebas; el arnes verifica su SHA-256 antes y despues.
- Ninguna regla contable (partida doble, reversos, folios, cierres, evidencia bancaria).
- Ninguna tabla, trigger o indice existente; solo adiciones idempotentes al schema.
- La carpeta de trabajo de Codex y su servidor local en ejecucion.
- `rejectUnauthorized: false` (requiere decision de hosting).
- La prueba `integrationLocal` en su paso de cierre 2025: corregirla implica decidir si el seed debe traer evidencia bancaria o si la
  prueba debe esperar el 409; es una decision contable, no tecnica.
- No se optimizo el rendimiento: primero se midio (seccion F); la solucion cambia el modelo de sincronizacion (ver H).

## H. Proximos 5 pasos recomendados (en orden)

1. **Decidir el destino de `server.local.js`**: la app de revision usa un motor distinto al libro SQL. Recomendacion: levantar PostgreSQL
   local (Docker o el cluster de `~/.cache/contapanama-postgres`) y usar `server.js` tambien para revision, dejando `server.local.js` solo
   para pruebas sin BD. Mientras existan dos motores habra divergencias.
2. **Sincronizacion incremental del libro** (propuesta, no implementada): `syncJournal` deberia replanificar solo las `origen_clave` del
   documento/pago tocado (`tx-<id>`, `pago-<id>`, `reversa-<id>`), leer asientos por `(usuario_id, transaccion_id)` con indice, y verificar
   hashes del historial completo en una tarea periodica o en la incorporacion, no en cada escritura. Filtrar `asientos` por periodo/cliente en SQL.
   Objetivo: costo por escritura O(asientos del documento), no O(historial).
3. **Actualizar `integrationLocal.test.js`** al criterio de cierre con evidencia bancaria (seed con movimientos validos o aserción del 409) y
   dejar `npm test` unico que ejecute todas las suites; hoy no existe un comando agregado.
4. **Hacer que dashboard, estado de resultados, ITBMS y diario documental lean el libro** cuando esta incorporado, o al menos mostrar una
   alerta cuando `transacciones` y `asientos_contables` no coinciden (comparacion de hashes ya disponible).
5. **Endurecer produccion**: CA de PostgreSQL en lugar de `rejectUnauthorized:false`, mensajes 500 genericos con id de correlacion,
   y revisar `pool.max` frente a la serializacion por propietario.

## I. ¿Esta el libro listo para conectarse completamente a `server.local.js`?

**No, y no deberia conectarse asi.** `server.local.js` no es un cliente de PostgreSQL: es un motor alternativo con su propio store en JSON.
"Conectar el libro SQL a server.local.js" significaria en la practica reescribir server.local.js sobre `db/index.js`, es decir, convertirlo en
`server.js`. Lo que si esta listo: **el libro en `server.js` + PostgreSQL** esta preparado para uso de revision con datos de prueba
(81 grupos de pruebas contra cluster real, incluidas caida de BD, timeout, doble clic, reintento, restauracion e inmutabilidad).
Metadatos privados de la revision local retirados; se conserva la exigencia de revision CPA.
incorporacion explicita (flujo ya existente `POST /api/contabilidad/libro/incorporar`), (2) resolver el paso 2 de H antes de superar
algunos miles de documentos por propietario, (3) TLS y mensajes de error de produccion.
