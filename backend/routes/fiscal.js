const express = require('express');
const { query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

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
    const conds = ['usuario_id = $1']; const params = [uid]; let i = 2;
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
    let vencimiento = null;
    if (periodo) {
      const [yr, mo] = periodo.split('-').map(Number);
      vencimiento = new Date(yr, mo, 15).toISOString().slice(0, 10);
    }

    res.json({
      ...data,
      periodo: periodo || 'Todos',
      tasa: 0.07,
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

    const conds = ['t.usuario_id = $1', `t.fecha BETWEEN '${anio}-01-01' AND '${anio}-12-31'`];
    const params = [uid]; let i = 2;
    if (cliente_id) { conds.push(`t.cliente_id = $${i++}`); params.push(cliente_id); }

    const { rows } = await query(`
      SELECT
        c.tipo AS tipo_persona,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0)::NUMERIC(14,2)             AS ingresos_brutos,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto'),0)::NUMERIC(14,2)               AS total_gastos,
        COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto' AND t.deducible),0)::NUMERIC(14,2) AS gastos_deducibles,
        (COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='ingreso'),0)
          - COALESCE(SUM(t.monto) FILTER (WHERE t.tipo='gasto'),0))::NUMERIC(14,2)          AS renta_neta
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE ${conds.join(' AND ')}
      GROUP BY c.tipo
    `, params);

    // Si no hay cliente específico, calcular sin separar tipo
    if (!rows.length) {
      const { rows: gen } = await query(`
        SELECT
          COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS ingresos_brutos,
          COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)   AS total_gastos,
          COALESCE(SUM(monto) FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2) AS gastos_deducibles,
          (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
            - COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2) AS renta_neta
        FROM transacciones
        WHERE usuario_id = $1 AND fecha BETWEEN $2 AND $3
      `, [uid, `${anio}-01-01`, `${anio}-12-31`]);
      rows.push({ ...gen[0], tipo_persona: 'general' });
    }

    // Aplicar tasas ISR de Panamá
    const calcularISR = (rentaNeta, tipoPersona) => {
      const rn = parseFloat(rentaNeta) || 0;
      // Persona Jurídica: tasa flat 25%
      if (tipoPersona === 'jurídica') {
        return { impuesto: +(rn * 0.25).toFixed(2), tasa: 0.25, metodo: 'tasa flat jurídica' };
      }
      // Persona Natural (Art. 700 Código Fiscal):
      //   0 a B/.11,000 → 0%
      //   B/.11,001 a B/.100,000 → 15%
      //   Más de B/.100,000 → 25%
      if (rn <= 11000)  return { impuesto: 0, tasa: 0, metodo: 'exento natural' };
      if (rn <= 100000) return { impuesto: +((rn - 11000) * 0.15).toFixed(2), tasa: 0.15, metodo: 'natural tramo 15%' };
      return {
        impuesto: +((100000 - 11000) * 0.15 + (rn - 100000) * 0.25).toFixed(2),
        tasa: 0.25, metodo: 'natural tramo 25%'
      };
    };

    const resultado = rows.map(r => ({
      ...r,
      ...calcularISR(r.renta_neta, r.tipo_persona),
    }));

    res.json({
      anio,
      detalle: resultado,
      total_impuesto: resultado.reduce((s, r) => s + r.impuesto, 0).toFixed(2),
      vencimiento: `${anio + 1}-03-31`,
      formulario: '101-DGI'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fiscal/conciliacion?periodo=YYYY-MM ───────────────────────────
// Conciliación bancaria básica: compara transacciones vs movimientos bancarios
router.get('/conciliacion', async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);

    // Total contable del período
    const { rows: contable } = await query(`
      SELECT
        banco,
        SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END)::NUMERIC(14,2) AS saldo_contable,
        COUNT(*) AS num_transacciones
      FROM transacciones
      WHERE usuario_id = $1 AND periodo = $2 AND banco IS NOT NULL AND banco != ''
      GROUP BY banco
      ORDER BY banco
    `, [uid, periodo]);

    // Movimientos bancarios registrados
    const { rows: bancarios } = await query(`
      SELECT
        banco,
        SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END)::NUMERIC(14,2) AS saldo_banco,
        COUNT(*) AS num_movimientos,
        COUNT(*) FILTER (WHERE conciliado) AS conciliados
      FROM movimientos_bancarios
      WHERE usuario_id = $1 AND TO_CHAR(fecha,'YYYY-MM') = $2
      GROUP BY banco
    `, [uid, periodo]);

    // Cruzar datos
    const resumen = contable.map(c => {
      const b = bancarios.find(x => x.banco === c.banco);
      const diff = b
        ? parseFloat(c.saldo_contable) - parseFloat(b.saldo_banco)
        : null;
      return {
        banco: c.banco,
        saldo_contable: c.saldo_contable,
        saldo_banco:    b ? b.saldo_banco : 'Sin registros bancarios',
        diferencia:     diff !== null ? diff.toFixed(2) : 'N/A',
        estado:         diff === null ? 'sin_datos' : Math.abs(diff) < 0.01 ? 'conciliado' : 'diferencia',
        num_transacciones: c.num_transacciones,
        num_movimientos:   b ? b.num_movimientos : 0,
      };
    });

    res.json({ periodo, resumen, alertas: resumen.filter(r => r.estado === 'diferencia') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fiscal/calendario?anio=YYYY ──────────────────────────────────
router.get('/calendario', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio || new Date().getFullYear());
    const hoy  = new Date().toISOString().slice(0, 10);
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const obligaciones = [
      // ITBMS mensual → vence día 15 del mes siguiente
      ...[1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({
        tipo: 'ITBMS', entidad: 'DGI', formulario: '430',
        descripcion: `Declaración ITBMS — ${meses[m-1]} ${anio}`,
        periodicidad: 'mensual',
        periodo: `${anio}-${String(m).padStart(2,'0')}`,
        fecha_vencimiento: new Date(anio, m, 15).toISOString().slice(0, 10),
      })),
      // Renta anual → 31 de marzo del año siguiente
      { tipo: 'RENTA', entidad: 'DGI', formulario: '101',
        descripcion: `Declaración Renta — ${anio - 1}`,
        periodicidad: 'anual', periodo: `${anio - 1}`,
        fecha_vencimiento: `${anio}-03-31` },
      // Renta estimada → 30 de junio
      { tipo: 'RENTA_ESTIMADA', entidad: 'DGI', formulario: '102',
        descripcion: `Renta Estimada — ${anio}`,
        periodicidad: 'anual', periodo: `${anio}`,
        fecha_vencimiento: `${anio}-06-30` },
      // Aviso de Operaciones → 31 de marzo
      { tipo: 'AVISO_OP', entidad: 'MICI', formulario: 'AO-01',
        descripcion: `Aviso de Operaciones — ${anio}`,
        periodicidad: 'anual', periodo: `${anio}`,
        fecha_vencimiento: `${anio}-03-31` },
      // CSS → mensual, día 15
      ...[1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({
        tipo: 'CSS', entidad: 'CSS', formulario: 'CSS-01',
        descripcion: `Planilla CSS — ${meses[m-1]} ${anio}`,
        periodicidad: 'mensual',
        periodo: `${anio}-${String(m).padStart(2,'0')}`,
        fecha_vencimiento: new Date(anio, m, 15).toISOString().slice(0, 10),
      })),
      // Municipio trimestral → último día del mes siguiente al trimestre
      ...[1,2,3,4].map(t => ({
        tipo: 'MUNICIPIO', entidad: 'Municipio', formulario: 'IM-01',
        descripcion: `Impuesto Municipal — Q${t}/${anio}`,
        periodicidad: 'trimestral', periodo: `${anio}-Q${t}`,
        fecha_vencimiento: new Date(anio, t * 3, 30).toISOString().slice(0, 10),
      })),
    ].map(o => ({
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
