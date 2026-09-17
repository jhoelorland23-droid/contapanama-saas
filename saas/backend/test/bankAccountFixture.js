const { randomUUID } = require('node:crypto');

async function createAccount(request, headers, clienteId, extra = {}) {
  return request('/api/cuentas-bancarias', { method: 'POST', headers, body: JSON.stringify({
    cliente_id: clienteId, nombre: 'Cuenta QA operativa', banco: 'Banco General',
    numero: randomUUID().replaceAll('-', ''), tipo: 'corriente', moneda: 'USD', idempotencia: randomUUID(), ...extra,
  }) });
}
module.exports = { createAccount };
