require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./index');

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

function requireValue(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`${name} requerido.`);
  }
  return String(value).trim();
}

async function ensureAdmin() {
  const email = requireValue('ADMIN_EMAIL').toLowerCase();
  const nombre = process.env.ADMIN_NAME || 'Administrador CPA';
  const password = requireValue('ADMIN_PASSWORD');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL requerido. No se modifico ninguna base.');
  }
  if (!PASSWORD_RULE.test(password)) {
    throw new Error('ADMIN_PASSWORD debe tener minimo 8 caracteres, una mayuscula y un numero.');
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const hash = await bcrypt.hash(password, Number.isFinite(rounds) ? rounds : 12);

  const { rows: [user] } = await query(`
    INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
    VALUES ($1, $2, $3, 'admin', true)
    ON CONFLICT (email) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      password_hash = EXCLUDED.password_hash,
      rol = 'admin',
      activo = true,
      updated_at = NOW()
    RETURNING id, email, rol, activo, updated_at
  `, [nombre, email, hash]);

  console.log(JSON.stringify({
    status: 'admin_ready',
    id: user.id,
    email: user.email,
    rol: user.rol,
    activo: user.activo,
    updated_at: user.updated_at,
  }, null, 2));
}

ensureAdmin()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
