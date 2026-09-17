# ADR-001 — Un solo motor contable: `server.js` + PostgreSQL

Estado: **Propuesto** (2026-09-17). Decision pendiente de aprobacion antes de retirar codigo.
Contexto: fase 2 de la auditoria del libro (`AUDITORIA_LEDGER_2026-09-17.md`).

## 1. Situacion encontrada (evidencia)

ContaPanama tiene hoy **dos motores contables completos** que exponen la misma API:

| | `server.js` | `server.local.js` |
|---|---|---|
| Lineas | 142 + 15 archivos de rutas (~3 000) | 1 890 en un solo archivo |
| Persistencia | PostgreSQL (`db/index.js`, pool, transacciones, advisory lock por propietario) | JSON en memoria persistido a `backend/.local-data/contapanama-state.json` (`localStateStore`: borrador por request, cola de escritores, fsync + rename antes de responder) |
| Libro contable | `journalRepository` → tablas `asientos_contables`, `asiento_lineas`, `folios_libro`, `dimensiones_bancarias`, triggers de inmutabilidad | `localJournalRepository` → colecciones del JSON; inmutabilidad verificada en `syncWrite` comparando el estado anterior |
| Pagos | `paymentRepository` (SQL) | `localPaymentRepository` |
| Banco | `bankMovementRepository.sqlBankMovementRepository` | `bankMovementRepository.createLocalBankMovementRepository` + `localBankIntegrity` |
| Rutas | 91 rutas + 6 alias (`/api/conciliacion/*`, `POST /api/movimientos-bancarios/match`) | las mismas 91 rutas (**0 rutas exclusivas del local**) |
| Validacion de entrada | `express-validator` en las 10 rutas | validacion manual en cada handler |
| Autenticacion | JWT + consulta de usuario en BD; 503 si la BD no responde | JWT + usuario en memoria; `JWT_SECRET` con valor por defecto si falta |
| Uso actual | Pruebas PostgreSQL (81–85 grupos) | **La app de revision del usuario** (`start-local.ps1`, http://localhost:5173) |

La superficie de rutas es identica (inventario generado con `grep` sobre ambos servidores; ver seccion 3), pero cada handler esta escrito dos veces. Los servicios de dominio puros si estan compartidos (`accountingEngine`, `journalLedger`, `paymentLedger`, `entityBooks`, `bankPosting`, `documentCorrection`, `documentIdempotency`, `ledgerConsistency`, `fiscalEngine`, `pdfService`, `journalReport`, `reconciliationReport`): la duplicacion esta en la capa HTTP y en la capa de persistencia.

## 2. Diferencias de comportamiento verificadas

| Ruta | `server.js` | `server.local.js` | Riesgo |
|---|---|---|---|
| `POST /api/transacciones` | `fecha_vencimiento` = `null` si no se envia | `fecha_vencimiento` = fecha + 30 dias (`addDays`) | Antiguedad de saldos y vencimientos distintos para el mismo documento |
| `POST /api/transacciones` | `itbms` = `monto*tasa` solo si `itbms === undefined` | tambien cuando `itbms === ''` | Un formulario que envia `''` obtiene ITBMS 0 en SQL y calculado en local |
| `POST /api/transacciones` | Validacion `express-validator` (fecha ISO, monto ≥ 0.01, UUID, tasa ≤ 0.15) → 422 con `errors[]` | Sin validador; `money()` convierte texto invalido a 0 → 201 con importe 0 | El local acepta documentos que SQL rechaza |
| `PUT /api/transacciones/:id` | Bloqueo optimista (`FOR UPDATE` + comparacion JSON de la fila) → 409 "El documento cambio" | Sin bloqueo; el `localStateStore` serializa escritores, por lo que la carrera no existe pero tampoco se detecta la edicion concurrente desde dos pestañas | Semantica de concurrencia distinta |
| `PUT/DELETE /api/transacciones/:id` | Bloquea si existe **cualquier** fila en `pagos_transacciones` (incluidos legados) | Bloquea solo si hay pagos no legados (`hasPaymentLedger`) | Un documento con pago legado anulado se puede editar en local y no en SQL |
| `DELETE /api/transacciones/:id` | Ademas de las reglas de ruta, la BD impide borrar un documento con asientos (`ON DELETE SET NULL` + trigger de inmutabilidad → 23514) | Solo `syncWrite` en memoria | Proteccion de ultima linea solo en SQL |
| `GET /api/dashboard` y `/resumen` | Sumas SQL sobre `transacciones` | `resumenTx` sobre el arreglo | Iguales en cifras, pero ambos ignoran el libro (ver ADR-003/consistencia) |
| Auth | 503 ante fallo de BD (corregido en fase 1) | No aplica | — |
| Idempotencia de documentos | Indice unico en BD + comprobacion bajo lock | Comprobacion en memoria bajo la cola de escritores | Equivalente funcionalmente; solo SQL tiene respaldo en BD |

Ninguna de estas diferencias esta cubierta por una prueba que ejecute el **mismo** escenario contra ambos motores y compare resultados; las suites locales y PostgreSQL comparten escenarios (`*.scenario.js`) pero cada una acepta el comportamiento de su motor.

## 3. Inventario de rutas

- Presentes en ambos: 91 (auth, clientes, transacciones y pagos, contabilidad, reportes, fiscal, vencimientos, banco: movimientos, cuentas, extractos, auxiliar, integracion, auditoria).
- Solo en `server.js`: alias `GET/POST /api/conciliacion`, `POST /api/conciliacion/bulk`, `POST /api/conciliacion/:id/cliente`, `POST /api/conciliacion/:id/cuenta` (monta `movimientosRoutes` dos veces) y `POST /api/movimientos-bancarios/match` (el local solo expone `POST /api/conciliacion/match`).
- Solo en `server.local.js`: ninguna.
- Servicios solo del local: `localStateStore`, `localJournalRepository`, `localPaymentRepository`, `localBankIntegrity`, `createLocalBankMovementRepository`.
- Servicios solo de SQL: `accountingWrite`, `journalRepository`, `paymentRepository`, `sqlBankMovementRepository`, `bankEvidence.readBankEvidence`, `db/*`.

## 4. Decision propuesta

**`server.js` + PostgreSQL es la fuente principal.** `server.local.js` deja de ser un motor de la aplicacion y pasa a ser exclusivamente un arnes de pruebas sin base de datos, hasta su retiro.

Principios:
1. Toda regla contable nueva se implementa una sola vez, en servicios puros compartidos, y se expone por las rutas de `server.js`.
2. La app de revision del usuario se ejecuta contra `server.js` con un PostgreSQL local (Docker `docker-compose.yml` ya existente, o el cluster de `~/.cache/contapanama-postgres/17.11`).
Metadatos privados de la revision local retirados; se conserva la exigencia de revision CPA.

## 5. Plan de transicion

| Fase | Que | Criterio de salida |
|---|---|---|
| T0 (hecho) | Inventario, pruebas de contrato compartidas (`*.scenario.js`), QA unificado (`npm run qa`) | Ambos motores en verde con el mismo escenario |
| T1 | Ejecutar la app de revision contra `server.js` + PostgreSQL local con datos de prueba (`db/seed.js`) | Checklist manual de pantallas (Centro CPA, Diario, Pagos, Conciliacion, Extractos, Libro) sin diferencias visibles |
| T2 | Script de carga `db/importLocalState.js` (solo lectura del JSON → INSERT por API/transaccion, sin publicar asientos) + prueba con una copia del JSON | Mismos totales por cliente/periodo en `/api/transacciones/resumen` y `/api/fiscal/*` antes y despues; `GET /api/contabilidad/libro` en `pendiente_revision` |
| T3 | Congelar `server.local.js`: `CONTAPANAMA_LOCAL_DEPRECATED=1` que imprime aviso al arrancar; `start-local.ps1` levanta `server.js` | Ninguna nueva ruta en el local durante dos iteraciones |
| T4 | Retirar `server.local.js`, `localStateStore`, `localJournalRepository`, `localPaymentRepository`, `localBankIntegrity`, `createLocalBankMovementRepository`, `integrationLocal.test.js` y `localJournalIntegration.test.js`; conservar los `*.scenario.js` (ya corren contra SQL) | `npm run qa` sin suites locales y con cobertura equivalente en PostgreSQL |

Que se migra: nada de codigo de rutas (ya existe en SQL); solo los **datos** del JSON y las pruebas que hoy solo corren en local (`integrationLocal.test.js` cubre borradores IA, vencimientos, propuestas y cierres que en PostgreSQL estan repartidos; antes de T4 hay que confirmar con `postgresIntegration` que cada aserción tiene equivalente).

Que puede retirarse despues: los cinco servicios `local*` y los dos arneses locales; `localStateStore.test.js`.

## 6. Riesgos de la transicion

| Riesgo | Mitigacion |
|---|---|
| Perdida o alteracion del historial del usuario al migrar | Solo copia; el JSON original queda intacto y con SHA-256 registrado; la carga es idempotente (clave `idempotencia` por documento) y reversible (base nueva) |
| Diferencias silenciosas (seccion 2) aparecen como "regresiones" al cambiar de motor | Antes de T1, prueba diferencial: ejecutar `paymentLedger.scenario`, `accountingPeriods.scenario`, `journalPdf.scenario` contra ambos y comparar JSON de `/api/transacciones`, `/resumen`, `/fiscal/itbms` |
| Dependencia de PostgreSQL para trabajar sin conexion | El cluster local en `~/.cache` ya funciona sin Docker; documentar `start-local.ps1` |
| Rendimiento O(N) por escritura al crecer el historial | ADR-002 (sincronizacion incremental) antes de superar ~2 000 documentos por propietario |
| Retirar el local antes de tiempo rompe la revision diaria del usuario | T3 congela pero no borra; T4 solo tras dos iteraciones sin uso |

## 7. Consecuencias

- Una sola implementacion de cada regla; las divergencias de la seccion 2 desaparecen por construccion.
- La inmutabilidad y la numeracion quedan garantizadas por la base de datos, no por comparaciones en memoria.
- Hasta T4, cada cambio de regla sigue exigiendo dos implementaciones; este ADR fija que la de SQL es la de referencia y la local debe copiarla, nunca al reves.
