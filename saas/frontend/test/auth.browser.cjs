const qaCredentials = require('./externalCredentials.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.CONTAPANAMA_PLAYWRIGHT || 'playwright');

async function run() {
  const browser = await chromium.launch({ headless: true, channel: process.env.CONTAPANAMA_BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  let loginRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth/login') loginRequests++;
  });
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.CONTAPANAMA_WEB_URL || 'http://localhost:5173';
  const out = path.resolve(__dirname, '../../outputs/access-qa');
  const sessionSaved = () => page.evaluate(() => Boolean(localStorage.getItem('cp_token')));
  const waitForApp = () => page.getByRole('button', { name: 'Centro CPA', exact: true }).waitFor();
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    if (process.env.CONTAPANAMA_EXPECT_DEV === '1') {
      assert.equal(await page.locator('script[src*="/@vite/client"]').count(), 1, 'Regression must exercise development rendering');
    }
    assert.deepEqual(errors, [], 'Login must render without ReferenceError');
    assert.equal(await page.getByLabel('Correo electr\u00f3nico').inputValue(), '');
    assert.equal(Boolean(await page.getByLabel('Contrase\u00f1a', { exact: true }).inputValue()), false);
    assert.equal(await sessionSaved(), false);
    assert.equal(loginRequests, 0, 'Fresh context must not log in automatically');
    assert.equal(await page.getByRole('button', { name: /demo/i }).count(), 0);
    assert.equal(/demo:/i.test(await page.locator('body').innerText()), false);
    assert.equal((await page.locator('body').innerText()).includes(qaCredentials.password), false);
    console.log('PASS: reviewDemo regression: blank credentials, no automatic login or demo password, no ReferenceError');
    await page.route('**/api/auth/login', route => route.fulfill({
      status: 401, json: { error: 'Credenciales incorrectas' },
    }));
    await page.getByLabel('Correo electr\u00f3nico').fill('incorrecto@example.com');
    await page.getByLabel('Contrase\u00f1a', { exact: true }).fill(qaCredentials.randomPassword());
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByText('Atenci\u00f3n: Credenciales incorrectas', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Tu sesi.*venci/).count(), 0);
    console.log('PASS: incorrect password shows credential error');
    await page.unroute('**/api/auth/login');
    await page.getByLabel('Correo electr\u00f3nico').fill('admin@contapanama.pa');
    await page.getByLabel('Contrase\u00f1a', { exact: true }).fill(qaCredentials.password);
    await page.getByLabel('Contrase\u00f1a', { exact: true }).press('Enter');
    await waitForApp();
    assert.equal(await sessionSaved(), true);
    console.log('PASS: actual login through the frontend proxy');

    for (const failure of ['unavailable', 'offline']) {
      await page.route('**/api/auth/me', route => failure === 'offline'
        ? route.abort('connectionfailed')
        : route.fulfill({ status: 503, json: { error: 'Test outage' } }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      assert.equal(await sessionSaved(), true);
      assert.equal(await page.getByRole('button', { name: 'Centro CPA', exact: true }).count(), 0);
      await page.screenshot({ path: path.join(out, `connection-${failure}.png`), fullPage: true });
      await page.unroute('**/api/auth/me');
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await waitForApp();
      console.log(`PASS: ${failure} retains session and retry restores the app`);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();
    await page.screenshot({ path: path.join(out, 'dashboard.png'), fullPage: true });
    await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: 'Token expirado' } }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    await page.getByText(/Tu sesi.*venci/).waitFor();
    assert.equal(await sessionSaved(), false);
    await page.unroute('**/api/auth/me');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, 'login-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByLabel('Correo electr\u00f3nico').fill('admin@contapanama.pa');
    await page.getByLabel('Contrase\u00f1a', { exact: true }).fill(qaCredentials.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await waitForApp();
    console.log('PASS: expired session returns to login; explicit login recovers');
    assert.deepEqual(errors, []);
    console.log('Browser access checks passed with no JavaScript errors');
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
