const express = require('express');
const { validatePayment, isSettlementOnlyUpdate, isReconciliationReversal } = require('../services/paymentValidation');
const { dateKey } = require('../services/accountingPeriod');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { withAccountingWrite } = require('../services/accountingWrite');
const { authMiddleware } = require('../middleware/auth');
const { isRegisteredTransaction, registeredTransactionSql } = require('../services/transactionStatus');
const { attachPayments, paymentRepository } = require('../services/paymentRepository');
const { paymentSummary, outstandingAt, fail } = require('../services/paymentLedger');
const { createPaymentRouter } = require('./pagos');
const { changesFrom, documentRevision, authorizeCorrection, correctionAudit, isCorrectionReplay } = require('../services/documentCorrection');
const { IDEMPOTENCY_KEY, sameDocument } = require('../services/documentIdempotency');

const router = express.Router();
router.use(authMiddleware);
router.use(createPaymentRouter(paymentRepository));

async function assertNoPaymentHistory(db, uid, id) {
  const result = await db.query('SELECT id FROM pagos_transacciones WHERE transaccion_id=$1 AND usuario_id=$2 LIMIT 1', [id, uid]);
  if (result.rows.length) fail('El documento tiene un historial de pagos. Gestione cada abono desde Pagos; no se permite sobrescribir ni eliminar el documento.', 409);
}

const periodOf = fecha => dateKey(fecha).slice(0, 7);

const assertPeriodOpen = async (uid, periodo, clienteId = null, db = { query }) => {
  const year = Number(String(periodo || '').slice(0, 4));
  const { rows } = await db.query(`
    SELECT id, alcance, periodo, anio, cliente_id, estado, nota, cerrado_at
    FROM cierres_periodo
    WHERE usuario_id = $1
      AND estado = 'cerrado'
      AND (
        (alcance = 'mensual' AND periodo = $2)
        OR (alcance = 'anual' AND anio = $3)
      )
      AND (
        cliente_id IS NULL
        OR ($4::uuid IS NOT NULL AND cliente_id = $4::uuid)
      )
    LIMIT 1
  `, [uid, periodo, Number.isFinite(year) ? year : null, clienteId || null]);
  if (rows.length) {
    const cierre = rows[0];
    const error = new Error(
      cierre.alcance === 'anual'
        ? `El año ${cierre.anio} está cerrado. Reabra el periodo antes de modificar registros contables.`
        : `El periodo ${cierre.periodo} está cerrado. Reabra el periodo antes de modificar registros contables.`
    );
    error.status = 409;
    error.cierre = cierre;
    throw error;
  }
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// ── GET /api/transacciones ─────────────────────────────────────────────────
router.get('/', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('anio').optional().matches(/^\d{4}$/),
  qv('tipo').optional().isIn(['ingreso','gasto']),
  qv('cliente_id').optional().isUUID(),
  qv('desde').optional().isDate(),
  qv('hasta').optional().isDate(),
  qv('search').optional().trim(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, anio, tipo, cliente_id, desde, hasta, search } = req.query;
    const conds = ['t.usuario_id = $1'];
    const params = [uid]; let i = 2;

    if (periodo)    { conds.push(`t.periodo = $${i++}`);               params.push(periodo); }
    if (anio)       { conds.push(`t.periodo LIKE $${i++}`);             params.push(`${anio}-%`); }
    if (tipo)       { conds.push(`t.tipo = $${i++}`);                  params.push(tipo); }
    if (cliente_id) { conds.push(`t.cliente_id = $${i++}`);            params.push(cliente_id); }
    if (desde)      { conds.push(`t.fecha >= $${i++}`);                params.push(desde); }
    if (hasta)      { conds.push(`t.fecha <= $${i++}`);                params.push(hasta); }
    if (search)     { conds.push(`t.descripcion ILIKE $${i++}`);       params.push(`%${search}%`); }

    const { rows } = await query(`
      SELECT t.*, c.ruc AS cliente_ruc, c.tipo AS cliente_tipo_persona
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY t.fecha DESC, t.created_at DESC
    `, params);

    const data = (await attachPayments(rows, uid)).map(t => ({ ...t, ...paymentSummary(t) }));
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/resumen ─────────────────────────────────────────
router.get('/resumen', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('anio').optional().matches(/^\d{4}$/),
  qv('cliente_id').optional().isUUID(),
  qv('desde').optional().isDate(),
  qv('hasta').optional().isDate(),
  qv('search').optional().trim(),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, anio, cliente_id, desde, hasta, search } = req.query;
    const conds = ['usuario_id = $1', registeredTransactionSql()]; const params = [uid]; let i = 2;
    if (periodo) { conds.push(`periodo = $${i++}`); params.push(periodo); }
    if (anio)    { conds.push(`periodo LIKE $${i++}`); params.push(`${anio}-%`); }
    if (cliente_id) { conds.push(`cliente_id = $${i++}`); params.push(cliente_id); }
    if (desde)   { conds.push(`fecha >= $${i++}`);  params.push(desde); }
    if (hasta)   { conds.push(`fecha <= $${i++}`);  params.push(hasta); }
    if (search)  { conds.push(`descripcion ILIKE $${i++}`); params.push(`%${search}%`); }

    const { rows } = await query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'), 0)::NUMERIC(14,2)              AS total_ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),   0)::NUMERIC(14,2)              AS total_gastos,
        (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2)            AS utilidad_neta,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='ingreso'), 0)::NUMERIC(14,2)             AS itbms_debito,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='gasto' AND deducible), 0)::NUMERIC(14,2) AS itbms_credito,
        (COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS itbms_neto,
        COALESCE(SUM(monto + COALESCE(itbms,0)) FILTER (WHERE tipo='ingreso' AND estado_pago!='pagado'), 0)::NUMERIC(14,2) AS cuentas_por_cobrar,
        COALESCE(SUM(monto + COALESCE(itbms,0)) FILTER (WHERE tipo='gasto' AND estado_pago!='pagado'), 0)::NUMERIC(14,2) AS cuentas_por_pagar,
        COUNT(*) FILTER (WHERE tipo='ingreso' AND estado_pago!='pagado')                    AS num_por_cobrar,
        COUNT(*) FILTER (WHERE tipo='gasto' AND estado_pago!='pagado')                      AS num_por_pagar,
        COUNT(*) FILTER (WHERE tipo='ingreso')                                             AS num_ingresos,
        COUNT(*) FILTER (WHERE tipo='gasto')                                               AS num_gastos,
        COUNT(DISTINCT cliente_id)                                                         AS num_clientes
      FROM transacciones WHERE ${conds.join(' AND ')}
    `, params);
    const documents = await query(`SELECT * FROM transacciones WHERE ${conds.join(' AND ')}`, params);
    const pending = (await attachPayments(documents.rows, uid)).map(t => ({ tipo: t.tipo, saldo: outstandingAt(t) })).filter(t => t.saldo > 0);
    res.json({ ...rows[0],
      cuentas_por_cobrar: pending.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.saldo, 0).toFixed(2),
      cuentas_por_pagar: pending.filter(t => t.tipo === 'gasto').reduce((s, t) => s + t.saldo, 0).toFixed(2),
      num_por_cobrar: pending.filter(t => t.tipo === 'ingreso').length,
      num_por_pagar: pending.filter(t => t.tipo === 'gasto').length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/diario?periodo=YYYY-MM ──────────────────────────
// Diario combinado agrupado por fecha — listo para auditoría
router.get('/diario', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido YYYY-MM'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
], validate, async (req, res) => {
  try {
    const conds = ['t.usuario_id = $1', 't.periodo = $2', registeredTransactionSql('t')];
    const params = [req.user.id, req.query.periodo];
    if (req.query.cliente_id) {
      conds.push('t.cliente_id = $3');
      params.push(req.query.cliente_id);
    }
    const { rows } = await query(`
      SELECT t.*, c.ruc AS cliente_ruc, c.tipo AS cliente_tipo_persona
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY t.fecha ASC, t.created_at ASC
    `, params);

    // Agrupar por fecha
    const byDate = {};
    for (const r of rows) {
      const d = String(r.fecha).slice(0, 10);
      if (!byDate[d]) byDate[d] = { fecha: d, asientos: [], debe: 0, haber: 0 };
      byDate[d].asientos.push(r);
      if (r.tipo === 'ingreso') byDate[d].haber += parseFloat(r.monto);
      else                      byDate[d].debe  += parseFloat(r.monto);
    }

    const totalIngresos = rows.filter(r=>r.tipo==='ingreso').reduce((s,r)=>s+parseFloat(r.monto),0);
    const totalGastos   = rows.filter(r=>r.tipo==='gasto').reduce((s,r)=>s+parseFloat(r.monto),0);

    res.json({
      periodo: req.query.periodo,
      total_asientos: rows.length,
      total_ingresos: totalIngresos.toFixed(2),
      total_gastos:   totalGastos.toFixed(2),
      resultado:      (totalIngresos - totalGastos).toFixed(2),
      entradas:       Object.values(byDate),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/evolucion ──────────────────────────────────────
// Evolución mensual de ingresos y gastos para gráficas
router.get('/evolucion', async (req, res) => {
  try {
    const anio = req.query.anio || new Date().getFullYear();
    const { rows } = await query(`
      SELECT
        periodo,
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)   AS gastos,
        (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2) AS utilidad
      FROM transacciones
      WHERE usuario_id = $1 AND periodo LIKE $2 AND ${registeredTransactionSql()}
      GROUP BY periodo
      ORDER BY periodo ASC
    `, [req.user.id, `${anio}-%`]);
    res.json({ anio, meses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transacciones/:id/auditoria ───────────────────────────────────
router.get('/:id/auditoria', async (req, res) => {
  try {
    const { rows: txRows } = await query(
      'SELECT id FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!txRows.length) return res.status(404).json({ error: 'Transacción no encontrada' });

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
      WHERE usuario_id = $3 AND (objeto_id = $1
         OR despues_json->>'transaccion_id' = $2)
      ORDER BY created_at ASC
      LIMIT 200
    `, [req.params.id, req.params.id, req.user.id]);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/revision', async (req, res) => {
  try {
    if (!['admin', 'contador'].includes(req.user.rol)) fail('Solo un contador o administrador puede corregir documentos.', 403);
    const { rows: [current] } = await query('SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]);
    if (!current) fail('Transaccion no encontrada.', 404);
    await assertNoPaymentHistory({ query }, req.user.id, current.id);
    if (current.conciliado) fail('Primero debe reversarse la conciliacion.', 409);
    await assertPeriodOpen(req.user.id, current.periodo, current.cliente_id);
    res.json({ documento: current, revision: documentRevision(current) });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

// ── GET /api/transacciones/:id ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    const tx = (await attachPayments(rows, req.user.id))[0];
    res.json({ ...tx, ...paymentSummary(tx) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/transacciones ────────────────────────────────────────────────
router.post('/', [
  body('fecha').isDate().withMessage('Fecha inválida'),
  body('descripcion').trim().notEmpty().withMessage('Descripción requerida'),
  body('tipo').isIn(['ingreso','gasto']).withMessage('Tipo inválido'),
  body('monto').isFloat({ min: 0.01 }).withMessage('Monto debe ser mayor a 0'),
  body('cliente_id').optional({ checkFalsy: true }).isUUID(),
  body('itbms').optional().isFloat({ min: 0 }),
  body('tasa_itbms').optional().isFloat({ min: 0, max: 0.15 }),
  body('idempotencia').optional({ values: 'null' }).isString().matches(IDEMPOTENCY_KEY).withMessage('Identificador del documento inválido'),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    let replay = false;
    const {
      cliente_id, cliente_nombre, fecha, descripcion, tipo,
      categoria_contable,
      banco='', referencia='', notas='', deducible=false, tipo_documento, estado_pago='pendiente',
      tasa_itbms=0.07, categoria_itbms='general',
      fecha_vencimiento=null, fecha_pago=null, metodo_pago='', referencia_pago='', conciliado=false, fecha_conciliacion=null
    } = req.body;
    if (conciliado === true) {
      return res.status(409).json({ error: 'No se puede crear una transacción conciliada sin movimiento bancario vinculado.' });
    }

    const monto = parseFloat(req.body.monto);
    const tasaItbms = parseFloat(tasa_itbms);
    const itbms = req.body.itbms !== undefined
      ? parseFloat(req.body.itbms)
      : parseFloat((monto * tasaItbms).toFixed(2));
    const periodo = periodOf(fecha);
    const paymentError = validatePayment(req.body);
    if (paymentError) return res.status(422).json({ error: paymentError });

    const created = await withAccountingWrite(uid, async db => {
      // Under the owner lock: a double click, a lost response or a retry returns the
      // document already published for this key instead of posting a second one.
      if (req.body.idempotencia) {
        const { rows: previous } = await db.query('SELECT * FROM transacciones WHERE usuario_id=$1 AND idempotencia=$2', [uid, req.body.idempotencia]);
        if (previous.length) {
          if (!sameDocument(previous[0], { cliente_id, fecha, descripcion, tipo, monto, itbms })) fail('Ese identificador ya corresponde a otro documento.', 409);
          replay = true;
          db.touchJournal(previous[0].id);
          return previous[0];
        }
      }
      await assertPeriodOpen(uid, periodo, cliente_id || null, db);
      if (fecha_pago) await assertPeriodOpen(uid, periodOf(fecha_pago), cliente_id || null, db);

      // Resolver nombre del cliente
      let nomCliente = cliente_nombre || null;
      if (cliente_id) {
        const { rows: cl } = await db.query(
          'SELECT nombre FROM clientes WHERE id = $1 AND usuario_id = $2',
          [cliente_id, uid]
        );
        if (!cl.length) fail('Cliente no encontrado.', 404);
        nomCliente = cl[0].nombre;
      }
      const { documentAccountId, assertAccountOwner } = require('../services/bankAccount');
      const accountId = documentAccountId(req.body);
      if (accountId) assertAccountOwner((await db.query('SELECT * FROM cuentas_bancarias WHERE id=$1 AND usuario_id=$2',[accountId,uid])).rows[0],req.body);

      const { rows } = await db.query(`
        INSERT INTO transacciones
          (usuario_id, cliente_id, cliente_nombre, fecha, descripcion, categoria_contable, tipo,
           monto, tasa_itbms, categoria_itbms, itbms, deducible, banco, referencia, tipo_documento, estado_pago,
           fecha_vencimiento, fecha_pago, metodo_pago, referencia_pago, conciliado, fecha_conciliacion, periodo, notas, cuenta_bancaria_id, idempotencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING *
      `, [uid, cliente_id||null, nomCliente, fecha, descripcion, categoria_contable || (tipo === 'gasto' ? 'gastos_operativos' : 'ventas_servicios'), tipo,
          monto, tasaItbms, categoria_itbms, itbms, deducible, banco, referencia, tipo_documento || (tipo === 'gasto' ? 'cuenta_por_pagar' : 'factura'),
          estado_pago, fecha_vencimiento || null, fecha_pago || null, metodo_pago, referencia_pago, Boolean(conciliado),
          Boolean(conciliado) ? (fecha_conciliacion || fecha_pago || fecha) : null, periodo, notas, accountId, req.body.idempotencia || null]);

      await db.query(`INSERT INTO audit_events(usuario_id,cliente_id,accion,objeto_tipo,objeto_id,despues_json)
        VALUES($1,$2,'transaccion_creada','transaccion',$3,$4)`, [uid, rows[0].cliente_id, rows[0].id, rows[0]]);
      db.touchJournal(rows[0].id);
      return rows[0];
    });
    res.status(replay ? 200 : 201).json(replay ? { ...created, repetido: true } : created);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, cierre: err.cierre });
  }
});

// ── PUT /api/transacciones/:id ─────────────────────────────────────────────
router.put('/:id', [
  body('cliente_id').optional({ checkFalsy: true }).isUUID(),
  body('monto').optional().isFloat({ min: 0.01 }),
  body('tipo').optional().isIn(['ingreso','gasto']),
  body('fecha').optional().isDate(),
], validate, async (req, res) => {
  try {
    const { rows: currentRows } = await query(
      'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!currentRows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    const current = currentRows[0];
    if (req.body.cliente_id !== undefined) {
      let clientName = req.body.cliente_nombre || null;
      if (req.body.cliente_id) {
        const { rows: clients } = await query('SELECT nombre FROM clientes WHERE id=$1 AND usuario_id=$2', [req.body.cliente_id, req.user.id]);
        if (!clients.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
        clientName = clients[0].nombre;
      }
      req.body = { ...req.body, cliente_nombre: clientName };
    }
    await assertNoPaymentHistory({ query }, req.user.id, current.id);
    if (req.body.estado_contable !== undefined) {
      return res.status(409).json({ error: 'Use Registrar para confirmar un borrador en libros.' });
    }
    if (!isRegisteredTransaction(current) && ((req.body.estado_pago && req.body.estado_pago !== 'pendiente') || req.body.fecha_pago)) {
      return res.status(409).json({ error: 'Registre el borrador antes de ingresar un pago o cobro.' });
    }
    const protectedFields = ['cliente_id','cliente_nombre','fecha','descripcion','tipo','categoria_contable','monto','tasa_itbms','categoria_itbms','itbms','deducible','banco','referencia','tipo_documento','estado_pago','fecha_pago','metodo_pago','referencia_pago'];
    const lockedFields = protectedFields.filter(field => req.body[field] !== undefined);
    const reversaConciliacion = current.conciliado && req.body.conciliado === false;
    if (!current.conciliado && req.body.conciliado === true) {
      return res.status(409).json({ error: 'Use el módulo de conciliación bancaria para vincular la transacción con un movimiento del banco.' });
    }
    if (current.conciliado && lockedFields.length && !reversaConciliacion) {
      return res.status(409).json({ error: `No se puede modificar una transacción conciliada. Primero debe reversarse la conciliación. Campos bloqueados: ${lockedFields.join(', ')}` });
    }
    const paymentOnly = isSettlementOnlyUpdate(current, changesFrom(req.body)) || isReconciliationReversal(current, changesFrom(req.body));
    if (!paymentOnly) await assertPeriodOpen(req.user.id, current.periodo || periodOf(current.fecha), current.cliente_id || null);
    const next = { ...current, ...req.body };
    if (lockedFields.length) {
      const paymentError = validatePayment(next);
      if (paymentError) return res.status(422).json({ error: paymentError });
    }
    for (const tx of [current, next]) {
      if (tx.fecha_pago) await assertPeriodOpen(req.user.id, String(tx.fecha_pago instanceof Date ? tx.fecha_pago.toISOString() : tx.fecha_pago).slice(0, 7), tx.cliente_id || null);
    }

    const nextPeriod = req.body.fecha ? periodOf(req.body.fecha) : (current.periodo || periodOf(current.fecha));
    const nextClientId = req.body.cliente_id !== undefined ? (req.body.cliente_id || null) : (current.cliente_id || null);
    if (nextPeriod !== (current.periodo || periodOf(current.fecha)) || nextClientId !== (current.cliente_id || null)) {
      await assertPeriodOpen(req.user.id, nextPeriod, nextClientId);
    }

    const updatable = ['cliente_id','cliente_nombre','fecha','descripcion','tipo',
                       'categoria_contable','monto','tasa_itbms','categoria_itbms','itbms','deducible','banco','referencia','tipo_documento',
                       'estado_pago','fecha_vencimiento','fecha_pago','metodo_pago','referencia_pago','conciliado',
                       'fecha_conciliacion','notas'];
    const updates = []; const params = []; let i = 1;
    for (const f of updatable) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
    }
    if (req.body.fecha) { updates.push(`periodo = $${i++}`); params.push(periodOf(req.body.fecha)); }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos a actualizar' });
    params.push(req.params.id, req.user.id);

    const writeContext = {};
    const updated = await withAccountingWrite(req.user.id, async client => {
      client.touchJournal(current.id);
      const locked = await client.query('SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [current.id, req.user.id]);
      if (locked.rows.length && req.body.revision_esperada) {
        const { rows: events } = await client.query(`SELECT despues_json FROM audit_events
          WHERE usuario_id=$1 AND objeto_id=$2 AND accion='documento_corregido'
            AND despues_json->'ajuste'->>'revision_anterior'=$3 ORDER BY created_at DESC LIMIT 1`,
        [req.user.id, current.id, req.body.revision_esperada]);
        if (isCorrectionReplay(locked.rows[0], req.body, events[0], req.user)) return locked.rows[0];
      }
      if (!locked.rows.length || JSON.stringify(locked.rows[0]) !== JSON.stringify(current)) fail('El documento cambio. Actualice e intente nuevamente.', 409);
      await assertNoPaymentHistory(client, req.user.id, current.id);
      if (current.estado_pago !== 'pagado' && next.estado_pago === 'pagado') {
        const { documentAccountId, assertAccountOwner } = require('../services/bankAccount');
        const accountId=documentAccountId({...next,cuenta_bancaria_id:current.cuenta_bancaria_id});
        if(accountId) assertAccountOwner((await client.query('SELECT * FROM cuentas_bancarias WHERE id=$1 AND usuario_id=$2',[accountId,req.user.id])).rows[0],next);
      }
      if (!paymentOnly) await assertPeriodOpen(req.user.id, current.periodo || periodOf(current.fecha), current.cliente_id || null, client);
      for (const tx of [current, next]) {
        if (tx.fecha_pago) await assertPeriodOpen(req.user.id, periodOf(tx.fecha_pago), tx.cliente_id || null, client);
      }
      if (nextPeriod !== (current.periodo || periodOf(current.fecha)) || nextClientId !== (current.cliente_id || null)) {
        await assertPeriodOpen(req.user.id, nextPeriod, nextClientId, client);
      }
      if (nextClientId) {
        const owner = await client.query('SELECT id FROM clientes WHERE id=$1 AND usuario_id=$2', [nextClientId, req.user.id]);
        if (!owner.rows.length) fail('Cliente no encontrado.', 404);
      }
      writeContext.correction = authorizeCorrection(current, req.body, req.user);
      const { rows } = await client.query(
        `UPDATE transacciones SET ${updates.join(', ')} WHERE id = $${i} AND usuario_id = $${i+1} RETURNING *`,
        params
      );
      const row = rows[0];
      if (reversaConciliacion) {
        await client.query(
          'UPDATE movimientos_bancarios SET conciliado = false, transaccion_id = NULL WHERE transaccion_id = $1 AND usuario_id = $2',
          [row.id, req.user.id]
        );
      }
      await client.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        req.user.id,
        row.cliente_id,
        writeContext.correction ? 'documento_corregido' : reversaConciliacion ? 'conciliacion_bancaria_reversada' : 'transaccion_actualizada',
        'transaccion',
        row.id,
        current,
        correctionAudit(writeContext.correction, row),
      ]);
      return row;
    }, writeContext);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, cierre: err.cierre });
  }
});

// ── POST /api/transacciones/:id/confirmar-borrador ─────────────────────────
router.post('/:id/confirmar-borrador', async (req, res) => {
  try {
    const { rows: current } = await query(
      'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!current.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    if (current[0].estado_contable !== 'borrador_ia') {
      return res.status(409).json({ error: 'La transacción no está en estado borrador IA' });
    }
    await assertPeriodOpen(req.user.id, current[0].periodo || periodOf(current[0].fecha), current[0].cliente_id || null);

    const nota = [
      current[0].notas || '',
      `Confirmado por ${req.user.nombre || req.user.email} el ${new Date().toISOString().slice(0, 10)}.`,
    ].filter(Boolean).join(' ');

    const updated = await withAccountingWrite(req.user.id, async client => {
      client.touchJournal(req.params.id);
      const locked = await client.query('SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
      if (!locked.rows.length || JSON.stringify(locked.rows[0]) !== JSON.stringify(current[0])) fail('El documento cambio. Actualice e intente nuevamente.', 409);
      await assertPeriodOpen(req.user.id, current[0].periodo || periodOf(current[0].fecha), current[0].cliente_id || null, client);
      const { rows } = await client.query(`
        UPDATE transacciones
        SET estado_contable = 'registrado', notas = $3
        WHERE id = $1 AND usuario_id = $2
        RETURNING *
      `, [req.params.id, req.user.id, nota]);

      const row = rows[0];
      await client.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, source_system, source_work_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        SELECT
          $1,
          $2,
          p.source_system,
          p.source_work_id,
          $3,
          $4,
          $5,
          $6,
          $7
        FROM ai_proposals p
        WHERE p.id = $8
        UNION ALL
        SELECT $1, $2, NULL, NULL, $3, $4, $5, $6, $7
        WHERE $8 IS NULL
        LIMIT 1
      `, [
        req.user.id,
        row.cliente_id,
        'borrador_ia_confirmado',
        'transaccion',
        row.id,
        { estado_contable: current[0].estado_contable, notas: current[0].notas },
        { estado_contable: row.estado_contable, notas: row.notas, origen_propuesta_id: row.origen_propuesta_id },
        row.origen_propuesta_id,
      ]);
      return row;
    });

    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, cierre: err.cierre });
  }
});

// ── DELETE /api/transacciones/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM transacciones WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    const row = rows[0];
    await assertNoPaymentHistory({ query }, req.user.id, row.id);
    if (row.conciliado) {
      return res.status(409).json({ error: 'No se puede eliminar una transacción conciliada. Primero debe reversarse la conciliación.' });
    }
    await assertPeriodOpen(req.user.id, row.periodo || periodOf(row.fecha), row.cliente_id || null);
    if (row.fecha_pago) await assertPeriodOpen(req.user.id, periodOf(row.fecha_pago), row.cliente_id || null);
    await withAccountingWrite(req.user.id, async db => {
      db.touchJournal(row.id);
      const locked = await db.query('SELECT * FROM transacciones WHERE id=$1 AND usuario_id=$2 FOR UPDATE', [row.id, req.user.id]);
      if (!locked.rows.length || JSON.stringify(locked.rows[0]) !== JSON.stringify(row)) fail('El documento cambio. Actualice e intente nuevamente.', 409);
      await assertNoPaymentHistory(db, req.user.id, row.id);
      await assertPeriodOpen(req.user.id, row.periodo || periodOf(row.fecha), row.cliente_id || null, db);
      if (row.fecha_pago) await assertPeriodOpen(req.user.id, periodOf(row.fecha_pago), row.cliente_id || null, db);
      const posted = await db.query('SELECT id FROM asientos_contables WHERE usuario_id=$1 AND transaccion_id=$2 LIMIT 1', [req.user.id, row.id]);
      if (posted.rows.length) fail('El documento tiene asientos publicados y no se puede eliminar. Conserve su historial contable.', 409);
      await db.query('DELETE FROM transacciones WHERE id=$1 AND usuario_id=$2', [row.id, req.user.id]);
      await db.query(`
      INSERT INTO audit_events
        (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      req.user.id,
      row.cliente_id,
      'transaccion_eliminada',
      'transaccion',
      row.id,
      row,
      { eliminada: true },
    ]);
    });
    res.json({ message: 'Transacción eliminada' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, cierre: err.cierre });
  }
});

module.exports = router;
