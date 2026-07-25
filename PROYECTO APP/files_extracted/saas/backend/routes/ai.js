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
  // Usa el período más reciente con movimientos; si no hay, el mes actual.
  const prq = await query(
    `SELECT periodo FROM transacciones WHERE usuario_id=$1 ORDER BY periodo DESC LIMIT 1`,
    [uid]
  );
  const periodo = prq.rows[0]?.periodo || new Date().toISOString().slice(0, 7);
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

// ===================================================================
//  POST /api/ai/sugerir-cuenta
//  body: { descripcion, tipo, monto, cliente_id?, cliente_nombre? }
//  Sugiere una cuenta contable basándose en:
//   1) Historial: ¿este cliente ya tiene una cuenta dominante para este tipo?
//   2) Heurística: keywords en la descripción
// ===================================================================
const REGLAS = [
  { kws: ['honorario','asesor','consulto','auditor','servicio profesional','contabilidad mensual','servicios contables'], tipo: 'ingreso', cta: '4101', nombre: 'Ingresos por servicios', conf: 92 },
  { kws: ['venta','factura','factur'], tipo: 'ingreso', cta: '4101', nombre: 'Ingresos por servicios', conf: 80 },
  { kws: ['alquiler','renta','inmobiliaria'], tipo: 'gasto', cta: '5210', nombre: 'Alquileres', conf: 92 },
  { kws: ['gasolina','combustible','peaje','texaco','puma','delta'], tipo: 'gasto', cta: '5240', nombre: 'Transporte', conf: 94 },
  { kws: ['internet','telefon','+móvil','cable onda','tigo','claro'], tipo: 'gasto', cta: '5310', nombre: 'Servicios públicos', conf: 92 },
  { kws: ['agua','luz','electricidad','elektra','idaan'], tipo: 'gasto', cta: '5310', nombre: 'Servicios públicos', conf: 92 },
  { kws: ['papel','oficina','office depot','pricesmart','suministro','útil'], tipo: 'gasto', cta: '5260', nombre: 'Materiales oficina', conf: 88 },
  { kws: ['legal','bufete','abogado','notar'], tipo: 'gasto', cta: '5340', nombre: 'Honorarios legales', conf: 90 },
  { kws: ['hotel','restaurante','felipe motta','riba smith','atenci'], tipo: 'gasto', cta: '5410', nombre: 'Atenciones a clientes', conf: 78 },
  { kws: ['comisión banca','comision banca','cargo banca','mantenimiento cuenta'], tipo: 'gasto', cta: '5510', nombre: 'Gastos financieros', conf: 90 },
  { kws: ['préstamo','prestamo','cuota','interés','interes banco'], tipo: 'gasto', cta: '2110', nombre: 'Préstamos por pagar', conf: 86 },
  { kws: ['compra material','construcción','obra'], tipo: 'gasto', cta: '5120', nombre: 'Costos de obra', conf: 84 },
  { kws: ['anticipo','adelanto'], tipo: 'ingreso', cta: '2105', nombre: 'Anticipos de clientes', conf: 82 },
];

router.post('/sugerir-cuenta', async (req, res) => {
  try {
    const uid = req.user.id;
    const { descripcion = '', tipo, cliente_id } = req.body;
    const desc = String(descripcion).toLowerCase();

    // 1) Historial del cliente — cuenta más frecuente para este tipo
    if (cliente_id) {
      const { rows } = await query(`
        SELECT cuenta_contable, COUNT(*) AS n
        FROM transacciones
        WHERE usuario_id=$1 AND cliente_id=$2 AND tipo=$3 AND cuenta_contable IS NOT NULL
        GROUP BY cuenta_contable
        ORDER BY n DESC LIMIT 1
      `, [uid, cliente_id, tipo]);
      if (rows.length) {
        const cta = String(rows[0].cuenta_contable);
        const m = cta.match(/^(\d+)\s*(.*)$/);
        return res.json({
          cuenta: m ? m[1] : cta,
          nombre: m ? m[2].trim() : null,
          confianza: Math.min(96, 75 + Math.min(20, parseInt(rows[0].n) * 4)),
          razon: `Usaste esta cuenta ${rows[0].n} vez${rows[0].n > 1 ? 'es' : ''} antes con este cliente`,
        });
      }
    }

    // 2) Heurística por keywords (respeta tipo si viene)
    for (const r of REGLAS) {
      if (tipo && r.tipo && r.tipo !== tipo) continue;
      if (r.kws.some(k => desc.includes(k))) {
        return res.json({ cuenta: r.cta, nombre: r.nombre, confianza: r.conf, razon: `Detecté "${r.kws.find(k => desc.includes(k))}" en la descripción` });
      }
    }

    // 3) Default conservador
    if (tipo === 'ingreso') return res.json({ cuenta: '4101', nombre: 'Ingresos por servicios', confianza: 50, razon: 'Sugerencia por defecto para ingresos' });
    return res.json({ cuenta: '5990', nombre: 'Otros gastos', confianza: 40, razon: 'No reconocí patrones; clasifícalo manualmente si no encaja' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
//  GET /api/ai/insights?periodo=YYYY-MM
//  IA proactiva: detecta cosas raras en los libros del despacho.
//   - Posibles duplicados (mismo cliente + monto + fecha cercana)
//   - Montos inusuales vs. promedio histórico del cliente
//   - Clientes activos sin movimientos en el período
// ===================================================================
router.get('/insights', async (req, res) => {
  try {
    const uid = req.user.id;
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const insights = [];

    // 1) Posibles duplicados — mismo cliente, mismo monto, fechas dentro de 3 días
    const { rows: dups } = await query(`
      SELECT t1.id AS id1, t1.descripcion AS desc1, t1.fecha AS fecha1,
             t2.id AS id2, t2.descripcion AS desc2, t2.fecha AS fecha2,
             t1.monto, t1.cliente_nombre, t1.tipo
      FROM transacciones t1
      JOIN transacciones t2 ON t1.usuario_id = t2.usuario_id
        AND t1.id < t2.id
        AND t1.monto = t2.monto
        AND COALESCE(t1.cliente_id::text,'') = COALESCE(t2.cliente_id::text,'')
        AND ABS(EXTRACT(EPOCH FROM (t1.fecha::timestamp - t2.fecha::timestamp))/86400) <= 3
      WHERE t1.usuario_id = $1 AND t1.periodo = $2
      LIMIT 10
    `, [uid, periodo]);

    const isoDate = (d) => (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    for (const d of dups) {
      insights.push({
        tipo: 'duplicado_posible',
        severidad: 'alta',
        mensaje: `Posible duplicado: ${d.cliente_nombre || 'sin cliente'} · $${(+d.monto).toFixed(2)} el ${isoDate(d.fecha1)} y el ${isoDate(d.fecha2)}`,
        accion: 'Verifica si una de las dos está repetida y elimínala',
        txn_ids: [d.id1, d.id2],
      });
    }

    // 2) Montos inusuales — monto > 2.5x el promedio histórico del mismo cliente+tipo
    const { rows: anom } = await query(`
      WITH stats AS (
        SELECT cliente_id, tipo,
               AVG(monto) AS avg_monto,
               COUNT(*) AS n
        FROM transacciones
        WHERE usuario_id = $1 AND cliente_id IS NOT NULL
        GROUP BY cliente_id, tipo
        HAVING COUNT(*) >= 3
      )
      SELECT t.id, t.descripcion, t.monto, t.cliente_nombre, t.fecha, t.tipo,
             s.avg_monto, s.n
      FROM transacciones t
      JOIN stats s ON s.cliente_id = t.cliente_id AND s.tipo = t.tipo
      WHERE t.usuario_id = $1
        AND t.periodo = $2
        AND t.monto > s.avg_monto * 2.5
      ORDER BY t.monto / NULLIF(s.avg_monto, 0) DESC
      LIMIT 5
    `, [uid, periodo]);

    for (const a of anom) {
      const factor = +(a.monto / a.avg_monto).toFixed(1);
      insights.push({
        tipo: 'monto_inusual',
        severidad: factor >= 4 ? 'alta' : 'media',
        mensaje: `${a.cliente_nombre}: $${(+a.monto).toFixed(2)} es ${factor}× su promedio histórico ($${(+a.avg_monto).toFixed(2)}) en ${a.tipo}s`,
        accion: 'Confirma con el cliente o ajusta si fue un error de captura',
        txn_ids: [a.id],
      });
    }

    // 3) Clientes activos sin movimientos en el período
    const { rows: silenciosos } = await query(`
      SELECT c.id, c.nombre
      FROM clientes c
      WHERE c.usuario_id = $1 AND c.estado = 'activo'
        AND NOT EXISTS (
          SELECT 1 FROM transacciones t
          WHERE t.cliente_id = c.id AND t.periodo = $2
        )
      LIMIT 5
    `, [uid, periodo]);

    for (const s of silenciosos) {
      insights.push({
        tipo: 'cliente_silencioso',
        severidad: 'baja',
        mensaje: `${s.nombre} está activo pero no tiene movimientos este período`,
        accion: 'Confirma si sigue operativo o cambia su estado a "omiso"',
        cliente_id: s.id,
      });
    }

    res.json({ periodo, insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
