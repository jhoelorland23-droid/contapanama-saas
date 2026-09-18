const qaCredentials = require('./helpers/qaCredentials');
// Isolated, manually driven browser fixture. Never reads or writes review data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const net = require('node:net');
const express = require('express');
const PDFDocument = require('pdfkit');
const root=path.resolve(__dirname,'..'), temp=fs.mkdtempSync(path.join(os.tmpdir(),'contapanama-statement-ui-'));
let child,web;
async function stop(){
  if(web)await new Promise(resolve=>web.close(resolve));
  if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
  assert.equal(path.dirname(temp),os.tmpdir());assert(path.basename(temp).startsWith('contapanama-statement-ui-'));
  console.log('STOPPED: isolated fixture preserved at '+temp);
}
async function main(){
  const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(r=>probe.close(r));
  const base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,[path.join(root,'server.local.js')],{cwd:root,windowsHide:true,stdio:'ignore',
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',JWT_SECRET:require('node:crypto').randomBytes(32).toString('hex'),CONTAPANAMA_LOCAL_DATA_DIR:temp,CONTAPANAMA_LOCAL_PERSISTENCE:'on'}});
  let ready=false;
  for(let i=0;i<150;i++){
    try{ready=(await fetch(base+'/health')).ok;}catch{}
    if(ready)break;if(child.exitCode!==null)throw new Error('Fixture stopped');
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready);
  const auxiliary=process.argv.includes('--subledger');
  const login=await fetch(base+'/api/auth/'+(auxiliary?'register':'login'),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(auxiliary?{nombre:'QA Auxiliar',email:'auxiliar@example.test',password:qaCredentials.randomPassword()}:
      {email:'admin@contapanama.pa',password:qaCredentials.password})}).then(r=>r.json());
  const post=async(url,body)=>{
    const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},body:JSON.stringify(body)});
    const data=await r.json();assert(r.ok,JSON.stringify(data));return data;
  };
  const client=await post('/api/clientes',{nombre:'QA Extractos Interfaz',tipo:'natural',ruc:'QA-INTERFAZ'});
  const account=await post('/api/cuentas-bancarias',{cliente_id:client.id,nombre:'Cuenta QA',banco:'Banco General',numero:'987654321234',tipo:'corriente',moneda:'USD',idempotencia:require('node:crypto').randomUUID()});
  const output=fs.createWriteStream(path.join(temp,'extracto-qa.pdf'));
  const pdf=new PDFDocument();pdf.pipe(output);pdf.text('QA EXTRACTO SINTETICO - SOLO PRUEBAS\nSaldo inicial y final: 100.00\nCreditos: 20.00 (1)\nDebitos: 20.00 (1)');pdf.end();await once(output,'finish');
  if(auxiliary){
    const document=await post('/api/transacciones',{cliente_id:client.id,fecha:'2026-08-01',tipo:'ingreso',descripcion:'Honorarios QA auxiliar',monto:1000,
      itbms:0,tasa_itbms:0,categoria_itbms:'exento',estado_pago:'pendiente'});
    for(const [fecha,importe] of [['2026-08-02',100],['2026-09-02',200]])await post('/api/transacciones/'+document.id+'/pagos',
      {fecha,importe,metodo_pago:'transferencia',banco:account.banco,cuenta_bancaria_id:account.id,idempotencia:require('node:crypto').randomUUID()});
    await post('/api/extractos-bancarios',{cliente_id:client.id,cuenta_bancaria_id:account.id,periodo:'2026-09',saldo_inicial:100,saldo_final:300,
      creditos:200,debitos:0,cantidad_creditos:1,cantidad_debitos:0,soporte_nombre:'extracto-qa.pdf',
      soporte_base64:fs.readFileSync(path.join(temp,'extracto-qa.pdf')).toString('base64'),idempotencia:require('node:crypto').randomUUID()});
  }
  const app=express();
  app.use('/api',async(req,res)=>{
    try{
      const response=await fetch(base+req.originalUrl,{method:req.method,headers:{'Content-Type':req.headers['content-type']||'application/json',
        ...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},...(['GET','HEAD'].includes(req.method)?{}:{body:req,duplex:'half'})});
      for(const key of ['content-type','content-disposition','cache-control','x-content-sha256'])if(response.headers.has(key))res.set(key,response.headers.get(key));
      res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
    }catch{res.status(502).json({error:'Fixture API unavailable'});}
  });
  app.use(express.static(path.resolve(root,'../frontend/dist')));
  web=app.listen(0,'127.0.0.1');await once(web,'listening');
  console.log(JSON.stringify({url:'http://127.0.0.1:'+web.address().port,temp,accountId:account.id,clientId:client.id,backendPid:child.pid}));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',async data=>{if(data.trim()==='stop'){await stop();process.exit(0);}});
}
main().catch(async e=>{console.error(e);await stop();process.exit(1);});
