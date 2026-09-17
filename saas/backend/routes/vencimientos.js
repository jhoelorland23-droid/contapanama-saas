const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { generarObligacionesFiscales } = require('../services/fiscalEngine');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

router.get('/', [
  qv('estado').optional().isIn(['pendiente','completado','todos']).withMessage('Estado invalido'),
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
], validate, async (req, res) => {
  try {
    const estado = req.query.estado || 'pendiente';
    const conds = ['v.usuario_id = $1'];
    const params = [req.user.id];
    let i = 2;
    if (estado === 'pendiente') conds.push('v.completado = false');
    if (estado === 'completado') conds.push('v.completado = true');
    if (req.query.anio) {
      conds.push(`v.fecha >= $${i++}::date AND v.fecha < ($${i++}::date + INTERVAL '1 year')`);
      params.push(`${req.query.anio}-01-01`, `${req.query.anio}-01-01`);
    } else if (req.query.periodo) {
      conds.push(`v.fecha >= $${i++}::date AND v.fecha < ($${i++}::date + INTERVAL '1 month')`);
      params.push(`${req.query.periodo}-01`, `${req.query.periodo}-01`);
    }
    if (req.query.cliente_id) {
      conds.push(`v.cliente_id = $${i++}`);
      params.push(req.query.cliente_id);
    }
    const { rows } = await query(`
      SELECT v.*, c.nombre AS cliente_nombre_real
      FROM vencimientos v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY v.completado ASC, v.fecha ASC
    `, params);
    res.json({ data: rows, total: rows.length, estado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', [
  body('descripcion').trim().notEmpty(),
  body('entidad').trim().notEmpty(),
  body('fecha').isDate(),
  body('urgencia').isIn(['critica','alta','media','baja']),
  body('cliente_id').optional({ checkFalsy: true }).isUUID().withMessage('Cliente invalido'),
], validate, async (req, res) => {
  try {
    const { descripcion, entidad, cliente_id, cliente_nombre='Todos', fecha, urgencia='media' } = req.body;
    let clienteNombre = cliente_nombre || 'Todos';
    if (cliente_id) {
      const cliente = await query('SELECT id, nombre FROM clientes WHERE id=$1 AND usuario_id=$2', [cliente_id, req.user.id]);
      if (!cliente.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      clienteNombre = cliente.rows[0].nombre;
    }
    const duplicated = await query(`
      SELECT id FROM vencimientos
      WHERE usuario_id=$1
        AND fecha=$2
        AND entidad=$3
        AND lower(trim(descripcion))=lower(trim($4))
        AND cliente_id IS NOT DISTINCT FROM $5
      LIMIT 1
    `, [req.user.id, fecha, entidad, descripcion, cliente_id || null]);
    if (duplicated.rows.length) return res.status(409).json({ error: 'Ya existe un vencimiento igual para ese cliente y fecha' });
    const { rows } = await query(`
      INSERT INTO vencimientos (usuario_id, descripcion, entidad, cliente_id, cliente_nombre, fecha, urgencia)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, descripcion, entidad, cliente_id||null, clienteNombre, fecha, urgencia]);
    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.user.id, rows[0].cliente_id, 'vencimiento_creado', 'vencimiento', rows[0].id, null, rows[0]]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/generar-fiscal', [
  body('anio').isInt({ min: 2000, max: 2100 }).withMessage('Anio invalido'),
  body('cliente_id').optional({ checkFalsy: true }).isUUID().withMessage('Cliente invalido'),
], validate, async (req, res) => {
  try {
    const anio = Number(req.body.anio);
    let clientes = [];
    if (req.body.cliente_id) {
      const result = await query(`
        SELECT id, nombre, ruc, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes
        FROM clientes
        WHERE id=$1 AND usuario_id=$2
      `, [req.body.cliente_id, req.user.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      clientes = result.rows;
    } else {
      const result = await query(`
        SELECT id, nombre, ruc, tipo, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes
        FROM clientes
        WHERE usuario_id=$1 AND COALESCE(estado, 'activo') <> 'inactivo'
        ORDER BY nombre ASC
      `, [req.user.id]);
      clientes = result.rows;
    }

    const obligaciones = clientes.flatMap(cliente => generarObligacionesFiscales({ anio, cliente }));
    const creadas = [];
    const omitidas = [];
    for (const obligacion of obligaciones) {
      const duplicated = await query(`
        SELECT id FROM vencimientos
        WHERE usuario_id=$1
          AND fecha=$2
          AND entidad=$3
          AND lower(trim(descripcion))=lower(trim($4))
          AND cliente_id IS NOT DISTINCT FROM $5
        LIMIT 1
      `, [req.user.id, obligacion.fecha_vencimiento, obligacion.entidad, obligacion.descripcion, obligacion.cliente_id || null]);
      if (duplicated.rows.length) {
        omitidas.push({ ...obligacion, motivo: 'duplicado', vencimiento_id: duplicated.rows[0].id });
        continue;
      }
      const inserted = await query(`
        INSERT INTO vencimientos (usuario_id, descripcion, entidad, cliente_id, cliente_nombre, fecha, urgencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [
        req.user.id,
        obligacion.descripcion,
        obligacion.entidad,
        obligacion.cliente_id || null,
        obligacion.cliente_nombre,
        obligacion.fecha_vencimiento,
        obligacion.urgencia,
      ]);
      await query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [req.user.id, inserted.rows[0].cliente_id, 'vencimiento_fiscal_generado', 'vencimiento', inserted.rows[0].id, null, inserted.rows[0]]);
      creadas.push(inserted.rows[0]);
    }
    res.status(201).json({
      anio,
      cliente_id: req.body.cliente_id || null,
      total_clientes: clientes.length,
      creadas,
      omitidas,
      total_creadas: creadas.length,
      total_omitidas: omitidas.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/completar', async (req, res) => {
  try {
    const current = await query('SELECT * FROM vencimientos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'No encontrado' });
    const { rows } = await query(
      'UPDATE vencimientos SET completado=true, completed_at=NOW() WHERE id=$1 AND usuario_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.user.id, rows[0].cliente_id, 'vencimiento_completado', 'vencimiento', rows[0].id, current.rows[0], rows[0]]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const current = await query('SELECT * FROM vencimientos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'No encontrado' });
    await query('DELETE FROM vencimientos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    await query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.user.id, current.rows[0].cliente_id, 'vencimiento_eliminado', 'vencimiento', current.rows[0].id, current.rows[0], { eliminado: true }]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
