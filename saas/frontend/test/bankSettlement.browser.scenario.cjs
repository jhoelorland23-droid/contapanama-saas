const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

module.exports = async function bankSettlementBrowser({ page, api, client, account, period, out }) {
  const document = await api('/api/transacciones', { cliente_id: client.id, fecha: period+'-03', tipo: 'gasto',
    descripcion: 'QA asignacion y pago total UI', monto: 31, itbms: 0, tasa_itbms: 0, estado_pago: 'pendiente' });
  const bank = await api('/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: account.id,
    idempotencia: randomUUID(), fecha: period+'-06', descripcion: 'QA debito pago total UI', monto: 31, tipo: 'debito', banco: account.banco });
  await page.getByLabel('Cliente de conciliación').selectOption(client.id);
  await page.getByRole('tab', { name: 'Pendientes al corte', exact: true }).click();
  const pending = page.locator('label').filter({ hasText: document.descripcion });
  await pending.waitFor();
  assert(await pending.getByRole('radio').isDisabled());
  await pending.locator('..').getByRole('button', { name: 'Asignar cuenta al pago', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cuenta para asignación').selectOption(account.id);
  await dialog.getByLabel('Motivo de la asignación').fill('Cuenta confirmada con el soporte de pago UI');
  await dialog.getByRole('button', { name: 'Confirmar asignación', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await pending.getByRole('radio').check();
  assert(await page.locator('label').filter({ hasText: 'UI-BANK-052, con coma' }).getByRole('radio').isDisabled());
  await page.locator('label').filter({ hasText: bank.descripcion }).getByRole('radio').check();
  await page.getByText('Se registrará el pago completo de').waitFor();
  await page.getByRole('button', { name: 'Conciliar selección', exact: true }).click();
  await pending.waitFor({ state: 'hidden' });
  const paid = await api('/api/transacciones/'+document.id+'/pagos');
  assert.equal(paid.saldo_pendiente, 0);
  assert.equal(paid.pagos[0].cuenta_bancaria_id, account.id);
  assert.equal(paid.pagos[0].conciliado, true);
  const linkedBank = (await api('/api/movimientos-bancarios?cliente_id='+client.id)).data.find(m => m.id === bank.id);
  assert.equal(linkedBank.transaccion_id, document.id);
  assert.equal(linkedBank.conciliado, true);

  await page.getByRole('button', { name: 'Diario Contable', exact: true }).click();
  for (const tipo of ['gasto', 'ingreso']) {
    const before = (await api('/api/transacciones?cliente_id='+client.id)).total;
    await page.getByRole('button', { name: 'Nuevo '+tipo, exact: true }).click();
    await dialog.getByLabel('Cliente del documento').selectOption(client.id);
    await dialog.getByLabel('Fecha del documento').fill(period+'-04');
    const concepto = 'QA '+tipo+' pagado al registrar UI';
    await dialog.getByLabel('Concepto del documento').fill(concepto);
    await dialog.getByLabel('Monto del documento').fill('32');
    await dialog.getByLabel('Tasa ITBMS del documento').selectOption('0');
    assert.deepEqual(await dialog.getByLabel('Estado del documento').locator('option').allTextContents(), ['Pendiente','Pagado']);
    assert.equal(await dialog.getByRole('checkbox', { name: /conciliado/ }).count(), 0);
    await dialog.getByLabel('Estado del documento').selectOption('pagado');
    await dialog.getByLabel('Fecha del pago inicial').fill(period+'-06');
    await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Seleccione la cuenta' }).waitFor();
    assert.equal((await api('/api/transacciones?cliente_id='+client.id)).total, before);
    const picker = dialog.getByLabel('Cuenta del documento');
    assert.equal(await picker.locator('option').filter({ hasText: 'Archivada' }).count(), 0);
    assert.equal(await picker.locator('option').filter({ hasText: '***5678' }).count(), 0);
    await picker.selectOption(account.id);
    await dialog.getByLabel('Cuenta seleccionada del documento').filter({ hasText: '***1234' }).waitFor();
    if (tipo === 'gasto') {
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: path.join(out, 'gasto-pagado-mobile.png') });
    }
    await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const registered = (await api('/api/transacciones?cliente_id='+client.id)).data.find(t => t.descripcion === concepto);
    assert(registered);
    assert.equal(registered.tipo, tipo);
    assert.equal(registered.cuenta_bancaria_id, account.id);
    assert.equal(registered.estado_pago, 'pagado');
    assert.equal(registered.conciliado, false);
    assert.equal((await api('/api/transacciones/'+registered.id+'/pagos')).saldo_pendiente, 0);
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
  await page.getByRole('button', { name: 'Reportes PDF', exact: true }).click();
  await page.getByLabel('Cliente de reportes').selectOption(client.id);
  for (const annual of [false, true]) {
    if (annual) await page.getByRole('button', { name: '12 meses', exact: true }).click();
    for (const [title, endpoint] of [['Paquete de Cierre CPA', 'paquete-cierre'], ['Conciliación Bancaria', 'conciliacion']]) {
      const requested = page.waitForRequest(request => new URL(request.url()).pathname === '/api/reportes/'+endpoint);
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar '+title, exact: true }).click();
      const params = new URL((await requested).url()).searchParams;
      assert.equal(params.get('cliente_id'), client.id);
      assert.equal(params.get(annual ? 'anio' : 'periodo'), annual ? period.slice(0,4) : period);
      const download = await downloaded;
      await download.saveAs(path.join(out, 'ui-'+endpoint+(annual ? '-anual' : '-mensual')+'.pdf'));
    }
  }
  console.log('PASS initial settlement UI: audited legacy account assignment, exact-account full payment, no cross-account matching, initial paid income/expense and archived account exclusion');
  console.log('PASS report UI: monthly and annual closure/bank PDF requests preserve the selected client');
};
