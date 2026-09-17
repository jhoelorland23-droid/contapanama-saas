const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prepareBankAccount, assertAccountOwner, assertAccountMatch, documentAccountId, bankOperation, operationKey } = require('../services/bankAccount');
const { assertLocalBankIntegrity } = require('../services/localBankIntegrity');
const { reconciliationReport } = require('../services/reconciliationReport');
const { preparePayment, samePayment } = require('../services/paymentLedger');
const { buildJournal } = require('../services/accountingEngine');
const { journalPlan } = require('../services/journalLedger');

const uid = randomUUID(), clientId = randomUUID();
const account = { id: randomUUID(), usuario_id: uid, cliente_id: clientId, nombre: 'Principal',
  banco: 'Banco General', numero: '123456789012', tipo: 'corriente', moneda: 'USD', activa: true };
const second = { ...account, id: randomUUID(), numero: '432109876543', nombre: 'Reserva' };
const tx = { id: randomUUID(), usuario_id: uid, cliente_id: clientId, fecha: '2042-01-01', tipo: 'ingreso', descripcion: 'QA',
  monto: 100, itbms: 0, estado_pago: 'pagado', fecha_pago: '2042-01-02', metodo_pago: 'transferencia', banco: account.banco };

test('bank account validation rejects malformed identity instead of coercing it', () => {
  assert.equal(prepareBankAccount({ ...account, numero: '12-34 56' }).numero, '123456');
  for (const value of [null, [], {}, { ...account, banco: {} }, { ...account, nombre: 12 },
    { ...account, numero: 1234 }, { ...account, numero: '123' }, { ...account, moneda: 'EUR' },
    { ...account, tipo: 'credito' }, { ...account, cliente_id: '' }]) assert.throws(() => prepareBankAccount(value), { status: 422 });
  for (const key of [null, '', 'short', 'a'.repeat(101)]) assert.throws(() => operationKey(key), { status: 422 });
});

test('ownership, archived status and exact account matching are independent controls', () => {
  assert.throws(() => assertAccountOwner(null, tx), { status: 404 });
  assert.throws(() => assertAccountOwner(account, { ...tx, cliente_id: randomUUID() }), /otro cliente/);
  assert.throws(() => assertAccountOwner(account, { ...tx, banco: 'BAC' }), /banco/);
  assert.throws(() => assertAccountOwner({ ...account, activa: false }, tx), /archivada/);
  assert.doesNotThrow(() => assertAccountOwner({ ...account, activa: false }, tx, false));
  assert.throws(() => assertAccountMatch({}, {}), /cuenta exacta/);
  assert.throws(() => assertAccountMatch({ cuenta_bancaria_id: account.id }, { cuenta_bancaria_id: second.id }), /otra cuenta/);
});

test('initial bank settlement needs an exact account; unpaid and cash documents do not invent one', () => {
  assert.throws(() => documentAccountId(tx), /cuenta exacta/);
  assert.throws(() => documentAccountId({ ...tx, cuenta_bancaria_id: 'bad' }), { status: 422 });
  assert.throws(() => documentAccountId({ ...tx, metodo_pago: 'efectivo', cuenta_bancaria_id: account.id }), /efectivo/);
  assert.equal(documentAccountId({ ...tx, cuenta_bancaria_id: account.id }), account.id);
  assert.equal(documentAccountId({ ...tx, metodo_pago: 'efectivo' }), null);
  assert.equal(documentAccountId({ ...tx, estado_pago: 'pendiente', fecha_pago: null }), null);
});

test('idempotent bank replay is bound to type, ordered payload and exact saved response', async () => {
  const saved = new Map();
  const db = { getOperation: key => saved.get(key), saveOperation: (key, tipo, contenido_hash, resultado_json) => saved.set(key, { tipo, contenido_hash, resultado_json: structuredClone(resultado_json) }) };
  const key = randomUUID(), payload = [{ monto: 10 }, { monto: 20 }];
  const first = await bankOperation(db, key, 'importacion', payload, async () => [{ id: 'original' }]);
  const replay = await bankOperation(db, key, 'importacion', payload, async () => { throw new Error('must not write'); });
  assert.deepEqual(first.result, replay.result); assert.equal(replay.replay, true);
  await assert.rejects(bankOperation(db, key, 'movimiento', payload, () => null), { status: 409 });
  await assert.rejects(bankOperation(db, key, 'importacion', payload.toReversed(), () => null), { status: 409 });
  const failingKey = randomUUID();
  await assert.rejects(bankOperation(db, failingKey, 'importacion', payload, async () => { throw new Error('failed'); }), /failed/);
  assert(!saved.has(failingKey));
});

test('same-bank account scopes and unassigned history never merge or invent reconciliation', () => {
  const clients = [{ id: clientId, nombre: 'QA' }];
  const movement = { id: randomUUID(), cliente_id: clientId, cuenta_bancaria_id: second.id, fecha: '2042-01-02', monto: 100, banco: account.banco, tipo: 'credito' };
  const assigned = { ...tx, cuenta_bancaria_id: account.id };
  const all = reconciliationReport([assigned, { ...tx, id: randomUUID() }], [movement], { anio: 2042 }, clients, [account, second]);
  assert.equal(all.resumen.length, 3); assert.equal(all.sugerencias.length, 0);
  assert(all.resumen.some(r => r.estado === 'sin_cuenta'));
  const scoped = reconciliationReport([assigned], [movement], { anio: 2042, cuenta_bancaria_id: second.id }, clients, [account, second]);
  assert.equal(scoped.registros_contables.length, 0); assert.equal(scoped.movimientos_periodo.length, 1);
  const wrongLink = reconciliationReport([{ ...assigned, conciliado: true }], [{ ...movement, conciliado: true, transaccion_id: tx.id }],
    { anio: 2042 }, clients, [account, second]);
  assert.equal(wrongLink.transacciones_pendientes.length, 1);
  assert.equal(wrongLink.movimientos_pendientes.length, 1);
  assert.equal(wrongLink.saldo_verificado, false);
});

test('account metadata does not change posted journal hashes or source keys', () => {
  const originals = journalPlan([tx]);
  assert.equal(journalPlan([{ ...tx, cuenta_bancaria_id: account.id }], originals).length, 0);
  const payment = { id: tx.id, transaccion_id: tx.id, importe: 100, fecha: tx.fecha_pago, banco: tx.banco,
    metodo_pago: tx.metodo_pago, conciliado: false, cuenta_bancaria_id: account.id };
  assert.deepEqual(buildJournal([tx]), buildJournal([{ ...tx, pagos: [payment] }]));
  assert.equal(journalPlan([{ ...tx, pagos: [payment] }], originals).length, 0);
});

test('payment replay cannot move to another account and cash rejects bank metadata', () => {
  const body = { importe: 10, fecha: tx.fecha, metodo_pago: 'transferencia', banco: account.banco, cuenta_bancaria_id: account.id, idempotencia: randomUUID() };
  const payment = preparePayment({ ...tx, estado_pago: 'pendiente', fecha_pago: null }, body, randomUUID());
  assert(samePayment(payment, body));
  assert(!samePayment(payment, { ...body, cuenta_bancaria_id: second.id }));
  assert.throws(() => preparePayment(tx, { ...body, metodo_pago: 'efectivo' }, randomUUID()), /efectivo/);
});

test('local draft guards preserve account identities, operation history and owned references', () => {
  const state = { cuentas_bancarias: [account, second], operaciones_bancarias: [{ id: randomUUID(), contenido_hash: 'hash' }],
    clientes: [{ id: clientId, usuario_id: uid }], transacciones: [{ ...tx, cuenta_bancaria_id: account.id }],
    pagos_transacciones: [], movimientos_bancarios: [] };
  const before = structuredClone(state);
  assert.doesNotThrow(() => assertLocalBankIntegrity(state, before));
  for (const change of [
    s => { s.cuentas_bancarias[0].numero = '00000000'; },
    s => { s.operaciones_bancarias = []; },
    s => { s.transacciones[0].cuenta_bancaria_id = second.id; },
    s => { s.transacciones[0].cliente_id = randomUUID(); },
  ]) { const next = structuredClone(state); change(next); assert.throws(() => assertLocalBankIntegrity(next, before)); }
  const archived = structuredClone(state); archived.cuentas_bancarias[0].activa = false;
  assert.doesNotThrow(() => assertLocalBankIntegrity(archived, before));
});
