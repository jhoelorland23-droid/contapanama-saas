# CHANGELOG - ContaPanama SaaS

## Extractos originales y revision mensual/anual - 2026-09-14

- Nueva API /api/extractos-bancarios y pestana Extractos dentro de Conciliacion.
- PDF original privado, descarga autenticada, SHA-256 y versiones con motivo sin sobrescribir soportes.
- Saldos declarados, creditos/debitos, cantidades y continuidad entre meses, con alcance por cuenta y cliente. La coincidencia neta no oculta filas faltantes.
- Reintentos sin duplicacion y guardado atomico con auditoria; permisos, bloqueo de meses cerrados y guardas inmutables locales/SQL.
- Las lecturas usan instantanea sin escrituras ni publicacion contable. El soporte grande no se guarda en sessionStorage; un reintento tras recargar exige reseleccionar el mismo PDF.
- 72 pruebas/grupos backend, 20 frontend, 53 locales y 76 PostgreSQL; build, restauracion de 19 tablas y flujo de navegador aislado verificados.
- Activado con respaldo y conservacion de las 16 colecciones previas. No se incorporo el historial real ni se aprobaron conciliaciones. Falta vincular el auxiliar por cuenta y la revision CPA al cierre.

## Cierre con evidencia bancaria - 2026-09-14

- Verificador compartido entre conciliacion y cierre; rechaza marcas sin vinculo unico, conserva pendientes anteriores y detecta movimientos bancarios sin respaldo.
- Control conectado a mes, anio, cartera, 12 meses y PDF; filtro de cliente corregido tambien en cartera. Pagos sin datos de banco ya no desaparecen de conciliacion.
- Cerrar/reabrir requiere contador o administrador. No se admite revisar un intervalo parcial y cerrar el mes/anio completo.
- Resultado bancario conservado en la auditoria del cierre. Hallazgos sin los anteriores recortes de cuatro/cinco/ocho elementos; PDF con altura de texto calculada.
- 66 pruebas/grupos backend, 18 frontend, 46 locales y 68 PostgreSQL, build y restauracion de 18 tablas. Activado con respaldo y preservacion exacta de las 16 colecciones locales.
- Ocho excepciones historicas siguen pendientes, ahora bloquean el cierre interno. Saldos de extracto y aprobacion independiente todavia pendientes. Ver outputs/bank-closing-qa/RESULTADOS.md.

## Cuentas bancarias individuales activadas en revision - 2026-09-14

- Backend de cuentas por cliente con archivo auditado, numero normalizado e identidad inmutable; sin asignaciones automaticas del historial.
- Cuenta exacta en pagos nuevos, movimientos y conciliacion. Consultas mensuales/anuales por cuenta y PDF con numero enmascarado.
- Bitacora persistente de reintentos para cuentas, movimientos e importaciones; rechazo de claves reutilizadas con otro contenido y escritura atomica con auditoria.
- Guardas locales y SQL contra cruces de usuario/cliente/cuenta, reasignacion y destruccion de identidades/operaciones.
- Pruebas de concurrencia, fallos de guardado, conservacion de asientos/folios y restauracion de las 18 tablas.
- Interfaz de cuentas, filtros, CSV con recuperacion de solicitudes inciertas y cuenta exacta en documentos inicialmente pagados. Las cuentas archivadas no admiten pagos nuevos.
- Corregido el paquete PDF filtrado que incluia nombres de otros clientes; los enlaces mensuales/anuales conservan cliente_id y muestran la cuenta enmascarada.
- ACTIVADO con respaldo: 14 colecciones conservadas, dos nuevas vacias; sin publicacion automatica del historial. 56 pruebas/grupos backend, siete frontend, 41 locales, 63 PostgreSQL, navegador en ambos modos y build correctos. Ver outputs/bank-accounts-ui-qa/RESULTADOS.md.

## Conciliacion por cliente - 2026-09-14

- Propietario obligatorio en nuevas filas bancarias; historial anterior conservado sin asignacion automatica.
- Asignacion con rol, motivo y auditoria; guardas SQL contra reasignacion y cruce de empresas.
- Vinculacion de pagos/documentos exige mismo cliente, banco, importe y direccion; cierres bancarios se comprueban por cliente.
- Reportes consistentes por cliente y corte, con pagos y banco del periodo, pendientes anteriores y documentos sin pago separados.
- Netos del periodo etiquetados correctamente; no se certifican saldos de extracto por diferencia cero.
- Importacion CSV con Papa Parse, vista previa y rechazo atomico; exportacion protege formulas de hoja de calculo.
- Eliminados recortes de filas bancarias en pantalla/PDF y recortes de antiguedad/clientes en el paquete CPA.
- Validado con regresion, pruebas locales y PostgreSQL, restauracion, navegador y PDF de 52 filas. Activado sin alterar los datos reales. Ver outputs/reconciliation-qa/RESULTADOS.md.

## Libros por cliente - 2026-09-14

- Libros de entidad y folios internos persistentes, independientes y continuos. Se conserva la numeracion historica de cartera.
- Asignacion del historial con revision CPA, huella y reintento idempotente; lectura previa sin publicar ni alterar importes.
- Escritura atomica de documento, asiento, folio y bitacora. Rechazo de cambios, eliminaciones, huecos y propietarios incompatibles.
- Directorio de libros por cliente y trazabilidad por folio en diario, CSV y PDF mensual/anual. Los totales y encabezados del PDF identifican el mismo folio.
- Cambio de cliente de un documento resuelve el nombre de destino en servidor; conserva el asiento original y registra reverso/reemplazo en sus respectivas entidades.
- Pruebas locales, PostgreSQL real, concurrencia, fallos de disco/base de datos, restauracion y navegador. Ver outputs/entity-books-qa/RESULTADOS.md.
- Activado unicamente en revision local, con respaldo y verificacion de las 12 colecciones previas. Sin incorporacion automatica del historial real ni habilitacion productiva.

## Beta 1.0 baseline - 2026-08-12

Estado inicial documentado desde `contapanama-saas-v2-final.zip`.

### Validado en esta ronda

- Se creo una copia de trabajo en `work/contapanama-saas-beta1/saas`.
- Se instalo el frontend con `npm install`.
- Se ejecuto `npm run build` en frontend con resultado correcto.
- Se instalo el backend con `npm install`.
- Se valido sintaxis de archivos `.js` del backend con `node --check`.
- Se revisaron rutas backend y llamadas frontend.
- Se confirmo que la copia no contiene `/api/contabilidad` ni `/api/motor`.
- Se agrego `backend/server.local.js` para revision funcional sin Docker/PostgreSQL.
- Se agrego script `npm run start:local`.
- Se probo login, dashboard, clientes, transacciones, ITBMS, ISR, vencimientos y PDF diario en modo local.
- Se abrio la app en `http://localhost:5173/` para revision.

## Beta 1.1 UX operativa - 2026-08-12

### Agregado

- Nueva pantalla inicial `Centro CPA`.
- Estado de cierre mensual con porcentaje de avance.
- Prioridades del dia con vencimientos urgentes.
- KPIs de ingresos, gastos, ITBMS neto y riesgos.
- Acciones rapidas hacia clientes, diario, impuestos y reportes.
- Lista de clientes que requieren revision por omisos o falta de actividad.
- Boton `Usar demo` en login para evitar errores al escribir credenciales.

### Validado

- Build frontend correcto despues de los cambios.
- Endpoints usados por `Centro CPA` responden correctamente:
  - `/api/dashboard`
  - `/api/clientes`
  - `/api/transacciones`
  - `/api/fiscal/itbms`

### Estado tecnico observado

- Backend Express con PostgreSQL, JWT, PDFKit y rutas modulares.
- Frontend React/Vite en un solo `App.jsx`.
- Schema PostgreSQL con usuarios, clientes, transacciones, movimientos bancarios y vencimientos.
- Docker Compose disponible.
- Seed de datos disponible en `backend/db/seed.js`.

### Riesgos registrados

- No hay repositorio Git en la copia extraida; no se pudo crear commit de restauracion.
- No existe `db/migrate.js` en esta copia.
- El script `db:migrate` del backend usa `psql $DATABASE_URL -f ../database/schema.sql`.
- Frontend reporta 2 vulnerabilidades npm, una moderada y una alta.
- Backend reporta 1 vulnerabilidad npm moderada.
- Hay mojibake/encoding roto visible en README y comentarios (`ContaPanamÃ¡`, `jurÃ­dica`, etc.).
- Falta prueba con PostgreSQL activo.

### No realizado

- No se hizo deploy.
- No se publico nada.
- No se modifico el ZIP original.
- No se agregaron funciones nuevas.
- No se aplico `npm audit fix --force`.

## Beta 1.2 pagos y conciliacion - 2026-08-12

### Agregado

- Flujo de pago/cobro dentro de `Diario Contable`.
- Botones visibles para `Nuevo ingreso` y `Nuevo gasto`.
- Estado por documento: `pendiente`, `parcial`, `pagado`.
- Fecha de pago/cobro, metodo y referencia bancaria.
- Accion rapida `Pagar` en cada movimiento pendiente.
- Accion rapida `Conc.` para marcar conciliacion bancaria.
- KPIs de documentos pagados, listos para conciliar y conciliados.
- Campos persistentes en `database/schema.sql` para preparar PostgreSQL.
- Soporte en `backend/routes/transacciones.js` para guardar y actualizar pago/conciliacion.
- Soporte en `backend/server.local.js` para revision local sin PostgreSQL.
- Servidor local limitado a `127.0.0.1`.

### Validado

- `npm run build` del frontend paso correctamente.
- `node --check backend/server.local.js` paso correctamente.
- `node --check backend/routes/transacciones.js` paso correctamente.
- API local probo login, creacion de gasto pendiente, marcado como pagado y conciliacion.
- Frontend responde HTTP 200.
- Backend `/health` responde `ok`.

### Pendiente para produccion real

- Ejecutar migracion PostgreSQL en un ambiente con base de datos activa.
- Importar movimientos bancarios reales o crear pantalla dedicada para cargarlos.
- Crear conciliacion automatica por banco, fecha, monto y referencia.

## Beta 1.3 tasas ITBMS - 2026-08-12

### Agregado

- Selector de ITBMS en Diario Contable:
  - Exento / no gravado 0%.
  - General 7%.
  - Alcohol u hospedaje 10%.
  - Cigarrillo / tabaco 15%.
- Calculo automatico de ITBMS segun la tasa elegida.
- Guardado de `tasa_itbms` y `categoria_itbms` para auditoria.
- Preparacion de schema PostgreSQL y rutas backend para las nuevas tasas.

### Validado

- Build frontend correcto.
- Backend local y ruta real de transacciones pasan validacion de sintaxis.
- Prueba API con monto B/.100.00:
  - 0% = B/.0.00
  - 7% = B/.7.00
  - 10% = B/.10.00
  - 15% = B/.15.00

## Beta 1.4 desglose fiscal ITBMS - 2026-08-12

### Agregado

- Módulo Fiscal ahora muestra desglose por tasa de ITBMS.
- Desglose incluye categoria, tasa, base, debito, credito y cantidad de movimientos.
- Diario Contable muestra el porcentaje de ITBMS debajo del monto.
- Endpoint local `/api/fiscal/itbms` devuelve `desglose`.
- Ruta PostgreSQL `backend/routes/fiscal.js` preparada para devolver el mismo desglose.

### Validado

- Build frontend correcto.
- Backend local correcto.
- Rutas fiscales y de transacciones pasan validacion de sintaxis.
- Prueba API con ventas B/.100.00:
  - Exento 0% = debito B/.0.00
  - General 7% = debito B/.7.00
  - Alcohol/hospedaje 10% = debito B/.10.00
  - Tabaco 15% = debito B/.15.00

## Beta 1.5 conciliacion bancaria real - 2026-08-12

### Agregado

- Pantalla de Conciliacion permite registrar movimientos bancarios manuales.
- Panel de registros contables pendientes.
- Panel de movimientos bancarios pendientes.
- Accion `Conciliar seleccion` para emparejar una transaccion con un movimiento bancario.
- Endpoint local `/api/movimientos-bancarios`.
- Endpoint local `/api/conciliacion/match`.
- Ruta PostgreSQL `backend/routes/movimientosBancarios.js` preparada.
- `backend/server.js` registra `/api/movimientos-bancarios`.

### Validado

- Build frontend correcto.
- Backend local correcto.
- Rutas nuevas pasan validacion de sintaxis.
- Prueba API:
  - Se creo transaccion contable pendiente.
  - Se creo movimiento bancario.
  - Se emparejaron ambos.
  - La transaccion quedo conciliada.
  - El movimiento bancario quedo conciliado.
- Pendientes quedaron en cero para esa prueba.

## Beta 1.6 bancos Panama - 2026-08-12

### Agregado

- Se agrego `Banco General` a las opciones de banco.
- `Banco General` queda como primera opcion en transacciones y movimientos bancarios.
- El marcado rapido de pagado usa `Banco General` si el registro no tenia banco.
- Los datos demo del backend local ahora incluyen movimientos con `Banco General`.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- Backend local reiniciado.
- API local confirmo movimientos demo con `Banco General`.

## Beta 1.7 categorias contables - 2026-08-12

### Agregado

- Campo `Categoria contable` en el registro de ingresos y gastos.
- Categorias separadas para ingresos y gastos.
- Diario Contable muestra la categoria debajo de la descripcion.
- Vista previa de Estado de Resultados agrupa ingresos y gastos por categoria.
- Backend local guarda `categoria_contable`.
- Schema PostgreSQL preparado con `categoria_contable`.
- Ruta PostgreSQL de transacciones preparada para insertar y actualizar la categoria.
- Seed de base de datos preparado con categorias contables.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/transacciones.js` correcto.
- `node --check backend/db/seed.js` correcto.
- Backend local reiniciado.
- API local creo un gasto con `categoria_contable=banco_comisiones` y `Banco General`.

## Beta 1.8 cuentas por cobrar y pagar - 2026-08-12

### Agregado

- Centro CPA muestra `Cuentas por cobrar` y `Cuentas por pagar`.
- Diario Contable separa KPIs de `Por cobrar` y `Por pagar`.
- Backend local devuelve totales de cuentas por cobrar/pagar.
- Ruta PostgreSQL de resumen preparada con los mismos totales.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/transacciones.js` correcto.
- Backend local reiniciado.
- API local confirmo `cuentas_por_cobrar`, `cuentas_por_pagar`, `num_por_cobrar` y `num_por_pagar`.

## Beta 1.9 sugerencias de conciliacion - 2026-08-12

### Agregado

- Conciliacion Bancaria ahora puede mostrar sugerencias de emparejamiento.
- Las sugerencias comparan banco, monto, direccion del movimiento y referencia.
- Cada sugerencia tiene nivel de confianza `alta` o `media`.
- Boton `Usar` carga la seleccion para conciliar.
- Backend local y ruta PostgreSQL preparados con `sugerencias`.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/fiscal.js` correcto.
- Backend local reiniciado.
- API local creo un movimiento bancario y devolvio una sugerencia de conciliacion con confianza alta.

## Beta 1.10 controles de conciliacion - 2026-08-12

### Agregado

- La conciliacion bloquea registros ya conciliados.
- La conciliacion exige mismo banco cuando ambos registros tienen banco.
- La conciliacion exige mismo monto.
- La conciliacion exige direccion correcta: ingreso con credito bancario, gasto con debito bancario.
- Backend local y ruta PostgreSQL tienen las mismas validaciones.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/movimientosBancarios.js` correcto.
- Backend local reiniciado.
- API local rechazo correctamente una conciliacion con monto distinto.

## Beta 1.11 reportes con revision contable - 2026-08-12

### Agregado

- PDF Diario Combinado incluye categoria contable, banco y estado de pago.
- PDF Estado de Resultados agrupa ingresos y gastos por categoria.
- Reporte por cliente incluye categoria, banco y estado de pago.
- Backend local y rutas PostgreSQL preparados para los campos nuevos.

### Validado

- Build frontend correcto.
- `node --check backend/services/pdfService.js` correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/reportes.js` correcto.
- Backend local reiniciado.
- PDF Diario Combinado generado correctamente como `qa-diario-categorias.pdf`.

## Beta 1.12 importacion bancaria simple - 2026-08-12

### Agregado

- Conciliacion Bancaria tiene boton `Importar banco`.
- Permite pegar movimientos en formato CSV simple.
- Backend local acepta carga masiva en `/api/movimientos-bancarios/bulk`.
- Ruta PostgreSQL preparada con el mismo endpoint bulk.
- Si una linea no trae banco, usa `Banco General`.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/movimientosBancarios.js` correcto.
- Backend local reiniciado.
- API local importo 2 movimientos bancarios por endpoint bulk.

## Beta 1.13 diario combinado 12 meses - 2026-08-12

### Agregado

- Reportes permite elegir `Mes` o `12 meses`.
- El Diario Combinado puede generarse por año completo.
- Nuevo endpoint local `/api/reportes/diario-anual?anio=YYYY`.
- Nueva ruta PostgreSQL `/api/reportes/diario-anual?anio=YYYY`.
- El PDF anual usa enero a diciembre del año seleccionado.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/reportes.js` correcto.
- `node --check backend/services/pdfService.js` correcto.
- Backend local reiniciado.
- PDF anual generado correctamente como `qa-diario-2025-12-meses.pdf`.

## Beta 1.14 vencimientos de cobros y pagos - 2026-08-12

### Agregado

- Transacciones ahora tienen `fecha_vencimiento`.
- El formulario de ingreso/gasto permite editar vencimiento.
- Por defecto el vencimiento queda 30 dias despues de la fecha del documento.
- Diario Contable muestra si un cobro/pago esta vencido o por vencer.
- Centro CPA muestra KPIs de vencidos y proximos 7 dias.
- Cuentas por cobrar y por pagar se ordenan por vencimiento.
- Schema PostgreSQL, backend local, ruta real de transacciones y seed quedan preparados.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/transacciones.js` correcto.
- `node --check backend/db/seed.js` correcto.
- Backend local reiniciado.
- API local creo una factura pendiente con `fecha_vencimiento`.

## Beta 1.15 exportacion CSV del diario - 2026-08-12

### Agregado

- Diario Contable tiene boton `Exportar CSV`.
- El CSV incluye fecha, vencimiento, tipo, descripcion, categoria, cliente, pago, monto, ITBMS, banco, referencia y conciliacion.
- La exportacion respeta los filtros cargados en pantalla.

### Validado

- Build frontend correcto.
- `node --check backend/server.local.js` correcto.
- `node --check backend/routes/transacciones.js` correcto.

## Beta 1.16 filtros operativos del diario - 2026-08-13

### Agregado

- Diario Contable ahora tiene filtro adicional por estado operativo.
- Filtros disponibles: pendientes, pagados, vencidos, proximos 7 dias y listos para conciliar.
- El contador del Diario muestra registros visibles vs total del periodo.
- Exportar CSV usa el filtro visible actual.

### Validado

- Pendiente de validacion tecnica en esta ronda.
