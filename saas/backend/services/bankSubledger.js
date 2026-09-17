const { bankLine, dimensionKey, verifyBankDimensions } = require('./bankPosting');
const { attachFolios } = require('./entityBooks');
const { cents, assertStatementHistory, statementMeta } = require('./bankStatement');
const { fail } = require('./paymentLedger');

function bankSubledger(snapshot, uid, scope) {
  const { entries, books, folios, bank_dimensions: dimensions, accounts, statements, clients, book } = snapshot;
  if (scope.cliente_id && !clients.some(c=>c.id===scope.cliente_id)) fail('Cliente no encontrado.',404);
  const account=scope.cuenta_bancaria_id&&accounts.find(a=>a.id===scope.cuenta_bancaria_id&&(!scope.cliente_id||a.cliente_id===scope.cliente_id));
  if (scope.cuenta_bancaria_id&&!account) fail('Cuenta no encontrada para el cliente.',404);
  if (!book) fail('El auxiliar requiere incorporar el libro mediante revision CPA.',409);
  verifyBankDimensions(uid,entries,dimensions,accounts);
  assertStatementHistory(statements,accounts);
  const published=attachFolios(uid,entries,books,folios);
  if (published.some(e=>!e.numero_libro)) fail('El auxiliar requiere asignar los folios del historial revisado.',409);
  const periods=scope.periodo?[scope.periodo]:Array.from({length:12},(_,i)=>scope.anio+'-'+String(i+1).padStart(2,'0'));
  const last=periods.at(-1), first=periods[0], byLine=new Map(dimensions.map(d=>[dimensionKey(d.asiento_id,d.orden),d]));
  const groups=new Map();
  for (const a of accounts.filter(a=>!scope.cliente_id||a.cliente_id===scope.cliente_id)) groups.set(a.id,{
    key:a.id,cliente_id:a.cliente_id,cliente_nombre:a.cliente_nombre||clients.find(c=>c.id===a.cliente_id)?.nombre||'',
    cuenta_bancaria_id:a.id,cuenta_nombre:a.banco+' - '+a.nombre+' ***'+a.numero.slice(-4),cuenta_activa:a.activa,movimientos:[],
  });
  for (const e of published.filter(e=>e.periodo<=last&&(!scope.cliente_id||e.cliente_id===scope.cliente_id))) {
    for (const [index,line] of e.lineas.entries()) {
      if (!bankLine(line)) continue;
      const dimension=byLine.get(dimensionKey(e.id,index+1)), id=dimension?.cuenta_bancaria_id||null;
      const key=id||'sin-cuenta:'+(e.cliente_id||'provisional')+':'+line.cuenta_codigo;
      if (!groups.has(key)) groups.set(key,{key,cliente_id:e.cliente_id,cliente_nombre:e.cliente_nombre||'Sin cliente',
        cuenta_bancaria_id:null,cuenta_nombre:'Sin cuenta acreditada - '+line.cuenta_codigo,cuenta_activa:null,movimientos:[]});
      groups.get(key).movimientos.push({asiento_id:e.id,numero:e.numero,libro_entidad_id:e.libro_entidad_id,numero_libro:e.numero_libro,
        transaccion_id:e.transaccion_id,pago_id:e.pago_id,fecha:e.fecha,periodo:e.periodo,descripcion:e.descripcion,
        tipo_asiento:e.tipo_asiento,rectifica_id:e.rectifica_id,motivo:e.motivo,orden:index+1,cuenta_codigo:line.cuenta_codigo,
        debe:cents(line.debe),haber:cents(line.haber),asiento_hash:e.contenido_hash,dimension_hash:dimension?.dimension_hash||null,
        asiento_origen_id:dimension?.asiento_origen_id||null,origen_cuenta:dimension?.fuente||'historial_sin_dimension'});
    }
  }
  const data=[];
  for (const group of groups.values()) {
    const sorted=group.movimientos.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.numero-b.numero||a.orden-b.orden);
    let balance=sorted.filter(e=>e.periodo<first).reduce((sum,e)=>sum+e.debe-e.haber,0);
    const pendingHistorical=group.cuenta_bancaria_id?0:sorted.filter(e=>e.periodo<first).length;
    for (const periodo of periods) {
      const previous=balance, month=sorted.filter(e=>e.periodo===periodo);
      let debit=0,credit=0;
      const movements=month.map(e=>{
        balance+=e.debe-e.haber;debit+=e.debe;credit+=e.haber;
        return {...e,debe:e.debe/100,haber:e.haber/100,saldo_acumulado:balance/100};
      });
      const statement=statements.filter(s=>s.cuenta_bancaria_id===group.cuenta_bancaria_id&&s.periodo===periodo).sort((a,b)=>b.revision-a.revision)[0];
      data.push({...group,movimientos:movements,periodo,saldo_acumulado_anterior:previous/100,debe:debit/100,haber:credit/100,
        saldo_acumulado:balance/100,pendientes_historicos:pendingHistorical,
        extracto:statement?statementMeta(statement):null,
        diferencias:statement?{saldo_inicial:(previous-cents(statement.saldo_inicial))/100,
          creditos:(debit-cents(statement.creditos))/100,debitos:(credit-cents(statement.debitos))/100,
          saldo_final:(balance-cents(statement.saldo_final))/100}:null,
        apertura_verificada:false,saldo_verificado:false,revision_cpa:'pendiente'});
    }
  }
  const totals=fields=>Object.fromEntries(fields.map(field=>[field,data.reduce((sum,row)=>sum+Math.round(row[field]*100),0)/100]));
  const totalsByMonth=periods.map(periodo=>({periodo,...Object.fromEntries(['saldo_acumulado_anterior','debe','haber','saldo_acumulado'].map(field=>
    [field,data.filter(r=>r.periodo===periodo).reduce((sum,r)=>sum+Math.round(r[field]*100),0)/100]))}));
  data.sort((a,b)=>a.cliente_nombre.localeCompare(b.cliente_nombre)||a.cuenta_nombre.localeCompare(b.cuenta_nombre)||a.key.localeCompare(b.key)||a.periodo.localeCompare(b.periodo));
  return {data:data.filter(r=>!scope.cuenta_bancaria_id||r.cuenta_bancaria_id===scope.cuenta_bancaria_id),
    control_mayor:{alcance:'todas_las_cuentas_del_cliente_o_cartera',...totals(['debe','haber']),meses:totalsByMonth},
    pendientes_sin_cuenta:data.filter(r=>!r.cuenta_bancaria_id).reduce((sum,r)=>sum+r.movimientos.length,0),
    alcance:'asientos_publicados',apertura_verificada:false,saldo_verificado:false};
}
module.exports={bankSubledger};
