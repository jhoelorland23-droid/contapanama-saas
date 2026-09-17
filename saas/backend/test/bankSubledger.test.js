const {test}=require('node:test');
const assert=require('node:assert/strict');
const {journalPlan}=require('../services/journalLedger');
const {planBankDimensions}=require('../services/bankPosting');
const {planRegistry}=require('../services/entityBooks');
const {bankSubledger}=require('../services/bankSubledger');
const {statementHash}=require('../services/bankStatement');
const uid='owner';
function fixture(){
  const accounts=['A','B'].map(id=>({id,usuario_id:uid,cliente_id:'client',banco:'Banco General',nombre:id,numero:'1234'+id,activa:true}));
  const tx={id:'doc',usuario_id:uid,cliente_id:'client',cliente_nombre:'QA',fecha:'2047-12-01',periodo:'2047-12',tipo:'ingreso',
    descripcion:'Prueba',monto:400,itbms:0,estado_pago:'pendiente',pagos:[
      {id:'old',importe:100,fecha:'2047-12-02',metodo_pago:'transferencia',banco:'Banco General',cuenta_bancaria_id:'A'},
      {id:'new',importe:100,fecha:'2048-01-02',metodo_pago:'transferencia',banco:'Banco General',cuenta_bancaria_id:'B'},
      {id:'unknown',importe:50,fecha:'2048-01-02',metodo_pago:'transferencia',banco:'Banco General',cuenta_bancaria_id:null}]};
  const entries=journalPlan([tx]).map((e,i)=>({...e,usuario_id:uid,numero:i+1,requiere_dimension_bancaria:true}));
  const dimensions=planBankDimensions(uid,entries,[],[],[tx],accounts);
  const registry=planRegistry(uid,entries,[],[],'parent');
  return {entries,books:registry.books,folios:registry.folios,bank_dimensions:dimensions,accounts,statements:[],clients:[{id:'client',nombre:'QA'}],book:{id:'parent'}};
}
test('annual account balances carry prior-year movements and preserve unassigned lines in the general ledger control',()=>{
  const snapshot=fixture(), result=bankSubledger(snapshot,uid,{anio:'2048',cliente_id:'client'});
  assert.equal(result.data.length,36);
  const a=result.data.find(r=>r.cuenta_bancaria_id==='A'&&r.periodo==='2048-01');
  assert.equal(a.saldo_acumulado_anterior,100);assert.equal(a.saldo_acumulado,100);
  assert.equal(result.control_mayor.debe,150);assert.equal(result.control_mayor.meses[0].saldo_acumulado,250);
  assert.equal(result.pendientes_sin_cuenta,1);assert.equal(result.apertura_verificada,false);
  assert(result.data.flatMap(r=>r.movimientos).every(m=>m.asiento_id&&m.numero_libro&&m.libro_entidad_id));
  assert.equal(bankSubledger(snapshot,uid,{periodo:'2048-01',cuenta_bancaria_id:'B'}).data.length,1);
});
test('statement comparison keeps gross flows and balances distinct, never certifying a zero net difference',()=>{
  const snapshot=fixture();
  const statement={id:'statement',usuario_id:uid,cliente_id:'client',cuenta_bancaria_id:'B',periodo:'2048-01',revision:1,anterior_id:null,
    saldo_inicial:10,creditos:90,debitos:0,saldo_final:100,cantidad_creditos:1,cantidad_debitos:0,motivo:''};
  statement.contenido_hash=statementHash(statement);snapshot.statements.push(statement);
  const result=bankSubledger(snapshot,uid,{periodo:'2048-01',cuenta_bancaria_id:'B'}).data[0];
  assert.equal(result.diferencias.saldo_final,0);assert.equal(result.diferencias.creditos,10);assert.equal(result.diferencias.saldo_inicial,-10);
  assert.equal(result.saldo_verificado,false);assert.equal(result.revision_cpa,'pendiente');
});
test('read-only report rejects unapproved, damaged or foreign scope, and never assigns old dimensions',()=>{
  const snapshot=fixture(),before=structuredClone(snapshot);
  bankSubledger(snapshot,uid,{anio:'2048'});assert.deepEqual(snapshot,before);
  assert.throws(()=>bankSubledger({...snapshot,book:null},uid,{anio:'2048'}),/revision CPA/);
  assert.throws(()=>bankSubledger(snapshot,uid,{anio:'2048',cliente_id:'foreign'}),/Cliente/);
  assert.throws(()=>bankSubledger(snapshot,uid,{anio:'2048',cuenta_bancaria_id:'foreign'}),/Cuenta/);
  assert.throws(()=>bankSubledger({...snapshot,bank_dimensions:[]},uid,{anio:'2048'}),/Falta/);
  snapshot.entries=snapshot.entries.map(e=>({...e,requiere_dimension_bancaria:false}));snapshot.bank_dimensions=[];
  const legacy=bankSubledger(snapshot,uid,{periodo:'2048-01'}).data.filter(r=>!r.cuenta_bancaria_id);
  assert.equal(legacy[0].saldo_acumulado_anterior,100);assert.equal(legacy[0].movimientos.length,2);
  assert(legacy[0].movimientos.every(m=>m.origen_cuenta==='historial_sin_dimension'));
});
