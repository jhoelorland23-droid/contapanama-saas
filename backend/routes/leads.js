const express   = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query }  = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router  = express.Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

const FUENTES   = ['web','instagram','tiktok','whatsapp','referido','google','llamada','otro'];
const ESTADOS   = ['nuevo','contactado','calificado','propuesta','convertido','perdido'];
const PRIORIDADES = ['alta','media','baja'];

// ── POST /api/leads/publico  (sin auth — formulario del sitio web) ──────────
router.post('/publico', [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('telefono').optional().trim(),
  body('email').optional({ checkFalsy:true }).isEmail().withMessage('Email inválido'),
  body('servicio').optional().trim(),
  body('mensaje').optional().trim(),
  body('fuente').optional().isIn(FUENTES),
], validate, async (req, res) => {
  try {
    const { nombre, telefono='', email='', empresa='', servicio='', mensaje='', fuente='web' } = req.body;

    // Buscar el primer admin para asignar el lead
    const adminRes = await query(`SELECT id FROM usuarios WHERE rol='admin' LIMIT 1`);
    if (!adminRes.rows.length) return res.status(503).json({ error: 'Servicio no disponible' });
    const uid = adminRes.rows[0].id;

    const { rows } = await query(`
      INSERT INTO leads (usuario_id, nombre, telefono, email, empresa, servicio, mensaje, fuente)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, nombre, fuente, created_at
    `, [uid, nombre, telefono, email, empresa, servicio, mensaje, fuente]);

    res.status(201).json({ ok: true, lead: rows[0], whatsapp: `https://wa.me/50769295152?text=${encodeURIComponent(`Hola Orlando, soy ${nombre} y me contacté por su sitio web.`)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Auth requerida desde aquí ──────────────────────────────────────────────
router.use(authMiddleware);

// ── GET /api/leads/stats ───────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await query(`
      SELECT
        COUNT(*)                                             AS total,
        COUNT(*) FILTER (WHERE estado='nuevo')              AS nuevos,
        COUNT(*) FILTER (WHERE estado='contactado')         AS contactados,
        COUNT(*) FILTER (WHERE estado='calificado')         AS calificados,
        COUNT(*) FILTER (WHERE estado='propuesta')          AS propuestas,
        COUNT(*) FILTER (WHERE estado='convertido')         AS convertidos,
        COUNT(*) FILTER (WHERE estado='perdido')            AS perdidos,
        COUNT(*) FILTER (WHERE fuente='whatsapp')           AS desde_whatsapp,
        COUNT(*) FILTER (WHERE fuente='instagram')          AS desde_instagram,
        COUNT(*) FILTER (WHERE fuente='tiktok')             AS desde_tiktok,
        COUNT(*) FILTER (WHERE fuente='web')                AS desde_web,
        COUNT(*) FILTER (WHERE fuente='referido')           AS desde_referido,
        COALESCE(SUM(valor_estimado) FILTER (WHERE estado='convertido'),0) AS valor_convertido,
        COALESCE(SUM(valor_estimado),0)                     AS valor_pipeline,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE estado='convertido')
          / NULLIF(COUNT(*),0), 1
        )                                                   AS tasa_conversion,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS leads_mes
      FROM leads WHERE usuario_id = $1
    `, [uid]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads ─────────────────────────────────────────────────────────
router.get('/', [
  qv('estado').optional().isIn(ESTADOS),
  qv('fuente').optional().isIn(FUENTES),
  qv('search').optional().trim(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { estado, fuente, search } = req.query;
    const conds = ['usuario_id = $1']; const params = [uid]; let i = 2;

    if (estado) { conds.push(`estado = $${i++}`); params.push(estado); }
    if (fuente)  { conds.push(`fuente = $${i++}`); params.push(fuente); }
    if (search) {
      conds.push(`(LOWER(nombre) LIKE $${i} OR telefono ILIKE $${i} OR email ILIKE $${i})`);
      params.push(`%${search.toLowerCase()}%`); i++;
    }

    const { rows } = await query(`
      SELECT * FROM leads
      WHERE ${conds.join(' AND ')}
      ORDER BY
        CASE estado
          WHEN 'nuevo'      THEN 1
          WHEN 'contactado' THEN 2
          WHEN 'calificado' THEN 3
          WHEN 'propuesta'  THEN 4
          WHEN 'convertido' THEN 5
          WHEN 'perdido'    THEN 6
        END,
        CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        created_at DESC
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM leads WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leads ────────────────────────────────────────────────────────
router.post('/', [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('telefono').optional().trim(),
  body('email').optional({ checkFalsy:true }).isEmail(),
  body('fuente').optional().isIn(FUENTES),
  body('estado').optional().isIn(ESTADOS),
  body('prioridad').optional().isIn(PRIORIDADES),
  body('valor_estimado').optional().isFloat({ min:0 }),
], validate, async (req, res) => {
  try {
    const {
      nombre, telefono='', email='', empresa='', servicio='',
      mensaje='', fuente='web', estado='nuevo', prioridad='media',
      notas='', valor_estimado=null
    } = req.body;

    const { rows } = await query(`
      INSERT INTO leads
        (usuario_id, nombre, telefono, email, empresa, servicio,
         mensaje, fuente, estado, prioridad, notas, valor_estimado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [req.user.id, nombre, telefono, email, empresa, servicio,
        mensaje, fuente, estado, prioridad, notas, valor_estimado]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/leads/:id ─────────────────────────────────────────────────────
router.put('/:id', [
  body('nombre').optional().trim().notEmpty(),
  body('email').optional({ checkFalsy:true }).isEmail(),
  body('fuente').optional().isIn(FUENTES),
  body('estado').optional().isIn(ESTADOS),
  body('prioridad').optional().isIn(PRIORIDADES),
  body('valor_estimado').optional().isFloat({ min:0 }),
], validate, async (req, res) => {
  try {
    const fields = ['nombre','telefono','email','empresa','servicio','mensaje',
                    'fuente','estado','prioridad','notas','valor_estimado',
                    'whatsapp_enviado','primer_contacto','ultimo_contacto'];
    const updates = []; const params = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${i++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos a actualizar' });
    updates.push(`updated_at=NOW()`);
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE leads SET ${updates.join(',')} WHERE id=$${i} AND usuario_id=$${i+1} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/leads/:id/estado  (mover en el pipeline) ───────────────────
router.patch('/:id/estado', [
  body('estado').isIn(ESTADOS).withMessage('Estado inválido'),
], validate, async (req, res) => {
  try {
    const extras = req.body.estado === 'contactado'
      ? ', primer_contacto = COALESCE(primer_contacto, NOW()), ultimo_contacto = NOW()'
      : req.body.estado !== 'nuevo' ? ', ultimo_contacto = NOW()' : '';

    const { rows } = await query(
      `UPDATE leads SET estado=$1, updated_at=NOW()${extras}
       WHERE id=$2 AND usuario_id=$3 RETURNING *`,
      [req.body.estado, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/leads/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM leads WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
