const assert = require('assert');
const {
  generarBalanceComprobacion,
  generarMayorCuenta,
  generarRevisionCierre,
  generarCierresClientes,
  generarAntiguedadSaldos,
  generarResumenMensualAnual,
} = require('../services/pdfService');

const startsAsPdf = buffer => buffer.slice(0, 4).toString('ascii') === '%PDF';

(async () => {
  const balance = await generarBalanceComprobacion({
    periodo: '2026-09',
    total_asientos: 1,
    total_debe: 107,
    total_haber: 107,
    diferencia: 0,
    balanceado: true,
    cuentas: [
      { cuenta_codigo: '1020', cuenta_nombre: 'Banco General', tipo_cuenta: 'activo', debe: 107, haber: 0, saldo: 107 },
      { cuenta_codigo: '4010', cuenta_nombre: 'Ventas de servicios', tipo_cuenta: 'ingreso', debe: 0, haber: 100, saldo: -100 },
      { cuenta_codigo: '2020', cuenta_nombre: 'ITBMS por pagar', tipo_cuenta: 'pasivo', debe: 0, haber: 7, saldo: -7 },
    ],
  });
  assert(startsAsPdf(balance));

  const mayor = await generarMayorCuenta({
    periodo: '2026-09',
    cuenta_codigo: '1020',
    cuenta_nombre: 'Banco General',
    debe: 107,
    haber: 0,
    saldo: 107,
    data: [
      { fecha: '2026-09-01', descripcion: 'Cobro factura', cliente_nombre: 'Cliente Demo', debe: 107, haber: 0, estado_pago: 'pagado', conciliado: true },
    ],
  });
  assert(startsAsPdf(mayor));

  const cierre = await generarRevisionCierre({
    periodo: '2026-09',
    listo_para_cierre: false,
    riesgo: 'alto',
    total_transacciones: 1,
    total_asientos: 1,
    diferencia: 0,
    cuentas_por_cobrar: 0,
    cuentas_por_pagar: 107,
    pagados_sin_conciliar: 0,
    itbms_debito: 7,
    itbms_credito: 0,
    itbms_neto: 7,
    checklist: [{ item: 'Banco conciliado', ok: false }],
    issues: [{ titulo: 'Gasto pendiente', severidad: 'alta', detalle: 'Existe saldo por pagar.', accion: 'Confirmar pago.' }],
  });
  assert(startsAsPdf(cierre));

  const cierresClientes = await generarCierresClientes({
    periodo: '2026-09',
    total_clientes: 2,
    listos: 1,
    pendientes: 1,
    riesgo_alto: 1,
    riesgo_critico: 0,
    data: [
      { cliente_nombre: 'Cliente A', ruc: '1-1-1', riesgo: 'bajo', listo_para_cierre: true, total_ingresos: 100, total_gastos: 0, issues: [] },
      { cliente_nombre: 'Cliente B', ruc: '2-2-2', riesgo: 'alto', listo_para_cierre: false, total_ingresos: 0, total_gastos: 50, issues: [{ titulo: 'Cuenta por pagar' }] },
    ],
  });
  assert(startsAsPdf(cierresClientes));

  const antiguedad = await generarAntiguedadSaldos({
    periodo: '2026-09',
    fecha_corte: '2026-09-30',
    total_pendiente: 321,
    total_por_cobrar: 107,
    total_por_pagar: 214,
    total_documentos: 2,
    buckets: {
      corriente: { total: 107, count: 1 },
      dias_1_30: { total: 214, count: 1 },
      dias_31_60: { total: 0, count: 0 },
      dias_61_90: { total: 0, count: 0 },
      mas_90: { total: 0, count: 0 },
    },
    data: [
      { fecha_vencimiento: '2026-09-30', cliente_nombre: 'Cliente A', descripcion: 'Factura pendiente', tipo: 'por_cobrar', dias_vencido: 0, total: 107, banco: 'Banco General' },
      { fecha_vencimiento: '2026-09-01', cliente_nombre: 'Cliente B', descripcion: 'Proveedor pendiente', tipo: 'por_pagar', dias_vencido: 29, total: 214, banco: 'BAC' },
    ],
  });
  assert(startsAsPdf(antiguedad));

  const resumenMensual = await generarResumenMensualAnual({
    anio: '2026',
    meses_con_movimiento: 1,
    meses_pendientes: 11,
    meses_riesgo_alto: 1,
    totales: {
      ingresos: 1000,
      gastos: 250,
      utilidad: 750,
      itbms_neto: 52.5,
    },
    data: [
      { periodo: '2026-01', ingresos: 1000, gastos: 250, utilidad: 750, itbms_neto: 52.5, cuentas_por_cobrar: 0, cuentas_por_pagar: 267.5, riesgo: 'alto', principal_pendiente: 'Gastos pendientes de pago' },
    ],
  });
  assert(startsAsPdf(resumenMensual));

  console.log('Accounting PDF tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
