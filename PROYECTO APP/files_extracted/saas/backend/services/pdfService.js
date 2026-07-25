/**
 * Servicio de generación de PDFs profesionales con pdfkit
 * Genera: diario combinado, estado de resultados, ITBMS, reporte por cliente
 */
const PDFDocument = require('pdfkit');

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
const formatFecha = (f) => new Date(f).toLocaleDateString('es-PA', { year:'numeric', month:'long', day:'numeric' });

/** Dibuja el encabezado común de todos los PDFs */
function header(doc, titulo, subtitulo) {
  // Barra superior
  doc.rect(0, 0, doc.page.width, 72).fill(COLORES.primario);

  // Logo texto
  doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold')
     .text('ContaPanamá', 40, 22);
  doc.fontSize(10).fillColor('#94a3b8').font('Helvetica')
     .text('Sistema Contable Profesional', 40, 46);

  // Título del reporte (derecha)
  doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold')
     .text(titulo, 40, 22, { align: 'right', width: doc.page.width - 80 });
  doc.fontSize(9).fillColor('#94a3b8').font('Helvetica')
     .text(subtitulo, 40, 42, { align: 'right', width: doc.page.width - 80 });

  doc.moveDown(3);
}

/** Dibuja el pie de página */
function footer(doc, pageNum) {
  const y = doc.page.height - 40;
  doc.fontSize(8).fillColor(COLORES.gris).font('Helvetica')
     .text(`Generado el ${formatFecha(new Date())} · ContaPanamá SaaS · Página ${pageNum}`,
           40, y, { align: 'center', width: doc.page.width - 80 });
  doc.moveTo(40, y - 8).lineTo(doc.page.width - 40, y - 8)
     .strokeColor(COLORES.borde).stroke();
}

/** Fila de tabla con colores alternados */
function tableRow(doc, y, cols, widths, isHeader = false, isEven = false) {
  const rowH = 22;
  const startX = 40;

  // Fondo
  if (isHeader) {
    doc.rect(startX, y, doc.page.width - 80, rowH).fill(COLORES.primario);
  } else if (isEven) {
    doc.rect(startX, y, doc.page.width - 80, rowH).fill(COLORES.grisSuave);
  }

  let x = startX + 6;
  doc.fontSize(isHeader ? 8 : 9)
     .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
     .fillColor(isHeader ? '#ffffff' : COLORES.primario);

  cols.forEach((col, idx) => {
    const w = widths[idx];
    const align = (typeof col === 'object' && col.align) ? col.align : 'left';
    const text  = (typeof col === 'object') ? col.text : String(col);
    const color = (typeof col === 'object' && col.color) ? col.color : (isHeader ? '#ffffff' : COLORES.primario);

    doc.fillColor(color).text(text, x, y + 7, { width: w - 4, align, lineBreak: false });
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
    const widths = [70, 200, 110, 65, 65, 55];
    const headers = ['Fecha', 'Descripción', 'Cliente', 'Monto', 'ITBMS', 'Tipo'];

    for (const entrada of data.entradas) {
      // Encabezado de fecha
      if (y > doc.page.height - 120) { doc.addPage(); footer(doc, doc.bufferedPageRange().count); y = 60; }
      doc.rect(40, y, doc.page.width - 80, 18).fill('#dbeafe');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af')
         .text(`📅  ${formatFecha(entrada.fecha)}   —   Debe: ${fmt(entrada.debe)}   |   Haber: ${fmt(entrada.haber)}`,
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
          a.cliente_nombre || '—',
          { text: fmt(a.monto), align: 'right', color: mColor },
          { text: fmt(a.itbms), align: 'right', color: COLORES.gris },
          { text: a.tipo.toUpperCase(), align: 'center', color: mColor },
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
    for (const t of data.ingresos) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.primario)
         .text(t.descripcion, 40, y, { width: lw - 80 })
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
    for (const t of data.gastos) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORES.primario)
         .text(t.descripcion, 40, y, { width: lw - 80 })
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

module.exports = { generarDiarioCombinado, generarEstadoResultados, generarReporteITBMS };
