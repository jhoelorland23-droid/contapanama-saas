const PDFDocument = require('pdfkit');

const amount = value => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const number = value => '#' + String(value).padStart(6, '0');
const types = { documento: 'Documento', cobro: 'Cobro', pago: 'Pago', reversa_pago: 'Anulaci\u00f3n de pago',
  reversa_cobro: 'Anulaci\u00f3n de cobro', reversa_ajuste: 'Correcci\u00f3n' };

function generarLibroDiario(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40, bufferPages: true,
      info: { Title: data.alcance === 'cliente' ? 'Libro diario' : 'Diario de cartera', Author: 'ContaPanama' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = 40, width = 532, bottom = 716;
    const columns = [62, 282, 94, 94];
    let y = 0, context = '', inTable = false;
    const font = (bold = false, size = 9) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#14252b');
    const wrap = (text, maxWidth, bold = false, size = 9) => {
      font(bold, size);
      const lines = [];
      for (const paragraph of String(text ?? '').replace(/\r/g, '').split('\n')) {
        let line = '';
        for (const char of paragraph) {
          if (line && doc.widthOfString(line + char) > maxWidth) {
            const breakAt = line.lastIndexOf(' ');
            if (breakAt > 0) { lines.push(line.slice(0, breakAt)); line = line.slice(breakAt + 1); }
            else { lines.push(line); line = ''; }
          }
          line += char;
        }
        lines.push(line);
      }
      return lines;
    };
    const cell = (text, x, top, cellWidth, { right = false, bold = false, size = 9 } = {}) => {
      font(bold, size);
      if (right && doc.widthOfString(text) > cellWidth) doc.fontSize(size * cellWidth / doc.widthOfString(text));
      doc.text(text, x, top, { width: cellWidth, height: size * 1.5, align: right ? 'right' : 'left', lineBreak: false });
    };
    const tableHeader = () => {
      doc.rect(left, y, width, 22).fill('#e8eff0');
      let x = left;
      ['Cuenta', 'Nombre y detalle', 'Debe (USD)', 'Haber (USD)'].forEach((label, i) => {
        cell(label, x + 5, y + 7, columns[i] - 10, { bold: true, right: i > 1, size: 8 }); x += columns[i];
      });
      y += 26;
    };
    const pageHeader = () => {
      cell('ContaPanam\u00e1', left, 30, 190, { bold: true, size: 16 });
      cell(data.alcance === 'cliente' ? 'Libro diario' : 'Diario de cartera', 240, 32, 332, { bold: true, right: true, size: 14 });
      cell(`${data.desde} a ${data.hasta}  |  USD`, left, 59, width, { size: 9 });
      cell(data.alcance === 'cliente' ? 'Extracto de asientos publicados' : 'Control por cliente; no consolida una sola entidad', left, 75, width, { size: 8 });
      cell(context, left, 92, width, { size: 8 });
      doc.moveTo(left, 107).lineTo(left + width, 107).strokeColor('#becdd0').stroke();
      y = 119;
      if (inTable) tableHeader();
    };
    const room = height => {
      if (y + height > bottom) { doc.addPage(); pageHeader(); }
    };
    const paragraph = (text, bold = false, size = 9) => {
      for (const line of wrap(text, width, bold, size)) {
        room(size + 6); cell(line, left, y, width, { bold, size }); y += size + 4;
      }
      y += 4;
    };
    const totals = (label, debe, haber) => {
      room(30);
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#becdd0').stroke();
      cell(label, left + 5, y + 8, 334, { bold: true, size: 8 });
      cell(amount(debe), left + 349, y + 8, 84, { bold: true, right: true, size: 8 });
      cell(amount(haber), left + 443, y + 8, 84, { bold: true, right: true, size: 8 });
      y += 31;
    };
    pageHeader();
    paragraph(`Per\u00edodo: ${data.periodo} | Asientos: ${data.total_asientos}`, true);
    if (!data.total_asientos) paragraph('Sin asientos publicados en el per\u00edodo seleccionado.');
    for (const [index, section] of data.secciones.entries()) {
      inTable = false;
      context = section.cliente_id ? `Cliente ID: ${section.cliente_id}` : 'Sin cliente asignado';
      if (index) { doc.addPage(); pageHeader(); }
      paragraph(section.cliente_nombre, true, 12);
      paragraph(`RUC: ${section.ruc || 'Pendiente de confirmar'}`);
      if (section.libro_entidad_id) paragraph(`${section.provisional ? 'Serie provisional sin cliente' : 'Libro del cliente'}: ${section.libro_entidad_id}`, false, 8);
      for (const entry of section.asientos) {
        const entryLabel = entry.numero_libro ? 'Folio ' + number(entry.numero_libro) : 'Registro ' + number(entry.numero);
        context = `${entry.fecha} | ${entryLabel} | Cliente ID: ${section.cliente_id || 'sin asignar'}`;
        const info = [
          [`${entryLabel} | ${entry.fecha} | ${types[entry.tipo_asiento] || entry.tipo_asiento} | Versi\u00f3n ${entry.revision}`, true, 9],
          [entry.descripcion, false, 9],
          ...(entry.rectifica_id ? [[`Reversa del ${number(entry.rectifica_numero_libro || entry.rectifica_numero)} | ID: ${entry.rectifica_id}`, true, 8]] : []),
          ...(entry.numero_libro ? [[`Registro de cartera: ${number(entry.numero)} | Libro: ${entry.libro_entidad_id}`, false, 8]] : []),
          [`Asiento ID: ${entry.id}`, false, 8],
          ...(entry.transaccion_id ? [[`Documento ID: ${entry.transaccion_id}`, false, 8]] : []),
          ...(entry.pago_id ? [[`Pago ID: ${entry.pago_id}`, false, 8]] : []),
          [`Origen: ${entry.origen} | Motivo: ${entry.motivo || 'Sin motivo registrado'}`, false, 8],
        ];
        const lineDetails = entry.lineas.map(line => ({ line,
          details: wrap(`${line.cuenta_nombre}${line.descripcion ? ' - ' + line.descripcion : ''}`, columns[1] - 10, false, 8.5),
          codes: wrap(line.cuenta_codigo, columns[0] - 10, false, 8.5) }));
        // Keep ordinary entries together; exceptionally long support text can span pages.
        const entryHeight = info.reduce((height, [text, bold, size]) => height + wrap(text, width, bold, size).length * (size + 4) + 4, 0) +
          lineDetails.reduce((height, row) => height + Math.max(row.details.length, row.codes.length) * 13 + 7, 0) + 65;
        room(entryHeight <= bottom - 119 ? entryHeight : 100);
        info.forEach(args => paragraph(...args));
        room(45); inTable = true; tableHeader();
        for (const { line, details, codes } of lineDetails) {
          const count = Math.max(details.length, codes.length);
          for (let i = 0; i < count; i++) {
            room(16);
            cell(codes[i] || '', left + 5, y, columns[0] - 10, { size: 8.5 });
            cell(details[i] || '', left + columns[0] + 5, y, columns[1] - 10, { size: 8.5 });
            if (i === count - 1) {
              cell(line.debe ? amount(line.debe) : '-', left + 349, y, 84, { right: true, size: 8 });
              cell(line.haber ? amount(line.haber) : '-', left + 443, y, 84, { right: true, size: 8 });
            }
            y += 13;
          }
          y += 7;
        }
        const sum = field => entry.lineas.reduce((total, line) => total + Math.round(line[field] * 100), 0) / 100;
        totals(`Total ${entryLabel.toLowerCase()}`, sum('debe'), sum('haber'));
        inTable = false; y += 8;
      }
      if (!section.asientos.length) paragraph('Sin asientos publicados en el per\u00edodo seleccionado.');
      totals('Total del cliente', section.total_debe, section.total_haber);
    }
    context = 'Resumen del extracto'; inTable = false;
    totals('Total de movimientos del per\u00edodo', data.total_debe, data.total_haber);
    paragraph(`Diferencia: ${amount(data.total_debe - data.total_haber)} USD | Asientos: ${data.total_asientos}`, true);
    paragraph('Incluye originales y reversos. Los totales son movimientos, no ingresos ni utilidad.', false, 8);
    paragraph('Extracto interno para revisi\u00f3n CPA; no constituye certificaci\u00f3n ni declaraci\u00f3n fiscal.', false, 8);
    paragraph(`Libro ID: ${data.libro_id}`, false, 8);
    paragraph(`Huella SHA-256: ${data.fingerprint}`, false, 8);
    paragraph(`Generado: ${data.generado_at}`, false, 8);
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.moveTo(left, 735).lineTo(left + width, 735).strokeColor('#becdd0').stroke();
      cell(`Libro ${data.libro_id}`, left, 746, 390, { size: 7 });
      cell(`P\u00e1gina ${i + 1} de ${pages.count}`, 440, 746, 132, { right: true, size: 8 });
    }
    doc.end();
  });
}

module.exports = { generarLibroDiario };
