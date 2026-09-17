const { Pool, types } = require('pg');

// A SQL DATE is a civil accounting date, not a timezone-dependent instant.
types.setTypeParser(types.builtins.DATE, value => value);

// A hung statement would otherwise hold the owner's accounting lock forever and
// pin a pool connection for every request queued behind it.
const statementTimeoutMs = Number(process.env.CONTAPANAMA_STATEMENT_TIMEOUT_MS || 60_000);
if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1) throw new Error('CONTAPANAMA_STATEMENT_TIMEOUT_MS debe ser un entero positivo en milisegundos.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
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

module.exports = { pool, query, withTransaction, testConnection };
