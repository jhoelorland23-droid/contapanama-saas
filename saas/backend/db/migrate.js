require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const databaseUrl = process.env.DATABASE_URL;
const apply = process.argv.includes('--apply');

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no esta configurado.');
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`No se encontro schema.sql en ${schemaPath}`);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    const info = await client.query('SELECT current_database() AS database, current_user AS user, version()');
    console.log(JSON.stringify({
      connected: true,
      database: info.rows[0].database,
      user: info.rows[0].user,
      version: info.rows[0].version,
    }, null, 2));

    if (!apply) {
      console.log('Modo solo verificacion. No se aplico schema.sql. Use --apply para migrar.');
      return;
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1129333071, 0)');
    await client.query(schema);

    const objects = await client.query(`
      SELECT
        to_regclass('public.work_orders') AS work_orders,
        to_regclass('public.ai_proposals') AS ai_proposals,
        to_regclass('public.audit_events') AS audit_events,
        to_regclass('public.transacciones') AS transacciones,
        to_regclass('public.pagos_transacciones') AS pagos_transacciones,
        to_regclass('public.libros_contables') AS libros_contables,
        to_regclass('public.asientos_contables') AS asientos_contables,
        to_regclass('public.asiento_lineas') AS asiento_lineas,
        to_regclass('public.libros_entidad') AS libros_entidad,
        to_regclass('public.folios_libro') AS folios_libro
    `);

    if (Object.values(objects.rows[0]).some(value => !value)) throw new Error('La migracion no creo todos los objetos requeridos.');
    await client.query('COMMIT');
    console.log(JSON.stringify({ migrated: true, objects: objects.rows[0] }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
