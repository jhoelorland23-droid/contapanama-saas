const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function bankScenario({ request, requestRaw, authHeaders, check, installBank, setRole, outputDirectory, db }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (url, body, method = 'POST') => request(url, { method, headers: authHeaders,
    body: JSON.stringify(['/api/movimientos-bancarios','/api/movimientos-bancarios/bulk'].includes(url) ? { idempotencia:randomUUID(),...body } : body) });
  const uid = (await read('/api/auth/me')).id;
  const a = await send('/api/clientes', { nombre: 'QA BANCO EMPRESA A', ruc: 'QA-BANK-A', tipo: 'natural' });
  const b = await send('/api/clientes', { nombre: 'QA BANCO EMPRESA B', ruc: 'QA-BANK-B', tipo: 'natural' });
  const accountA = await require('./bankAccountFixture').createAccount(request, authHeaders, a.id);
  const accountB = await require('./bankAccountFixture').createAccount(request, authHeaders, b.id);
  const scope = client => `periodo=2040-01&cliente_id=${client.id}`;
  const bankBody = { cliente_id: a.id, cuenta_bancaria_id: accountA.id, fecha: '2040-01-05', descripcion: 'QA BANCO A DEPOSITO', banco: 'Banco General', tipo: 'credito', monto: 100 };
  const docBody = { cliente_id: a.id, fecha: '2040-01-02', descripcion: 'QA COBRO CLIENTE A', banco: 'Banco General',
    tipo: 'ingreso', monto: 100, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente' };
  const doc = await send('/api/transacciones', docBody);
  const bank = await send('/api/movimientos-bancarios', bankBody);
  const foreignBody = { ...bankBody, cliente_id: b.id, cuenta_bancaria_id: accountB.id, descripcion: 'QA BANCO B DEPOSITO', idempotencia: randomUUID() };
  const foreign = await send('/api/movimientos-bancarios', foreignBody);
  const before = await read('/api/movimientos-bancarios?periodo=2040-01');
  await assert.rejects(send('/api/movimientos-bancarios', { ...bankBody, cliente_id: null }), /422/);
  await assert.rejects(send('/api/movimientos-bancarios', { ...bankBody, cliente_id: randomUUID() }), /404/);
  await assert.rejects(send('/api/movimientos-bancarios/bulk', { movimientos: [bankBody,{ ...bankBody, monto: '1.005' }] }), /422/);
  await assert.rejects(send('/api/movimientos-bancarios/bulk', { movimientos: [bankBody,{ ...bankBody, cliente_id: randomUUID() }] }), /404/);
  assert.deepEqual(await read('/api/movimientos-bancarios?periodo=2040-01'), before);
  check('bank API validates every bulk row before any mutation; no missing or foreign client accepted');
  await assert.rejects(send('/api/conciliacion/match', { transaccion_id: doc.id, movimiento_id: foreign.id }), /409.*otro cliente/);
  const pay = await send(`/api/transacciones/${doc.id}/pagos`, { importe:100,fecha:'2040-01-05',metodo_pago:'transferencia',banco:'Banco General',cuenta_bancaria_id:accountA.id,idempotencia:randomUUID() });
  const matchUrl = `/api/transacciones/${doc.id}/pagos/${pay.pagos[0].id}/conciliar`;
  await assert.rejects(send(matchUrl, { movimiento_id: foreign.id }), /409.*otro cliente/);
  const r = await read('/api/fiscal/conciliacion?'+scope(a));
  assert.equal(r.resumen.length,1);assert.equal(r.resumen[0].cliente_nombre,a.nombre);
  assert.equal(r.movimientos_pendientes.length,1);assert.equal(r.sugerencias.length,1);
  assert.equal(r.sugerencias[0].movimiento_id,bank.id);
  await send(matchUrl,{ movimiento_id: bank.id });
  const linked = await read('/api/fiscal/conciliacion?'+scope(a));
  assert.equal(linked.resumen[0].estado,'movimientos_vinculados');assert.equal(linked.saldo_verificado,false);
  assert.equal(linked.registros_contables.length,1);assert.equal(linked.movimientos_periodo.length,1);
  check('both full-document and partial-payment linking reject another company; same-client link retains full records');
  const legacy = { ...bankBody, id:randomUUID(),usuario_id:uid,cliente_id:null,cuenta_bancaria_id:null,conciliado:false,transaccion_id:null,
    created_at:new Date().toISOString(),referencia:'QA-LEGACY-BANK' };
  await installBank(legacy);
  const assignmentUrl = `/api/movimientos-bancarios/${legacy.id}/cliente`;
  await assert.rejects(send(assignmentUrl,{cliente_id:a.id,motivo:'x'}), /422/);
  await send(assignmentUrl,{cliente_id:a.id,motivo:'Extracto verificado y propietario confirmado'});
  await send(assignmentUrl,{cliente_id:a.id,motivo:'Extracto verificado y propietario confirmado'});
  await assert.rejects(send(assignmentUrl,{cliente_id:b.id,motivo:'Intento de reasignacion de propietario'}), /409/);
  if(db) {
    assert.equal(Number((await db.query("SELECT count(*) FROM audit_events WHERE objeto_id=$1 AND accion='movimiento_cliente_asignado'",[legacy.id])).rows[0].count),1);
    await assert.rejects(db.query('UPDATE movimientos_bancarios SET cliente_id=$2 WHERE id=$1',[legacy.id,b.id]),error=>error.code==='23514');
    await assert.rejects(db.query('UPDATE movimientos_bancarios SET transaccion_id=$2 WHERE id=$1',[foreign.id,doc.id]),error=>error.code==='23514');
  }
  check('legacy bank assignment requires owner review, is audited once and cannot cross clients afterward');
  const docB = await send('/api/transacciones',{...docBody,cliente_id:b.id,descripcion:'QA COBRO CLIENTE B'});
  await send(`/api/transacciones/${docB.id}/cuenta`,{cuenta_bancaria_id:accountB.id,motivo:'Cuenta revisada con extracto de cliente B'});
  await send('/api/conciliacion/match',{transaccion_id:docB.id,movimiento_id:foreign.id});
  await send('/api/contabilidad/cierre-estado?'+scope(b),{estado:'cerrado',nota:'QA banco cliente B periodo cerrado'},'PUT');
  const closedReplay = await send('/api/movimientos-bancarios', foreignBody);
  assert.equal(closedReplay.id, foreign.id); assert.equal(closedReplay.repetido, true);
  const beforeClosed = await read('/api/movimientos-bancarios?periodo=2040-01');
  await assert.rejects(send('/api/movimientos-bancarios/bulk',{movimientos:[bankBody,{...bankBody,cliente_id:b.id}]}),/409/);
  assert.deepEqual(await read('/api/movimientos-bancarios?periodo=2040-01'),beforeClosed);
  await send('/api/movimientos-bancarios',{...bankBody,descripcion:'QA cliente A sigue abierto'});
  check('a client closure blocks its bank imports atomically without closing another company');
  const originalRole = (await read('/api/auth/me')).rol;
  await setRole(uid,'cliente');
  try {
    await assert.rejects(send('/api/movimientos-bancarios',bankBody),/403/);
    await assert.rejects(send(assignmentUrl,{cliente_id:a.id,motivo:'Asignacion sin rol de contador'}),/403/);
    await assert.rejects(send(matchUrl,{movimiento_id:bank.id}),/403/);
  } finally { await setRole(uid,originalRole); }
  check('client role cannot create, assign or reconcile bank entries');
  const other = await send('/api/auth/register',{nombre:'QA Otro propietario banco',email:`bank-${randomUUID()}@example.com`,password:process.env.CONTAPANAMA_QA_PASSWORD});
  const otherHeaders = {'Content-Type':'application/json',Authorization:`Bearer ${other.token}`};
  await assert.rejects(request('/api/fiscal/conciliacion?'+scope(a),{headers:otherHeaders}),/404/);
  for(const query of ['periodo=2040-13','anio=abc','periodo=2040-01&anio=2040','cliente_id=bad']){
    await assert.rejects(read('/api/fiscal/conciliacion?'+query),/422/);
    await assert.rejects(requestRaw('/api/reportes/conciliacion?'+query,{headers:authHeaders}),/422/);
  }
  const bulk = Array.from({length:52},(_,i)=>({...bankBody,descripcion:'BANK-ROW-'+String(i+1).padStart(3,'0'),referencia:'QA-'+i}));
  await send('/api/movimientos-bancarios/bulk',{movimientos:bulk});
  const annual = await read(`/api/fiscal/conciliacion?anio=2040&cliente_id=${a.id}`);
  assert(annual.movimientos_periodo.length>=55);
  assert(annual.movimientos_periodo.every(m=>m.cliente_id===a.id));
  const pdf = await requestRaw(`/api/reportes/conciliacion?anio=2040&cliente_id=${a.id}`,{headers:authHeaders});
  const buffer=Buffer.from(await pdf.arrayBuffer());assert.equal(buffer.subarray(0,4).toString(),'%PDF');
  const text = require('./journalPdf.scenario').pdfText(buffer);
  for(let i=1;i<=52;i++) assert(text.includes('BANK-ROW-'+String(i).padStart(3,'0')));
  assert(text.includes(a.nombre));assert(!text.includes(b.nombre));
  assert(text.includes('NO verificados'));assert(!text.includes('Saldo Contable'));
  if(outputDirectory){fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'conciliacion-cliente-completa.pdf'),buffer);}
  check('monthly and annual APIs and PDF validate scope, isolate owners and retain more than 45 bank rows');
};
