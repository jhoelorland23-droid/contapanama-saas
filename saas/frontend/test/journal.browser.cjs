const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require(process.env.CONTAPANAMA_PLAYWRIGHT || 'playwright');
const { pdfText } = require('../../backend/test/journalPdf.scenario');

async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-journal-browser-'));
  const out = process.env.CONTAPANAMA_JOURNAL_BROWSER_QA_OUTPUT || path.resolve(__dirname, '../../outputs/local-journal-qa');
  fs.mkdirSync(out, { recursive: true });
  const reviewFile = path.resolve(__dirname, '../../backend/.local-data/contapanama-state.json');
  const digest = () => createHash('sha256').update(fs.readFileSync(reviewFile)).digest('hex');
  const beforeReview = digest();
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.resolve(__dirname, '../../backend/server.local.js')], {
    cwd: path.resolve(__dirname, '../../backend'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
      CONTAPANAMA_LOCAL_DATA_DIR: temp, CONTAPANAMA_LOCAL_PERSISTENCE: 'on' },
  });
  let serverOutput = '', browser, page, token = '', shuttingDown = false;
  const routes = new Set(), routeErrors = [], pageErrors = [];
  const checks = [];
  const check = name => { checks.push(name); console.log('PASS ' + name); };
  server.stdout.on('data', data => { serverOutput += data; });
  server.stderr.on('data', data => { serverOutput += data; });
  const api = async (url, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    assert(response.ok, JSON.stringify(data));
    return data;
  };
  const disk = () => JSON.parse(fs.readFileSync(path.join(temp, 'contapanama-state.json'), 'utf8'));
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, serverOutput);
    token = (await api('/api/auth/login', { email: 'admin@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD })).token;
    browser = await chromium.launch({ headless: true, channel: process.env.CONTAPANAMA_BROWSER_CHANNEL || undefined });
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', error => pageErrors.push(error.message));
    let oldServer = true, loseApproval = true, approvalCount = 0, oldCorrectionServer = true, loseCorrection = true;
    await page.route('**/api/**', route => {
      const pending = (async () => {
        try {
          const url = new URL(route.request().url());
          if (oldServer && url.pathname === '/api/contabilidad/libro') {
            await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Ruta no encontrada' }) });
            return;
          }
          if (oldCorrectionServer && /\/api\/transacciones\/[^/]+\/revision$/.test(url.pathname)) {
            await route.fulfill({ status: 404, json: { error: 'Ruta no encontrada' } });
            return;
          }
          const response = await route.fetch({ url: base + url.pathname + url.search, timeout: 10000 });
          if (url.pathname === '/api/contabilidad/libro/incorporar') {
            approvalCount++;
            if (loseApproval && response.status() === 200) { loseApproval = false; await route.abort('failed'); return; }
          }
          if (loseCorrection && route.request().method() === 'PUT' && /^\/api\/transacciones\/[^/]+$/.test(url.pathname) && response.status() === 200) {
            loseCorrection = false; await route.abort('failed'); return;
          }
          await route.fulfill({ response });
        } catch (error) {
          if (shuttingDown && /already handled|Target.*closed|disposed/i.test(error.message)) return;
          routeErrors.push({ phase: shuttingDown ? 'shutdown' : 'running',
            path: new URL(route.request().url()).pathname, message: error.message.split('\n')[0] });
          await route.abort('failed').catch(() => {});
        }
      })();
      routes.add(pending);
      pending.finally(() => routes.delete(pending));
      return pending;
    });
    await page.goto(process.env.CONTAPANAMA_WEB_URL || 'http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Usar demo', exact: true }).click();
    await page.getByRole('button', { name: 'Contabilidad', exact: true }).click();
    await page.getByText('Actualizaci\u00f3n del servidor pendiente', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Revisar libro', exact: true }).count(), 0);
    assert(await page.getByRole('button', { name: 'PDF libro diario', exact: true }).isDisabled());
    check('older server remains usable and does not pretend to have an incorporated book');
    oldServer = false;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar libro', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisi\u00f3n del libro contable', exact: true });
    const confirm = dialog.getByRole('button', { name: 'Confirmar incorporaci\u00f3n', exact: true });
    await confirm.waitFor();
    assert(await confirm.isDisabled());
    assert(Number(await confirm.evaluate(el => getComputedStyle(el).opacity)) < 1);
    assert.equal(disk().asientos_contables.length, 0);
    await page.screenshot({ path: path.join(out, 'revision-libro-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    assert(await dialog.getByRole('table').evaluate(el => el.scrollWidth <= el.clientWidth));
    await confirm.scrollIntoViewIfNeeded();
    const confirmBounds = await confirm.boundingBox();
    assert(confirmBounds.y >= 0 && confirmBounds.y + confirmBounds.height <= 844);
    await page.screenshot({ path: path.join(out, 'revision-libro-mobile.png') });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal((await api('/api/contabilidad/libro')).estado, 'pendiente_revision');
    assert.equal(disk().asientos_contables.length, 0);
    check('review fits desktop/mobile; confirmation is unchecked and cancel leaves history untouched');

    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole('button', { name: 'Revisar libro', exact: true }).click();
    await dialog.getByRole('checkbox').check();
    await confirm.click();
    await dialog.getByRole('alert').waitFor();
    const published = await api('/api/contabilidad/libro');
    assert.equal(published.estado, 'incorporado');
    assert.equal(disk().libros_contables.length, 1);
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    await dialog.getByRole('checkbox').check();
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Libro incorporado', { exact: true }).waitFor();
    assert.equal(approvalCount, 2);
    assert.equal(disk().asientos_contables.length, published.total_asientos);
    assert.equal(disk().audit_events.filter(e => e.accion === 'libro_incorporado').length, 1);
    check('lost approval response can be retried without duplicating the book or its audit');

    await page.locator('input[type="month"]').fill('2025-03');
    await page.getByText('Folio #000001 \u00b7 Versi\u00f3n 1', { exact: true }).first().waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const downloadPending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const download = await downloadPending;
    const csvPath = path.join(out, 'diario-publicado.csv');
    await download.saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, 'utf8');
    assert(csv.includes('numero') && csv.includes('asiento_id') && csv.includes('rectifica_id'));
    assert(csv.includes(disk().asientos_contables[0].id));
    check('published numbers and source identifiers are visible and included in the CSV');

    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF libro diario', exact: true }).click();
    const pdf = await pdfDownload;
    assert.equal(pdf.suggestedFilename(), 'libro-diario-2025-03-cartera.pdf');
    const pdfPath = path.join(out, 'libro-desde-navegador.pdf');
    await pdf.saveAs(pdfPath);
    const pdfContent = pdfText(fs.readFileSync(pdfPath));
    assert(pdfContent.includes('2025-03-01 a 2025-03-31'));
    assert(pdfContent.includes(disk().asientos_contables[0].id));
    const pdfPages = pdfContent.split('\f').filter(content => content.trim());
    pdfPages.forEach((content, i) => assert(content.includes(`Pagina ${i + 1} de ${pdfPages.length}`)));
    check('journal PDF download uses the selected month and published entry identifiers');

    const client = (await api('/api/clientes')).data[0];
    const doc = await api('/api/transacciones', { cliente_id: client.id, fecha: '2025-03-15', tipo: 'ingreso',
      descripcion: 'QA correccion visible', monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' });
    const original = disk().asientos_contables.find(e => e.transaccion_id === doc.id);
    await require('./documentCorrection.scenario.cjs')({ page, api, disk, doc, out, check,
      enableCorrectionServer: () => { oldCorrectionServer = false; } });
    await page.getByRole('button', { name: 'Contabilidad', exact: true }).click();
    await page.locator('input[type="month"]').fill('2025-03');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    const originalFolio = disk().folios_libro.find(folio => folio.asiento_id === original.id).numero;
    const reverse = page.locator(`a[href="#asiento-${original.id}"]`).first();
    await reverse.waitFor();
    assert.equal(await reverse.innerText(), 'Reversa del #' + String(originalFolio).padStart(6, '0'));
    await reverse.click();
    assert.equal(await page.locator('#asiento-' + original.id).count(), 1);
    await page.locator('#asiento-' + original.id).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => window.scrollX), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'diario-correccion.png') });
    assert.equal(disk().asientos_contables.filter(e => e.transaccion_id === doc.id).length, 5);
    assert.equal(digest(), beforeReview);
    check('correction links to its preserved original; real review data file is unchanged');
  } finally {
    // Let in-flight fixture reads finish before closing their browser transport.
    while (routes.size) await Promise.all([...routes]);
    shuttingDown = true;
    if (browser) await browser.close();
    await Promise.all([...routes]);
    if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('contapanama-journal-browser-'));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(pageErrors, []);
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ passed: true, checks, finished_at: new Date().toISOString() }, null, 2));
  console.log('Journal browser passed with clean shutdown.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
