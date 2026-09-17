import { useEffect, useRef, useState } from 'react';
import { bankAccountLabel, pendingBankRequests } from './bankAccounts.mjs';
import { statementFile, statementAttempt, pendingStatementMetadata } from './bankStatements.mjs';

const stateLabels = { sin_extracto: 'Sin extracto', diferencias: 'Diferencias', coincidencia_aritmetica: 'Coincidencia aritmética' };
const continuityLabels = { sin_extracto: 'Sin extracto', sin_extracto_anterior: 'Sin extracto anterior', diferencia: 'Diferencia', coincide: 'Coincide' };
const moneyFields = [['saldo_inicial','Saldo inicial'],['creditos','Créditos del extracto'],['debitos','Débitos del extracto'],['saldo_final','Saldo final']];

export default function BankStatements({ api, ui, clients, accounts, query, user, defaultClient, defaultAccount, defaultMonth, canWrite }) {
  const { Btn, Modal, Icon, C, inpSt, fmt } = ui;
  const [rows,setRows] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [reload,setReload] = useState(0), [form,setForm] = useState(null), [file,setFile] = useState(null);
  const [pending,setPending] = useState(null), [saving,setSaving] = useState(false), [formError,setFormError] = useState('');
  const [closure,setClosure] = useState(null), [closureBusy,setClosureBusy] = useState(false), [closureError,setClosureError] = useState('');
  const [fileBusy,setFileBusy] = useState(false), [notice,setNotice] = useState('');
  const writeLock = useRef(false), fileSequence = useRef(0);
  const store = pendingBankRequests(sessionStorage,user.id);
  useEffect(()=>{
    let active=true;
    setLoading(true);setRows([]);setError('');
    api.get('/api/extractos-bancarios?'+query).then(r=>{if(active)setRows(r.data);})
      .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[api,query,reload]);
  useEffect(()=>{
    let active=true; setClosure(null);setClosureError('');
    if(!form?.cliente_id||!form?.periodo){setClosureBusy(false);return;}
    setClosureBusy(true);
    api.get('/api/contabilidad/cierre-estado?'+new URLSearchParams({periodo:form.periodo,cliente_id:form.cliente_id}))
      .then(r=>{if(active)setClosure(r.data?.estado||'abierto');})
      .catch(e=>{if(active)setClosureError(e.message);}).finally(()=>{if(active)setClosureBusy(false);});
    return ()=>{active=false;};
  },[api,form?.cliente_id,form?.periodo]);
  const open = row => {
    try {
      const saved=store.read('statement'); setPending(saved);setFile(null);setFormError('');setNotice('');
      fileSequence.current++;
      const current=row?.actual;
      setForm(saved||{cliente_id:row?.cliente_id||defaultClient||accounts.find(a=>a.id===defaultAccount)?.cliente_id||'',
        cuenta_bancaria_id:row?.cuenta_bancaria_id||defaultAccount||'',periodo:row?.periodo||defaultMonth,
        anterior_id:current?.id||null, saldo_inicial:current?.saldo_inicial??'',creditos:current?.creditos??'',
        debitos:current?.debitos??'',saldo_final:current?.saldo_final??'',cantidad_creditos:current?.cantidad_creditos??'',
        cantidad_debitos:current?.cantidad_debitos??'',motivo:''});
    } catch(e){setError(e.message);}
  };
  const chooseFile=async selected=>{
    const seq=++fileSequence.current;setFile(null);setFileBusy(true);setFormError('');
    try{const data=await statementFile(selected);if(seq===fileSequence.current)setFile(data);}
    catch(e){if(seq===fileSequence.current)setFormError(e.message);}
    finally{if(seq===fileSequence.current)setFileBusy(false);}
  };
  const save=async event=>{
    event.preventDefault();if(writeLock.current)return;
    writeLock.current=true;setSaving(true);setFormError('');
    try{
      const request=statementAttempt(pending,form,file), metadata=pendingStatementMetadata(request);
      store.save('statement',metadata);setPending(metadata);
      const result=await api.post('/api/extractos-bancarios',request);
      store.clear('statement');setPending(null);setForm(null);setFile(null);
      setNotice('Extracto conservado. Versión '+result.revision+'. Revisión CPA pendiente.');
      setReload(n=>n+1);
    }catch(e){
      if(e.status>=400&&e.status<500&&![408,429].includes(e.status)&&!(e.status===409&&e.message.includes('identificador'))){
        store.clear('statement');setPending(null);
      }
      setFormError(e.message);
    }finally{writeLock.current=false;setSaving(false);}
  };
  const download=async version=>{
    try{await api.pdf('/api/extractos-bancarios/'+version.id+'/soporte','extracto-'+version.periodo+'-v'+version.revision+'.pdf');}
    catch(e){setError(e.message);}
  };
  const cell={padding:'10px 8px',borderBottom:'1px solid '+C.border,fontSize:12,verticalAlign:'top',textAlign:'left'};
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  const locked=saving||Boolean(pending);
  return <section aria-label="Extractos bancarios">
    <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',marginBottom:12}}>
      <h2 style={{fontSize:16,margin:0}}>Extractos bancarios</h2>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <Btn variant="secondary" onClick={()=>setReload(n=>n+1)} disabled={loading}><Icon name="refresh" size={16}/>Actualizar extractos</Btn>
        <Btn onClick={()=>open()} disabled={!canWrite||!accounts.length}><Icon name="plus" size={16}/>Registrar extracto</Btn>
      </div>
    </div>
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert" style={{color:C.danger}}>{error}</p>}
    {loading?<p role="status">Cargando extractos...</p>:<>
      <div style={{fontSize:13,margin:'12px 0'}}>Sin extracto: {rows.filter(r=>!r.actual).length} · Con diferencias: {rows.filter(r=>r.estado==='diferencias').length} · Revisión CPA: pendiente</div>
      <div style={{overflowX:'auto'}}><table aria-label="Directorio mensual de extractos" style={{width:'100%',borderCollapse:'collapse',minWidth:760}}>
        <thead><tr>{['Mes / Cliente / Cuenta','Saldo inicial / final','Créditos / débitos','Importación / continuidad','Soporte / versiones'].map(label=><th key={label} style={cell}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.cuenta_bancaria_id+row.periodo}>
          <td style={cell}><strong>{row.periodo}</strong><br/>{row.cliente_nombre}<br/>{row.cuenta_nombre}{!row.cuenta_activa&&<div>Archivada</div>}</td>
          <td style={cell}>{row.actual?<>{fmt(row.actual.saldo_inicial)}<br/>{fmt(row.actual.saldo_final)}</>:'Sin extracto'}</td>
          <td style={cell}>{row.actual?<>{fmt(row.actual.creditos)} ({row.actual.cantidad_creditos})<br/>{fmt(row.actual.debitos)} ({row.actual.cantidad_debitos})</>:'Sin extracto'}</td>
          <td style={cell}><strong style={{color:row.estado==='diferencias'?C.danger:C.text}}>{stateLabels[row.estado]}</strong><br/>
            Continuidad: {continuityLabels[row.continuidad]}{row.diferencia_continuidad!==null&&row.diferencia_continuidad!==0&&<div>{fmt(row.diferencia_continuidad)}</div>}
            <details style={{marginTop:8}}><summary>Comparación de importación</summary>
              <div>Créditos: {fmt(row.importado.creditos)} ({row.importado.cantidad_creditos})</div>
              <div>Débitos: {fmt(row.importado.debitos)} ({row.importado.cantidad_debitos})</div>
              {row.diferencias&&<><div>Diferencia créditos: {fmt(row.diferencias.creditos)} ({row.diferencias.cantidad_creditos} filas)</div>
                <div>Diferencia débitos: {fmt(row.diferencias.debitos)} ({row.diferencias.cantidad_debitos} filas)</div>
                <div>Diferencia saldo final: {fmt(row.diferencias.saldo_final)}</div></>}
            </details>
          </td>
          <td style={{...cell,minWidth:190}}>
            <Btn variant="secondary" disabled={!canWrite} onClick={()=>open(row)}><Icon name={row.actual?'edit':'plus'} size={14}/>{row.actual?'Corregir extracto':'Registrar extracto'}</Btn>
            {row.actual&&<details style={{marginTop:8}}><summary>Versiones ({row.versiones.length})</summary>{row.versiones.map(v=><div key={v.id} style={{borderTop:'1px solid '+C.border,padding:'8px 0',overflowWrap:'anywhere',maxWidth:280}}>
              <strong>Versión {v.revision}</strong> · {String(v.created_at).slice(0,10)}<br/>{v.soporte_nombre}<br/>{v.motivo}
              <div style={{fontSize:11}}>SHA-256: {v.soporte_hash}</div>
              <Btn variant="secondary" title={'Descargar PDF original versión '+v.revision} aria-label={'Descargar PDF original versión '+v.revision} onClick={()=>download(v)}><Icon name="download" size={16}/></Btn>
            </div>)}</details>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length&&<p>Sin cuentas bancarias en este alcance.</p>}
    </>}
    {form&&<Modal title={form.anterior_id?'Corregir extracto bancario':'Registrar extracto bancario'} width={680} closeDisabled={saving} onClose={()=>{setForm(null);fileSequence.current++;}}>
      <form onSubmit={save}>
        {formError&&<p role="alert" style={{color:C.danger}}>{formError}</p>}
        {pending&&<p role="status" style={{color:C.warningText}}>Envío pendiente de confirmar. Conserve los datos y seleccione el mismo PDF para reintentar.</p>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:14}}>
          <label>Cliente<select aria-label="Cliente del extracto" required disabled={locked||Boolean(form.anterior_id)} value={form.cliente_id} style={inpSt}
            onChange={e=>setForm(f=>({...f,cliente_id:e.target.value,cuenta_bancaria_id:''}))}><option value="">Seleccione cliente</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label>Mes<input aria-label="Mes del extracto" type="month" required min="2000-01" max="2100-12" disabled={locked||Boolean(form.anterior_id)}
            value={form.periodo} onChange={e=>change('periodo',e.target.value)} style={inpSt}/></label>
          <label style={{gridColumn:'1 / -1',minWidth:0}}>Cuenta<select aria-label="Cuenta del extracto" required disabled={locked||Boolean(form.anterior_id)}
            value={form.cuenta_bancaria_id} onChange={e=>change('cuenta_bancaria_id',e.target.value)} style={{...inpSt,minWidth:0,maxWidth:'100%'}}>
            <option value="">Seleccione cuenta</option>{accounts.filter(a=>a.cliente_id===form.cliente_id).map(a=><option key={a.id} value={a.id}>{bankAccountLabel(a)}</option>)}</select>
            {form.cuenta_bancaria_id&&<div style={{fontSize:12,marginTop:6,overflowWrap:'anywhere'}}>{bankAccountLabel(accounts.find(a=>a.id===form.cuenta_bancaria_id))}</div>}</label>
          {moneyFields.map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" step="0.01" required disabled={locked} value={form[key]}
            min={['creditos','debitos'].includes(key)?0:-999999999999.99} max="999999999999.99" style={inpSt} onChange={e=>change(key,e.target.value)}/></label>)}
          {[['cantidad_creditos','Cantidad de créditos'],['cantidad_debitos','Cantidad de débitos']].map(([key,label])=><label key={key}>{label}<input aria-label={label}
            type="number" min="0" max="1000000" step="1" required disabled={locked} value={form[key]} style={inpSt} onChange={e=>change(key,e.target.value)}/></label>)}
          <label style={{gridColumn:'1 / -1'}}>PDF original<input aria-label="PDF original del extracto" type="file" accept=".pdf,application/pdf" required disabled={saving}
            style={{display:'block',maxWidth:'100%',marginTop:8}} onChange={e=>chooseFile(e.target.files?.[0])}/></label>
          {form.anterior_id&&<label style={{gridColumn:'1 / -1'}}>Motivo de corrección<textarea aria-label="Motivo de corrección del extracto" required minLength={10} maxLength={1000}
            value={form.motivo} disabled={locked} onChange={e=>change('motivo',e.target.value)} style={inpSt}/></label>}
        </div>
        {closure==='cerrado'&&<p role="status">Período cerrado. No se permiten nuevas versiones.</p>}
        {closureError&&<p role="alert">{closureError}</p>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20,flexWrap:'wrap'}}>
          <Btn type="button" variant="secondary" disabled={saving} onClick={()=>setForm(null)}>Cancelar</Btn>
          <Btn type="submit" loading={saving} disabled={!canWrite||fileBusy||!file||(!pending&&(closureBusy||closure==='cerrado'||Boolean(closureError)))}><Icon name="check" size={16}/>{pending?'Reintentar envío':'Guardar extracto'}</Btn>
        </div>
      </form>
    </Modal>}
  </section>;
}
