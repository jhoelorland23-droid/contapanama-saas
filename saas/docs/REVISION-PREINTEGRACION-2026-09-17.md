# Revision preintegracion del ledger

## Alcance y procedencia

Fuente verificada: rama `codex-ledger-integration`, HEAD inicial `historical-revision-05`.
Esta revision implementa solo las observaciones de la auditoria posterior: folios,
semantica de consistencia, autorizacion de importacion, medicion estadistica,
cobertura shadow, robustez del arnes y limpieza de evidencia versionada.
Sin push, merge, despliegue, datos reales ni cambios de formulas fiscales.
`server.local.js` permanece congelado. El modo por defecto sigue siendo `full`.

## Folios

Commit de implementacion: `historical-revision-06`. El inventario completo de archivos modificados
y de 53 artefactos retirados del indice esta en
[`evidence/ledger-premerge-2026-09-17.json`](evidence/ledger-premerge-2026-09-17.json).
Incluye resultados por suite, ventanas OLS y metricas sin credenciales ni logs crudos.

`services/entityBooks.js::allocateFolios` es la primitiva unica de asignacion.
`planRegistry` verifica el historial completo y pasa los ultimos numeros verificados;
el adaptador SQL incremental carga solo los libros afectados y sus maximos bajo
el bloqueo contable del propietario, y llama al mismo asignador.
La asignacion conserva orden global de asientos, series por cliente, libro provisional,
hashes, limite de entero seguro, versiones y referencia a folios originales.

La prueba diferencial en `test/entityBooks.test.js` ejecuta el plan completo y el
adaptador incremental sobre cuatro rondas con varios clientes, cambio de ano,
fechas anteriores, correcciones/versiones, reversos, libros existentes y nuevos.
Compara cada folio, hash, propietario y referencia original; normaliza solo UUIDs
de libros nuevos creados independientemente. No cambia originales ni contadores.
La prueba del adaptador usa SQL simulado estricto; PostgreSQL real se verifica
separadamente en QA y en las tres corridas incrementales.

## Consistencia

| Condicion | Insignia |
| --- | --- |
| Sin diferencias verificadas | CONSISTENTE |
| Sin diferencias en el filtro, pero con pendientes externos | CONSISTENTE EN EL FILTRO / EXISTEN DIFERENCIAS FUERA DEL FILTRO |
| Diferencia del filtro | DIVERGENTE |
| Verificacion pendiente o libro no incorporado | PENDIENTE / NO VERIFICADO |
| Error de consulta o integridad fallida, aunque sea fuera del filtro | ERROR / INTEGRIDAD FALLIDA |

La advertencia filtrada no es verde. `pendientes_fuera_del_filtro` sigue visible.
Un resumen global divergente sin informacion suficiente del filtro tampoco permite
verde. Error/integridad tiene prioridad. No hay reparacion automatica.
La prueba visual de cinco estados usa respuestas sinteticas controladas y se reporta
separadamente del flujo real SQL, para no confundir fixtures UI con persistencia.

## Importacion

Solo `options.apply === true` puede iniciar escritura; otros valores devuelven dry-run.
Ninguna etiqueta dentro del archivo, incluida `metadata.kind`, concede autorizacion.
Toda fuente exige `authorizeSourceHash` igual a su SHA-256, incluso un fixture QA.
No se implemento una excepcion/whitelist: el harness autoriza explicitamente el hash
de los bytes que genera. `authorizeRealCopy` queda como alias compatible y explicito.

La CLI usa `--authorize-source-hash=<SHA256>` (alias previo `--authorize-real-copy`).
Siguen vigentes fingerprint esperado, confirmacion, propietario CPA, destino explicito,
autorizacion adicional por base no QA/produccion, bloqueo por propietario, transaccion,
idempotencia y aprobacion posterior CPA antes de publicar el libro.
Pruebas negativas: metadata falsificada, apply textual/truthy, hash original de fuente
alterada, hash de preview nuevo con autorizacion antigua, copia distinta sobre destino
ocupado, dos reejecuciones y ocho ejecuciones concurrentes. Fallar auditoria revierte todo.

## Cobertura shadow

Evento transaccional `audit_events.accion = journal_shadow_coverage` por sincronizacion
confirmada de un libro incorporado. Campos booleanos: `eligible`, `compared`,
`fell_back_to_full`, `divergence_detected`; motivo de fallback explicito.

- Denominador: sincronizaciones confirmadas con evento, no todos los requests HTTP.
- Las transacciones revertidas y los libros pendientes de incorporacion no se cuentan.
- Comparadas + fallback = total; comparadas <= elegibles; divergencias <= comparadas.
- Persistir full despues de una comparacion correcta es el funcionamiento normal de
  shadow, no un fallback. Fallback significa que no pudo compararse el plan incremental.
- Motivos: ningun documento marcado, cambios pendientes fuera del conjunto marcado,
  o error en la prueba incremental. Los dos primeros mantienen la verificacion completa.
- Prueba provocada separada: cuatro sincronizaciones, tres elegibles, dos comparadas,
  dos fallback, una divergencia registrada. Se excluye del resumen operativo normal.

## Benchmark vigente

`node scripts/benchmarkRunner.js`: minimo tres corridas independientes con clusters
PostgreSQL nuevos, 300 documentos, cuatro clientes, doce meses y seis ventanas.
La primera ventana de 50 documentos es warm-up y se excluye del analisis.
OLS sobre las medianas sin redondear de las otras cinco ventanas frente a su punto
medio documental; R2 e IC95 de pendiente con Student-t y tres grados de libertad.
Se reportan p50/p95/p99 por ventana y de las 250 escrituras medidas por corrida.
Media de las tres pendientes e IC95 entre corridas (dos grados de libertad), sin
tratar las 750 escrituras como observaciones independientes.

El criterio puntual es crecimiento medio < 0.05 ms/documento; tambien se informa
si el limite superior del IC95 lo respalda. Una pendiente negativa NO es una mejora:
se interpreta como ausencia de crecimiento positivo detectado, con su incertidumbre.
Los IC asumen independencia y varianza constante; tiempos secuenciales pueden tener
autocorrelacion. No se extrapola a volumen productivo ni a todas las pantallas.
El estimador de dos puntos del informe anterior queda sustituido.

## Arranque y registros

El arnes reintenta solo el arranque, no repite escrituras para esconder fallos.
Configuracion: `CONTAPANAMA_QA_STARTUP_TIMEOUT_MS`, `CONTAPANAMA_QA_STARTUP_ATTEMPTS`,
`CONTAPANAMA_QA_PROBE_TIMEOUT_MS`, `CONTAPANAMA_QA_CHILD_TIMEOUT_MS` y `CONTAPANAMA_QA_TIMEOUT_MS`.
Se capturan stdout/stderr separados, incluso fallo de spawn, timeout o intento fallido.
Los fallos reales siguen siendo FAIL; una dependencia ausente no se presenta como PASS.
El control sobre el archivo local ajeno consulta solo metadatos (`lstat`), nunca bytes
ni hashes de contenido. Todas las lecturas contables de prueba son fixtures propios.

## Higiene

`saas/outputs/` queda completamente ignorado. Los artefactos anteriores se retiran
solo del indice Git y siguen presentes localmente. No se versionan logs, activaciones,
JWT, credenciales o corridas temporales. Solo se conservara evidencia agregada revisada
en `docs/evidence/ledger-premerge-2026-09-17.json`.
No se reescribio el historial Git: artefactos de commits anteriores siguen en su historia.
Antes de compartir el repositorio se debe revisar esa historia y revocar cualquier
credencial reutilizada; no se presume que ignorar archivos sanee commits anteriores.

## Resultados

- QA shadow: **22 PASS / 0 FAIL / 0 SKIPPED**, incluido build.
- PostgreSQL aislado: 95 grupos aprobados; backup/restore con igualdad de tablas,
  folios, dimensiones, saldos y bytes PDF. Suite SQL+navegador: 112 grupos aprobados.
- Playwright/Edge real: los once flujos solicitados, escritorio 1440 px y movil 390 px,
  reinicio real de API y persistencia. Ademas, cinco estados con fixtures UI separados;
  captura revisada: advertencia de filtro no verde, contador visible y sin desborde.
- Folios: 10 pruebas aprobadas, incluida equivalencia full/adaptador incremental.
- Consistencia: 8 pruebas backend y 4 de presentacion aprobadas.
- Importador: 6 unitarias y escenarios PostgreSQL de doble ejecucion, ocho concurrentes,
  rollback, fuente alterada, metadata falsificada y apply textual aprobados.
- Arnes/estadistica: 13 pruebas aprobadas tras agregar regresion de la clave del fixture.
- QA incremental final: **22 PASS / 0 FAIL / 0 SKIPPED**, incluido build,
  PostgreSQL aislado (93 grupos), SQL+navegador (110 grupos) y backup/restore.
  Las dos verificaciones de metricas shadow no corresponden al modo incremental;
  la diferencia de grupos no representa pruebas fallidas ni suites omitidas.

### Cobertura medida

| Ronda shadow | Sincronizaciones | Elegibles | Comparadas | Fallback full | Divergencias |
| --- | ---: | ---: | ---: | ---: | ---: |
| PostgreSQL sin navegador | 227 | 128 | 128 | 99 | 0 |
| PostgreSQL con navegador | 250 | 140 | 140 | 110 | 0 |

Son dos clusters independientes; no sumar las rondas como si fueran un unico historial.
La ronda con navegador compara el **56% del total** y el **100% de elegibles**.
Fallback: 109 sin documentos marcados, 1 por pendientes fuera del conjunto, 0 por error
de la prueba incremental. La divergencia y el error provocados se reportan aparte,
no como fallos espontaneos. Las metricas se leen tras concurrencia y recuperacion,
antes del respaldo, con la API detenida para fijar el corte.

### Benchmark 3 x 300

| Corrida | Pendiente OLS ms/doc | IC95 de pendiente | R2 | p50 / p95 / p99 ms |
| --- | ---: | --- | ---: | --- |
| 1 | -0.072826 | [-0.144941, -0.000711] | 0.774922 | 47.768 / 67.379 / 71.894 |
| 2 | 0.041064 | [-0.055548, 0.137677] | 0.378845 | 46.625 / 66.438 / 76.032 |
| 3 | -0.001015 | [-0.021566, 0.019535] | 0.008170 | 46.751 / 62.694 / 69.222 |

Media de pendientes: **-0.010926 ms/documento**. Interpretacion: **no se detecta
crecimiento positivo**, NO mejora por pendiente negativa. Estimacion de crecimiento
con piso cero: 0; cumple el criterio puntual <0.05.
**IC95 entre corridas: [-0.153983, 0.132131] ms/documento**. Su limite superior supera
0.05: el cumplimiento NO esta respaldado al 95% con estas tres corridas. No cambiar
el default a incremental a partir de este resultado ni extrapolar a produccion.

El primer intento anterior a estas tres corridas fallo antes de la primera medicion
por una clave del fixture menor al minimo permitido (HTTP 422). Se corrigio solo el
fixture y se agrego una prueba contra `validIdempotencyKey`; no se aflojo el validador.
No se descartaron mediciones lentas ni corridas validas para mejorar la estadistica.

## Riesgos restantes

- **CRITICO:** ninguno reproducido en el alcance revisado; no es certificacion global.
- **MEDIO:** tres corridas no respaldan el umbral con IC95; ampliar una campana fijada
  de antemano con volumen y carga representativos antes de decidir un cambio de modo.
- **MEDIO:** 44% de las sincronizaciones del escenario con navegador sigue usando full
  sin comparacion incremental; los motivos quedan visibles. Lecturas globales y full
  conservan su crecimiento con el historial, fuera del alcance de esta correccion.
- **MEDIO:** quitar outputs del HEAD no elimina credenciales de commits anteriores;
  revisar historia y rotacion antes de compartir, sin reescritura automatica.
- **ALTO para usar datos reales:** autorizacion, copia aislada, respaldo/restauracion,
  compatibilidad del importador y aprobacion CPA siguen siendo requisitos pendientes.
- **BAJO:** disponibilidad de PostgreSQL, Python/pypdf y Playwright/Edge en cada equipo.
