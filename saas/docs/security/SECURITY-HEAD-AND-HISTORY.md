# Saneamiento del HEAD y clasificacion historica

## Alcance

Rama `codex-ledger-integration`, base exacta `historical-revision-07`.
Sin QA completa, merge, push, deploy ni reescritura historica. No se abrio la base
privada ni se usaron registros reales como fixtures. Las lecturas de datos privados
se limitaron a metadatos ya presentes en los objetos Git que se autorizo auditar.

## Cambios del HEAD

- `server.local.js`: sin fallback JWT; error controlado y exit 1 antes de crear estado.
- `server.js`: la misma validacion de JWT explicito antes de importar la capa SQL.
- `config/validateEnv.js`: exige al menos 32 caracteres no vacios ni placeholders.
- Dos copias de `routes/portal.js`: retirado el segundo fallback JWT fijo.
- Harness locales: JWT aleatorio por ejecucion, suministrado explicitamente por entorno.
- Ambos Compose: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
  PGADMIN_DEFAULT_EMAIL y PGADMIN_DEFAULT_PASSWORD usan `${VARIABLE:?mensaje}`.
  Healthcheck toma usuario/base del entorno del contenedor, no de constantes.
- Dos lanzadores antiguos: variables PostgreSQL obligatorias antes de cualquier accion;
  la password se hereda por nombre, no se escribe en la linea de comandos.
- `.env.example`: placeholders/campos vacios. No se agrego ningun `.env`.
- Se retiraron del indice seis ZIP y dos EXE; los originales permanecen en disco.
  `.gitignore` excluye paquetes, instaladores, dumps, CSV y variantes privadas de `.env`.
- Se suprimieron metadatos privados de STATUS, auditoria historica y ADR-001,
  conservando sus conclusiones tecnicas. La evidencia anterior permanece en Git antiguo.
- No se modificaron calculos fiscales, folios, importador, consistencia ni reglas contables.

## Pruebas dirigidas nuevas

Comando en `saas/backend`:

```text
node --test test/securityConfiguration.test.js test/envValidation.test.js
node test/authSecurity.test.js
```

Resultado: **6 PASS, 0 FAIL, 1 SKIPPED** en el primer comando; autenticacion existente
**PASS** en el segundo. No son resultados de `npm run qa`.

Verificado: ausencia/vacio/clave corta/placeholder rechazados; servidor local y SQL
sin JWT terminan antes de abrir estado o BD; clave aleatoria permite inicio, login y
verificacion de firma; otra clave no verifica el JWT; no queda fallback literal en
JavaScript versionado; ambos Compose exigen variables no vacias, sin credencial default.

**SKIPPED:** `docker compose config` con/sin password. Docker y Compose no estan
instalados (tampoco en la ruta habitual de Docker Desktop). No se instalaron.
La prueba estructural no reemplaza el parser de Compose ni un arranque de contenedores.
No se cambiaron passwords de volumenes existentes; cambiar el Compose no las rota.

## Historial completo alcanzable

Se recorrieron los siete commits, 417 blobs unicos, 434 combinaciones de blob/ruta,
y 705 registros incluyendo miembros ZIP. Se decodifico UTF-8/UTF-16 cuando correspondia,
se abrieron recursivamente los ZIP en memoria y se revisaron 826 coincidencias agrupadas
en 145 contextos distintos. Los positivos de credenciales se revisaron en su contexto;
no se consultaron servicios externos para probar claves.

Commits: `historical-revision-01`, `historical-revision-02`, `historical-revision-03`, `historical-revision-04`, `historical-revision-05`, `historical-revision-06`, `historical-revision-07`.
Alcance: todos los ancestros de esta rama; no refs ajenas, reflogs ni `.claude/data/`.

Inventarios completos:

- [53 artefactos, una fila por archivo, y ZIP/EXE](HISTORY-ARTIFACTS-53.md).
- [705 registros, versiones, tamanos, commits y decisiones; positivos sin valores](history-inventory.json).

El campo `action_scope=sensitive_content_only` pide retirar contenido sensible de
versiones antiguas, NO borrar el archivo fuente entero. `!` separa miembros de ZIP.
SAFE_FIXTURE incluye codigo/referencias inocuos porque la taxonomia solicitada no
incluye SOURCE_CODE. CURATED_EVIDENCE se reserva para documentacion/evidencia revisada.

## Hallazgos confirmados

### REAL_SECRET: defaults operativos publicados

No equivale a afirmar que se encontraron credenciales privadas de produccion.
Son constantes que el codigo/configuracion aceptaba realmente, no solo muestras.

| Introduccion | Ruta | Hallazgo | Accion historica |
| --- | --- | --- | --- |
| historical-revision-01 | `_ext/saas-extension/backend/routes/portal.js:33` | Clave JWT fija por fallback | Retirar literal en versiones antiguas |
| historical-revision-01 | `PROYECTO APP/files_extracted/saas/backend/routes/portal.js:33` | Mismo fallback | Retirar literal en versiones antiguas |
| historical-revision-01 | `CONTA PANAMA APP.zip!saas-extension/backend/routes/portal.js:33` | Mismo fallback dentro del ZIP | Retirar ZIP entero |
| historical-revision-02 | `saas/backend/server.local.js:44` | Otro secreto JWT fijo; linea 45 desde historical-revision-03 | Retirar literal en versiones antiguas |
| historical-revision-01 | `PROYECTO APP/files_extracted/saas/docker-compose.yml:10,29` | Defaults PostgreSQL/pgAdmin | Retirar credenciales antiguas |
| historical-revision-02 | `saas/docker-compose.yml:10,29` | Defaults PostgreSQL/pgAdmin | Retirar credenciales antiguas |
| historical-revision-01 | `_run_proto/iniciar.ps1:23`, `iniciar-contapanama.ps1:44` | Password PostgreSQL literal en docker run | Retirar valor antiguo |
| historical-revision-01 / historical-revision-02 | Ambos `backend/.env.example` y ambos README | URI PostgreSQL con credencial default | Sustituir historicamente por placeholders |

El inventario detalla las copias comprimidas y todos los commits donde aparecen.
**REUSABLE_TOKEN:** no se encontro un token de sesion firmado reutilizable capturado;
si habia claves de firma reutilizables (clasificadas REAL_SECRET). Revocar sesiones
y rotar claves de cualquier instalacion que haya utilizado los defaults sigue pendiente.

### REAL_DATA: metadatos operativos, no expedientes contables

**27 de los 53 artefactos** contienen huellas del archivo privado, rutas de respaldo,
conteos o estado operativo de revision. Ejemplos: los tres `activation.json`, informes
RESULTADOS y checks `review data file unchanged` con huella no nula. Los otros **26**
son evidencia/fixtures de QA sin esos datos privados. Todos se proponen retirar de
historia por ser corridas crudas redundantes, no porque todos contengan secretos.

Tambien aparecian metadatos en `saas/STATUS.md`, `saas/AUDITORIA_LEDGER_2026-09-17.md`
y `saas/docs/ADR-001-motor-contable-unico.md`; el HEAD fue redactado. No se recuperaron
registros de clientes reales ni se abrieron sus respaldos. Los nombres/RUC de los
seeds y prototipos estan declarados como ejemplos; no se verifico identidad externa.

### Tokens y passwords sinteticos

Los 53 artefactos NO contienen JWT firmados ni contrasenas identificadas. Esto corrige
la sospecha inicial; no hay base para describirlos como un volcado de JWT.
Hay passwords demo/QA en seeds, formularios demo, pruebas y documentacion; cadenas de
sesion simuladas en `frontend/test/api.test.mjs`; claves fijas de harness en commits
anteriores. Se clasifican individualmente SYNTHETIC_PASSWORD o SYNTHETIC_TOKEN.
Los fixtures pueden conservarse; no son credenciales aceptables para datos reales.

No se detectaron API keys privadas OpenAI/Anthropic/Google/GitHub/Vercel, claves privadas
PEM, secretos OAuth ni cookies autenticadas en el contenido inspeccionado. Las
coincidencias restantes eran referencias a variables, generadores aleatorios, versiones
de paquetes, placeholders, elementos HTML o metadatos publicos de los ejecutables.

### Formatos sin archivos historicos

No se encontro `.env` historico distinto de `.env.example`, ni archivo CSV, PDF, log
crudo o dump PostgreSQL entre los blobs/miembros revisados. Menciones de esos archivos
en reportes no prueban su presencia en Git. Los 35 registros SQL son DDL/migraciones
y catalogos; no exportaciones de clientes con `COPY FROM stdin` o cabecera pg_dump.

## ZIP y EXE

Los seis ZIP de primer nivel y el ZIP anidado son paquetes de codigo/prototipos anteriores.
Todos entraron en `historical-revision-01` ("Linea base del proyecto"). No hay evidencia de una decision
expresa para versionarlos; una importacion masiva es una inferencia, no un hecho probado.
Duplican entre 17 y 42 miembros exactos con archivos versionados, ademas de versiones
antiguas del mismo codigo. No son necesarios para construir `saas/`. Algunos incluyen
los fallbacks/defaults descritos. Se propone retirar los seis contenedores completos.

`Claude Setup.exe`: 160329888 bytes, producto Desktop application for Claude.ai,
version 1.1.8359. `Claude Setup (1).exe`: 6942880 bytes, producto Claude, version 1.0.0.0.
Ambos tienen firma Authenticode valida de Anthropic, PBC en esta inspeccion. No son
dependencias de ContaPanama y se clasifican UNNECESSARY_BINARY.
Se leyeron metadatos PE, firma y cadenas ASCII/UTF-16; **no se ejecutaron**. Esto NO
certifica cada byte de sus payloads comprimidos. Retirarlos enteros evita publicarlos
sin necesidad de ejecutar instaladores o hacer ingenieria inversa exhaustiva.
La miniatura WEBP de 320x175 dentro del ZIP se abrio como imagen: texto de prototipo,
sin registro identificable de cliente. No quedaron miembros ZIP sin abrir.

## Propuesta de limpieza, NO ejecutada

1. Acordar la ventana y alcance: esta rama y cualquier otra ref que conserve los blobs.
   Guardar un respaldo Git offline de acceso restringido, nunca subirlo al remoto.
2. Rotar claves/passwords en instalaciones que hayan usado defaults, invalidar sesiones
   y comprobar la configuracion real con su responsable. No se hizo esa comprobacion.
3. Crear un clon independiente sin hardlinks para la reescritura; preservar esta copia.
4. Con git-filter-repo, retirar todo `saas/outputs/` y estas ocho rutas exactas:

```text
CONTA PANAMA APP.zip
PROYECTO APP/contapanama-fase4-produccion.zip
PROYECTO APP/files.zip
PROYECTO APP/files_extracted/contapanama-fase4-produccion.zip
contapanama-saas-final.zip
contapanama-saas-v2.zip
Claude Setup.exe
Claude Setup (1).exe
```

5. Aplicar un callback por ruta/blob para sustituir SOLO defaults JWT/DB y metadatos
   privados en fuentes/README/env.example/STATUS/auditoria/ADR. No reemplazar globalmente
   palabras como postgres o token ni borrar codigo funcional. No publicar un archivo
   de reemplazos que contenga los propios secretos. Conservar fixtures aislados y evidencia curada.
6. El inventario da cada version y commit afectado. Los siete commits viejos requieren
   saneamiento de sus snapshots; al reescribir historical-revision-01 cambiarian todos sus descendientes.
   El nuevo commit de saneamiento tambien cambiaria de hash por tener ancestros nuevos.
7. Comparar el arbol funcional final, revisar diferencias, repetir el scanner en TODOS
   los refs previstos para publicacion y ejecutar QA completa/Playwright/PostgreSQL/
   backup-restore solo cuando se autorice esa siguiente etapa.
8. No publicar ni hacer force-push automaticamente. Un remoto preexistente requeriria
   coordinacion, aprobacion expresa y tratamiento de clones/forks/caches externos.

## Estado de salida

- JWT corregido: PASS en pruebas dirigidas.
- Credenciales PostgreSQL/pgAdmin: PASS estructural; Docker Compose real SKIPPED.
- CURRENT_HEAD_SECURE = NO como certificacion integral: falta validacion real de Compose
  y permanecen cuentas/passwords demo deliberadas en el sistema de revision y seeds.
  Los fallbacks JWT/defaults DB solicitados SI fueron corregidos; no se amplio el alcance
  para redisenar la autenticacion demo. No usar ese modo con datos reales.
- HISTORY_CLEAN = NO: no se reescribio ningun commit.
- READY_FOR_LOCAL_MERGE = NO: aceptacion completa poscambio no ejecutada por instruccion.
- READY_FOR_REMOTE_PUSH = NO: historia con defaults y metadatos privados todavia alcanzables.

Se detiene el trabajo tras este saneamiento y su informe, sin acciones posteriores.
