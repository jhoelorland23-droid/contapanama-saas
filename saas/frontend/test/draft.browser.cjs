const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.CONTAPANAMA_PLAYWRIGHT || 'playwright');

async function run() {
  const browser = await chromium.launch({ headless: true, channel: process.env.CONTAPANAMA_BROWSER_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const draft = {
    id: 'draft-ui-test', tipo: 'ingreso', estado_contable: 'borrador_ia',
    descripcion: 'BORRADOR QA SIN REGISTRAR', fecha: new Date().toISOString().slice(0, 10),
    monto: 987654.32, itbms: 69135.8, tasa_itbms: 0.07, estado_pago: 'pendiente',
    cliente_nombre: 'Cliente de prueba', banco: 'Banco General', categoria_contable: 'ventas_servicios',
  };
  try {
    await page.route('**/api/transacciones?*', route => route.fulfill({ json: { data: [draft], total: 1 } }));
    await page.route('**/api/transacciones/resumen?*', route => route.fulfill({ json: {
      total_ingresos: 0, total_gastos: 0, utilidad_neta: 0,
      cuentas_por_cobrar: 0, cuentas_por_pagar: 0,
    } }));
    await page.goto(process.env.CONTAPANAMA_WEB_URL || 'http://localhost:5173');
    await page.getByRole('button', { name: 'Usar demo', exact: true }).click();
    await page.getByText('Centro de Control CPA', { exact: true }).waitFor();
    assert.equal(await page.getByText('BORRADOR QA SIN REGISTRAR', { exact: true }).count(), 0);
    assert.equal((await page.locator('main').innerText()).includes('987,654'), false);
    await page.getByRole('button', { name: 'Diario Contable', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'BORRADOR QA SIN REGISTRAR' });
    await row.waitFor();
    assert.equal(await row.getByRole('button', { name: 'Registrar', exact: true }).count(), 1);
    assert.equal(await row.getByRole('button', { name: /^(Cobrar|Pagar|Conc\.)$/ }).count(), 0);
    const balanceText = await page.getByText('Por cobrar', { exact: true }).locator('..').innerText();
    assert.equal(balanceText.includes('1,056,790'), false);
    assert.match(balanceText, /0\.00/);
    await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
    assert.equal(await row.count(), 0);
    await page.getByRole('button', { name: 'Borradores IA', exact: true }).click();
    await row.waitFor();
    await page.screenshot({ path: path.resolve(__dirname, '../../outputs/draft-isolation-qa/diario-borrador.png'), fullPage: true });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    assert(csv.includes('estado_contable') && csv.includes('borrador_ia'));
    assert.deepEqual(errors, []);
    console.log('Draft UI checks passed: separate balances, approval action, payment filters and explicit CSV status');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
