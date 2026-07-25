'use strict';
/**
 * routes/prestamos.js — Gestión de préstamos y cuotas
 *
 * GET    /api/prestamos
 * POST   /api/prestamos
 * PUT    /api/prestamos/:id
 * DELETE /api/prestamos/:id
 * GET    /api/prestamos/:id/pagos
 * POST   /api/prestamos/:id/registrar-pago
 * GET    /api/prestamos/:id/tabla-amortizacion
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query, withTransaction }   = require('../db');
const { authMiddleware }           = require('../middleware/auth');
const { calcularCuotaPrestamo, generarAsiento, validarCuadre } = require('../services/asientos');
const logger = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

const ok = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ── GET /api/prestamos ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.*, c.nombre AS cliente_nombre,
        (SELECT COUNT(*) FROM pagos_prestamo pp WHERE pp.prestamo_id = p.id) AS num_pagos
      FROM prestamos p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.usuario_id = $1 AND p.activo = true
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/prestamos ───────────────────────────────────────────────────────
router.post('/', [
  body('descripcion').trim().notEmpty().withMessage('Descripción requerida'),
  body('monto_original').isFloat({ min: 1 }).withMessage('Monto inválido'),
  body('tasa_interes').isFloat({ min: 0, max: 1 }).withMessage('Tasa entre 0 y 1 (ej: 0.065)'),
  body('fecha_inicio').isDate().withMessage('Fecha inválida'),
], ok, async (req, res) => {
  try {
    const {
      descripcion, banco_acreedor, monto_original, tasa_interes = 0,
      cuota_mensual, fecha_inicio, fecha_fin, cliente_id,
      cuenta_capital = '2301', cuenta_interes = '6401', cuenta_banco = '1102', notas,
    } = req.body;

    const { rows } = await query(`
      INSERT INTO prestamos
        (usuario_id, cliente_id, descripcion, banco_acreedor, monto_original,
         saldo_pendiente, tasa_interes, cuota_mensual, fecha_inicio, fecha_fin,
         cuenta_capital, cuenta_interes, cuenta_banco, notas)
      VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [req.user.id, cliente_id||null, descripcion, banco_acreedor||null,
        monto_original, tasa_interes, cuota_mensual||null, fecha_inicio, fecha_fin||null,
        cuenta_capital, cuenta_interes, cuenta_banco, notas||null]);

    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/prestamos/:id ────────────────────────────────────────────────────
router.put('/:id', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const fields = ['descripcion','banco_acreedor','tasa_interes','cuota_mensual',
                    'fecha_fin','cuenta_capital','cuenta_interes','cuenta_banco','notas','activo'];
    const ups=[]; const p=[]; let i=1;
    for (const f of fields) if (req.body[f]!==undefined) { ups.push(`${f}=$${i++}`); p.push(req.body[f]); }
    if (!ups.length) return res.status(400).json({ error:'Sin campos' });
    p.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE prestamos SET ${ups.join(',')} WHERE id=$${i} AND usuario_id=$${i+1} RETURNING *`, p);
    if (!rows.length) return res.status(404).json({ error:'Préstamo no encontrado' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/prestamos/:id (soft delete) ───────────────────────────────────
router.delete('/:id', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE prestamos SET activo=false WHERE id=$1 AND usuario_id=$2 RETURNING id',
      [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error:'Préstamo no encontrado' });
    res.json({ message:'Préstamo desactivado' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/prestamos/:id/pagos ──────────────────────────────────────────────
router.get('/:id/pagos', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT pp.*, t.fecha AS tx_fecha, t.banco AS tx_banco
      FROM pagos_prestamo pp
      LEFT JOIN transacciones t ON t.id = pp.transaccion_id
      WHERE pp.prestamo_id = $1 AND pp.usuario_id = $2
      ORDER BY pp.fecha DESC
    `, [req.params.id, req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/prestamos/:id/registrar-pago ────────────────────────────────────
// Registra una cuota: crea la transacción + asiento + actualiza saldo
router.post('/:id/registrar-pago', [
  param('id').isUUID(),
  body('fecha').isDate().withMessage('Fecha requerida'),
  body('monto').isFloat({ min: 0.01 }).withMessage('Monto inválido'),
], ok, async (req, res) => {
  try {
    const uid = req.user.id;

    // Obtener préstamo
    const { rows: [prestamo] } = await query(
      'SELECT * FROM prestamos WHERE id=$1 AND usuario_id=$2 AND activo=true',
      [req.params.id, uid]);
    if (!prestamo) return res.status(404).json({ error:'Préstamo no encontrado' });

    const { fecha, monto, banco = prestamo.banco_acreedor || '', referencia = '', notas = '' } = req.body;

    // Calcular desglose capital / interés
    const desglose = calcularCuotaPrestamo(prestamo, monto);
    if (!desglose.valido) {
      await logger.warn(uid, null, logger.TIPOS.PRESTAMO_SIN_CONFIG,
        `Desglose inválido para préstamo ${prestamo.id}`,
        { desglose, monto });
    }

    let txId;
    await withTransaction(async c => {
      // 1. Crear transacción
      const { rows: [tx] } = await c.query(`
        INSERT INTO transacciones
          (usuario_id, cliente_id, fecha, descripcion, tipo, monto, itbms, itbms_aplica,
           deducible, tiene_factura, banco, referencia, periodo,
           es_cuota_prestamo, capital_prestamo, interes_prestamo,
           prestamo_id, fuente_origen, asiento_generado)
        VALUES ($1,$2,$3,$4,'gasto',$5,0,false,false,false,$6,$7,$8,true,$9,$10,$11,'manual',false)
        RETURNING *
      `, [uid, prestamo.cliente_id||null, fecha,
          `Cuota préstamo — ${prestamo.descripcion}`,
          monto, banco, referencia,
          fecha.slice(0,7), desglose.capital, desglose.interes,
          prestamo.id]);

      txId = tx.id;

      // 2. Generar asiento con cuentas del préstamo
      const { lines, errores } = generarAsiento(tx, prestamo.cuenta_capital, {
        cuenta_capital: prestamo.cuenta_capital,
        cuenta_interes: prestamo.cuenta_interes,
        cuenta_banco:   prestamo.cuenta_banco,
      });
      const cuadre = validarCuadre(lines);

      if (!cuadre.cuadra) {
        await logger.critico(uid, tx.id, logger.TIPOS.ASIENTO_NO_CUADRA,
          `Asiento préstamo no cuadra: ${cuadre.total_debe} vs ${cuadre.total_haber}`,
          { desglose, cuadre });
      }

      // 3. Insertar asientos
      for (const l of lines) {
        await c.query(`INSERT INTO asientos_contables
          (usuario_id,transaccion_id,cliente_id,fecha,cuenta_codigo,cuenta_nombre,
           debe,haber,descripcion,referencia,tipo_linea,periodo,itbms_monto,itbms_tipo)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,null)`,
          [uid,tx.id,prestamo.cliente_id||null,l.fecha,l.cuenta_codigo,l.cuenta_nombre,
           l.debe,l.haber,l.descripcion,l.referencia,l.tipo_linea,tx.periodo]);
      }

      await c.query('UPDATE transacciones SET asiento_generado=true WHERE id=$1', [tx.id]);

      // 4. Registrar pago
      await c.query(`INSERT INTO pagos_prestamo
        (prestamo_id,transaccion_id,usuario_id,fecha,cuota_total,capital,interes,
         saldo_antes,saldo_despues)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [prestamo.id, tx.id, uid, fecha, monto,
         desglose.capital, desglose.interes,
         desglose.saldo_antes, desglose.saldo_despues]);

      // 5. Actualizar saldo del préstamo
      await c.query('UPDATE prestamos SET saldo_pendiente=$1 WHERE id=$2',
        [desglose.saldo_despues, prestamo.id]);
    });

    res.status(201).json({
      transaccion_id: txId,
      desglose,
      mensaje: `✓ Cuota registrada. Capital: B/.${desglose.capital} | Interés: B/.${desglose.interes}`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/prestamos/:id/tabla-amortizacion ─────────────────────────────────
router.get('/:id/tabla-amortizacion', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const { rows: [p] } = await query(
      'SELECT * FROM prestamos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!p) return res.status(404).json({ error:'Préstamo no encontrado' });

    const cuota       = parseFloat(p.cuota_mensual) || 0;
    const tasa        = parseFloat(p.tasa_interes) || 0;
    const tasaMensual = tasa / 12;
    let   saldo       = parseFloat(p.saldo_pendiente);
    const tabla       = [];
    let   mes         = 0;
    const MAX_FILAS   = 360; // 30 años máx

    while (saldo > 0.01 && mes < MAX_FILAS) {
      mes++;
      const interes = tasa > 0 ? Math.round(saldo * tasaMensual * 100) / 100 : 0;
      const totalCuota = cuota || (interes + saldo); // si no hay cuota, amortiza todo
      const capital = Math.min(Math.round((totalCuota - interes) * 100) / 100, saldo);
      saldo = Math.round(Math.max(0, saldo - capital) * 100) / 100;

      // Fecha aproximada
      const d = new Date(p.fecha_inicio);
      d.setMonth(d.getMonth() + mes - 1);
      const fecha = d.toISOString().slice(0, 7);

      tabla.push({ mes, fecha, cuota: totalCuota, capital, interes, saldo });
      if (!cuota && saldo <= 0) break;
    }

    res.json({ prestamo: p, tabla, total_cuotas: mes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
