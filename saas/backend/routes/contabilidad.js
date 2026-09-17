const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { withAccountingWrite } = require('../services/accountingWrite');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { historyParams, validatePeriodQuery, inRange, periodRange, formalClosingScope } = require('../services/accountingPeriod');
const { readJournal, readConsistency, previewBook, incorporateBook, bookStatus, previewEntityBooks, incorporateEntityBooks } = require('../services/journalRepository');
const { attachPayments } = require('../services/paymentRepository');
const { readBankEvidence } = require('../services/bankEvidence');
const {
  CHART_OF_ACCOUNTS,
  trialBalance,
  generalLedger,
  accountLedger,
  closingReview,
  closingReviewByClient,
  portfolioReview,
  agingReport,
  monthlyAccountingSummary,
} = require('../services/accountingEngine');

const router = express.Router();
router.use(authMiddleware);
router.use(validatePeriodQuery);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const periodValidators = [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
  qv('desde').optional().isDate().withMessage('Fecha desde invalida'),
  qv('hasta').optional().isDate().withMessage('Fecha hasta invalida'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
];
const agingValidators = [
  ...periodValidators,
  qv('tipo').optional().isIn(['todos','por_cobrar','por_pagar']).withMessage('Tipo de antiguedad invalido'),
  qv('fecha_corte').optional().isDate().withMessage('Fecha de corte invalida'),
];

const closeStatusValidators = [
  ...periodValidators,
  body('estado').isIn(['en_revision','cerrado']).withMessage('Estado de cierre invalido'),
  body('nota').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Nota demasiado larga'),
];
const closureListValidators = [
  ...periodValidators,
  qv('estado').optional().isIn(['en_revision','cerrado']).withMessage('Estado de cierre invalido'),
];

function closureScope(params) {
  if (params.anio) return { alcance: 'anual', periodo: null, anio: Number(params.anio) };
  return { alcance: 'mensual', periodo: params.periodo || new Date().toISOString().slice(0, 7), anio: null };
}

async function getClosureRows(uid, params = {}) {
  const anio = Number(params.anio || params.periodo?.slice(0, 4) || new Date().getFullYear());
  const values = [uid, `${anio}-%`, anio];
  let clientScope = 'cliente_id IS NULL';
  if (params.includeClientClosures) {
    clientScope = 'TRUE';
  } else if (params.cliente_id) {
    values.push(params.cliente_id);
    clientScope = `(cliente_id IS NULL OR cliente_id = $${values.length})`;
  }
  const { rows } = await query(`
    SELECT id, cliente_id, periodo, anio, alcance, estado, nota, cerrado_at, updated_at
    FROM cierres_periodo
    WHERE usuario_id = $1
      AND (
        (alcance = 'mensual' AND periodo LIKE $2)
        OR (alcance = 'anual' AND anio = $3)
      )
      AND ${clientScope}
    ORDER BY updated_at DESC
  `, values);
  return rows;
}

function pickClosureStatus(closures, params = {}) {
  const periodo = params.periodo || null;
  const anio = Number(params.anio || periodo?.slice(0, 4));
  const clienteId = params.cliente_id || null;
  const candidates = closures
    .filter(row => {
      const sameScope = (row.alcance === 'mensual' && row.periodo === periodo) || (row.alcance === 'anual' && Number(row.anio) === anio);
      const sameClient = !row.cliente_id || (clienteId && row.cliente_id === clienteId);
      return sameScope && sameClient;
    })
    .sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'cerrado' ? -1 : 1;
      if (Boolean(a.cliente_id) !== Boolean(b.cliente_id)) return a.cliente_id ? -1 : 1;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
  const row = candidates[0];
  return row ? {
    cierre_estado: row.estado,
    cierre_alcance: row.alcance,
    cierre_id: row.id,
    cierre_nota: row.nota || '',
    cerrado_at: row.cerrado_at || null,
  } : {
    cierre_estado: 'abierto',
    cierre_alcance: null,
    cierre_id: null,
    cierre_nota: '',
    cerrado_at: null,
  };
}

function withClosureStatus(summary, closures, params = {}) {
  const data = (summary.data || []).map(row => ({
    ...row,
    ...pickClosureStatus(closures, {
      periodo: row.periodo || params.periodo,
      anio: params.anio,
      cliente_id: row.cliente_id || params.cliente_id,
    }),
  }));
  return {
    ...summary,
    data,
    cierres_formales: {
      cerrados: data.filter(row => row.cierre_estado === 'cerrado').length,
      en_revision: data.filter(row => row.cierre_estado === 'en_revision').length,
      abiertos: data.filter(row => row.cierre_estado === 'abierto').length,
    },
  };
}

async function getTransactions(uid, params, db = { query }) {
  params = historyParams(params);
  const conds = ['t.usuario_id = $1'];
  const values = [uid];
  let i = 2;

  if (params.periodo) {
    conds.push(`t.periodo = $${i++}`);
    values.push(params.periodo);
  }
  if (params.anio) {
    conds.push(`t.periodo LIKE $${i++}`);
    values.push(`${params.anio}-%`);
  }
  if (params.desde) {
    conds.push(`t.fecha >= $${i++}`);
    values.push(params.desde);
  }
  if (params.hasta) {
    conds.push(`t.fecha <= $${i++}`);
    values.push(params.hasta);
  }
  if (params.cliente_id) {
    conds.push(`t.cliente_id = $${i++}`);
    values.push(params.cliente_id);
  }

  const { rows } = await db.query(`
    SELECT t.*, c.ruc AS cliente_ruc, c.tipo AS cliente_tipo_persona
    FROM transacciones t
    LEFT JOIN clientes c ON c.id = t.cliente_id
    WHERE ${conds.join(' AND ')}
    ORDER BY t.fecha ASC, t.created_at ASC
  `, values);
  return attachPayments(rows, uid, db);
}

router.get('/plan-cuentas', (_req, res) => {
  res.json({ data: CHART_OF_ACCOUNTS, total: CHART_OF_ACCOUNTS.length });
});

router.get('/libro', async (req, res) => {
  try {
    const book = await previewBook(req.user.id);
    // Surface drift between documents and the published book wherever the book status is shown.
    const consistencia = book.estado === 'incorporado' ? await readConsistency(req.user.id) : null;
    res.json(consistencia ? { ...book, consistencia: { estado: consistencia.estado, pendientes: consistencia.pendientes.length,
      cuentas_divergentes: consistencia.cuentas_divergentes.length, errores: consistencia.errores } } : book);
  }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/consistencia', periodValidators, validate, async (req, res) => {
  try { res.json(await readConsistency(req.user.id, req.query)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/libros-entidad', async (req, res) => {
  try { res.json(await previewEntityBooks(req.user.id)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.post('/libros-entidad/incorporar', requireRole('admin', 'contador'), [
  body('fingerprint').isHexadecimal().isLength({ min: 64, max: 64 }),
  body('confirmacion').equals('ASIGNAR LIBROS POR CLIENTE'),
], validate, async (req, res) => {
  try { res.json(await withAccountingWrite(req.user.id, db => incorporateEntityBooks(db, req.user.id, req.body.fingerprint))); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.post('/libro/incorporar', requireRole('admin', 'contador'), [
  body('fingerprint').isHexadecimal().isLength({ min: 64, max: 64 }),
  body('confirmacion').equals('INCORPORAR LIBRO'),
], validate, async (req, res) => {
  try {
    res.json(await withAccountingWrite(req.user.id, db => incorporateBook(db, req.user.id, req.body.fingerprint)));
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/asientos', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query);
    const balance = trialBalance(asientos);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      total_asientos: asientos.length,
      total_lineas: asientos.reduce((sum, asiento) => sum + asiento.lineas.length, 0),
      balanceado: balance.balanceado,
      diferencia: balance.diferencia,
      data: asientos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/balance-comprobacion', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      total_asientos: asientos.filter(e => inRange(e.fecha, periodRange(req.query))).length,
      ...trialBalance(asientos, req.query),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cierre', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...closingReview(transacciones, asientos, req.query, await readBankEvidence(req.user.id)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cierre-estado', periodValidators, validate, async (req, res) => {
  try {
    const scope = closureScope(req.query);
    const conds = ['c.usuario_id=$1', 'c.alcance=$2'];
    const values = [req.user.id, scope.alcance];
    let i = 3;
    if (scope.periodo) {
      conds.push(`c.periodo=$${i++}`);
      values.push(scope.periodo);
    } else {
      conds.push(`c.anio=$${i++}`);
      values.push(scope.anio);
    }
    if (req.query.cliente_id) {
      conds.push(`c.cliente_id=$${i++}`);
      values.push(req.query.cliente_id);
    } else {
      conds.push('c.cliente_id IS NULL');
    }
    const result = await query(`
      SELECT c.*, cl.nombre AS cliente_nombre, cl.ruc AS cliente_ruc
      FROM cierres_periodo c
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY c.updated_at DESC
      LIMIT 1
    `, values);
    res.json({
      ...scope,
      cliente_id: req.query.cliente_id || null,
      data: result.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cierres-periodo', closureListValidators, validate, async (req, res) => {
  try {
    const conds = ['c.usuario_id=$1'];
    const values = [req.user.id];
    let i = 2;
    if (req.query.periodo) {
      conds.push(`c.alcance='mensual' AND c.periodo=$${i++}`);
      values.push(req.query.periodo);
    } else if (req.query.anio) {
      conds.push(`((c.alcance='mensual' AND c.periodo LIKE $${i}) OR (c.alcance='anual' AND c.anio=$${i + 1}))`);
      values.push(`${req.query.anio}-%`, Number(req.query.anio));
      i += 2;
    }
    if (req.query.cliente_id) {
      conds.push(`c.cliente_id=$${i++}`);
      values.push(req.query.cliente_id);
    }
    if (req.query.estado) {
      conds.push(`c.estado=$${i++}`);
      values.push(req.query.estado);
    }
    const { rows } = await query(`
      SELECT c.*, cl.nombre AS cliente_nombre, cl.ruc AS cliente_ruc
      FROM cierres_periodo c
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE ${conds.join(' AND ')}
      ORDER BY
        COALESCE(c.periodo, c.anio::text) DESC,
        c.updated_at DESC
      LIMIT 300
    `, values);
    res.json({
      data: rows,
      total: rows.length,
      cerrados: rows.filter(row => row.estado === 'cerrado').length,
      en_revision: rows.filter(row => row.estado === 'en_revision').length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cierre-estado', requireRole('admin', 'contador'), closeStatusValidators, validate, async (req, res) => {
  try {
    const reviewScope = formalClosingScope(req.query);
    const response = await withAccountingWrite(req.user.id, async db => {
      const scope = closureScope(reviewScope);
      if (req.body.estado === 'cerrado' && !await bookStatus(db, req.user.id)) {
        throw Object.assign(new Error('Revise e incorpore el libro contable antes de cerrar el periodo.'), { status: 409 });
      }
      const transacciones = await getTransactions(req.user.id, reviewScope, db);
      const asientos = await readJournal(req.user.id, transacciones, reviewScope, true, db);
      const review = closingReview(transacciones, asientos, reviewScope, await readBankEvidence(req.user.id, db));
      if (req.body.estado === 'cerrado' && !review.listo_para_cierre) {
        throw Object.assign(new Error('No se puede cerrar el periodo con hallazgos pendientes'), { status: 409, issues: review.issues });
      }
      if (req.query.cliente_id) {
        const client = await db.query('SELECT id FROM clientes WHERE id=$1 AND usuario_id=$2', [req.query.cliente_id, req.user.id]);
        if (!client.rows.length) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
      }
      const lookupConds = ['usuario_id=$1', 'alcance=$2'];
      const lookupValues = [req.user.id, scope.alcance];
      let p = 3;
      if (scope.periodo) {
        lookupConds.push(`periodo=$${p++}`);
        lookupValues.push(scope.periodo);
      } else {
        lookupConds.push(`anio=$${p++}`);
        lookupValues.push(scope.anio);
      }
      if (req.query.cliente_id) {
        lookupConds.push(`cliente_id=$${p++}`);
        lookupValues.push(req.query.cliente_id);
      } else {
        lookupConds.push('cliente_id IS NULL');
      }
      const existing = await db.query(`SELECT * FROM cierres_periodo WHERE ${lookupConds.join(' AND ')} LIMIT 1`, lookupValues);
      const before = existing.rows[0] || null;
      const result = before
        ? await db.query(`
            UPDATE cierres_periodo
            SET estado=$1,
                nota=$2,
                cerrado_at=CASE WHEN $1::varchar='cerrado' THEN COALESCE(cerrado_at, NOW()) ELSE NULL END,
                updated_at=NOW()
            WHERE id=$3 AND usuario_id=$4
            RETURNING *
          `, [req.body.estado, req.body.nota || null, before.id, req.user.id])
        : await db.query(`
            INSERT INTO cierres_periodo
              (usuario_id, cliente_id, periodo, anio, alcance, estado, nota, cerrado_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $6::varchar='cerrado' THEN NOW() ELSE NULL END)
            RETURNING *
          `, [
            req.user.id,
            req.query.cliente_id || null,
            scope.periodo,
            scope.anio,
            scope.alcance,
            req.body.estado,
            req.body.nota || null,
          ]);
      await db.query(`
        INSERT INTO audit_events
          (usuario_id, cliente_id, accion, objeto_tipo, objeto_id, antes_json, despues_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        req.user.id,
        req.query.cliente_id || null,
        req.body.estado === 'cerrado' ? 'periodo_contable_cerrado' : 'periodo_contable_en_revision',
        'cierre_periodo',
        result.rows[0].id,
        before,
        { ...result.rows[0], review },
      ]);
      return { ...scope, data: result.rows[0], review };
    });
    res.json(response);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, issues: err.issues });
  }
});

router.get('/resumen-mensual', periodValidators, validate, async (req, res) => {
  try {
    const anio = req.query.anio || req.query.periodo?.slice(0, 4) || String(new Date().getFullYear());
    const [transacciones, closures] = await Promise.all([
      getTransactions(req.user.id, { ...req.query, periodo: null, anio }),
      getClosureRows(req.user.id, { ...req.query, anio }),
    ]);
    res.json({
      cliente_id: req.query.cliente_id || null,
      ...withClosureStatus(monthlyAccountingSummary(transacciones, { anio, cliente_id: req.query.cliente_id,
        bankEvidence: await readBankEvidence(req.user.id),
        journal: await readJournal(req.user.id, transacciones, { ...req.query, periodo: null, anio }, true) }), closures, {
        anio,
        cliente_id: req.query.cliente_id || null,
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cierres-clientes', periodValidators, validate, async (req, res) => {
  try {
    const [transacciones, clientesResult, closures] = await Promise.all([
      getTransactions(req.user.id, req.query),
      query(`
        SELECT id, nombre, ruc, tipo, actividad, estado
        FROM clientes
        WHERE usuario_id = $1
        ORDER BY nombre ASC
      `, [req.user.id]),
      getClosureRows(req.user.id, { ...req.query, includeClientClosures: true }),
    ]);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...withClosureStatus(closingReviewByClient(transacciones, clientesResult.rows, req.query,
        await readJournal(req.user.id, transacciones, req.query, true), await readBankEvidence(req.user.id)), closures, req.query),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cartera', periodValidators, validate, async (req, res) => {
  try {
    const [transacciones, clientesResult, closures] = await Promise.all([
      getTransactions(req.user.id, req.query),
      query(`
        SELECT id, nombre, ruc, tipo, actividad, estado
        FROM clientes
        WHERE usuario_id = $1
        ORDER BY nombre ASC
      `, [req.user.id]),
      getClosureRows(req.user.id, { ...req.query, includeClientClosures: true }),
    ]);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...withClosureStatus(portfolioReview(transacciones, clientesResult.rows, req.query,
        await readJournal(req.user.id, transacciones, req.query, true), await readBankEvidence(req.user.id)), closures, req.query),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/antiguedad', agingValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...agingReport(transacciones, {
        ...req.query,
        tipo: req.query.tipo || 'todos',
        fechaCorte: req.query.fecha_corte,
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mayor/:cuenta_codigo', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...accountLedger(asientos, req.params.cuenta_codigo, req.query),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mayor-general', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getTransactions(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    res.json({
      periodo: req.query.periodo || null,
      anio: req.query.anio || null,
      ...generalLedger(asientos, req.query),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
