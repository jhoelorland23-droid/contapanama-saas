const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { procesarEvento } = require('../services/socialMedia');

// ─── WEBHOOK INSTAGRAM ────────────────────────────────────────────────────

// Verificación del webhook (Meta lo llama al registrar)
router.get('/webhook/instagram', (req, res) => {
  const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'contapanama_ig_verify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Recibir eventos de Instagram
router.post('/webhook/instagram', async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta
  try {
    const body = req.body;
    if (body.object !== 'instagram' && body.object !== 'page') return;

    for (const entry of body.entry || []) {
      const pageId = entry.id;

      // Buscar el usuario dueño de esta página
      const { rows } = await query(
        `SELECT usuario_id FROM social_media_config WHERE page_id = $1 AND plataforma = 'instagram' AND activo = true`,
        [pageId]
      );
      if (!rows.length) continue;
      const usuarioId = rows[0].usuario_id;

      // Comentarios en publicaciones
      for (const change of entry.changes || []) {
        if (change.field === 'comments' && change.value) {
          const v = change.value;
          await procesarEvento({
            usuarioId,
            plataforma: 'instagram',
            tipo: 'comentario',
            remitenteId: v.from?.id,
            remitenteNombre: v.from?.name,
            mensaje: v.text || '',
            metadatos: { commentId: v.id },
          });
        }
      }

      // Mensajes directos (messaging)
      for (const msg of entry.messaging || []) {
        if (msg.message && !msg.message.is_echo) {
          await procesarEvento({
            usuarioId,
            plataforma: 'instagram',
            tipo: 'dm',
            remitenteId: msg.sender?.id,
            remitenteNombre: null,
            mensaje: msg.message.text || '',
            metadatos: {},
          });
        }
      }
    }
  } catch (err) {
    console.error('[instagram webhook]', err.message);
  }
});

// ─── WEBHOOK TIKTOK ────────────────────────────────────────────────────────

router.post('/webhook/tiktok', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (!body.event) return;

    const openId = body.user?.open_id || body.open_id;
    if (!openId) return;

    const { rows } = await query(
      `SELECT usuario_id FROM social_media_config WHERE account_id = $1 AND plataforma = 'tiktok' AND activo = true`,
      [openId]
    );
    if (!rows.length) return;
    const usuarioId = rows[0].usuario_id;

    if (body.event === 'comment.create') {
      const c = body.comment || {};
      await procesarEvento({
        usuarioId,
        plataforma: 'tiktok',
        tipo: 'comentario',
        remitenteId: c.user?.open_id,
        remitenteNombre: c.user?.display_name,
        mensaje: c.text || '',
        metadatos: { videoId: c.video_id, commentId: c.id },
      });
    }
  } catch (err) {
    console.error('[tiktok webhook]', err.message);
  }
});

// ─── CONFIG (requiere auth) ────────────────────────────────────────────────

// GET /api/social/config — obtener configuración del usuario
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, plataforma, activo, page_id, account_id, nombre_negocio,
              mensaje_bienvenida, prompt_contexto, responder_comentarios,
              responder_dm, solo_preguntas, token_expiry, created_at, updated_at
       FROM social_media_config WHERE usuario_id = $1 ORDER BY plataforma`,
      [req.user.id]
    );
    res.json({ configs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/social/config/:plataforma — crear o actualizar config
router.put('/config/:plataforma', authMiddleware, async (req, res) => {
  const { plataforma } = req.params;
  if (!['instagram', 'tiktok'].includes(plataforma)) {
    return res.status(400).json({ error: 'Plataforma inválida' });
  }

  const {
    activo, access_token, page_id, account_id,
    nombre_negocio, mensaje_bienvenida, prompt_contexto,
    responder_comentarios, responder_dm, solo_preguntas,
  } = req.body;

  try {
    const { rows } = await query(
      `INSERT INTO social_media_config
        (usuario_id, plataforma, activo, access_token, page_id, account_id,
         nombre_negocio, mensaje_bienvenida, prompt_contexto,
         responder_comentarios, responder_dm, solo_preguntas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (usuario_id, plataforma) DO UPDATE SET
         activo               = EXCLUDED.activo,
         access_token         = COALESCE(EXCLUDED.access_token, social_media_config.access_token),
         page_id              = COALESCE(EXCLUDED.page_id, social_media_config.page_id),
         account_id           = COALESCE(EXCLUDED.account_id, social_media_config.account_id),
         nombre_negocio       = EXCLUDED.nombre_negocio,
         mensaje_bienvenida   = EXCLUDED.mensaje_bienvenida,
         prompt_contexto      = EXCLUDED.prompt_contexto,
         responder_comentarios= EXCLUDED.responder_comentarios,
         responder_dm         = EXCLUDED.responder_dm,
         solo_preguntas       = EXCLUDED.solo_preguntas
       RETURNING id, plataforma, activo, page_id, account_id, nombre_negocio,
                 responder_comentarios, responder_dm, solo_preguntas, updated_at`,
      [req.user.id, plataforma,
       activo ?? false,
       access_token || null,
       page_id || null,
       account_id || null,
       nombre_negocio || null,
       mensaje_bienvenida || null,
       prompt_contexto || null,
       responder_comentarios ?? true,
       responder_dm ?? true,
       solo_preguntas ?? true,
      ]
    );
    res.json({ config: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/logs — historial de respuestas automáticas
router.get('/logs', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const plataforma = req.query.plataforma;
  try {
    const params = [req.user.id, limit];
    const filtro = plataforma ? `AND plataforma = $3` : '';
    if (plataforma) params.push(plataforma);

    const { rows } = await query(
      `SELECT id, plataforma, tipo, remitente_nombre, mensaje_entrada,
              mensaje_salida, es_pregunta, respondido, error, created_at
       FROM social_media_logs
       WHERE usuario_id = $1 ${filtro}
       ORDER BY created_at DESC LIMIT $2`,
      params
    );
    res.json({ logs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/stats — estadísticas básicas
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         plataforma,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE respondido) AS respondidos,
         COUNT(*) FILTER (WHERE tipo='dm') AS dms,
         COUNT(*) FILTER (WHERE tipo='comentario') AS comentarios,
         COUNT(*) FILTER (WHERE es_pregunta) AS preguntas
       FROM social_media_logs
       WHERE usuario_id = $1
       GROUP BY plataforma`,
      [req.user.id]
    );
    res.json({ stats: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
