/**
 * Seed inicial — crea usuario admin y datos de prueba
 * Ejecutar: node db/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./index');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

async function seed() {
  console.log('\n🌱 Iniciando seed de ContaPanamá...\n');

  // ── Usuario admin ──────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('Admin123!', ROUNDS);
  const { rows: [admin] } = await query(`
    INSERT INTO usuarios (nombre, email, password_hash, rol)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id, email
  `, ['Administrador CPA', 'admin@contapanama.pa', hash, 'admin']);
  console.log('✓ Usuario admin:', admin.email, '  password: Admin123!');

  const uid = admin.id;

  // ── Clientes de prueba ─────────────────────────────────────────────────────
  const clientesSeed = [
    ['Constructora Istmo S.A.', '155-789-1', 'NT-00234', 'jurídica', 'Construcción',    'activo'],
    ['Carlos Méndez Palacios',  '8-123-456', 'NT-00892', 'natural',  'Consultoría',     'activo'],
    ['Tech Pacific Corp',       '345-101-2', 'NT-01101', 'jurídica', 'Tecnología',      'omiso'],
    ['María Torres Vega',       '4-234-789', 'NT-00456', 'natural',  'Comercio',        'activo'],
    ['Grupo Logístico Atlántico','210-567-3','NT-00789', 'jurídica', 'Logística',       'inactivo'],
  ];

  const clienteIds = {};
  for (const [nombre, ruc, nit, tipo, actividad, estado] of clientesSeed) {
    const { rows: [c] } = await query(`
      INSERT INTO clientes (usuario_id, nombre, ruc, nit, tipo, actividad, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (usuario_id, ruc) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id, nombre
    `, [uid, nombre, ruc, nit, tipo, actividad, estado]);
    clienteIds[nombre] = c.id;
    console.log('✓ Cliente:', c.nombre);
  }

  // ── Transacciones de prueba ────────────────────────────────────────────────
  const txSeed = [
    ['Constructora Istmo S.A.', '2025-03-01', 'Factura servicios consultoría',   'ingreso', 3500,  245,   false, 'Banco Nacional', 'CHQ-001234'],
    ['Carlos Méndez Palacios',  '2025-03-05', 'Honorarios profesionales',         'ingreso', 1800,  126,   false, 'Banistmo',       'TRF-0045'],
    ['Tech Pacific Corp',       '2025-03-08', 'Alquiler de oficina',              'gasto',   850,   59.5,  true,  'Banco Nacional', 'CHQ-001235'],
    ['María Torres Vega',       '2025-03-12', 'Venta mercancía - Lote #14',       'ingreso', 5200,  364,   false, 'BAC',            'TRF-0089'],
    ['Constructora Istmo S.A.', '2025-03-15', 'Servicios contabilidad mensual',   'ingreso', 2100,  147,   false, 'Banco Nacional', 'TRF-0102'],
    ['Grupo Logístico Atlántico','2025-03-18','Papelería y útiles',               'gasto',   320,   22.4,  true,  'Banistmo',       'EFE-0023'],
    ['Carlos Méndez Palacios',  '2025-03-22', 'Internet y telefonía',             'gasto',   180,   12.6,  true,  'BAC',            'DEB-0011'],
    ['María Torres Vega',       '2025-03-25', 'Venta servicio digital',           'ingreso', 950,   66.5,  false, 'BAC',            'TRF-0110'],
    ['Tech Pacific Corp',       '2025-03-28', 'Servicios de mantenimiento IT',    'ingreso', 4200,  294,   false, 'Banistmo',       'TRF-0098'],
    ['Constructora Istmo S.A.', '2025-03-30', 'Compra materiales construcción',   'gasto',   7500,  525,   true,  'Banco Nacional', 'CHQ-001240'],
  ];

  for (const [cNombre, fecha, desc, tipo, monto, itbms, ded, banco, ref] of txSeed) {
    const cId = clienteIds[cNombre];
    await query(`
      INSERT INTO transacciones
        (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, tipo, monto, itbms, deducible, banco, referencia, periodo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [uid, cId, cNombre, fecha, desc, tipo, monto, itbms, ded, banco, ref, fecha.slice(0,7)]);
    console.log(`  ✓ Tx [${tipo}] ${desc} — $${monto}`);
  }

  // ── Vencimientos ───────────────────────────────────────────────────────────
  const vencSeed = [
    ['Declaración ITBMS - Marzo 2025',   'DGI',       '2025-04-15', 'alta'],
    ['Declaración Renta - 2024',         'DGI',       '2025-03-31', 'critica'],
    ['Aviso de Operación - Municipio',   'Municipio', '2025-04-30', 'media'],
    ['Planilla CSS - Marzo 2025',        'CSS',       '2025-04-15', 'alta'],
    ['Declaración Renta Estimada 2025',  'DGI',       '2025-06-30', 'baja'],
  ];
  for (const [desc, entidad, fecha, urgencia] of vencSeed) {
    await query(`
      INSERT INTO vencimientos (usuario_id, descripcion, entidad, fecha, urgencia)
      VALUES ($1,$2,$3,$4,$5)
    `, [uid, desc, entidad, fecha, urgencia]);
    console.log(`  ✓ Vencimiento: ${desc}`);
  }

  console.log('\n✅ Seed completado exitosamente!\n');
  console.log('   Login: admin@contapanama.pa  /  Admin123!\n');
  await pool.end();
}

seed().catch(err => { console.error('❌ Seed error:', err.message); process.exit(1); });
