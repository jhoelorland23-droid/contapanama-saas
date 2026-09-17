const { isDeepStrictEqual } = require('node:util');
const { fail } = require('./paymentLedger');
const { assertAccountOwner, assertAccountMatch } = require('./bankAccount');

function assertLocalBankIntegrity(state, before) {
  require('./bankStatement').assertLocalStatements(state, before);
  const accounts = new Map(state.cuentas_bancarias.map(a => [a.id, a]));
  const documents = new Map(state.transacciones.map(t => [t.id, t]));
  const movements = new Map(state.movimientos_bancarios.map(m => [m.id, m]));
  for (const old of before.cuentas_bancarias || []) {
    const { activa, ...identity } = old;
    const { activa: nextActive, ...nextIdentity } = accounts.get(old.id) || {};
    if (!isDeepStrictEqual(identity, nextIdentity)) fail('La identidad de la cuenta bancaria es inmutable.', 409);
  }
  const operations = new Map(state.operaciones_bancarias.map(o => [o.id, o]));
  for (const old of before.operaciones_bancarias || []) {
    if (!isDeepStrictEqual(old, operations.get(old.id))) fail('El historial de operaciones bancarias es inmutable.', 409);
  }
  for (const table of ['movimientos_bancarios', 'pagos_transacciones', 'transacciones']) {
    const previous = new Map((before[table] || []).map(row => [row.id, row]));
    for (const row of state[table]) {
      const old = previous.get(row.id);
      if (old?.cuenta_bancaria_id && old.cuenta_bancaria_id !== row.cuenta_bancaria_id) fail('La cuenta asignada no se puede cambiar.', 409);
      if (!row.cuenta_bancaria_id) continue;
      const account = accounts.get(row.cuenta_bancaria_id);
      const clientId = table === 'pagos_transacciones' ? documents.get(row.transaccion_id)?.cliente_id : row.cliente_id;
      assertAccountOwner(account, { ...row, cliente_id: clientId }, false);
      if (account.usuario_id !== row.usuario_id || row.metodo_pago === 'efectivo') fail('Cuenta o propietario incompatible con el registro.', 409);
      if (table === 'pagos_transacciones' && row.movimiento_bancario_id) {
        assertAccountMatch(row, movements.get(row.movimiento_bancario_id) || {});
      }
    }
  }
  for (const account of accounts.values()) {
    if (!state.clientes.some(c => c.id === account.cliente_id && c.usuario_id === account.usuario_id)) fail('El cliente de la cuenta bancaria no pertenece al usuario.', 409);
  }
}
module.exports = { assertLocalBankIntegrity };
