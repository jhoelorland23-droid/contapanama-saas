import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementFile, statementAttempt, pendingStatementMetadata } from '../src/bankStatements.mjs';
test('PDF upload keeps exact bytes, hashes identity and does not persist private PDF in pending storage',async()=>{
  const pdf=new File(['%PDF-1.7\nQA\n%%EOF\n'],'test.pdf',{type:'application/pdf'});
  const data=await statementFile(pdf);
  assert.equal(atob(data.soporte_base64),await pdf.text());assert.equal(data.soporte_hash.length,64);
  const attempt=statementAttempt(null,{cantidad_creditos:'1',cantidad_debitos:'0'},data);
  assert.equal(attempt.cantidad_creditos,1);assert(attempt.idempotencia);
  const pending=pendingStatementMetadata(attempt);assert(!('soporte_base64' in pending));
  assert.deepEqual(statementAttempt(pending,{cantidad_creditos:9},data),attempt);
  assert.deepEqual(statementAttempt(pending,{}, {...data,soporte_nombre:'renamed.pdf'}),attempt);
  assert.throws(()=>statementAttempt(pending,{}, {...data,soporte_hash:'different'}),/no coincide/);
  assert.throws(()=>statementAttempt(pending,{},null),/Seleccione/);
});
test('PDF input rejects missing, oversized and other file types before sending',async()=>{
  await assert.rejects(statementFile(null));
  await assert.rejects(statementFile(new File(['text'],'text.txt')));
  await assert.rejects(statementFile({name:'big.pdf',size:4*1024*1024+1}));
});
