/**
 * routes/motor.js — Motor Contable Inteligente
 *
 * POST /api/motor/clasificar              → Clasificar descripción
 * POST /api/motor/clasificar-lote         → Clasificar múltiples transacciones
 * POST /api/motor/generar-asiento/:txId   → Generar asiento para una transacción
 * POST /api/motor/generar-periodo         → Generar todos los asientos del período
 * GET  /api/motor/generar-diario          → Diario combinado mensual (genera si falta)
 * GET  /api/motor/asientos                → Listar asientos con filtros
 * GET  /api/motor/asientos/:id            → Un asiento con sus líneas
 * DELETE /api/motor/asientos/:id          → Anular asiento
 *
 * Reglas personalizadas:
 * GET    /api/motor/reglas                → Listar reglas del usuario
 * POST   /api/motor/reglas                → Crear regla
 * PUT    /api/motor/reglas/:id            → Editar regla
 * DELETE /api/motor/reglas/:id            → Eliminar regla
 */

const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { query }          = require('../db');
const { clasificar, clasificarLote, calcularConfianza, REGLAS_BASE } = require('../services/clasificador');
const { generarAsiento, generarAsientosPeriodo, obtenerDiario, generarLineas, calcularITBMS, validarCuadre } = require('../services/asientos');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() });
  next();
};

// ═══════════════════════════════════════════════════════════════════════════
//  CLASIFICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/motor/clasificar
// Body: { descripcion, tipo?, monto?, banco? }
router.post('/clasificar', [
  body('descripcion').trim().notEmpty().withMessage('Descripción requerida'),
], validate, async (req, res) => {
  try {
    const tx = { descripcion: req.body.descripcion, tipo: req.body.tipo, monto: req.body.monto||0, banco: req.body.banco, itbms: 0, deducible: false };
    const resultado = await clasificar(tx, req.user.id);
    res.json({
      descripcion:    tx.descripcion,
      clasificacion:  resultado,
      itbms_preview:  calcularITBMS(tx.monto||0, 0, resultado.aplica_itbms),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/motor/clasificar-lote
// Body: { transacciones: [{ id, descripcion, tipo, monto, banco, itbms, deducible }] }
router.post('/clasificar-lote', [
  body('transacciones').isArray({ min: 1 }).withMessage('Se requiere array de transacciones'),
], validate, async (req, res) => {
  try {
    const txs = req.body.transacciones;
    const clasificaciones = await clasificarLote(txs, req.user.id);
    const confianza = calcularConfianza(clasificaciones);

    const resultado = txs.map((tx, i) => ({
      id:            tx.id,
      descripcion:   tx.descripcion,
      clasificacion: clasificaciones[i],
    }));

    res.json({ total: txs.length, confianza, resultado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/motor/reglas-base — Reglas integradas del sistema
router.get('/reglas-base', (req, res) => {
  const reglas = REGLAS_BASE.map(r => ({
    patron:      r.patron.toString(),
    tipo:        r.tipo,
    cuenta_cargo:r.cargo,
    cuenta_abono:r.abono,
    aplica_itbms:r.aplica_itbms,
    deducible:   r.deducible,
    categoria:   r.categoria,
  }));
  res.json({ total: reglas.length, reglas });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ASIENTOS CONTABLES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/motor/generar-asiento/:txId
router.post('/generar-asiento/:txId', async (req, res) => {
  try {
    const asiento = await generarAsiento(req.params.txId, req.user.id);
    res.status(201).json(asiento);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/motor/generar-periodo
// Body: { periodo: 'YYYY-MM' }
router.post('/generar-periodo', [
  body('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido YYYY-MM'),
], validate, async (req, res) => {
  try {
    const resultado = await generarAsientosPeriodo(req.user.id, req.body.periodo);
    res.json(resultado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/motor/generar-diario?periodo=YYYY-MM
// Si no existen asientos, los genera automáticamente antes de devolver el diario
router.get('/generar-diario', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido YYYY-MM'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    // Verificar si ya hay asientos generados
    const { rows:[{ count }] } = await query(
      'SELECT COUNT(*) FROM asientos WHERE usuario_id=$1 AND periodo=$2', [uid, periodo]
    );

    let generacion = null;
    if (parseInt(count) === 0) {
      // Generar asientos automáticamente
      generacion = await generarAsientosPeriodo(uid, periodo);
    }

    // Obtener diario
    const diario = await obtenerDiario(uid, periodo);

    res.json({
      ...diario,
      auto_generado: generacion !== null,
      generacion_stats: generacion,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/motor/asientos?periodo=YYYY-MM&estado=confirmado
router.get('/asientos', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('estado').optional().isIn(['borrador','confirmado','anulado']),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, estado } = req.query;
    const conds = ['a.usuario_id=$1']; const params=[uid]; let i=2;
    if (periodo) { conds.push(`a.periodo=$${i++}`); params.push(periodo); }
    if (estado)  { conds.push(`a.estado=$${i++}`);  params.push(estado); }

    const { rows } = await query(`
      SELECT a.*, t.tipo AS tx_tipo, t.monto AS tx_monto
      FROM asientos a
      LEFT JOIN transacciones t ON t.id=a.transaccion_id
      WHERE ${conds.join(' AND ')}
      ORDER BY a.fecha ASC, a.numero_asiento ASC
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/motor/asientos/:id
router.get('/asientos/:id', async (req, res) => {
  try {
    const { rows:[asiento] } = await query(
      'SELECT * FROM asientos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]
    );
    if (!asiento) return res.status(404).json({ error: 'Asiento no encontrado' });

    const { rows:lineas } = await query(
      'SELECT * FROM asiento_lineas WHERE asiento_id=$1 ORDER BY orden ASC', [asiento.id]
    );

    const cuadre = validarCuadre(lineas);
    res.json({ ...asiento, lineas, cuadre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/motor/asientos/:id/confirmar
router.patch('/asientos/:id/confirmar', async (req, res) => {
  try {
    const { rows:[a] } = await query(
      `UPDATE asientos SET estado='confirmado' WHERE id=$1 AND usuario_id=$2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!a) return res.status(404).json({ error: 'Asiento no encontrado' });
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/motor/asientos/:id  (anular, no borrar físicamente)
router.delete('/asientos/:id', async (req, res) => {
  try {
    const { rows:[a] } = await query(
      `UPDATE asientos SET estado='anulado' WHERE id=$1 AND usuario_id=$2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!a) return res.status(404).json({ error: 'Asiento no encontrado' });
    res.json({ message: 'Asiento anulado', asiento: a });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  REGLAS PERSONALIZADAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/motor/reglas
router.get('/reglas', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM reglas_clasificacion WHERE usuario_id=$1 ORDER BY prioridad ASC',
      [req.user.id]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/motor/reglas
router.post('/reglas', [
  body('patron').trim().notEmpty().withMessage('Patrón requerido'),
  body('tipo_tx').isIn(['ingreso','gasto']).withMessage('tipo_tx inválido'),
  body('cuenta_cargo').trim().notEmpty().withMessage('Cuenta cargo requerida'),
  body('cuenta_abono').trim().notEmpty().withMessage('Cuenta abono requerida'),
], validate, async (req, res) => {
  try {
    const { patron, tipo_match='CONTAINS', tipo_tx, cuenta_cargo, cuenta_abono, aplica_itbms=false, deducible=false, prioridad=10 } = req.body;
    const { rows:[r] } = await query(`
      INSERT INTO reglas_clasificacion
        (usuario_id,patron,tipo_match,tipo_tx,cuenta_cargo,cuenta_abono,aplica_itbms,deducible,prioridad)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `,[req.user.id,patron,tipo_match,tipo_tx,cuenta_cargo,cuenta_abono,aplica_itbms,deducible,prioridad]);
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/motor/reglas/:id
router.put('/reglas/:id', async (req, res) => {
  try {
    const fields = ['patron','tipo_match','tipo_tx','cuenta_cargo','cuenta_abono','aplica_itbms','deducible','prioridad','activa'];
    const sets=[]; const params=[]; let i=1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f}=$${i++}`); params.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin campos' });
    params.push(req.params.id, req.user.id);
    const { rows:[r] } = await query(
      `UPDATE reglas_clasificacion SET ${sets.join(',')} WHERE id=$${i} AND usuario_id=$${i+1} RETURNING *`, params
    );
    if (!r) return res.status(404).json({ error: 'Regla no encontrada' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/motor/reglas/:id
router.delete('/reglas/:id', async (req, res) => {
  try {
    await query('DELETE FROM reglas_clasificacion WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Regla eliminada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ITBMS detallado desde asientos ──────────────────────────────────────────
// GET /api/motor/itbms-asientos?periodo=YYYY-MM
router.get('/itbms-asientos', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido'),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo } = req.query;

    const { rows } = await query(`
      SELECT
        al.cuenta_codigo,
        al.cuenta_nombre,
        al.es_itbms,
        SUM(al.debe)  AS total_debe,
        SUM(al.haber) AS total_haber,
        COUNT(*)      AS num_lineas
      FROM asiento_lineas al
      JOIN asientos a ON a.id=al.asiento_id
      WHERE a.usuario_id=$1 AND a.periodo=$2 AND a.estado!='anulado' AND al.es_itbms=true
      GROUP BY al.cuenta_codigo, al.cuenta_nombre, al.es_itbms
      ORDER BY al.cuenta_codigo
    `, [uid, periodo]);

    const debito_fiscal  = +rows.filter(r=>r.cuenta_codigo==='2201').reduce((s,r)=>s+parseFloat(r.total_haber),0).toFixed(2);
    const credito_fiscal = +rows.filter(r=>r.cuenta_codigo==='1301').reduce((s,r)=>s+parseFloat(r.total_debe),0).toFixed(2);

    res.json({
      periodo,
      detalle:         rows,
      debito_fiscal,
      credito_fiscal,
      saldo_pagar:     +(debito_fiscal - credito_fiscal).toFixed(2),
      tasa:            0.07,
      formulario:      '430-DGI',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
