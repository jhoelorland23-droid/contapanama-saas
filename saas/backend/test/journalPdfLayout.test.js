const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { journalPlan } = require('../services/journalLedger');
const { journalReport } = require('../services/journalReport');
const { generarLibroDiario } = require('../services/journalPdf');
const { planRegistry, attachFolios } = require('../services/entityBooks');
const { pdfText } = require('./journalPdf.scenario');

(async () => {
  const uid = randomUUID(), cid = randomUUID(), parent = randomUUID();
  const detail = 'Soporte detallado de la operacion. '.repeat(100) + 'FINAL-DETALLE';
  const entries = journalPlan([{ id: randomUUID(), cliente_id: cid, fecha: '2061-01-02', tipo: 'ingreso',
    descripcion: detail, monto: 99999999999.99, itbms: 0, estado_pago: 'pendiente' }])
    .map(entry => ({ ...entry, numero: 27, usuario_id: uid, motivo: 'Motivo detallado de correccion. '.repeat(31) + 'FINAL-MOTIVO' }));
  const registry = planRegistry(uid, entries, [], [], parent);
  const data = journalReport({ book: { id: parent, usuario_id: uid }, entries: attachFolios(uid, entries, registry.books, registry.folios),
    entityBooks: registry.books, requireEntityBooks: true,
    clients: [{ id: cid, nombre: 'QA Descripcion extensa', ruc: 'QA-LAYOUT' }], scope: { anio: '2061', cliente_id: cid } });
  const buffer = await generarLibroDiario(data);
  const text = pdfText(buffer);
  const pages = text.split('\f').filter(page => page.trim());
  assert(pages.length >= 3);
  assert.equal((text.match(/FINAL-DETALLE/g) || []).length, 2, 'Document and line descriptions must both remain complete');
  assert(text.includes('99,999,999,999.99'));
  assert(text.includes('Total folio #000001'));
  assert(text.includes('Registro de cartera: #000027'));
  assert(!text.includes('Total asiento #000027'));
  assert.equal((text.match(/FINAL-MOTIVO/g) || []).length, 1, 'The complete correction reason must survive wrapping and pagination');
  pages.forEach((page, i) => {
    assert(page.includes(`Pagina ${i + 1} de ${pages.length}`));
    assert(page.includes('2061-01-01 a 2061-12-31'));
  });
  const output = process.env.CONTAPANAMA_LOCAL_JOURNAL_QA_OUTPUT;
  if (output) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'libro-descripcion-extensa.pdf'), buffer); }
  console.log('PASS long descriptions survive page breaks; repeated headers, page numbers and large amounts remain complete');
})().catch(error => { console.error(error); process.exitCode = 1; });
