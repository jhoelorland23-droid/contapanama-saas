/**
 * Seed inicial â€” crea usuario admin y datos de prueba
 * Ejecutar: node db/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./index');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

async function seed() {
  const { password } = require('../config/demoCredentials').requireDemoCredentials();

  console.log('\nðŸŒ± Iniciando seed de ContaPanamÃ¡...\n');

  // â”€â”€ Usuario admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hash = await bcrypt.hash(password, ROUNDS);
  const { rows: [admin] } = await query(`
    INSERT INTO usuarios (nombre, email, password_hash, rol)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id, email
  `, ['Administrador CPA', 'admin@contapanama.pa', hash, 'admin']);
  console.log('âœ“ Usuario admin demo:', admin.email, '  password demo local no usar en produccion');

  const uid = admin.id;

  // â”€â”€ Clientes de prueba â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const clientesSeed = [
    ['Constructora Istmo S.A.', '155-789-1', 'NT-00234', 'jurídica', true,  'general', 'calendario', 12, 'Construcción', 'activo'],
    ['Carlos Méndez Palacios',  '8-123-456', 'NT-00892', 'natural',  true,  'general', 'calendario', 12, 'Consultoría',  'activo'],
    ['Tech Pacific Corp',       '345-101-2', 'NT-01101', 'jurídica', true,  'general', 'calendario', 12, 'Tecnología',   'omiso'],
    ['María Torres Vega',       '4-234-789', 'NT-00456', 'natural',  false, 'no_contribuyente_itbms', 'calendario', 12, 'Comercio', 'activo'],
    ['Grupo Logístico Atlántico','210-567-3','NT-00789', 'jurídica', true,  'general', 'calendario', 12, 'Logística',    'inactivo'],
  ];

  const clienteIds = {};
  for (const [nombre, ruc, nit, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes, actividad, estado] of clientesSeed) {
    const { rows: [c] } = await query(`
      INSERT INTO clientes
        (usuario_id, nombre, ruc, nit, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes, actividad, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (usuario_id, ruc) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        contribuyente_itbms = EXCLUDED.contribuyente_itbms,
        regimen_fiscal = EXCLUDED.regimen_fiscal,
        periodo_fiscal = EXCLUDED.periodo_fiscal,
        cierre_fiscal_mes = EXCLUDED.cierre_fiscal_mes,
        actividad = EXCLUDED.actividad,
        estado = EXCLUDED.estado
      RETURNING id, nombre
    `, [uid, nombre, ruc, nit, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes, actividad, estado]);
    clienteIds[nombre] = c.id;
    console.log('âœ“ Cliente:', c.nombre);
  }

  // â”€â”€ Transacciones de prueba â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const txSeed = [
    ['Constructora Istmo S.A.', '2025-03-01', 'Factura servicios consultorÃ­a',   'ingreso', 3500,  245,   false, 'Banco General', 'CHQ-001234'],
    ['Carlos MÃ©ndez Palacios',  '2025-03-05', 'Honorarios profesionales',         'ingreso', 1800,  126,   false, 'Banistmo',       'TRF-0045'],
    ['Tech Pacific Corp',       '2025-03-08', 'Alquiler de oficina',              'gasto',   850,   59.5,  true,  'Banco General', 'CHQ-001235'],
    ['MarÃ­a Torres Vega',       '2025-03-12', 'Venta mercancÃ­a - Lote #14',       'ingreso', 5200,  364,   false, 'BAC',            'TRF-0089'],
    ['Constructora Istmo S.A.', '2025-03-15', 'Servicios contabilidad mensual',   'ingreso', 2100,  147,   false, 'Banco General', 'TRF-0102'],
    ['Grupo LogÃ­stico AtlÃ¡ntico','2025-03-18','PapelerÃ­a y Ãºtiles',               'gasto',   320,   22.4,  true,  'Banistmo',       'EFE-0023'],
    ['Carlos MÃ©ndez Palacios',  '2025-03-22', 'Internet y telefonÃ­a',             'gasto',   180,   12.6,  true,  'BAC',            'DEB-0011'],
    ['MarÃ­a Torres Vega',       '2025-03-25', 'Venta servicio digital',           'ingreso', 950,   66.5,  false, 'BAC',            'TRF-0110'],
    ['Tech Pacific Corp',       '2025-03-28', 'Servicios de mantenimiento IT',    'ingreso', 4200,  294,   false, 'Banistmo',       'TRF-0098'],
    ['Constructora Istmo S.A.', '2025-03-30', 'Compra materiales construcciÃ³n',   'gasto',   7500,  525,   true,  'Banco General', 'CHQ-001240'],
  ];

  for (const [cNombre, fecha, desc, tipo, monto, itbms, ded, banco, ref] of txSeed) {
    const cId = clienteIds[cNombre];
    const venc = new Date(`${fecha}T00:00:00`);
    venc.setDate(venc.getDate() + 30);
    const cat = tipo === 'gasto'
      ? desc.toLowerCase().includes('alquiler') ? 'alquiler'
        : desc.toLowerCase().includes('internet') ? 'servicios_publicos'
        : desc.toLowerCase().includes('material') ? 'compras_inventario'
        : 'gastos_operativos'
      : desc.toLowerCase().includes('honorario') ? 'honorarios' : 'ventas_servicios';
    await query(`
      INSERT INTO transacciones
        (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, categoria_contable, tipo, monto, itbms, deducible, banco, referencia, fecha_vencimiento, periodo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [uid, cId, cNombre, fecha, desc, cat, tipo, monto, itbms, ded, banco, ref, venc.toISOString().slice(0,10), fecha.slice(0,7)]);
    console.log(`  âœ“ Tx [${tipo}] ${desc} â€” $${monto}`);
  }

  // â”€â”€ Vencimientos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const vencSeed = [
    ['DeclaraciÃ³n ITBMS - Marzo 2025',   'DGI',       '2025-04-15', 'alta'],
    ['DeclaraciÃ³n Renta - 2024',         'DGI',       '2025-03-31', 'critica'],
    ['Aviso de OperaciÃ³n - Municipio',   'Municipio', '2025-04-30', 'media'],
    ['Planilla CSS - Marzo 2025',        'CSS',       '2025-04-15', 'alta'],
    ['DeclaraciÃ³n Renta Estimada 2025',  'DGI',       '2025-06-30', 'baja'],
  ];
  for (const [desc, entidad, fecha, urgencia] of vencSeed) {
    await query(`
      INSERT INTO vencimientos (usuario_id, descripcion, entidad, fecha, urgencia)
      VALUES ($1,$2,$3,$4,$5)
    `, [uid, desc, entidad, fecha, urgencia]);
    console.log(`  âœ“ Vencimiento: ${desc}`);
  }

  console.log('\nâœ… Seed completado exitosamente!\n');
  console.log('   Login demo local: admin@contapanama.pa\n');
  await pool.end();
}

seed().catch(err => { console.error('âŒ Seed error:', err.message); process.exit(1); });

