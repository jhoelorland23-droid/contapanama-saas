// ───────────────────────────────────────────────────────────────────
//  /api/fe — Factura Electrónica DGI Panamá (SFEP via PAC)
// ───────────────────────────────────────────────────────────────────
//  POST   /api/fe/facturas              ← crear borrador
//  GET    /api/fe/facturas              ← listar con filtros
//  GET    /api/fe/facturas/:id
//  PUT    /api/fe/facturas/:id          ← editar borrador
//  POST   /api/fe/facturas/:id/lineas   ← agregar/reemplazar líneas
//  POST   /api/fe/facturas/:id/transmitir ← firmar + enviar al PAC
//  POST   /api/fe/facturas/:id/anular   ← nota de crédito de anulación
//  GET    /api/fe/facturas/:id/pdf      ← descargar PDF generado por el PAC
//  GET    /api/fe/facturas/:id/xml      ← descargar XML firmado
//  GET    /api/fe/puntos                ← puntos de facturación
//  POST   /api/fe/puntos                ← alta de punto
//  GET    /api/fe/certificados          ← certificados cargados
//  POST   /api/fe/certificados          ← subir certificado .p12
// ───────────────────────────────────────────────────────────────────

const express = require('express');
const { body, query: qv, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const pac = require('../services/pac');
const { logAction } = require('../services/audit');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

const cobrar = ({ subtotal, descuento = 0, itbms = 0 }) => +(subtotal - descuento + itbms).toFixed(2);

// ===================================================================
//  PUNTOS DE FACTURACIÓN
// ===================================================================
router.get('/puntos', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM fe_puntos_facturacion WHERE usuario_id=$1 ORDER BY codigo`,
      [req.user.id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/puntos', [
  body('codigo').isString().matches(/^\d{3}-\d{3}$/),
  body('nombre').isString().isLength({ min: 1, max: 120 }),
  body('direccion').optional().isString(),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`
      INSERT INTO fe_puntos_facturacion (usuario_id, codigo, nombre, direccion)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user.id, req.body.codigo, req.body.nombre, req.body.direccion || null]);
    // crear secuencia inicial para tipo 01 (factura)
    await query(`INSERT INTO fe_secuencias (punto_id, tipo_doc, ultimo_numero) VALUES ($1, '01', 0)`, [rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe ese código de punto' });
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
//  CERTIFICADOS DIGITALES
// ===================================================================
router.get('/certificados', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, alias, ruc_emisor, vence_at, activo, created_at
      FROM fe_certificados WHERE usuario_id=$1 ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/certificados', [
  body('alias').optional().isString(),
  body('ruc_emisor').isString(),
  body('pkcs12_url').isString(),                    // referencia opaca (S3, etc.)
  body('password_enc').isString(),
  body('vence_at').isDate(),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`
      INSERT INTO fe_certificados (usuario_id, alias, ruc_emisor, pkcs12_url, password_enc, vence_at)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, alias, ruc_emisor, vence_at, activo, created_at
    `, [req.user.id, req.body.alias || null, req.body.ruc_emisor, req.body.pkcs12_url, req.body.password_enc, req.body.vence_at]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — listado
// ===================================================================
router.get('/facturas', [
  qv('estado').optional().isIn(['borrador','transmitiendo','autorizada','rechazada','anulada']),
  qv('cliente_id').optional().isUUID(),
  qv('desde').optional().isDate(),
  qv('hasta').optional().isDate(),
  qv('limit').optional().isInt({ min: 1, max: 500 }),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const conds = ['f.usuario_id = $1']; const params = [uid]; let i = 2;
    if (req.query.estado)     { conds.push(`f.estado = $${i++}`);     params.push(req.query.estado); }
    if (req.query.cliente_id) { conds.push(`f.cliente_id = $${i++}`); params.push(req.query.cliente_id); }
    if (req.query.desde)      { conds.push(`f.fecha_emision >= $${i++}`); params.push(req.query.desde); }
    if (req.query.hasta)      { conds.push(`f.fecha_emision <= $${i++}`); params.push(req.query.hasta); }
    const limit = parseInt(req.query.limit || '100');

    const { rows } = await query(`
      SELECT f.*, c.nombre AS cliente_nombre
      FROM fe_facturas f
      LEFT JOIN clientes c ON c.id = f.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY f.fecha_emision DESC
      LIMIT ${limit}
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/facturas/:id', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rows: fact } = await query(`
      SELECT f.*, c.nombre AS cliente_nombre
      FROM fe_facturas f
      LEFT JOIN clientes c ON c.id = f.cliente_id
      WHERE f.id = $1 AND f.usuario_id = $2
    `, [req.params.id, req.user.id]);
    if (!fact.length) return res.status(404).json({ error: 'Factura no encontrada' });

    const { rows: lineas } = await query(
      `SELECT * FROM fe_lineas WHERE factura_id = $1 ORDER BY orden`, [req.params.id]
    );
    const { rows: eventos } = await query(
      `SELECT * FROM fe_eventos WHERE factura_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]
    );

    res.json({ ...fact[0], lineas, eventos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — crear borrador
// ===================================================================
router.post('/facturas', [
  body('cliente_id').optional().isUUID(),
  body('receptor_ruc').isString().isLength({ min: 1, max: 50 }),
  body('receptor_nombre').isString().isLength({ min: 1, max: 200 }),
  body('receptor_dv').optional().isString(),
  body('receptor_email').optional().isEmail(),
  body('receptor_tipo').optional().isIn(['jurídica','natural','extranjero','consumidor_final']),
  body('punto_id').optional().isUUID(),
  body('condicion_pago').optional().isIn(['contado','credito_15','credito_30','credito_45']),
  body('moneda').optional().isString(),
  body('lineas').optional().isArray(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const b = req.body;

    // Obtener / reservar siguiente número
    let punto = null, numero = null;
    if (b.punto_id) {
      const r = await query(`
        UPDATE fe_secuencias SET ultimo_numero = ultimo_numero + 1
        WHERE punto_id = $1 AND tipo_doc = '01' RETURNING ultimo_numero
      `, [b.punto_id]);
      if (r.rows.length) {
        const n = r.rows[0].ultimo_numero;
        numero = `FE-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
        punto = b.punto_id;
      }
    }

    const { rows: fact } = await query(`
      INSERT INTO fe_facturas
        (usuario_id, cliente_id, punto_id, numero, tipo_doc,
         receptor_ruc, receptor_dv, receptor_nombre, receptor_email, receptor_tipo,
         condicion_pago, moneda, estado)
      VALUES ($1,$2,$3,$4,'01',$5,$6,$7,$8,$9,$10,$11,'borrador')
      RETURNING *
    `, [
      uid, b.cliente_id || null, punto, numero,
      b.receptor_ruc, b.receptor_dv || null, b.receptor_nombre, b.receptor_email || null,
      b.receptor_tipo || 'jurídica',
      b.condicion_pago || 'contado', b.moneda || 'USD',
    ]);
    const factura = fact[0];

    // Insertar líneas si vinieron en el body
    if (Array.isArray(b.lineas) && b.lineas.length) {
      await insertLineas(factura.id, b.lineas);
      await recalcularTotales(factura.id);
    }

    await query(`INSERT INTO fe_eventos (factura_id, evento, detalle) VALUES ($1, 'creada', $2)`,
      [factura.id, { por: uid }]);
    await logAction(req, 'fe.crear', 'fe_facturas', factura.id, { numero: factura.numero });

    const { rows } = await query(`SELECT * FROM fe_facturas WHERE id = $1`, [factura.id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — actualizar borrador
// ===================================================================
router.put('/facturas/:id', [
  param('id').isUUID(),
  body('lineas').optional().isArray(),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM fe_facturas WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
    if (rows[0].estado !== 'borrador') {
      return res.status(400).json({ error: 'Solo se pueden editar borradores' });
    }

    const allowed = ['cliente_id','receptor_ruc','receptor_dv','receptor_nombre','receptor_email',
                     'receptor_tipo','condicion_pago','moneda','punto_id','dias_credito'];
    const sets = []; const params = []; let i = 1;
    allowed.forEach(k => { if (k in req.body) { sets.push(`${k} = $${i++}`); params.push(req.body[k]); } });

    if (sets.length) {
      params.push(req.params.id);
      await query(`UPDATE fe_facturas SET ${sets.join(', ')} WHERE id = $${i}`, params);
    }

    if (Array.isArray(req.body.lineas)) {
      await query(`DELETE FROM fe_lineas WHERE factura_id = $1`, [req.params.id]);
      await insertLineas(req.params.id, req.body.lineas);
    }
    await recalcularTotales(req.params.id);

    const { rows: fresh } = await query(`SELECT * FROM fe_facturas WHERE id = $1`, [req.params.id]);
    res.json(fresh[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — transmitir al PAC
// ===================================================================
router.post('/facturas/:id/transmitir', [param('id').isUUID()], validate, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows } = await query(`
      SELECT f.*, c.email AS cliente_email
      FROM fe_facturas f LEFT JOIN clientes c ON c.id=f.cliente_id
      WHERE f.id=$1 AND f.usuario_id=$2
    `, [req.params.id, uid]);
    if (!rows.length) return res.status(404).json({ error: 'Factura no encontrada' });

    const fact = rows[0];
    if (fact.estado !== 'borrador') return res.status(400).json({ error: 'Solo se pueden transmitir borradores' });

    const { rows: lineas } = await query(`SELECT * FROM fe_lineas WHERE factura_id=$1 ORDER BY orden`, [fact.id]);
    if (!lineas.length) return res.status(400).json({ error: 'La factura no tiene líneas' });

    // Marcar como transmitiendo
    await query(`UPDATE fe_facturas SET estado='transmitiendo', transmitida_at=NOW() WHERE id=$1`, [fact.id]);
    await query(`INSERT INTO fe_eventos (factura_id, evento, detalle) VALUES ($1, 'transmitiendo', $2)`,
      [fact.id, { intentado_por: uid }]);

    // Llamada al PAC (mock o real según config)
    let resultado;
    try {
      resultado = await pac.transmitir({ factura: fact, lineas });
    } catch (e) {
      await query(`UPDATE fe_facturas SET estado='rechazada', estado_dgi=$1 WHERE id=$2`,
        [e.message.slice(0, 80), fact.id]);
      await query(`INSERT INTO fe_eventos (factura_id, evento, detalle) VALUES ($1, 'rechazada', $2)`,
        [fact.id, { error: e.message }]);
      return res.status(502).json({ error: 'PAC rechazó la transmisión', detalle: e.message });
    }

    await query(`
      UPDATE fe_facturas SET
        estado='autorizada', estado_dgi=$1, cufe=$2, qr_data=$3, xml_url=$4, pdf_url=$5,
        autorizada_at=NOW()
      WHERE id=$6
    `, [resultado.estado_dgi, resultado.cufe, resultado.qr_data, resultado.xml_url, resultado.pdf_url, fact.id]);

    await query(`INSERT INTO fe_eventos (factura_id, evento, detalle) VALUES ($1, 'autorizada', $2)`,
      [fact.id, resultado]);

    // Crear transacción contable automática (asiento de venta)
    const periodo = new Date(fact.fecha_emision).toISOString().slice(0, 7);
    const { rows: tx } = await query(`
      INSERT INTO transacciones
        (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, tipo, monto, itbms,
         deducible, referencia, periodo, notas)
      VALUES ($1,$2,$3,$4,$5,'ingreso',$6,$7,false,$8,$9,$10)
      RETURNING id
    `, [
      uid, fact.cliente_id, fact.receptor_nombre,
      new Date(fact.fecha_emision).toISOString().slice(0, 10),
      `FE ${fact.numero || resultado.cufe}`,
      fact.subtotal, fact.itbms, fact.numero || resultado.cufe, periodo,
      `Auto-generado al transmitir FE ${fact.id}`,
    ]);
    await query(`UPDATE fe_facturas SET transaccion_id=$1 WHERE id=$2`, [tx[0].id, fact.id]);

    await logAction(req, 'fe.transmitir', 'fe_facturas', fact.id, { cufe: resultado.cufe, total: fact.total });

    const { rows: fresh } = await query(`SELECT * FROM fe_facturas WHERE id=$1`, [fact.id]);
    res.json(fresh[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — anular (genera nota de crédito)
// ===================================================================
router.post('/facturas/:id/anular', [
  param('id').isUUID(),
  body('motivo').isString().isLength({ min: 5, max: 500 }),
], validate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM fe_facturas WHERE id=$1 AND usuario_id=$2
    `, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
    if (rows[0].estado !== 'autorizada') return res.status(400).json({ error: 'Solo se pueden anular facturas autorizadas' });

    const resultado = await pac.anular({ cufe: rows[0].cufe, motivo: req.body.motivo });

    await query(`
      UPDATE fe_facturas SET estado='anulada', anulada_at=NOW(), motivo_anulacion=$1, estado_dgi=$2
      WHERE id=$3
    `, [req.body.motivo, resultado.estado_dgi, req.params.id]);

    await query(`INSERT INTO fe_eventos (factura_id, evento, detalle) VALUES ($1, 'anulada', $2)`,
      [req.params.id, { motivo: req.body.motivo, resultado }]);
    await logAction(req, 'fe.anular', 'fe_facturas', req.params.id, { motivo: req.body.motivo });

    res.json({ ok: true, ...resultado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  FACTURAS — descargas
// ===================================================================
router.get('/facturas/:id/pdf', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT pdf_url, numero, estado FROM fe_facturas WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!rows[0].pdf_url) return res.status(400).json({ error: 'La factura aún no tiene PDF (¿no se ha transmitido?)' });
    res.redirect(rows[0].pdf_url);                    // si está en S3/Spaces; o pipear el stream local
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/facturas/:id/xml', [param('id').isUUID()], validate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT xml_url FROM fe_facturas WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!rows[0].xml_url) return res.status(400).json({ error: 'XML no disponible aún' });
    res.redirect(rows[0].xml_url);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================================================================
//  Helpers
// ===================================================================
async function insertLineas(facturaId, lineas) {
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const cant = parseFloat(l.cantidad || 1);
    const pu   = parseFloat(l.precio_unitario || 0);
    const desc = parseFloat(l.descuento || 0);
    const apl  = l.itbms_aplica !== false;
    const tasa = parseFloat(l.itbms_tasa || 0.07);
    const base = cant * pu - desc;
    const itbms = apl ? +(base * tasa).toFixed(2) : 0;
    const total = +(base + itbms).toFixed(2);
    await query(`
      INSERT INTO fe_lineas
        (factura_id, orden, descripcion, cantidad, precio_unitario, descuento,
         itbms_aplica, itbms_tasa, itbms_monto, total_linea, cuenta_contable)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [facturaId, i + 1, l.descripcion, cant, pu, desc, apl, tasa, itbms, total, l.cuenta_contable || null]);
  }
}

async function recalcularTotales(facturaId) {
  const { rows } = await query(`
    SELECT
      COALESCE(SUM(cantidad * precio_unitario - descuento), 0)::numeric(14,2) AS subtotal,
      COALESCE(SUM(descuento), 0)::numeric(14,2) AS descuento,
      COALESCE(SUM(itbms_monto), 0)::numeric(14,2) AS itbms
    FROM fe_lineas WHERE factura_id = $1
  `, [facturaId]);
  const r = rows[0];
  const total = cobrar({ subtotal: parseFloat(r.subtotal), descuento: 0, itbms: parseFloat(r.itbms) });
  await query(`
    UPDATE fe_facturas SET subtotal=$1, descuento=$2, itbms=$3, total=$4 WHERE id=$5
  `, [r.subtotal, r.descuento, r.itbms, total, facturaId]);
}

module.exports = router;
