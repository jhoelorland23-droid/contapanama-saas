const express = require('express');
const { query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

router.get('/', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
  qv('accion').optional().trim(),
  qv('limit').optional().isInt({ min: 1, max: 250 }).withMessage('Limit invalido'),
], validate, async (req, res) => {
  try {
    const conds = ['a.usuario_id = $1'];
    const params = [req.user.id];
    let i = 2;

    if (req.query.anio) {
      conds.push(`a.created_at >= $${i++}::date AND a.created_at < ($${i++}::date + INTERVAL '1 year')`);
      params.push(`${req.query.anio}-01-01`, `${req.query.anio}-01-01`);
    } else {
      const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
      conds.push(`a.created_at >= $${i++}::date AND a.created_at < ($${i++}::date + INTERVAL '1 month')`);
      params.push(`${periodo}-01`, `${periodo}-01`);
    }
    if (req.query.cliente_id) {
      conds.push(`a.cliente_id = $${i++}`);
      params.push(req.query.cliente_id);
    }
    if (req.query.accion) {
      conds.push(`a.accion = $${i++}`);
      params.push(req.query.accion);
    }

    const where = conds.join(' AND ');
    const limit = Math.min(Number(req.query.limit || 100), 250);
    const { rows } = await query(`
      SELECT
        a.id, a.created_at, a.accion, a.objeto_tipo, a.objeto_id,
        a.cliente_id, c.nombre AS cliente_nombre, c.ruc AS cliente_ruc,
        a.source_system, a.source_work_id, a.antes_json, a.despues_json
      FROM audit_events a
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE ${where}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `, params);
    const { rows: totals } = await query(`
      SELECT COUNT(*)::INT AS total
      FROM audit_events a
      WHERE ${where}
    `, params);
    res.json({
      alcance: req.query.anio ? 'anual' : 'mensual',
      periodo: req.query.anio ? null : (req.query.periodo || new Date().toISOString().slice(0, 7)),
      anio: req.query.anio ? Number(req.query.anio) : null,
      data: rows,
      total: totals[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
