// ───────────────────────────────────────────────────────────────────
//  /api/billing — Planes y suscripciones SaaS
// ───────────────────────────────────────────────────────────────────
//  GET   /api/billing/planes             ← catálogo público (sin auth)
//  GET   /api/billing/suscripcion        ← mi suscripción
//  POST  /api/billing/suscripcion        ← crear (activa trial 14d)
//  POST  /api/billing/suscripcion/cambiar ← upgrade / downgrade
//  POST  /api/billing/suscripcion/cancelar
//  GET   /api/billing/metodos
//  POST  /api/billing/metodos            ← agregar método de pago
//  DELETE /api/billing/metodos/:id
//  GET   /api/billing/pagos              ← historial
//  POST  /api/billing/webhook/:proveedor ← (sin auth) callbacks PSP
// ───────────────────────────────────────────────────────────────────

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAction } = require('../services/audit');

const router = express.Router();

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ── PUBLIC: catálogo de planes ────────────────────────────────────────
router.get('/planes', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, nombre, precio_mensual, precio_anual, moneda,
             limite_clientes, limite_usuarios, limite_fe, limite_ocr, features
      FROM billing_planes WHERE activo = true ORDER BY orden
    `);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUBLIC: webhook PSP (Stripe/Yappy postean acá) ────────────────────
// IMPORTANTE: validar la firma del PSP antes de confiar (omitido por brevedad).
router.post('/webhook/:proveedor', express.raw({ type: '*/*' }), async (req, res) => {
  // En producción:
  // 1) Verificar firma con secret de Stripe / Yappy
  // 2) Parsear event.type → actualizar billing_pagos + billing_suscripciones
  // 3) Idempotency: guardar event.id y rechazar duplicados
  console.log(`[billing webhook] ${req.params.proveedor}`, req.body.toString().slice(0, 200));
  res.status(200).json({ received: true });
});

// ── A partir de aquí, todo requiere auth ──────────────────────────────
router.use(authMiddleware);

// ── GET /api/billing/suscripcion ──────────────────────────────────────
router.get('/suscripcion', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, p.nombre AS plan_nombre, p.precio_mensual, p.precio_anual, p.features
      FROM billing_suscripciones s
      JOIN billing_planes p ON p.id = s.plan_id
      WHERE s.usuario_id = $1 ORDER BY s.created_at DESC LIMIT 1
    `, [req.user.id]);
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/billing/suscripcion — crear / activar trial ─────────────
router.post('/suscripcion', [
  body('plan_id').isString(),
  body('ciclo').optional().isIn(['mensual', 'anual']),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    // ¿Ya tiene una?
    const existing = await query(`
      SELECT id, estado FROM billing_suscripciones WHERE usuario_id=$1
      AND estado IN ('trial','active','past_due') LIMIT 1
    `, [uid]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Ya tienes una suscripción activa', suscripcion_id: existing.rows[0].id });
    }

    const trialFin = new Date(); trialFin.setDate(trialFin.getDate() + 14);
    const periodoFin = new Date(trialFin);
    if (req.body.ciclo === 'anual') periodoFin.setFullYear(periodoFin.getFullYear() + 1);
    else periodoFin.setMonth(periodoFin.getMonth() + 1);

    const { rows } = await query(`
      INSERT INTO billing_suscripciones
        (usuario_id, plan_id, estado, ciclo, trial_fin, periodo_inicio, periodo_fin)
      VALUES ($1, $2, 'trial', $3, $4, NOW(), $5)
      RETURNING *
    `, [uid, req.body.plan_id, req.body.ciclo || 'mensual', trialFin, periodoFin]);

    await logAction(req, 'billing.create', 'billing_suscripciones', rows[0].id, { plan: req.body.plan_id });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Plan no existe' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/billing/suscripcion/cambiar — upgrade / downgrade ───────
router.post('/suscripcion/cambiar', [body('plan_id').isString()], validate, async (req, res) => {
  try {
    const { rowCount } = await query(`
      UPDATE billing_suscripciones SET plan_id=$1, updated_at=NOW()
      WHERE usuario_id=$2 AND estado IN ('trial','active')
    `, [req.body.plan_id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'No tienes suscripción activa' });
    await logAction(req, 'billing.cambiar_plan', 'billing_suscripciones', null, { plan: req.body.plan_id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/billing/suscripcion/cancelar ────────────────────────────
router.post('/suscripcion/cancelar', [
  body('al_final').optional().isBoolean(),
], validate, async (req, res) => {
  try {
    const al_final = req.body.al_final !== false;
    if (al_final) {
      await query(`UPDATE billing_suscripciones SET cancela_al_fin=true WHERE usuario_id=$1 AND estado IN ('trial','active')`,
        [req.user.id]);
    } else {
      await query(`UPDATE billing_suscripciones SET estado='canceled' WHERE usuario_id=$1`, [req.user.id]);
    }
    await logAction(req, 'billing.cancelar', 'billing_suscripciones', null, { al_final });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MÉTODOS DE PAGO ───────────────────────────────────────────────────
router.get('/metodos', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, tipo, alias, ultimos_4, marca, default_method, vence_mm, vence_yy
      FROM billing_metodos_pago WHERE usuario_id=$1 ORDER BY default_method DESC, created_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// IMPORTANTE: el token nunca debe ser un PAN crudo. Esto lo emite el PSP
// (Stripe → setupIntent, Yappy → token de tokenización).
router.post('/metodos', [
  body('tipo').isIn(['yappy', 'ach', 'card', 'manual']),
  body('token').isString(),
  body('alias').optional().isString(),
  body('ultimos_4').optional().isString().isLength({ max: 4 }),
  body('marca').optional().isString(),
  body('vence_mm').optional().isInt({ min: 1, max: 12 }),
  body('vence_yy').optional().isInt({ min: 24, max: 99 }),
  body('default_method').optional().isBoolean(),
], validate, async (req, res) => {
  try {
    if (req.body.default_method) {
      await query(`UPDATE billing_metodos_pago SET default_method=false WHERE usuario_id=$1`, [req.user.id]);
    }
    const { rows } = await query(`
      INSERT INTO billing_metodos_pago
        (usuario_id, tipo, alias, token, ultimos_4, marca, default_method, vence_mm, vence_yy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, tipo, alias, ultimos_4, marca, default_method, vence_mm, vence_yy
    `, [
      req.user.id, req.body.tipo, req.body.alias || null, req.body.token,
      req.body.ultimos_4 || null, req.body.marca || null,
      req.body.default_method || false, req.body.vence_mm || null, req.body.vence_yy || null,
    ]);
    await logAction(req, 'billing.metodo.add', 'billing_metodos_pago', rows[0].id, { tipo: req.body.tipo });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/metodos/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    await query(`DELETE FROM billing_metodos_pago WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PAGOS / FACTURAS DE SUSCRIPCIÓN ───────────────────────────────────
router.get('/pagos', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, monto, moneda, estado, proveedor, invoice_url, pagado_at, created_at
      FROM billing_pagos WHERE usuario_id=$1 ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
