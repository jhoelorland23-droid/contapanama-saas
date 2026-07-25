const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit  = require('express-rate-limit');
const { query, withTransaction }  = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 10,                     // 10 intentos por IP
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const signToken = (user) => jwt.sign(
  { id: user.id, email: user.email, rol: user.rol },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', authLimiter, [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
    .matches(/[A-Z]/).withMessage('Debe tener al menos una mayúscula')
    .matches(/[0-9]/).withMessage('Debe tener al menos un número'),
], validate, async (req, res) => {
  try {
    const { nombre, email, password, rol = 'contador' } = req.body;

    // Verificar que el email no exista
    const { rows: exists } = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (exists.length) return res.status(409).json({ error: 'El email ya está registrado' });

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hash   = await bcrypt.hash(password, rounds);

    const { rows: [user] } = await query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nombre, email, rol, created_at
    `, [nombre, email, hash, rol === 'admin' ? 'contador' : rol]);

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1',
      [email]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!user.activo) return res.status(401).json({ error: 'Cuenta desactivada' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows: [user] } = await query(
      'SELECT id, nombre, email, rol, created_at FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/password ─────────────────────────────────────────────────
router.put('/password', authMiddleware, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/),
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { rows: [user] } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hash   = await bcrypt.hash(newPassword, rounds);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/reset-data — Borra TODOS los datos contables del usuario ─
// Útil para arrancar con base limpia tras el demo. NO borra el usuario.
router.post('/reset-data', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    await withTransaction(async (client) => {
      // Factura Electrónica (líneas y eventos dependen de facturas)
      await client.query(`DELETE FROM fe_eventos WHERE factura_id IN (SELECT id FROM fe_facturas WHERE usuario_id=$1)`, [uid]);
      await client.query(`DELETE FROM fe_lineas  WHERE factura_id IN (SELECT id FROM fe_facturas WHERE usuario_id=$1)`, [uid]);
      await client.query(`DELETE FROM fe_facturas WHERE usuario_id=$1`, [uid]);
      // Asistente IA
      await client.query(`DELETE FROM ai_mensajes WHERE conversacion_id IN (SELECT id FROM ai_conversaciones WHERE usuario_id=$1)`, [uid]);
      await client.query(`DELETE FROM ai_conversaciones WHERE usuario_id=$1`, [uid]);
      await client.query(`DELETE FROM ai_usage WHERE usuario_id=$1`, [uid]);
      // OCR
      await client.query(`DELETE FROM ocr_recibos WHERE usuario_id=$1`, [uid]);
      // Contabilidad
      await client.query(`DELETE FROM transacciones WHERE usuario_id=$1`, [uid]);
      await client.query(`DELETE FROM vencimientos WHERE usuario_id=$1`, [uid]);
      await client.query(`DELETE FROM clientes WHERE usuario_id=$1`, [uid]);
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
