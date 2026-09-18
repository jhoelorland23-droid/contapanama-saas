# Credenciales de desarrollo y QA

No hay cuenta con password por defecto. El servidor local esta bloqueado en produccion.
Para crear un entorno sintetico vacio, el setup debe autorizar `ALLOW_DEMO_SEED=true`
y proporcionar `CONTAPANAMA_QA_PASSWORD` (minimo 32 caracteres con mayuscula y numero).
El seed SQL requiere la misma autorizacion y esta bloqueado en produccion incluso
si se solicita el seed. El administrador real se aprovisiona con `admin:ensure` y
configuracion explicita; no usar datos reales en el servidor de revision.

Los harness importan `backend/test/helpers/qaCredentials.js`: genera 32 bytes
aleatorios por proceso raiz, con prefijo de complejidad, y transmite la credencial
a los hijos por entorno. No la imprime ni la exporta al frontend. Los escenarios
de registro generan passwords independientes. El frontend siempre pide login.

Los tests de navegador que se conectan a una API ya existente (auth, draft,
periods) exigen la credencial del setup mediante entorno; no inventan una password
distinta de la que tiene ese servidor. Las pruebas que levantan su propia API
generan y comparten su credencial con ella. No configurar variables `VITE_*` con
secretos. Playwright introduce el valor desde el proceso del harness.

SQL review requiere autorizacion y password explicita antes de aprovisionar un
entorno nuevo. No almacena esta password de usuario en review.json ni la registra.
El operador conserva su credencial fuera de Git. Reabrir un entorno persistido no
resetea la password ni vuelve a ejecutar el seed. El servidor local existente puede
arrancar sin autorizar nuevamente el seed; autentica contra los hashes persistidos.

Este cambio NO rota las cuentas de instalaciones anteriores ni sus sesiones.
Su responsable debe cambiar passwords y revocar sesiones antes de usar datos reales.
Los valores antiguos siguen en commits ancestrales mientras no se autorice otra
limpieza historica. Un commit nuevo no elimina contenido de sus padres.

Validacion dirigida: `node --test test/demoCredentials.test.js test/securityConfiguration.test.js test/envValidation.test.js`.
Validacion de bundle desde frontend: `node test/credentialBundle.cjs`.
No guardar stdout sensible, configuracion, traces con login, dumps o corridas crudas
en Git. La QA completa sigue condicionada al scan historico solicitado.

## Archivos modificados en esta correccion

- `PROYECTO APP/files_extracted/saas/README.md`
- `PROYECTO APP/files_extracted/saas/backend/db/seed.js`
- `PROYECTO APP/files_extracted/saas/frontend/src/App.jsx`
- `PROYECTO APP/files_extracted/saas/frontend/src/App.jsx.bak`
- `_run_proto/iniciar.ps1`
- `iniciar-contapanama.ps1`
- `saas/LOCAL_REVIEW.md`
- `saas/README.md`
- `saas/STATUS.md`
- `saas/backend/config/demoCredentials.js`
- `saas/backend/db/reviewSeed.js`
- `saas/backend/db/seed.js`
- `saas/backend/scripts/qa.js`
- `saas/backend/scripts/scanCredentials.cjs`
- `saas/backend/scripts/sqlReview.js`
- `saas/backend/server.local.js`
- `saas/backend/test/authSecurity.test.js`
- `saas/backend/test/bankAccounts.scenario.js`
- `saas/backend/test/bankReconciliation.scenario.js`
- `saas/backend/test/bankStatements.scenario.js`
- `saas/backend/test/bankSubledger.scenario.js`
- `saas/backend/test/demoCredentials.test.js`
- `saas/backend/test/documentCorrection.scenario.js`
- `saas/backend/test/helpers/journalBenchmark.js`
- `saas/backend/test/helpers/qaCredentials.js`
- `saas/backend/test/integrationLocal.test.js`
- `saas/backend/test/journalPostgres.scenario.js`
- `saas/backend/test/legacyEntityBooks.scenario.js`
- `saas/backend/test/localJournalIntegration.test.js`
- `saas/backend/test/paymentLedger.scenario.js`
- `saas/backend/test/postgresConcurrency.scenario.js`
- `saas/backend/test/postgresIntegration.test.js`
- `saas/backend/test/securityConfiguration.test.js`
- `saas/backend/test/statementUiFixture.js`
- `saas/docs/security/DEMO-CREDENTIAL-INVENTORY.md`
- `saas/docs/security/DYNAMIC-QA-CREDENTIALS.md`
- `saas/frontend/src/App.jsx`
- `saas/frontend/test/api.test.mjs`
- `saas/frontend/test/auth.browser.cjs`
- `saas/frontend/test/credentialBundle.cjs`
- `saas/frontend/test/draft.browser.cjs`
- `saas/frontend/test/entityBooks.browser.cjs`
- `saas/frontend/test/externalCredentials.cjs`
- `saas/frontend/test/journal.browser.cjs`
- `saas/frontend/test/payments.browser.cjs`
- `saas/frontend/test/periods.browser.cjs`
