# Correcciones previas a reescritura

Alcance: solamente el clon de codex-ledger-integration. No se reescribio historia,
no hubo merge/push/deploy y no se modificaron reglas contables/fiscales.

## Integracion

server.local.js toma exclusivamente CONTAPANAMA_INTEGRATION_TOKEN. Sin configuracion
o con espacios responde 503; con cabecera ausente/incorrecta responde 401. Con token
explicito y propuesta sintetica aprobada responde 201. La ruta SQL ya carecia de
fallback y ahora tambien rechaza configuracion compuesta solo por espacios.
server.js valida configuracion de produccion; no se genera una clave de produccion.
El harness local genera un token aleatorio por corrida. El fixture de validacion
de entorno tambien utiliza un token aleatorio. No se imprimen los valores.

## JWT y sesiones

integrationLocal.test.js y localJournalIntegration.test.js generaban JWT_SECRET
dentro de cada arranque, invalidando el token conservado por el test. Ahora generan
una sola clave aleatoria al cargar cada corrida y la conservan al reiniciar sus APIs.
La prueba HTTP explicita inicia sesion, reutiliza ese JWT despues del reinicio,
cambia la clave para representar otra corrida y confirma el rechazo del JWT anterior.
La credencial de usuario persiste como hash; no se vuelve a ejecutar el seed.

## Timeout

processHarness.test.js mezclaba arranque de Node, captura de stdout y cancelacion
del comando en un presupuesto de 500 ms. No es un SLA funcional de ContaPanama.
Se midieron dos series nuevas de 20 procesos: p50/p95 195.17/410.60 ms y
181.90/213.73 ms. Estas mediciones dependen de la carga local; no garantizan un
tiempo maximo. El fallo previo demostro que el hijo podia superar el presupuesto.

runCaptured mantiene su comportamiento anterior salvo opt-in readyWhen. La prueba
espera la condicion de stdout listo con presupuesto de arranque configurable
(CONTAPANAMA_QA_STARTUP_TIMEOUT_MS); solo entonces arma los 500 ms de ejecucion
(CONTAPANAMA_HARNESS_EXEC_TIMEOUT_MS). No se aumento ese limite para aprobar.
Otro test demora intencionalmente 800 ms el arranque y prueba la separacion.
Tambien se verifica el timeout si nunca llega la senal; no hay espera indefinida.
Los 500 ms del test de probe estancado miden deliberadamente cancelacion, no arranque.

## Scanner

Analisis AST con el parser Babel ya instalado en frontend (npm ci alli es requisito).
Detecta fallbacks ||/??, constantes y aliases usados en comparaciones auth, claves
de firma/HMAC, bcrypt, sesiones, bearer, cookies, OAuth, API keys, URI y claves privadas.
Inspecciona tambien scripts inline HTML. No depende exclusivamente del nombre de
la constante. Los casos sin contexto suficiente son REVIEW, no falsos PASS.
Errores de parseo o presupuesto de analisis agotado requieren revision. No evalua
codigo ni tiene analisis interprocedural/cross-file completo; no certifica por si solo.
Fixtures positivos/negativos se generan en memoria; resultados solo contienen
ubicaciones y huellas, no los valores. Los fixtures simulan secretos, no claves reales.

Resultado del scan del arbol corregido: sin ERROR; REVIEW_REQUIRED. Hubo 798 marcas
conservadoras, incluidas comparaciones de enums/estado y ocho limites en scripts
minificados historicos. No se ocultan ni se convierten automaticamente en PASS.
La revision manual de fallbacks e integracion no encontro otro default operativo.
Se leyeron las 44 ubicaciones environment_fallback: hosts/URLs, proveedores mock,
vigencia JWT, rondas bcrypt, herramientas y modo full. No son credenciales.
Otros falsos positivos revisados: nombres de claves de localStorage, plantillas
vacias/variables obligatorias de Compose, mocks de sesion, marcadores de pruebas y
URI example.com utilizada solo para validar configuracion (sin conectar).
Esto NO declara auditadas integralmente todas las comparaciones minificadas.

## Pruebas dirigidas nuevas

- node --test test/demoCredentials.test.js test/securityConfiguration.test.js
  test/credentialScanner.test.js test/processHarness.test.js
  test/harnessStartupTiming.test.js test/envValidation.test.js:
  22 PASS, 0 FAIL, 1 SKIPPED (Docker Compose no instalado).
- Scanner: cinco grupos PASS, incluidos aliases, campos arbitrarios, HTML,
  fallbacks computados, placeholders realmente usados en auth y negativos.
- node test/authSecurity.test.js: PASS.
- node test/integrationLocal.test.js: PASS, persistencia despues del reinicio.
- node test/localJournalIntegration.test.js: PASS, 58 comprobaciones.
- No se ejecuto npm run qa completo, Playwright completo ni benchmark en esta fase.

## Valores historicos pendientes

Identificacion exacta sin publicar los valores. S1/S2 requieren eliminacion historica;
S3 es un fixture, no un secreto operativo, y puede normalizarse por higiene.

| ID | Ruta | Longitud | SHA-256 |
| --- | --- | ---: | --- |
| S1 | saas/backend/server.local.js | 45 | 260f82d1f3e58daec063c8c6197a8a130bbca83c5581992f040f593eebb8243b |
| S2 | saas/backend/test/integrationLocal.test.js | 37 | ee23e38332a81687bb03842b99b591c2f7e129901c5885c6309d963d96d40850 |
| S3 | saas/backend/test/envValidation.test.js | 54 | d1dd9a0fb9b978c600bfee3d0bd330a5bf1642e53bfbe88dc36c39b92f202d60 |

S1 es el fallback que acepta el endpoint; S2 es el token fijo realmente suministrado
al servidor por el antiguo harness; S3 solo comprueba longitud/distincion de variables.
Cada valor aparece en los ocho commits siguientes, en su ruta indicada:

    d9bc42fb589f6815f9a9542895c4f8776303d2af
    e2cd0eeeb106187bbbd9408547b5357ced45a444
    d3df701c1b02259e4f10b305e2ce71ad5b25d19f
    fc5b06ecf12f9234f03948b84130ab30ea1a2e0b
    d845591a5e4d5ce88bb5869382a378ab617af38e
    2668ef790a9d175ceae017e1f971c726a0c49805
    c73975db8a438c72f88fef1ea075428056936e38
    4eb947b6b22b934cecf9a8eaa245447640bcaa49

Detalle por blob/linea: saas/outputs/security-blockers/history-targets.json, excluido
de Git. La busqueda historica fue de lectura; no se ejecuto git filter-repo.
El historial sigue NO LIMPIO hasta tratar S1/S2. Tampoco se rotaron credenciales
de instalaciones existentes: su responsable debe rotarlas antes de datos reales.
