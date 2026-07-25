// ───────────────────────────────────────────────────────────────────
//  /api/ocr — Bandeja de recibos con OCR + clasificación IA
// ───────────────────────────────────────────────────────────────────
//  POST   /api/ocr/recibos              ← multipart upload, encola procesamiento
//  GET    /api/ocr/recibos              ← lista cola con filtros
//  GET    /api/ocr/recibos/:id
//  PATCH  /api/ocr/recibos/:id/aprobar  ← crea transaccion + asiento
//  PATCH  /api/ocr/recibos/:id/rechazar
//  GET    /api/ocr/stats                ← contadores por estado
// ───────────────────────────────────────────────────────────────────

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, query: qv, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const ocrService = require('../services/ocr');
const { logAction } = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ── Multer storage: local en uploads/ocr (cambia a S3/Spaces en prod) ──
const uploadsDir = path.join(__dirname, '..', 'uploads', 'ocr');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `${req.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(file.mimetype);
    cb(ok ? null : new Error('Formato no permitido. Usa imagen o PDF.'), ok);
  },
});

// ── POST /api/ocr/recibos ──────────────────────────────────────────────
router.post('/recibos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(422).json({ error: 'Falta el archivo en el campo "archivo"' });

    const uid = req.user.id;
    const { cliente_id } = req.body;
    const url = `/uploads/ocr/${path.basename(req.file.path)}`;

    // 1) Insertar en cola con estado "procesando"
    const { rows } = await query(`
      INSERT INTO ocr_recibos
        (usuario_id, cliente_id, archivo_url, archivo_nombre, archivo_mime, archivo_size_bytes, estado)
      VALUES ($1, $2, $3, $4, $5, $6, 'procesando')
      RETURNING *
    `, [uid, cliente_id || null, url, req.file.originalname, req.file.mimetype, req.file.size]);
    const recibo = rows[0];

    // 2) Procesar OCR async (no esperamos en producción, pero aquí
    //    sí lo esperamos para devolver datos en la respuesta)
    ocrService.procesar(req.file.path, req.file.mimetype)
      .then(async (resultado) => {
        const sugerencia = await ocrService.sugerirCuenta(uid, resultado);
        await query(`
          UPDATE ocr_recibos SET
            proveedor_extracted=$1, ruc_extracted=$2, fecha_extracted=$3,
            subtotal_extracted=$4, itbms_extracted=$5, total_extracted=$6,
            documento_extracted=$7, raw_text=$8, confianza=$9,
            cuenta_sugerida=$10, cuenta_sugerida_nombre=$11, cuenta_sugerida_conf=$12,
            estado='revisar', updated_at=NOW()
          WHERE id=$13
        `, [
          resultado.proveedor, resultado.ruc, resultado.fecha,
          resultado.subtotal, resultado.itbms, resultado.total,
          resultado.documento, resultado.raw_text, resultado.confianza,
          sugerencia.codigo, sugerencia.nombre, sugerencia.confianza,
          recibo.id,
        ]);
      })
      .catch(async (err) => {
        await query(`UPDATE ocr_recibos SET estado='error', estado_msg=$1 WHERE id=$2`,
          [err.message.slice(0, 500), recibo.id]);
      });

    res.status(201).json({ id: recibo.id, estado: 'procesando', archivo_url: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ocr/recibos?estado=revisar&cliente_id=… ───────────────────
router.get('/recibos', [
  qv('estado').optional().isIn(['pendiente','procesando','revisar','aprobado','rechazado','error']),
  qv('cliente_id').optional().isUUID(),
  qv('limit').optional().isInt({ min: 1, max: 200 }),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const conds = ['usuario_id = $1']; const params = [uid]; let i = 2;
    if (req.query.estado)     { conds.push(`estado = $${i++}`);     params.push(req.query.estado); }
    if (req.query.cliente_id) { conds.push(`cliente_id = $${i++}`); params.push(req.query.cliente_id); }
    const limit = parseInt(req.query.limit || '50');

    const { rows } = await query(`
      SELECT r.*, c.nombre AS cliente_nombre
      FROM ocr_recibos r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/ocr/stats — contadores por estado ─────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await query(`
      SELECT estado, COUNT(*)::int AS n
      FROM ocr_recibos WHERE usuario_id = $1 GROUP BY estado
    `, [uid]);
    const out = { pendiente: 0, procesando: 0, revisar: 0, aprobado: 0, rechazado: 0, error: 0 };
    rows.forEach(r => { out[r.estado] = r.n; });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/ocr/recibos/:id ───────────────────────────────────────────
router.get('/recibos/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM ocr_recibos WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Recibo no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/ocr/recibos/:id/aprobar ─────────────────────────────────
// Acepta overrides de los campos extraídos antes de crear la transacción.
router.patch('/recibos/:id/aprobar', [
  param('id').isUUID(),
  body('proveedor').optional().isString(),
  body('fecha').optional().isDate(),
  body('subtotal').optional().isFloat({ min: 0 }),
  body('itbms').optional().isFloat({ min: 0 }),
  body('cuenta_contable').optional().isString(),
  body('cliente_id').optional().isUUID(),
  body('deducible').optional().isBoolean(),
], validate, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows } = await query(`SELECT * FROM ocr_recibos WHERE id=$1 AND usuario_id=$2`, [req.params.id, uid]);
    if (!rows.length) return res.status(404).json({ error: 'Recibo no encontrado' });
    const r = rows[0];
    if (r.estado === 'aprobado') return res.status(400).json({ error: 'El recibo ya fue aprobado' });

    // Merge: payload del body sobre datos extraídos
    const proveedor = req.body.proveedor ?? r.proveedor_extracted;
    const fecha     = req.body.fecha     ?? (r.fecha_extracted && r.fecha_extracted.toISOString().slice(0,10));
    const subtotal  = parseFloat(req.body.subtotal ?? r.subtotal_extracted ?? 0);
    const itbms     = parseFloat(req.body.itbms    ?? r.itbms_extracted    ?? 0);
    const cuenta    = req.body.cuenta_contable ?? r.cuenta_sugerida;
    const cliente_id = req.body.cliente_id ?? r.cliente_id;
    const deducible = req.body.deducible ?? true;
    const periodo   = (fecha || new Date().toISOString().slice(0,10)).slice(0, 7);

    if (!fecha)    return res.status(422).json({ error: 'Falta fecha' });
    if (!proveedor)return res.status(422).json({ error: 'Falta proveedor' });
    if (!cuenta)   return res.status(422).json({ error: 'Falta cuenta contable' });

    // Crear transacción tipo gasto (los recibos OCR son gastos por definición)
    const { rows: tx } = await query(`
      INSERT INTO transacciones
        (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, tipo, monto, itbms,
         deducible, referencia, periodo, notas)
      VALUES ($1,$2,$3,$4,$5,'gasto',$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [
      uid, cliente_id, proveedor, fecha,
      `OCR · ${proveedor}${r.documento_extracted ? ' (' + r.documento_extracted + ')' : ''}`,
      subtotal, itbms, deducible, r.documento_extracted, periodo,
      `Cuenta: ${cuenta}. Auto-generado desde recibo OCR ${r.id}`,
    ]);

    await query(`
      UPDATE ocr_recibos SET
        estado='aprobado', transaccion_id=$1, aprobado_at=NOW(), aprobado_por=$2
      WHERE id=$3
    `, [tx[0].id, uid, r.id]);

    await logAction(req, 'ocr.aprobar', 'ocr_recibos', r.id, { transaccion_id: tx[0].id, monto: subtotal });
    res.json({ ok: true, transaccion_id: tx[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/ocr/recibos/:id/rechazar ────────────────────────────────
router.patch('/recibos/:id/rechazar', [
  param('id').isUUID(),
  body('motivo').optional().isString(),
], validate, async (req, res) => {
  try {
    const { rowCount } = await query(`
      UPDATE ocr_recibos SET estado='rechazado', estado_msg=$1 WHERE id=$2 AND usuario_id=$3
    `, [req.body.motivo || 'Rechazado por el usuario', req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Recibo no encontrado' });
    await logAction(req, 'ocr.rechazar', 'ocr_recibos', req.params.id, { motivo: req.body.motivo });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/ocr/recibos/:id (solo si no está aprobado) ─────────────
router.delete('/recibos/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rowCount } = await query(`
      DELETE FROM ocr_recibos WHERE id=$1 AND usuario_id=$2 AND estado <> 'aprobado'
    `, [req.params.id, req.user.id]);
    if (!rowCount) return res.status(400).json({ error: 'No se puede eliminar (¿ya está aprobado?)' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
