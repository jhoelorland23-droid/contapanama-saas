const jwt = require('jsonwebtoken');
const { query } = require('../db');

/**
 * Middleware que verifica el JWT en el header Authorization.
 * Agrega req.user = { id, nombre, email, rol } si el token es válido.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que el usuario todavía existe y está activo
    const { rows } = await query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1',
      [decoded.id]
    );

    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ error: 'Usuario no válido o desactivado' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado, vuelve a iniciar sesión' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Middleware de rol — usar después de authMiddleware.
 * Ejemplo: router.delete('/:id', auth, requireRole('admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ error: `Acceso denegado. Rol requerido: ${roles.join(' o ')}` });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
