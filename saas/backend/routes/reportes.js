const express = require('express');
const { query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { isRegisteredTransaction, registeredTransactionSql } = require('../services/transactionStatus');
const { generarDiarioCombinado, generarEstadoResultados, generarReporteITBMS, generarBalanceComprobacion, generarMayorCuenta, generarMayorGeneral, generarRevisionCierre, generarCierresClientes, generarAntiguedadSaldos, generarConciliacionBancaria, generarPaqueteCierreCPA, generarResumenMensualAnual } = require('../services/pdfService');
const { trialBalance, generalLedger, accountLedger, closingReview, closingReviewByClient, agingReport, monthlyAccountingSummary } = require('../services/accountingEngine');
const { readJournal, bookStatus, storedEntries, entityState } = require('../services/journalRepository');
const { journalReport, validateJournalScope } = require('../services/journalReport');
const { generarLibroDiario } = require('../services/journalPdf');
const { historyParams, validatePeriodQuery, inRange, periodRange } = require('../services/accountingPeriod');
const { sqlReconciliationReport } = require('../services/reconciliationReport');
const { readBankEvidence } = require('../services/bankEvidence');
const { attachPayments } = require('../services/paymentRepository');

const router = express.Router();
router.use(authMiddleware);
router.use(validatePeriodQuery);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const sendPDF = (res, buffer, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
};

const periodValidators = [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
  qv('tipo').optional().isIn(['todos','por_cobrar','por_pagar']).withMessage('Tipo invalido'),
  qv('fecha_corte').optional().isDate().withMessage('Fecha de corte invalida'),
];
const reconciliationReportValidators = [
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
];
const diarioReportValidators = [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/).withMessage('Periodo debe tener formato YYYY-MM'),
  qv('anio').optional().matches(/^\d{4}$/).withMessage('Anio debe tener formato YYYY'),
  qv('cliente_id').optional().isUUID().withMessage('Cliente invalido'),
  qv('tipo').optional().isIn(['ingreso','gasto']).withMessage('Tipo invalido'),
  qv('desde').optional().isDate().withMessage('Fecha desde invalida'),
  qv('hasta').optional().isDate().withMessage('Fecha hasta invalida'),
  qv('search').optional().trim(),
];

async function getAccountingTransactions(uid, params) {
  const conds = ['usuario_id = $1'];
  const values = [uid];
  let i = 2;
  if (params.periodo) { conds.push(`periodo = $${i++}`); values.push(params.periodo); }
  if (params.anio) { conds.push(`periodo LIKE $${i++}`); values.push(`${params.anio}-%`); }
  if (params.cliente_id) { conds.push(`cliente_id = $${i++}`); values.push(params.cliente_id); }
  if (params.tipo) { conds.push(`tipo = $${i++}`); values.push(params.tipo); }
  if (params.desde) { conds.push(`fecha >= $${i++}`); values.push(params.desde); }
  if (params.hasta) { conds.push(`fecha <= $${i++}`); values.push(params.hasta); }
  if (params.search) { conds.push(`descripcion ILIKE $${i++}`); values.push(`%${params.search}%`); }
  const { rows } = await query(`SELECT * FROM transacciones WHERE ${conds.join(' AND ')} ORDER BY fecha ASC, created_at ASC`, values);
  return attachPayments(rows, uid);
}

const getAccountingHistory = (uid, params) => getAccountingTransactions(uid, historyParams(params));

async function getClosureStatus(uid, params = {}) {
  const periodo = params.anio ? null : (params.periodo || new Date().toISOString().slice(0, 7));
  const anio = params.anio ? Number(params.anio) : Number(String(periodo).slice(0, 4));
  const conds = ['usuario_id=$1', 'estado IS NOT NULL'];
  const values = [uid];
  let i = 2;
  if (params.anio) {
    conds.push(`alcance='anual' AND anio=$${i++}`);
    values.push(anio);
  } else {
    conds.push(`alcance='mensual' AND periodo=$${i++}`);
    values.push(periodo);
  }
  if (params.cliente_id) {
    conds.push(`cliente_id=$${i++}`);
    values.push(params.cliente_id);
  } else {
    conds.push('cliente_id IS NULL');
  }
  const { rows } = await query(`
    SELECT id, alcance, periodo, anio, estado, nota, cerrado_at, updated_at
    FROM cierres_periodo
    WHERE ${conds.join(' AND ')}
    ORDER BY updated_at DESC
    LIMIT 1
  `, values);
  return rows[0] || {
    alcance: params.anio ? 'anual' : 'mensual',
    periodo,
    anio: params.anio ? anio : null,
    estado: 'abierto',
    nota: null,
    cerrado_at: null,
  };
}

const getReconciliationReportData = sqlReconciliationReport;

const diarioDataFromRows = (rows, periodo) => {
  rows = rows.filter(isRegisteredTransaction);
  const byDate = {};
  for (const r of rows) {
    const d = String(r.fecha).slice(0, 10);
    if (!byDate[d]) byDate[d] = { fecha: d, asientos: [], debe: 0, haber: 0 };
    byDate[d].asientos.push(r);
    if (r.tipo === 'ingreso') byDate[d].haber += parseFloat(r.monto);
    else byDate[d].debe += parseFloat(r.monto);
  }

  const totalIngresos = rows.filter(r => r.tipo === 'ingreso').reduce((s, r) => s + parseFloat(r.monto), 0);
  const totalGastos = rows.filter(r => r.tipo === 'gasto').reduce((s, r) => s + parseFloat(r.monto), 0);
  return {
    periodo,
    total_asientos: rows.length,
    total_ingresos: totalIngresos.toFixed(2),
    total_gastos: totalGastos.toFixed(2),
    resultado: (totalIngresos - totalGastos).toFixed(2),
    entradas: Object.values(byDate),
  };
};

router.get('/libro-diario', async (req, res) => {
  try {
    validateJournalScope(req.query);
    const book = await bookStatus({ query }, req.user.id);
    const entries = await storedEntries({ query }, req.user.id);
    const { rows: clients } = await query('SELECT id,nombre,ruc FROM clientes WHERE usuario_id=$1', [req.user.id]);
    const report = journalReport({ book, entries, clients, scope: req.query,
      entityBooks: (await entityState({ query }, req.user.id)).books, requireEntityBooks: true });
    sendPDF(res, await generarLibroDiario(report), `libro-diario-${report.periodo}-${report.alcance}.pdf`);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/reportes/diario?periodo=YYYY-MM ───────────────────────────────
router.get('/diario', diarioReportValidators, validate, async (req, res) => {
  try {
    const periodo = req.query.periodo;
    if (!periodo) return res.status(422).json({ error: 'Periodo requerido YYYY-MM' });
    const rows = await getAccountingTransactions(req.user.id, req.query);
    const buffer = await generarDiarioCombinado(diarioDataFromRows(rows, periodo));
    const filename = `diario-combinado-${periodo}${req.query.cliente_id ? '-cliente' : ''}.pdf`;
    sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF diario]', err);
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

// ── GET /api/reportes/estado-resultados?periodo=YYYY-MM ────────────────────
router.get('/diario-anual', diarioReportValidators, validate, async (req, res) => {
  try {
    const anio = req.query.anio;
    if (!anio) return res.status(422).json({ error: 'Anio requerido YYYY' });
    const rows = await getAccountingTransactions(req.user.id, req.query);
    const buffer = await generarDiarioCombinado(diarioDataFromRows(rows, `${anio} - 12 meses`));
    sendPDF(res, buffer, `diario-combinado-${anio}-12-meses${req.query.cliente_id ? '-cliente' : ''}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF anual: ' + err.message });
  }
});

router.get('/estado-resultados', periodValidators, validate, async (req, res) => {
  try {
    const periodo = req.query.periodo || null;
    const anio = req.query.anio || null;
    if (!periodo && !anio) return res.status(422).json({ error: 'Periodo o anio requerido' });
    const rows = await getAccountingTransactions(req.user.id, req.query);
    const label = periodo || `${anio} - 12 meses`;

    const data = {
      periodo: label,
      ingresos: rows.filter(isRegisteredTransaction).filter(r => r.tipo === 'ingreso'),
      gastos:   rows.filter(isRegisteredTransaction).filter(r => r.tipo === 'gasto'),
    };

    const buffer = await generarEstadoResultados(data);
    sendPDF(res, buffer, `estado-resultados-${periodo || `${anio}-12-meses`}${req.query.cliente_id ? '-cliente' : ''}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

// ── GET /api/reportes/itbms?periodo=YYYY-MM ────────────────────────────────
router.get('/itbms', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    const { rows } = await query(`
      SELECT
        COALESCE(SUM(monto)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)               AS base_imponible,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)               AS debito,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2)   AS credito,
        (COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS saldo_pagar
      FROM transacciones WHERE usuario_id = $1 AND periodo = $2 AND ${registeredTransactionSql()}
    `, [uid, periodo]);

    const [yr, mo] = periodo.split('-').map(Number);
    const vencimiento = new Date(yr, mo, 15).toISOString().slice(0, 10);

    const buffer = await generarReporteITBMS({ ...rows[0], periodo, vencimiento });
    sendPDF(res, buffer, `itbms-430-${periodo}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/resumen-mensual', periodValidators, validate, async (req, res) => {
  try {
    const anio = req.query.anio || req.query.periodo?.slice(0, 4) || String(new Date().getFullYear());
    const transacciones = await getAccountingHistory(req.user.id, { ...req.query, periodo: null, anio });
    let clienteNombre = '';
    if (req.query.cliente_id) {
      const { rows: [cliente] } = await query(
        'SELECT nombre FROM clientes WHERE id = $1 AND usuario_id = $2',
        [req.query.cliente_id, req.user.id]
      );
      clienteNombre = cliente?.nombre || '';
    }
    const buffer = await generarResumenMensualAnual({
      ...monthlyAccountingSummary(transacciones, { anio, cliente_id: req.query.cliente_id, bankEvidence: await readBankEvidence(req.user.id),
        journal: await readJournal(req.user.id, transacciones, { ...req.query, periodo: null, anio }, true) }),
      cliente_nombre: clienteNombre,
    });
    sendPDF(res, buffer, `resumen-contable-${anio}-12-meses.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/balance-comprobacion', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getAccountingHistory(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    const balance = trialBalance(asientos, req.query);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const buffer = await generarBalanceComprobacion({ ...balance,
      total_asientos: asientos.filter(e => inRange(e.fecha, periodRange(req.query))).length, periodo: label });
    sendPDF(res, buffer, `balance-comprobacion-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/mayor/:cuenta_codigo', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getAccountingHistory(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const buffer = await generarMayorCuenta({
      ...accountLedger(asientos, req.params.cuenta_codigo, req.query),
      periodo: label,
    });
    sendPDF(res, buffer, `mayor-${req.params.cuenta_codigo}-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/mayor-general', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getAccountingHistory(req.user.id, req.query);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const buffer = await generarMayorGeneral({
      ...generalLedger(asientos, req.query),
      periodo: label,
    });
    sendPDF(res, buffer, `mayor-general-${req.query.periodo || `${req.query.anio || new Date().getFullYear()}-12-meses`}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/cierre', periodValidators, validate, async (req, res) => {
  try {
    const [transacciones, cierreFormal] = await Promise.all([
      getAccountingHistory(req.user.id, req.query),
      getClosureStatus(req.user.id, req.query),
    ]);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const buffer = await generarRevisionCierre({ ...closingReview(transacciones, asientos, req.query, await readBankEvidence(req.user.id)), periodo: label, cierre_formal: cierreFormal });
    sendPDF(res, buffer, `revision-cierre-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/cierres-clientes', periodValidators, validate, async (req, res) => {
  try {
    const [transacciones, clientesResult] = await Promise.all([
      getAccountingHistory(req.user.id, req.query),
      query(`
        SELECT id, nombre, ruc, tipo, actividad, estado
        FROM clientes
        WHERE usuario_id = $1
        ORDER BY nombre ASC
      `, [req.user.id]),
    ]);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const buffer = await generarCierresClientes({ ...closingReviewByClient(transacciones, clientesResult.rows, req.query,
      await readJournal(req.user.id, transacciones, req.query, true), await readBankEvidence(req.user.id)), periodo: label });
    sendPDF(res, buffer, `cierres-clientes-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/antiguedad', periodValidators, validate, async (req, res) => {
  try {
    const transacciones = await getAccountingHistory(req.user.id, req.query);
    const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
    const report = agingReport(transacciones, req.query);
    const buffer = await generarAntiguedadSaldos({ ...report, periodo: label });
    sendPDF(res, buffer, `antiguedad-saldos-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/conciliacion', reconciliationReportValidators, validate, async (req, res) => {
  try {
    if (!req.query.periodo && !req.query.anio) return res.status(422).json({ error: 'Periodo o anio requerido' });
    const label = req.query.periodo || `${req.query.anio}-12-meses`;
    const buffer = await generarConciliacionBancaria({
      ...(await getReconciliationReportData(req.user.id, req.query)),
      periodo: label,
    });
    sendPDF(res, buffer, `conciliacion-bancaria-${label}.pdf`);
  } catch (err) {
    res.status(err.status || 500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

router.get('/paquete-cierre', reconciliationReportValidators, validate, async (req, res) => {
  try {
    if (!req.query.periodo && !req.query.anio) return res.status(422).json({ error: 'Periodo o anio requerido' });
    const [transacciones, cierreFormal] = await Promise.all([
      getAccountingHistory(req.user.id, req.query),
      getClosureStatus(req.user.id, req.query),
    ]);
    const asientos = await readJournal(req.user.id, transacciones, req.query, true);
    const { rows: clientes } = await query(`
      SELECT id, nombre, ruc, tipo, actividad, estado
      FROM clientes
      WHERE usuario_id = $1
      ORDER BY nombre ASC
    `, [req.user.id]);
    const label = req.query.periodo || `${req.query.anio}-12-meses`;
    const bankEvidence = await readBankEvidence(req.user.id);
    const buffer = await generarPaqueteCierreCPA({
      periodo: label,
      anio: req.query.anio ? Number(req.query.anio) : null,
      alcance: req.query.anio ? 'anual' : 'mensual',
      cierre: { ...closingReview(transacciones, asientos, req.query, bankEvidence), cierre_formal: cierreFormal },
      conciliacion: await getReconciliationReportData(req.user.id, req.query),
      antiguedad: agingReport(transacciones, { ...req.query, tipo: 'todos' }),
      cierres_clientes: closingReviewByClient(transacciones, clientes, req.query, asientos, bankEvidence),
      resumen_mensual: req.query.anio ? monthlyAccountingSummary(transacciones, { anio: req.query.anio, cliente_id: req.query.cliente_id, journal: asientos, bankEvidence }) : null,
    });
    sendPDF(res, buffer, `paquete-cierre-cpa-${label}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

// ── GET /api/reportes/cliente/:id?periodo=YYYY-MM ──────────────────────────
router.get('/cliente/:id', async (req, res) => {
  try {
    const uid     = req.user.id;
    const cid     = req.params.id;
    const periodo = req.query.periodo;
    const anio    = req.query.anio;
    const label   = periodo || (anio ? `${anio} - 12 meses` : 'Todos');
    const fileLabel = periodo || (anio ? `${anio}-12-meses` : 'todos');

    // Datos del cliente
    const { rows: [cl] } = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2', [cid, uid]
    );
    if (!cl) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Transacciones del cliente
    const conds = ['usuario_id = $1', 'cliente_id = $2', registeredTransactionSql()];
    const params = [uid, cid];
    let i = 3;
    if (periodo) { conds.push(`periodo = $${i++}`); params.push(periodo); }
    if (anio) { conds.push(`periodo LIKE $${i++}`); params.push(`${anio}-%`); }

    const { rows: txns } = await query(
      `SELECT * FROM transacciones WHERE ${conds.join(' AND ')} ORDER BY fecha ASC`,
      params
    );

    // Generar PDF simple con pdfkit inline
    const PDFDocument = require('pdfkit');
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));

    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);

      // Header
      doc.rect(0, 0, doc.page.width, 72).fill('#0f1923');
      doc.fontSize(18).fillColor('#fff').font('Helvetica-Bold').text('ContaPanamá', 40, 22);
      doc.fontSize(10).fillColor('#94a3b8').font('Helvetica').text('Reporte de Cliente', 40, 46);
      doc.fontSize(14).fillColor('#fff').font('Helvetica-Bold')
         .text(cl.nombre, 40, 22, { align: 'right', width: doc.page.width - 80 });
      doc.fontSize(9).fillColor('#94a3b8').font('Helvetica')
         .text(`RUC: ${cl.ruc} · ${cl.tipo}`, 40, 42, { align: 'right', width: doc.page.width - 80 });

      let y = 90;
      // Info cliente
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f1923').text('Información del Cliente', 40, y);
      y += 16;
      const info = [
        ['Estado Fiscal', cl.estado.toUpperCase()],
        ['Actividad',     cl.actividad || '—'],
        ['Email',         cl.email || '—'],
        ['Teléfono',      cl.telefono || '—'],
      ];
      for (const [k, v] of info) {
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`${k}:`, 40, y)
           .fillColor('#0f1923').text(v, 200, y);
        y += 16;
      }
      y += 10;

      // Transacciones
      const totalIng = txns.filter(t=>t.tipo==='ingreso').reduce((s,t)=>s+parseFloat(t.monto),0);
      const totalGst = txns.filter(t=>t.tipo==='gasto').reduce((s,t)=>s+parseFloat(t.monto),0);

      const fmt = n => new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format(n);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f1923').text(`Transacciones - ${label}`, 40, y);
      y += 16;

      // Encabezado tabla
      doc.rect(40, y, doc.page.width-80, 22).fill('#0f1923');
      const cols = [58,150,82,68,60,50,45];
      const heads = ['Fecha','Descripcion','Categoria','Banco','Monto','ITBMS','Pago'];
      let x = 46;
      heads.forEach((h, i) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff').text(h, x, y+7, {width:cols[i]-4});
        x += cols[i];
      });
      y += 22;

      txns.forEach((t, idx) => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
        if (idx%2===0) doc.rect(40,y,doc.page.width-80,20).fill('#f0f4f8');
        const mc = t.tipo==='ingreso'?'#10b981':'#ef4444';
        x = 46;
        const row = [
          String(t.fecha).slice(0,10),
          t.descripcion,
          t.categoria_contable || '-',
          t.banco||'-',
          fmt(t.monto),
          fmt(t.itbms),
          t.estado_pago || 'pendiente',
        ];
        const colors = ['#0f1923','#0f1923','#64748b','#64748b',mc,'#64748b',t.estado_pago==='pagado'?'#10b981':'#f59e0b'];
        row.forEach((cell, i) => {
          doc.fontSize(8).font('Helvetica').fillColor(colors[i])
             .text(cell, x, y+6, {width:cols[i]-4, lineBreak:false});
          x += cols[i];
        });
        y += 20;
      });

      // Totales
      y += 8;
      doc.rect(40,y,doc.page.width-80,30).fill('#f0f4f8');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f1923')
         .text('Ingresos: '+fmt(totalIng), 50, y+10)
         .text('Gastos: '+fmt(totalGst), 240, y+10)
         .text('Neto: '+fmt(totalIng-totalGst), 400, y+10);

      doc.end();
    });

    const buffer = Buffer.concat(chunks);
    sendPDF(res, buffer, `cliente-${cl.ruc}-${fileLabel}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

module.exports = router;
