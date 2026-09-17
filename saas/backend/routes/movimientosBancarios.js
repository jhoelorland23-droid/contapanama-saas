const express = require('express');
const { dateKey } = require('../services/accountingPeriod');
const { validatePayment } = require('../services/paymentValidation');
const { body, validationResult } = require('express-validator');
const { createBankMovementRouter } = require('./bankMovements');
const { sqlBankMovementRepository } = require('../services/bankMovementRepository');
const { assertBankClient } = require('../services/bankMovement');
const { assertAccountMatch, assertAccountOwner } = require('../services/bankAccount');
const { query } = require('../db');
const { withAccountingWrite } = require('../services/accountingWrite');
const { authMiddleware } = require('../middleware/auth');
const { isRegisteredTransaction } = require('../services/transactionStatus');

const router = express.Router();
router.use(authMiddleware);
const montoDocumento = tx => Number((Number(tx?.monto || 0) + Number(tx?.itbms || 0)).toFixed(2));
const periodOf = fecha => dateKey(fecha).slice(0, 7);

const assertPeriodOpen = async (uid, periodo, clienteId = null, db = { query }) => {
  const year = Number(String(periodo || '').slice(0, 4));
  const { rows } = await db.query(`
    SELECT id, alcance, periodo, anio, cliente_id, estado, nota, cerrado_at
    FROM cierres_periodo
    WHERE usuario_id = $1
      AND estado = 'cerrado'
      AND (
        (alcance = 'mensual' AND periodo = $2)
        OR (alcance = 'anual' AND anio = $3)
      )
      AND (
        cliente_id IS NULL
        OR ($4::uuid IS NOT NULL AND cliente_id = $4::uuid)
      )
    LIMIT 1
  `, [uid, periodo, Number.isFinite(year) ? year : null, clienteId || null]);
  if (rows.length) {
    const cierre = rows[0];
    const error = new Error(
      cierre.alcance === 'anual'
        ? `El año ${cierre.anio} está cerrado. Reabra el periodo antes de modificar banco o conciliación.`
        : `El periodo ${cierre.periodo} está cerrado. Reabra el periodo antes de modificar banco o conciliación.`
    );
    error.status = 409;
    error.cierre = cierre;
    throw error;
  }
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

router.use(createBankMovementRouter(sqlBankMovementRepository));

router.post('/match', [
  body('transaccion_id').isUUID(),
  body('movimiento_id').isUUID(),
], validate, async (req, res) => {
  try {
    if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'La conciliacion requiere un contador.' });
    const uid = req.user.id;
    const { transaccion_id, movimiento_id } = req.body;
    const result = await withAccountingWrite(uid, async db => {
      const { rows: txRows } = await db.query(
        'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
        [transaccion_id, uid]
      );
      const { rows: movRows } = await db.query(
        'SELECT * FROM movimientos_bancarios WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
        [movimiento_id, uid]
      );
      if (!txRows.length || !movRows.length) {
        const error = new Error('Movimiento o transaccion no encontrado');
        error.status = 404;
        throw error;
      }
      const tx = txRows[0];
      const payments = await db.query('SELECT id FROM pagos_transacciones WHERE transaccion_id=$1 AND usuario_id=$2 LIMIT 1', [tx.id, uid]);
      if (payments.rows.length) {
        const error = new Error('Seleccione el abono individual para conciliar este documento.');
        error.status = 409; throw error;
      }
      const mov = movRows[0];
      assertBankClient(tx, mov);
      assertAccountMatch(tx, mov);
      const account = (await db.query('SELECT * FROM cuentas_bancarias WHERE id=$1 AND usuario_id=$2', [tx.cuenta_bancaria_id, uid])).rows[0];
      assertAccountOwner(account, tx, tx.estado_pago !== 'pagado');
      if (!isRegisteredTransaction(tx)) {
        const error = new Error('Registre el borrador antes de conciliarlo.');
        error.status = 409;
        throw error;
      }
      const payment = { ...tx, estado_pago: 'pagado', fecha_pago: tx.fecha_pago || mov.fecha, metodo_pago: tx.metodo_pago || 'transferencia', banco: tx.banco || mov.banco };
      const paymentError = tx.estado_pago === 'parcial' || tx.metodo_pago === 'efectivo' ? 'Revise el pago antes de vincularlo con banco.' : validatePayment(payment);
      await assertPeriodOpen(uid, periodOf(payment.fecha_pago), tx.cliente_id || null, db);
      await assertPeriodOpen(uid, periodOf(mov.fecha), mov.cliente_id, db);
      if (paymentError) { const error = new Error(paymentError); error.status = 422; throw error; }
      if (tx.conciliado || mov.conciliado) {
        const error = new Error('Uno de los registros ya esta conciliado');
        error.status = 409;
        throw error;
      }
      if (tx.banco && mov.banco && tx.banco !== mov.banco) {
        const error = new Error('El banco no coincide');
        error.status = 400;
        throw error;
      }
      const totalTx = montoDocumento(tx);
      if (Math.abs(totalTx - parseFloat(mov.monto)) >= 0.01) {
        const error = new Error('El monto no coincide con el total del documento');
        error.status = 400;
        throw error;
      }
      const direccionValida = (tx.tipo === 'ingreso' && mov.tipo === 'credito') || (tx.tipo === 'gasto' && mov.tipo === 'debito');
      if (!direccionValida) {
        const error = new Error('El tipo de movimiento bancario no corresponde al ingreso/gasto');
        error.status = 400;
        throw error;
      }
      const { rows: updatedTx } = await db.query(`
        UPDATE transacciones
        SET conciliado = true,
            estado_pago = 'pagado',
            fecha_pago = COALESCE(fecha_pago, $3),
            referencia_pago = COALESCE(NULLIF(referencia_pago,''), $4),
            metodo_pago = COALESCE(NULLIF(metodo_pago,''), 'transferencia'),
            banco = COALESCE(NULLIF(banco,''), $5),
            fecha_conciliacion = CURRENT_DATE
        WHERE id = $1 AND usuario_id = $2
        RETURNING *
      `, [tx.id, uid, mov.fecha, mov.referencia || '', mov.banco || '']);
      const { rows: updatedMov } = await db.query(`
        UPDATE movimientos_bancarios
        SET conciliado = true, transaccion_id = $1
        WHERE id = $2 AND usuario_id = $3
        RETURNING *
      `, [tx.id, mov.id, uid]);

      await db.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        uid,
        updatedTx[0].cliente_id,
        'conciliacion_bancaria_confirmada',
        'transaccion',
        updatedTx[0].id,
        {
          transaccion: { conciliado: tx.conciliado, estado_pago: tx.estado_pago, fecha_pago: tx.fecha_pago },
          movimiento: { id: mov.id, conciliado: mov.conciliado, transaccion_id: mov.transaccion_id },
        },
        {
          transaccion_id: updatedTx[0].id,
          movimiento_id: updatedMov[0].id,
          banco: updatedMov[0].banco,
          monto: updatedMov[0].monto,
          monto_documento: totalTx,
          referencia: updatedMov[0].referencia,
          fecha: updatedMov[0].fecha,
        },
      ]);

      return { transaccion: updatedTx[0], movimiento: updatedMov[0] };
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
