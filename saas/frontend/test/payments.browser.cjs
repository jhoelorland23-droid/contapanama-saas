const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require(process.env.CONTAPANAMA_PLAYWRIGHT || 'playwright');

async function run() {
  const sqlMode = process.env.CONTAPANAMA_DISPOSABLE_PG_TEST === '1';
  let base, child, dataDir, log = '';
  if (sqlMode) {
    const target = new URL(process.env.CONTAPANAMA_PG_QA_API);
    assert.equal(target.protocol, 'http:');
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.pathname, '/');
    base = target.origin;
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.db, 'contapanama_qa');
    assert.equal(health.env, 'test');
  } else {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-payments-browser-'));
    child = spawn(process.execPath, [path.resolve(__dirname, '../../backend/server.local.js')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
        CONTAPANAMA_LOCAL_DATA_DIR: dataDir }, windowsHide: true, stdio: ['ignore','pipe','pipe'],
    });
    child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
    base = `http://127.0.0.1:${port}`;
  }
  let browser, page;
  let shuttingDown = false;
  const routingErrors = [];
  const inFlightRoutes = new Set();
  const out = sqlMode ? path.resolve(process.env.CONTAPANAMA_POSTGRES_QA_OUTPUT) : path.resolve(process.env.CONTAPANAMA_PAYMENT_BROWSER_QA_OUTPUT || path.join(__dirname, '../../outputs/payment-ledger-qa'));
  fs.mkdirSync(out, { recursive: true });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(base+'/health')).ok; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, log);
    let token = '';
    const api = async (url, body) => {
      const r = await fetch(base+url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined });
      const data = await r.json(); assert(r.ok, JSON.stringify(data)); return data;
    };
    const credentials = sqlMode ? { email: `qa-sql-browser-${randomUUID()}@example.com`, password: process.env.CONTAPANAMA_QA_PASSWORD }
      : { email: 'admin@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD };
    token = (await api(sqlMode ? '/api/auth/register' : '/api/auth/login', { nombre: 'QA navegador SQL', ...credentials })).token;
    const period = new Date().toISOString().slice(0,7);
    const client = await api('/api/clientes', { nombre: 'QA banco navegador', tipo: 'natural', ruc: 'QA-UI-BANK' });
    const account = await api('/api/cuentas-bancarias', { cliente_id:client.id,nombre:'Operativa navegador',banco:'Banco General',
      numero:'123456781234',tipo:'corriente',moneda:'USD',idempotencia:randomUUID() });
    const invoice = await api('/api/transacciones', { cliente_id: client.id, tipo: 'ingreso', fecha: period+'-01', descripcion: 'QA navegador abonos',
      monto: 1000, itbms: 70, banco: 'Banco General', categoria_contable: 'honorarios', estado_pago: 'pendiente' });
    const bank = await api('/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id:account.id,idempotencia:randomUUID(), tipo: 'credito', fecha: period+'-05',
      descripcion: 'QA deposito de abono', monto: 400, banco: 'Banco General', referencia: 'UI-400' });
    const endpoint = `/api/transacciones/${invoice.id}/pagos`;
    browser = await chromium.launch({ headless: true, channel: process.env.CONTAPANAMA_BROWSER_CHANNEL || undefined });
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    let loseResponse = true, loseBankResponse = true; const keys = [], bankKeys = [];
    await page.route('**/api/**', route => {
      const pending = (async () => {
      try {
        const url = new URL(route.request().url());
        // Only retry reset connections for read-only requests; never replay a write in the proxy.
        const response = await route.fetch({ url: base + url.pathname + url.search, timeout: 10000,
          maxRetries: route.request().method() === 'GET' ? 2 : 0 });
        if (url.pathname === endpoint && route.request().method() === 'POST') {
          keys.push(route.request().postDataJSON().idempotencia);
          if (loseResponse && response.status() === 201) { loseResponse = false; await route.abort('failed'); return; }
        }
        if (url.pathname === '/api/movimientos-bancarios/bulk' && route.request().method() === 'POST') {
          bankKeys.push(route.request().postDataJSON().idempotencia);
          if(loseBankResponse && response.status()===201){loseBankResponse=false;await route.abort('failed');return;}
        }
        await route.fulfill({ response });
      } catch (error) {
        // Removing routes may finish an in-flight request before its fetch returns.
        if (shuttingDown && /Route is already handled|Target.*closed|disposed|Request context disposed/i.test(error.message)) return;
        routingErrors.push(error.message.replace(/Bearer\s+[^\s\\]+/g, 'Bearer [redacted]'));
        await route.abort('failed').catch(() => {});
      }
      })();
      inFlightRoutes.add(pending);
      pending.finally(() => inFlightRoutes.delete(pending));
      return pending;
    });
    await page.goto(process.env.CONTAPANAMA_WEB_URL || 'http://localhost:5173');
    if (sqlMode) {
      await page.getByLabel('Correo electr\u00f3nico').fill(credentials.email);
      await page.getByLabel('Contrase\u00f1a', { exact: true }).fill(credentials.password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Usar demo', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Diario Contable', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: invoice.descripcion });
    await row.getByRole('button', { name: 'Cobrar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByLabel('Importe del abono');
    await amount.waitFor(); assert.equal(await amount.inputValue(), '1070.00');
    assert.equal(await dialog.getByLabel('Fecha del cobro').inputValue(), '');
    await amount.fill('400');
    await dialog.getByLabel('Fecha del cobro').fill(period+'-05');
    await dialog.getByLabel('Cuenta bancaria del pago').selectOption(account.id);
    await dialog.getByLabel('Referencia del pago').fill('UI-400');
    await dialog.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal((await api(endpoint)).pagos.length, 1);
    assert.equal(await amount.inputValue(), '400');
    await amount.fill('399');
    await dialog.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Ese identificador ya corresponde a otro pago.' }).waitFor();
    assert.equal((await api(endpoint)).pagos.length, 1);
    await amount.fill('400');
    await dialog.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
    await dialog.getByRole('alert').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#payment-amount')?.value === '670.00');
    assert.equal(keys.length, 3); assert.equal(keys[0], keys[1]); assert.equal(keys[0], keys[2]);
    assert.equal((await api(endpoint)).pagos.length, 1);
    await page.screenshot({ path: path.join(out, 'abono-desktop.png') });
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('button', { name: 'Conciliaci\u00f3n', exact: true }).click();
    await page.locator('label').filter({ hasText: invoice.descripcion }).getByRole('radio').check();
    await page.locator('label').filter({ hasText: 'QA deposito de abono' }).getByRole('radio').check();
    await page.getByRole('button', { name: 'Conciliar selecci\u00f3n', exact: true }).click();
    await page.locator('label').filter({ hasText: invoice.descripcion }).waitFor({ state: 'hidden' });
    const matched = await api(endpoint);
    assert.equal(matched.pagos[0].movimiento_bancario_id, bank.id);
    assert.equal(matched.pagos[0].conciliado, true); assert.equal(matched.estado_pago, 'parcial');
    await page.getByRole('button', { name: 'Diario Contable', exact: true }).click();
    await row.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await amount.waitFor();
    await dialog.getByLabel('Fecha del cobro').fill(period+'-08');
    await dialog.getByLabel('M\u00e9todo de pago').selectOption('efectivo');
    await dialog.getByLabel('Referencia del pago').fill('CAJA-670');
    await dialog.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
    await amount.waitFor({ state: 'hidden' });
    assert.equal((await api(endpoint)).saldo_pendiente, 0);
    await dialog.getByRole('button', { name: 'Anular registro', exact: true }).click();
    await dialog.getByLabel('Fecha de anulaci\u00f3n').fill(period+'-09');
    await dialog.getByLabel('Motivo', { exact: true }).fill('Cobro de caja duplicado');
    await dialog.getByRole('button', { name: 'Confirmar anulaci\u00f3n', exact: true }).click();
    await amount.waitFor();
    const final = await api(endpoint);
    assert.equal(final.saldo_pendiente, 670); assert.equal(final.pagos.length, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    assert(await dialog.getByLabel('Saldos del documento').evaluate(el => [...el.querySelectorAll('strong')].every(value => {
      const range = document.createRange(); range.selectNodeContents(value); return range.getClientRects().length === 1;
    })));
    await page.screenshot({ path: path.join(out, 'abonos-mobile.png') });
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Diario Contable', exact: true }).click();
    await row.getByRole('button', { name: 'Cobrar', exact: true }).waitFor();
    await require('./bankReconciliation.browser.scenario.cjs')({page,api,client,account,period,out,bankKeys});
    await require('./bankSettlement.browser.scenario.cjs')({page,api,client,account,period,out});
    if (sqlMode) await require('./ledgerSql.browser.scenario.cjs')({page,api,client,period,out});
    assert.deepEqual(errors, []);
  } finally {
    shuttingDown = true;
    if (page && !page.isClosed()) await page.goto('about:blank', { timeout: 10000 });
    await Promise.all([...inFlightRoutes]);
    if (browser) await browser.close();
    if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
    if (dataDir) {
      const resolved = path.resolve(dataDir);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('contapanama-payments-browser-')) throw new Error('Unexpected test directory');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  assert.deepEqual(routingErrors, [], 'Unexpected browser API routing errors');
  console.log(`Payment browser passed (${sqlMode ? 'PostgreSQL' : 'local'}): real isolated API, lost response/retry without duplicate, partial bank reconciliation, cash completion, reversal, reload, desktop/mobile dialog and clean shutdown`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
