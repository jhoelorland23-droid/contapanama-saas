require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

const migrations = [
  'schema.sql',
  'migration_fase2.sql',
  'migration_fase2b.sql',
  'migration_fase3.sql',
  'migration_fase4.sql',
  'migration_fase5.sql',
  'migration_fase6_features.sql',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta configurada');
  }

  const databaseDir = path.resolve(__dirname, '..', '..', 'database');

  for (const file of migrations) {
    const fullPath = path.join(databaseDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    console.log(`[migrate] aplicando ${file}`);
    await pool.query(sql);
  }

  console.log('[migrate] migraciones completadas');
}

main()
  .catch((err) => {
    console.error('[migrate] error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
