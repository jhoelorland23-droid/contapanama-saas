const express = require('express');
const { body, validationResult } = require('express-validator');
const { query }  = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router   = express.Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

const WA_TOKEN       = process.env.WHATSAPP_TOKEN;       // Meta Graph API token
const WA_PHONE_ID    = process.env.WHATSAPP_PHONE_ID;    // Phone Number ID
const WA_VERIFY_TOKEN= process.env.WHATSAPP_VERIFY_TOKEN || 'orlando_cpa_verify_2024';
const WA_NUMBER      = '+50769295152';

const waConfigured = () => !!(WA_TOKEN && WA_PHONE_ID);

// ─── HELPERS ──────────────────────────────────────────────────────────────
const waLink = (msg='') =>
  `https://wa.me/50769295152${msg ? '?text=' + encodeURIComponent(msg) : ''}`;

// Enviar mensaje via Meta Cloud API
async function sendWaMessage(to, text) {
  if (!waConfigured()) {
    return { ok: false, simulated: true, message: text, to };
  }
  const cleanPhone = to.replace(/\D/g, '');
  const resp = await fetch(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Error WhatsApp API');
  return { ok: true, wa_message_id: data.messages?.[0]?.id };
}

// ── GET /api/whatsapp/webhook  (verificación Meta) ─────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado correctamente');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── POST /api/whatsapp/webhook  (mensajes entrantes de Meta) ───────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ACK inmediato a Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;

        for (const msg of value.messages || []) {
          const telefono = msg.from;
          const nombre   = value.contacts?.find(c => c.wa_id === msg.from)?.profile?.name || 'Desconocido';
          const texto    = msg.text?.body || `[${msg.type}]`;
          const waId     = msg.id;

          // Buscar admin para asignar mensajes
          const adminRes = await query('SELECT id FROM usuarios WHERE rol=\'admin\' LIMIT 1');
          if (!adminRes.rows.length) continue;
          const uid = adminRes.rows[0].id;

          // Verificar si existe lead con ese teléfono
          const leadRes = await query(
            'SELECT id FROM leads WHERE telefono=$1 AND usuario_id=$2 LIMIT 1',
            [telefono, uid]
          );
          let leadId = leadRes.rows[0]?.id || null;

          // Si no existe lead, crearlo automáticamente
          if (!leadId) {
            const newLead = await query(`
              INSERT INTO leads (usuario_id, nombre, telefono, fuente, estado, mensaje)
              VALUES ($1,$2,$3,'whatsapp','nuevo',$4)
              RETURNING id
            `, [uid, nombre, telefono, texto]);
            leadId = newLead.rows[0]?.id;
          }

          // Registrar mensaje entrante
          await query(`
            INSERT INTO whatsapp_mensajes
              (usuario_id, lead_id, telefono, nombre, direccion, mensaje, tipo, estado, wa_message_id)
            VALUES ($1,$2,$3,$4,'entrante',$5,'text','leido',$6)
          `, [uid, leadId, telefono, nombre, texto, waId]);
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp webhook]', err.message);
  }
});

// ── Auth requerida desde aquí ──────────────────────────────────────────────
router.use(authMiddleware);

// ── GET /api/whatsapp/config ───────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    configurado: waConfigured(),
    numero: WA_NUMBER,
    links: {
      bienvenida:  waLink('Hola Orlando, me interesa una asesoría contable'),
      cotizacion:  waLink('Hola Orlando CPA, necesito una cotización de servicios'),
      declaracion: waLink('Hola, necesito ayuda con mi declaración de renta en Panamá'),
      itbms:       waLink('Hola Orlando, necesito asesoría con el ITBMS'),
      nomina:      waLink('Hola, me interesa el servicio de nómina'),
      empresa:     waLink('Hola, quiero constituir una empresa en Panamá'),
    },
    instrucciones_api: waConfigured() ? null : {
      pasos: [
        '1. Ve a developers.facebook.com y crea una app de tipo Business',
        '2. Agrega el producto WhatsApp Business Platform',
        '3. Copia el Token de Acceso Temporal (o permanente) → WHATSAPP_TOKEN',
        '4. Copia el Phone Number ID → WHATSAPP_PHONE_ID',
        '5. Configura el webhook en: https://tu-api.com/api/whatsapp/webhook',
        '6. Verify token: ' + WA_VERIFY_TOKEN,
      ],
    },
  });
});

// ── POST /api/whatsapp/send ────────────────────────────────────────────────
router.post('/send', [
  body('telefono').trim().notEmpty().withMessage('Teléfono requerido'),
  body('mensaje').trim().notEmpty().withMessage('Mensaje requerido'),
  body('lead_id').optional().isUUID(),
], validate, async (req, res) => {
  try {
    const { telefono, mensaje, lead_id } = req.body;
    const uid = req.user.id;

    const result = await sendWaMessage(telefono, mensaje);

    // Registrar en historial
    await query(`
      INSERT INTO whatsapp_mensajes
        (usuario_id, lead_id, telefono, direccion, mensaje, tipo, estado, wa_message_id)
      VALUES ($1,$2,$3,'saliente',$4,'text',$5,$6)
    `, [uid, lead_id||null, telefono, mensaje,
        result.ok ? 'enviado' : 'fallido',
        result.wa_message_id || null]);

    // Marcar lead como contactado
    if (lead_id) {
      await query(`
        UPDATE leads
        SET estado = CASE WHEN estado='nuevo' THEN 'contactado' ELSE estado END,
            whatsapp_enviado = true,
            ultimo_contacto  = NOW(),
            primer_contacto  = COALESCE(primer_contacto, NOW()),
            updated_at       = NOW()
        WHERE id=$1 AND usuario_id=$2
      `, [lead_id, uid]);
    }

    if (result.simulated) {
      return res.json({
        ok: true,
        simulado: true,
        aviso: 'WhatsApp API no configurada. Abre el link para enviar manualmente.',
        link: waLink(mensaje),
      });
    }
    res.json({ ok: true, wa_message_id: result.wa_message_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/historial ────────────────────────────────────────────
router.get('/historial', async (req, res) => {
  try {
    const { telefono, lead_id } = req.query;
    const conds = ['m.usuario_id=$1']; const params = [req.user.id]; let i = 2;
    if (telefono) { conds.push(`m.telefono=$${i++}`); params.push(telefono); }
    if (lead_id)  { conds.push(`m.lead_id=$${i++}`);  params.push(lead_id); }

    const { rows } = await query(`
      SELECT m.*, l.nombre AS lead_nombre
      FROM whatsapp_mensajes m
      LEFT JOIN leads l ON l.id = m.lead_id
      WHERE ${conds.join(' AND ')}
      ORDER BY m.created_at DESC LIMIT 100
    `, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/whatsapp/templates ────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM whatsapp_templates WHERE usuario_id=$1 AND activo=true ORDER BY categoria, nombre',
      [req.user.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/templates ───────────────────────────────────────────
router.post('/templates', [
  body('nombre').trim().notEmpty(),
  body('mensaje').trim().notEmpty(),
  body('categoria').optional().isIn(['bienvenida','cotizacion','recordatorio','seguimiento','cierre','general']),
], validate, async (req, res) => {
  try {
    const { nombre, mensaje, categoria='general' } = req.body;
    const { rows } = await query(`
      INSERT INTO whatsapp_templates (usuario_id, nombre, categoria, mensaje)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.user.id, nombre, mensaje, categoria]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/whatsapp/templates/:id ───────────────────────────────────────
router.put('/templates/:id', [
  body('nombre').optional().trim().notEmpty(),
  body('mensaje').optional().trim().notEmpty(),
  body('categoria').optional().isIn(['bienvenida','cotizacion','recordatorio','seguimiento','cierre','general']),
], validate, async (req, res) => {
  try {
    const fields = ['nombre','categoria','mensaje','activo'];
    const updates = []; const params = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${i++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos' });
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE whatsapp_templates SET ${updates.join(',')}
       WHERE id=$${i} AND usuario_id=$${i+1} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Template no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/whatsapp/templates/:id ────────────────────────────────────
router.delete('/templates/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM whatsapp_templates WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/templates/:id/usar ─────────────────────────────────
router.post('/templates/:id/usar', async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE whatsapp_templates SET usos=usos+1 WHERE id=$1 AND usuario_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
