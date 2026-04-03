'use strict';
/**
 * routes/contabilidad.js v3
 *
 * POST /api/contabilidad/clasificar
 * POST /api/contabilidad/clasificar-batch
 * POST /api/contabilidad/corregir/:id          ← NUEVO: aprendizaje
 * POST /api/contabilidad/generar-asiento/:id
 * POST /api/contabilidad/generar-diario
 * GET  /api/contabilidad/diario
 * GET  /api/contabilidad/itbms
 * GET  /api/contabilidad/correcciones          ← NUEVO: historial
 * GET  /api/contabilidad/catalogo
 * POST /api/contabilidad/catalogo
 * PUT  /api/contabilidad/catalogo/:codigo
 * GET  /api/contabilidad/reglas
 * POST /api/contabilidad/reglas
 * PUT  /api/contabilidad/reglas/:id
 * DELETE /api/contabilidad/reglas/:id
 * GET  /api/contabilidad/catalogo-cliente/:id
 * POST /api/contabilidad/catalogo-cliente/:id
 * POST /api/contabilidad/importar              ← NUEVO: CSV/JSON
 * GET  /api/contabilidad/importaciones         ← NUEVO: historial importaciones
 * GET  /api/contabilidad/categorias            ← NUEVO
 */

const express  = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { query, withTransaction }   = require('../db');
const { authMiddleware }           = require('../middleware/auth');
const { clasificar, clasificarBatch, registrarCorreccion, invalidarCache } = require('../services/clasificador');
const { generarAsiento, calcularITBMS, validarCuadre }                    = require('../services/asientos');
const { parsearCSV, parsearJSON, normalizarFila, detectarDuplicados, detectarBanco } = require('../services/importador');
const CATALOGO_BASE = require('../services/catalogo');
const logger       = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

const ok = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

// ── Catálogo combinado ────────────────────────────────────────────────────────
async function getCatalogo(uid, clienteId = null) {
  const out = { ...CATALOGO_BASE };
  const { rows: usr } = await query(
    'SELECT * FROM catalogo_cuentas WHERE usuario_id=$1 AND activo=true', [uid]);
  for (const c of usr) out[c.codigo] = c;
  if (clienteId) {
    const { rows: cli } = await query(
      'SELECT * FROM catalogo_cliente WHERE cliente_id=$1 AND activo=true', [clienteId]);
    for (const c of cli) out[c.codigo] = c;
  }
  return out;
}

// ═══ CLASIFICACIÓN ════════════════════════════════════════════════════════════

router.post('/clasificar',
  [body('descripcion').trim().notEmpty()], ok,
  async (req, res) => {
    try {
      const r       = await clasificar(req.body.descripcion, req.body.tipo || null, req.user.id);
      const catalogo = await getCatalogo(req.user.id);
      res.json({ ...r, cuenta_info: catalogo[r.cuenta] || null });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

router.post('/clasificar-batch',
  [body('periodo').optional().matches(/^\d{4}-\d{2}$/)], ok,
  async (req, res) => {
    try {
      const uid = req.user.id;
      const { periodo } = req.body;
      const conds = ['usuario_id=$1']; const p = [uid]; let i = 2;
      if (periodo) { conds.push(`periodo=$${i++}`); p.push(periodo); }

      const { rows } = await query(
        `SELECT id,descripcion,tipo,monto,itbms,deducible,tiene_factura
         FROM transacciones WHERE ${conds.join(' AND ')} ORDER BY fecha`, p);

      if (!rows.length) return res.json({ clasificadas:[], total:0 });

      const resultados = await clasificarBatch(rows, uid);
      const catalogo   = await getCatalogo(uid);

      await withTransaction(async c => {
        for (const r of resultados) {
          const cl = r.clasificacion;
          await c.query(`
            UPDATE transacciones
            SET cuenta_contable=$1, etiqueta_auto=$2, confianza_clasif=$3,
                deducible=CASE WHEN $4::boolean IS NOT NULL THEN $4 ELSE deducible END,
                categoria=$5
            WHERE id=$6 AND usuario_id=$7`,
            [cl.cuenta, cl.etiqueta, cl.confianza, cl.deducible,
             cl.categoria, r.id, uid]);
        }
      });

      res.json({
        clasificadas: resultados.map(r => ({ ...r, cuenta_info: catalogo[r.clasificacion.cuenta] || null })),
        total: resultados.length,
        confianza: {
          alta:  resultados.filter(r => r.clasificacion.confianza==='alta').length,
          media: resultados.filter(r => r.clasificacion.confianza==='media').length,
          baja:  resultados.filter(r => r.clasificacion.confianza==='baja').length,
        },
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

// POST /api/contabilidad/corregir/:id — registrar corrección manual (aprendizaje)
router.post('/corregir/:id', [param('id').isUUID(),
  body('cuenta_correcta').trim().notEmpty(),
  body('tipo_correcto').isIn(['ingreso','gasto']),
], ok, async (req, res) => {
  try {
    const resultado = await registrarCorreccion(req.user.id, req.params.id, req.body);
    if (resultado.regla_generada) {
      return res.json({
        ...resultado,
        mensaje: '✓ Corrección guardada. Se generó una nueva regla automáticamente.',
      });
    }
    res.json({ ...resultado, mensaje: '✓ Corrección guardada.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contabilidad/correcciones — historial de aprendizaje
router.get('/correcciones', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cc.*, t.descripcion AS tx_desc, c.nombre AS cliente_nombre,
             r.nombre AS regla_nombre
      FROM correcciones_clasificacion cc
      JOIN transacciones t ON t.id = cc.transaccion_id
      LEFT JOIN clientes c ON c.id = cc.cliente_id
      LEFT JOIN reglas_clasificacion r ON r.id = cc.regla_generada_id
      WHERE cc.usuario_id = $1
      ORDER BY cc.created_at DESC LIMIT 100
    `, [req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ ASIENTOS ════════════════════════════════════════════════════════════════

router.post('/generar-asiento/:id', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await query(
      'SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2', [req.params.id, uid]);
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });

    const tx = rows[0];
    if (!tx.cuenta_contable) {
      const c = await clasificar(tx.descripcion, tx.tipo, uid);
      await query('UPDATE transacciones SET cuenta_contable=$1,etiqueta_auto=$2,confianza_clasif=$3,categoria=$4 WHERE id=$5',
        [c.cuenta, c.etiqueta, c.confianza, c.categoria, tx.id]);
      tx.cuenta_contable = c.cuenta;
    }

    const { lines: lineas, errores: errAsiento } = generarAsiento(tx, tx.cuenta_contable);
    if (errAsiento.length) await logger.logErroresAsiento(uid, tx, errAsiento);
    const cuadre = validarCuadre(lineas);
    if (!cuadre.cuadra) {
      await logger.critico(uid, tx.id, logger.TIPOS.ASIENTO_NO_CUADRA,
        'Asiento no cuadra: ' + cuadre.total_debe + ' vs ' + cuadre.total_haber, cuadre);
      return res.status(422).json({ error:'Asiento no cuadra', cuadre, lineas });
    }
    await withTransaction(async c => {
      await c.query('DELETE FROM asientos_contables WHERE transaccion_id=$1 AND usuario_id=$2', [tx.id, uid]);
      for (const l of lineas) {
        await c.query(`INSERT INTO asientos_contables
          (usuario_id,transaccion_id,cliente_id,fecha,cuenta_codigo,cuenta_nombre,
           debe,haber,descripcion,referencia,tipo_linea,periodo,itbms_monto,itbms_tipo)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [uid,tx.id,tx.cliente_id||null,l.fecha,l.cuenta_codigo,l.cuenta_nombre,
           l.debe,l.haber,l.descripcion,l.referencia,l.tipo_linea,tx.periodo,
           l.itbms_monto||0,l.itbms_tipo||null]);
      }
      await c.query('UPDATE transacciones SET asiento_generado=true WHERE id=$1', [tx.id]);
    });

    res.status(201).json({ lineas, cuadre, transaccion_id: tx.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/contabilidad/generar-diario
router.post('/generar-diario',
  [body('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período YYYY-MM requerido')], ok,
  async (req, res) => {
    try {
      const uid     = req.user.id;
      const periodo = req.body.periodo;

      const { rows: txns } = await query(
        'SELECT * FROM transacciones WHERE usuario_id=$1 AND periodo=$2 ORDER BY fecha,created_at',
        [uid, periodo]);

      if (!txns.length) return res.json({ periodo, asientos:[], resumen:{ total_asientos:0 } });

      // Clasificar pendientes
      const sinCuenta = txns.filter(t => !t.cuenta_contable);
      if (sinCuenta.length) {
        const clasifs = await clasificarBatch(sinCuenta, uid);
        await withTransaction(async c => {
          for (const r of clasifs) {
            const cl = r.clasificacion;
            await c.query(
              'UPDATE transacciones SET cuenta_contable=$1,etiqueta_auto=$2,confianza_clasif=$3,categoria=$4 WHERE id=$5',
              [cl.cuenta,cl.etiqueta,cl.confianza,cl.categoria,r.id]);
            const tx = txns.find(t => t.id === r.id);
            if (tx) Object.assign(tx, { cuenta_contable:cl.cuenta, etiqueta_auto:cl.etiqueta, categoria:cl.categoria });
          }
        });
      }

      // Eliminar asientos anteriores
      await query('DELETE FROM asientos_contables WHERE usuario_id=$1 AND periodo=$2', [uid, periodo]);

      const todasLineas = []; const errores = []; let numAsiento = 1;

      await withTransaction(async c => {
        for (const tx of txns) {
          const { lines: lineas, errores: errAst } = generarAsiento(tx, tx.cuenta_contable);
          if (errAst.length) await logger.logErroresAsiento(uid, tx, errAst);
          const cuadre = validarCuadre(lineas);
          if (!cuadre.cuadra) {
            await logger.critico(uid, tx.id, logger.TIPOS.ASIENTO_NO_CUADRA,
              'Asiento no cuadra: ' + cuadre.total_debe + ' vs ' + cuadre.total_haber,
              { periodo, cuadre });
            errores.push({ id:tx.id, descripcion:tx.descripcion, cuadre }); continue;
          }

          for (const l of lineas) {
            await c.query(`INSERT INTO asientos_contables
              (usuario_id,transaccion_id,cliente_id,fecha,cuenta_codigo,cuenta_nombre,
               debe,haber,descripcion,referencia,tipo_linea,periodo,
               itbms_monto,itbms_tipo,numero_asiento)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [uid,tx.id,tx.cliente_id||null,l.fecha,l.cuenta_codigo,l.cuenta_nombre,
               l.debe,l.haber,l.descripcion,l.referencia,l.tipo_linea,periodo,
               l.itbms_monto||0,l.itbms_tipo||null,numAsiento]);
          }
          await c.query('UPDATE transacciones SET asiento_generado=true WHERE id=$1', [tx.id]);
          todasLineas.push(...lineas);
          numAsiento++;
        }
      });

      const itbms = calcularITBMS(txns);

      // Agrupar por fecha → estructura diario
      const byFecha = {};
      for (const l of todasLineas) {
        if (!byFecha[l.fecha]) byFecha[l.fecha] = { fecha:l.fecha, lineas:[] };
        byFecha[l.fecha].lineas.push(l);
      }

      const debe  = todasLineas.reduce((s,l) => s+l.debe,  0);
      const haber = todasLineas.reduce((s,l) => s+l.haber, 0);

      res.json({
        periodo,
        asientos: Object.values(byFecha).sort((a,b) => a.fecha.localeCompare(b.fecha)),
        itbms,
        resumen: {
          total_transacciones: txns.length,
          total_asientos:      todasLineas.length,
          total_debe:          +debe.toFixed(2),
          total_haber:         +haber.toFixed(2),
          cuadra:              Math.abs(debe-haber) < 0.02,
          sin_clasificar:      sinCuenta.length,
          errores:             errores.length,
        },
        errores,
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

// ═══ DIARIO GUARDADO ════════════════════════════════════════════════════════

router.get('/diario',
  [qv('periodo').matches(/^\d{4}-\d{2}$/)], ok,
  async (req, res) => {
    try {
      const uid     = req.user.id;
      const periodo = req.query.periodo;
      const conds   = ['a.usuario_id=$1','a.periodo=$2'];
      const p       = [uid,periodo]; let i=3;
      if (req.query.cliente_id) { conds.push(`a.cliente_id=$${i++}`); p.push(req.query.cliente_id); }

      const { rows } = await query(`
        SELECT
          a.numero_asiento,
          a.fecha::text                AS fecha,
          a.cuenta_codigo,
          a.cuenta_nombre,
          a.debe::float                AS debe,
          a.haber::float               AS haber,
          a.descripcion,
          a.referencia,
          a.tipo_linea,
          a.itbms_monto::float         AS itbms_monto,
          a.itbms_tipo,
          t.etiqueta_auto              AS etiqueta,
          t.confianza_clasif           AS confianza,
          t.categoria,
          t.tiene_factura,
          c.nombre                     AS cliente_nombre
        FROM asientos_contables a
        JOIN transacciones t ON t.id = a.transaccion_id
        LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE ${conds.join(' AND ')}
        ORDER BY a.fecha, a.numero_asiento, a.tipo_linea
      `, p);

      if (!rows.length) return res.json({ periodo, generado:false, asientos:[], entradas:[] });

      // Agrupar por fecha con subtotales
      const byFecha = {};
      for (const r of rows) {
        const f = r.fecha.slice(0,10);
        if (!byFecha[f]) byFecha[f] = { fecha:f, asientos:[], subtotal_debe:0, subtotal_haber:0 };
        byFecha[f].asientos.push(r);
        byFecha[f].subtotal_debe  += r.debe  || 0;
        byFecha[f].subtotal_haber += r.haber || 0;
      }

      // Redondear subtotales
      for (const e of Object.values(byFecha)) {
        e.subtotal_debe  = +e.subtotal_debe.toFixed(2);
        e.subtotal_haber = +e.subtotal_haber.toFixed(2);
      }

      const debe  = rows.reduce((s,r) => s + (r.debe||0),  0);
      const haber = rows.reduce((s,r) => s + (r.haber||0), 0);

      res.json({
        periodo, generado:true,
        entradas: Object.values(byFecha),
        resumen: {
          total_lineas: rows.length,
          total_debe:   +debe.toFixed(2),
          total_haber:  +haber.toFixed(2),
          cuadra:       Math.abs(debe-haber) < 0.02,
        },
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

// ═══ ITBMS ═══════════════════════════════════════════════════════════════════

router.get('/itbms',
  [qv('periodo').optional().matches(/^\d{4}-\d{2}$/)], ok,
  async (req, res) => {
    try {
      const uid = req.user.id;
      const { periodo } = req.query;
      const conds = ['usuario_id=$1','itbms > 0']; const p=[uid]; let i=2;
      if (periodo) { conds.push(`periodo=$${i++}`); p.push(periodo); }

      const { rows } = await query(
        `SELECT id,fecha,descripcion,tipo,monto,itbms,deducible,tiene_factura,cliente_nombre
         FROM transacciones WHERE ${conds.join(' AND ')} ORDER BY fecha`, p);

      const result = calcularITBMS(rows);
      let vencimiento = null;
      if (periodo) {
        const [yr,mo] = periodo.split('-').map(Number);
        vencimiento = new Date(yr,mo,15).toISOString().slice(0,10);
      }
      res.json({ ...result, periodo:periodo||'todos', vencimiento });
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

// ═══ CATÁLOGO ════════════════════════════════════════════════════════════════

router.get('/catalogo', async (req, res) => {
  try {
    const cat = await getCatalogo(req.user.id);
    const data = Object.values(cat).sort((a,b) => a.codigo.localeCompare(b.codigo,undefined,{numeric:true}));
    res.json({ data, total: data.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/catalogo', [
  body('codigo').trim().notEmpty(), body('nombre').trim().notEmpty(),
  body('tipo').isIn(['ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO']),
  body('naturaleza').isIn(['DEUDORA','ACREEDORA']),
], ok, async (req, res) => {
  try {
    const { codigo,nombre,tipo,naturaleza,categoria } = req.body;
    const { rows } = await query(`
      INSERT INTO catalogo_cuentas (usuario_id,codigo,nombre,tipo,naturaleza,categoria)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (usuario_id,codigo) DO UPDATE
        SET nombre=$3,tipo=$4,naturaleza=$5,categoria=$6,activo=true RETURNING *`,
      [req.user.id,codigo,nombre,tipo,naturaleza,categoria||null]);
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/catalogo/:codigo', async (req, res) => {
  try {
    const { nombre,categoria,activo } = req.body;
    const { rows } = await query(
      `UPDATE catalogo_cuentas SET nombre=$1,categoria=$2,activo=COALESCE($3,activo)
       WHERE usuario_id=$4 AND codigo=$5 RETURNING *`,
      [nombre,categoria,activo,req.user.id,req.params.codigo]);
    if (!rows.length) return res.status(404).json({ error:'Cuenta no encontrada' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ CATÁLOGO POR CLIENTE ════════════════════════════════════════════════════

router.get('/catalogo-cliente/:clienteId', async (req, res) => {
  try {
    const cat  = await getCatalogo(req.user.id, req.params.clienteId);
    const data = Object.values(cat).sort((a,b) => a.codigo.localeCompare(b.codigo,undefined,{numeric:true}));
    res.json({ data, total: data.length, cliente_id: req.params.clienteId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/catalogo-cliente/:clienteId', [
  body('codigo').trim().notEmpty(), body('nombre').trim().notEmpty(),
  body('tipo').isIn(['ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO']),
  body('naturaleza').isIn(['DEUDORA','ACREEDORA']),
], ok, async (req, res) => {
  try {
    const { codigo,nombre,tipo,naturaleza,categoria } = req.body;
    const { rows } = await query(`
      INSERT INTO catalogo_cliente (usuario_id,cliente_id,codigo,nombre,tipo,naturaleza,categoria)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (cliente_id,codigo) DO UPDATE
        SET nombre=$4,tipo=$5,naturaleza=$6,categoria=$7,activo=true RETURNING *`,
      [req.user.id,req.params.clienteId,codigo,nombre,tipo,naturaleza,categoria||null]);
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ REGLAS ══════════════════════════════════════════════════════════════════

router.get('/reglas', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM reglas_clasificacion
      WHERE activo=true AND (usuario_id=$1 OR usuario_id IS NULL)
      ORDER BY CASE WHEN usuario_id=$1 THEN 0 ELSE 1 END, prioridad`,
      [req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/reglas', [
  body('nombre').trim().notEmpty(), body('patron').trim().notEmpty(),
  body('tipo').isIn(['ingreso','gasto']), body('cuenta_codigo').trim().notEmpty(),
  body('etiqueta').trim().notEmpty(),
], ok, async (req, res) => {
  try {
    try { new RegExp(req.body.patron,'i'); } catch {
      return res.status(422).json({ error:'Patrón regex inválido' });
    }
    const { nombre,patron,tipo,cuenta_codigo,deducible=false,etiqueta,confianza='alta',prioridad=100 } = req.body;
    const { rows } = await query(`
      INSERT INTO reglas_clasificacion
        (usuario_id,nombre,patron,tipo,cuenta_codigo,deducible,etiqueta,confianza,prioridad)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id,nombre,patron,tipo,cuenta_codigo,deducible,etiqueta,confianza,prioridad]);
    invalidarCache(req.user.id);
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/reglas/:id', [param('id').isUUID()], ok, async (req, res) => {
  try {
    if (req.body.patron) try { new RegExp(req.body.patron,'i'); } catch { return res.status(422).json({ error:'Patrón regex inválido' }); }
    const fields = ['nombre','patron','tipo','cuenta_codigo','deducible','etiqueta','confianza','prioridad','activo'];
    const ups=[]; const p=[]; let i=1;
    for (const f of fields) if (req.body[f]!==undefined) { ups.push(`${f}=$${i++}`); p.push(req.body[f]); }
    if (!ups.length) return res.status(400).json({ error:'Sin campos' });
    p.push(req.params.id,req.user.id);
    const { rows } = await query(
      `UPDATE reglas_clasificacion SET ${ups.join(',')} WHERE id=$${i} AND usuario_id=$${i+1} RETURNING *`, p);
    if (!rows.length) return res.status(404).json({ error:'Regla no encontrada' });
    invalidarCache(req.user.id);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/reglas/:id', [param('id').isUUID()], ok, async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM reglas_clasificacion WHERE id=$1 AND usuario_id=$2', [req.params.id,req.user.id]);
    if (!rowCount) return res.status(404).json({ error:'Regla no encontrada' });
    invalidarCache(req.user.id);
    res.json({ message:'Regla eliminada' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ IMPORTACIÓN ════════════════════════════════════════════════════════════

// POST /api/contabilidad/importar
// Body: { contenido, formato, banco, cliente_id, periodo }
// contenido = string CSV o JSON
router.post('/importar', [
  body('contenido').notEmpty().withMessage('Contenido requerido'),
  body('formato').isIn(['csv','json']).withMessage('Formato: csv o json'),
  body('periodo').optional().matches(/^\d{4}-\d{2}$/),
], ok, async (req, res) => {
  try {
    const uid         = req.user.id;
    const { contenido, formato, cliente_id, periodo } = req.body;
    const banco       = req.body.banco || 'generico';
    const nombreArch  = req.body.nombre_archivo || `importacion-${Date.now()}.${formato}`;

    // 1. Parsear contenido
    const parseResult = formato === 'csv'
      ? parsearCSV(contenido, { banco })
      : parsearJSON(contenido);

    if (!parseResult.filas.length) {
      return res.status(422).json({
        error: 'Sin filas válidas',
        errores: parseResult.errores,
      });
    }

    // 2. Obtener transacciones existentes para detectar duplicados
    const periodos = [...new Set(parseResult.filas.map(f => f.fecha?.slice(0,7)).filter(Boolean))];
    const { rows: existentes } = await query(
      `SELECT fecha::text AS fecha, monto::float AS monto, banco FROM transacciones
       WHERE usuario_id=$1 AND periodo = ANY($2::text[])`,
      [uid, periodos]);

    const filasConDups = detectarDuplicados(parseResult.filas, existentes);
    const nuevas       = filasConDups.filter(f => !f.duplicado);
    const duplicadas   = filasConDups.filter(f => f.duplicado);

    if (!nuevas.length) {
      return res.json({
        importadas: 0, duplicadas: duplicadas.length,
        errores: parseResult.errores.length,
        mensaje: 'Todas las filas ya existen en la base de datos.',
      });
    }

    // 3. Clasificar todas las filas nuevas
    const txsParaClasificar = nuevas.map(f => ({
      id: null, descripcion: f.descripcion, tipo: f.tipo,
    }));
    const clasifs = await clasificarBatch(txsParaClasificar, uid);

    // 4. Insertar transacciones
    let insertadas = 0;
    const erroresInsert = [];

    // Crear registro de importación
    const { rows: [imp] } = await query(`
      INSERT INTO importaciones
        (usuario_id,cliente_id,nombre_archivo,tipo,banco,periodo,
         total_filas,importadas,duplicadas,errores,estado)
      VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,'procesando') RETURNING id`,
      [uid,cliente_id||null,nombreArch,formato,banco,
       periodo||periodos[0]||null,parseResult.filas.length,
       duplicadas.length,parseResult.errores.length]);

    await withTransaction(async c => {
      for (let idx = 0; idx < nuevas.length; idx++) {
        const fila  = nuevas[idx];
        const clasif = clasifs[idx]?.clasificacion;
        const txData = normalizarFila(fila, { usuarioId:uid, clienteId:cliente_id||null });

        try {
          await c.query(`
            INSERT INTO transacciones
              (usuario_id,cliente_id,fecha,descripcion,tipo,monto,itbms,
               deducible,banco,referencia,periodo,
               cuenta_contable,etiqueta_auto,confianza_clasif,categoria,
               fuente_origen,datos_origen,tiene_factura,asiento_generado)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,false)`,
            [uid,txData.cliente_id,txData.fecha,txData.descripcion,
             txData.tipo,txData.monto,0,clasif?.deducible||false,
             txData.banco,txData.referencia,txData.periodo,
             clasif?.cuenta||null,clasif?.etiqueta||null,clasif?.confianza||'baja',
             clasif?.categoria||null,
             txData.fuente_origen,txData.datos_origen,false]);
          insertadas++;
        } catch(err) {
          erroresInsert.push({ fila: fila.fila_origen, error: err.message });
        }
      }
    });

    // Actualizar registro de importación
    await query(
      `UPDATE importaciones SET importadas=$1,errores=$2,estado='completado' WHERE id=$3`,
      [insertadas, parseResult.errores.length + erroresInsert.length, imp.id]);

    res.json({
      importacion_id: imp.id,
      importadas,
      duplicadas:     duplicadas.length,
      errores:        parseResult.errores.length + erroresInsert.length,
      detalles_error: [...parseResult.errores, ...erroresInsert.map(e => `Fila ${e.fila}: ${e.error}`)],
      mensaje:        `✓ ${insertadas} transacciones importadas correctamente.`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contabilidad/importaciones
router.get('/importaciones', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.*, c.nombre AS cliente_nombre
      FROM importaciones i
      LEFT JOIN clientes c ON c.id = i.cliente_id
      WHERE i.usuario_id=$1
      ORDER BY i.created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contabilidad/categorias
router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT slug, nombre, color, cuentas FROM categorias_contables
      WHERE activo=true AND (usuario_id=$1 OR usuario_id IS NULL)
      ORDER BY nombre
    `, [req.user.id]);
    res.json({ data: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
