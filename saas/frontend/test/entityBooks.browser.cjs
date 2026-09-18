const qaCredentials = require('../../backend/test/helpers/qaCredentials');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const bcrypt = require('../../backend/node_modules/bcryptjs');
const { chromium } = require(process.env.CONTAPANAMA_PLAYWRIGHT || 'playwright');
const { legacyEntityFixture } = require('../../backend/test/legacyEntityFixture');
const { pdfText } = require('../../backend/test/journalPdf.scenario');

async function run() {
  const backend = path.resolve(__dirname, '../../backend');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-entity-browser-'));
  const out = process.env.CONTAPANAMA_ENTITY_BROWSER_QA_OUTPUT || path.resolve(__dirname, '../../outputs/entity-books-qa');
  fs.mkdirSync(out, { recursive: true });
  const reviewFile = path.join(backend, '.local-data/contapanama-state.json');
  const digest = () => createHash('sha256').update(fs.readFileSync(reviewFile)).digest('hex');
  const reviewBefore = digest();
  const uid = randomUUID(), fixture = legacyEntityFixture(uid);
  const stateFile = path.join(temp, 'contapanama-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ ...fixture, usuarios: [{ id: uid, nombre: 'QA Folios CPA',
    email: 'admin@contapanama.pa', password_hash: bcrypt.hashSync(qaCredentials.password, 8), activo: true, rol: 'admin' }] }));
  const disk = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(backend, 'server.local.js')], {
    cwd: backend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
      CONTAPANAMA_LOCAL_DATA_DIR: temp, CONTAPANAMA_LOCAL_PERSISTENCE: 'on' },
  });
  let browser, page, serverOutput = '', lost = false, assignments = 0, stopping = false;
  const routes = new Set(), routeErrors = [], pageErrors = [], checks = [];
  const check = text => { checks.push(text); console.log('PASS ' + text); };
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  server.stderr.on('data', chunk => { serverOutput += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error(serverOutput);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, serverOutput);
    browser = await chromium.launch({ headless: true, channel: process.env.CONTAPANAMA_BROWSER_CHANNEL || undefined });
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/**', route => {
      const pending = (async () => {
        try {
          const url = new URL(route.request().url());
          const response = await route.fetch({ url: base + url.pathname + url.search, timeout: 15000 });
          if (url.pathname === '/api/contabilidad/libros-entidad/incorporar') {
            assignments++;
            if (!lost && response.status() === 200) { lost = true; await route.abort('failed'); return; }
          }
          await route.fulfill({ response });
        } catch (error) {
          if (stopping && /already handled|Target.*closed|disposed/i.test(error.message)) return;
          routeErrors.push({ path: new URL(route.request().url()).pathname, message: error.message.split('\n')[0] });
          await route.abort('failed').catch(() => {});
        }
      })();
      routes.add(pending); pending.finally(() => routes.delete(pending)); return pending;
    });
    await page.goto(process.env.CONTAPANAMA_WEB_URL || 'http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Correo electr\u00f3nico').fill('admin@contapanama.pa');
    await page.getByLabel('Contrase\u00f1a', { exact: true }).fill(qaCredentials.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Contabilidad', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar folios', exact: true }).waitFor();
    const originals = disk().asientos_contables;
    assert(await page.getByRole('button', { name: 'PDF libro diario', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Revisar folios', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisi\u00f3n de folios por cliente', exact: true });
    const confirm = dialog.getByRole('button', { name: 'Confirmar folios', exact: true });
    await confirm.waitFor();
    assert(await confirm.isDisabled());
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    assert.equal(await dialog.getByRole('table').getByRole('row').count(), 3);
    await page.screenshot({ path: path.join(out, 'revision-folios-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    const bounds = await dialog.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await confirm.scrollIntoViewIfNeeded();
    const buttonBounds = await confirm.boundingBox();
    assert(buttonBounds.y >= 0 && buttonBounds.y + buttonBounds.height <= 844);
    await page.screenshot({ path: path.join(out, 'revision-folios-mobile.png') });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal((disk().folios_libro || []).length, 0);
    assert.deepEqual(disk().asientos_contables, originals);
    check('legacy folio review fits desktop/mobile; consent starts unchecked and cancel does not change the published journal');

    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole('button', { name: 'Revisar folios', exact: true }).click();
    await dialog.getByRole('checkbox').check(); await confirm.click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(disk().folios_libro.length, 3);
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    assert(await confirm.isDisabled());
    await dialog.getByRole('checkbox').check(); await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('2 libros separados por cliente', { exact: true }).waitFor();
    assert.equal(assignments, 2);
    assert.deepEqual(disk().asientos_contables, originals);
    assert.equal(disk().audit_events.filter(event => event.accion === 'folios_cliente_incorporados').length, 1);
    check('lost assignment response can be retried after renewed consent without duplicate books, folios, entries or approval audit');

    await page.getByRole('button', { name: 'Anual', exact: true }).click();
    await page.getByLabel('A\u00f1o contable', { exact: true }).fill('2070');
    await page.locator('summary').filter({ hasText: 'Libros por cliente' }).click();
    await page.getByRole('button', { name: 'Ver libro de ' + fixture.clientes[0].nombre, exact: true }).click();
    await page.getByText('Registro de cartera #000010', { exact: false }).waitFor();
    assert.equal(await page.getByLabel('Cliente contable', { exact: true }).inputValue(), fixture.clientes[0].id);
    assert.equal(await page.locator('#asiento-' + fixture.asientos_contables[1].id).count(), 0);
    assert.equal(await page.locator('#asiento-' + fixture.asientos_contables[2].id).count(), 0);
    await page.screenshot({ path: path.join(out, 'libro-cliente-desktop.png'), fullPage: true });
    const getDownload = async (name, file) => {
      const waiting = page.waitForEvent('download');
      await page.getByRole('button', { name, exact: true }).click();
      const download = await waiting; const output = path.join(out, file);
      await download.saveAs(output); return fs.readFileSync(output);
    };
    const csv = (await getDownload('CSV', 'libro-cliente.csv')).toString('utf8');
    assert(csv.includes('folio_cliente') && csv.includes('libro_entidad_id'));
    assert(csv.includes(fixture.asientos_contables[0].id) && !csv.includes(fixture.asientos_contables[1].id));
    const text = pdfText(await getDownload('PDF libro diario', 'libro-cliente-navegador.pdf'));
    assert(text.includes('2070-01-01 a 2070-12-31'));
    assert(text.includes('Folio #000001') && text.includes('Total folio #000001'));
    assert(text.includes(fixture.clientes[0].nombre) && !text.includes(fixture.clientes[1].nombre));
    assert(!text.includes('Total asiento #000010'));
    check('client book directory selects the entity; annual journal, CSV and downloaded PDF retain only that client and year');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Contabilidad', exact: true }).click();
    await page.getByText('2 libros separados por cliente', { exact: true }).waitFor();
    assert.deepEqual(disk().asientos_contables, originals);
    assert.equal(digest(), reviewBefore);
    check('client book assignment survives browser reload; the real review data stays unchanged');
  } finally {
    while (routes.size) await Promise.all([...routes]);
    stopping = true;
    if (browser) await browser.close();
    await Promise.all([...routes]);
    if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('contapanama-entity-browser-'));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(routeErrors, []);
  fs.writeFileSync(path.join(out, 'entity-browser-results.json'), JSON.stringify({ passed: true, checks, finished_at: new Date().toISOString() }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
