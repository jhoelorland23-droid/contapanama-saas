function requireDemoCredentials(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Seed demo bloqueado en produccion');
  if (env.ALLOW_DEMO_SEED !== 'true') throw new Error('Seed demo deshabilitado: requiere ALLOW_DEMO_SEED=true');
  const password = env.CONTAPANAMA_QA_PASSWORD;
  if (typeof password !== 'string' || password.length < 32 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('CONTAPANAMA_QA_PASSWORD requerida: minimo 32 caracteres, mayuscula y numero');
  }
  return { password };
}
module.exports = { requireDemoCredentials };
