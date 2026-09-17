const { dateKey, cutoffDate, periodRange, inRange } = require('./accountingPeriod');
const { isRegisteredTransaction } = require('./transactionStatus');
const { cents, amount, documentCents, paymentsFor, paymentEvents, hasPaymentLedger, fail } = require('./paymentLedger');
const { uuid } = require('./bankMovement');
const { accountLabel } = require('./bankAccount');
const { paymentBankLinks } = require('./bankEvidence');

function reconciliationScope(params = {}) {
  if (params.cliente_id && !uuid(params.cliente_id)) fail('Cliente invalido.');
  if (params.cuenta_bancaria_id && !uuid(params.cuenta_bancaria_id)) fail('Cuenta bancaria invalida.');
  if (params.periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(params.periodo)) fail('Periodo invalido.');
  if (params.anio && !/^(20\d{2}|2100)$/.test(String(params.anio))) fail('Anio invalido.');
  if (params.periodo && params.anio) fail('Seleccione un periodo mensual o anual, no ambos.');
  return { ...(params.anio ? { anio: String(params.anio) } : { periodo: params.periodo || cutoffDate({}).slice(0, 7) }),
    cliente_id: params.cliente_id || null, cuenta_bancaria_id: params.cuenta_bancaria_id || null };
}

function reconciliationReport(transactions, movements, params = {}, clients = [], accounts = []) {
  const scope = reconciliationScope(params);
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const selectedAccount = accountMap.get(scope.cuenta_bancaria_id);
  if (scope.cuenta_bancaria_id && (!selectedAccount || (scope.cliente_id && selectedAccount.cliente_id !== scope.cliente_id))) fail('Cuenta bancaria no encontrada para este cliente.', 404);
  const range = periodRange(scope), corte = cutoffDate(scope);
  const names = new Map(clients.map(c => [c.id, c.nombre]));
  const identity = row => ({ cliente_id: row.cliente_id || null,
    cuenta_bancaria_id: row.cuenta_bancaria_id || null, cuenta_nombre: accountLabel(accountMap.get(row.cuenta_bancaria_id)),
    cliente_nombre: row.cliente_id ? names.get(row.cliente_id) || row.cliente_nombre || row.cliente_id : 'Sin cliente asignado' });
  const belongs = row => !scope.cliente_id || row.cliente_id === scope.cliente_id;
  const accountBelongs = row => !scope.cuenta_bancaria_id || row.cuenta_bancaria_id === scope.cuenta_bancaria_id;
  const rows = transactions.filter(isRegisteredTransaction).filter(t => belongs(t) && dateKey(t.fecha) && dateKey(t.fecha) <= corte);
  const bankHistory = movements.filter(m => belongs(m) && accountBelongs(m) && dateKey(m.fecha) && dateKey(m.fecha) <= corte);
  const verifiedBanks = new Set();
  const pending = [], documents = [], accounting = [], banks = new Map();
  const bankFor = row => {
    const key = JSON.stringify([row.cliente_id || null, row.banco, row.cuenta_bancaria_id || null]);
    if (!banks.has(key)) banks.set(key, { ...identity(row), banco: row.banco || '', contable: 0, bancario: 0,
      num_transacciones: 0, num_movimientos: 0, num_pendientes: 0, banco_pendientes: 0 });
    return banks.get(key);
  };
  const linkedBank = paymentBankLinks(rows, bankHistory, accounts, corte);
  for (const tx of rows) {
    for (const p of paymentsFor(tx).filter(p => accountBelongs(p) && p.metodo_pago !== 'efectivo' && dateKey(p.fecha) && dateKey(p.fecha) <= corte)) {
      if (p.anulado_fecha && dateKey(p.anulado_fecha) <= corte) continue;
      const bank = linkedBank(tx, p);
      if (bank) verifiedBanks.add(bank.id);
      if (!bank) {
        const item = { ...tx, ...identity({ ...tx, cuenta_bancaria_id: p.cuenta_bancaria_id }), pago_id: p.legacy ? null : p.id, fecha: dateKey(p.fecha),
          fecha_documento: dateKey(tx.fecha), banco: p.banco, referencia_pago: p.referencia,
          total_documento: Number(p.importe), importe_documento: amount(documentCents(tx)), importe_abono: Number(p.importe),
          requiere_revision: Boolean(p.conciliado), motivo_revision: p.conciliado ? 'Vinculo sin evidencia bancaria valida al corte' : null };
        pending.push(item); bankFor(item).num_pendientes++;
      }
    }
    for (const p of paymentEvents(tx).filter(p => accountBelongs(p) && p.metodo_pago !== 'efectivo' && inRange(p.fecha, range))) {
      const group = bankFor({ ...tx, banco: p.banco, cuenta_bancaria_id: p.cuenta_bancaria_id });
      group.contable += (tx.tipo === 'ingreso' ? 1 : -1) * cents(p.importe);
      group.num_transacciones++;
      accounting.push({ ...identity({ ...tx, cuenta_bancaria_id: p.cuenta_bancaria_id }), transaccion_id: tx.id, pago_id: p.legacy ? null : p.id,
        fecha: p.fecha, descripcion: tx.descripcion, banco: p.banco, referencia: p.referencia || '',
        tipo: tx.tipo, importe: Number(p.importe), reversa: p.reversa,
        estado: p.reversa ? 'anulacion' : p.anulado_fecha && dateKey(p.anulado_fecha) <= corte ? 'anulado' : linkedBank(tx, p) ? 'vinculado' : 'pendiente' });
    }
    if (accountBelongs(tx) && !hasPaymentLedger(tx) && !paymentsFor(tx).length && tx.estado_pago !== 'parcial' && tx.metodo_pago !== 'efectivo') {
      documents.push({ ...tx, ...identity(tx), fecha: dateKey(tx.fecha), total_documento: amount(documentCents(tx)),
        requiere_revision: tx.estado_pago === 'pagado' || Boolean(tx.fecha_pago) });
    }
  }
  const periodMovements = bankHistory.filter(m => inRange(dateKey(m.fecha), range));
  for (const m of periodMovements) {
    const group = bankFor(m);
    group.bancario += (m.tipo === 'credito' ? 1 : -1) * cents(m.monto);
    group.num_movimientos++;
  }
  const movimientos_pendientes = bankHistory.filter(m => !verifiedBanks.has(m.id)).map(m => ({
    ...m, ...identity(m), requiere_revision: Boolean(m.conciliado),
    anterior_al_periodo: dateKey(m.fecha) < range.desde,
  }));
  for (const m of movimientos_pendientes) bankFor(m).banco_pendientes++;
  const resumen = [...banks.values()].map(b => ({
    ...identity(b), banco: b.banco, movimiento_neto_contable: amount(b.contable), movimiento_neto_bancario: amount(b.bancario),
    // Compatibility fields are period flows, never certified account balances.
    saldo_contable: amount(b.contable), saldo_banco: b.num_movimientos ? amount(b.bancario) : 'Sin registros bancarios',
    diferencia: b.num_movimientos ? amount(b.contable - b.bancario) : 'N/A',
    saldo_verificado: false, estado: !b.cliente_id ? 'sin_cliente' : !b.cuenta_bancaria_id ? 'sin_cuenta' : !b.num_movimientos ? 'sin_datos' :
      b.contable === b.bancario && !b.num_pendientes && !b.banco_pendientes ? 'movimientos_vinculados' : 'pendiente',
    num_transacciones: b.num_transacciones, num_movimientos: b.num_movimientos, num_pendientes: b.num_pendientes,
    banco_pendientes: b.banco_pendientes,
  })).sort((a,b) => a.cliente_nombre.localeCompare(b.cliente_nombre) || a.banco.localeCompare(b.banco) || a.cuenta_nombre.localeCompare(b.cuenta_nombre));
  const sugerencias = [];
  for (const t of [...pending, ...documents]) for (const m of movimientos_pendientes) {
    if (!t.cliente_id || t.cliente_id !== m.cliente_id || !t.cuenta_bancaria_id || t.cuenta_bancaria_id !== m.cuenta_bancaria_id || t.requiere_revision || m.requiere_revision ||
      cents(t.total_documento) !== cents(m.monto) || t.banco !== m.banco ||
      (!t.pago_id && dateKey(m.fecha) < dateKey(t.fecha)) || m.tipo !== (t.tipo === 'ingreso' ? 'credito' : 'debito')) continue;
    const a = String(t.referencia_pago || t.referencia || '').toLowerCase(), b = String(m.referencia || '').toLowerCase();
    sugerencias.push({ ...identity(t), transaccion_id: t.id, pago_id: t.pago_id || null, movimiento_id: m.id,
      banco: t.banco, monto: t.total_documento, fecha_contable: t.fecha, fecha_banco: dateKey(m.fecha),
      descripcion_contable: t.descripcion, descripcion_banco: m.descripcion, referencia: m.referencia || a,
      registra_pago: documents.includes(t), confianza: a && b && a === b ? 'alta' : 'media' });
  }
  return { periodo: scope.periodo || null, anio: scope.anio ? Number(scope.anio) : null, fecha_corte: corte,
    cliente_id: scope.cliente_id, cliente_nombre: scope.cliente_id ? names.get(scope.cliente_id) || scope.cliente_id : 'Toda la cartera',
    cuenta_bancaria_id: scope.cuenta_bancaria_id, cuenta_nombre: scope.cuenta_bancaria_id ? accountLabel(selectedAccount) : 'Todas las cuentas',
    alcance: scope.anio ? 'anual' : 'mensual', alcance_conciliacion: 'movimientos_por_cuenta', saldo_verificado: false,
    resumen, transacciones_pendientes: pending, documentos_sin_pago: documents, movimientos_pendientes, sugerencias,
    registros_contables: accounting, movimientos_periodo: periodMovements.map(m => ({ ...m, ...identity(m),
      estado_vinculo: verifiedBanks.has(m.id) ? 'vinculado' : 'pendiente' })),
    alertas: resumen.filter(r => r.estado !== 'movimientos_vinculados').map(r =>
      `${r.cliente_nombre} / ${r.banco} / ${r.cuenta_nombre}: ${r.num_pendientes} pago(s) y ${r.banco_pendientes} movimiento(s) pendientes.`) };
}

async function sqlReconciliationReport(uid, params = {}) {
  const scope = reconciliationScope(params);
  const { pool } = require('../db');
  const { attachPayments } = require('./paymentRepository');
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const clients = (await db.query('SELECT id,nombre FROM clientes WHERE usuario_id=$1', [uid])).rows;
    if (scope.cliente_id && !clients.some(c => c.id === scope.cliente_id)) fail('Cliente no encontrado.', 404);
    const transactions = await db.query('SELECT * FROM transacciones WHERE usuario_id=$1 AND fecha <= $2::date', [uid, cutoffDate(scope)]);
    const movements = await db.query('SELECT * FROM movimientos_bancarios WHERE usuario_id=$1 AND fecha <= $2::date ORDER BY fecha DESC,id', [uid, cutoffDate(scope)]);
    const accounts = (await db.query('SELECT * FROM cuentas_bancarias WHERE usuario_id=$1', [uid])).rows;
    const result = reconciliationReport(await attachPayments(transactions.rows, uid, db), movements.rows, scope, clients, accounts);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
module.exports = { reconciliationReport, sqlReconciliationReport, reconciliationScope };
