const FlujoView = () => {
  const [paso, setPaso]     = useState(1);   // 1=cargar 2=validar 3=generar 4=exportar
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0,7));
  const [calidad, setCal]   = useState(null);
  const [diario,  setDiario]= useState(null);
  const [busy1,   setBusy1] = useState(false);
  const [busy2,   setBusy2] = useState(false);
  const [busy3,   setBusy3] = useState(false);
  const [txTotal, setTxTotal] = useState(null);

  // ── Paso 1: Verificar cuántas transacciones hay ─────────────────────────
  const verificarDatos = useCallback(async () => {
    setBusy1(true);
    try {
      const [tx, cal] = await Promise.all([
        api.get(`/api/transacciones/resumen?periodo=${periodo}`),
        api.get(`/api/errores/calidad/${periodo}`),
      ]);
      setTxTotal(tx);
      setCal(cal);
      setPaso(2);
    } catch(e){ alert(e.message); }
    finally{ setBusy1(false); }
  }, [periodo]);

  // ── Paso 2: Clasificar y validar ────────────────────────────────────────
  const clasificarYValidar = async () => {
    setBusy2(true);
    try {
      // Auto-clasificar pendientes
      if (calidad?.metricas?.sin_clasificar > 0) {
        await api.post('/api/contabilidad/clasificar-batch', { periodo });
      }
      // Refrescar calidad
      const cal = await api.get(`/api/errores/calidad/${periodo}`);
      setCal(cal);
      setPaso(3);
    } catch(e){ alert(e.message); }
    finally{ setBusy2(false); }
  };

  // ── Paso 3: Generar diario ──────────────────────────────────────────────
  const generarDiario = async () => {
    setBusy3(true);
    try {
      await api.post('/api/contabilidad/generar-diario', { periodo });
      const d = await api.get(`/api/contabilidad/diario?periodo=${periodo}`);
      setDiario(d);
      setPaso(4);
    } catch(e){ alert(e.message); }
    finally{ setBusy3(false); }
  };

  // ── Paso 4: Exportar ─────────────────────────────────────────────────────
  const exportarJSON = async () => {
    try {
      const data = await api.get(`/api/reportes/diario-json?periodo=${periodo}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `diario-${periodo}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ alert(e.message); }
  };

  const exportarPDF = async (tipo) => {
    try {
      const token = localStorage.getItem('cp_token');
      const res   = await fetch(`/api/reportes/${tipo}?periodo=${periodo}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `${tipo}-${periodo}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ alert(e.message); }
  };

  // ── Helpers UI ────────────────────────────────────────────────────────────
  const PASOS = ['Cargar período', 'Validar datos', 'Generar diario', 'Exportar'];
  const scoreColor = !calidad ? C.textMuted
    : calidad.score >= 90 ? C.success
    : calidad.score >= 70 ? C.warning : C.danger;

  return (
    <div>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Flujo de Trabajo</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Proceso simplificado: cargar → validar → generar → exportar</div>
      </div>

      {/* Stepper */}
      <div style={{display:'flex',alignItems:'center',marginBottom:32}}>
        {PASOS.map((nombre,i)=>{
          const n=i+1;
          const done=paso>n;
          const active=paso===n;
          return (
            <React.Fragment key={n}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,
                  background:done?C.success:active?C.accent:C.surfaceAlt,
                  color:done||active?'#fff':C.textMuted,
                  border:`2px solid ${done?C.success:active?C.accent:C.border}`}}>
                  {done?'✓':n}
                </div>
                <div style={{fontSize:12,fontWeight:active?700:400,color:active?C.text:C.textMuted,whiteSpace:'nowrap'}}>{nombre}</div>
              </div>
              {i<PASOS.length-1&&(
                <div style={{flex:1,height:2,margin:'0 8px',background:paso>n?C.success:C.border,marginBottom:20}}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── PASO 1: Seleccionar período ──────────────────────────────────── */}
      {paso===1&&(
        <Card>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Seleccionar período contable</div>
          <div style={{fontSize:13,color:C.textMuted,marginBottom:20}}>Elige el mes que deseas procesar. El sistema verificará automáticamente los datos.</div>
          <div style={{display:'flex',gap:16,alignItems:'flex-end'}}>
            <div style={{flex:1,maxWidth:240}}>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:'uppercase'}}>Período</label>
              <input type='month' value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:'100%'}}/>
            </div>
            <Btn onClick={verificarDatos} loading={busy1}>
              <Icon name='trending' size={15} color='#fff'/>Verificar Período
            </Btn>
          </div>
        </Card>
      )}

      {/* ── PASO 2: Validar datos ─────────────────────────────────────────── */}
      {paso===2&&calidad&&(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Score */}
          <Card style={{display:'flex',alignItems:'center',gap:20,padding:'16px 24px'}}>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontSize:40,fontWeight:800,color:scoreColor,lineHeight:1}}>{calidad.score}</div>
              <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>SCORE</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>
                Período {periodo} · {calidad.metricas?.total_transacciones||0} transacciones
              </div>
              <div style={{height:8,background:C.surfaceAlt,borderRadius:20,overflow:'hidden',marginBottom:8}}>
                <div style={{height:'100%',width:`${calidad.score}%`,background:scoreColor,borderRadius:20}}/>
              </div>
              <div style={{display:'flex',gap:16,fontSize:12,color:C.textMuted}}>
                {calidad.metricas?.sin_clasificar>0&&<span style={{color:C.warningText}}>⚠ {calidad.metricas.sin_clasificar} sin clasificar</span>}
                {calidad.metricas?.sin_asiento>0&&<span style={{color:C.warningText}}>⚠ {calidad.metricas.sin_asiento} sin asiento</span>}
                {calidad.metricas?.descuadres>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.descuadres} descuadre(s)</span>}
                {calidad.metricas?.ingresos_sin_debito>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.ingresos_sin_debito} ingreso sin débito fiscal</span>}
                {calidad.metricas?.exentos_con_itbms>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.exentos_con_itbms} exento con ITBMS</span>}
                {calidad.score>=90&&<span style={{color:C.success}}>✓ Datos listos para generar</span>}
              </div>
            </div>
          </Card>

          {/* Alertas detalladas */}
          {calidad.alertas?.ingreso_sin_debito?.length>0&&(
            <div style={{background:C.dangerBg,border:`1px solid ${C.danger}44`,borderLeft:`4px solid ${C.danger}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.dangerText}}>Ingresos con ITBMS sin marcar como débito fiscal:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>Estos ingresos tienen ITBMS > 0 pero no tienen itbms_aplica=true. El asiento no generará débito fiscal correctamente.</div>
              {calidad.alertas.ingreso_sin_debito.map((t,i)=>(
                <div key={i} style={{fontSize:11,color:C.dangerText,marginTop:6}}>• {t.fecha} — {t.descripcion} — ITBMS: {fmt(t.itbms)}</div>
              ))}
            </div>
          )}
          {calidad.alertas?.exento_con_itbms?.length>0&&(
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.warningText}}>Transacciones marcadas como exentas pero con ITBMS > 0:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>Si son exentas, el campo ITBMS debería ser 0. Corregir en el Diario Contable.</div>
              {calidad.alertas.exento_con_itbms.map((t,i)=>(
                <div key={i} style={{fontSize:11,color:C.warningText,marginTop:6}}>• {t.fecha} — {t.descripcion} ({t.tipo}) — ITBMS: {fmt(t.itbms)}</div>
              ))}
            </div>
          )}
          {calidad.alertas?.sin_cuenta?.length>0&&(
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.warningText}}>{calidad.alertas.sin_cuenta.length} gasto(s) sin cuenta contable:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>El botón Auto-clasificar las asignará automáticamente.</div>
            </div>
          )}

          <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'center'}}>
            <button onClick={()=>setPaso(1)} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 18px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              ← Volver
            </button>
            <div style={{display:'flex',gap:10}}>
              {calidad.metricas?.sin_clasificar>0&&(
                <Btn onClick={clasificarYValidar} loading={busy2} variant='ghost'>
                  <Icon name='brain' size={15} color={C.accent}/>Auto-clasificar y continuar
                </Btn>
              )}
              <Btn onClick={()=>setPaso(3)} variant={calidad.score>=70?'primary':'secondary'}>
                {calidad.score>=70?'Generar Diario →':'Continuar de todas formas →'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── PASO 3: Generar diario ────────────────────────────────────────── */}
      {paso===3&&(
        <Card>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Generar Diario Combinado</div>
          <div style={{fontSize:13,color:C.textMuted,marginBottom:20}}>
            Se generarán los asientos contables con partida doble para todas las transacciones de {periodo}.
            Los asientos existentes serán reemplazados.
          </div>
          <div style={{background:C.infoBg,border:`1px solid ${C.accent}22`,borderRadius:8,padding:'12px 16px',marginBottom:20,fontSize:12,color:C.infoText}}>
            <strong>¿Qué genera el diario?</strong><br/>
            Por cada transacción: asiento con DR (débito) y CR (crédito) en partida doble.
            ITBMS débito fiscal → CR 2201. ITBMS crédito fiscal (con factura) → DR 1301.
            Cuotas de préstamo → DR capital (2301) + DR interés (6401).
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'space-between'}}>
            <button onClick={()=>setPaso(2)} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 18px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              ← Volver
            </button>
            <Btn onClick={generarDiario} loading={busy3}>
              <Icon name='journal' size={15} color='#fff'/>Generar Diario {periodo}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── PASO 4: Exportar ──────────────────────────────────────────────── */}
      {paso===4&&diario&&(
        <div>
          {/* Resumen del diario generado */}
          <Card style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:C.text}}>✓ Diario generado correctamente</div>
                <div style={{fontSize:13,color:C.textMuted,marginTop:3}}>{diario.resumen?.total_lineas||0} líneas · Período {periodo}</div>
              </div>
              <span style={{background:diario.resumen?.cuadra?C.successBg:C.dangerBg,color:diario.resumen?.cuadra?C.successText:C.dangerText,padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>
                {diario.resumen?.cuadra?'✓ CUADRA':'✗ NO CUADRA'}
              </span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {[
                {l:'Total Debe',  v:fmt(diario.resumen?.total_debe),  c:C.danger},
                {l:'Total Haber', v:fmt(diario.resumen?.total_haber), c:C.success},
                {l:'Diferencia',  v:fmt(Math.abs((diario.resumen?.total_debe||0)-(diario.resumen?.total_haber||0))), c:diario.resumen?.cuadra?C.success:C.danger},
              ].map(k=>(
                <div key={k.l} style={{background:C.surfaceAlt,borderRadius:8,padding:'12px 16px'}}>
                  <div style={{fontSize:11,color:C.textMuted,fontWeight:600,textTransform:'uppercase',marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Opciones de exportación */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:20}}>
            {[
              {label:'Diario PDF',        icon:'pdf',     action:()=>exportarPDF('diario'),             color:C.accent},
              {label:'ITBMS 430 PDF',     icon:'tax',     action:()=>exportarPDF('itbms'),              color:'#7c3aed'},
              {label:'Estado Result. PDF',icon:'trending', action:()=>exportarPDF('estado-resultados'), color:C.success},
              {label:'Diario JSON',       icon:'layers',   action:exportarJSON,                         color:'#6366f1'},
              {label:'Calidad PDF',       icon:'shield',   action:()=>window.open(`/api/reportes/calidad-pdf?periodo=${periodo}`,'_blank'), color:C.danger},
            ].map(r=>(
              <div key={r.label} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{width:34,height:34,background:r.color+'18',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon name={r.icon} size={16} color={r.color}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{r.label}</div>
                </div>
                <button onClick={r.action} style={{background:r.color,color:'#fff',border:'none',padding:'7px 14px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',textAlign:'center'}}>
                  Descargar
                </button>
              </div>
            ))}
          </div>

          {/* Primeras entradas del diario */}
          {diario.entradas?.slice(0,3).map(entrada=>(
            <Card key={entrada.fecha} style={{marginBottom:12,padding:0,overflow:'hidden'}}>
              <div style={{background:'#dbeafe',padding:'8px 16px',display:'flex',justifyContent:'space-between'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#1e40af'}}>📅 {entrada.fecha}</div>
                <div style={{fontSize:12,color:'#1e40af'}}>{entrada.asientos?.length||0} líneas</div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Cuenta</TH><TH>Descripción</TH><TH right>Debe</TH><TH right>Haber</TH><TH>Tipo</TH>
                </tr></thead>
                <tbody>
                  {(entrada.asientos||[]).map((a,i)=>(
                    <tr key={i} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
                        <div style={{fontWeight:700,color:C.text}}>{a.cuenta_codigo}</div>
                        <div style={{fontSize:10,color:C.textLight}}>{(a.cuenta_nombre||'').split(' - ').slice(1).join(' ')}</div>
                      </TD>
                      <TD style={{fontSize:12,maxWidth:180}}>{a.descripcion}</TD>
                      <TD style={{textAlign:'right',fontWeight:700,color:a.debe>0?C.danger:C.textLight}}>{a.debe>0?fmt(a.debe):'—'}</TD>
                      <TD style={{textAlign:'right',fontWeight:700,color:a.haber>0?C.success:C.textLight}}>{a.haber>0?fmt(a.haber):'—'}</TD>
                      <TD><span style={{fontSize:10,padding:'2px 6px',borderRadius:20,fontWeight:700,textTransform:'uppercase',background:a.tipo_linea==='itbms_debito'?C.dangerBg:a.tipo_linea==='itbms_credito'?C.successBg:C.surfaceAlt,color:a.tipo_linea==='itbms_debito'?C.dangerText:a.tipo_linea==='itbms_credito'?C.successText:C.textMuted}}>
                        {(a.tipo_linea||'').replace('_',' ')}
                      </span></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {diario.entradas?.length>3&&(
            <div style={{textAlign:'center',fontSize:12,color:C.textMuted,padding:'8px'}}>
              ... y {diario.entradas.length-3} fechas más. Ver completo en Motor Contable → Diario Contable.
            </div>
          )}

          <div style={{display:'flex',justifyContent:'center',marginTop:16}}>
            <button onClick={()=>{setPaso(1);setCal(null);setDiario(null);setTxTotal(null);}} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 20px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              Procesar otro período
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
