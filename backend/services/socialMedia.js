require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Detección de preguntas ────────────────────────────────────────────────
const QUESTION_PATTERNS = [
  /\?/,
  /\b(cómo|como|cuánto|cuanto|cuándo|cuando|dónde|donde|qué|que|quién|quien|cuál|cual)\b/i,
  /\b(precio|costo|valor|tarifa|plan|cobran|cobras|cuesta|cuestan)\b/i,
  /\b(disponible|disponibles|tienen|tienes|ofrecen|ofrece|hacen|hace)\b/i,
  /\b(información|info|detalles|más información|más info)\b/i,
  /\b(contacto|contactar|hablar|llamar|escribir)\b/i,
  /\b(horario|horarios|atienden|atención)\b/i,
];

function esPreguntas(texto) {
  return QUESTION_PATTERNS.some((p) => p.test(texto));
}

// ─── Claude AI: generar respuesta ─────────────────────────────────────────
async function generarRespuesta(mensaje, config) {
  const contexto = config.prompt_contexto ||
    `Eres el asistente de atención al cliente de ${config.nombre_negocio || 'este negocio'}.
Responde de forma amable, breve y profesional en español.
Si no puedes responder algo con certeza, invita al usuario a contactar directamente.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: contexto,
    messages: [{ role: 'user', content: mensaje }],
  });

  return response.content[0].text.trim();
}

// ─── Instagram Graph API ───────────────────────────────────────────────────
async function instagramReplyComment(accessToken, commentId, mensaje) {
  const url = `https://graph.facebook.com/v21.0/${commentId}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensaje, access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Instagram comment reply error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function instagramSendDM(accessToken, pageId, recipientId, mensaje) {
  const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: mensaje },
      access_token: accessToken,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Instagram DM error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ─── TikTok API ────────────────────────────────────────────────────────────
async function tiktokReplyComment(accessToken, videoId, commentId, mensaje) {
  const url = 'https://open.tiktokapis.com/v2/comment/reply/';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ video_id: videoId, parent_comment_id: commentId, text: mensaje }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`TikTok comment reply error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ─── Procesador principal ─────────────────────────────────────────────────

async function procesarEvento({ usuarioId, plataforma, tipo, remitenteId, remitenteNombre, mensaje, metadatos }) {
  // Obtener config activa del usuario para esta plataforma
  const { rows } = await query(
    `SELECT * FROM social_media_config
     WHERE usuario_id = $1 AND plataforma = $2 AND activo = true`,
    [usuarioId, plataforma]
  );
  if (!rows.length) return { ok: false, razon: 'sin_config' };

  const config = rows[0];

  // Verificar si el tipo de interacción está habilitado
  if (tipo === 'comentario' && !config.responder_comentarios) return { ok: false, razon: 'comentarios_desactivados' };
  if (tipo === 'dm' && !config.responder_dm) return { ok: false, razon: 'dm_desactivado' };

  const esPregunta = esPreguntas(mensaje);
  if (config.solo_preguntas && !esPregunta) {
    await registrarLog({ usuarioId, configId: config.id, plataforma, tipo, remitenteId, remitenteNombre, mensaje, esPregunta, respondido: false });
    return { ok: false, razon: 'no_es_pregunta' };
  }

  let respuesta = null;
  let error = null;

  try {
    respuesta = await generarRespuesta(mensaje, config);

    if (plataforma === 'instagram') {
      if (tipo === 'comentario' && metadatos?.commentId) {
        await instagramReplyComment(config.access_token, metadatos.commentId, respuesta);
      } else if (tipo === 'dm') {
        await instagramSendDM(config.access_token, config.page_id, remitenteId, respuesta);
      }
    } else if (plataforma === 'tiktok') {
      if (tipo === 'comentario' && metadatos?.videoId && metadatos?.commentId) {
        await tiktokReplyComment(config.access_token, metadatos.videoId, metadatos.commentId, respuesta);
      }
    }
  } catch (e) {
    error = e.message;
    console.error(`[socialMedia] Error al responder (${plataforma}/${tipo}):`, e.message);
  }

  await registrarLog({
    usuarioId, configId: config.id, plataforma, tipo,
    remitenteId, remitenteNombre, mensaje,
    respuesta, esPregunta,
    respondido: !error,
    error,
  });

  return { ok: !error, respuesta, error };
}

async function registrarLog({ usuarioId, configId, plataforma, tipo, remitenteId, remitenteNombre, mensaje, respuesta, esPregunta, respondido, error }) {
  await query(
    `INSERT INTO social_media_logs
      (usuario_id, config_id, plataforma, tipo, remitente_id, remitente_nombre,
       mensaje_entrada, mensaje_salida, es_pregunta, respondido, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [usuarioId, configId || null, plataforma, tipo, remitenteId || null, remitenteNombre || null,
     mensaje, respuesta || null, esPregunta, respondido, error || null]
  );
}

module.exports = { procesarEvento, esPreguntas, generarRespuesta };
