const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const PDFDocument = require('pdfkit');
async function samplePdf() {
  const doc=new PDFDocument({size:'A4'}),chunks=[];
  const ready=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.fontSize(16).text('QA - EXTRACTO SINTETICO');
  doc.fontSize(11).text('Documento exclusivo para pruebas, sin datos de clientes.\nSaldo inicial: 100.00\nCreditos: 20.00 (1)\nDebitos: 20.00 (1)\nSaldo final: 100.00');
  doc.end();return ready;
}
module.exports=async function bankStatementsScenario({request,requestRaw,authHeaders,check,snapshot,setRole,withSaveFailure,db}){
  const read=url=>request(url,{headers:authHeaders});
  const send=(url,body,headers=authHeaders)=>request(url,{method:'POST',headers,body:JSON.stringify(body)});
  const uid=(await read('/api/auth/me')).id;
  const client=await send('/api/clientes',{nombre:'QA EXTRACTOS MENSUALES',tipo:'natural',ruc:'QA-STATEMENTS'});
  const account=await require('./bankAccountFixture').createAccount(request,authHeaders,client.id);
  const pdf=await samplePdf();
  const body={cliente_id:client.id,cuenta_bancaria_id:account.id,periodo:'2046-01',saldo_inicial:100,
    creditos:20,debitos:20,saldo_final:100,cantidad_creditos:1,cantidad_debitos:1,
    soporte_nombre:'extracto-qa.pdf',soporte_base64:pdf.toString('base64'),idempotencia:randomUUID()};
  const endpoint='/api/extractos-bancarios',scope='?anio=2046&cliente_id='+client.id+'&cuenta_bancaria_id='+account.id;
  const postedJournal=s=>Object.fromEntries(['asientos_contables','asiento_lineas','folios_libro'].map(t=>[t,s[t]||[]]));
  const before=postedJournal(await snapshot(uid));
  const results=await Promise.all(Array.from({length:8},()=>send(endpoint,body)));
  assert.equal(new Set(results.map(r=>r.id)).size,1);assert.equal(results.filter(r=>!r.repetido).length,1);
  const first=results[0],saved=await snapshot(uid);
  assert.equal(saved.extractos_bancarios.filter(r=>r.id===first.id).length,1);
  assert.equal(saved.audit_events.filter(r=>r.objeto_id===first.id).length,1);
  assert.equal(saved.operaciones_bancarias.filter(r=>r.idempotencia===body.idempotencia).length,1);
  assert.deepEqual(postedJournal(saved),before);assert(!('soporte_base64' in first));assert(!('soporte_pdf' in first));
  await assert.rejects(send(endpoint,{...body,saldo_inicial:101,saldo_final:101}),/409/);
  await assert.rejects(send(endpoint,{...body,idempotencia:randomUUID()}),/409/);
  const downloaded=await requestRaw(endpoint+'/'+first.id+'/soporte',{headers:authHeaders});
  assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'application/pdf');
  assert(downloaded.headers.get('content-disposition').startsWith('attachment;'));
  assert.equal(downloaded.headers.get('x-content-sha256'),createHash('sha256').update(pdf).digest('hex'));
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pdf);
  check('statement PDF bytes, hash, metadata and audit persist once under eight retries, without posting journal entries');

  let grid=await read(endpoint+scope);
  assert.equal(grid.data.length,12);assert.equal(grid.data[0].estado,'diferencias');
  assert.equal(grid.data[0].diferencias.saldo_final,0);assert.equal(grid.data[1].actual,null);
  assert.equal(grid.data[0].saldo_verificado,false);assert(!JSON.stringify(grid).includes('soporte_base64'));
  for(const tipo of ['credito','debito'])await send('/api/movimientos-bancarios',{cliente_id:client.id,cuenta_bancaria_id:account.id,banco:account.banco,
    fecha:'2046-01-05',descripcion:'QA-STATEMENT-'+tipo,tipo,monto:20,idempotencia:randomUUID()});
  grid=await read(endpoint+scope);assert.equal(grid.data[0].estado,'coincidencia_aritmetica');
  assert.equal(grid.data[0].continuidad,'sin_extracto_anterior');assert.equal(grid.saldo_verificado,false);
  const month=await read(endpoint+'?periodo=2046-01&cuenta_bancaria_id='+account.id);
  assert.equal(month.data.length,1);assert.equal(month.data[0].actual.id,first.id);
  check('month and twelve-month views expose missing originals and zero-net missing flows; matching totals do not approve reconciliation');

  const previous=await send(endpoint,{...body,periodo:'2045-12',creditos:0,debitos:0,cantidad_creditos:0,cantidad_debitos:0,idempotencia:randomUUID()});
  assert.equal((await read(endpoint+scope)).data[0].continuidad,'coincide');
  const correction={...body,periodo:'2045-12',saldo_inicial:110,saldo_final:110,creditos:0,debitos:0,cantidad_creditos:0,cantidad_debitos:0,
    anterior_id:previous.id,motivo:'Se corrige el saldo declarado del soporte QA',idempotencia:randomUUID()};
  const changed=await send(endpoint,correction);
  assert.equal(changed.revision,2);assert.equal((await send(endpoint,correction)).repetido,true);
  await assert.rejects(send(endpoint,{...correction,idempotencia:randomUUID()}),/409/);
  await assert.rejects(send(endpoint,{...correction,anterior_id:first.id,idempotencia:randomUUID()}),/409/);
  await assert.rejects(send(endpoint,{...correction,anterior_id:changed.id,motivo:'x',idempotencia:randomUUID()}),/422/);
  const priorMonth=await read(endpoint+'?periodo=2045-12&cuenta_bancaria_id='+account.id);
  assert.equal(priorMonth.data[0].versiones.length,2);assert.equal(priorMonth.data[0].actual.id,changed.id);
  assert.equal((await read(endpoint+scope)).data[0].diferencia_continuidad,-10);
  const original=await requestRaw(endpoint+'/'+previous.id+'/soporte',{headers:authHeaders});
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),pdf);
  check('correction appends an immutable version with reason, rejects stale parents, retains original PDF and updates cross-year continuity');

  const unchanged=await snapshot(uid),role=(await read('/api/auth/me')).rol;
  await setRole(uid,'cliente');
  try{await assert.rejects(send(endpoint,{...body,periodo:'2046-02',idempotencia:randomUUID()}),/403/);}
  finally{await setRole(uid,role);}
  const other=await send('/api/auth/register',{nombre:'QA Extracto otro usuario',email:'statement-'+randomUUID()+'@example.com',password:process.env.CONTAPANAMA_QA_PASSWORD});
  const foreignHeaders={'Content-Type':'application/json',Authorization:'Bearer '+other.token};
  assert.equal((await request(endpoint+'?anio=2046',{headers:foreignHeaders})).data.length,0);
  await assert.rejects(request(endpoint+scope,{headers:foreignHeaders}),/404/);
  await assert.rejects(requestRaw(endpoint+'/'+first.id+'/soporte',{headers:foreignHeaders}),/404/);
  await assert.rejects(send(endpoint,{...body,cliente_id:randomUUID(),periodo:'2046-02',idempotencia:randomUUID()}),/409/);
  assert.deepEqual(await snapshot(uid),unchanged);
  check('client role cannot upload; other owners cannot list, download or substitute statement ownership');

  const failed={...body,periodo:'2046-03',idempotencia:randomUUID()};
  const beforeFailure=await snapshot(uid);
  await withSaveFailure(async()=>{
    await assert.rejects(send(endpoint,failed),/50[03]/);
    assert.deepEqual(await snapshot(uid),beforeFailure);
  });
  assert.equal((await send(endpoint,failed)).repetido,false);
  check('failed durable save rolls back PDF, metadata, audit and operation together; exact request recovers once');

  // January rows still require their real accounting links; use a different clean client for closure.
  const closeClient=await send('/api/clientes',{nombre:'QA EXTRACTO CERRADO',tipo:'natural',ruc:'QA-STATEMENT-CLOSED'});
  const closeAccount=await require('./bankAccountFixture').createAccount(request,authHeaders,closeClient.id);
  await send('/api/transacciones',{cliente_id:closeClient.id,fecha:'2046-02-01',tipo:'ingreso',descripcion:'QA cierre limpio',
    monto:10,itbms:0,tasa_itbms:0,categoria_contable:'honorarios',estado_pago:'pagado',fecha_pago:'2046-02-01',metodo_pago:'efectivo'});
  const closedBody={...body,cliente_id:closeClient.id,cuenta_bancaria_id:closeAccount.id,periodo:'2046-02',
    creditos:0,debitos:0,cantidad_creditos:0,cantidad_debitos:0,idempotencia:randomUUID()};
  const beforeClose=await send(endpoint,closedBody);
  await request('/api/contabilidad/cierre-estado?periodo=2046-02&cliente_id='+closeClient.id,{method:'PUT',headers:authHeaders,body:JSON.stringify({estado:'cerrado',nota:'QA cierre para validar bloqueo de extracto'})});
  assert.equal((await send(endpoint,closedBody)).repetido,true);
  const closedSnapshot=await snapshot(uid);
  await assert.rejects(send(endpoint,{...closedBody,anterior_id:beforeClose.id,motivo:'No debe modificar un mes cerrado',idempotencia:randomUUID()}),/409/);
  assert.deepEqual(await snapshot(uid),closedSnapshot);
  check('closed month rejects new statement versions but exact successful replay remains available');
  if(db){
    for(const sql of ['UPDATE extractos_bancarios SET motivo=motivo WHERE id=$1','DELETE FROM extractos_bancarios WHERE id=$1']){
      await assert.rejects(db.query(sql,[first.id]),e=>e.code==='23514');
    }
    await assert.rejects(db.query('TRUNCATE extractos_bancarios'),e=>e.code==='23514');
    const columns='id,usuario_id,cliente_id,cuenta_bancaria_id,periodo,revision,anterior_id,saldo_inicial,creditos,debitos,saldo_final,cantidad_creditos,cantidad_debitos,soporte_nombre,soporte_hash,soporte_bytes,soporte_pdf,motivo,contenido_hash';
    await assert.rejects(db.query('INSERT INTO extractos_bancarios ('+columns+') SELECT $2,usuario_id,cliente_id,cuenta_bancaria_id,\'2046-04\',revision,anterior_id,saldo_inicial,creditos,debitos,saldo_final,cantidad_creditos,cantidad_debitos,soporte_nombre,repeat(\'0\',64),soporte_bytes,soporte_pdf,motivo,contenido_hash FROM extractos_bancarios WHERE id=$1',[first.id,randomUUID()]),e=>e.code==='23514');
    check('SQL rejects PDF hash mismatch, destructive edits, deletion and truncate of original statements');
  }
  return {endpoint:endpoint+scope,expected:await read(endpoint+scope),fileId:first.id,pdfHash:first.soporte_hash};
};
