const express = require('express');
const { randomUUID } = require('node:crypto');
const { assertBankClient } = require('../services/bankMovement');
const { assertAccountOwner, assertAccountMatch } = require('../services/bankAccount');
const { dateKey } = require('../services/accountingPeriod');
const { paymentsFor, paymentSummary, preparePayment, samePayment, cents, validateTimeline, fail } = require('../services/paymentLedger');

function createPaymentRouter(repository) {
  const router = express.Router();
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  for (const param of ['id', 'pagoId']) router.param(param, (_req, res, next, value) => uuid(value) ? next() : res.status(422).json({ error: 'Identificador invalido.' }));
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };
  const requireTx = tx => { if (!tx) fail('Transaccion no encontrada.', 404); return tx; };
  router.get('/:id/pagos', handle(async (req, res) => {
    const tx = requireTx(await repository.read(req.user.id, req.params.id));
    res.json({ transaccion_id: tx.id, ...paymentSummary(tx) });
  }));
  router.post('/:id/pagos', handle(async (req, res) => {
    let replay = false;
    const result = await repository.transaction(req.user.id, async db => {
      const tx = requireTx(await db.get(req.params.id, true));
      const previous = paymentsFor(tx).find(p => p.idempotencia === req.body.idempotencia);
      if (previous) {
        if (!samePayment(previous, req.body)) fail('Ese identificador ya corresponde a otro pago.', 409);
        replay = true; return { ...tx, ...paymentSummary(tx) };
      }
      const payment = preparePayment(tx, req.body, randomUUID());
      if (payment.cuenta_bancaria_id) assertAccountOwner(await db.getAccount(payment.cuenta_bancaria_id), { ...payment, cliente_id: tx.cliente_id });
      await db.assertOpen(payment.fecha, tx.cliente_id);
      return db.save(tx, [...paymentsFor(tx), payment], 'pago_registrado', tx, { pago_id: payment.id });
    });
    res.status(replay ? 200 : 201).json({ ...paymentSummary(result), transaccion_id: result.id, repetido: replay });
  }));
  router.post('/:id/pagos/:pagoId/anular', handle(async (req, res) => {
    const result = await repository.transaction(req.user.id, async db => {
      const tx = requireTx(await db.get(req.params.id, true));
      const pagos = paymentsFor(tx).map(p => ({ ...p }));
      const payment = pagos.find(p => p.id === req.params.pagoId);
      if (!payment) fail('Pago no encontrado.', 404);
      const fecha = dateKey(req.body.fecha);
      const motivo = String(req.body.motivo || '').trim();
      if (payment.anulado_fecha) {
        if (dateKey(payment.anulado_fecha) !== fecha || payment.anulado_motivo !== motivo) fail('El pago ya fue anulado.', 409);
        return { ...tx, ...paymentSummary(tx) };
      }
      if (payment.conciliado) fail('Revierta primero la conciliacion del pago.', 409);
      if (payment.legacy && (!['efectivo','transferencia','cheque','tarjeta','otro'].includes(payment.metodo_pago) ||
        (payment.metodo_pago !== 'efectivo' && !payment.banco))) fail('Complete los datos del pago anterior antes de anularlo.', 409);
      if (!fecha || fecha !== req.body.fecha || fecha < dateKey(payment.fecha) || motivo.length < 3 || motivo.length > 1000) fail('Indique fecha valida y motivo de anulacion.');
      await db.assertOpen(fecha, tx.cliente_id);
      payment.anulado_fecha = fecha; payment.anulado_motivo = motivo;
      validateTimeline(tx, pagos);
      return db.save(tx, pagos, 'pago_anulado', tx, { pago_id: payment.id, fecha, motivo });
    });
    res.json({ transaccion_id: result.id, ...paymentSummary(result) });
  }));
  const assignAccount = individual => handle(async (req, res) => {
    if (!['admin', 'contador'].includes(req.user.rol)) fail('La asignacion de cuenta requiere un contador.', 403);
    if (!uuid(req.body.cuenta_bancaria_id)) fail('Seleccione una cuenta bancaria valida.');
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) fail('Indique el motivo de la asignacion (10 a 1000 caracteres).');
    const result = await repository.transaction(req.user.id, async db => {
      const tx = requireTx(await db.get(req.params.id, true));
      const pagos = paymentsFor(tx).map(p => ({ ...p }));
      const payment = individual ? pagos.find(p => p.id === req.params.pagoId) : tx;
      if (!payment) fail('Pago no encontrado.', 404);
      if (!individual && pagos.some(p => !p.legacy)) fail('Asigne la cuenta al abono individual.', 409);
      const account = await db.getAccount(req.body.cuenta_bancaria_id);
      const banco = !individual && !pagos.length && !payment.banco && (!tx.estado_pago || tx.estado_pago === 'pendiente')
        ? account?.banco : payment.banco;
      assertAccountOwner(account, { ...payment, banco, cliente_id: tx.cliente_id }, false);
      if (payment.cuenta_bancaria_id) {
        if (payment.cuenta_bancaria_id !== account.id) fail('Ya tiene otra cuenta asignada; requiere correccion contable.', 409);
        return { ...tx, ...paymentSummary(tx) };
      }
      if (!account.activa || payment.conciliado || payment.anulado_fecha || payment.metodo_pago === 'efectivo') fail('Revise el estado del pago, la conciliacion y la cuenta antes de asignar.', 409);
      await db.assertOpen(dateKey(individual ? payment.fecha : tx.fecha_pago || tx.fecha), tx.cliente_id);
      if (!individual) return db.assignAccount(tx, account.id, motivo, banco);
      payment.cuenta_bancaria_id = account.id;
      return db.save(tx, pagos, 'pago_cuenta_asignada', tx, { pago_id: payment.id, cuenta_bancaria_id: account.id, motivo });
    });
    res.json(result);
  });
  router.post('/:id/cuenta', assignAccount(false));
  router.post('/:id/pagos/:pagoId/cuenta', assignAccount(true));
  router.post('/:id/pagos/:pagoId/:accion', handle(async (req, res) => {
    if (!['conciliar', 'desconciliar'].includes(req.params.accion)) fail('Accion no encontrada.', 404);
    if (!['admin', 'contador'].includes(req.user.rol)) fail('La conciliacion requiere un contador.', 403);
    const result = await repository.transaction(req.user.id, async db => {
      const tx = requireTx(await db.get(req.params.id, true));
      const pagos = paymentsFor(tx).map(p => ({ ...p }));
      const payment = pagos.find(p => p.id === req.params.pagoId);
      if (!payment || payment.legacy) fail('Pago individual no encontrado.', 404);
      if (payment.anulado_fecha || payment.metodo_pago === 'efectivo') fail('Este pago no puede conciliarse con banco.', 409);
      await db.assertOpen(dateKey(payment.fecha), tx.cliente_id);
      const undo = req.params.accion === 'desconciliar';
      const bankId = undo ? payment.movimiento_bancario_id : req.body.movimiento_id;
      if (!uuid(bankId)) fail('Seleccione un movimiento bancario valido.');
      const bank = await db.getBank(bankId);
      if (!bank) fail('Movimiento bancario no encontrado.', 404);
      await db.assertOpen(dateKey(bank.fecha), bank.cliente_id || tx.cliente_id);
      if (undo) {
        if (!payment.conciliado || bank.transaccion_id !== tx.id) fail('El pago no coincide con la conciliacion.', 409);
      } else {
        assertBankClient(tx, bank);
        assertAccountMatch(payment, bank);
        assertAccountOwner(await db.getAccount(payment.cuenta_bancaria_id), { ...payment, cliente_id: tx.cliente_id }, false);
        if (payment.conciliado || bank.conciliado) fail('Pago o movimiento ya conciliado.', 409);
        if (cents(bank.monto) !== cents(payment.importe) || bank.banco !== payment.banco ||
          bank.tipo !== (tx.tipo === 'ingreso' ? 'credito' : 'debito')) fail('Banco, importe o direccion no coinciden con el abono.', 409);
      }
      await db.setBank(bank.id, undo ? null : tx.id);
      payment.conciliado = !undo;
      payment.movimiento_bancario_id = undo ? null : bank.id;
      return db.save(tx, pagos, undo ? 'pago_desconciliado' : 'pago_conciliado', tx, { pago_id: payment.id, movimiento_id: bank.id });
    });
    res.json({ transaccion_id: result.id, ...paymentSummary(result) });
  }));
  return router;
}
module.exports = { createPaymentRouter };
