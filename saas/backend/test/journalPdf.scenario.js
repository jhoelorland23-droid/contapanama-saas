const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const pdfText = buffer => execFileSync(process.env.CONTAPANAMA_PYTHON || 'python', ['-X', 'utf8', '-c',
  'import sys,io; from pypdf import PdfReader; r=PdfReader(io.BytesIO(sys.stdin.buffer.read())); sys.stdout.write("\\f".join(p.extract_text(extraction_mode="layout") for p in r.pages))'],
  { input: buffer, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).normalize('NFD').replace(/\p{M}/gu, '');

module.exports = async function journalPdfScenario({ request, requestRaw, authHeaders, check, outputDirectory }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const reportPath = '/api/reportes/libro-diario';
  for (const query of ['', '?periodo=2061-13', '?anio=2061&periodo=2061-01', '?anio=2061&tipo=ingreso', '?anio[]=2061']) {
    await assert.rejects(requestRaw(reportPath + query, { headers: authHeaders }), /422/);
  }
  await assert.rejects(requestRaw(reportPath + '?anio=2061'), /401/);
  const client = await send('POST', '/api/clientes', { nombre: 'QA Diario Empresa A', tipo: 'natural', ruc: 'QA-DIARIO-A' });
  const otherClient = await send('POST', '/api/clientes', { nombre: 'QA Diario Empresa B', tipo: 'natural', ruc: 'QA-DIARIO-B' });
  const payload = { cliente_id: client.id, fecha: '2061-01-02', tipo: 'ingreso', descripcion: 'QA Enero original',
    monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' };
  const original = await send('POST', '/api/transacciones', payload);
  const revision = (await read(`/api/transacciones/${original.id}/revision`)).revision;
  await send('PUT', '/api/transacciones/' + original.id, { monto: 200, revision_esperada: revision, motivo_ajuste: 'QA correccion de base contra soporte' });
  await send('POST', '/api/transacciones', { ...payload, fecha: '2061-02-01', tipo: 'gasto', descripcion: 'QA Febrero gasto', monto: 25 });
  const december = await send('POST', '/api/transacciones', { ...payload, fecha: '2061-12-31', descripcion: 'QA Diciembre cierre', monto: 80 });
  const foreign = await send('POST', '/api/transacciones', { ...payload, cliente_id: otherClient.id, descripcion: 'QA Otra empresa', monto: 50 });
  await send('POST', `/api/transacciones/${original.id}/pagos`, { fecha: '2061-03-01', importe: 50,
    metodo_pago: 'efectivo', idempotencia: randomUUID() });
  const entries = (await read(`/api/contabilidad/asientos?anio=2061&cliente_id=${client.id}`)).data;
  assert.equal(entries.length, 6);
  const sum = entries.flatMap(e => e.lineas).reduce((total, line) => total + Number(line.debe), 0);
  assert.equal(sum, 555);
  const cases = [
    ['mensual', `periodo=2061-01&cliente_id=${client.id}`, 3, '400.00'],
    ['anual', `anio=2061&cliente_id=${client.id}`, 6, '555.00'],
    ['cartera', 'anio=2061', 7, '605.00'],
    ['vacio', `periodo=2061-04&cliente_id=${client.id}`, 0, '0.00'],
  ];
  for (const [name, scope, count, total] of cases) {
    const response = await requestRaw(reportPath + '?' + scope, { headers: authHeaders });
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.match(response.headers.get('content-disposition'), /libro-diario-/);
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = pdfText(buffer);
    assert(text.includes(`Asientos: ${count}`));
    assert(text.includes(total));
    const totalLine = text.split('\n').find(line => line.includes('Total de movimientos del periodo'));
    assert.equal(totalLine?.split(total).length - 1, 2, 'Both period totals must match the independently expected movements');
    assert(text.includes('Huella SHA-256:'));
    assert(text.includes('QA Diario Empresa A'));
    if (name !== 'vacio') {
      assert(text.includes('Reversa del #'));
      assert(text.includes(original.id));
    }
    if (name === 'anual' || name === 'cartera') assert(text.includes(december.id));
    else assert(!text.includes(december.id));
    if (name === 'cartera') assert(text.includes(foreign.id) && text.includes('QA Diario Empresa B'));
    else assert(!text.includes(foreign.id) && !text.includes('QA Diario Empresa B'));
    const pages = text.split('\f').filter(page => page.trim());
    pages.forEach((page, i) => assert(page.includes(`Pagina ${i + 1} de ${pages.length}`)));
    if (outputDirectory) {
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.writeFileSync(path.join(outputDirectory, `libro-${name}.pdf`), buffer);
    }
  }
  await assert.rejects(requestRaw(reportPath + '?anio=2061&cliente_id=' + randomUUID(), { headers: authHeaders }), /404/);
  assert.deepEqual((await read(`/api/contabilidad/asientos?anio=2061&cliente_id=${client.id}`)).data, entries);
  check('journal PDF monthly/annual/portfolio/empty scopes retain originals, corrections, payments, entity isolation and exact totals');
};

module.exports.pdfText = pdfText;
