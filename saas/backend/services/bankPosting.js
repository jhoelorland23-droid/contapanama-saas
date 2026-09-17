const { randomUUID } = require('node:crypto');
const { hash, verifyEntry } = require('./journalLedger');
const { paymentEvents, fail } = require('./paymentLedger');

const bankLine = line => ['1020','1021'].includes(line.cuenta_codigo);
const dimensionKey = (entryId, order) => entryId + ':' + order;
const accountCode = account => account.banco.toLowerCase().includes('general') ? '1020' : '1021';
const dimensionHash = row => hash([row.asiento_id,row.usuario_id,row.cliente_id,row.orden,row.cuenta_bancaria_id,
  row.asiento_hash,row.fuente,row.asiento_origen_id]);

function verifyBankDimensions(uid, entries, dimensions, accounts) {
  const byEntry = new Map(entries.map(e=>[e.id,e])), seen = new Set(), ids = new Set();
  const byLine = new Map(dimensions.map(d=>[dimensionKey(d.asiento_id,d.orden),d]));
  const byAccount = new Map(accounts.map(a=>[a.id,a]));
  for (const row of dimensions) {
    const entry=byEntry.get(row.asiento_id), line=entry?.lineas[row.orden-1], key=dimensionKey(row.asiento_id,row.orden);
    if (!entry || row.usuario_id!==uid || entry.usuario_id!==uid || row.cliente_id!==entry.cliente_id ||
      !line || !Number.isInteger(row.orden) || !bankLine(line) || row.asiento_hash!==entry.contenido_hash || seen.has(key) || ids.has(row.id) ||
      dimensionHash(row)!==row.dimension_hash) fail('La cuenta del auxiliar no coincide con el asiento publicado.',409);
    const account=byAccount.get(row.cuenta_bancaria_id);
    if (row.cuenta_bancaria_id && (!account || account.usuario_id!==uid || account.cliente_id!==entry.cliente_id ||
      accountCode(account)!==line.cuenta_codigo)) fail('La cuenta del auxiliar pertenece a otro cliente o banco.',409);
    if (!['publicacion','reversa','sin_cuenta','anulacion'].includes(row.fuente)) fail('Origen del auxiliar invalido.',409);
    const cancellation=!entry.rectifica_id&&['reversa_pago','reversa_cobro'].includes(entry.tipo_asiento);
    const sourceEntry=byEntry.get(row.asiento_origen_id),sourceLine=sourceEntry?.lineas[row.orden-1];
    if ((row.fuente==='publicacion'&&!row.cuenta_bancaria_id) || (row.fuente==='sin_cuenta'&&row.cuenta_bancaria_id) ||
      (!!entry.rectifica_id !== (row.fuente==='reversa')) || (cancellation !== (row.fuente==='anulacion')) ||
      (entry.rectifica_id&&row.asiento_origen_id!==entry.rectifica_id) ||
      ((!entry.rectifica_id&&!cancellation)&&row.asiento_origen_id!==null) ||
      ((entry.rectifica_id||cancellation)&&(!sourceEntry||!sourceLine||sourceEntry.usuario_id!==uid||
        sourceEntry.cliente_id!==entry.cliente_id||sourceLine.cuenta_codigo!==line.cuenta_codigo||
        Number(sourceLine.debe)!==Number(line.haber)||Number(sourceLine.haber)!==Number(line.debe)||
        row.cuenta_bancaria_id!==(byLine.get(dimensionKey(row.asiento_origen_id,row.orden))?.cuenta_bancaria_id||null))) ||
      (cancellation&&(sourceEntry?.pago_id!==entry.pago_id||sourceEntry?.transaccion_id!==entry.transaccion_id||
        !['cobro','pago'].includes(sourceEntry?.tipo_asiento)))) {
      fail('La correccion debe conservar la cuenta original.',409);
    }
    seen.add(key);ids.add(row.id);
  }
  for (const entry of entries) {
    verifyEntry(entry);
    if (entry.requiere_dimension_bancaria) entry.lineas.forEach((line,index)=>{
      if(bankLine(line)&&!seen.has(dimensionKey(entry.id,index+1))) fail('Falta la cuenta historica de una linea bancaria publicada.',409);
    });
  }
}

function planBankDimensions(uid, pending, existing, dimensions, transactions, accounts) {
  verifyBankDimensions(uid,existing,dimensions,accounts);
  const previous=new Map(dimensions.map(d=>[dimensionKey(d.asiento_id,d.orden),d]));
  const sources=new Map(transactions.map(t=>[t.id,t])), result=[];
  const all=[...existing,...pending];
  for(const entry of pending){
    verifyEntry(entry);
    const tx=sources.get(entry.transaccion_id);
    const event=tx&&paymentEvents(tx).find(p=>'pago-'+p.id===entry.origen_clave);
    for(const [index,line] of entry.lineas.entries()){
      if(!bankLine(line))continue;
      let accountId=null,fuente='sin_cuenta',originId=null;
      const cancellation=!entry.rectifica_id&&['reversa_pago','reversa_cobro'].includes(entry.tipo_asiento);
      if(entry.rectifica_id||cancellation){
        // A correction reverses the ORIGINAL account, never the currently edited source.
        const original=entry.rectifica_id?all.find(e=>e.id===entry.rectifica_id):all.filter(e=>
          e.pago_id===entry.pago_id&&e.transaccion_id===entry.transaccion_id&&['cobro','pago'].includes(e.tipo_asiento)&&
          !e.rectifica_id&&(!entry.numero||e.numero<entry.numero)).sort((a,b)=>b.revision-a.revision)[0];
        if(!original)fail('No se encuentra el asiento original del pago anulado.',409);
        originId=original.id;
        accountId=previous.get(dimensionKey(originId,index+1))?.cuenta_bancaria_id||null;
        fuente=cancellation?'anulacion':'reversa';
      }else if(event?.cuenta_bancaria_id){
        const account=accounts.find(a=>a.id===event.cuenta_bancaria_id);
        if(!account || account.usuario_id!==uid || account.cliente_id!==entry.cliente_id ||
          account.banco!==event.banco || event.metodo_pago==='efectivo' || accountCode(account)!==line.cuenta_codigo) {
          fail('No se puede publicar el pago en una cuenta bancaria incompatible.',409);
        }
        accountId=account.id;fuente='publicacion';
      }
      const row={id:randomUUID(),usuario_id:uid,cliente_id:entry.cliente_id,asiento_id:entry.id,orden:index+1,
        cuenta_bancaria_id:accountId,asiento_origen_id:originId,asiento_hash:entry.contenido_hash,fuente,created_at:new Date().toISOString()};
      row.dimension_hash=dimensionHash(row);result.push(row);
      previous.set(dimensionKey(entry.id,index+1),row);
    }
  }
  return result;
}
module.exports={bankLine,dimensionKey,accountCode,dimensionHash,verifyBankDimensions,planBankDimensions};
