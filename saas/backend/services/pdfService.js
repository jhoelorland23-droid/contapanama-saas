/**
 * Servicio de generación de PDFs profesionales con pdfkit
 * Genera: diario combinado, estado de resultados, ITBMS, reporte por cliente
 */
const PDFDocument = require('pdfkit');
const { dateKey } = require('./accountingPeriod');

const COLORES = {
  primario:  '#0f1923',
  acento:    '#0ea5e9',
  exito:     '#10b981',
  peligro:   '#ef4444',
  advertencia:'#f59e0b',
  gris:      '#64748b',
  grisSuave: '#f0f4f8',
  borde:     '#e2e8f0',
};

const fmt = (n) => new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(n || 0);
const formatFecha = (f) => new Date(f).toLocaleDateString('es-PA', {
  year: 'numeric', month: 'long', day: 'numeric',
  timeZone: typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? 'UTC' : 'America/Panama',
});
const catLabel = id => ({
  ventas_servicios: 'Ventas/servicios',
  honorarios: 'Honorarios',
  otros_ingresos: 'Otros ingresos',
  compras_inventario: 'Compras/inventario',
  alquiler: 'Alquiler',
  servicios_publicos: 'Servicios publicos',
  planilla: 'Planilla',
  honorarios_profesionales: 'Honorarios prof.',
  transporte: 'Transporte',
  impuestos_tasas: 'Impuestos/tasas',
  banco_comisiones: 'Banco/comisiones',
  gastos_operativos: 'Gastos operativos',
  otros_gastos: 'Otros gastos',
}[id] || 'Sin categoria');

const agruparCategoria = rows => Object.values(rows.reduce((acc, t) => {
  const id = t.categoria_contable || (t.tipo === 'gasto' ? 'gastos_operativos' : 'ventas_servicios');
  if (!acc[id]) acc[id] = { id, label: catLabel(id), monto: 0, count: 0 };
  acc[id].monto += parseFloat(t.monto || 0);
  acc[id].count += 1;
  return acc;
}, {})).sort((a, b) => b.monto - a.monto);

/** Dibuja el encabezado común de todos los PDFs */
function header(doc, titulo, subtitulo) {
  // Barra superior
  doc.rect(0, 0, doc.page.width, 72).fill(COLORES.primario);

  // Logo texto
  doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold')
     .text('ContaPanamá', 40, 22);
  doc.fontSize(10).fillColor('#94a3b8').font('Helvetica')
     .text('Sistema Contable Profesional', 40, 46);

  const reportX = 240;
  const reportWidth = doc.page.width - reportX - 40;
  doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold');
  const titleSize = Math.min(14, 14 * (reportWidth - 6) / Math.max(1, doc.widthOfString(titulo)));
  doc.fontSize(titleSize).text(titulo, reportX, 22, { align: 'right', width: reportWidth, lineBreak: false });
  doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
  const subtitleSize = Math.min(9, 9 * (reportWidth - 6) / Math.max(1, doc.widthOfString(subtitulo || '')));
  doc.fontSize(subtitleSize).text(subtitulo || '', reportX, 44, { align: 'right', width: reportWidth, lineBreak: false });

  doc.moveDown(3);
}

/** Dibuja el pie de página */
function footer(doc, pageNum) {
  const y = doc.page.height - 28;
  const range = doc.bufferedPageRange();
  pageNum = range.start + range.count;
  doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica')
     .text(`Generado el ${formatFecha(new Date())} · ContaPanamá SaaS · Página ${pageNum}`,
           40, y, { align: 'center', width: doc.page.width - 80, height: 12, lineBreak: false });
  doc.moveTo(40, y - 8).lineTo(doc.page.width - 40, y - 8)
     .strokeColor(COLORES.borde).stroke();
}

/** Fila de tabla con colores alternados */
const tableHeaders = new WeakMap();
function tableRow(doc, y, cols, widths, isHeader = false, isEven = false) {
  const startX = 40;
  const availableWidth = doc.page.width - 80;
  const widthTotal = widths.reduce((sum, width) => sum + width, 0);
  const columnWidths = widths.map(width => width * availableWidth / widthTotal);
  const fontSize = isHeader ? 8 : 9;
  doc.fontSize(fontSize).font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
  const cellFontSizes = cols.map((col, idx) => {
    if (isHeader || typeof col !== 'object' || !['right', 'center'].includes(col.align)) return fontSize;
    const textWidth = doc.widthOfString(String(col.text ?? ''));
    return textWidth ? Math.min(fontSize, fontSize * (columnWidths[idx] - 13) / textWidth) : fontSize;
  });
  const rowH = Math.max(22, ...cols.map((col, idx) => {
    const text = String(typeof col === 'object' ? col.text ?? '' : col);
    doc.fontSize(cellFontSizes[idx]);
    return doc.heightOfString(text, { width: columnWidths[idx] - 12, lineGap: 0 }) + 12;
  }));
  if (isHeader) tableHeaders.set(doc, { cols, widths });
  if (y + rowH > doc.page.height - 64) {
    footer(doc, doc.bufferedPageRange().count);
    doc.addPage();
    y = 50;
    const previousHeader = tableHeaders.get(doc);
    if (!isHeader && previousHeader) y = tableRow(doc, y, previousHeader.cols, previousHeader.widths, true);
  }

  // Fondo
  if (isHeader) {
    doc.rect(startX, y, doc.page.width - 80, rowH).fill(COLORES.primario);
  } else if (isEven) {
    doc.rect(startX, y, doc.page.width - 80, rowH).fill(COLORES.grisSuave);
  }

  let x = startX;
  doc.fontSize(fontSize)
     .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
     .fillColor(isHeader ? '#ffffff' : COLORES.primario);

  cols.forEach((col, idx) => {
    const w = columnWidths[idx];
    const align = (typeof col === 'object' && col.align) ? col.align : 'left';
    const text  = (typeof col === 'object') ? col.text : String(col);
    const color = (typeof col === 'object' && col.color) ? col.color : (isHeader ? '#ffffff' : COLORES.primario);

    doc.fontSize(cellFontSizes[idx]).fillColor(color).text(text, x + 6, y + 6, { width: w - 12, align, lineGap: 0 });
    x += w;
  });

  return y + rowH;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DIARIO COMBINADO
// ═══════════════════════════════════════════════════════════════════════════
function generarDiarioCombinado(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Diario Combinado', `Período: ${data.periodo}`);

    // Resumen ejecutivo
    const ry = 90;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORES.primario)
       .text('Resumen del Período', 40, ry);

    const boxes = [
      { label: 'Total Ingresos',  value: fmt(data.total_ingresos),  color: COLORES.exito },
      { label: 'Total Gastos',    value: fmt(data.total_gastos),    color: COLORES.peligro },
      { label: 'Resultado Neto',  value: fmt(data.resultado),       color: parseFloat(data.resultado)>=0?COLORES.exito:COLORES.peligro },
      { label: 'N° Asientos',     value: String(data.total_asientos),color: COLORES.acento },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, ry + 18, bw - 8, 48).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, ry + 24, { width: bw - 20 });
      doc.fontSize(14).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, ry + 38, { width: bw - 20 });
    });

    let y = ry + 80;

    // Tabla por fecha
    const widths = [58, 142, 85, 72, 60, 55, 45];
    const headers = ['Fecha', 'Descripcion', 'Categoria', 'Banco', 'Monto', 'ITBMS', 'Pago'];

    for (const entrada of data.entradas) {
      // Encabezado de fecha
      if (y > doc.page.height - 120) { doc.addPage(); footer(doc, doc.bufferedPageRange().count); y = 60; }
      doc.rect(40, y, doc.page.width - 80, 18).fill('#dbeafe');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af')
         .text(`${formatFecha(entrada.fecha)}   -   Debe: ${fmt(entrada.debe)}   |   Haber: ${fmt(entrada.haber)}`,
               46, y + 5);
      y += 18;

      // Headers de columna
      y = tableRow(doc, y, headers, widths, true);

      // Asientos del día
      entrada.asientos.forEach((a, idx) => {
        if (y > doc.page.height - 80) { doc.addPage(); footer(doc, doc.bufferedPageRange().count); y = 60; }
        const mColor = a.tipo === 'ingreso' ? COLORES.exito : COLORES.peligro;
        y = tableRow(doc, y, [
          String(a.fecha).slice(0, 10),
          { text: a.descripcion, align: 'left' },
          catLabel(a.categoria_contable),
          a.banco || '-',
          { text: fmt(a.monto), align: 'right', color: mColor },
          { text: fmt(a.itbms), align: 'right', color: COLORES.gris },
          { text: (a.estado_pago || 'pendiente').toUpperCase(), align: 'center', color: a.estado_pago === 'pagado' ? COLORES.exito : COLORES.advertencia },
        ], widths, false, idx % 2 === 0);
      });
      y += 6;
    }

    footer(doc, 1);
    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ESTADO DE RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════
function generarEstadoResultados(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Estado de Resultados', `Período: ${data.periodo}`);

    let y = 90;
    const lw = 280; const rw = 280;

    // Columna izquierda: INGRESOS
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORES.exito).text('INGRESOS', 40, y);
    y += 16;
    let totalIng = 0;
    for (const t of agruparCategoria(data.ingresos)) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.primario)
         .text(`${t.label} (${t.count})`, 40, y, { width: lw - 80 })
         .text(fmt(t.monto), 40, y, { width: lw, align: 'right' });
      doc.moveTo(40, y + 12).lineTo(40 + lw, y + 12).strokeColor(COLORES.borde).lineWidth(0.5).stroke();
      totalIng += parseFloat(t.monto);
      y += 16;
    }
    doc.rect(40, y, lw, 22).fill('#ecfdf5');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORES.exito)
       .text('TOTAL INGRESOS', 46, y + 7, { width: lw - 12, align: 'left' })
       .text(fmt(totalIng), 46, y + 7, { width: lw - 12, align: 'right' });
    y += 34;

    // Columna: GASTOS
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORES.peligro).text('GASTOS Y COSTOS', 40, y);
    y += 16;
    let totalGst = 0;
    for (const t of agruparCategoria(data.gastos)) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.primario)
         .text(`${t.label} (${t.count})`, 40, y, { width: lw - 80 })
         .text(fmt(t.monto), 40, y, { width: lw, align: 'right' });
      doc.moveTo(40, y + 12).lineTo(40 + lw, y + 12).strokeColor(COLORES.borde).lineWidth(0.5).stroke();
      totalGst += parseFloat(t.monto);
      y += 16;
    }
    doc.rect(40, y, lw, 22).fill('#fef2f2');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORES.peligro)
       .text('TOTAL GASTOS', 46, y + 7, { width: lw - 12, align: 'left' })
       .text(fmt(totalGst), 46, y + 7, { width: lw - 12, align: 'right' });
    y += 44;

    // RESULTADO NETO
    const resultado = totalIng - totalGst;
    const resColor  = resultado >= 0 ? COLORES.exito : COLORES.peligro;
    doc.rect(40, y, doc.page.width - 80, 36).fill(resultado >= 0 ? '#ecfdf5' : '#fef2f2');
    doc.fontSize(13).font('Helvetica-Bold').fillColor(resColor)
       .text(resultado >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA', 50, y + 11)
       .text(fmt(resultado), 50, y + 11, { width: doc.page.width - 100, align: 'right' });

    if (totalIng > 0) {
      const margen = ((resultado / totalIng) * 100).toFixed(1);
      doc.fontSize(9).fillColor(COLORES.gris).text(`Margen neto: ${margen}%`, 50, y + 46);
    }

    footer(doc, 1);
    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ITBMS MENSUAL (Formulario 430)
// ═══════════════════════════════════════════════════════════════════════════
function generarReporteITBMS(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Declaración ITBMS', `Formulario 430 · Período: ${data.periodo}`);

    let y = 100;

    const filas = [
      ['1. Base Imponible (Total Ventas Gravadas)',  fmt(data.base_imponible), COLORES.primario],
      ['2. ITBMS Débito (1 × 7%)',                   fmt(data.debito),         COLORES.peligro],
      ['3. ITBMS Crédito (Compras Deducibles × 7%)', fmt(data.credito),        COLORES.exito],
      ['',null,null],
      ['4. ITBMS Neto a Pagar (2 - 3)',               fmt(data.saldo_pagar),   COLORES.acento],
    ];

    for (const [label, valor, color] of filas) {
      if (!valor) { y += 10; continue; }
      doc.rect(40, y, doc.page.width - 80, 28)
         .fill(label.startsWith('4') ? '#f0f9ff' : COLORES.grisSuave);
      doc.fontSize(10).font(label.startsWith('4') ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(color).text(label, 50, y + 9)
         .text(valor, 50, y + 9, { width: doc.page.width - 100, align: 'right' });
      y += 32;
    }

    // Nota legal
    y += 20;
    doc.rect(40, y, doc.page.width - 80, 60).fill('#fffbeb');
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORES.advertencia)
       .text('IMPORTANTE:', 50, y + 10);
    doc.font('Helvetica').fillColor(COLORES.primario)
       .text(`Este formulario debe presentarse a la DGI antes del ${data.vencimiento}.`
           + ` El pago se realiza en la Caja del Banco Nacional o en línea a través del portal e-Tax 2.0.`,
             50, y + 24, { width: doc.page.width - 100 });

    footer(doc, 1);
    doc.end();
  });
}

function generarBalanceComprobacion(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Balance de Comprobación', data.subtitulo || `Periodo: ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    const boxes = [
      { label: 'Asientos', value: String(data.total_asientos || 0), color: COLORES.acento },
      { label: 'Debe', value: fmt(data.total_debe), color: COLORES.exito },
      { label: 'Haber', value: fmt(data.total_haber), color: COLORES.acento },
      { label: 'Diferencia', value: fmt(data.diferencia), color: data.balanceado ? COLORES.exito : COLORES.peligro },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 48).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(13).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 25, { width: bw - 20 });
    });
    y += 66;

    const widths = [48, 164, 80, 80, 80, 80];
    y = tableRow(doc, y, ['Codigo', 'Cuenta', 'Saldo inicial', 'Debe', 'Haber', 'Saldo final'], widths, true);
    (data.cuentas || []).forEach((r, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; y = tableRow(doc, y, ['Codigo', 'Cuenta', 'Saldo inicial', 'Debe', 'Haber', 'Saldo final'], widths, true); }
      y = tableRow(doc, y, [
        r.cuenta_codigo,
        r.cuenta_nombre,
        { text: fmt(r.saldo_inicial), align: 'right' },
        { text: fmt(r.debe), align: 'right' },
        { text: fmt(r.haber), align: 'right' },
        { text: fmt(r.saldo), align: 'right', color: r.saldo < 0 ? COLORES.peligro : COLORES.primario },
      ], widths, false, idx % 2 === 0);
    });
    if (!(data.cuentas || []).length) {
      doc.fontSize(10).fillColor(COLORES.gris).text('Sin movimientos contables para el periodo.', 40, y + 12);
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarMayorCuenta(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Mayor de Cuenta', `${data.cuenta_codigo} - ${data.cuenta_nombre || 'Cuenta'} · ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    doc.rect(40, y, doc.page.width - 80, 42).fill(COLORES.grisSuave).stroke(COLORES.borde);
    doc.fontSize(9).fillColor(COLORES.gris).font('Helvetica').text('Debe', 52, y + 9);
    doc.fontSize(13).fillColor(COLORES.exito).font('Helvetica-Bold').text(fmt(data.debe), 52, y + 23);
    doc.fontSize(9).fillColor(COLORES.gris).font('Helvetica').text('Haber', 210, y + 9);
    doc.fontSize(13).fillColor(COLORES.acento).font('Helvetica-Bold').text(fmt(data.haber), 210, y + 23);
    doc.fontSize(9).fillColor(COLORES.gris).font('Helvetica').text('Saldo', 370, y + 9);
    doc.fontSize(13).fillColor(data.saldo < 0 ? COLORES.peligro : COLORES.primario).font('Helvetica-Bold').text(fmt(data.saldo), 370, y + 23);
    y += 60;

    doc.fontSize(10).font('Helvetica').fillColor(COLORES.primario).text(`Saldo inicial: ${fmt(data.saldo_inicial)}`, 40, y);
    y += 24;
    const widths = [64, 150, 100, 70, 70, 78];
    y = tableRow(doc, y, ['Fecha', 'Descripcion', 'Cliente', 'Debe', 'Haber', 'Saldo'], widths, true);
    (data.data || []).forEach((r, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; y = tableRow(doc, y, ['Fecha', 'Descripcion', 'Cliente', 'Debe', 'Haber', 'Saldo'], widths, true); }
      y = tableRow(doc, y, [
        String(r.fecha).slice(0, 10),
        r.descripcion || '-',
        r.cliente_nombre || '-',
        { text: r.debe ? fmt(r.debe) : '-', align: 'right' },
        { text: r.haber ? fmt(r.haber) : '-', align: 'right' },
        { text: fmt(r.saldo), align: 'right' },
      ], widths, false, idx % 2 === 0);
    });
    if (!(data.data || []).length) {
      doc.fontSize(10).fillColor(COLORES.gris).text('Sin movimientos para esta cuenta.', 40, y + 12);
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarMayorGeneral(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Mayor General', data.subtitulo || `Periodo: ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    const boxes = [
      { label: 'Cuentas', value: String(data.total_cuentas || 0), color: COLORES.acento },
      { label: 'Movimientos', value: String(data.total_movimientos || 0), color: COLORES.primario },
      { label: 'Debe', value: fmt(data.total_debe), color: COLORES.exito },
      { label: 'Haber', value: fmt(data.total_haber), color: COLORES.acento },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 46).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(13).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 24, { width: bw - 20 });
    });
    y += 64;

    const widths = [54, 122, 58, 118, 66, 66, 56, 42];
    for (const cuenta of data.data || []) {
      if (y > doc.page.height - 120) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      doc.rect(40, y, doc.page.width - 80, 40).fill('#dbeafe').stroke(COLORES.borde);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af')
         .text(`${cuenta.cuenta_codigo} - ${cuenta.cuenta_nombre}`, 48, y + 7, { width: 260 });
      doc.fontSize(8).font('Helvetica').fillColor('#1e40af')
         .text(`Inicial ${fmt(cuenta.saldo_inicial)} | Debe ${fmt(cuenta.debe)} | Haber ${fmt(cuenta.haber)} | Final ${fmt(cuenta.saldo)}`, 48, y + 24, { width: doc.page.width - 96 });
      y += 40;
      y = tableRow(doc, y, ['Fecha', 'Cliente', 'Estado', 'Descripcion', 'Debe', 'Haber', 'Saldo', 'Conc.'], widths, true);

      let saldo = Number(cuenta.saldo_inicial || 0);
      (cuenta.movimientos || []).forEach((mov, idx) => {
        if (y > doc.page.height - 80) {
          footer(doc, doc.bufferedPageRange().count);
          doc.addPage();
          y = 50;
          y = tableRow(doc, y, ['Fecha', 'Cliente', 'Estado', 'Descripcion', 'Debe', 'Haber', 'Saldo', 'Conc.'], widths, true);
        }
        saldo += Number(mov.debe || 0) - Number(mov.haber || 0);
        y = tableRow(doc, y, [
          String(mov.fecha).slice(0, 10),
          mov.cliente_nombre || '-',
          mov.estado_pago || '-',
          mov.descripcion_linea || mov.descripcion_asiento || '-',
          { text: mov.debe ? fmt(mov.debe) : '-', align: 'right' },
          { text: mov.haber ? fmt(mov.haber) : '-', align: 'right' },
          { text: fmt(saldo), align: 'right' },
          mov.conciliado ? 'Si' : 'No',
        ], widths, false, idx % 2 === 0);
      });
      y += 10;
    }

    if (!(data.data || []).length) {
      doc.fontSize(10).fillColor(COLORES.gris).text('Sin movimientos contables para el periodo.', 40, y + 12);
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarRevisionCierre(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Revisión de Cierre CPA', data.subtitulo || `Periodo: ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    const formal = data.cierre_formal || { estado: 'abierto' };
    const formalLabel = String(formal.estado || 'abierto').replace('_', ' ').toUpperCase();
    const estadoColor = data.listo_para_cierre ? COLORES.exito : COLORES.advertencia;
    doc.rect(40, y, doc.page.width - 80, 54).fill(data.listo_para_cierre ? '#ecfdf5' : '#fffbeb').stroke(COLORES.borde);
    doc.fontSize(12).font('Helvetica-Bold').fillColor(estadoColor)
       .text(data.listo_para_cierre ? 'LISTO PARA REVISION FINAL CPA' : 'PENDIENTE ANTES DE CIERRE', 52, y + 12);
    doc.fontSize(9).font('Helvetica').fillColor(COLORES.primario)
       .text(`Riesgo: ${String(data.riesgo || 'medio').toUpperCase()} · Transacciones: ${data.total_transacciones || 0} · Asientos: ${data.total_asientos || 0}`, 52, y + 32);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(formal.estado === 'cerrado' ? COLORES.exito : formal.estado === 'en_revision' ? COLORES.acento : COLORES.gris)
       .text(`CIERRE FORMAL: ${formalLabel}${formal.cerrado_at ? ` · ${String(formal.cerrado_at).slice(0, 10)}` : ''}`, 360, y + 12, { width: 170, align: 'right' });
    if (formal.nota) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.gris)
         .text(`Nota CPA: ${formal.nota}`, 360, y + 30, { width: 170, align: 'right' });
    }
    y += 72;

    const metricas = [
      ['Diferencia contable', fmt(data.diferencia)],
      ['Cuentas por cobrar', fmt(data.cuentas_por_cobrar)],
      ['Cuentas por pagar', fmt(data.cuentas_por_pagar)],
      ['Pagos sin conciliar', String(data.pagados_sin_conciliar || 0)],
      ['Banco sin respaldo', String(data.control_bancario?.movimientos_pendientes || 0)],
      ['ITBMS debito', fmt(data.itbms_debito)],
      ['ITBMS credito', fmt(data.itbms_credito)],
      ['ITBMS neto', fmt(data.itbms_neto)],
    ];
    metricas.forEach(([label, value], idx) => {
      const x = 40 + (idx % 2) * 270;
      const yy = y + Math.floor(idx / 2) * 24;
      doc.fontSize(9).font('Helvetica').fillColor(COLORES.gris).text(label, x, yy);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORES.primario).text(value, x + 145, yy, { width: 100, align: 'right' });
    });
    y += 110;

    if (data.control_bancario) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.gris)
        .text(`Control bancario al ${data.control_bancario.fecha_corte}: ${data.control_bancario.pendientes_anteriores} partida(s) pendiente(s) de periodos anteriores. Saldos inicial/final del extracto: NO verificados.`, 40, y, { width: doc.page.width - 80 });
      y = doc.y + 14;
    }
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORES.primario).text('Checklist CPA', 40, y);
    y += 18;
    (data.checklist || []).forEach(item => {
      doc.fontSize(9).font('Helvetica').fillColor(item.ok ? COLORES.exito : COLORES.advertencia)
         .text(`${item.ok ? '[OK]' : '[PENDIENTE]'} ${item.item}`, 48, y);
      y += 15;
    });

    y += 12;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORES.primario).text('Hallazgos', 40, y);
    y += 18;
    if (!(data.issues || []).length) {
      doc.fontSize(9).fillColor(COLORES.exito).text('Sin hallazgos críticos del cierre.', 48, y);
    } else {
      (data.issues || []).forEach(issue => {
        const title = `${issue.titulo} (${issue.severidad})`;
        const detail = `${issue.detalle} Accion: ${issue.accion}`;
        const width = doc.page.width - 100;
        const titleHeight = doc.fontSize(9).font('Helvetica-Bold').heightOfString(title, { width });
        const detailHeight = doc.fontSize(8).font('Helvetica').heightOfString(detail, { width });
        const height = 20 + titleHeight + detailHeight;
        if (y + height > doc.page.height - 55) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
        doc.rect(40, y, doc.page.width - 80, height).fill(issue.severidad === 'critica' ? '#fef2f2' : '#fffbeb').stroke(COLORES.borde);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(issue.severidad === 'critica' ? COLORES.peligro : COLORES.advertencia)
           .text(title, 50, y + 8, { width });
        doc.fontSize(8).font('Helvetica').fillColor(COLORES.primario)
           .text(detail, 50, y + 12 + titleHeight, { width });
        y += height + 6;
      });
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarCierresClientes(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Cierre por Cliente', data.subtitulo || `Periodo: ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    const boxes = [
      { label: 'Clientes', value: String(data.total_clientes || 0), color: COLORES.acento },
      { label: 'Listos', value: String(data.listos || 0), color: COLORES.exito },
      { label: 'Pendientes', value: String(data.pendientes || 0), color: COLORES.advertencia },
      { label: 'Alto riesgo', value: String((data.riesgo_alto || 0) + (data.riesgo_critico || 0)), color: COLORES.peligro },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 46).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(14).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 24, { width: bw - 20 });
    });
    y += 66;

    const widths = [136, 66, 48, 56, 58, 58, 116];
    y = tableRow(doc, y, ['Cliente', 'RUC', 'Riesgo', 'Estado', 'Ingresos', 'Gastos', 'Pendiente principal'], widths, true);
    (data.data || []).forEach((r, idx) => {
      if (y > doc.page.height - 80) {
        footer(doc, doc.bufferedPageRange().count);
        doc.addPage();
        y = 50;
        y = tableRow(doc, y, ['Cliente', 'RUC', 'Riesgo', 'Estado', 'Ingresos', 'Gastos', 'Pendiente principal'], widths, true);
      }
      y = tableRow(doc, y, [
        r.cliente_nombre || 'Sin cliente',
        r.ruc || '-',
        String(r.riesgo || '-').toUpperCase(),
        r.listo_para_cierre ? 'Listo' : 'Pend.',
        { text: fmt(r.total_ingresos), align: 'right' },
        { text: fmt(r.total_gastos), align: 'right' },
        r.issues?.[0]?.titulo || 'Sin hallazgos',
      ], widths, false, idx % 2 === 0);
    });

    if (!(data.data || []).length) {
      doc.fontSize(10).fillColor(COLORES.gris).text('Sin clientes para mostrar.', 40, y + 12);
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarAntiguedadSaldos(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Antigüedad de Saldos', `Corte: ${data.fecha_corte} · ${data.periodo || data.anio || 'Todos'}`);

    let y = 96;
    const boxes = [
      { label: 'Total pendiente', value: fmt(data.total_pendiente), color: COLORES.acento },
      { label: 'Por cobrar', value: fmt(data.total_por_cobrar), color: COLORES.exito },
      { label: 'Por pagar', value: fmt(data.total_por_pagar), color: COLORES.peligro },
      { label: 'Documentos', value: String(data.total_documentos || 0), color: COLORES.primario },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 46).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(13).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 24, { width: bw - 20 });
    });
    y += 64;

    const bucketWidths = [92, 78, 78, 78, 78, 78];
    const bucketValues = data.buckets || {};
    y = tableRow(doc, y, ['Bucket', 'Corriente', '1-30', '31-60', '61-90', '+90'], bucketWidths, true);
    y = tableRow(doc, y, [
      'Total',
      { text: fmt(bucketValues.corriente?.total || 0), align: 'right' },
      { text: fmt(bucketValues.dias_1_30?.total || 0), align: 'right' },
      { text: fmt(bucketValues.dias_31_60?.total || 0), align: 'right' },
      { text: fmt(bucketValues.dias_61_90?.total || 0), align: 'right' },
      { text: fmt(bucketValues.mas_90?.total || 0), align: 'right', color: (bucketValues.mas_90?.total || 0) > 0 ? COLORES.peligro : COLORES.primario },
    ], bucketWidths, false, true);
    y += 18;

    const widths = [70, 100, 136, 36, 30, 80, 80];
    y = tableRow(doc, y, ['Vence', 'Cliente', 'Documento', 'Tipo', 'Dias', 'Total', 'Banco'], widths, true);
    (data.data || []).forEach((r, idx) => {
      if (y > doc.page.height - 80) {
        footer(doc, doc.bufferedPageRange().count);
        doc.addPage();
        y = 50;
        y = tableRow(doc, y, ['Vence', 'Cliente', 'Documento', 'Tipo', 'Dias', 'Total', 'Banco'], widths, true);
      }
      y = tableRow(doc, y, [
        String(r.fecha_vencimiento).slice(0, 10),
        r.cliente_nombre || '-',
        r.descripcion || '-',
        r.tipo === 'por_cobrar' ? 'CxC' : 'CxP',
        { text: String(r.dias_vencido || 0), align: 'right', color: (r.dias_vencido || 0) > 90 ? COLORES.peligro : COLORES.primario },
        { text: fmt(r.total), align: 'right' },
        r.banco || '-',
      ], widths, false, idx % 2 === 0);
    });
    if (!(data.data || []).length) {
      doc.fontSize(10).fillColor(COLORES.gris).text('No hay saldos pendientes para este filtro.', 40, y + 12);
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarConciliacionBancaria(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    header(doc, 'Conciliacion de movimientos', `Periodo: ${data.periodo || data.anio} - Corte: ${data.fecha_corte || '-'}`);
    let y = 98;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORES.primario).text(data.cliente_nombre || 'Toda la cartera', 40, y);
    y = doc.y + 12;
    doc.font('Helvetica').fontSize(9).fillColor(COLORES.advertencia)
      .text(`Cuenta: ${data.cuenta_nombre || 'Todas las cuentas'}. Saldos inicial y final del extracto NO verificados.`, 40, y);
    y = doc.y + 18;
    const section = (title, headers, widths, rows) => {
      if (y > doc.page.height - 135) { footer(doc); doc.addPage(); y = 50; }
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORES.primario).text(title, 40, y);
      y += 22;
      y = tableRow(doc, y, headers, widths, true);
      rows.forEach((row, index) => { y = tableRow(doc, y, row, widths, false, index % 2 === 0); });
      if (!rows.length) y = tableRow(doc, y, ['Sin registros', ...headers.slice(1).map(() => '')], widths);
      y += 24;
    };
    const moneyCell = value => ({ text: fmt(value), align: 'right' });
    const entity = r => `${r.cliente_nombre || 'Sin cliente asignado'}\n${r.banco || '-'}\n${r.cuenta_nombre || 'Sin cuenta asignada'}`;
    section('Resumen por cliente y cuenta', ['Cliente / Cuenta','Neto contable','Neto bancario','Diferencia','Pend. pagos / banco','Estado movimientos'],
      [195,90,90,90,90,155], (data.resumen || []).map(r => [entity(r), moneyCell(r.movimiento_neto_contable ?? r.saldo_contable),
        moneyCell(r.movimiento_neto_bancario), typeof r.diferencia === 'number' ? moneyCell(r.diferencia) : 'Sin extracto',
        `${r.num_pendientes || 0} / ${r.banco_pendientes || 0}`, String(r.estado || '').replaceAll('_',' ')]));
    const columns = ['Fecha','Cliente / Cuenta','Descripcion / Referencia','Tipo / Estado','Importe'];
    const widths = [75,175,240,110,75];
    const bankRow = r => [dateKey(r.fecha), entity(r), `${r.descripcion || '-'}\n${r.referencia || '-'}`,
      `${r.tipo} / ${r.estado_vinculo || (r.requiere_revision ? 'revision' : 'pendiente')}`, moneyCell(r.monto)];
    const pendingRow = r => [dateKey(r.fecha), entity(r), `${r.descripcion || '-'}\n${r.referencia_pago || r.referencia || '-'}`,
      `${r.tipo} / ${r.requiere_revision ? 'revision' : 'pendiente'}`, moneyCell(r.total_documento)];
    section('Pagos contables del periodo', columns, widths, (data.registros_contables || []).map(r =>
      [dateKey(r.fecha),entity(r),`${r.descripcion}\n${r.referencia || '-'}`,`${r.tipo} / ${r.estado}`,moneyCell(r.importe)]));
    section('Movimientos bancarios del periodo', columns, widths, (data.movimientos_periodo || []).map(bankRow));
    section('Pagos pendientes al corte (incluye periodos anteriores)', columns, widths, (data.transacciones_pendientes || []).map(pendingRow));
    section('Banco pendiente al corte (incluye periodos anteriores)', columns, widths, (data.movimientos_pendientes || []).map(bankRow));
    section('Documentos sin pago registrado - no son movimientos bancarios', columns, widths, (data.documentos_sin_pago || []).map(pendingRow));
    footer(doc); doc.end();
  });
}

function generarPaqueteCierreCPA(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Paquete de Cierre CPA', `Periodo: ${data.periodo || data.anio || 'Todos'} · Alcance: ${data.alcance || 'mensual'}`);

    const cierre = data.cierre || {};
    const conciliacion = data.conciliacion || {};
    const antiguedad = data.antiguedad || {};
    const clientes = data.cierres_clientes || {};
    const resumenMensual = data.resumen_mensual || null;
    const diferenciasBanco = (conciliacion.resumen || []).filter(row => row.estado !== 'movimientos_vinculados').length;
    const formal = cierre.cierre_formal || { estado: 'abierto' };
    const formalLabel = String(formal.estado || 'abierto').replace('_', ' ').toUpperCase();

    let y = 96;
    const boxes = [
      { label: 'Cierre formal', value: formalLabel, color: formal.estado === 'cerrado' ? COLORES.exito : formal.estado === 'en_revision' ? COLORES.acento : COLORES.gris },
      { label: 'Estado cierre', value: cierre.listo_para_cierre ? 'Listo' : 'Pendiente', color: cierre.listo_para_cierre ? COLORES.exito : COLORES.advertencia },
      { label: 'Riesgo', value: String(cierre.riesgo || 'medio').toUpperCase(), color: cierre.riesgo === 'bajo' ? COLORES.exito : COLORES.peligro },
      { label: 'Pendiente CxC/CxP', value: fmt(Number(cierre.cuentas_por_cobrar || 0) + Number(cierre.cuentas_por_pagar || 0)), color: COLORES.advertencia },
      { label: 'Dif. bancos', value: String(diferenciasBanco), color: diferenciasBanco ? COLORES.peligro : COLORES.exito },
    ];
    const bw = (doc.page.width - 80) / boxes.length;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 46).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(12).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 24, { width: bw - 20 });
    });
    y += 66;

    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORES.primario).text('Checklist de cierre', 40, y);
    y += 18;
    const checklistWidths = [28, 264, 230];
    y = tableRow(doc, y, ['OK', 'Control', 'Estado'], checklistWidths, true);
    (cierre.checklist || []).forEach((item, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      y = tableRow(doc, y, [
        item.ok ? 'Si' : 'No',
        item.item,
        item.ok ? 'Validado' : 'Pendiente de revision',
      ], checklistWidths, false, idx % 2 === 0);
    });

    y += 18;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORES.primario).text('Hallazgos principales', 40, y);
    y += 18;
    const issueWidths = [62, 132, 328];
    y = tableRow(doc, y, ['Riesgo', 'Hallazgo', 'Accion requerida'], issueWidths, true);
    (cierre.issues || []).forEach((issue, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      y = tableRow(doc, y, [
        String(issue.severidad || '-').toUpperCase(),
        issue.titulo || '-',
        issue.accion || '-',
      ], issueWidths, false, idx % 2 === 0);
    });
    if (!(cierre.issues || []).length) {
      doc.fontSize(10).fillColor(COLORES.exito).text('Sin hallazgos criticos del cierre.', 40, y + 12);
      y += 30;
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.addPage();
    y = 50;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORES.primario).text('Movimientos por cliente y cuenta', 40, y);
    y += 20;
    doc.fontSize(9).font('Helvetica').text('Saldos inicial y final del extracto NO verificados.', 40, y);
    y += 20;
    const bankWidths = [172, 76, 76, 68, 40, 40, 90];
    y = tableRow(doc, y, ['Cliente / Banco / Cuenta', 'Neto contable', 'Neto banco', 'Diferencia', 'Reg.', 'Mov.', 'Estado'], bankWidths, true);
    (conciliacion.resumen || []).forEach((r, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      y = tableRow(doc, y, [
        `${r.cliente_nombre || 'Sin cliente asignado'}\n${r.banco || '-'}\n${r.cuenta_nombre || 'Sin cuenta asignada'}`,
        { text: fmt(r.saldo_contable), align: 'right' },
        { text: typeof r.saldo_banco === 'string' ? r.saldo_banco : fmt(r.saldo_banco), align: 'right' },
        { text: r.diferencia === 'N/A' ? 'N/A' : fmt(r.diferencia), align: 'right', color: Number(r.diferencia || 0) ? COLORES.peligro : COLORES.primario },
        { text: String(r.num_transacciones || 0), align: 'right' },
        { text: String(r.num_movimientos || 0), align: 'right' },
        String(r.estado || '-').replaceAll('_', ' ').toUpperCase(),
      ], bankWidths, false, idx % 2 === 0);
    });

    y += 22;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORES.primario).text('Antiguedad de saldos', 40, y);
    y += 20;
    const agingBoxes = [
      ['Total pendiente', fmt(antiguedad.total_pendiente)],
      ['Por cobrar', fmt(antiguedad.total_por_cobrar)],
      ['Por pagar', fmt(antiguedad.total_por_pagar)],
      ['Documentos', String(antiguedad.total_documentos || 0)],
    ];
    agingBoxes.forEach(([label, value], idx) => {
      const x = 40 + (idx % 2) * 270;
      const yy = y + Math.floor(idx / 2) * 24;
      doc.fontSize(9).font('Helvetica').fillColor(COLORES.gris).text(label, x, yy);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORES.primario).text(value, x + 145, yy, { width: 100, align: 'right' });
    });
    y += 70;
    const agingWidths = [64, 144, 174, 52, 70];
    y = tableRow(doc, y, ['Vence', 'Cliente', 'Documento', 'Dias', 'Total'], agingWidths, true);
    (antiguedad.data || []).forEach((row, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      y = tableRow(doc, y, [
        String(row.fecha_vencimiento || '').slice(0, 10),
        row.cliente_nombre || '-',
        row.descripcion || '-',
        { text: String(row.dias_vencido || 0), align: 'right' },
        { text: fmt(row.total), align: 'right' },
      ], agingWidths, false, idx % 2 === 0);
    });

    footer(doc, doc.bufferedPageRange().count);
    doc.addPage();
    y = 50;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORES.primario).text('Cierre por cliente', 40, y);
    y += 20;
    doc.fontSize(9).font('Helvetica').fillColor(COLORES.gris)
      .text(`Clientes: ${clientes.total_clientes || 0} · Listos: ${clientes.listos || 0} · Pendientes: ${clientes.pendientes || 0} · Alto riesgo: ${(clientes.riesgo_alto || 0) + (clientes.riesgo_critico || 0)}`, 40, y);
    y += 22;
    const clientWidths = [138, 66, 52, 64, 62, 62, 78];
    y = tableRow(doc, y, ['Cliente', 'RUC', 'Riesgo', 'Estado', 'Ingresos', 'Gastos', 'Pendiente'], clientWidths, true);
    (clientes.data || []).forEach((row, idx) => {
      if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
      y = tableRow(doc, y, [
        row.cliente_nombre || '-',
        row.ruc || '-',
        String(row.riesgo || '-').toUpperCase(),
        row.listo_para_cierre ? 'Listo' : 'Pend.',
        { text: fmt(row.total_ingresos), align: 'right' },
        { text: fmt(row.total_gastos), align: 'right' },
        row.issues?.[0]?.titulo || 'Sin hallazgos',
      ], clientWidths, false, idx % 2 === 0);
    });

    if (resumenMensual?.data?.length) {
      footer(doc, doc.bufferedPageRange().count);
      doc.addPage();
      y = 50;
      doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORES.primario).text('Resumen 12 meses', 40, y);
      y += 20;
      const monthWidths = [56, 70, 70, 70, 70, 70, 70];
      y = tableRow(doc, y, ['Mes', 'Ingresos', 'Gastos', 'Utilidad', 'ITBMS', 'CxC', 'CxP'], monthWidths, true);
      resumenMensual.data.forEach((row, idx) => {
        if (y > doc.page.height - 80) { footer(doc, doc.bufferedPageRange().count); doc.addPage(); y = 50; }
        y = tableRow(doc, y, [
          row.periodo || '-',
          { text: fmt(row.ingresos), align: 'right' },
          { text: fmt(row.gastos), align: 'right' },
          { text: fmt(row.utilidad), align: 'right' },
          { text: fmt(row.itbms_neto), align: 'right' },
          { text: fmt(row.cuentas_por_cobrar), align: 'right' },
          { text: fmt(row.cuentas_por_pagar), align: 'right' },
        ], monthWidths, false, idx % 2 === 0);
      });
    }

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

function generarResumenMensualAnual(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Resumen Contable 12 Meses', `Año: ${data.anio || 'N/D'}${data.cliente_nombre ? ` · Cliente: ${data.cliente_nombre}` : ''}`);

    let y = 96;
    const totals = data.totales || {};
    const boxes = [
      { label: 'Ingresos', value: fmt(totals.ingresos), color: COLORES.exito },
      { label: 'Gastos', value: fmt(totals.gastos), color: COLORES.peligro },
      { label: 'Utilidad', value: fmt(totals.utilidad), color: (totals.utilidad || 0) >= 0 ? COLORES.exito : COLORES.peligro },
      { label: 'ITBMS neto', value: fmt(totals.itbms_neto), color: COLORES.acento },
    ];
    const bw = (doc.page.width - 80) / 4;
    boxes.forEach((b, i) => {
      const bx = 40 + i * bw;
      doc.rect(bx, y, bw - 8, 46).fill(COLORES.grisSuave).stroke(COLORES.borde);
      doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica').text(b.label, bx + 6, y + 8, { width: bw - 20 });
      doc.fontSize(13).fillColor(b.color).font('Helvetica-Bold').text(b.value, bx + 6, y + 24, { width: bw - 20 });
    });
    y += 66;

    doc.fontSize(9).font('Helvetica').fillColor(COLORES.gris)
       .text(`Meses con movimiento: ${data.meses_con_movimiento || 0} · Pendientes: ${data.meses_pendientes || 0} · Alto riesgo: ${data.meses_riesgo_alto || 0}`, 40, y);
    y += 20;

    const widths = [48, 58, 58, 58, 56, 54, 54, 54, 94];
    y = tableRow(doc, y, ['Mes', 'Ingresos', 'Gastos', 'Utilidad', 'ITBMS', 'CxC', 'CxP', 'Riesgo', 'Pendiente'], widths, true);
    (data.data || []).forEach((row, idx) => {
      if (y > doc.page.height - 80) {
        footer(doc, doc.bufferedPageRange().count);
        doc.addPage();
        y = 50;
        y = tableRow(doc, y, ['Mes', 'Ingresos', 'Gastos', 'Utilidad', 'ITBMS', 'CxC', 'CxP', 'Riesgo', 'Pendiente'], widths, true);
      }
      y = tableRow(doc, y, [
        row.periodo || '-',
        { text: fmt(row.ingresos), align: 'right' },
        { text: fmt(row.gastos), align: 'right' },
        { text: fmt(row.utilidad), align: 'right', color: (row.utilidad || 0) < 0 ? COLORES.peligro : COLORES.primario },
        { text: fmt(row.itbms_neto), align: 'right' },
        { text: fmt(row.cuentas_por_cobrar), align: 'right' },
        { text: fmt(row.cuentas_por_pagar), align: 'right', color: (row.cuentas_por_pagar || 0) > 0 ? COLORES.peligro : COLORES.primario },
        String(row.riesgo || '-').toUpperCase(),
        row.principal_pendiente || '-',
      ], widths, false, idx % 2 === 0);
    });

    footer(doc, doc.bufferedPageRange().count);
    doc.end();
  });
}

module.exports = {
  generarDiarioCombinado,
  generarEstadoResultados,
  generarReporteITBMS,
  generarBalanceComprobacion,
  generarMayorCuenta,
  generarMayorGeneral,
  generarRevisionCierre,
  generarCierresClientes,
  generarAntiguedadSaldos,
  generarConciliacionBancaria,
  generarPaqueteCierreCPA,
  generarResumenMensualAnual,
};
