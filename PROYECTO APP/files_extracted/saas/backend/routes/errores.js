'use strict';
/**
 * routes/errores.js — API del log de errores contables
 *
 * GET  /api/errores                    lista paginada
 * GET  /api/errores/stats              contadores por período
 * GET  /api/errores/cuadre/:periodo    verificar cuadre del período
 * PATCH /api/errores/:id/resolver      marcar como resuelto
 */

const express = require('express');
const { param, query: qv, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

const ok = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// GET /api/errores
router.get('/', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('severidad').optional().isIn(['info','warning','error','critico']),
  qv('resuelto').optional().isBoolean(),
], ok, async (req, res) => {
  try {
    const { periodo, severidad } = req.query;
    const resuelto = req.query.resuelto !== undefined
      ? req.query.resuelto === 'true'
      : null;

    const rows = await logger.getErroresPendientes(
      req.user.id,
      periodo || null,
      parseInt(req.query.limit) || 100,
    );

    // Filtros adicionales en memoria (pequeño volumen)
    const filtrados = rows.filter(r => {
      if (severidad && r.severidad !== severidad) return false;
      if (resuelto !== null && r.resuelto !== resuelto) return false;
      return true;
    });

    res.json({ data: filtrados, total: filtrados.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/errores/stats
router.get('/stats', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
], ok, async (req, res) => {
  try {
    const stats = await logger.getStats(req.user.id, req.query.periodo || null);
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/errores/cuadre/:periodo — verificar y registrar errores de cuadre
router.get('/cuadre/:periodo', [
  param('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período YYYY-MM requerido'),
], ok, async (req, res) => {
  try {
    const anomalias = await logger.verificarCuadrePeriodo(
      req.user.id,
      req.params.periodo,
    );
    res.json({
      periodo:  req.params.periodo,
      cuadra:   anomalias.length === 0,
      anomalias,
      mensaje:  anomalias.length === 0
        ? '✓ Todos los asientos del período cuadran correctamente.'
        : `⚠ ${anomalias.length} asiento(s) no cuadran. Revisa el log de errores.`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/errores/:id/resolver
router.patch('/:id/resolver', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const ok2 = await logger.resolver(req.user.id, req.params.id);
    if (!ok2) return res.status(404).json({ error: 'Error no encontrado' });
    res.json({ message: 'Marcado como resuelto' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/errores/calidad/:periodo — resumen completo de calidad del período
router.get('/calidad/:periodo', [
  param('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período YYYY-MM requerido'),
], ok, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.params.periodo;
    const { query } = require('../db');

    // 1. Métricas desde la vista
    const { rows: [cal] } = await query(`
      SELECT * FROM v_calidad_periodo
      WHERE usuario_id = $1 AND periodo = $2
    `, [uid, periodo]).catch(() => ({ rows: [{}] }));

    // Fallback manual si la vista no existe aún
    const metricas = cal || {};
    if (!cal) {
      const { rows: [m] } = await query(`
        SELECT
          COUNT(*)                                                         AS total_transacciones,
          COUNT(*) FILTER (WHERE cuenta_contable IS NULL)                  AS sin_clasificar,
          COUNT(*) FILTER (WHERE itbms > 0 AND NOT itbms_aplica
            AND COALESCE(itbms_exento,false)=false)                        AS itbms_sin_flag,
          COUNT(*) FILTER (WHERE itbms > 0 AND deducible
            AND NOT tiene_factura AND COALESCE(itbms_exento,false)=false)  AS itbms_sin_factura,
          COUNT(*) FILTER (WHERE asiento_generado=false)                   AS sin_asiento,
          COUNT(*) FILTER (WHERE COALESCE(itbms_exento,false)=true)        AS exentos,
          ROUND(SUM(monto) FILTER (WHERE tipo='ingreso')::NUMERIC,2)       AS total_ingresos,
          ROUND(SUM(monto) FILTER (WHERE tipo='gasto')::NUMERIC,2)         AS total_gastos
        FROM transacciones WHERE usuario_id=$1 AND periodo=$2
      `, [uid, periodo]);
      Object.assign(metricas, m || {});
    }

    // 2. Verificar cuadre de asientos
    const { rows: descuadres } = await query(`
      SELECT a.transaccion_id, MIN(t.descripcion) AS descripcion,
        ROUND(SUM(a.debe)::NUMERIC,2)  AS total_debe,
        ROUND(SUM(a.haber)::NUMERIC,2) AS total_haber,
        ROUND(ABS(SUM(a.debe)-SUM(a.haber))::NUMERIC,2) AS diferencia
      FROM asientos_contables a
      JOIN transacciones t ON t.id=a.transaccion_id
      WHERE a.usuario_id=$1 AND a.periodo=$2
      GROUP BY a.transaccion_id
      HAVING ABS(SUM(a.debe)-SUM(a.haber)) >= 0.02
    `, [uid, periodo]);

    // 3. Detectar duplicados potenciales (mismo monto+banco en misma semana)
    const { rows: duplicados } = await query(`
      SELECT fecha::text, monto::float, banco, COUNT(*) AS veces,
        array_agg(id::text) AS ids,
        MIN(descripcion) AS descripcion
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2 AND banco IS NOT NULL AND banco<>''
      GROUP BY fecha, monto, banco
      HAVING COUNT(*) > 1
    `, [uid, periodo]);

    // 4. Transacciones con ITBMS aplicado pero sin factura
    const { rows: sinFactura } = await query(`
      SELECT id, fecha::text, descripcion, monto::float, itbms::float, tipo
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2
        AND itbms > 0 AND itbms_aplica=true
        AND tipo='gasto' AND deducible=true
        AND tiene_factura=false
        AND COALESCE(itbms_exento,false)=false
      LIMIT 20
    `, [uid, periodo]);

    // 5. Gastos sin cuenta contable (clasificación incompleta)
    const { rows: sinCuentaRows } = await query(`
      SELECT id, fecha::text, descripcion, tipo, monto::float
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2
        AND cuenta_contable IS NULL
      ORDER BY fecha LIMIT 15
    `, [uid, periodo]);

    // 6. Cuentas no reconocidas (valor en cuenta_contable pero no en catálogo)
    const CATALOGO = require('../services/catalogo');
    const { rows: conCuenta } = await query(`
      SELECT id, fecha::text, descripcion, tipo, monto::float, cuenta_contable
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2
        AND cuenta_contable IS NOT NULL
      LIMIT 300
    `, [uid, periodo]);
    const cuentaVacia = conCuenta.filter(t =>
      t.cuenta_contable && !CATALOGO[t.cuenta_contable]
    ).slice(0, 10);

    // 7. Ingresos con ITBMS > 0 pero sin itbms_aplica (débito fiscal no marcado)
    const { rows: ingresosSinDebito } = await query(`
      SELECT id, fecha::text, descripcion, monto::float, itbms::float
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2
        AND tipo='ingreso'
        AND itbms > 0
        AND (itbms_aplica = false OR itbms_aplica IS NULL)
        AND COALESCE(itbms_exento, false) = false
      LIMIT 10
    `, [uid, periodo]);

    // 8. Transacciones marcadas como exentas pero con itbms > 0 (inconsistencia)
    const { rows: exentosConItbms } = await query(`
      SELECT id, fecha::text, descripcion, monto::float, itbms::float, tipo
      FROM transacciones
      WHERE usuario_id=$1 AND periodo=$2
        AND COALESCE(itbms_exento, false) = true
        AND itbms > 0
      LIMIT 10
    `, [uid, periodo]);

    // ── Score de calidad (0–100) ──────────────────────────────────────────
    const total = parseInt(metricas.total_transacciones) || 1;
    const penalizaciones = [
      (parseInt(metricas.sin_clasificar)    || 0) * 3,   // sin cuenta → -3 c/u
      (parseInt(metricas.sin_asiento)       || 0) * 2,   // sin asiento → -2
      (parseInt(metricas.itbms_sin_factura) || 0) * 2,   // sin factura → -2
      descuadres.length                     * 10,         // descuadre → -10 (crítico)
      duplicados.length                     * 5,          // duplicado → -5
      cuentaVacia.length                    * 4,          // cuenta inválida → -4
      ingresosSinDebito.length              * 3,          // ingreso sin débito → -3
      exentosConItbms.length                * 2,          // exento con ITBMS → -2
    ].reduce((a, b) => a + b, 0);

    const score = Math.max(0, Math.min(100,
      100 - Math.round((penalizaciones / total) * 100)
    ));

    res.json({
      periodo,
      score,
      nivel: score >= 90 ? 'excelente'
           : score >= 70 ? 'bueno'
           : score >= 50 ? 'regular'
           : 'requiere_atencion',
      metricas: {
        total_transacciones:      parseInt(metricas.total_transacciones) || 0,
        sin_clasificar:           parseInt(metricas.sin_clasificar)      || 0,
        sin_asiento:              parseInt(metricas.sin_asiento)         || 0,
        itbms_sin_factura:        parseInt(metricas.itbms_sin_factura)   || 0,
        itbms_sin_flag:           parseInt(metricas.itbms_sin_flag)      || 0,
        exentos:                  parseInt(metricas.exentos)             || 0,
        descuadres:               descuadres.length,
        duplicados_potenciales:   duplicados.length,
        cuentas_invalidas:        cuentaVacia.length,
        ingresos_sin_debito:      ingresosSinDebito.length,
        exentos_con_itbms:        exentosConItbms.length,
        total_ingresos:           parseFloat(metricas.total_ingresos)    || 0,
        total_gastos:             parseFloat(metricas.total_gastos)      || 0,
      },
      alertas: {
        descuadres,
        duplicados,
        sin_factura:      sinFactura,
        cuenta_invalida:  cuentaVacia,
        sin_cuenta:       sinCuentaRows,        // gastos sin clasificar
        ingreso_sin_debito: ingresosSinDebito,  // ingreso ITBMS no marcado
        exento_con_itbms: exentosConItbms,      // exento pero itbms > 0
      },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
