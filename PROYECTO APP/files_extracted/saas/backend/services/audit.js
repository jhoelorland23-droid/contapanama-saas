// ───────────────────────────────────────────────────────────────────
//  Service Audit — registro de auditoría
// ───────────────────────────────────────────────────────────────────
//  Llamar desde cualquier ruta crítica para registrar QUIÉN hizo QUÉ.
//
//  Uso típico:
//    await logAction(req, 'transaccion.create', 'transacciones', tx.id, { monto: 4200 });
//
//  Falla silenciosa: nunca debe romper el flujo principal.
//  Para diff de cambios pasa el "antes" como segundo objeto:
//    await logAction(req, 'cliente.update', 'clientes', id, { antes, despues });
// ───────────────────────────────────────────────────────────────────

const { query } = require('../db');

async function logAction(req, accion, entidad, entidadId, diff = null) {
  try {
    const usuarioId = req.user?.id || null;
    const portalId  = req.portal?.acceso_id || null;
    const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const ua        = req.headers['user-agent'] || null;

    await query(`
      INSERT INTO audit_log
        (usuario_id, cliente_portal_id, accion, entidad, entidad_id, diff, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [usuarioId, portalId, accion, entidad, entidadId, diff, ip, ua]);
  } catch (e) {
    // Audit no debe romper la request principal
    console.error('[audit]', e.message);
  }
}

// GET /api/audit?desde=&hasta=&accion=&entidad= — sólo admin
async function listLogs(uid, filtros = {}) {
  const conds = ['usuario_id = $1']; const params = [uid]; let i = 2;
  if (filtros.desde)   { conds.push(`created_at >= $${i++}`); params.push(filtros.desde); }
  if (filtros.hasta)   { conds.push(`created_at <= $${i++}`); params.push(filtros.hasta); }
  if (filtros.accion)  { conds.push(`accion = $${i++}`);      params.push(filtros.accion); }
  if (filtros.entidad) { conds.push(`entidad = $${i++}`);     params.push(filtros.entidad); }
  const limit = Math.min(parseInt(filtros.limit || 200), 500);
  const { rows } = await query(`
    SELECT id, accion, entidad, entidad_id, diff, ip, created_at
    FROM audit_log WHERE ${conds.join(' AND ')}
    ORDER BY created_at DESC LIMIT ${limit}
  `, params);
  return rows;
}

module.exports = { logAction, listLogs };
