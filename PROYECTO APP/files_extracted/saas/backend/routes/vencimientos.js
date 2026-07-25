const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT v.*, c.nombre AS cliente_nombre_real
      FROM vencimientos v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.usuario_id = $1 AND v.completado = false
      ORDER BY v.fecha ASC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', [
  body('descripcion').trim().notEmpty(),
  body('entidad').trim().notEmpty(),
  body('fecha').isDate(),
  body('urgencia').isIn(['critica','alta','media','baja']),
], validate, async (req, res) => {
  try {
    const { descripcion, entidad, cliente_id, cliente_nombre='Todos', fecha, urgencia='media' } = req.body;
    const { rows } = await query(`
      INSERT INTO vencimientos (usuario_id, descripcion, entidad, cliente_id, cliente_nombre, fecha, urgencia)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, descripcion, entidad, cliente_id||null, cliente_nombre, fecha, urgencia]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/completar', async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE vencimientos SET completado=true WHERE id=$1 AND usuario_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM vencimientos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
