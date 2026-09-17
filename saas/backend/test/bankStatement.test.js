const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prepareStatement, statementHash, assertStatement, assertLocalStatements, statementDirectory, statementScope, previousMonth } = require('../services/bankStatement');
const account={id:randomUUID(),usuario_id:randomUUID(),cliente_id:randomUUID(),numero:'12345678',banco:'Banco General',nombre:'QA',moneda:'USD',activa:true};
const body={cliente_id:account.cliente_id,cuenta_bancaria_id:account.id,periodo:'2046-01',
  saldo_inicial:'100.10',creditos:'50.20',debitos:'20.30',saldo_final:'130.00',cantidad_creditos:1,cantidad_debitos:1,
  soporte_nombre:'qa.pdf',soporte_base64:Buffer.from('%PDF-1.7\n% QA fixture\n%%EOF\n').toString('base64')};
const make=(changes={})=>{
  const row={...prepareStatement({...body,...changes}),id:randomUUID(),usuario_id:account.usuario_id,revision:1,...changes};
  row.contenido_hash=statementHash(row);return row;
};
test('statement money is exact to cents, including negative opening balances; invalid or inconsistent values fail',()=>{
  const result=prepareStatement(body);assert.equal(result.saldo_final,'130.00');
  assert.doesNotThrow(()=>prepareStatement({...body,saldo_inicial:'-100.10',saldo_final:'-70.20'}));
  for(const value of [null,[],{},NaN,Infinity,'',true,'1e2','1,00','0.001','1000000000000']){
    assert.throws(()=>prepareStatement({...body,saldo_inicial:value}),{status:422});
  }
  for(const value of [null,[],12])assert.throws(()=>prepareStatement(value),{status:422});
  for(const changes of [{saldo_final:129.99},{creditos:-1},{cantidad_creditos:0},{cantidad_debitos:'1'},{cantidad_creditos:1000001}]){
    assert.throws(()=>prepareStatement({...body,...changes}),{status:422});
  }
});
test('original PDF must have a bounded canonical representation and safe filename',()=>{
  for(const support of ['', 'AAAA', body.soporte_base64+'=',Buffer.from('not a pdf').toString('base64'),
    Buffer.from('%PDF-1.7\n'+'x'.repeat(4*1024*1024)+'%%EOF').toString('base64')]){
    assert.throws(()=>prepareStatement({...body,soporte_base64:support}),{status:422});
  }
  for(const name of ['../test.pdf','a\\b.pdf','file.html','a\r\n.pdf','x'.repeat(181)+'.pdf']){
    assert.throws(()=>prepareStatement({...body,soporte_nombre:name}),{status:422});
  }
});
test('immutable versions and original hashes reject overwrite, missing history, tampered PDF and client drift',()=>{
  const row=make();assert.doesNotThrow(()=>assertStatement(row,true));
  const state={cuentas_bancarias:[account],extractos_bancarios:[row]},before=structuredClone(state);
  assert.doesNotThrow(()=>assertLocalStatements(state,before));
  for(const change of [s=>s.extractos_bancarios.pop(),s=>{s.extractos_bancarios[0].motivo='altered';},
    s=>{s.extractos_bancarios[0].soporte_base64=Buffer.from('%PDF-1.7\nchanged\n%%EOF').toString('base64');},
    s=>{s.cuentas_bancarias[0].cliente_id=randomUUID();}]){
    const next=structuredClone(state);change(next);assert.throws(()=>assertLocalStatements(next,before));
  }
  const revision=make({anterior_id:row.id,revision:2,motivo:'Corregido con soporte de prueba'});
  assert.doesNotThrow(()=>assertLocalStatements({...state,extractos_bancarios:[row,revision]},before));
  const fork={...revision,id:randomUUID()};fork.contenido_hash=statementHash(fork);
  assert.throws(()=>assertLocalStatements({...state,extractos_bancarios:[row,revision,fork]},before));
});
test('equal net flow does not hide missing credit/debit rows or different counts',()=>{
  const row=make({saldo_inicial:100,creditos:20,debitos:20,saldo_final:100,cantidad_creditos:1,cantidad_debitos:1});
  const report=bank=>statementDirectory([row],[account],bank,{periodo:row.periodo}).data[0];
  assert.equal(report([]).estado,'diferencias');assert.equal(report([]).diferencias.saldo_final,0);
  const bank=['credito','debito'].map(tipo=>({usuario_id:account.usuario_id,cliente_id:account.cliente_id,cuenta_bancaria_id:account.id,fecha:'2046-01-03',tipo,monto:20}));
  assert.equal(report(bank).estado,'coincidencia_aritmetica');assert.equal(report(bank).saldo_verificado,false);
  assert.equal(report(bank.flatMap(m=>[{...m,monto:10},{...m,monto:10}])).estado,'diferencias');
  assert.equal(report(bank.map(m=>({...m,cliente_id:randomUUID()}))).estado,'diferencias');
});
test('annual directory exposes all twelve months, exact previous month and revisions without inventing a zero opening',()=>{
  const prior=make({periodo:'2045-12'}),row=make({saldo_inicial:130,creditos:50,debitos:20,saldo_final:160});
  const grid=statementDirectory([prior,row],[account],[],{anio:'2046'}).data;
  assert.equal(grid.length,12);assert.equal(grid[0].continuidad,'coincide');
  assert.equal(grid[1].estado,'sin_extracto');assert.equal(grid[1].actual,null);
  const revision=make({periodo:'2045-12',revision:2,anterior_id:prior.id,motivo:'Correccion del saldo anterior',saldo_inicial:110.1,saldo_final:140});
  assert.equal(statementDirectory([prior,row,revision],[account],[],{periodo:'2046-01'}).data[0].diferencia_continuidad,-10);
  assert.equal(previousMonth('2046-01'),'2045-12');
  assert.throws(()=>statementDirectory([row],[account],[],{periodo:'2046-01',cuenta_bancaria_id:randomUUID()}),{status:404});
});
test('statement scope rejects invalid dates, identifiers and mixed monthly/annual filters',()=>{
  for(const scope of [{},{periodo:'2046-13'},{anio:'bad'},{anio:'2046',periodo:'2046-01'},{anio:'2046',cliente_id:'bad'}]){
    assert.throws(()=>statementScope(scope),{status:422});
  }
  assert.equal(statementScope({anio:'2046'}).anio,'2046');
});
