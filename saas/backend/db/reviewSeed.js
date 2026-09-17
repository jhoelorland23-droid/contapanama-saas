const { Client } = require('pg');
const bcrypt = require('bcryptjs');
module.exports = async function reviewSeed(config, env) {
  if (config.kind !== 'contapanama-synthetic-review-v1' || env.NODE_ENV !== 'test' || env.PGDATABASE !== 'contapanama_review') throw new Error('Seed limitado a revision sintetica');
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const uid = '10000000-0000-4000-8000-000000000001';
  try {
    await db.query(`INSERT INTO usuarios(id,nombre,email,password_hash,rol)
      VALUES($1,'QA Revision SQL','qa-review@example.test',$2,'admin') ON CONFLICT(id) DO NOTHING`, [uid, await bcrypt.hash(process.env.CONTAPANAMA_QA_PASSWORD, 8)]);
    for (let i = 1; i <= 2; i++) await db.query(`INSERT INTO clientes(id,usuario_id,nombre,ruc,tipo)
      VALUES($1,$2,$3,$4,'natural') ON CONFLICT(id) DO NOTHING`, [`20000000-0000-4000-8000-00000000000${i}`, uid, `QA Cliente sintetico ${i}`, `QA-SYNTHETIC-${i}`]);
  } finally { await db.end(); }
  const call = async (url, body, token) => {
    const r = await fetch(`http://127.0.0.1:${config.apiPort}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Seed sintetico ${url}: ${r.status}`);
    return r.json();
  };
  const { token } = await call('/api/auth/login', { email: 'qa-review@example.test', password: process.env.CONTAPANAMA_QA_PASSWORD });
  for (let i = 1; i <= 2; i++) await call('/api/transacciones', {
    cliente_id: `20000000-0000-4000-8000-00000000000${i}`, fecha: '2026-09-01', tipo: i === 1 ? 'ingreso' : 'gasto',
    descripcion: `QA Documento sintetico ${i}`, monto: 100 * i, itbms: 7 * i, tasa_itbms: 0.07, categoria_itbms: 'general',
    estado_pago: 'pendiente', idempotencia: `qa-review-seed-v1-${i}`,
  }, token);
};
