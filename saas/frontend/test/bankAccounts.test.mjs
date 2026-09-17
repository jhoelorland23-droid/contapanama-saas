import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankAccountLabel, bankAttempt, pendingBankRequests } from '../src/bankAccounts.mjs';

const memoryStorage = () => {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

test('account labels expose only the last four digits and preserve archived status', () => {
  const label = bankAccountLabel({ nombre: 'Reserva', banco: 'Banco General', numero: '123456789012',
    tipo: 'ahorros', moneda: 'USD', activa: false });
  assert(label.includes('***9012'));
  assert(label.includes('Archivada'));
  assert(!label.includes('123456789012'));
  assert.equal(bankAccountLabel(null), 'Sin cuenta asignada');
});

test('an uncertain retry keeps the original ordered rows and key despite edits', () => {
  const payload = { movimientos: [{ monto: 100 }, { monto: 25 }] };
  const first = bankAttempt(null, payload);
  payload.movimientos[0].monto = 99;
  assert.equal(first.movimientos[0].monto, 100);
  assert.equal(bankAttempt(first, payload), first);
  assert.notEqual(bankAttempt(null, payload).idempotencia, first.idempotencia);
});

test('pending requests survive recreation of the helper and remain scoped to user and operation', () => {
  const storage = memoryStorage();
  const requests = pendingBankRequests(storage, 'user-a');
  const payload = bankAttempt(null, { movimientos: [{ monto: 100 }] });
  requests.save('import', payload);
  assert.deepEqual(pendingBankRequests(storage, 'user-a').read('import'), payload);
  assert.equal(requests.read('account'), null);
  assert.equal(pendingBankRequests(storage, 'user-b').read('import'), null);
  requests.clear('import');
  assert.equal(requests.read('import'), null);
});

test('unreadable or unavailable storage fails before a new operation can be submitted', () => {
  const storage = memoryStorage();
  for (const value of ['bad json', 'null', '{}', '{"idempotencia":12}']) {
    storage.setItem('cp_bank_pending_user_import', value);
    assert.throws(() => pendingBankRequests(storage, 'user').read('import'), /no se puede leer/);
  }
  const unavailable = { setItem() { throw new Error('storage full'); } };
  assert.throws(() => pendingBankRequests(unavailable, 'user').save('import', {}), /storage full/);
});
