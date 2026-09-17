const express = require('express');
const { uuid } = require('../services/bankMovement');
const { fail } = require('../services/paymentLedger');
const { prepareBankAccount, operationKey, bankOperation } = require('../services/bankAccount');

function createBankAccountRouter(repository) {
  const router = express.Router();
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };
  const accountant = req => {
    if (!['admin','contador'].includes(req.user.rol)) fail('Solo un contador o administrador puede gestionar cuentas.', 403);
  };
  router.get('/', handle(async (req, res) => {
    if (req.query.cliente_id && !uuid(req.query.cliente_id)) fail('Cliente invalido.');
    res.json({ data: await repository.readAccounts(req.user.id, req.query) });
  }));
  router.post('/', handle(async (req, res) => {
    accountant(req);
    const row = prepareBankAccount(req.body), key = operationKey(req.body.idempotencia);
    const value = await repository.transaction(req.user.id, db => bankOperation(db, key, 'cuenta', row, async () => {
      if (!await db.getClient(row.cliente_id)) fail('Cliente no encontrado.', 404);
      if (await db.findAccount(row)) fail('Esta cuenta ya esta registrada para el cliente y banco.', 409);
      const saved = await db.createAccount(row);
      await db.audit(saved, 'cuenta_bancaria_creada', null, saved, 'cuenta_bancaria');
      return saved;
    }));
    res.status(value.replay ? 200 : 201).json({ ...value.result, repetido: value.replay });
  }));
  router.post('/:id/estado', handle(async (req, res) => {
    accountant(req);
    if (!uuid(req.params.id) || typeof req.body.activa !== 'boolean') fail('Cuenta o estado invalido.');
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) fail('Indique el motivo del cambio (10 a 1000 caracteres).');
    const row = await repository.transaction(req.user.id, async db => {
      const before = await db.getAccount(req.params.id);
      if (!before) fail('Cuenta no encontrada.', 404);
      if (before.activa === req.body.activa) return before;
      const after = await db.setAccountActive(before.id, req.body.activa);
      await db.audit(after, 'cuenta_bancaria_estado', before, { ...after, motivo }, 'cuenta_bancaria');
      return after;
    });
    res.json(row);
  }));
  return router;
}
module.exports = { createBankAccountRouter };
