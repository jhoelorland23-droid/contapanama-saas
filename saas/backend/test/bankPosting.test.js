const { test } = require('node:test');
const assert = require('node:assert/strict');
const { journalPlan } = require('../services/journalLedger');
const { planBankDimensions, verifyBankDimensions, dimensionHash } = require('../services/bankPosting');
const localJournal = require('../services/localJournalRepository');

const uid='owner';
const accounts=['A','B'].map(id=>({id,usuario_id:uid,cliente_id:'client',banco:'Banco General'}));
const tx={id:'document',usuario_id:uid,cliente_id:'client',cliente_nombre:'QA',fecha:'2040-01-01',periodo:'2040-01',
  tipo:'ingreso',descripcion:'Honorarios',monto:200,itbms:0,estado_pago:'pendiente',
  pagos:accounts.map((a,i)=>({id:'payment-'+i,importe:100,fecha:'2040-02-01',metodo_pago:'transferencia',banco:a.banco,cuenta_bancaria_id:a.id}))};
const posted=(transactions,old=[])=>journalPlan(transactions,old).map(e=>({...e,usuario_id:uid,requiere_dimension_bancaria:true}));

test('equal payments at the same bank retain separate account identities; cash has no bank dimension',()=>{
  const entries=posted([tx]), dimensions=planBankDimensions(uid,entries,[],[],[tx],accounts);
  assert.deepEqual(dimensions.map(d=>d.cuenta_bancaria_id).sort(),['A','B']);
  verifyBankDimensions(uid,entries,dimensions,accounts);
  const cash={...tx,pagos:[{...tx.pagos[0],metodo_pago:'efectivo',banco:'',cuenta_bancaria_id:null}]};
  assert.deepEqual(planBankDimensions(uid,posted([cash]),[],[],[cash],accounts),[]);
});
test('correction reverses original account even when the current source has another account',()=>{
  const entries=posted([tx]), dimensions=planBankDimensions(uid,entries,[],[],[tx],accounts);
  const changed={...tx,pagos:tx.pagos.map(p=>({...p,importe:90,cuenta_bancaria_id:'B'}))};
  const next=posted([changed],entries), added=planBankDimensions(uid,next,entries,dimensions,[changed],accounts);
  const oldPayment=entries.find(e=>e.origen_clave==='pago-payment-0');
  const reversed=next.find(e=>e.rectifica_id===oldPayment.id);
  assert.equal(added.find(d=>d.asiento_id===reversed.id).cuenta_bancaria_id,'A');
  verifyBankDimensions(uid,[...entries,...next],[...dimensions,...added],accounts);
});
test('legacy unknown accounts stay unknown, including after correcting their sources',()=>{
  const legacy={...tx,pagos:[{...tx.pagos[0],cuenta_bancaria_id:null}]};
  const entries=posted([legacy]), dimensions=planBankDimensions(uid,entries,[],[],[legacy],accounts);
  assert.equal(dimensions[0].fuente,'sin_cuenta');
  assert.equal(dimensions[0].cuenta_bancaria_id,null);
  const old=entries.map(e=>({...e,requiere_dimension_bancaria:false}));
  const changed={...tx,pagos:[{...tx.pagos[0],importe:90}]};
  const next=posted([changed],old), added=planBankDimensions(uid,next,old,[],[changed],accounts);
  assert.equal(added.find(d=>d.fuente==='reversa').cuenta_bancaria_id,null);
});
test('published dimensions detect missing rows, altered hash, ownership, duplicates and wrong reversal account',()=>{
  const entries=posted([tx]), dimensions=planBankDimensions(uid,entries,[],[],[tx],accounts);
  assert.throws(()=>verifyBankDimensions(uid,entries,[],accounts),/Falta/);
  assert.throws(()=>verifyBankDimensions(uid,entries,[{...dimensions[0],cuenta_bancaria_id:'B'},dimensions[1]],accounts),/coincide/);
  assert.throws(()=>verifyBankDimensions(uid,entries,[...dimensions,dimensions[0]],accounts),/coincide/);
  assert.throws(()=>verifyBankDimensions(uid,entries,dimensions,accounts.map(a=>({...a,cliente_id:'other'}))),/otro/);
  const changed={...tx,pagos:tx.pagos.map(p=>({...p,importe:90}))};
  const next=posted([changed],entries), added=planBankDimensions(uid,next,entries,dimensions,[changed],accounts);
  const reversal=added.find(d=>d.fuente==='reversa'&&d.cuenta_bancaria_id==='A');
  reversal.cuenta_bancaria_id='B';reversal.dimension_hash=dimensionHash(reversal);
  assert.throws(()=>verifyBankDimensions(uid,[...entries,...next],[...dimensions,...added],accounts),/original/);
});
test('cancellation in a later month retains the payment account',()=>{
  const entries=posted([tx]), dimensions=planBankDimensions(uid,entries,[],[],[tx],accounts);
  const cancelled={...tx,pagos:tx.pagos.map(p=>({...p,anulado_fecha:'2040-03-05',anulado_motivo:'Duplicado confirmado'}))};
  const next=posted([cancelled],entries), added=planBankDimensions(uid,next,entries,dimensions,[cancelled],accounts);
  assert.deepEqual(added.map(d=>d.cuenta_bancaria_id).sort(),['A','B']);
  assert(next.every(e=>e.periodo==='2040-03'&&e.tipo_asiento==='reversa_cobro'));
});
test('local durability rejects late dimensions and modification without a source change',()=>{
  const entries=posted([tx]).map(e=>({...e,requiere_dimension_bancaria:false}));
  const before={asientos_contables:entries,transacciones:[],cuentas_bancarias:accounts,dimensiones_bancarias:[],
    libros_contables:[],libros_entidad:[],folios_libro:[]};
  const state=structuredClone(before);
  state.dimensiones_bancarias=planBankDimensions(uid,entries,[],[],[tx],accounts);
  assert.throws(()=>localJournal.syncWrite(state,before,()=>false),/solo puede/);
  const current=structuredClone(state);current.dimensiones_bancarias[0].cuenta_bancaria_id='B';
  assert.throws(()=>localJournal.syncWrite(current,state,()=>false),/modificar/);
});
