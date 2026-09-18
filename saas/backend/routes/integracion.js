const express = require('express');
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { withAccountingWrite, assertAccountingPeriodOpen } = require('../services/accountingWrite');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const requireIntegrationToken = (req, res, next) => {
  const configuredToken = process.env.CONTAPANAMA_INTEGRATION_TOKEN;
  if (!configuredToken || !configuredToken.trim()) {
    return res.status(503).json({ error: 'Integracion no configurada en ContaPanama.' });
  }
  if (req.get('X-Integration-Token') !== configuredToken) {
    return res.status(401).json({ error: 'Token de integracion invalido.' });
  }
  next();
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const periodOf = fecha => String(fecha).slice(0, 7);
const money = value => Number(Number(value || 0).toFixed(2));
const normalizeCategoriaItbms = value => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'gravado') return 'general';
  if (normalized === 'no_sujeto' || normalized === 'no sujeto') return 'exento';
  if (['general', 'exento', 'alcohol_hospedaje', 'tabaco'].includes(normalized)) return normalized;
  return 'general';
};

const normalizeDraftItem = (item, index) => {
  const tipo = String(item.tipo || '').toLowerCase();
  const monto = Number(item.monto);
  if (!isValidDate(item.fecha)) throw new Error(`Partida ${index + 1}: fecha invalida.`);
  if (!['ingreso', 'gasto'].includes(tipo)) throw new Error(`Partida ${index + 1}: tipo debe ser ingreso o gasto.`);
  if (!Number.isFinite(monto) || monto <= 0) throw new Error(`Partida ${index + 1}: monto debe ser mayor a 0.`);
  if (!String(item.descripcion || '').trim()) throw new Error(`Partida ${index + 1}: descripcion requerida.`);

  const tasaItbms = Number(item.tasa_itbms ?? 0.07);
  return {
    fecha: item.fecha,
    descripcion: String(item.descripcion).trim(),
    tipo,
    monto: money(monto),
    tasa_itbms: Number.isFinite(tasaItbms) ? tasaItbms : 0.07,
    categoria_itbms: normalizeCategoriaItbms(item.categoria_itbms),
    itbms: item.itbms !== undefined ? money(item.itbms) : money(monto * (Number.isFinite(tasaItbms) ? tasaItbms : 0.07)),
    deducible: Boolean(item.deducible),
    categoria_contable: item.categoria_contable || (tipo === 'gasto' ? 'gastos_operativos' : 'ventas_servicios'),
    banco: item.banco || '',
    referencia: item.referencia || '',
    tipo_documento: item.tipo_documento || (tipo === 'gasto' ? 'cuenta_por_pagar' : 'factura'),
    estado_pago: item.estado_pago || 'pendiente',
    fecha_vencimiento: item.fecha_vencimiento || null,
    fecha_pago: item.fecha_pago || null,
    metodo_pago: item.metodo_pago || '',
    referencia_pago: item.referencia_pago || '',
    conciliado: false,
    notas: item.notas || '',
  };
};

router.get('/propuestas', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        p.id,
        p.source_system,
        p.source_work_id,
        p.tipo,
        p.estado,
        p.payload,
        p.created_at,
        p.updated_at,
        c.id AS cliente_id,
        c.nombre AS cliente_nombre,
        c.ruc AS cliente_ruc
      FROM ai_proposals p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE c.usuario_id = $1 OR (p.cliente_id IS NULL AND $2 = 'admin')
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT 100
    `, [req.user.id, req.user.rol]);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/propuestas/:id/vincular-cliente', authMiddleware, [
  body('cliente_id').isUUID().withMessage('cliente_id requerido.'),
], validate, async (req, res) => {
  try {
    const { rows: proposalRows } = await query(
      'SELECT * FROM ai_proposals WHERE id = $1',
      [req.params.id]
    );
    const proposal = proposalRows[0];
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
    if (proposal.cliente_id && req.user.rol !== 'admin') {
      return res.status(409).json({ error: 'La propuesta ya esta vinculada a un cliente.' });
    }

    const { rows: clientRows } = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2',
      [req.body.cliente_id, req.user.id]
    );
    const client = clientRows[0];
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado para este usuario.' });

    const linked = await withTransaction(async db => {
      const { rows } = await db.query(`
        UPDATE ai_proposals
        SET cliente_id = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [client.id, proposal.id]);
      await db.query(`
        UPDATE work_orders
        SET cliente_id = $1, updated_at = NOW()
        WHERE source_system = $2 AND source_work_id = $3
      `, [client.id, proposal.source_system, proposal.source_work_id]);
      await db.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, source_system, source_work_id, accion, objeto_tipo, objeto_id, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        req.user.id,
        client.id,
        proposal.source_system,
        proposal.source_work_id,
        'propuesta_vinculada_a_cliente',
        'ai_proposal',
        proposal.id,
        { cliente_id: client.id, cliente_nombre: client.nombre, cliente_ruc: client.ruc },
      ]);
      return rows[0];
    });

    res.json({ status: 'linked', data: { ...linked, cliente_nombre: client.nombre, cliente_ruc: client.ruc } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/propuestas/:id/rechazar', authMiddleware, [
  body('motivo').trim().isLength({ min: 5 }).withMessage('motivo requerido.'),
], validate, async (req, res) => {
  try {
    const { rows: proposalRows } = await query(`
      SELECT p.*, c.usuario_id
      FROM ai_proposals p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
    `, [req.params.id]);

    const proposal = proposalRows[0];
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
    if (proposal.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
      return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
    }
    if (proposal.estado === 'aplicada_borrador' || proposal.estado === 'aplicada_libro') {
      return res.status(409).json({ error: 'No se puede rechazar una propuesta ya aplicada.' });
    }
    if (proposal.estado === 'rechazada') {
      return res.json({ status: 'already_rejected', data: proposal });
    }

    const motivo = String(req.body.motivo || '').trim();
    const updated = await withTransaction(async client => {
      const { rows } = await client.query(`
        UPDATE ai_proposals
        SET estado = 'rechazada', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [proposal.id]);
      const row = rows[0];
      await client.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, source_system, source_work_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        req.user.id,
        row.cliente_id,
        row.source_system,
        row.source_work_id,
        'propuesta_rechazada',
        'ai_proposal',
        row.id,
        { estado: proposal.estado },
        { estado: row.estado, motivo },
      ]);
      return row;
    });

    res.json({ status: 'rejected', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/propuestas/:id/convertir-borrador', authMiddleware, async (req, res) => {
  try {
    const { rows: proposalRows } = await query(`
      SELECT p.*, c.nombre AS cliente_nombre, c.usuario_id
      FROM ai_proposals p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
    `, [req.params.id]);

    const proposal = proposalRows[0];
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
    if (proposal.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
      return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
    }
    if (proposal.estado === 'rechazada') {
      return res.status(409).json({ error: 'No se puede convertir una propuesta rechazada.' });
    }
    if (!proposal.cliente_id) {
      return res.status(409).json({ error: 'Vincule la propuesta a un cliente antes de crear borradores.' });
    }
    if (proposal.estado === 'aplicada_borrador') {
      const { rows: existing } = await query(
        'SELECT * FROM transacciones WHERE origen_propuesta_id = $1 ORDER BY fecha ASC, created_at ASC',
        [proposal.id]
      );
      return res.json({ status: 'already_applied', data: existing, total: existing.length });
    }

    const draftItems = proposal.payload?.proposal?.draftItems;
    if (!Array.isArray(draftItems) || !draftItems.length) {
      return res.status(422).json({ error: 'La propuesta no contiene partidas contables estructuradas para convertir.' });
    }

    const normalized = draftItems.map(normalizeDraftItem);
    const created = await withAccountingWrite(req.user.id, async db => {
      const rowsCreated = [];
      for (const item of normalized) {
        await assertAccountingPeriodOpen(db, req.user.id, periodOf(item.fecha), proposal.cliente_id);
        const { rows } = await db.query(`
          INSERT INTO transacciones
            (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, categoria_contable, tipo,
             monto, tasa_itbms, categoria_itbms, itbms, deducible, banco, referencia, tipo_documento, estado_pago,
             fecha_vencimiento, fecha_pago, metodo_pago, referencia_pago, conciliado, fecha_conciliacion,
             periodo, notas, origen_propuesta_id, estado_contable)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
          RETURNING *
        `, [
          req.user.id,
          proposal.cliente_id,
          proposal.cliente_nombre,
          item.fecha,
          item.descripcion,
          item.categoria_contable,
          item.tipo,
          item.monto,
          item.tasa_itbms,
          item.categoria_itbms,
          item.itbms,
          item.deducible,
          item.banco,
          item.referencia,
          item.tipo_documento,
          item.estado_pago,
          item.fecha_vencimiento,
          item.fecha_pago,
          item.metodo_pago,
          item.referencia_pago,
          false,
          null,
          periodOf(item.fecha),
          [`BORRADOR IA desde propuesta ${proposal.source_work_id}.`, item.notas].filter(Boolean).join(' '),
          proposal.id,
          'borrador_ia',
        ]);
        rowsCreated.push(rows[0]);
      }

      await db.query(
        `UPDATE ai_proposals SET estado = 'aplicada_borrador', updated_at = NOW() WHERE id = $1`,
        [proposal.id]
      );
      await db.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, source_system, source_work_id, accion, objeto_tipo, objeto_id, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        req.user.id,
        proposal.cliente_id,
        proposal.source_system,
        proposal.source_work_id,
        'propuesta_convertida_a_borrador',
        'ai_proposal',
        proposal.id,
        { transacciones_creadas: rowsCreated.map(t => t.id), total: rowsCreated.length },
      ]);
      return rowsCreated;
    });

    res.status(201).json({ status: 'draft_created', data: created, total: created.length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/propuestas/:id/auditoria', authMiddleware, async (req, res) => {
  try {
    const { rows: proposalRows } = await query(`
      SELECT p.*, c.usuario_id
      FROM ai_proposals p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1
    `, [req.params.id]);

    const proposal = proposalRows[0];
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
    if (proposal.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
      return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
    }

    const { rows } = await query(`
      SELECT
        id,
        usuario_id,
        cliente_id,
        source_system,
        source_work_id,
        accion,
        objeto_tipo,
        objeto_id,
        antes_json,
        despues_json,
        created_at
      FROM audit_events
      WHERE
        (source_system = $1 AND source_work_id = $2)
        OR objeto_id = $3
      ORDER BY created_at ASC
      LIMIT 200
    `, [proposal.source_system, proposal.source_work_id, proposal.id]);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/propuestas', [
  requireIntegrationToken,
  body('source').equals('orlando-cpa-os'),
  body('source_work_id').trim().notEmpty(),
  body('client.name').trim().notEmpty(),
  body('work_order.service').trim().notEmpty(),
  body('work_order.status').equals('Aprobado para entregar'),
], validate, async (req, res) => {
  try {
    const payload = req.body;
    const proposalId = randomUUID();
    const workOrderId = randomUUID();

    const { rows: clientRows } = await query(
      `SELECT id FROM clientes
       WHERE (ruc = $1 OR LOWER(nombre) = LOWER($2))
       ORDER BY created_at DESC
       LIMIT 1`,
      [payload.client.ruc || null, payload.client.name]
    );
    const clienteId = clientRows[0]?.id || null;

    const savedProposalId = await withTransaction(async db => {
      await db.query(`
        INSERT INTO work_orders
          (id, cliente_id, source_system, source_work_id, tipo_servicio, estado, decision_actual, payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (source_system, source_work_id)
        DO UPDATE SET
          cliente_id = EXCLUDED.cliente_id,
          tipo_servicio = EXCLUDED.tipo_servicio,
          estado = EXCLUDED.estado,
          decision_actual = EXCLUDED.decision_actual,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `, [
        workOrderId,
        clienteId,
        payload.source,
        payload.source_work_id,
        payload.work_order.service,
        'aprobado_cpa',
        payload.work_order.decision || 'Propuesta aprobada por Orlando CPA OS',
        payload,
      ]);

      const { rows: proposalRows } = await db.query(`
        INSERT INTO ai_proposals
          (id, source_system, source_work_id, cliente_id, tipo, estado, payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (source_system, source_work_id)
        DO UPDATE SET
          cliente_id = EXCLUDED.cliente_id,
          tipo = EXCLUDED.tipo,
          estado = EXCLUDED.estado,
          payload = EXCLUDED.payload,
          updated_at = NOW()
        RETURNING id
      `, [
        proposalId,
        payload.source,
        payload.source_work_id,
        clienteId,
        payload.proposal?.type || 'revision_cpa',
        'recibida_aprobada_cpa',
        payload,
      ]);

      const actualProposalId = proposalRows[0].id;
      await db.query(`
        INSERT INTO audit_events
          (cliente_id, source_system, source_work_id, accion, objeto_tipo, objeto_id, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        clienteId,
        payload.source,
        payload.source_work_id,
        'propuesta_ia_recibida',
        'ai_proposal',
        actualProposalId,
        payload,
      ]);
      return actualProposalId;
    });

    res.status(201).json({
      status: 'received',
      proposal_id: savedProposalId,
      cliente_id: clienteId,
      message: clienteId
        ? 'Propuesta aprobada recibida y vinculada a cliente existente.'
        : 'Propuesta aprobada recibida; requiere vincular cliente en ContaPanama.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
