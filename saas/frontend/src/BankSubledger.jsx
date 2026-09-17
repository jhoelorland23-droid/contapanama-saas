import {useEffect,useState} from 'react';
import {bankSubledgerCsv} from './bankSubledger.mjs';

export default function BankSubledger({api,ui,query}) {
  const {Btn,Icon,C,fmt}=ui;
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [reload,setReload]=useState(0),[selected,setSelected]=useState('');
  useEffect(()=>{
    let active=true;setLoading(true);setResult(null);setError('');setSelected('');
    api.get('/api/auxiliar-bancario?'+query).then(data=>{if(active)setResult(data);})
      .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[api,query,reload]);
  const download=()=>{
    try{
      const url=URL.createObjectURL(new Blob(['\uFEFF'+bankSubledgerCsv(result)],{type:'text/csv;charset=utf-8'}));
      const anchor=document.createElement('a');anchor.href=url;anchor.download='auxiliar-bancario.csv';anchor.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e.message);}
  };
  const cell={padding:'10px 8px',borderBottom:'1px solid '+C.border,fontSize:12,textAlign:'left',verticalAlign:'top'};
  const amount={...cell,textAlign:'right',whiteSpace:'nowrap'};
  const row=result?.data.find(r=>r.key+':'+r.periodo===selected);
  return <section aria-label="Auxiliar bancario">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <h2 style={{fontSize:16,margin:0}}>Auxiliar bancario</h2>
      <div style={{display:'flex',gap:8}}>
        <Btn variant="secondary" disabled={loading} onClick={()=>setReload(n=>n+1)} title="Actualizar auxiliar" aria-label="Actualizar auxiliar"><Icon name="refresh" size={16}/></Btn>
        <Btn variant="secondary" disabled={loading||!result||Boolean(error)} onClick={download}><Icon name="download" size={16}/>CSV auxiliar</Btn>
      </div>
    </div>
    <p style={{fontSize:13,color:C.warningText}}>Apertura: pendiente · Saldo bancario: no verificado</p>
    {error&&<p role="alert" style={{color:C.danger}}>{error}</p>}
    {loading&&<p role="status">Cargando auxiliar...</p>}
    {result&&<>
      {result.pendientes_sin_cuenta>0&&<p role="status">Líneas del período sin cuenta acreditada: {result.pendientes_sin_cuenta}</p>}
      <div style={{overflowX:'auto'}}><table aria-label="Auxiliar mensual por cuenta" style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
        <thead><tr>{['Mes / Cliente / Cuenta','Acumulado anterior','Debe','Haber','Acumulado al corte','Extracto / Diferencia','Detalle'].map(h=><th style={cell} key={h}>{h}</th>)}</tr></thead>
        <tbody>{result.data.map(r=><tr key={r.key+':'+r.periodo}>
          <td style={cell}><strong>{r.periodo}</strong><br/>{r.cliente_nombre}<br/>{r.cuenta_nombre}
            {r.cuenta_activa===false&&<div>Archivada</div>}{!r.cuenta_bancaria_id&&r.pendientes_historicos>0&&<div>Historial sin cuenta: {r.pendientes_historicos} líneas</div>}</td>
          <td style={amount}>{fmt(r.saldo_acumulado_anterior)}</td><td style={amount}>{fmt(r.debe)}</td><td style={amount}>{fmt(r.haber)}</td>
          <td style={amount}>{fmt(r.saldo_acumulado)}</td>
          <td style={cell}>{r.extracto?<><div>v{r.extracto.revision}: {fmt(r.extracto.saldo_final)}</div>
            <div style={{color:r.diferencias.saldo_final?C.danger:C.text}}>Diferencia: {fmt(r.diferencias.saldo_final)}</div>
            <details><summary>Flujos y apertura</summary><div>Inicial: {fmt(r.diferencias.saldo_inicial)}</div>
              <div>Créditos: {fmt(r.diferencias.creditos)}</div><div>Débitos: {fmt(r.diferencias.debitos)}</div></details></>:'Sin extracto'}</td>
          <td style={cell}><Btn variant="secondary" disabled={!r.movimientos.length} onClick={()=>setSelected(r.key+':'+r.periodo)}>{r.movimientos.length} movimientos</Btn></td>
        </tr>)}</tbody>
      </table></div>
      {!result.data.length&&<p>Sin cuentas ni líneas bancarias publicadas en este alcance.</p>}
      {row&&<section aria-label="Movimientos del auxiliar" style={{marginTop:24}}>
        <h3 style={{fontSize:15,overflowWrap:'anywhere'}}>{row.periodo} · {row.cuenta_nombre}</h3>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
          <thead><tr>{['Fecha / Asiento / Folio','Concepto','Debe','Haber','Acumulado'].map(h=><th style={cell} key={h}>{h}</th>)}</tr></thead>
          <tbody>{row.movimientos.map(m=><tr key={m.asiento_id+':'+m.orden}>
            <td style={cell}>{m.fecha}<br/>Asiento {m.numero} · Folio {m.numero_libro}
              <details style={{maxWidth:240,overflowWrap:'anywhere'}}><summary>Trazabilidad</summary>
                <div>Libro: {m.libro_entidad_id}</div><div>Asiento: {m.asiento_id}</div><div>Documento: {m.transaccion_id}</div>
                <div>Pago: {m.pago_id}</div>{m.rectifica_id&&<div>Reversa de: {m.rectifica_id}</div>}
                <div>SHA-256 asiento: {m.asiento_hash}</div><div>SHA-256 cuenta: {m.dimension_hash||'Sin vínculo histórico'}</div>
              </details></td>
            <td style={{...cell,maxWidth:320,overflowWrap:'anywhere'}}>{m.descripcion}<br/>{m.tipo_asiento.replaceAll('_',' ')}<br/>{m.motivo}</td>
            <td style={amount}>{fmt(m.debe)}</td><td style={amount}>{fmt(m.haber)}</td><td style={amount}>{fmt(m.saldo_acumulado)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
    </>}
  </section>;
}
