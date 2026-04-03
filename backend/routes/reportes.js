const express = require('express');
const { query: qv, validationResult } = require('express-validator');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { generarDiarioCombinado, generarEstadoResultados, generarReporteITBMS } = require('../services/pdfService');

const router = express.Router();
router.use(authMiddleware);

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

// ── GET /api/reportes/diario?periodo=YYYY-MM ───────────────────────────────
router.get('/diario', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido YYYY-MM'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    const { rows } = await query(`
      SELECT t.*, c.ruc AS cliente_ruc
      FROM transacciones t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      WHERE t.usuario_id = $1 AND t.periodo = $2
      ORDER BY t.fecha ASC, t.created_at ASC
    `, [uid, periodo]);

    // Agrupar por fecha
    const byDate = {};
    for (const r of rows) {
      const d = String(r.fecha).slice(0, 10);
      if (!byDate[d]) byDate[d] = { fecha: d, asientos: [], debe: 0, haber: 0 };
      byDate[d].asientos.push(r);
      if (r.tipo === 'ingreso') byDate[d].haber += parseFloat(r.monto);
      else                      byDate[d].debe  += parseFloat(r.monto);
    }

    const totalIngresos = rows.filter(r => r.tipo === 'ingreso').reduce((s, r) => s + parseFloat(r.monto), 0);
    const totalGastos   = rows.filter(r => r.tipo === 'gasto').reduce((s, r) => s + parseFloat(r.monto), 0);

    const data = {
      periodo,
      total_asientos: rows.length,
      total_ingresos: totalIngresos.toFixed(2),
      total_gastos:   totalGastos.toFixed(2),
      resultado:      (totalIngresos - totalGastos).toFixed(2),
      entradas:       Object.values(byDate),
    };

    const buffer   = await generarDiarioCombinado(data);
    const filename = `diario-combinado-${periodo}.pdf`;
    sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF diario]', err);
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});

// ── GET /api/reportes/estado-resultados?periodo=YYYY-MM ────────────────────
router.get('/estado-resultados', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    const { rows } = await query(`
      SELECT * FROM transacciones
      WHERE usuario_id = $1 AND periodo = $2
      ORDER BY tipo, fecha ASC
    `, [uid, periodo]);

    const data = {
      periodo,
      ingresos: rows.filter(r => r.tipo === 'ingreso'),
      gastos:   rows.filter(r => r.tipo === 'gasto'),
    };

    const buffer = await generarEstadoResultados(data);
    sendPDF(res, buffer, `estado-resultados-${periodo}.pdf`);
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
      FROM transacciones WHERE usuario_id = $1 AND periodo = $2
    `, [uid, periodo]);

    const [yr, mo] = periodo.split('-').map(Number);
    const vencimiento = new Date(yr, mo, 15).toISOString().slice(0, 10);

    const buffer = await generarReporteITBMS({ ...rows[0], periodo, vencimiento });
    sendPDF(res, buffer, `itbms-430-${periodo}.pdf`);
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

    // Datos del cliente
    const { rows: [cl] } = await query(
      'SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2', [cid, uid]
    );
    if (!cl) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Transacciones del cliente
    const conds = ['usuario_id = $1', 'cliente_id = $2'];
    const params = [uid, cid];
    if (periodo) { conds.push('periodo = $3'); params.push(periodo); }

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
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f1923').text(`Transacciones${periodo?' — '+periodo:''}`, 40, y);
      y += 16;

      // Encabezado tabla
      doc.rect(40, y, doc.page.width-80, 22).fill('#0f1923');
      const cols = [70,200,90,80,80];
      const heads = ['Fecha','Descripción','Banco','Monto','ITBMS'];
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
          t.banco||'—',
          fmt(t.monto),
          fmt(t.itbms),
        ];
        const colors = ['#0f1923','#0f1923','#64748b',mc,'#64748b'];
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
    sendPDF(res, buffer, `cliente-${cl.ruc}-${periodo||'todos'}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  }
});


// ── GET /api/reportes/diario-json?periodo=YYYY-MM ──────────────────────────
// Diario combinado en JSON estructurado — listo para Excel/PDF del frontend
router.get('/diario-json', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    const { rows } = await query(`
      SELECT
        a.numero_asiento,
        a.fecha::text        AS fecha,
        a.cuenta_codigo,
        a.cuenta_nombre,
        a.debe::float        AS debe,
        a.haber::float       AS haber,
        a.descripcion,
        a.referencia,
        a.tipo_linea,
        a.itbms_monto::float AS itbms_monto,
        a.itbms_tipo,
        t.tipo               AS tipo_tx,
        t.categoria,
        t.tiene_factura,
        t.etiqueta_auto,
        t.confianza_clasif,
        c.nombre             AS cliente_nombre,
        c.ruc                AS cliente_ruc
      FROM asientos_contables a
      JOIN transacciones t ON t.id = a.transaccion_id
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE a.usuario_id = $1 AND a.periodo = $2
      ORDER BY a.fecha, a.numero_asiento, a.tipo_linea
    `, [uid, periodo]);

    if (!rows.length) return res.json({ periodo, generado: false, filas: [] });

    // Agrupar por fecha
    const byFecha = {};
    for (const r of rows) {
      const f = r.fecha.slice(0,10);
      if (!byFecha[f]) byFecha[f] = { fecha: f, filas: [], subtotal_debe: 0, subtotal_haber: 0 };
      byFecha[f].filas.push(r);
      byFecha[f].subtotal_debe  += r.debe  || 0;
      byFecha[f].subtotal_haber += r.haber || 0;
    }

    const debe  = rows.reduce((s,r) => s + (r.debe||0),  0);
    const haber = rows.reduce((s,r) => s + (r.haber||0), 0);

    // Estructura plana también (para Excel)
    const filasPlanas = rows.map(r => ({
      asiento:       r.numero_asiento,
      fecha:         r.fecha.slice(0,10),
      cuenta_codigo: r.cuenta_codigo,
      cuenta_nombre: r.cuenta_nombre,
      debe:          r.debe,
      haber:         r.haber,
      descripcion:   r.descripcion,
      referencia:    r.referencia,
      tipo_linea:    r.tipo_linea,
      itbms_monto:   r.itbms_monto,
      itbms_tipo:    r.itbms_tipo,
      cliente:       r.cliente_nombre,
      ruc:           r.cliente_ruc,
      categoria:     r.categoria,
      tiene_factura: r.tiene_factura,
    }));

    res.json({
      periodo,
      generado:    true,
      total_lineas: rows.length,
      total_debe:   parseFloat(debe.toFixed(2)),
      total_haber:  parseFloat(haber.toFixed(2)),
      cuadra:       Math.abs(debe - haber) < 0.02,
      por_fecha:    Object.values(byFecha),
      filas_planas: filasPlanas,
      columnas_excel: ['asiento','fecha','cuenta_codigo','cuenta_nombre',
                       'debe','haber','descripcion','referencia',
                       'tipo_linea','itbms_monto','cliente','categoria'],
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/reportes/calidad-pdf?periodo=YYYY-MM ──────────────────────────
// Reporte de calidad en PDF
router.get('/calidad-pdf', [
  qv('periodo').matches(/^\d{4}-\d{2}$/).withMessage('Período requerido'),
], validate, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo;

    // Obtener datos de calidad
    const calRes  = await fetch(`http://localhost:${process.env.PORT||4000}/api/errores/calidad/${periodo}`,
      { headers: { Authorization: req.headers.authorization } });
    const calidad = await calRes.json();

    const PDFDocument = require('pdfkit');
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));

    await new Promise((resolve, reject) => {
      doc.on('end', resolve); doc.on('error', reject);

      // Header
      doc.rect(0,0,doc.page.width,72).fill('#0f1923');
      doc.fontSize(18).fillColor('#fff').font('Helvetica-Bold').text('ContaPanamá', 40, 22);
      doc.fontSize(10).fillColor('#94a3b8').font('Helvetica').text('Reporte de Calidad Contable', 40, 46);
      doc.fontSize(14).fillColor('#fff').font('Helvetica-Bold')
         .text(`Período: ${periodo}`, 40, 28, { align:'right', width: doc.page.width-80 });

      let y = 90;
      const fmt = n => new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format(n||0);

      // Score
      const scoreColor = calidad.score>=90?'#10b981':calidad.score>=70?'#f59e0b':'#ef4444';
      doc.rect(40,y,doc.page.width-80,50).fill('#f0f4f8');
      doc.fontSize(28).fillColor(scoreColor).font('Helvetica-Bold')
         .text(calidad.score+'/100', 50, y+11);
      doc.fontSize(12).fillColor('#0f172a').font('Helvetica')
         .text('Puntuación de calidad — '+calidad.nivel?.replace('_',' '), 150, y+18);
      y += 66;

      // Métricas
      const met = calidad.metricas || {};
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Resumen del Período', 40, y); y+=18;

      const metRows = [
        ['Total transacciones', met.total_transacciones],
        ['Sin clasificar',      met.sin_clasificar,      met.sin_clasificar>0?'ATENCIÓN':''],
        ['Sin asiento generado',met.sin_asiento,          met.sin_asiento>0?'ATENCIÓN':''],
        ['ITBMS sin factura',   met.itbms_sin_factura,    met.itbms_sin_factura>0?'REVISAR':''],
        ['Descuadres contables',met.descuadres,           met.descuadres>0?'CRÍTICO':''],
        ['Duplicados potenciales',met.duplicados_potenciales, met.duplicados_potenciales>0?'REVISAR':''],
        ['Transacciones exentas',met.exentos],
        ['Total Ingresos',      fmt(met.total_ingresos)],
        ['Total Gastos',        fmt(met.total_gastos)],
      ];

      for (const [label, valor, alerta] of metRows) {
        doc.rect(40,y,doc.page.width-80,22).fill(y%44===0?'#f8fafc':'#ffffff');
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(label, 50, y+7);
        const color = alerta==='CRÍTICO'?'#ef4444':alerta==='ATENCIÓN'?'#f59e0b':alerta==='REVISAR'?'#f59e0b':'#0f172a';
        doc.fillColor(color).font(alerta?'Helvetica-Bold':'Helvetica')
           .text(String(valor||0)+(alerta?' — '+alerta:''), 50, y+7, { align:'right', width:doc.page.width-100 });
        y += 22;
      }

      // Alertas
      if (calidad.alertas?.sin_factura?.length > 0) {
        y += 16;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#ef4444').text('Gastos con ITBMS sin factura:', 40, y); y+=16;
        for (const tx of calidad.alertas.sin_factura.slice(0,5)) {
          doc.fontSize(9).font('Helvetica').fillColor('#0f172a')
             .text(`• ${tx.fecha} — ${tx.descripcion} — ${fmt(tx.monto)} (ITBMS: ${fmt(tx.itbms)})`, 50, y); y+=14;
        }
      }

      if (calidad.alertas?.descuadres?.length > 0) {
        y += 16;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#ef4444').text('Asientos que no cuadran:', 40, y); y+=16;
        for (const d of calidad.alertas.descuadres.slice(0,5)) {
          doc.fontSize(9).font('Helvetica').fillColor('#0f172a')
             .text(`• ${d.descripcion} — DR: ${d.total_debe} CR: ${d.total_haber} Diff: ${d.diferencia}`, 50, y); y+=14;
        }
      }

      // Footer
      const fy = doc.page.height - 40;
      doc.moveTo(40,fy-8).lineTo(doc.page.width-40,fy-8).strokeColor('#e2e8f0').stroke();
      doc.fontSize(8).fillColor('#94a3b8').font('Helvetica')
         .text(`Generado el ${new Date().toLocaleDateString('es-PA')} · ContaPanamá SaaS`, 40, fy, { align:'center', width:doc.page.width-80 });

      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="calidad-${periodo}.pdf"`);
    res.send(Buffer.concat(chunks));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
