const { buildJournal, trialBalance } = require('./accountingEngine');
const { journalPlan, publicJournal } = require('./journalLedger');
const { isRegisteredTransaction } = require('./transactionStatus');
const { cents, amount } = require('./paymentLedger');

// Three views of the same money can drift apart without anyone noticing:
//   documentos  – what transacciones/pagos say now;
//   libro       – what has actually been published to the immutable book;
//   reportes    – figures some screens still compute straight from documents.
// This check makes every gap explicit instead of waiting for the next write to reject it.
const account = (balance, code) => balance.cuentas.find(row => row.cuenta_codigo === code);
const byType = (balance, type) => balance.cuentas.filter(row => row.tipo_cuenta === type);
const sumCents = rows => rows.reduce((sum, row) => sum + cents(row.saldo), 0);

// Report-style totals (dashboard, estado de resultados, /resumen) work on document fields.
function documentTotals(transactions, scope = {}) {
  const rows = transactions.filter(isRegisteredTransaction).filter(tx => !scope.periodo || String(tx.periodo || String(tx.fecha).slice(0, 7)) === scope.periodo)
    .filter(tx => !scope.cliente_id || tx.cliente_id === scope.cliente_id)
    .filter(tx => !scope.anio || String(tx.fecha).startsWith(`${scope.anio}-`));
  const sum = (filter, field) => rows.filter(filter).reduce((total, tx) => total + cents(tx[field]), 0);
  return {
    ingresos: amount(sum(tx => tx.tipo === 'ingreso', 'monto')),
    gastos: amount(sum(tx => tx.tipo === 'gasto', 'monto')),
    itbms_debito: amount(sum(tx => tx.tipo === 'ingreso', 'itbms')),
    itbms_credito: amount(sum(tx => tx.tipo === 'gasto' && tx.deducible, 'itbms')),
    // Non-deductible ITBMS is expensed by the engine but excluded from report "gastos".
    itbms_no_deducible: amount(sum(tx => tx.tipo === 'gasto' && !tx.deducible, 'itbms')),
  };
}

// The same totals as the book sees them: revenue and expense accounts, tax accounts.
function ledgerTotals(entries, scope = {}) {
  const balance = trialBalance(entries, scope);
  return {
    ingresos: amount(-sumCents(byType(balance, 'ingreso'))),
    gastos: amount(sumCents(byType(balance, 'gasto'))),
    itbms_debito: amount(-cents(account(balance, '2020')?.saldo || 0)),
    itbms_credito: amount(cents(account(balance, '2021')?.saldo || 0)),
    balanceado: balance.balanceado,
  };
}

function accountDeltas(expected, stored) {
  const codes = new Set([...expected.cuentas, ...stored.cuentas].map(row => row.cuenta_codigo));
  return [...codes].sort().map(code => {
    const wanted = expected.cuentas.find(row => row.cuenta_codigo === code), actual = stored.cuentas.find(row => row.cuenta_codigo === code);
    const delta = cents(actual?.saldo || 0) - cents(wanted?.saldo || 0);
    return delta ? { cuenta_codigo: code, saldo_documentos: wanted?.saldo || 0, saldo_libro: actual?.saldo || 0, diferencia: amount(delta) } : null;
  }).filter(Boolean);
}

function ledgerConsistency(transactions, entries, scope = {}) {
  const result = { estado: 'consistente', integridad: 'verificada', pendientes: [], cuentas_divergentes: [], errores: [] };
  let pending = [];
  try {
    // What a write would have to publish right now; anything here means documentos != libro.
    pending = journalPlan(transactions, entries);
  } catch (error) {
    result.integridad = 'fallida';
    result.errores.push(error.message);
  }
  result.pendientes_fuera_del_filtro = pending.filter(entry => !matchesScope(entry, scope)).length;
  result.pendientes = pending.filter(entry => matchesScope(entry, scope)).map(entry => ({ origen_clave: entry.origen_clave, transaccion_id: entry.transaccion_id,
    cliente_id: entry.cliente_id, cliente_nombre: entry.cliente_nombre, periodo: entry.periodo,
    tipo_asiento: entry.tipo_asiento, rectifica_id: entry.rectifica_id, fecha: entry.fecha, total: entry.lineas.reduce((sum, line) => sum + Number(line.debe), 0) }));
  const published = result.integridad === 'verificada' ? publicJournal(entries, transactions, scope, true) : [];
  const expected = trialBalance(buildJournal(transactions, scope.cliente_id ? { cliente_id: scope.cliente_id } : {}), scope);
  const stored = trialBalance(published, scope);
  result.cuentas_divergentes = accountDeltas(expected, stored);
  const documentos = documentTotals(transactions, scope), libro = ledgerTotals(published, scope);
  result.totales = { documentos, libro,
    // Known semantic gap, reported so the UI can label it rather than hide it.
    reportes_vs_libro: { ingresos: amount(cents(documentos.ingresos) - cents(libro.ingresos)),
      gastos: amount(cents(documentos.gastos) - cents(libro.gastos)),
      gastos_explicados_por_itbms_no_deducible: amount(cents(libro.gastos) - cents(documentos.gastos)) === documentos.itbms_no_deducible } };
  if (result.integridad !== 'verificada') result.estado = 'integridad_fallida';
  else if (result.pendientes.length || result.cuentas_divergentes.length) result.estado = 'divergente';
  result.asientos_publicados = entries.length;
  result.documentos = transactions.filter(isRegisteredTransaction).length;
  return result;
}

module.exports = { ledgerConsistency, documentTotals, ledgerTotals };

function matchesScope(entry, scope) {
  return (!scope.cliente_id || entry.cliente_id === scope.cliente_id) &&
    (!scope.periodo || entry.periodo === scope.periodo) && (!scope.anio || entry.fecha.startsWith(`${scope.anio}-`));
}
