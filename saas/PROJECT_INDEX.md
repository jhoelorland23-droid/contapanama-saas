# PROJECT INDEX - ContaPanama SaaS

## Ruta de trabajo

`work/contapanama-saas-beta1/saas`

## Estado por carpeta

| Ruta | Tipo | Estado | Descripcion |
| --- | --- | --- | --- |
| `backend/` | Backend | Activo | API Express, auth, rutas, servicios PDF y conexion PostgreSQL. |
| `backend/server.js` | Backend | Activo | Registra middleware, health, dashboard y rutas `/api/*`. |
| `backend/server.local.js` | Backend local | Activo para revision | Servidor sin PostgreSQL para revisar la app en `localhost` cuando Docker/DB no estan disponibles. |
| `backend/routes/auth.js` | Backend | Activo | Registro, login, usuario actual y cambio de password. |
| `backend/routes/clientes.js` | Backend | Activo | CRUD clientes con filtro por usuario. |
| `backend/routes/transacciones.js` | Backend | Activo | Diario contable operativo, resumen, evolucion y CRUD de transacciones. |
| `backend/routes/fiscal.js` | Backend | Activo | ITBMS, ISR, conciliacion y calendario fiscal. |
| `backend/routes/reportes.js` | Backend | Activo | Endpoints PDF para diario, estado de resultados, ITBMS y cliente. |
| `backend/routes/bankStatements.js` | Backend | Activo en revision | Extractos por mes/cuenta, versiones, soporte original y descarga autenticada. |
| `backend/services/bankStatement.js` | Backend | Activo en revision | Validacion, integridad del original, comparacion y continuidad mensual/anual. |
| `backend/routes/vencimientos.js` | Backend | Activo | Alertas y obligaciones. |
| `backend/services/pdfService.js` | Backend | Activo | Generacion PDF con PDFKit. |
| `backend/db/index.js` | Backend | Activo | Pool PostgreSQL y prueba de conexion. |
| `backend/db/seed.js` | Backend | Activo para QA | Datos iniciales de prueba. |
| `frontend/` | Frontend | Activo | Aplicacion React/Vite. |
| `frontend/src/App.jsx` | Frontend | Activo / Riesgo mantenimiento | Navegacion y gran parte de la UI siguen concentradas en un archivo grande. |
| `frontend/src/BankStatements.jsx` | Frontend | Activo en revision | Directorio mensual/anual y registro/correccion del extracto. |
| `frontend/src/main.jsx` | Frontend | Activo | Entrada React. |
| `database/schema.sql` | Base de datos | Activo | Schema PostgreSQL, indices y triggers. |
| `docker-compose.yml` | Infra local | Activo | PostgreSQL y servicios locales segun README. |
| `README.md` | Documentacion | Activo / Requiere correccion encoding | Guia de instalacion y endpoints. |
| `LOCAL_REVIEW.md` | Documentacion | Activo | Instrucciones para revisar la app localmente. |

## Motor contable observado

Estado vigente: `/api/contabilidad` contiene el motor de partida doble, libro publicado, folios por entidad, mayor, balance y revision/cierre. El historial anterior requiere incorporacion CPA explicita.

El flujo contable activo esta compuesto por:

- Captura y diario: `backend/routes/transacciones.js`
- Resumen financiero: `/api/transacciones/resumen` y `/api/dashboard`
- Impuestos: `backend/routes/fiscal.js`
- Reportes: `backend/routes/reportes.js`
- Libro y cierres: `backend/routes/contabilidad.js`
- Extractos: `backend/routes/bankStatements.js`; originales no equivalen a una conciliacion aprobada.

## Endpoints principales

| Endpoint | Estado | Uso |
| --- | --- | --- |
| `GET /health` | Activo | Salud API y DB. |
| `POST /api/auth/register` | Activo | Registro. |
| `POST /api/auth/login` | Activo | Login. |
| `GET /api/auth/me` | Activo | Sesion actual. |
| `GET /api/dashboard` | Activo | KPIs periodo. |
| `/api/clientes` | Activo | CRUD clientes. |
| `/api/transacciones` | Activo | CRUD diario. |
| `/api/fiscal/itbms` | Activo | Calculo ITBMS. |
| `/api/fiscal/renta` | Activo | Calculo ISR. |
| `/api/fiscal/conciliacion` | Activo | Conciliacion basica. |
| `/api/reportes/*` | Activo | PDFs. |
| `/api/vencimientos` | Activo | Alertas. |

## No encontrado

- `backend/db/migrate.js`
- `/api/contabilidad`
- `/api/motor`
- Tests automatizados
- Configuracion CI
- CHANGELOG previo
- STATUS previo

## Archivos que no deben usarse como base para nuevas funciones sin QA

- `frontend/src/App.jsx`: primero requiere pruebas de regresion; cualquier cambio amplio puede romper varias vistas.
- `backend/routes/fiscal.js`: requiere validacion contable/fiscal antes de extender logica.
- `backend/routes/reportes.js` y `backend/services/pdfService.js`: requieren comparacion visual y numerica de PDFs.
- `database/schema.sql`: no modificar sin plan de migracion versionado.
