const { isRegisteredTransaction } = require('./transactionStatus');
const { dateKey, periodRange, inRange, cutoffDate } = require('./accountingPeriod');
const { paymentEvents, outstandingAt, unresolvedPayment } = require('./paymentLedger');
const { bankClosingReview } = require('./bankEvidence');
const money = value => Number(Number(value || 0).toFixed(2));
const totalWithTax = tx => money(Number(tx.monto || 0) + Number(tx.itbms || 0));
const isPaidAt = (tx, corte) => outstandingAt(tx, corte) <= 0;
const addDays = (date, days) => {
  const base = new Date(`${dateKey(date)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

const CHART_OF_ACCOUNTS = [
  { codigo: '1010', nombre: 'Caja', tipo: 'activo', naturaleza: 'deudora' },
  { codigo: '1020', nombre: 'Banco General', tipo: 'activo', naturaleza: 'deudora' },
  { codigo: '1021', nombre: 'Otros bancos', tipo: 'activo', naturaleza: 'deudora' },
  { codigo: '1030', nombre: 'Cuentas por cobrar clientes', tipo: 'activo', naturaleza: 'deudora' },
  { codigo: '2010', nombre: 'Cuentas por pagar proveedores', tipo: 'pasivo', naturaleza: 'acreedora' },
  { codigo: '2020', nombre: 'ITBMS por pagar', tipo: 'pasivo', naturaleza: 'acreedora' },
  { codigo: '2021', nombre: 'ITBMS credito fiscal', tipo: 'activo', naturaleza: 'deudora' },
  { codigo: '4010', nombre: 'Ventas de servicios', tipo: 'ingreso', naturaleza: 'acreedora' },
  { codigo: '4020', nombre: 'Honorarios profesionales', tipo: 'ingreso', naturaleza: 'acreedora' },
  { codigo: '4090', nombre: 'Otros ingresos', tipo: 'ingreso', naturaleza: 'acreedora' },
  { codigo: '5010', nombre: 'Compras e inventario', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5020', nombre: 'Alquileres', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5030', nombre: 'Servicios publicos', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5040', nombre: 'Planilla y cargas sociales', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5050', nombre: 'Honorarios profesionales recibidos', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5060', nombre: 'Transporte y combustible', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5070', nombre: 'Impuestos y tasas', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5080', nombre: 'Comisiones bancarias', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5090', nombre: 'Gastos operativos', tipo: 'gasto', naturaleza: 'deudora' },
  { codigo: '5990', nombre: 'Otros gastos', tipo: 'gasto', naturaleza: 'deudora' },
];

const byCode = Object.fromEntries(CHART_OF_ACCOUNTS.map(account => [account.codigo, account]));

const revenueAccountByCategory = {
  ventas_servicios: '4010',
  honorarios: '4020',
  otros_ingresos: '4090',
};

const expenseAccountByCategory = {
  compras_inventario: '5010',
  alquiler: '5020',
  servicios_publicos: '5030',
  planilla: '5040',
  honorarios_profesionales: '5050',
  transporte: '5060',
  impuestos_tasas: '5070',
  banco_comisiones: '5080',
  gastos_operativos: '5090',
  otros_gastos: '5990',
};

const bankAccountCode = tx => {
  if (String(tx.metodo_pago || '').toLowerCase() === 'efectivo') return '1010';
  const banco = String(tx.banco || '').toLowerCase();
  return banco.includes('general') ? '1020' : '1021';
};

const line = ({ codigo, debe = 0, haber = 0, descripcion = '' }) => {
  const account = byCode[codigo];
  return {
    cuenta_codigo: codigo,
    cuenta_nombre: account?.nombre || 'Cuenta no clasificada',
    tipo_cuenta: account?.tipo || 'sin_tipo',
    descripcion,
    debe: money(debe),
    haber: money(haber),
  };
};

function buildJournalForTransaction(tx) {
  if (!isRegisteredTransaction(tx)) throw new Error('El borrador no esta registrado en libros');
  const monto = money(tx.monto);
  const itbms = money(tx.itbms);
  const total = totalWithTax(tx);
  const descripcion = tx.descripcion || (tx.tipo === 'gasto' ? 'Gasto registrado' : 'Ingreso registrado');
  const periodo = dateKey(tx.fecha).slice(0, 7);
  const asiento = {
    id: `tx-${tx.id || `${tx.fecha}-${descripcion}`}`,
    transaccion_id: tx.id || null,
    cliente_id: tx.cliente_id || null,
    fecha: dateKey(tx.fecha),
    periodo,
    descripcion,
    cliente_nombre: tx.cliente_nombre || '',
    tipo_asiento: 'documento',
    estado_pago: 'pendiente',
    conciliado: false,
    lineas: [],
  };

  if (tx.tipo === 'ingreso') {
    const revenueCode = revenueAccountByCategory[tx.categoria_contable] || '4010';
    asiento.lineas.push(line({
      codigo: '1030',
      debe: total,
      descripcion: 'Cuenta por cobrar',
    }));
    asiento.lineas.push(line({ codigo: revenueCode, haber: monto, descripcion }));
    if (itbms > 0) asiento.lineas.push(line({ codigo: '2020', haber: itbms, descripcion: 'ITBMS debito fiscal' }));
  } else if (tx.tipo === 'gasto') {
    const expenseCode = expenseAccountByCategory[tx.categoria_contable] || '5090';
    asiento.lineas.push(line({ codigo: expenseCode, debe: tx.deducible ? monto : total, descripcion }));
    if (itbms > 0 && tx.deducible) asiento.lineas.push(line({ codigo: '2021', debe: itbms, descripcion: 'ITBMS credito fiscal' }));
    asiento.lineas.push(line({
      codigo: '2010',
      haber: total,
      descripcion: 'Cuenta por pagar',
    }));
  } else {
    throw new Error(`Tipo de transaccion no soportado: ${tx.tipo}`);
  }

  const debe = asiento.lineas.reduce((sum, item) => sum + item.debe, 0);
  const haber = asiento.lineas.reduce((sum, item) => sum + item.haber, 0);
  asiento.total_debe = money(debe);
  asiento.total_haber = money(haber);
  asiento.diferencia = money(debe - haber);
  asiento.balanceado = Math.abs(asiento.diferencia) < 0.01;
  return asiento;
}

function buildPaymentJournal(tx, payment) {
  const fecha = payment.fecha;
  if (!fecha) return null;
  const total = Math.abs(payment.importe);
  const cobro = tx.tipo === 'ingreso';
  const entry = {
    id: payment.legacy && !payment.reversa ? `pago-${tx.id}` : `pago-${payment.id}`,
    pago_id: payment.pago_id || payment.id,
    transaccion_id: tx.id || null,
    cliente_id: tx.cliente_id || null,
    fecha,
    periodo: fecha.slice(0, 7),
    tipo_asiento: `${payment.reversa ? 'reversa_' : ''}${cobro ? 'cobro' : 'pago'}`,
    descripcion: `${payment.reversa ? 'Reversa de ' : ''}${cobro ? 'Cobro' : 'Pago'}: ${tx.descripcion || tx.referencia || tx.id}`,
    cliente_nombre: tx.cliente_nombre || '',
    estado_pago: 'pagado',
    conciliado: Boolean(payment.conciliado),
    lineas: cobro ? [
      line({ codigo: bankAccountCode(payment), debe: total, descripcion: 'Cobro recibido' }),
      line({ codigo: '1030', haber: total, descripcion: 'Cancelacion de cuenta por cobrar' }),
    ] : [
      line({ codigo: '2010', debe: total, descripcion: 'Cancelacion de cuenta por pagar' }),
      line({ codigo: bankAccountCode(payment), haber: total, descripcion: 'Pago realizado' }),
    ],
    total_debe: total, total_haber: total, diferencia: 0, balanceado: true,
  };
  if (payment.reversa) entry.lineas = entry.lineas.map(item => ({ ...item, debe: item.haber, haber: item.debe }));
  return entry;
}

function buildJournal(transacciones = [], scope = {}) {
  const range = periodRange(scope);
  return transacciones
    .filter(isRegisteredTransaction)
    .filter(tx => !scope.cliente_id || tx.cliente_id === scope.cliente_id)
    .flatMap(tx => [buildJournalForTransaction(tx), ...paymentEvents(tx).map(p => buildPaymentJournal(tx, p))].filter(Boolean))
    .filter(entry => inRange(entry.fecha, range))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo_asiento === 'documento' ? 0 : 1) - (b.tipo_asiento === 'documento' ? 0 : 1) || a.id.localeCompare(b.id));
}

function trialBalance(asientos = [], scope = {}) {
  const range = periodRange(scope);
  const accounts = new Map();
  for (const asiento of asientos) {
    if (range.hasta && asiento.fecha > range.hasta) continue;
    for (const item of asiento.lineas) {
      const current = accounts.get(item.cuenta_codigo) || {
        cuenta_codigo: item.cuenta_codigo,
        cuenta_nombre: item.cuenta_nombre,
        tipo_cuenta: item.tipo_cuenta,
        debe: 0,
        haber: 0,
        saldo: 0,
        saldo_inicial: 0,
      };
      if (range.desde && asiento.fecha < range.desde) current.saldo_inicial += item.debe - item.haber;
      else {
        current.debe += item.debe;
        current.haber += item.haber;
      }
      current.saldo = current.saldo_inicial + current.debe - current.haber;
      accounts.set(item.cuenta_codigo, current);
    }
  }
  const rows = [...accounts.values()]
    .map(row => ({ ...row, saldo_inicial: money(row.saldo_inicial), debe: money(row.debe), haber: money(row.haber), saldo: money(row.saldo), saldo_final: money(row.saldo) }))
    .sort((a, b) => a.cuenta_codigo.localeCompare(b.cuenta_codigo));
  const total_debe = money(rows.reduce((sum, row) => sum + row.debe, 0));
  const total_haber = money(rows.reduce((sum, row) => sum + row.haber, 0));
  return {
    ...range,
    cuentas: rows,
    total_debe,
    total_haber,
    diferencia: money(total_debe - total_haber),
    balanceado: Math.abs(total_debe - total_haber) < 0.01,
  };
}

function generalLedger(asientos = [], scope = {}) {
  const range = periodRange(scope);
  const accounts = new Map();
  for (const asiento of asientos) {
    if (range.hasta && asiento.fecha > range.hasta) continue;
    for (const item of asiento.lineas) {
      const current = accounts.get(item.cuenta_codigo) || {
        cuenta_codigo: item.cuenta_codigo,
        cuenta_nombre: item.cuenta_nombre,
        tipo_cuenta: item.tipo_cuenta,
        naturaleza: byCode[item.cuenta_codigo]?.naturaleza || 'deudora',
        debe: 0,
        haber: 0,
        saldo: 0,
        saldo_inicial: 0,
        movimientos: [],
      };
      accounts.set(item.cuenta_codigo, current);
      if (range.desde && asiento.fecha < range.desde) {
        current.saldo_inicial += item.debe - item.haber;
        current.saldo = current.saldo_inicial + current.debe - current.haber;
        continue;
      }
      current.debe += Number(item.debe || 0);
      current.haber += Number(item.haber || 0);
      current.saldo = current.saldo_inicial + current.debe - current.haber;
      current.movimientos.push({
        asiento_id: asiento.id,
        transaccion_id: asiento.transaccion_id,
        fecha: asiento.fecha,
        periodo: asiento.periodo,
        cliente_nombre: asiento.cliente_nombre,
        estado_pago: asiento.estado_pago,
        conciliado: asiento.conciliado,
        tipo_asiento: asiento.tipo_asiento,
        descripcion: asiento.descripcion,
        descripcion_asiento: asiento.descripcion,
        descripcion_linea: item.descripcion,
        debe: money(item.debe),
        haber: money(item.haber),
        saldo: money(current.saldo),
      });
      accounts.set(item.cuenta_codigo, current);
    }
  }

  const data = [...accounts.values()]
    .map(account => ({
      ...account,
      debe: money(account.debe),
      haber: money(account.haber),
      saldo: money(account.saldo),
      saldo_inicial: money(account.saldo_inicial),
      saldo_final: money(account.saldo),
      saldo_natural: money(account.naturaleza === 'acreedora' ? -account.saldo : account.saldo),
      total_movimientos: account.movimientos.length,
    }))
    .sort((a, b) => a.cuenta_codigo.localeCompare(b.cuenta_codigo));

  const total_debe = money(data.reduce((sum, account) => sum + account.debe, 0));
  const total_haber = money(data.reduce((sum, account) => sum + account.haber, 0));
  return {
    ...range,
    total_cuentas: data.length,
    total_movimientos: data.reduce((sum, account) => sum + account.total_movimientos, 0),
    total_debe,
    total_haber,
    diferencia: money(total_debe - total_haber),
    balanceado: Math.abs(total_debe - total_haber) < 0.01,
    data,
  };
}

function accountLedger(asientos, codigo, scope = {}) {
  const account = generalLedger(asientos, scope).data.find(row => row.cuenta_codigo === codigo);
  const data = account?.movimientos || [];
  return {
    ...account,
    cuenta_codigo: codigo,
    cuenta_nombre: account?.cuenta_nombre || byCode[codigo]?.nombre || 'Cuenta no encontrada',
    saldo_inicial: account?.saldo_inicial || 0,
    debe: account?.debe || 0, haber: account?.haber || 0,
    saldo: account?.saldo || 0, saldo_final: account?.saldo || 0,
    data, total: data.length,
  };
}

function filterTransactionsByPeriod(transacciones = [], { periodo, anio, desde, hasta, cliente_id: clienteId, clienteId: clientId } = {}) {
  const targetClientId = clienteId || clientId || null;
  return transacciones.filter(tx => {
    const fecha = dateKey(tx.fecha);
    const txPeriod = tx.periodo || fecha.slice(0, 7);
    if (targetClientId && tx.cliente_id !== targetClientId) return false;
    if (periodo && txPeriod !== periodo) return false;
    if (anio && !txPeriod.startsWith(`${anio}-`)) return false;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  });
}

function closingReview(transacciones = [], asientos = buildJournal(transacciones), scope = {}, bankEvidence = null) {
  if (scope.cliente_id) {
    transacciones = transacciones.filter(tx => tx.cliente_id === scope.cliente_id);
    asientos = asientos.filter(entry => entry.cliente_id === scope.cliente_id);
  }
  const range = periodRange(scope);
  const corte = range.hasta || cutoffDate(scope);
  const history = transacciones.filter(isRegisteredTransaction).filter(tx => dateKey(tx.fecha) <= corte);
  transacciones = filterTransactionsByPeriod(transacciones, scope);
  asientos = asientos.filter(entry => inRange(entry.fecha, range));
  const borradores = transacciones.filter(tx => !isRegisteredTransaction(tx));
  transacciones = transacciones.filter(isRegisteredTransaction);
  const balance = trialBalance(asientos);
  const ingresos = transacciones.filter(tx => tx.tipo === 'ingreso');
  const gastos = transacciones.filter(tx => tx.tipo === 'gasto');
  const pendientesCobro = history.filter(tx => tx.tipo === 'ingreso' && !isPaidAt(tx, corte));
  const pendientesPago = history.filter(tx => tx.tipo === 'gasto' && !isPaidAt(tx, corte));
  const pagosPeriodo = history.flatMap(paymentEvents).filter(p => inRange(p.fecha, range));
  const pagosInvalidos = history.filter(unresolvedPayment);
  const bankReview = bankClosingReview(history, scope, bankEvidence);
  const sinCategoria = transacciones.filter(tx => !tx.categoria_contable);
  const sinCliente = transacciones.filter(tx => !tx.cliente_id && !tx.cliente_nombre);
  const sinBanco = pagosPeriodo.filter(tx => !tx.banco && String(tx.metodo_pago || '').toLowerCase() !== 'efectivo');
  const descuadrados = asientos.filter(asiento => !asiento.balanceado);
  const itbmsDebito = ingresos.reduce((sum, tx) => sum + Number(tx.itbms || 0), 0);
  const itbmsCredito = gastos.filter(tx => tx.deducible).reduce((sum, tx) => sum + Number(tx.itbms || 0), 0);

  const issues = [
    bankReview.vinculos_invalidos && {
      codigo: 'VINCULOS_BANCARIOS_INVALIDOS', severidad: 'critica',
      titulo: 'Marcas de conciliacion sin evidencia valida',
      detalle: `${bankReview.vinculos_invalidos} vinculo(s) no acreditan cuenta, cliente, importe y movimiento unico al corte.`,
      accion: 'Revisar el documento y su movimiento bancario; una marca historica no aprueba la conciliacion.',
    },
    pagosInvalidos.length && {
      codigo: 'PAGOS_SIN_SOPORTE_CONTABLE', severidad: 'critica',
      titulo: 'Pagos sin fecha valida o abonos sin importe',
      detalle: `${pagosInvalidos.length} documento(s) mantienen su saldo pendiente; no se inventaron movimientos de caja o banco.`,
      accion: 'Completar la fecha real de pago y revisar los abonos antes de emitir o cerrar libros.',
    },
    borradores.length && {
      codigo: 'BORRADORES_PENDIENTES',
      severidad: 'alta',
      titulo: 'Borradores pendientes de revision',
      detalle: `${borradores.length} borrador(es) no estan registrados en libros ni incluidos en los saldos.`,
      accion: 'Revisar y registrar o descartar los borradores antes del cierre.',
    },
    transacciones.length === 0 && asientos.length === 0 && {
      codigo: 'SIN_REGISTROS',
      severidad: 'media',
      titulo: 'Periodo sin registros contables',
      detalle: 'No hay transacciones para sustentar el cierre del periodo.',
      accion: 'Registrar movimientos o documentar formalmente que el cliente no tuvo actividad.',
    },
    descuadrados.length && {
      codigo: 'ASIENTOS_DESCUADRADOS',
      severidad: 'critica',
      titulo: 'Asientos descuadrados',
      detalle: `${descuadrados.length} asiento(s) tienen diferencia entre debe y haber.`,
      accion: 'Corregir monto, ITBMS o clasificacion antes de cerrar.',
    },
    pendientesCobro.length && {
      codigo: 'CUENTAS_POR_COBRAR',
      severidad: 'baja',
      titulo: 'Ingresos pendientes de cobro',
      detalle: `${pendientesCobro.length} factura(s) siguen como cuentas por cobrar.`,
      accion: 'Registrar cobro o mantener saldo pendiente documentado.',
    },
    pendientesPago.length && {
      codigo: 'CUENTAS_POR_PAGAR',
      severidad: 'baja',
      titulo: 'Gastos pendientes de pago',
      detalle: `${pendientesPago.length} gasto(s) siguen como cuentas por pagar.`,
      accion: 'Registrar pago o confirmar que queda pendiente al cierre.',
    },
    bankReview.pagos_pendientes && {
      codigo: 'BANCOS_SIN_CONCILIAR',
      severidad: 'alta',
      titulo: 'Pagos o cobros sin conciliacion bancaria',
      detalle: `${bankReview.pagos_pendientes} pago(s) o cobro(s) sin vinculo bancario valido al corte, incluidos pendientes anteriores.`,
      accion: 'Conciliar contra movimientos bancarios antes de emitir reportes finales.',
    },
    bankReview.movimientos_pendientes && {
      codigo: 'BANCO_SIN_REGISTRO_CONTABLE', severidad: 'alta',
      titulo: 'Movimientos bancarios sin respaldo contable',
      detalle: `${bankReview.movimientos_pendientes} movimiento(s) bancarios no tienen pago o cobro valido vinculado al corte.`,
      accion: 'Revisar las partidas bancarias, incluidas las anteriores al periodo, antes de cerrar.',
    },
    sinCategoria.length && {
      codigo: 'SIN_CATEGORIA',
      severidad: 'media',
      titulo: 'Registros sin categoria contable',
      detalle: `${sinCategoria.length} registro(s) no tienen categoria contable.`,
      accion: 'Clasificar cada registro en su cuenta correcta.',
    },
    sinCliente.length && {
      codigo: 'SIN_CLIENTE',
      severidad: 'media',
      titulo: 'Registros sin cliente',
      detalle: `${sinCliente.length} registro(s) no estan asociados a cliente o proveedor.`,
      accion: 'Vincular cliente/proveedor para trazabilidad de firma CPA.',
    },
    sinBanco.length && {
      codigo: 'SIN_BANCO',
      severidad: 'media',
      titulo: 'Pagos/cobros sin banco',
      detalle: `${sinBanco.length} registro(s) pagados no indican banco.`,
      accion: 'Completar banco o metodo de pago.',
    },
  ].filter(Boolean);

  const severityScore = issues.reduce((score, issue) => score + ({ critica: 35, alta: 20, media: 10, baja: 5 }[issue.severidad] || 0), 0);
  const ready = asientos.length > 0 && balance.balanceado && issues.filter(issue => ['critica', 'alta'].includes(issue.severidad)).length === 0;

  return {
    listo_para_cierre: ready,
    fecha_corte: corte,
    riesgo: ready ? 'bajo' : severityScore >= 45 ? 'critico' : severityScore >= 20 ? 'alto' : 'medio',
    total_transacciones: transacciones.length,
    total_borradores: borradores.length,
    total_asientos: asientos.length,
    total_lineas: asientos.reduce((sum, asiento) => sum + asiento.lineas.length, 0),
    balanceado: balance.balanceado,
    diferencia: balance.diferencia,
    cuentas_por_cobrar: money(pendientesCobro.reduce((sum, tx) => sum + outstandingAt(tx, corte), 0)),
    cuentas_por_pagar: money(pendientesPago.reduce((sum, tx) => sum + outstandingAt(tx, corte), 0)),
    pagados_sin_conciliar: bankReview.pagos_pendientes,
    control_bancario: bankReview,
    itbms_debito: money(itbmsDebito),
    itbms_credito: money(itbmsCredito),
    itbms_neto: money(itbmsDebito - itbmsCredito),
    issues,
    checklist: [
      { item: 'Borradores revisados', ok: borradores.length === 0 },
      { item: 'Partida doble balanceada', ok: balance.balanceado },
      { item: 'Sin asientos descuadrados', ok: descuadrados.length === 0 },
      { item: 'Cobros revisados', ok: pendientesCobro.length === 0 },
      { item: 'Pagos revisados', ok: pendientesPago.length === 0 },
      { item: 'Movimientos bancarios vinculados al corte', ok: bankReview.movimientos_verificados,
        estado: bankReview.estado },
      { item: 'Categorias contables completas', ok: sinCategoria.length === 0 },
      { item: 'Clientes/proveedores trazables', ok: sinCliente.length === 0 },
      { item: 'ITBMS calculado para revision', ok: Number.isFinite(itbmsDebito - itbmsCredito) },
    ],
  };
}

function journalForClient(journal, client) {
  return journal.filter(entry => client.cliente_id
    ? entry.cliente_id === client.cliente_id
    : !entry.cliente_id && (entry.cliente_nombre || 'Sin cliente') === client.cliente_nombre);
}

function closingReviewByClient(transacciones = [], clientes = [], scope = {}, journal = null, bankEvidence = null) {
  if (scope.cliente_id) {
    clientes = clientes.filter(client => client.id === scope.cliente_id);
    transacciones = transacciones.filter(tx => tx.cliente_id === scope.cliente_id);
  }
  const knownClients = new Map();
  for (const cliente of clientes) {
    knownClients.set(cliente.id, {
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      ruc: cliente.ruc || '',
      estado_cliente: cliente.estado || '',
      tipo_persona: cliente.tipo || '',
      actividad: cliente.actividad || '',
      transacciones: [],
    });
  }

  for (const tx of transacciones) {
    const key = tx.cliente_id || `sin-cliente:${tx.cliente_nombre || 'Sin cliente'}`;
    if (!knownClients.has(key)) {
      knownClients.set(key, {
        cliente_id: tx.cliente_id || null,
        cliente_nombre: tx.cliente_nombre || 'Sin cliente',
        ruc: tx.cliente_ruc || '',
        estado_cliente: '',
        tipo_persona: tx.cliente_tipo_persona || '',
        actividad: '',
        transacciones: [],
      });
    }
    knownClients.get(key).transacciones.push(tx);
  }

  const rows = [...knownClients.values()].map(item => {
    const asientos = journal ? journalForClient(journal, item) : buildJournal(item.transacciones);
    const review = closingReview(item.transacciones, asientos,
      { ...scope, cliente_id: item.cliente_id, sin_cliente: !item.cliente_id }, bankEvidence);
    item.transacciones = filterTransactionsByPeriod(item.transacciones, scope).filter(isRegisteredTransaction);
    const ingresos = item.transacciones.filter(tx => tx.tipo === 'ingreso').reduce((sum, tx) => sum + Number(tx.monto || 0), 0);
    const gastos = item.transacciones.filter(tx => tx.tipo === 'gasto').reduce((sum, tx) => sum + Number(tx.monto || 0), 0);
    return {
      cliente_id: item.cliente_id,
      cliente_nombre: item.cliente_nombre,
      ruc: item.ruc,
      estado_cliente: item.estado_cliente,
      tipo_persona: item.tipo_persona,
      actividad: item.actividad,
      total_ingresos: money(ingresos),
      total_gastos: money(gastos),
      utilidad: money(ingresos - gastos),
      ...review,
      issues: review.issues,
    };
  }).sort((a, b) => {
    const riskOrder = { critico: 0, alto: 1, medio: 2, bajo: 3 };
    return (riskOrder[a.riesgo] ?? 9) - (riskOrder[b.riesgo] ?? 9) || a.cliente_nombre.localeCompare(b.cliente_nombre);
  });

  return {
    total_clientes: rows.length,
    listos: rows.filter(row => row.listo_para_cierre).length,
    pendientes: rows.filter(row => !row.listo_para_cierre).length,
    riesgo_critico: rows.filter(row => row.riesgo === 'critico').length,
    riesgo_alto: rows.filter(row => row.riesgo === 'alto').length,
    data: rows,
  };
}

function portfolioReview(transacciones = [], clientes = [], scope = {}, journal = null, bankEvidence = null) {
  if (scope.cliente_id) {
    clientes = clientes.filter(client => client.id === scope.cliente_id);
    transacciones = transacciones.filter(tx => tx.cliente_id === scope.cliente_id);
  }
  const byClient = new Map();
  for (const cliente of clientes) {
    byClient.set(cliente.id, {
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      ruc: cliente.ruc || '',
      tipo_persona: cliente.tipo || '',
      estado_cliente: cliente.estado || '',
      actividad: cliente.actividad || '',
      transacciones: [],
    });
  }
  for (const tx of transacciones) {
    const key = tx.cliente_id || `sin-cliente:${tx.cliente_nombre || 'Sin cliente'}`;
    if (!byClient.has(key)) {
      byClient.set(key, {
        cliente_id: tx.cliente_id || null,
        cliente_nombre: tx.cliente_nombre || 'Sin cliente',
        ruc: tx.cliente_ruc || '',
        tipo_persona: tx.cliente_tipo_persona || '',
        estado_cliente: '',
        actividad: '',
        transacciones: [],
      });
    }
    byClient.get(key).transacciones.push(tx);
  }

  const rows = [...byClient.values()].map(client => {
    const review = closingReview(client.transacciones, journal ? journalForClient(journal, client) : buildJournal(client.transacciones),
      { ...scope, cliente_id: client.cliente_id, sin_cliente: !client.cliente_id }, bankEvidence);
    const cutoff = review.fecha_corte;
    const history = client.transacciones.filter(isRegisteredTransaction).filter(tx => dateKey(tx.fecha) <= cutoff);
    client.transacciones = filterTransactionsByPeriod(client.transacciones, scope).filter(isRegisteredTransaction);
    const ingresos = client.transacciones.filter(tx => tx.tipo === 'ingreso');
    const gastos = client.transacciones.filter(tx => tx.tipo === 'gasto');
    const totalIngresos = ingresos.reduce((sum, tx) => sum + Number(tx.monto || 0), 0);
    const totalGastos = gastos.reduce((sum, tx) => sum + Number(tx.monto || 0), 0);
    const itbmsDebito = ingresos.reduce((sum, tx) => sum + Number(tx.itbms || 0), 0);
    const itbmsCredito = gastos.filter(tx => tx.deducible !== false).reduce((sum, tx) => sum + Number(tx.itbms || 0), 0);
    const porCobrar = history.filter(tx => tx.tipo === 'ingreso' && !isPaidAt(tx, cutoff));
    const porPagar = history.filter(tx => tx.tipo === 'gasto' && !isPaidAt(tx, cutoff));
    const pagadas = history.flatMap(paymentEvents).filter(p => inRange(p.fecha, periodRange(scope)));
    return {
      cliente_id: client.cliente_id,
      cliente_nombre: client.cliente_nombre,
      ruc: client.ruc,
      tipo_persona: client.tipo_persona,
      estado_cliente: client.estado_cliente,
      actividad: client.actividad,
      total_transacciones: client.transacciones.length,
      total_borradores: review.total_borradores,
      ingresos_count: ingresos.length,
      gastos_count: gastos.length,
      total_ingresos: money(totalIngresos),
      total_gastos: money(totalGastos),
      utilidad: money(totalIngresos - totalGastos),
      margen: totalIngresos ? money(((totalIngresos - totalGastos) / totalIngresos) * 100) : null,
      itbms_debito: money(itbmsDebito),
      itbms_credito: money(itbmsCredito),
      itbms_neto: money(itbmsDebito - itbmsCredito),
      cuentas_por_cobrar: money(porCobrar.reduce((sum, tx) => sum + outstandingAt(tx, cutoff), 0)),
      cuentas_por_pagar: money(porPagar.reduce((sum, tx) => sum + outstandingAt(tx, cutoff), 0)),
      documentos_por_cobrar: porCobrar.length,
      documentos_por_pagar: porPagar.length,
      pagadas_count: pagadas.length,
      conciliadas_count: review.control_bancario.pagos_vinculados_periodo,
      pagadas_sin_conciliar: review.pagados_sin_conciliar,
      control_bancario: review.control_bancario,
      listo_para_cierre: review.listo_para_cierre,
      riesgo: review.riesgo,
      principal_pendiente: review.issues?.[0]?.titulo || 'Sin hallazgos',
    };
  }).sort((a, b) => {
    const riskOrder = { critico: 0, alto: 1, medio: 2, bajo: 3 };
    return (riskOrder[a.riesgo] ?? 9) - (riskOrder[b.riesgo] ?? 9) ||
      b.total_transacciones - a.total_transacciones ||
      a.cliente_nombre.localeCompare(b.cliente_nombre);
  });

  return {
    total_clientes: rows.length,
    clientes_con_movimiento: rows.filter(row => row.total_transacciones > 0).length,
    listos: rows.filter(row => row.listo_para_cierre).length,
    pendientes: rows.filter(row => !row.listo_para_cierre).length,
    riesgo_critico: rows.filter(row => row.riesgo === 'critico').length,
    riesgo_alto: rows.filter(row => row.riesgo === 'alto').length,
    total_ingresos: money(rows.reduce((sum, row) => sum + row.total_ingresos, 0)),
    total_gastos: money(rows.reduce((sum, row) => sum + row.total_gastos, 0)),
    utilidad: money(rows.reduce((sum, row) => sum + row.utilidad, 0)),
    itbms_neto: money(rows.reduce((sum, row) => sum + row.itbms_neto, 0)),
    cuentas_por_cobrar: money(rows.reduce((sum, row) => sum + row.cuentas_por_cobrar, 0)),
    cuentas_por_pagar: money(rows.reduce((sum, row) => sum + row.cuentas_por_pagar, 0)),
    pagadas_sin_conciliar: rows.reduce((sum, row) => sum + row.pagadas_sin_conciliar, 0),
    data: rows,
  };
}

function agingReport(transacciones = [], scope = {}) {
  const tipo = scope.tipo || 'todos';
  const corte = cutoffDate(scope);
  const bucketTemplate = {
    corriente: { label: 'Corriente', total: 0, count: 0 },
    dias_1_30: { label: '1-30 dias', total: 0, count: 0 },
    dias_31_60: { label: '31-60 dias', total: 0, count: 0 },
    dias_61_90: { label: '61-90 dias', total: 0, count: 0 },
    mas_90: { label: 'Mas de 90 dias', total: 0, count: 0 },
  };
  const rows = transacciones
    .filter(isRegisteredTransaction)
    .filter(tx => dateKey(tx.fecha) && dateKey(tx.fecha) <= corte && !isPaidAt(tx, corte))
    .filter(tx => !scope.cliente_id || tx.cliente_id === scope.cliente_id)
    .filter(tx => tipo === 'todos' || (tipo === 'por_cobrar' && tx.tipo === 'ingreso') || (tipo === 'por_pagar' && tx.tipo === 'gasto'))
    .map(tx => {
      const vencimiento = dateKey(tx.fecha_vencimiento) || addDays(tx.fecha, 30);
      const dias = Math.floor((new Date(`${corte}T00:00:00Z`) - new Date(`${vencimiento}T00:00:00Z`)) / 86400000);
      const bucket = dias <= 0 ? 'corriente'
        : dias <= 30 ? 'dias_1_30'
          : dias <= 60 ? 'dias_31_60'
            : dias <= 90 ? 'dias_61_90'
              : 'mas_90';
      return {
        transaccion_id: tx.id || null,
        tipo: tx.tipo === 'ingreso' ? 'por_cobrar' : 'por_pagar',
        fecha: dateKey(tx.fecha),
        fecha_vencimiento: vencimiento,
        dias_vencido: Math.max(0, dias),
        bucket,
        cliente_id: tx.cliente_id || null,
        cliente_nombre: tx.cliente_nombre || 'Sin cliente',
        descripcion: tx.descripcion || '',
        monto: money(tx.monto),
        itbms: money(tx.itbms),
        total_documento: totalWithTax(tx),
        total_pagado: money(totalWithTax(tx) - outstandingAt(tx, corte)),
        total: outstandingAt(tx, corte),
        banco: tx.banco || '',
        referencia: tx.referencia_pago || tx.referencia || '',
      };
    })
    .sort((a, b) => b.dias_vencido - a.dias_vencido || b.total - a.total);

  const buckets = JSON.parse(JSON.stringify(bucketTemplate));
  for (const row of rows) {
    buckets[row.bucket].total += row.total;
    buckets[row.bucket].count += 1;
  }
  for (const bucket of Object.values(buckets)) {
    bucket.total = money(bucket.total);
  }

  const porCobrar = rows.filter(row => row.tipo === 'por_cobrar');
  const porPagar = rows.filter(row => row.tipo === 'por_pagar');
  return {
    fecha_corte: corte,
    tipo,
    total_pendiente: money(rows.reduce((sum, row) => sum + row.total, 0)),
    total_por_cobrar: money(porCobrar.reduce((sum, row) => sum + row.total, 0)),
    total_por_pagar: money(porPagar.reduce((sum, row) => sum + row.total, 0)),
    total_documentos: rows.length,
    buckets,
    data: rows,
  };
}

function monthlyAccountingSummary(transacciones = [], { anio = String(new Date().getFullYear()), journal = null, bankEvidence = null, cliente_id = null } = {}) {
  if (cliente_id) {
    transacciones = transacciones.filter(tx => tx.cliente_id === cliente_id);
    if (journal) journal = journal.filter(entry => entry.cliente_id === cliente_id);
  }
  const year = String(anio || new Date().getFullYear()).slice(0, 4);
  const months = Array.from({ length: 12 }, (_item, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      periodo: `${year}-${month}`,
      mes: month,
      ingresos: 0,
      gastos: 0,
      utilidad: 0,
      itbms_debito: 0,
      itbms_credito: 0,
      itbms_neto: 0,
      cuentas_por_cobrar: 0,
      cuentas_por_pagar: 0,
      total_transacciones: 0,
      total_asientos: 0,
      balanceado: true,
      diferencia: 0,
      listo_para_cierre: false,
      riesgo: 'medio',
      principal_pendiente: 'Periodo sin registros contables',
    };
  });

  for (const row of months) {
    const monthTransactions = filterTransactionsByPeriod(transacciones, { periodo: row.periodo });
    const registered = monthTransactions.filter(isRegisteredTransaction);
    const asientos = journal ? journal.filter(entry => inRange(entry.fecha, periodRange({ periodo: row.periodo })))
      : buildJournal(transacciones, { periodo: row.periodo });
    const review = closingReview(transacciones, asientos, { periodo: row.periodo, cliente_id }, bankEvidence);
    const ingresos = registered
      .filter(tx => tx.tipo === 'ingreso')
      .reduce((sum, tx) => sum + Number(tx.monto || 0), 0);
    const gastos = registered
      .filter(tx => tx.tipo === 'gasto')
      .reduce((sum, tx) => sum + Number(tx.monto || 0), 0);

    row.ingresos = money(ingresos);
    row.gastos = money(gastos);
    row.utilidad = money(ingresos - gastos);
    row.itbms_debito = review.itbms_debito;
    row.itbms_credito = review.itbms_credito;
    row.itbms_neto = review.itbms_neto;
    row.cuentas_por_cobrar = review.cuentas_por_cobrar;
    row.cuentas_por_pagar = review.cuentas_por_pagar;
    row.total_transacciones = review.total_transacciones;
    row.total_borradores = review.total_borradores;
    row.total_asientos = review.total_asientos;
    row.balanceado = review.balanceado;
    row.diferencia = review.diferencia;
    row.listo_para_cierre = review.listo_para_cierre;
    row.riesgo = review.riesgo;
    row.control_bancario = review.control_bancario;
    row.principal_pendiente = review.issues?.[0]?.titulo || 'Sin hallazgos';
  }

  const totals = months.reduce((acc, row) => {
    acc.ingresos += row.ingresos;
    acc.gastos += row.gastos;
    acc.utilidad += row.utilidad;
    acc.itbms_debito += row.itbms_debito;
    acc.itbms_credito += row.itbms_credito;
    acc.itbms_neto += row.itbms_neto;
    acc.cuentas_por_cobrar = row.cuentas_por_cobrar;
    acc.cuentas_por_pagar = row.cuentas_por_pagar;
    acc.total_transacciones += row.total_transacciones;
    acc.total_asientos += row.total_asientos;
    return acc;
  }, {
    ingresos: 0,
    gastos: 0,
    utilidad: 0,
    itbms_debito: 0,
    itbms_credito: 0,
    itbms_neto: 0,
    cuentas_por_cobrar: 0,
    cuentas_por_pagar: 0,
    total_transacciones: 0,
    total_asientos: 0,
  });

  for (const key of ['ingresos', 'gastos', 'utilidad', 'itbms_debito', 'itbms_credito', 'itbms_neto', 'cuentas_por_cobrar', 'cuentas_por_pagar']) {
    totals[key] = money(totals[key]);
  }

  return {
    anio: year,
    total_meses: months.length,
    meses_con_movimiento: months.filter(row => row.total_asientos > 0).length,
    fecha_corte: `${year}-12-31`,
    meses_listos: months.filter(row => row.listo_para_cierre).length,
    meses_pendientes: months.filter(row => !row.listo_para_cierre).length,
    meses_riesgo_alto: months.filter(row => ['alto', 'critico'].includes(row.riesgo)).length,
    totales: totals,
    data: months,
  };
}

module.exports = {
  CHART_OF_ACCOUNTS,
  buildJournalForTransaction,
  buildJournal,
  trialBalance,
  generalLedger,
  accountLedger,
  filterTransactionsByPeriod,
  closingReview,
  closingReviewByClient,
  portfolioReview,
  agingReport,
  monthlyAccountingSummary,
};
