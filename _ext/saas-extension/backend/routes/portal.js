// ───────────────────────────────────────────────────────────────────
//  /api/portal — Portal del cliente (white-label)
// ───────────────────────────────────────────────────────────────────
//
//  Dos zonas:
//    A) Endpoints DEL CPA (auth con JWT contador) — gestionar accesos
//       POST  /api/portal/accesos             ← invitar cliente
//       GET   /api/portal/accesos
//       DELETE /api/portal/accesos/:id
//
//    B) Endpoints DEL CLIENTE FINAL (auth con JWT cliente_portal)
//       POST  /api/portal/auth/aceptar        ← canjear invite_token
//       POST  /api/portal/auth/login
//       GET   /api/portal/me                  ← perfil cliente
//       GET   /api/portal/dashboard
//       GET   /api/portal/reportes
//       POST  /api/portal/recibos             ← cliente sube recibo
//       GET   /api/portal/mensajes
//       POST  /api/portal/mensajes
// ───────────────────────────────────────────────────────────────────

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAction } = require('../services/audit');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ===================================================================
//  ZONA A — endpoints DEL CPA (requieren JWT de usuario contador)
// ===================================================================
const cpaOnly = express.Router();
cpaOnly.use(authMiddleware);

cpaOnly.post('/accesos', [
  body('cliente_id').isUUID(),
  body('email').isEmail(),
  body('nombre').optional().isString(),
], validate, async (req, res) => {
  try {
    const inviteToken = crypto.randomBytes(24).toString('hex');
    const { rows } = await query(`
      INSERT INTO portal_accesos (usuario_id, cliente_id, email, nombre, invite_token, invite_envia_at)
      VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, email, invite_token
    `, [req.user.id, req.body.cliente_id, req.body.email, req.body.nombre || null, inviteToken]);
    await logAction(req, 'portal.invitar', 'portal_accesos', rows[0].id, { cliente_id: req.body.cliente_id });
    // TODO: enviar email con link "https://tudominio/portal/aceptar?token=..."
    res.status(201).json({
      id: rows[0].id, email: rows[0].email,
      invite_url: `/portal/aceptar?token=${inviteToken}`,
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya invitaste ese email para este cliente' });
    res.status(500).json({ error: err.message });
  }
});

cpaOnly.get('/accesos', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.id, a.email, a.nombre, a.activo, a.acepta_at, a.ultima_sesion, a.created_at,
             c.nombre AS cliente_nombre
      FROM portal_accesos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.usuario_id = $1 ORDER BY a.created_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

cpaOnly.delete('/accesos/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    await query(`DELETE FROM portal_accesos WHERE id=$1 AND usuario_id=$2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use('/', cpaOnly);

// ===================================================================
//  ZONA B — endpoints DEL CLIENTE FINAL
// ===================================================================

// Helper: auth middleware específico para el portal
const portalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(auth.replace(/^Bearer /, ''), JWT_SECRET);
    if (payload.kind !== 'portal') return res.status(403).json({ error: 'Token no válido para portal' });
    req.portal = payload;          // { acceso_id, usuario_id (CPA), cliente_id }
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// ── POST /api/portal/auth/aceptar ─────────────────────────────────────
// El cliente canjea su invite_token + crea contraseña → recibe JWT
router.post('/auth/aceptar', [
  body('token').isString(),
  body('password').isString().isLength({ min: 8 }),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM portal_accesos WHERE invite_token=$1 AND activo=true`,
      [req.body.token]);
    if (!rows.length) return res.status(404).json({ error: 'Invitación no encontrada o ya canjeada' });
    const acceso = rows[0];

    const hash = await bcrypt.hash(req.body.password, 10);
    await query(`
      UPDATE portal_accesos SET password_hash=$1, acepta_at=NOW(), invite_token=NULL, ultima_sesion=NOW()
      WHERE id=$2
    `, [hash, acceso.id]);

    const token = jwt.sign({
      kind: 'portal', acceso_id: acceso.id, usuario_id: acceso.usuario_id, cliente_id: acceso.cliente_id,
    }, JWT_SECRET, { expiresIn: '14d' });

    res.json({ token, email: acceso.email, cliente_id: acceso.cliente_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/portal/auth/login ───────────────────────────────────────
router.post('/auth/login', [
  body('email').isEmail(),
  body('password').isString(),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM portal_accesos WHERE email=$1 AND activo=true LIMIT 1
    `, [req.body.email.toLowerCase()]);
    if (!rows.length || !rows[0].password_hash) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const ok = await bcrypt.compare(req.body.password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    await query(`UPDATE portal_accesos SET ultima_sesion=NOW() WHERE id=$1`, [rows[0].id]);

    const token = jwt.sign({
      kind: 'portal', acceso_id: rows[0].id, usuario_id: rows[0].usuario_id, cliente_id: rows[0].cliente_id,
    }, JWT_SECRET, { expiresIn: '14d' });
    res.json({ token, email: rows[0].email, cliente_id: rows[0].cliente_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── A partir de aquí todo va con portalAuth ───────────────────────────
router.use(portalAuth);

router.get('/me', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.id, a.email, a.nombre, c.id AS cliente_id, c.nombre AS cliente_nombre, c.ruc,
             u.nombre AS cpa_nombre, u.email AS cpa_email
      FROM portal_accesos a
      JOIN clientes c ON c.id = a.cliente_id
      JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.id = $1
    `, [req.portal.acceso_id]);
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const periodo = new Date().toISOString().slice(0, 7);
    const { cliente_id, usuario_id } = req.portal;

    const { rows: fin } = await query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::numeric(14,2) AS ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::numeric(14,2)   AS gastos,
        COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)::numeric(14,2) AS itbms_debito
      FROM transacciones
      WHERE usuario_id=$1 AND cliente_id=$2 AND periodo=$3
    `, [usuario_id, cliente_id, periodo]);

    const { rows: cobrar } = await query(`
      SELECT COALESCE(SUM(total),0)::numeric(14,2) AS pendiente, COUNT(*)::int AS num
      FROM fe_facturas
      WHERE usuario_id=$1 AND cliente_id=$2 AND estado='autorizada'
    `, [usuario_id, cliente_id]);

    res.json({
      periodo,
      financiero: fin[0],
      por_cobrar: cobrar[0],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reportes', async (req, res) => {
  try {
    const { cliente_id, usuario_id } = req.portal;
    const { rows } = await query(`
      SELECT id, titulo, tipo, archivo_url, created_at
      FROM portal_archivos
      WHERE usuario_id=$1 AND cliente_id=$2
      ORDER BY created_at DESC LIMIT 50
    `, [usuario_id, cliente_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/mensajes', async (req, res) => {
  try {
    const { cliente_id, usuario_id } = req.portal;
    const { rows } = await query(`
      SELECT id, remitente, contenido, archivo_url, leido, created_at
      FROM portal_mensajes
      WHERE usuario_id=$1 AND cliente_id=$2 ORDER BY created_at ASC LIMIT 200
    `, [usuario_id, cliente_id]);
    // Marcar mensajes del CPA como leídos
    await query(`
      UPDATE portal_mensajes SET leido=true
      WHERE usuario_id=$1 AND cliente_id=$2 AND remitente='cpa' AND leido=false
    `, [usuario_id, cliente_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mensajes', [
  body('contenido').isString().isLength({ min: 1, max: 4000 }),
], validate, async (req, res) => {
  try {
    const { cliente_id, usuario_id } = req.portal;
    const { rows } = await query(`
      INSERT INTO portal_mensajes (usuario_id, cliente_id, remitente, contenido)
      VALUES ($1, $2, 'cliente', $3) RETURNING *
    `, [usuario_id, cliente_id, req.body.contenido]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// El cliente sube un recibo → entra a la cola OCR del CPA
router.post('/recibos', [
  body('archivo_url').isString(),
  body('archivo_nombre').optional().isString(),
  body('archivo_mime').optional().isString(),
], validate, async (req, res) => {
  try {
    const { cliente_id, usuario_id } = req.portal;
    const { rows } = await query(`
      INSERT INTO ocr_recibos (usuario_id, cliente_id, archivo_url, archivo_nombre, archivo_mime, estado)
      VALUES ($1, $2, $3, $4, $5, 'pendiente') RETURNING id
    `, [usuario_id, cliente_id, req.body.archivo_url, req.body.archivo_nombre || null, req.body.archivo_mime || null]);
    res.status(201).json({ id: rows[0].id, estado: 'pendiente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
