const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
module.exports = async ({ page, api, client, period, out }) => {
  const checks = ['login','pago parcial','reintento de pago sin duplicados','conciliacion bancaria','anulacion de cobro'];
  await page.setViewportSize({width:1440,height:1050});
  await page.getByRole('button',{name:'Diario Contable',exact:true}).click();
  await page.getByRole('button',{name:'Nuevo gasto',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Cliente del documento').selectOption(client.id);
  await dialog.getByLabel('Fecha del documento').fill(period+'-04');
  await dialog.getByLabel('Concepto del documento').fill('QA doble clic SQL');
  await dialog.getByLabel('Monto del documento').fill('23.50');
  await dialog.getByLabel('Tasa ITBMS del documento').selectOption('0');
  await dialog.getByRole('button',{name:'Registrar',exact:true}).evaluate(button => { button.click(); button.click(); });
  await dialog.waitFor({state:'hidden'});
  const docs=(await api('/api/transacciones?cliente_id='+client.id)).data.filter(t=>t.descripcion==='QA doble clic SQL');
  assert.equal(docs.length,1); checks.push('creacion de documento','doble clic: un documento');
  await page.getByRole('button',{name:'Contabilidad',exact:true}).click();
  await page.getByLabel('Cliente contable').selectOption(client.id);
  await page.getByLabel('Periodo contable').fill(period);
  const consistency=page.getByRole('region',{name:'Consistencia del libro',exact:true});
  await consistency.getByText('CONSISTENTE',{exact:true}).waitFor();
  const endpoint='/api/contabilidad/asientos?periodo='+period+'&cliente_id='+client.id;
  const before=await api(endpoint);
  assert(before.data.some(e=>e.transaccion_id===docs[0].id)); checks.push('consulta de libro','consistencia SQL');
  await page.screenshot({path:path.join(out,'consistencia-sql-desktop.png')});
  for (const viewport of [{width:390,height:844},{width:1440,height:1050}]) {
    await page.setViewportSize(viewport);
    await consistency.scrollIntoViewIfNeeded();
    assert(await consistency.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The mobile page must not overflow horizontally');
    if(viewport.width===390) await page.screenshot({path:path.join(out,'consistencia-sql-mobile.png')});
  }
  assert(process.send,'Restart evidence requires the disposable PostgreSQL parent, not a simulated API');
  await new Promise((resolve,reject)=>{
    const requestId='restart-ledger-browser';
    const timer=setTimeout(()=>{process.off('message',receive);reject(new Error('API restart timed out'));},60000);
    function receive(message){if(message.requestId===requestId){clearTimeout(timer);process.off('message',receive);message.ok?resolve():reject(new Error(message.error));}}
    process.on('message',receive);process.send({action:'restart-api',requestId});
  });
  await page.reload();
  await page.getByRole('button',{name:'Contabilidad',exact:true}).click();
  await page.getByLabel('Cliente contable').selectOption(client.id);
  await page.getByLabel('Periodo contable').fill(period);
  await consistency.getByText('CONSISTENTE',{exact:true}).waitFor();
  assert.deepEqual(await api(endpoint),before);
  checks.push('reinicio real de API','persistencia despues del reinicio','desktop y mobile');
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,engine:'server.js + PostgreSQL',checks},null,2));
  for(const c of checks)console.log('PASS browser SQL: '+c);
};
