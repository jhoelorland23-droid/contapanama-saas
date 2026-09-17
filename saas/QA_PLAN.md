# QA PLAN - ContaPanama SaaS Beta 1.0

## Objetivo

Validar que ContaPanama puede soportar una ronda Beta con datos reales simulados antes de construir funciones nuevas.

## Prioridad

1. Integridad contable.
2. Aislamiento multiusuario.
3. Exactitud fiscal.
4. Reportes PDF.
5. Flujo mensual completo.
6. Seguridad basica.

## Matriz de QA tecnico

| Area | Prueba | Resultado esperado | Estado |
| --- | --- | --- | --- |
| Backend | Instalar dependencias | `npm install` termina sin error | Aprobado |
| Backend | Sintaxis JS | `node --check` sin errores sobre `.js` | Aprobado |
| Frontend | Instalar dependencias | `npm install` termina sin error | Aprobado |
| Frontend | Build produccion | `npm run build` termina sin error | Aprobado |
| DB | Ejecutar schema | Tablas creadas en PostgreSQL | Pendiente |
| DB | Ejecutar seed | Usuario, clientes y transacciones de prueba creados | Pendiente |
| API | `/health` | Devuelve status ok con DB activa | Pendiente |
| Auth | Login admin | Devuelve token y usuario | Pendiente |
| Auth | Ruta sin token | Devuelve 401 | Pendiente |
| Rutas | Llamadas frontend vs backend | Todas las llamadas existen en backend | Parcial |
| Seguridad | Aislamiento usuario A/B | Usuario A no ve datos de usuario B | Pendiente |
| Reportes | PDFs | Descarga archivos PDF validos | Pendiente |

## Matriz funcional

| Modulo | Pruebas minimas | Riesgo si falla | Estado |
| --- | --- | --- | --- |
| Clientes | Crear, listar, editar, eliminar, buscar, filtrar por estado/tipo | Datos maestros incorrectos | Pendiente |
| Diario contable | Crear ingreso/gasto, filtrar por periodo, generar resumen | Estados financieros incorrectos | Pendiente |
| ITBMS | Debito por ventas, credito por gastos deducibles, saldo neto | Declaracion fiscal incorrecta | Pendiente |
| ISR | Persona natural y juridica con datos anuales | Calculo de renta incorrecto | Pendiente |
| Conciliacion | Transacciones por banco y periodo | Control bancario insuficiente | Pendiente |
| Reportes PDF | Diario, estado de resultados, ITBMS, cliente | Entregables no confiables | Pendiente |
| Vencimientos | Crear, completar y eliminar alertas | Obligaciones omitidas | Pendiente |
| Dashboard | KPIs por periodo | Decision gerencial incorrecta | Pendiente |

## Hallazgos que requieren atencion

### H1 - Motor contable real distinto al esperado

No existe `/api/contabilidad` en esta copia. El frontend usa `/api/transacciones` como diario contable y `/api/fiscal` para impuestos.

Impacto: alto. La documentacion y futuras instrucciones deben alinearse con el codigo real.

### H2 - Migracion no consolidada en `db/migrate.js`

No existe `backend/db/migrate.js`; el script actual usa `psql` directamente.

Impacto: medio. Puede funcionar, pero no coincide con la expectativa previa de migraciones Node.

### H3 - Encoding roto

Hay mojibake visible en README, comentarios y algunos valores esperados como `jurÃ­dica`.

Impacto: medio. Puede afectar UX, validaciones y datos si el valor real esperado no coincide con lo que el usuario escribe.

### H4 - Seguridad por rol incompleta

Existe `requireRole`, pero no se observo uso sistematico en rutas sensibles.

Impacto: medio. El aislamiento por usuario existe, pero permisos por rol requieren validacion.

### H5 - Vulnerabilidades npm pendientes

Frontend: 2 vulnerabilidades. Backend: 1 vulnerabilidad.

Impacto: medio. No aplicar correccion automatica sin revisar cambios de version.

## Criterio para aprobar Beta 1.0

Beta 1.0 puede avanzar a prueba con datos reales simulados solo si:

- PostgreSQL levanta correctamente.
- Schema y seed corren sin errores.
- Login funciona.
- Un flujo mensual completo produce KPIs y PDFs correctos.
- Dos usuarios no pueden ver datos entre si.
- ITBMS e ISR coinciden con calculos esperados en la matriz contable.
