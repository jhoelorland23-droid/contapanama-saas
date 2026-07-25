const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// ── GET /api/transacciones ─────────────────────────────────────────────────
router.get('/', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('tipo').optional().isIn(['ingreso','gasto']),
  qv('cliente_id').optional().isUUID(),
  qv('desde').optional().isDate(),
  qv('hasta').optional().isDate(),
  qv('search').optional().trim(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, tipo, cliente_id, desde, hasta, search } = req.query;
    const conds = ['t.usuario_id = $1'];
    const params = [uid]; let i = 2;

    if (periodo)    { conds.push(`t.periodo = $${i++}`);               params.push(periodo); }
    if (tipo)       { conds.push(`t.tipo = $${i++}`);                  params.push(tipo); }
    if (cliente_id) { conds.push(`t.cliente_id = $${i++}`);            params.push(cliente_id); }
    if (desde)      { conds.push(`t.fecha >= $${i++}`);                params.push(desde); }
    if (hasta)      { conds.push(`t.fecha <= $${i++}`);                params.push(hasta); }
    if (search)     { conds.push(`t.descripcion ILIKE $${i++}`);       params.push(`%${search}%`); }

    const { rows } = await query(`
      SELECT t.*, c.ruc AS cliente_ruc, c.tipo AS cliente_tipo_persona
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY t.fecha DESC, t.created_at DESC
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/resumen ─────────────────────────────────────────
router.get('/resumen', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('desde').optional().isDate(),
  qv('hasta').optional().isDate(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, desde, hasta } = req.query;
    const conds = ['usuario_id = $1']; const params = [uid]; let i = 2;
    if (periodo) { conds.push(`periodo = $${i++}`); params.push(periodo); }
    if (desde)   { conds.push(`fecha >= $${i++}`);  params.push(desde); }
    if (hasta)   { conds.push(`fecha <= $${i++}`);  params.push(hasta); }

    const { rows } = await query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'), 0)::NUMERIC(14,2)              AS total_ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),   0)::NUMERIC(14,2)              AS total_gastos,
        (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2)            AS utilidad_neta,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='ingreso'), 0)::NUMERIC(14,2)             AS itbms_debito,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='gasto' AND deducible), 0)::NUMERIC(14,2) AS itbms_credito,
        (COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS itbms_neto,
        COUNT(*) FILTER (WHERE tipo='ingreso')                                             AS num_ingresos,
        COUNT(*) FILTER (WHERE tipo='gasto')                                               AS num_gastos,
        COUNT(DISTINCT cliente_id)                                                         AS num_clientes
      FROM transacciones WHERE ${conds.join(' AND ')}
    `, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/diario?periodo=YYYY-MM ──────────────────────────
// Diario combinado agrupado por fecha — listo para auditoría
router.get('/diario', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido YYYY-MM'),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.*, c.ruc AS cliente_ruc, c.tipo AS cliente_tipo_persona
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE t.usuario_id = $1 AND t.periodo = $2
      ORDER BY t.fecha ASC, t.created_at ASC
    `, [req.user.id, req.query.periodo]);

    // Agrupar por fecha
    const byDate = {};
    for (const r of rows) {
      const d = String(r.fecha).slice(0, 10);
      if (!byDate[d]) byDate[d] = { fecha: d, asientos: [], debe: 0, haber: 0 };
      byDate[d].asientos.push(r);
      if (r.tipo === 'ingreso') byDate[d].haber += parseFloat(r.monto);
      else                      byDate[d].debe  += parseFloat(r.monto);
    }

    const totalIngresos = rows.filter(r=>r.tipo==='ingreso').reduce((s,r)=>s+parseFloat(r.monto),0);
    const totalGastos   = rows.filter(r=>r.tipo==='gasto').reduce((s,r)=>s+parseFloat(r.monto),0);

    res.json({
      periodo: req.query.periodo,
      total_asientos: rows.length,
      total_ingresos: totalIngresos.toFixed(2),
      total_gastos:   totalGastos.toFixed(2),
      resultado:      (totalIngresos - totalGastos).toFixed(2),
      entradas:       Object.values(byDate),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/evolucion ──────────────────────────────────────
// Evolución mensual de ingresos y gastos para gráficas
router.get('/evolucion', async (req, res) => {
  try {
    const anio = req.query.anio || new Date().getFullYear();
    const { rows } = await query(`
      SELECT
        periodo,
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)   AS gastos,
        (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2) AS utilidad
      FROM transacciones
      WHERE usuario_id = $1 AND periodo LIKE $2
      GROUP BY periodo
      ORDER BY periodo ASC
    `, [req.user.id, `${anio}-%`]);
    res.json({ anio, meses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/:id ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/transacciones ────────────────────────────────────────────────
router.post('/', [
  body('fecha').isDate().withMessage('Fecha inválida'),
  body('descripcion').trim().notEmpty().withMessage('Descripción requerida'),
  body('tipo').isIn(['ingreso','gasto']).withMessage('Tipo inválido'),
  body('monto').isFloat({ min: 0.01 }).withMessage('Monto debe ser mayor a 0'),
  body('cliente_id').optional({ checkFalsy: true }).isUUID(),
  body('itbms').optional().isFloat({ min: 0 }),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const {
      cliente_id, cliente_nombre, fecha, descripcion, tipo,
      banco='', referencia='', notas='', deducible=false
    } = req.body;

    const monto = parseFloat(req.body.monto);
    // Calcular ITBMS al 7% si no viene explícito
    const itbms = req.body.itbms !== undefined
      ? parseFloat(req.body.itbms)
      : parseFloat((monto * 0.07).toFixed(2));
    const periodo = fecha.slice(0, 7);

    // Campos ITBMS / factura
    const tiene_factura  = req.body.tiene_factura  === true || req.body.tiene_factura === 'true';
    const itbms_exento   = req.body.itbms_exento   === true || req.body.itbms_exento  === 'true';
    const itbms_aplica   = req.body.itbms_aplica !== undefined
      ? (req.body.itbms_aplica === true || req.body.itbms_aplica === 'true')
      : (!itbms_exento && itbms > 0); // inferir si no viene explícito

    // ITBMS = 0 si exento
    const itbmsFinal = itbms_exento ? 0 : itbms;

    // ── Detección de duplicados ───────────────────────────────────────────
    if (banco && referencia) {
      const { rows: dup } = await query(`
        SELECT id FROM transacciones
        WHERE usuario_id=$1 AND fecha=$2 AND monto=$3
          AND banco=$4 AND referencia=$5 LIMIT 1
      `, [uid, fecha, monto, banco, referencia]);
      if (dup.length) {
        return res.status(409).json({
          error: 'Transacción duplicada detectada (misma fecha, monto, banco y referencia)',
          duplicado_id: dup[0].id,
        });
      }
    }

    // ── Resolver nombre del cliente ───────────────────────────────────────
    let nomCliente = cliente_nombre || null;
    if (cliente_id && !nomCliente) {
      const { rows: cl } = await query(
        'SELECT nombre FROM clientes WHERE id = $1 AND usuario_id = $2',
        [cliente_id, uid]
      );
      if (cl.length) nomCliente = cl[0].nombre;
    }

    const { rows } = await query(`
      INSERT INTO transacciones
        (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, tipo,
         monto, itbms, deducible, banco, referencia, periodo, notas,
         tiene_factura, itbms_exento, itbms_aplica)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [uid, cliente_id||null, nomCliente, fecha, descripcion, tipo,
        monto, itbmsFinal, deducible, banco, referencia, periodo, notas,
        tiene_factura, itbms_exento, itbms_aplica]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/transacciones/:id ─────────────────────────────────────────────
router.put('/:id', [
  body('monto').optional().isFloat({ min: 0.01 }),
  body('tipo').optional().isIn(['ingreso','gasto']),
  body('fecha').optional().isDate(),
], validate, async (req, res) => {
  try {
    const updatable = ['cliente_id','cliente_nombre','fecha','descripcion','tipo',
                       'monto','itbms','deducible','banco','referencia','notas'];
    const updates = []; const params = []; let i = 1;
    for (const f of updatable) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
    }
    if (req.body.fecha) { updates.push(`periodo = $${i++}`); params.push(req.body.fecha.slice(0,7)); }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos a actualizar' });
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE transacciones SET ${updates.join(', ')} WHERE id = $${i} AND usuario_id = $${i+1} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/transacciones/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ message: 'Transacción eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
