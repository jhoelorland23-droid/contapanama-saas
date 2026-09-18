const assert = require('node:assert/strict');
const path = require('node:path');

// Response fixtures exercise presentation only; SQL persistence is tested separately.
module.exports = async ({ page, out }) => {
  const region = page.getByRole('region', { name: 'Consistencia del libro', exact: true });
  const endpoint = '**/api/contabilidad/consistencia?*';
  const cases = [
    { estado: 'consistente', label: 'CONSISTENTE' },
    { estado: 'consistente_en_filtro', pendientes_fuera_del_filtro: 2,
      label: 'CONSISTENTE EN EL FILTRO / EXISTEN DIFERENCIAS FUERA DEL FILTRO' },
    { estado: 'divergente', label: 'DIVERGENTE' },
    { estado: 'pendiente_incorporacion', label: 'PENDIENTE / NO VERIFICADO' },
    { estado: 'integridad_fallida', integridad: 'fallida', errores: ['QA integridad fallida'], label: 'ERROR / INTEGRIDAD FALLIDA' },
  ];
  let response;
  const handler = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  await page.route(endpoint, handler);
  let consistentColor;
  try {
    for (const item of cases) {
      response = { pendientes: [], cuentas_divergentes: [], errores: [], pendientes_fuera_del_filtro: 0, ...item };
      const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/contabilidad/consistencia');
      await region.getByRole('button', { name: 'Verificar consistencia' }).click();
      await loaded;
      await page.waitForFunction(() => !document.querySelector('section[aria-label="Consistencia del libro"] button').disabled);
      const badge = region.getByRole('status');
      assert.equal(await badge.textContent(), item.label);
      const color = await badge.evaluate(el => getComputedStyle(el).color);
      if (item.estado === 'consistente') consistentColor = color;
      else assert.notEqual(color, consistentColor, 'Only globally consistent may use the green badge');
      if (item.pendientes_fuera_del_filtro) {
        await region.getByText('Cartera: 2 diferencias fuera del filtro seleccionado.', { exact: true }).waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        await region.scrollIntoViewIfNeeded();
        assert(await badge.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(out, 'consistencia-filtro-mobile.png') });
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
    }
  } finally { await page.unroute(endpoint, handler); }
  await region.getByRole('button', { name: 'Verificar consistencia' }).click();
  await region.getByText('CONSISTENTE', { exact: true }).waitFor();
  console.log('PASS browser UI fixtures: five consistency states and visible outside-filter warning on mobile');
  return cases.map(item => item.label);
};
