import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadQueue, createApiClient } from '../src/api.mjs';
test('read bursts are bounded without replaying or dropping a request', async () => {
  const queue=createReadQueue(4);let active=0,max=0,calls=0;
  const result=await Promise.all(Array.from({length:20},(_,i)=>queue(async()=>{
    active++;calls++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return i;
  })));
  assert.equal(max,4);assert.equal(calls,20);assert.deepEqual(result,Array.from({length:20},(_,i)=>i));
});
test('an obsolete queued read cannot reach the API or invalidate the session', async () => {
  const controller=new AbortController();controller.abort();
  const api=createApiClient('',{storage:{getItem:()=>null},fetchImpl:()=>{throw new Error('Must not fetch');}});
  await assert.rejects(api.get('/api/clientes',{signal:controller.signal}),{name:'AbortError'});
});
