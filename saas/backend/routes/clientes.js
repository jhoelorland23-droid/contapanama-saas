const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { registeredTransactionSql } = require('../services/transactionStatus');

const router = express.Router();
router.use(authMiddleware); // todas las rutas requieren login

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// ── GET /api/clientes ──────────────────────────────────────────────────────
router.get('/', [
  qv('search').optional().trim(),
  qv('estado').optional().isIn(['activo','inactivo','omiso']),
  qv('tipo').optional().isIn(['jurídica','natural']),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { search, estado, tipo } = req.query;
    const conds = ['c.usuario_id = $1'];
    const params = [uid];
    let i = 2;

    if (search) {
      conds.push(`(LOWER(c.nombre) LIKE $${i} OR c.ruc ILIKE $${i})`);
      params.push(`%${search.toLowerCase()}%`); i++;
    }
    if (estado) { conds.push(`c.estado = $${i++}`); params.push(estado); }
    if (tipo)   { conds.push(`c.tipo   = $${i++}`); params.push(tipo); }

    const { rows } = await query(`
      SELECT
        c.*,
        COUNT(t.id) AS total_transacciones,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0) AS total_ingresos,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto'),0)   AS total_gastos
      FROM clientes c
      LEFT JOIN transacciones t ON t.cliente_id = c.id AND t.usuario_id = c.usuario_id AND ${registeredTransactionSql('t')}
      WHERE ${conds.join(' AND ')}
      GROUP BY c.id
      ORDER BY c.nombre ASC
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/clientes/stats ────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE estado = 'activo')    AS activos,
        COUNT(*) FILTER (WHERE estado = 'inactivo')  AS inactivos,
        COUNT(*) FILTER (WHERE estado = 'omiso')     AS omisos,
        COUNT(*) FILTER (WHERE tipo  = 'jurídica')   AS juridicas,
        COUNT(*) FILTER (WHERE tipo  = 'natural')    AS naturales
      FROM clientes WHERE usuario_id = $1
    `, [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/clientes/:id/auditoria ───────────────────────────────────────
router.get('/:id/auditoria', async (req, res) => {
  try {
    const cliente = await query(
      'SELECT id FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!cliente.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });

    const { rows } = await query(`
      SELECT
        id,
        usuario_id,
        cliente_id,
        source_system,
        source_work_id,
        accion,
        objeto_tipo,
        objeto_id,
        antes_json,
        despues_json,
        created_at
      FROM audit_events
      WHERE cliente_id = $1
         OR (objeto_tipo = 'cliente' AND objeto_id = $2)
      ORDER BY created_at DESC
      LIMIT 80
    `, [req.params.id, req.params.id]);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/clientes/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/clientes ─────────────────────────────────────────────────────
router.post('/', [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('ruc').trim().notEmpty().withMessage('RUC requerido'),
  body('tipo').optional().isIn(['jurídica','natural']),
  body('contribuyente_itbms').optional().isBoolean(),
  body('regimen_fiscal').optional().isIn(['general','ampyme','no_contribuyente_itbms','exento']),
  body('periodo_fiscal').optional().isIn(['calendario','especial']),
  body('cierre_fiscal_mes').optional().isInt({ min: 1, max: 12 }),
  body('estado').optional().isIn(['activo','inactivo','omiso']),
  body('email').optional({ checkFalsy: true }).isEmail(),
], validate, async (req, res) => {
  try {
    const {
      nombre, ruc, nit='', tipo='jurídica',
      contribuyente_itbms=true, regimen_fiscal='general', periodo_fiscal='calendario', cierre_fiscal_mes=12,
      actividad='',
      estado='activo', telefono='', email='', direccion=''
    } = req.body;

    const { rows } = await query(`
      INSERT INTO clientes
        (usuario_id, nombre, ruc, nit, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes, actividad, estado, telefono, email, direccion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [req.user.id, nombre, ruc, nit, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes, actividad, estado, telefono, email, direccion]);

    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.user.id, rows[0].id, 'cliente_creado', 'cliente', rows[0].id, null, rows[0]]);

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese RUC' });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/clientes/:id ──────────────────────────────────────────────────
router.put('/:id', [
  body('nombre').optional().trim().notEmpty(),
  body('tipo').optional().isIn(['jurídica','natural']),
  body('contribuyente_itbms').optional().isBoolean(),
  body('regimen_fiscal').optional().isIn(['general','ampyme','no_contribuyente_itbms','exento']),
  body('periodo_fiscal').optional().isIn(['calendario','especial']),
  body('cierre_fiscal_mes').optional().isInt({ min: 1, max: 12 }),
  body('estado').optional().isIn(['activo','inactivo','omiso']),
  body('email').optional({ checkFalsy: true }).isEmail(),
], validate, async (req, res) => {
  try {
    const current = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });

    const fields = ['nombre','ruc','nit','tipo','contribuyente_itbms','regimen_fiscal','periodo_fiscal','cierre_fiscal_mes','actividad','estado','telefono','email','direccion'];
    const updates = []; const params = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos a actualizar' });
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE clientes SET ${updates.join(', ')} WHERE id = $${i} AND usuario_id = $${i+1} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.user.id, rows[0].id, 'cliente_actualizado', 'cliente', rows[0].id, current.rows[0], rows[0]]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese RUC' });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/clientes/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const cliente = rows[0];
    const txCount = await query(
      'SELECT COUNT(*)::INT AS total FROM transacciones WHERE cliente_id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (Number(txCount.rows[0].total) > 0) {
      return res.status(409).json({ error: `No se puede eliminar un cliente con ${txCount.rows[0].total} registro(s) contable(s). Cambie el estado a inactivo para conservar el historial.` });
    }
    await query(
      'DELETE FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      req.user.id,
      cliente.id,
      'cliente_eliminado',
      'cliente',
      cliente.id,
      cliente,
      { eliminada: true },
    ]);
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
