const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createAccount}=require('./bankAccountFixture');
module.exports=async function bankSubledgerScenario({request,requestRaw,authHeaders,check,snapshot,withSaveFailure,db}){
  const read=url=>request(url,{headers:authHeaders});
  const send=(url,body)=>request(url,{method:'POST',headers:authHeaders,body:JSON.stringify(body)});
  const uid=(await read('/api/auth/me')).id;
  const client=await send('/api/clientes',{nombre:'QA AUXILIAR BANCARIO',tipo:'natural',ruc:'QA-SUBLEDGER'});
  const a=await createAccount(request,authHeaders,client.id,{nombre:'Operativa auxiliar'});
  const b=await createAccount(request,authHeaders,client.id,{nombre:'Reserva auxiliar'});
  const doc=await send('/api/transacciones',{cliente_id:client.id,fecha:'2047-12-01',tipo:'ingreso',descripcion:'QA AUX INCOME',monto:2000,
    itbms:0,tasa_itbms:0,categoria_itbms:'exento',estado_pago:'pendiente'});
  const paymentUrl='/api/transacciones/'+doc.id+'/pagos';
  const payment=(account,date,amount)=>({importe:amount,fecha:date,metodo_pago:'transferencia',banco:account.banco,cuenta_bancaria_id:account.id,idempotencia:randomUUID()});
  await send(paymentUrl,payment(a,'2047-12-02',1000));
  const p=payment(a,'2048-01-02',100);
  const repeated=await Promise.all(Array.from({length:8},()=>send(paymentUrl,p)));
  const paymentId=repeated[0].pagos.find(r=>r.idempotencia===p.idempotencia).id;
  await send(paymentUrl,payment(b,'2048-01-02',100));
  await send('/api/transacciones',{cliente_id:client.id,fecha:'2048-01-03',tipo:'gasto',descripcion:'QA AUX EXPENSE',monto:40,
    itbms:0,tasa_itbms:0,categoria_itbms:'exento',estado_pago:'pagado',fecha_pago:'2048-01-03',metodo_pago:'transferencia',banco:a.banco,cuenta_bancaria_id:a.id});
  const endpoint='/api/auxiliar-bancario?anio=2048&cliente_id='+client.id;
  let result=await read(endpoint);
  assert.equal(result.data.length,24);assert.equal(result.control_mayor.debe,200);assert.equal(result.control_mayor.haber,40);
  let january=result.data.filter(r=>r.periodo==='2048-01');
  assert.equal(january.find(r=>r.cuenta_bancaria_id===a.id).saldo_acumulado,1060);
  assert.equal(january.find(r=>r.cuenta_bancaria_id===b.id).saldo_acumulado,100);
  const januaryBefore=structuredClone(january);
  const persisted=await snapshot(uid), dims=persisted.dimensiones_bancarias.filter(d=>d.cliente_id===client.id);
  assert.equal(dims.length,4);assert(dims.every(d=>d.dimension_hash.length===64));
  assert(january.flatMap(r=>r.movimientos).every(m=>m.numero_libro&&m.asiento_hash&&m.dimension_hash));
  check('bank subledger preserves two same-bank accounts, prior-year carry, expense and eight identical receipt retries with original folios');

  await send(paymentUrl+'/'+paymentId+'/anular',{fecha:'2048-02-05',motivo:'Duplicado confirmado en soporte QA'});
  result=await read(endpoint);
  assert.deepEqual(result.data.filter(r=>r.periodo==='2048-01'),januaryBefore);
  assert.equal(result.data.find(r=>r.periodo==='2048-02'&&r.cuenta_bancaria_id===a.id).saldo_acumulado,960);
  const filtered=await read(endpoint+'&cuenta_bancaria_id='+b.id);
  assert.equal(filtered.data.length,12);assert(filtered.data.every(r=>r.cuenta_bancaria_id===b.id));
  const unchanged=await snapshot(uid);
  await read(endpoint);await read(endpoint+'&cuenta_bancaria_id='+a.id);
  assert.deepEqual(await snapshot(uid),unchanged);
  for(const suffix of ['&desde=2048-01-01','&periodo=2048-01','&cuenta_bancaria_id=bad'])await assert.rejects(read(endpoint+suffix),/422/);
  await assert.rejects(read(endpoint+'&cuenta_bancaria_id='+randomUUID()),/404/);
  await assert.rejects(requestRaw(endpoint,{headers:{}}),/401/);
  const foreign=await send('/api/auth/register',{nombre:'QA Auxiliar ajeno',email:'aux-'+randomUUID()+'@example.test',password:process.env.CONTAPANAMA_QA_PASSWORD});
  await assert.rejects(request(endpoint,{headers:{Authorization:'Bearer '+foreign.token}}),/404/);
  check('subledger cancellation stays in its actual month; month/year and account filters preserve history; GETs cannot mutate source, journal or audit');

  const failedPayment=payment(a,'2048-03-02',25), beforeFailure=await snapshot(uid);
  if(db){
    await db.query(`CREATE FUNCTION qa_skip_dimension() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER qa_skip_dimension BEFORE INSERT ON dimensiones_bancarias FOR EACH ROW EXECUTE FUNCTION qa_skip_dimension()`);
    try{await assert.rejects(send(paymentUrl,failedPayment),/500/);}
    finally{await db.query('DROP TRIGGER qa_skip_dimension ON dimensiones_bancarias; DROP FUNCTION qa_skip_dimension()');}
  }else await withSaveFailure(async()=>{await assert.rejects(send(paymentUrl,failedPayment),/503.*No se aplicaron cambios/);});
  assert.deepEqual(await snapshot(uid),beforeFailure);
  await send(paymentUrl,failedPayment);
  check('missing SQL bank dimension or failed local durable save rolls back payment, journal, folio and audit; retry succeeds once');
  if(db){
    const dimension=(await snapshot(uid)).dimensiones_bancarias.find(d=>d.cliente_id===client.id);
    for(const sql of ["UPDATE dimensiones_bancarias SET fuente='sin_cuenta' WHERE id=$1",'DELETE FROM dimensiones_bancarias WHERE id=$1'])
      await assert.rejects(db.query(sql,[dimension.id]),e=>e.code==='23514');
    await assert.rejects(db.query('TRUNCATE dimensiones_bancarias'),e=>e.code==='23514');
    const id=randomUUID();
    await assert.rejects(db.query(`INSERT INTO dimensiones_bancarias(id,usuario_id,cliente_id,asiento_id,orden,cuenta_bancaria_id,asiento_hash,fuente,dimension_hash)
      SELECT $1,usuario_id,cliente_id,asiento_id,orden,cuenta_bancaria_id,asiento_hash,fuente,dimension_hash FROM dimensiones_bancarias WHERE id=$2`,[id,dimension.id]),e=>e.code==='23514');
    check('SQL rejects bank dimension edits, deletion, truncation and late insertion into a published entry');
  }
  const expected=await read(endpoint);
  return {endpoint,expected};
};
