# Fuente unica de verdad contable — clasificacion de reportes

Fecha: 2026-09-17. Base: `saas/backend` en la rama `ledger-audit`. Aplica a `server.js`; `server.local.js` replica la misma clasificacion (ADR-001).

Clases:
- **A** — derivado del libro PostgreSQL (`readJournal`/`storedEntries`; asientos publicados e inmutables).
- **B** — derivado de documentos (`transacciones`/`pagos_transacciones`) sin pasar por el libro.
- **C** — mezcla: usa el libro para saldos y los documentos para listas, pendientes o evidencia.

`readJournal` devuelve el libro solo cuando el propietario ya incorporo su libro (`libros_contables`); antes de eso reconstruye desde documentos y marca `persistido:false`. En la app de revision actual (0 asientos publicados) **todo es clase B en la practica**.

| Endpoint | Clase | Fuente exacta | Observacion |
|---|---|---|---|
| `GET /api/dashboard` | B | `SUM(monto)`, `SUM(itbms)` sobre `transacciones` por `periodo` | Ingresos/gastos/utilidad e ITBMS; `gastos` = `monto` sin ITBMS no deducible |
| `GET /api/transacciones/resumen`, `/diario`, `/evolucion` | B | SQL sobre `transacciones` + `attachPayments` | CxC/CxP por saldo pendiente de pagos |
| `GET /api/fiscal/itbms`, `/renta`, `/calendario` | B | SQL sobre `transacciones` | Calculo fiscal; **no tocar sin evidencia** |
| `GET /api/fiscal/conciliacion` | B | `sqlReconciliationReport` (documentos, pagos, movimientos, cuentas) | Flujos netos, no saldos certificados |
| `GET /api/reportes/estado-resultados` | B | `getAccountingTransactions` → listas de ingresos/gastos por documento | PDF; no usa cuentas 4xxx/5xxx del libro |
| `GET /api/reportes/itbms` | B | SQL sobre `transacciones` | PDF fiscal |
| `GET /api/reportes/diario`, `/diario-anual`, `/cliente/:id` | B | `transacciones` (diario "combinado" documental) | Distinto del libro diario |
| `GET /api/reportes/antiguedad`, `/api/contabilidad/antiguedad` | B | `agingReport(transacciones)` | Saldos por documento y pagos |
| `GET /api/reportes/conciliacion` | B | `sqlReconciliationReport` | PDF |
| `GET /api/contabilidad/asientos` | A | `readJournal` | `persistido:true` cuando hay libro |
| `GET /api/contabilidad/balance-comprobacion`, `/api/reportes/balance-comprobacion` | A | `trialBalance(readJournal)` | Saldo inicial acumulado desde el libro |
| `GET /api/contabilidad/mayor/:cuenta`, `/mayor-general` y sus PDF | A | `accountLedger/generalLedger(readJournal)` | |
| `GET /api/reportes/libro-diario` | A | `storedEntries` + `journalReport` | Exige libro incorporado y folios; rechaza historial alterado (409) |
| `GET /api/contabilidad/cierre`, `/api/reportes/cierre`, `PUT /cierre-estado` | C | `closingReview(transacciones, readJournal, ...)`: balance y `asientos.length` del libro; pendientes, pagos y evidencia bancaria de documentos | El cierre exige `balance.balanceado` del libro y cero hallazgos criticos/altos de documentos |
| `GET /api/contabilidad/cierres-clientes`, `/cartera`, `/api/reportes/cierres-clientes`, `/paquete-cierre` | C | `closingReviewByClient`/`portfolioReview` con libro + documentos + evidencia bancaria | `paquete-cierre` incluye ademas antiguedad (B) |
| `GET /api/contabilidad/resumen-mensual`, `/api/reportes/resumen-mensual` | C | `monthlyAccountingSummary(transacciones, { journal })` | Totales por mes desde documentos; asientos y balance desde libro |
| `GET /api/contabilidad/libro`, `/libros-entidad` | A | estado del libro y folios | Ahora incluye `consistencia` (abajo) |
| `GET /api/auxiliar-bancario`, `/extractos-bancarios` | C | dimensiones bancarias del libro + extractos | Saldos de extracto no verificados contra el libro (declarado en STATUS) |

## Divergencias posibles que el sistema no detectaba

1. **documentos ≠ libro**: un `UPDATE transacciones` fuera de la API (o cualquier alteracion no revisada) deja el libro con el importe anterior. Antes solo se detectaba en la **siguiente escritura** (409 "cambios del libro sin una correccion revisada"); las lecturas A seguian mostrando el libro y las B el documento, sin aviso.
2. **libro ≠ reporte**: dashboard/estado de resultados/ITBMS (B) y balance/mayor (A) pueden mostrar cifras distintas para el mismo periodo. Diferencia semantica conocida y **legitima**: el motor carga al gasto el ITBMS no deducible (`debe: total` cuando `!deducible`), mientras los reportes B suman `monto`. No es un error, pero nadie lo explicaba.
3. **reporte ≠ reporte**: `estado-resultados` (B) frente a `balance-comprobacion` (A) tras una correccion publicada: iguales solo si el documento y el libro coinciden.

## Lo implementado en esta fase (solo deteccion, sin cambiar calculos)

- `services/ledgerConsistency.js`: `ledgerConsistency(transacciones, asientos, alcance)` devuelve
  `estado` (`consistente` | `divergente` | `integridad_fallida`), `pendientes` (asientos que una escritura tendria que publicar ahora), `cuentas_divergentes` (saldo que producirian los documentos vs saldo del libro, por cuenta), `totales.documentos` (estilo reporte B), `totales.libro` (cuentas 4xxx/5xxx/2020/2021) y `reportes_vs_libro` con la marca `gastos_explicados_por_itbms_no_deducible`.
- `GET /api/contabilidad/consistencia?periodo|anio&cliente_id` en `server.js` y `server.local.js`.
- `GET /api/contabilidad/libro` incluye `consistencia: { estado, pendientes, cuentas_divergentes, errores }` cuando el libro esta incorporado (la pantalla del libro ya consulta este endpoint).
- Pruebas: `test/ledgerConsistency.test.js` (4 casos), `journalPostgres.scenario` (alteracion externa → `divergente`, dashboard 300 vs balance 200, vuelve a `consistente`), `localJournalIntegration` (mismo caso en local).

## Pendiente (no hecho a proposito)

- Cambiar dashboard, estado de resultados o ITBMS para que lean el libro: altera cifras fiscales y la definicion de "gastos"; requiere decision contable (¿ITBMS no deducible es gasto en el estado de resultados?).
- Mostrar la alerta en la interfaz (el frontend aun no consume `consistencia`).
- Ejecutar `consistencia` de forma programada (ADR-002 §3.4).
