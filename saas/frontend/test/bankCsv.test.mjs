import { test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { parseBankCsv, reconciliationCsv, bankColumns } from '../src/bankCsv.mjs';
const line = '2040-01-02,"Deposito, cliente ""A""",100.25,credito,Banco General,000123';
const account={id:'account',cliente_id:'client',banco:'Banco General',activa:true};
test('quoted commas, escaped quotes, multiline cells and references survive parsing', () => {
  const rows = parseBankCsv(bankColumns.join(',')+'\n'+line, 'client',account);
  assert.equal(rows[0].descripcion, 'Deposito, cliente "A"');
  assert.equal(rows[0].referencia, '000123');
  assert.equal(rows[0].cliente_id, 'client');
  assert.equal(rows[0].cuenta_bancaria_id,'account');
  assert.equal(parseBankCsv(line.replace('Deposito, cliente', 'Deposito\ncliente'), 'client',account).length, 1);
  assert.equal(parseBankCsv('2040-01-02;Servicio;20;debito;BAC;000124', 'client',{...account,banco:'BAC'})[0].tipo, 'debito');
});
test('malformed batches are rejected without silently dropping or inferring values', () => {
  for (const value of [line+'\n2040-01-03,bad',line.replace('credito','unknown'),line.replace('100.25','-1'),
    line.replace('Banco General',''),line.replace('2040-01-02','2040-02-30'),line+'\n,,,,,']) assert.throws(()=>parseBankCsv(value,'client',account));
  assert.throws(()=>parseBankCsv(line,''));
  for(const wrong of [null,{...account,activa:false},{...account,cliente_id:'other'},{...account,banco:'BAC'}]) assert.throws(()=>parseBankCsv(line,'client',wrong));
});
test('CSV export includes all sections, owner and cutoff, and protects formulas', () => {
  const row = { cliente_id:'a',cliente_nombre:'=malicious',cuenta_bancaria_id:'account',cuenta_nombre:'Cuenta ***1234',banco:'Banco General',fecha:'2040-01-02',descripcion:'@SUM(1)',
    monto:10,importe:10,total_documento:10 };
  const csv = reconciliationCsv({ fecha_corte:'2040-01-31',resumen:[row],registros_contables:[row],
    movimientos_periodo:[row],transacciones_pendientes:[row],movimientos_pendientes:[row],documentos_sin_pago:[row] });
  const parsed = Papa.parse(csv,{header:true}).data;
  assert.equal(parsed.length,6);
  assert(parsed.every(r=>r.cliente_id==='a'&&r.cliente.startsWith("'=")&&r.saldo_verificado==='no'));
  assert(parsed.every(r=>r.cuenta_bancaria_id==='account'&&r.cuenta==='Cuenta ***1234'));
});
