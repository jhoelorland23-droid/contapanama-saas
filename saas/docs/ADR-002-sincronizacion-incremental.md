# ADR-002 — Sincronizacion incremental del libro

Estado: **Diseñado, no implementado** (2026-09-17). El algoritmo actual sigue en produccion de pruebas.
Prerrequisito: las pruebas de contrato `test/journalSyncContract.test.js` deben seguir en verde con cualquier implementacion.

## 1. Problema medido

Cada escritura contable (`accountingWrite.withAccountingWrite`) ejecuta `journalRepository.syncJournal`, que:

1. carga **todas** las transacciones y pagos del propietario (`sourceTransactions`, 2 veces por escritura);
2. carga **todos** los asientos con sus lineas, folios, dimensiones bancarias y cuentas en un solo JSON (`journalSnapshot`);
3. verifica el hash de **todos** los asientos hasta cinco veces (`verifyBankDimensions`, `inspectRegistry` ×2, `journalPlan`, `planBankDimensions`);
4. reconstruye el diario completo desde los documentos (`buildJournal`) y lo compara asiento por asiento con lo persistido.

Mediciones reproducibles:

| Metodo | Resultado |
|---|---|
| `CONTAPANAMA_PG_BENCH=300 node test/postgresIntegration.test.js` (cluster real, un propietario, 4 clientes) | p50 de `POST /api/transacciones` 129 ms → 289 ms entre el documento 1 y el 300; pendiente **0.64 ms/documento**. Lecturas `GET /asientos` y `/balance-comprobacion` 53 → 172 ms |
| `node test/journalPlan.bench.js` (solo CPU, sin BD, historial sembrado) | `journalPlan` completo ≈ **40 µs/asiento** (78 ms con 1 972 asientos); planificar solo el documento tocado: 0.12–0.17 ms, constante |

Extrapolacion lineal: ~3 s por escritura con 5 000 documentos y ~6.5 s con 10 000; el 80 % del costo esta en las consultas JSON y las pasadas de hash, no en `journalPlan`.

## 2. Propiedad que hace posible lo incremental

`journalPlan` es **local por `origen_clave`**: para cada clave (`tx-<doc>`, `pago-<pago>`, `pago-reversa-<pago>`, `pago-<doc>` en pagos legados) decide reverso/reemplazo mirando solo los asientos de esa clave y la version que los documentos producirian ahora. Las unicas operaciones globales son (a) verificar el hash de todo `existing`, (b) `unresolvedPayment` sobre todas las transacciones y (c) `Math.max(numero)`.

`test/journalSyncContract.test.js` demuestra con 120 historias aleatorias sembradas (25 mutaciones cada una: alta, abono parcial/total, anulacion, nota, correccion de importe/fecha) que:

- el plan de los documentos tocados (`planIncremental`) es **identico** al plan completo restringido a ellos;
- el plan completo **nunca** produce asientos para documentos no tocados;
- aplicar el plan es idempotente; numeros, versiones y reversos quedan continuos y unicos;
- un asiento manipulado dentro del conjunto tocado sigue detectandose; un asiento ajeno se rechaza;
- el costo del plan incremental no depende del tamaño del libro (factor 68–658× en el benchmark).

## 3. Diseño

### 3.1 Conjunto afectado

Cada operacion de escritura declara los documentos que toca (hoy ya se conoce: `POST/PUT/DELETE /transacciones/:id`, `/pagos`, `/anular`, `/conciliar`, `/cuenta`, `match`, `convertir-borrador`, `incorporar`). `journalIncremental.affectedKeys(tx)` deriva las claves. `withAccountingWrite(uid, action, { touched: [ids] })`.

### 3.2 Lecturas por escritura (O(k) + O(log N))

| Hoy | Propuesto |
|---|---|
| `SELECT * FROM transacciones WHERE usuario_id` | `... WHERE usuario_id AND id = ANY($ids)` + sus `pagos_transacciones` (indice `idx_pagos_transaccion` existe) |
| `journalSnapshot` de todo el libro | asientos + lineas `WHERE transaccion_id = ANY($ids)` (indice `idx_asientos_transaccion` existe); folios y dimensiones de esos asientos |
| `Math.max(numero)` en memoria | `SELECT COALESCE(MAX(numero),0) FROM asientos_contables WHERE usuario_id=$1` bajo el advisory lock (indice `idx_asiento_numero`) |
| Contador de folios por entidad en memoria | `SELECT COALESCE(MAX(numero),0) FROM folios_libro WHERE libro_entidad_id=$1` (indice unico `(libro_entidad_id, numero)`); el trigger `fn_folio_guard` ya exige continuidad |
| `existing.some(e => !e.numero_libro)` sobre todo | `SELECT 1 FROM asientos_contables a LEFT JOIN folios_libro f USING (asiento_id) WHERE a.usuario_id=$1 AND a.requiere_folio AND f.asiento_id IS NULL LIMIT 1` |
| `unresolvedPayment` sobre todas las transacciones | solo sobre los documentos tocados; los legados se validan una vez en `incorporateBook` (ya ocurre) |
| `verifyEntry` de todo el libro en cada escritura | solo los asientos de las claves tocadas; verificacion completa en `GET /api/contabilidad/consistencia`, en la incorporacion y en una tarea programada (ver 3.4) |
| `planBankDimensions(..., sourceTransactions(all))` | pasar las transacciones tocadas y los asientos origen de las reversas (se localizan por `rectifica_id`/`pago_id`, ya en el subconjunto) |

### 3.3 Escrituras

Sin cambios: `INSERT` de asientos, lineas, folios y dimensiones con los mismos triggers. Los triggers de BD (`fn_asiento_guard`, `fn_linea_guard`, `fn_asiento_balanceado`, `fn_folio_guard`, `fn_dimension_bancaria_guard`, indices unicos `idx_asiento_numero`, `idx_asiento_version`, `idx_asiento_rectificado`) siguen siendo la garantia de ultima linea; el algoritmo incremental no puede violarlos sin que la transaccion falle.

### 3.4 Verificacion global fuera del camino de escritura

- `GET /api/contabilidad/consistencia` (ya existe): plan completo + comparacion documentos/libro/reportes. Se ejecuta bajo demanda desde la pantalla del libro.
- Al incorporar el libro y al asignar folios (`incorporateBook`, `incorporateEntityBooks`): verificacion completa como hoy.
- Tarea programada (diaria o al cierre de periodo): `consistencia` por propietario; resultado en `audit_events` (`libro_verificado` / `libro_divergente`). No bloquea escrituras; alerta.

### 3.5 Lecturas

`readJournal` debe filtrar en SQL (`fecha BETWEEN`, `cliente_id`) y verificar solo los asientos devueltos. `trialBalance` con saldo inicial necesita agregados anteriores al periodo: `SUM(debe-haber) GROUP BY cuenta_codigo WHERE fecha < desde` en SQL (sin verificar hash de lo agregado; la verificacion global cubre ese riesgo). Esto no forma parte del contrato de escritura y puede hacerse despues.

## 4. Complejidad

| | Hoy | Incremental |
|---|---|---|
| Escritura | O(D + E·L) con D documentos, E asientos, L lineas; 5 pasadas de hash sobre E | O(k) con k = asientos del documento tocado (1–5) + O(log N) por indices |
| Lectura de diario/balance | O(E) en memoria | O(E_periodo) + agregados SQL |
| Verificacion completa | en cada escritura | bajo demanda / programada, O(E) |

## 5. Riesgos contables y como se controlan

| Riesgo | Control |
|---|---|
| Manipulacion de un asiento no tocado no se detecta en la escritura | Triggers de inmutabilidad en BD (UPDATE/DELETE/TRUNCATE rechazados); `consistencia` bajo demanda y programada; verificacion completa en cierres e incorporaciones |
| Numeracion con huecos o duplicada bajo concurrencia | Advisory lock por propietario + `idx_asiento_numero` unico; el numero se toma con `MAX(numero)` dentro de la misma transaccion |
| Reverso doble o reemplazo sin reverso | `idx_asiento_rectificado` unico + `fn_asiento_balanceado` (reverso exacto); contrato T3 |
| Un documento tocado cuyos asientos de origen (reversa de pago) estan fuera del subconjunto | Las reversas se planifican por `pago_id` del mismo documento: siempre dentro del subconjunto (`transaccion_id` igual); contrato T1/T2 |
| Pago legado sin resolver en otro documento bloqueaba antes; ahora no | Se valida al incorporar; ademas `consistencia` lo reporta en `errores` |
| Folio pendiente en un asiento antiguo (historial sin asignar) dejaba de bloquear | Consulta `LIMIT 1` de asientos sin folio (3.2) conserva la regla |
| Diferencias entre motor local y SQL | ADR-001: solo se implementa en SQL |

## 6. Plan de implementacion (para Codex)

1. Añadir `touched` al contexto de `withAccountingWrite` en cada ruta (sin cambiar comportamiento; `syncJournal` lo ignora).
2. Implementar `journalRepository.syncJournalIncremental(db, uid, touched, assertOpen, correction)` con las consultas de 3.2; mantener `syncJournal` como respaldo tras un flag `CONTAPANAMA_JOURNAL_SYNC=incremental|full`.
3. En modo `incremental`, ejecutar ademas el plan completo en la suite PostgreSQL (`CONTAPANAMA_JOURNAL_SYNC_VERIFY=1`) y comprobar que ambos planes coinciden en cada escritura de `journalPostgres.scenario`, `documentCorrection.scenario`, `entityBooks.scenario`, `bankAccounts.scenario` y `journalResilience.scenario`.
4. Reejecutar `CONTAPANAMA_PG_BENCH=300`: criterio de aceptacion, pendiente < 0.05 ms/documento y p50 estable entre la ventana 1 y la 6.
5. Solo entonces cambiar el valor por defecto a `incremental`, conservando `full` para diagnostico.
