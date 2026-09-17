const express = require('express');
const { sqlReconciliationReport } = require('../services/reconciliationReport');
const { query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { registeredTransactionSql } = require('../services/transactionStatus');
const { calcularISR, vencimientoRenta, vencimientoITBMS, generarObligacionesFiscales } = require('../services/fiscalEngine');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// ── GET /api/fiscal/itbms?periodo=YYYY-MM&cliente_id=UUID ──────────────────
router.get('/itbms', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
], validate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { periodo, cliente_id } = req.query;
    const conds = ['usuario_id = $1', registeredTransactionSql()]; const params = [uid]; let i = 2;
    if (periodo)    { conds.push(`periodo = $${i++}`);     params.push(periodo); }
    if (cliente_id) { conds.push(`cliente_id = $${i++}`);  params.push(cliente_id); }
    const where = conds.join(' AND ');

    const { rows } = await query(`
      SELECT
        COALESCE(SUM(monto)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)              AS base_imponible,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)              AS debito,
        COALESCE(SUM(itbms)  FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2)  AS credito,
        (COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)
          - COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS saldo_pagar,
        COUNT(*) FILTER (WHERE tipo='ingreso')  AS num_ventas,
        COUNT(*) FILTER (WHERE tipo='gasto' AND deducible) AS num_compras_ded
      FROM transacciones WHERE ${where}
    `, params);

    const data = rows[0];
    const { rows: desglose } = await query(`
      SELECT
        COALESCE(categoria_itbms, 'general') AS categoria,
        COALESCE(tasa_itbms, 0.0700)::NUMERIC(5,4) AS tasa,
        COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS base_ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2) AS base_gastos,
        COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS debito,
        COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2) AS credito,
        COUNT(*)::INTEGER AS transacciones
      FROM transacciones
      WHERE ${where}
      GROUP BY COALESCE(categoria_itbms, 'general'), COALESCE(tasa_itbms, 0.0700)
      ORDER BY COALESCE(tasa_itbms, 0.0700) ASC
    `, params);

    let vencimiento = null;
    if (periodo) {
      vencimiento = vencimientoITBMS(periodo);
    }

    res.json({
      ...data,
      periodo: periodo || 'Todos',
      tasa: null,
      desglose,
      formulario: '430-DGI',
      vencimiento,
      validacion: {
        ok: parseFloat(data.saldo_pagar) >= 0,
        mensaje: parseFloat(data.saldo_pagar) < 0
          ? 'Crédito fiscal mayor al débito — verificar registros deducibles'
          : 'Cálculo correcto'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fiscal/renta?anio=YYYY&cliente_id=UUID ────────────────────────
// Cálculo ISR con tasas correctas para persona natural y jurídica en Panamá
router.get('/renta', [
  qv('anio').optional().isInt({ min: 2020, max: 2030 }),
], validate, async (req, res) => {
  try {
    const uid   = req.user.id;
    const anio  = parseInt(req.query.anio || new Date().getFullYear());
    const { cliente_id } = req.query;

    const conds = ['t.usuario_id = $1', registeredTransactionSql('t'), `t.fecha BETWEEN '${anio}-01-01' AND '${anio}-12-31'`];
    const params = [uid]; let i = 2;
    if (cliente_id) { conds.push(`t.cliente_id = $${i++}`); params.push(cliente_id); }

    const { rows } = await query(`
      SELECT
        c.tipo AS tipo_persona,
        COALESCE(c.contribuyente_itbms, true) AS contribuyente_itbms,
        COALESCE(c.regimen_fiscal, 'general') AS regimen_fiscal,
        COALESCE(c.periodo_fiscal, 'calendario') AS periodo_fiscal,
        COALESCE(c.cierre_fiscal_mes, 12) AS cierre_fiscal_mes,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0)::NUMERIC(14,2)             AS ingresos_brutos,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto'),0)::NUMERIC(14,2)               AS total_gastos,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto' AND t.deducible),0)::NUMERIC(14,2) AS gastos_deducibles,
        (COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0)
          - COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto' AND t.deducible),0))::NUMERIC(14,2) AS renta_neta,
        (COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0)
          - COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto'),0))::NUMERIC(14,2)          AS resultado_contable
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE ${conds.join(' AND ')}
      GROUP BY c.tipo, c.contribuyente_itbms, c.regimen_fiscal, c.periodo_fiscal, c.cierre_fiscal_mes
    `, params);

    // Preserve client scope and profile even when there are no posted transactions.
    if (!rows.length) {
      const { rows: perfiles } = cliente_id ? await query(`
        SELECT tipo AS tipo_persona, contribuyente_itbms, regimen_fiscal, periodo_fiscal, cierre_fiscal_mes
        FROM clientes WHERE id = $1 AND usuario_id = $2
      `, [cliente_id, uid]) : { rows: [] };
      if (cliente_id && !perfiles.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      const { rows: gen } = await query(`
        SELECT
          COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS ingresos_brutos,
          COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)   AS total_gastos,
          COALESCE(SUM(monto) FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2) AS gastos_deducibles,
          (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
            - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS renta_neta,
          (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
            - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2) AS resultado_contable
        FROM transacciones
        WHERE usuario_id = $1 AND fecha BETWEEN $2 AND $3 AND ${registeredTransactionSql()}
          AND ($4::uuid IS NULL OR cliente_id = $4)
      `, [uid, `${anio}-01-01`, `${anio}-12-31`, cliente_id || null]);
      rows.push({
        ...gen[0],
        tipo_persona: 'general',
        contribuyente_itbms: true,
        regimen_fiscal: 'general',
        periodo_fiscal: 'calendario',
        cierre_fiscal_mes: 12,
        ...perfiles[0],
      });
    }

    const resultado = rows.map(r => ({
      ...r,
      vencimiento: vencimientoRenta(anio, r.tipo_persona, r.cierre_fiscal_mes),
      ...calcularISR(r.renta_neta, r.tipo_persona),
    }));

    res.json({
      anio,
      detalle: resultado,
      total_impuesto: resultado.reduce((s, r) => s + r.impuesto, 0).toFixed(2),
      vencimiento: vencimientoRenta(anio, 'juridica'),
      formulario: '101-DGI'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fiscal/conciliacion?periodo=YYYY-MM|anio=YYYY ─────────────────
// Conciliación bancaria básica: compara transacciones vs movimientos bancarios
router.get('/conciliacion', [
  qv('periodo').optional().matches(/^\d{4}-\d{2}$/),
  qv('anio').optional().isInt({ min: 2000, max: 2100 }),
  qv('cliente_id').optional().isUUID(),
], validate, async (req, res) => {
  try {
    res.json(await sqlReconciliationReport(req.user.id, req.query));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/fiscal/calendario?anio=YYYY ──────────────────────────────────
router.get('/calendario', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio || new Date().getFullYear());
    const hoy  = new Date().toISOString().slice(0, 10);
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const obligaciones = generarObligacionesFiscales({ anio }).map(o => ({
      ...o,
      estado: o.fecha_vencimiento < hoy  ? 'vencido'
            : o.fecha_vencimiento <= en30 ? 'proximo'
            : 'pendiente'
    }));

    res.json({ anio, obligaciones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
