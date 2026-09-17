# QA CONTABLE BETA 1 - ContaPanama SaaS

## Objetivo

Validar un ciclo contable mensual con escenarios panamenos antes de agregar facturacion electronica, OCR, IA, WhatsApp o CRM.

## Estado global

Pendiente. La matriz fue creada, pero todavia debe ejecutarse contra PostgreSQL activo.

## Escenario 1 - Empresa de servicios con ingresos gravados con ITBMS

Estado: pendiente.

Datos de entrada:
- Cliente: Servicios Profesionales Panama S.A.
- Tipo: juridica.
- RUC: 1556789-1-123456.
- Periodo: 2026-08.
- Ingreso 1: Honorarios contables, monto 1,000.00, ITBMS 70.00.
- Ingreso 2: Consultoria financiera, monto 2,500.00, ITBMS 175.00.

Pasos:
1. Crear cliente juridico.
2. Registrar ambos ingresos en agosto 2026.
3. Revisar diario contable.
4. Revisar resumen de transacciones.
5. Revisar ITBMS del periodo.
6. Generar PDF diario y PDF ITBMS.

Resultado esperado:
- Total ingresos: 3,500.00.
- ITBMS debito: 245.00.
- ITBMS credito: 0.00.
- ITBMS neto a pagar: 245.00.
- Reporte diario muestra dos asientos.
- PDF ITBMS coincide con resumen fiscal.

Riesgo si falla:
- Declaracion de ITBMS incorrecta.
- Dashboard financiero no confiable.

## Escenario 2 - Empresa con gastos deducibles y no deducibles

Estado: pendiente.

Datos de entrada:
- Cliente: Distribuidora Central S.A.
- Tipo: juridica.
- Periodo: 2026-08.
- Gasto deducible: Alquiler oficina, monto 800.00, ITBMS 56.00.
- Gasto deducible: Software contable, monto 300.00, ITBMS 21.00.
- Gasto no deducible: Multa administrativa, monto 150.00, ITBMS 0.00.

Pasos:
1. Crear cliente.
2. Registrar tres gastos.
3. Marcar solo alquiler y software como deducibles.
4. Revisar resumen.
5. Revisar ITBMS.
6. Revisar estado de resultados.

Resultado esperado:
- Total gastos: 1,250.00.
- ITBMS credito: 77.00.
- La multa no aumenta credito ITBMS.
- Estado de resultados incluye los gastos.

Riesgo si falla:
- Credito fiscal sobreestimado.
- Utilidad mensual incorrecta.

## Escenario 3 - Cliente persona natural

Estado: pendiente.

Datos de entrada:
- Cliente: Carlos Mendez.
- Tipo: natural.
- Periodo: 2026-08.
- Ingresos anuales acumulados simulados: 18,000.00.
- Gastos anuales simulados: 3,000.00.
- Renta neta esperada: 15,000.00.

Pasos:
1. Crear cliente persona natural.
2. Registrar ingresos y gastos del ano.
3. Ejecutar ISR para 2026.
4. Revisar detalle por cliente.
5. Generar reporte por cliente.

Resultado esperado:
- El calculo usa reglas de persona natural.
- La renta neta aparece por cliente.
- Reporte por cliente coincide con transacciones.

Riesgo si falla:
- ISR de persona natural incorrecto.
- Clasificacion de cliente no confiable.

## Escenario 4 - Cliente persona juridica

Estado: pendiente.

Datos de entrada:
- Cliente: Inversiones Pacifico S.A.
- Tipo: juridica.
- Periodo: 2026.
- Ingresos anuales: 120,000.00.
- Gastos anuales: 80,000.00.
- Renta neta: 40,000.00.

Pasos:
1. Crear cliente juridico.
2. Registrar ingresos y gastos del ano.
3. Ejecutar ISR para 2026.
4. Revisar calculo anual.
5. Generar estado de resultados.

Resultado esperado:
- El calculo usa regla de persona juridica.
- Renta neta: 40,000.00.
- ISR calculado de forma consistente con la formula implementada.

Riesgo si falla:
- Impuesto anual empresarial incorrecto.
- Riesgo alto en uso con clientes reales.

## Escenario 5 - Mes completo con ventas, gastos, ITBMS, conciliacion y reporte final

Estado: pendiente.

Datos de entrada:
- Cliente A: Servicios Profesionales Panama S.A.
- Cliente B: Distribuidora Central S.A.
- Periodo: 2026-08.
- Ingresos gravados: 5,000.00, ITBMS 350.00.
- Gastos deducibles: 1,500.00, ITBMS 105.00.
- Gastos no deducibles: 400.00, ITBMS 0.00.
- Banco: Banco Nacional.
- Referencias: TRF-001, TRF-002, ACH-001, ACH-002.

Pasos:
1. Crear dos clientes.
2. Registrar ingresos, gastos deducibles y gastos no deducibles.
3. Asignar banco y referencia a cada transaccion.
4. Revisar dashboard del periodo.
5. Revisar diario.
6. Revisar ITBMS.
7. Revisar conciliacion.
8. Generar PDFs:
   - Diario.
   - Estado de resultados.
   - ITBMS.
   - Reporte por cliente.

Resultado esperado:
- Ingresos: 5,000.00.
- Gastos: 1,900.00.
- Utilidad: 3,100.00.
- ITBMS debito: 350.00.
- ITBMS credito: 105.00.
- ITBMS neto: 245.00.
- Conciliacion agrupa por banco.
- PDFs coinciden con dashboard y resumen.

Riesgo si falla:
- El sistema no esta listo para Beta con datos reales simulados.

## Prueba multiusuario obligatoria

Estado: pendiente.

Datos:
- Usuario A: contador_a@example.com.
- Usuario B: contador_b@example.com.
- Cada usuario registra un cliente con RUC distinto y una transaccion.

Pasos:
1. Login usuario A.
2. Crear cliente y transaccion.
3. Login usuario B.
4. Crear cliente y transaccion.
5. Intentar acceder con usuario B a recursos del usuario A por ID.
6. Repetir inverso.

Resultado esperado:
- Cada usuario solo ve sus propios clientes, transacciones, vencimientos y reportes.
- Acceso cruzado devuelve 404 o no devuelve datos.

Riesgo si falla:
- Bloqueante para Beta.
