const LOCAL_URL_RE = /localhost|127\.0\.0\.1|0\.0\.0\.0/i;
const PLACEHOLDER_RE = /REEMPLAZAR|tudominio\.com|USUARIO|PASSWORD|HOST|BASE|cambia_esto|cree_una/i;

function hasMinLength(value, minLength) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function requireJwtSecret(env = process.env) {
  const value = env.JWT_SECRET;
  if (!hasMinLength(value, 32) || /cambia_esto|REEMPLAZAR|<[^>]+>/i.test(value)) {
    throw new Error('JWT_SECRET requerido: configure al menos 32 caracteres aleatorios en el entorno.');
  }
  return value;
}

function isPublicHttpsUrl(value) {
  return typeof value === 'string' &&
    value.startsWith('https://') &&
    !LOCAL_URL_RE.test(value) &&
    !PLACEHOLDER_RE.test(value);
}

function validateProductionEnv(env = process.env) {
  if (env.NODE_ENV !== 'production') {
    return { ok: true, errors: [] };
  }

  const errors = [];
  const required = [
    ['DATABASE_URL', 20],
    ['JWT_SECRET', 32],
    ['FRONTEND_URL', 8],
    ['CONTAPANAMA_INTEGRATION_TOKEN', 32],
  ];

  for (const [name, minLength] of required) {
    const value = env[name];
    if (!hasMinLength(value, minLength)) {
      errors.push(`${name} requerido o demasiado corto.`);
      continue;
    }
    if (PLACEHOLDER_RE.test(value)) {
      errors.push(`${name} contiene valor de plantilla.`);
    }
  }

  if (env.JWT_SECRET && env.CONTAPANAMA_INTEGRATION_TOKEN && env.JWT_SECRET === env.CONTAPANAMA_INTEGRATION_TOKEN) {
    errors.push('JWT_SECRET y CONTAPANAMA_INTEGRATION_TOKEN deben ser distintos.');
  }

  if (env.FRONTEND_URL && !isPublicHttpsUrl(env.FRONTEND_URL)) {
    errors.push('FRONTEND_URL debe ser una URL publica https.');
  }

  return { ok: errors.length === 0, errors };
}

function assertProductionEnv(env = process.env) {
  const result = validateProductionEnv(env);
  if (!result.ok) {
    throw new Error(`Configuracion de produccion invalida:\n- ${result.errors.join('\n- ')}`);
  }
  return result;
}

module.exports = {
  requireJwtSecret,
  assertProductionEnv,
  validateProductionEnv,
};
