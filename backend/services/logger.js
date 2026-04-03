'use strict';
/**
 * logger.js — Log de errores y alertas contables
 *
 * Persiste en tabla errores_contables.
 * Los errores NO son fatales — se guardan y se puede continuar.
 * El auditor puede revisar el log desde el frontend.
 */

const { query } = require('../db');

const TIPOS = {
  ASIENTO_NO_CUADRA:    'asiento_no_cuadra',
  CUENTA_INVALIDA:      'cuenta_invalida',
  ITBMS_INCONSISTENTE:  'itbms_inconsistente',
  DUPLICADO:            'duplicado',
  PRESTAMO_SIN_CONFIG:  'prestamo_sin_config',
  VALIDACION_FALLIDA:   'validacion_fallida',
  ITBMS_SIN_FACTURA:    'itbms_sin_factura',
  CUADRE_PERIODO:       'cuadre_periodo',
  IMPORTACION:          'importacion',
};

const SEV = { INFO: 'info', WARN: 'warning', ERROR: 'error', CRITICO: 'critico' };

async function log(uid, txId, tipo, descripcion, detalle = {}, severidad = SEV.ERROR) {
  try {
    const periodo = detalle.periodo || null;
    await query(`
      INSERT INTO errores_contables
        (usuario_id, transaccion_id, periodo, tipo_error, severidad, descripcion, detalle)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [uid, txId || null, periodo, tipo, severidad, descripcion, JSON.stringify(detalle)]);
  } catch (e) {
    // El log no debe romper el flujo principal
    console.error('[contabilidad:log] Error guardando log:', e.message);
  }
}

async function info  (uid, txId, tipo, desc, det = {}) { return log(uid, txId, tipo, desc, det, SEV.INFO); }
async function warn  (uid, txId, tipo, desc, det = {}) { return log(uid, txId, tipo, desc, det, SEV.WARN); }
async function error (uid, txId, tipo, desc, det = {}) { return log(uid, txId, tipo, desc, det, SEV.ERROR); }
async function critico(uid, txId, tipo, desc, det = {}) { return log(uid, txId, tipo, desc, det, SEV.CRITICO); }

/** Registrar errores de un asiento (array de errores del generarAsiento) */
async function logErroresAsiento(uid, tx, erroresArr) {
  for (const e of erroresArr) {
    await error(uid, tx.id, e.tipo || TIPOS.ASIENTO_NO_CUADRA, e.mensaje, {
      periodo:      tx.periodo,
      descripcion:  tx.descripcion,
      monto:        tx.monto,
    });
  }
}

/** Verificar cuadre de todo un período y logear las diferencias */
async function verificarCuadrePeriodo(uid, periodo) {
  const { rows } = await query(`
    SELECT fn_validar_cuadre_periodo($1, $2) AS resultado
  `, [uid, periodo]).catch(() => ({ rows: [] }));

  // Si la función no existe aún, usar query manual
  const { rows: checks } = await query(`
    SELECT
      a.transaccion_id,
      MIN(t.descripcion)                           AS descripcion,
      ROUND(SUM(a.debe)::numeric, 2)               AS total_debe,
      ROUND(SUM(a.haber)::numeric, 2)              AS total_haber,
      ROUND(ABS(SUM(a.debe) - SUM(a.haber))::numeric, 2) AS diferencia
    FROM asientos_contables a
    JOIN transacciones t ON t.id = a.transaccion_id
    WHERE a.usuario_id = $1 AND a.periodo = $2
    GROUP BY a.transaccion_id
    HAVING ABS(SUM(a.debe) - SUM(a.haber)) >= 0.02
    ORDER BY MIN(t.fecha)
  `, [uid, periodo]);

  for (const c of checks) {
    await critico(uid, c.transaccion_id, TIPOS.ASIENTO_NO_CUADRA,
      `Asiento no cuadra: debe=${c.total_debe} haber=${c.total_haber} diff=${c.diferencia}`,
      { periodo, descripcion: c.descripcion, diferencia: c.diferencia });
  }

  return checks;
}

/** Obtener errores pendientes de un período */
async function getErroresPendientes(uid, periodo = null, limit = 50) {
  const conds = ['usuario_id = $1', 'resuelto = false'];
  const p     = [uid]; let i = 2;
  if (periodo) { conds.push(`periodo = $${i++}`); p.push(periodo); }

  const { rows } = await query(`
    SELECT e.*, t.descripcion AS tx_descripcion, t.monto AS tx_monto
    FROM errores_contables e
    LEFT JOIN transacciones t ON t.id = e.transaccion_id
    WHERE ${conds.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT $${i}
  `, [...p, limit]);

  return rows;
}

/** Marcar error como resuelto */
async function resolver(uid, errorId) {
  const { rows } = await query(`
    UPDATE errores_contables SET resuelto=true, resuelto_en=NOW()
    WHERE id=$1 AND usuario_id=$2 RETURNING id
  `, [errorId, uid]);
  return rows.length > 0;
}

/** Stats de calidad para el dashboard */
async function getStats(uid, periodo = null) {
  const conds = ['usuario_id=$1']; const p=[uid]; let i=2;
  if (periodo) { conds.push(`periodo=$${i++}`); p.push(periodo); }
  const where = conds.join(' AND ');

  const { rows } = await query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE severidad='critico')       AS criticos,
      COUNT(*) FILTER (WHERE severidad='error')         AS errores,
      COUNT(*) FILTER (WHERE severidad='warning')       AS warnings,
      COUNT(*) FILTER (WHERE resuelto=false)            AS pendientes,
      COUNT(*) FILTER (WHERE resuelto=true)             AS resueltos
    FROM errores_contables WHERE ${where}
  `, p);

  return rows[0];
}

module.exports = {
  log, info, warn, error, critico,
  logErroresAsiento,
  verificarCuadrePeriodo,
  getErroresPendientes,
  resolver,
  getStats,
  TIPOS, SEV,
};
