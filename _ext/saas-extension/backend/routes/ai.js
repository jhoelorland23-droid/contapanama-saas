// ───────────────────────────────────────────────────────────────────
//  /api/ai — Asistente IA contable
// ───────────────────────────────────────────────────────────────────
//  POST  /api/ai/chat                ← envía mensaje, recibe respuesta
//  GET   /api/ai/conversaciones      ← lista conversaciones del usuario
//  GET   /api/ai/conversaciones/:id  ← una conversación con todos sus mensajes
//  DELETE /api/ai/conversaciones/:id
//  PATCH  /api/ai/conversaciones/:id ← rename / pin
//  GET   /api/ai/usage               ← uso del período actual
// ───────────────────────────────────────────────────────────────────

const express = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const ai = require('../services/ai');
const { logAction } = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ===================================================================
//  POST /api/ai/chat
//  body: { mensaje, conversacion_id?, modelo? }
//  Construye el contexto del despacho desde Postgres (numbers reales)
//  y se lo pasa al modelo en el system prompt.
// ===================================================================
router.post('/chat', [
  body('mensaje').isString().isLength({ min: 1, max: 4000 }),
  body('conversacion_id').optional().isUUID(),
  body('modelo').optional().isString(),
], validate, async (req, res) => {
  const uid = req.user.id;
  const { mensaje, modelo } = req.body;
  let conversacionId = req.body.conversacion_id;

  try {
    // 1) Crear o cargar conversación
    if (!conversacionId) {
      const titulo = mensaje.slice(0, 80);
      const r = await query(`
        INSERT INTO ai_conversaciones (usuario_id, titulo, modelo)
        VALUES ($1, $2, $3) RETURNING id
      `, [uid, titulo, modelo || 'claude-haiku']);
      conversacionId = r.rows[0].id;
    } else {
      const r = await query(`SELECT id FROM ai_conversaciones WHERE id=$1 AND usuario_id=$2`,
        [conversacionId, uid]);
      if (!r.rows.length) return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // 2) Construir contexto financiero del usuario (período actual)
    const contexto = await construirContexto(uid);

    // 3) Recuperar historial de la conversación
    const { rows: historial } = await query(`
      SELECT rol, contenido FROM ai_mensajes
      WHERE conversacion_id = $1 ORDER BY created_at ASC LIMIT 50
    `, [conversacionId]);

    // 4) Guardar mensaje del usuario
    await query(`
      INSERT INTO ai_mensajes (conversacion_id, rol, contenido)
      VALUES ($1, 'user', $2)
    `, [conversacionId, mensaje]);

    // 5) Llamar al modelo
    let reply;
    try {
      reply = await ai.completar({
        mensajes: [...historial, { rol: 'user', contenido: mensaje }],
        contexto,
        modelo: modelo || 'claude-haiku',
      });
    } catch (e) {
      await query(`
        INSERT INTO ai_mensajes (conversacion_id, rol, contenido, contexto)
        VALUES ($1, 'system', $2, $3)
      `, [conversacionId, `Error: ${e.message}`, { error: true }]);
      return res.status(502).json({ error: 'El modelo no respondió', detalle: e.message });
    }

    // 6) Guardar respuesta + actualizar usage
    await query(`
      INSERT INTO ai_mensajes (conversacion_id, rol, contenido, tokens_in, tokens_out, costo_usd, contexto)
      VALUES ($1, 'assistant', $2, $3, $4, $5, $6)
    `, [conversacionId, reply.texto, reply.tokens_in, reply.tokens_out, reply.costo_usd, { contextoUsado: contexto }]);

    const periodo = new Date().toISOString().slice(0, 7);
    await query(`
      INSERT INTO ai_usage (usuario_id, periodo, llamadas, tokens_in, tokens_out, costo_usd)
      VALUES ($1, $2, 1, $3, $4, $5)
      ON CONFLICT (usuario_id, periodo) DO UPDATE SET
        llamadas = ai_usage.llamadas + 1,
        tokens_in = ai_usage.tokens_in + EXCLUDED.tokens_in,
        tokens_out = ai_usage.tokens_out + EXCLUDED.tokens_out,
        costo_usd = ai_usage.costo_usd + EXCLUDED.costo_usd
    `, [uid, periodo, reply.tokens_in, reply.tokens_out, reply.costo_usd]);

    await logAction(req, 'ai.chat', 'ai_conversaciones', conversacionId, {
      tokens: reply.tokens_in + reply.tokens_out,
      costo: reply.costo_usd,
    });

    res.json({
      conversacion_id: conversacionId,
      respuesta: reply.texto,
      tokens_in: reply.tokens_in,
      tokens_out: reply.tokens_out,
      costo_usd: reply.costo_usd,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  GET /api/ai/conversaciones
// ===================================================================
router.get('/conversaciones', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM ai_mensajes m WHERE m.conversacion_id = c.id) AS num_mensajes,
        (SELECT created_at FROM ai_mensajes m WHERE m.conversacion_id = c.id ORDER BY created_at DESC LIMIT 1) AS ultimo_mensaje_at
      FROM ai_conversaciones c
      WHERE c.usuario_id = $1
      ORDER BY pinned DESC, ultimo_mensaje_at DESC NULLS LAST
      LIMIT 100
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  GET /api/ai/conversaciones/:id — con todos sus mensajes
// ===================================================================
router.get('/conversaciones/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rows: conv } = await query(`
      SELECT * FROM ai_conversaciones WHERE id=$1 AND usuario_id=$2
    `, [req.params.id, req.user.id]);
    if (!conv.length) return res.status(404).json({ error: 'Conversación no encontrada' });

    const { rows: mensajes } = await query(`
      SELECT id, rol, contenido, tokens_in, tokens_out, created_at
      FROM ai_mensajes WHERE conversacion_id=$1 ORDER BY created_at ASC
    `, [req.params.id]);

    res.json({ ...conv[0], mensajes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/conversaciones/:id', [
  param('id').isUUID(),
  body('titulo').optional().isString().isLength({ max: 200 }),
  body('pinned').optional().isBoolean(),
], validate, async (req, res) => {
  try {
    const sets = []; const params = []; let i = 1;
    if ('titulo' in req.body) { sets.push(`titulo=$${i++}`); params.push(req.body.titulo); }
    if ('pinned' in req.body) { sets.push(`pinned=$${i++}`); params.push(req.body.pinned); }
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id, req.user.id);
    await query(`UPDATE ai_conversaciones SET ${sets.join(', ')} WHERE id=$${i++} AND usuario_id=$${i}`, params);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/conversaciones/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    await query(`DELETE FROM ai_conversaciones WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  GET /api/ai/usage — uso del usuario
// ===================================================================
router.get('/usage', async (req, res) => {
  try {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const { rows } = await query(`
      SELECT * FROM ai_usage WHERE usuario_id=$1 AND periodo=$2
    `, [req.user.id, periodo]);
    res.json(rows[0] || { periodo, llamadas: 0, tokens_in: 0, tokens_out: 0, costo_usd: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  HELPERS
// ===================================================================
// Construye el contexto financiero que se le pasa al modelo en cada
// llamada. Mantén esto barato: agregados, no detalle.
async function construirContexto(uid) {
  const periodo = new Date().toISOString().slice(0, 7);
  const [fin, clientes, top, vencimientos] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::numeric(14,2) AS ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::numeric(14,2)   AS gastos,
        COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)::numeric(14,2) AS itbms_debito,
        COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0)::numeric(14,2) AS itbms_credito
      FROM transacciones WHERE usuario_id=$1 AND periodo=$2
    `, [uid, periodo]),
    query(`
      SELECT COUNT(*) FILTER (WHERE estado='activo') AS activos,
             COUNT(*) FILTER (WHERE estado='omiso')  AS omisos,
             COUNT(*) AS total
      FROM clientes WHERE usuario_id=$1
    `, [uid]),
    query(`
      SELECT cliente_nombre, SUM(monto)::numeric(14,2) AS total
      FROM transacciones
      WHERE usuario_id=$1 AND tipo='ingreso' AND periodo=$2 AND cliente_nombre IS NOT NULL
      GROUP BY cliente_nombre ORDER BY total DESC LIMIT 5
    `, [uid, periodo]),
    query(`
      SELECT descripcion, entidad, fecha, urgencia
      FROM vencimientos WHERE usuario_id=$1 AND completado=false
      ORDER BY fecha ASC LIMIT 5
    `, [uid]),
  ]);

  const f = fin.rows[0];
  return {
    periodo,
    financiero: {
      ingresos: parseFloat(f.ingresos),
      gastos: parseFloat(f.gastos),
      utilidad: parseFloat(f.ingresos) - parseFloat(f.gastos),
      itbms_neto: parseFloat(f.itbms_debito) - parseFloat(f.itbms_credito),
    },
    clientes: clientes.rows[0],
    top_clientes: top.rows,
    vencimientos: vencimientos.rows,
    reglas_panama: {
      itbms_tasa: 0.07,
      isr_juridica: 0.25,
      f430_vence: 'día 15 del mes siguiente',
    },
  };
}

module.exports = router;
