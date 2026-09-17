const express = require('express');
const { uuid, prepareBankMovement } = require('../services/bankMovement');
const { fail } = require('../services/paymentLedger');
const { operationKey, bankOperation, assertAccountOwner } = require('../services/bankAccount');

function createBankMovementRouter(repository) {
  const router = express.Router();
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };
  const accountant = req => {
    if (!['admin', 'contador'].includes(req.user.rol)) fail('Solo un contador o administrador puede registrar o asignar banco.', 403);
  };
  router.get('/', handle(async (req, res) => {
    if (req.query.cliente_id && !uuid(req.query.cliente_id)) fail('Cliente invalido.');
    if (req.query.cuenta_bancaria_id && !uuid(req.query.cuenta_bancaria_id)) fail('Cuenta invalida.');
    if (req.query.periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.periodo)) fail('Periodo invalido.');
    const rows = await repository.read(req.user.id, req.query);
    res.json({ data: rows, total: rows.length });
  }));
  const create = bulk => handle(async (req, res) => {
    accountant(req);
    const key = operationKey(req.body.idempotencia);
    const input = bulk ? req.body.movimientos : [req.body];
    if (!Array.isArray(input) || !input.length || input.length > 2000) fail('Indique entre 1 y 2000 movimientos.');
    const rows = input.map((body, index) => {
      try { return prepareBankMovement(body); }
      catch (error) { error.message = `Fila ${index + 1}: ${error.message}`; throw error; }
    });
    const value = await repository.transaction(req.user.id, db => bankOperation(db,key,bulk ? 'importacion' : 'movimiento',rows,async () => {
      for (const clientId of new Set(rows.map(row => row.cliente_id))) {
        if (!await db.getClient(clientId)) fail('Cliente no encontrado.', 404);
      }
      for (const row of rows) await db.assertOpen(row.fecha, row.cliente_id);
      for (const row of rows) assertAccountOwner(await db.getAccount(row.cuenta_bancaria_id),row);
      const created = [];
      for (const row of rows) {
        const saved = await db.create(row); created.push(saved);
        await db.audit(saved, 'movimiento_bancario_registrado', null, saved);
      }
      return created;
    }));
    res.status(value.replay ? 200 : 201).json(bulk ? { data: value.result, total: value.result.length, repetido:value.replay } : { ...value.result[0], repetido:value.replay });
  });
  router.post('/', create(false));
  router.post('/bulk', create(true));
  router.post('/:id/cuenta', handle(async (req,res) => {
    accountant(req);
    if(!uuid(req.params.id)||!uuid(req.body.cuenta_bancaria_id)) fail('Movimiento o cuenta invalido.');
    const motivo=String(req.body.motivo || '').trim();
    if(motivo.length<10||motivo.length>1000) fail('Indique el motivo de la asignacion (10 a 1000 caracteres).');
    const result=await repository.transaction(req.user.id,async db=>{
      const row=await db.get(req.params.id), account=await db.getAccount(req.body.cuenta_bancaria_id);
      if(!row||!account) fail('Movimiento o cuenta no encontrado.',404);
      assertAccountOwner(account,{...row,cliente_id:row.cliente_id || account.cliente_id},false);
      if(row.cuenta_bancaria_id){
        if(row.cuenta_bancaria_id!==account.id) fail('El movimiento ya tiene otra cuenta asignada.',409);
        return row;
      }
      if(row.conciliado||row.transaccion_id) fail('Revierta el vinculo anterior antes de asignar la cuenta.',409);
      if(!account.activa) fail('La cuenta bancaria esta archivada.',409);
      await db.assertOpen(row.fecha,account.cliente_id);
      const saved=await db.assignAccount(row.id,account);
      await db.audit(saved,'movimiento_cuenta_asignada',row,{...saved,motivo});
      return saved;
    });
    res.json(result);
  }));
  router.post('/:id/cliente', handle(async (req, res) => {
    accountant(req);
    if (!uuid(req.params.id) || !uuid(req.body.cliente_id)) fail('Movimiento o cliente invalido.');
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) fail('Indique el motivo de la asignacion (10 a 1000 caracteres).');
    const result = await repository.transaction(req.user.id, async db => {
      const row = await db.get(req.params.id);
      if (!row || !await db.getClient(req.body.cliente_id)) fail('Movimiento o cliente no encontrado.', 404);
      if (row.cliente_id) {
        if (row.cliente_id !== req.body.cliente_id) fail('El movimiento ya pertenece a otro cliente. No se puede reasignar.', 409);
        return row;
      }
      if (row.conciliado || row.transaccion_id) fail('Revierta la conciliacion anterior antes de asignar el cliente.', 409);
      await db.assertOpen(row.fecha, req.body.cliente_id);
      const saved = await db.assign(row.id, req.body.cliente_id);
      await db.audit(saved, 'movimiento_cliente_asignado', row, { ...saved, motivo });
      return saved;
    });
    res.json(result);
  }));
  return router;
}

module.exports = { createBankMovementRouter };
