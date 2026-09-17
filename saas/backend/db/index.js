const { Pool, types } = require('pg');

// A SQL DATE is a civil accounting date, not a timezone-dependent instant.
types.setTypeParser(types.builtins.DATE, value => value);

// A hung statement would otherwise hold the owner's accounting lock forever and
// pin a pool connection for every request queued behind it.
const statementTimeoutMs = Number(process.env.CONTAPANAMA_STATEMENT_TIMEOUT_MS || 60_000);
if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1) throw new Error('CONTAPANAMA_STATEMENT_TIMEOUT_MS debe ser un entero positivo en milisegundos.');

// Production verifies the PostgreSQL certificate. A private CA goes in CONTAPANAMA_PG_SSL_CA;
// disabling verification is an explicit, logged decision, never the default.
function sslConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return false;
  if (env.CONTAPANAMA_PG_SSL_INSECURE === 'true') {
    console.warn('[pg] CONTAPANAMA_PG_SSL_INSECURE=true: certificado del servidor NO verificado.');
    return { rejectUnauthorized: false };
  }
  const ssl = { rejectUnauthorized: true };
  if (env.CONTAPANAMA_PG_SSL_CA) ssl.ca = require('node:fs').readFileSync(env.CONTAPANAMA_PG_SSL_CA, 'utf8');
  return ssl;
}

const poolMax = Number(process.env.CONTAPANAMA_PG_POOL_MAX || 20);
if (!Number.isInteger(poolMax) || poolMax < 2) throw new Error('CONTAPANAMA_PG_POOL_MAX debe ser un entero >= 2.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  max: poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
  options: `-c statement_timeout=${statementTimeoutMs}`,
});

pool.on('error', (err) => console.error('[pg] Unexpected pool error:', err));

/** Ejecutar una query simple */
const query = async (text, params = []) => {
  const t0 = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      console.log(`  [db] ${Date.now() - t0}ms  ${text.slice(0, 90).replace(/\n\s*/g, ' ')}`);
    }
    return res;
  } catch (err) {
    console.error('[db] Error:', err.message, '\n   SQL:', text.slice(0, 200));
    throw err;
  }
};

/** Ejecutar múltiples queries en una transacción */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Test de conexión */
const testConnection = async () => {
  const { rows } = await query('SELECT NOW() AS now, current_database() AS db');
  return rows[0];
};

/** Cierre ordenado: no acepta nuevas conexiones y espera a que las transacciones en curso liberen su cliente */
const closePool = () => pool.end();

module.exports = { pool, query, withTransaction, testConnection, closePool, sslConfig };
