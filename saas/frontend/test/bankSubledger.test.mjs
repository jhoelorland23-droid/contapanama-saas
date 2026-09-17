import {test} from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {bankSubledgerCsv} from '../src/bankSubledger.mjs';
test('subledger CSV preserves monthly summaries, original identifiers and safe text',()=>{
  const csv=bankSubledgerCsv({data:[{periodo:'2048-01',cliente_id:'client',cliente_nombre:'=FORMULA()',cuenta_bancaria_id:'A',cuenta_nombre:'Banco ***1234',
    saldo_acumulado_anterior:100,debe:20,haber:0,saldo_acumulado:120,extracto:null,diferencias:null,
    movimientos:[{fecha:'2048-01-02',asiento_id:'entry',numero:8,libro_entidad_id:'book',numero_libro:3,transaccion_id:'document',pago_id:'payment',
      debe:20,haber:0,saldo_acumulado:120,descripcion:'+cmd',asiento_hash:'abc',dimension_hash:'def',origen_cuenta:'publicacion'}]}]});
  const parsed=Papa.parse(csv,{header:true}).data;
  assert.equal(parsed.length,2);assert.equal(parsed[0].cliente,"'=FORMULA()");assert.equal(parsed[1].descripcion,"'+cmd");
  assert.equal(parsed[1].folio,'3');assert.equal(parsed[1].asiento_id,'entry');assert.equal(parsed[1].dimension_hash,'def');
  assert.equal(parsed[0].saldo_anterior,'100');assert.equal(parsed[0].diferencia_saldo,'');assert.equal(parsed[0].saldo_verificado,'no');
});
test('twelve empty months remain in the subledger CSV',()=>{
  const csv=bankSubledgerCsv({data:Array.from({length:12},(_,i)=>({periodo:'2048-'+String(i+1).padStart(2,'0'),movimientos:[]}))});
  assert.equal(Papa.parse(csv,{header:true}).data.length,12);
});
