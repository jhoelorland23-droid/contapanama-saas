const express = require('express');
const { randomUUID } = require('node:crypto');
const { uuid } = require('../services/bankMovement');
const { fail } = require('../services/paymentLedger');
const { bankOperation, operationKey } = require('../services/bankAccount');
const { prepareStatement, statementHash, statementMeta, assertStatement, statementScope, statementDirectory } = require('../services/bankStatement');

function createBankStatementRouter(repository) {
  const router = express.Router();
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo completar el registro del extracto.' }); }
  };
  router.get('/', handle(async (req, res) => {
    const scope = statementScope(req.query);
    const snapshot = await repository.readStatementData(req.user.id);
    if (scope.cliente_id && !snapshot.clients.some(c=>c.id===scope.cliente_id)) fail('Cliente no encontrado.', 404);
    const result = statementDirectory(snapshot.rows, snapshot.accounts, snapshot.movements, scope);
    res.set('Cache-Control', 'private, no-store').json(result);
  }));
  router.get('/:id/soporte', handle(async (req, res) => {
    if (!uuid(req.params.id)) fail('Extracto invalido.');
    const row = await repository.readStatementFile(req.user.id, req.params.id);
    if (!row) fail('Extracto no encontrado.', 404);
    assertStatement(row, true);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="extracto-' + row.periodo + '-v' + row.revision + '.pdf"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Content-SHA256': row.soporte_hash })
      .send(Buffer.from(row.soporte_base64, 'base64'));
  }));
  router.post('/', handle(async (req, res) => {
    if (!['admin', 'contador'].includes(req.user.rol)) fail('Solo un contador o administrador puede registrar extractos.', 403);
    const payload = prepareStatement(req.body), key = operationKey(req.body.idempotencia);
    const { soporte_base64, ...identity } = payload;
    const value = await repository.transaction(req.user.id, db => bankOperation(db, key, 'extracto', identity, async () => {
      const account = await db.getAccount(payload.cuenta_bancaria_id);
      if (!account) fail('Cuenta no encontrada.', 404);
      if (account.cliente_id !== payload.cliente_id || account.moneda !== 'USD') fail('La cuenta no corresponde al cliente o moneda.', 409);
      await db.assertOpen(payload.periodo + '-01', payload.cliente_id);
      const all = await db.statements();
      const previous = all.filter(r => r.cuenta_bancaria_id === account.id && r.periodo === payload.periodo).sort((a,b) => b.revision-a.revision)[0];
      if ((previous?.id || null) !== payload.anterior_id) fail('El extracto tiene otra version vigente. Actualice antes de corregir.', 409);
      if (previous) assertStatement(previous);
      const row = { ...payload, id: randomUUID(), usuario_id: req.user.id, revision: (previous?.revision || 0) + 1 };
      row.contenido_hash = statementHash(row);
      const saved = await db.createStatement(row);
      const result = statementMeta(saved);
      await db.audit(saved, previous ? 'extracto_corregido' : 'extracto_registrado', previous ? statementMeta(previous) : null, result, 'extracto_bancario');
      return result;
    }));
    res.status(value.replay ? 200 : 201).json({ ...value.result, repetido: value.replay });
  }));
  return router;
}
module.exports = { createBankStatementRouter };
