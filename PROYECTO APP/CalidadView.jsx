/**
 * CalidadView.jsx — Control de Calidad Contable (Producción)
 *
 * Checks implementados:
 *   ✓ Sin clasificar (cuenta_contable IS NULL)
 *   ✓ Sin asiento generado
 *   ✓ ITBMS sin factura (deducible pero sin respaldo)
 *   ✓ Descuadres contables (debe ≠ haber)
 *   ✓ Duplicados potenciales
 *   ✓ Ingresos con ITBMS sin débito fiscal marcado
 *   ✓ Exentos con ITBMS > 0 (inconsistencia)
 *   ✓ Gastos sin cuenta contable
 *
 * Endpoint principal: GET /api/errores/calidad/:periodo
 */
const CalidadView = () => {
  const [stats,      setStats]    = useState(null);
  const [errores,    setErrores]  = useState([]);
  const [calidad,    setCalidad]  = useState(null);
  const [cuadreRes,  setCuadre]   = useState(null);
  const [busy,       setBusy]     = useState(true);
  const [cuadreBusy, setCuadreBusy] = useState(false);
  const [periodo,    setPeriodo]  = useState(new Date().toISOString().slice(0, 7));
  const [filtro,     setFiltro]   = useState('todos');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, e, cal] = await Promise.all([
        api.get(`/api/errores/stats?periodo=${periodo}`),
        api.get(`/api/errores?periodo=${periodo}`),
        api.get(`/api/errores/calidad/${periodo}`),
      ]);
      setStats(s); setErrores(e.data || []); setCalidad(cal);
    } catch (ex) { console.error('CalidadView:', ex.message); }
    finally { setBusy(false); }
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  const verificarCuadre = async () => {
    setCuadreBusy(true); setCuadre(null);
    try { setCuadre(await api.get(`/api/errores/cuadre/${periodo}`)); }
    catch (e) { alert(e.message); }
    finally { setCuadreBusy(false); }
  };

  const resolver = async (id) => {
    try { await api.patch(`/api/errores/${id}/resolver`, {}); load(); }
    catch (e) { alert(e.message); }
  };

  const sevColor = {
    critico: [C.dangerBg, C.dangerText],
    error:   [C.dangerBg, C.dangerText],
    warning: [C.warningBg, C.warningText],
    info:    [C.infoBg,   C.infoText],
  };

  const filtrados = errores.filter(e =>
    filtro === 'todos'    ? true :
    filtro === 'criticos' ? e.severidad === 'critico' :
    filtro === 'warning'  ? e.severidad === 'warning'  :
    e.severidad === 'info'
  );

  const scoreColor = !calidad ? C.textMuted
    : calidad.score >= 90 ? C.success
    : calidad.score >= 70 ? C.warning : C.danger;

  const nivelLabel = { excelente:'Excelente ✓', bueno:'Bueno', regular:'Regular',
    requiere_atencion:'Requiere Atención ⚠' }[calidad?.nivel] || '';

  const alertas = calidad?.alertas || {};
  const met     = calidad?.metricas || {};

  // Definir bloques de alerta dinámicos
  const ALERT_BLOCKS = [
    {
      show: (met.sin_clasificar || 0) > 0,
      sev: 'ATENCIÓN', borderColor: C.warning, bg: C.warningBg, textColor: C.warningText,
      title: `${met.sin_clasificar} transacción(es) sin clasificar`,
      desc: 'Ve a Motor Contable → Auto-clasificar período para asignarles cuenta automáticamente.',
      items: [],
    },
    {
      show: (met.descuadres || 0) > 0,
      sev: 'CRÍTICO', borderColor: C.danger, bg: C.dangerBg, textColor: C.dangerText,
      title: `${met.descuadres} asiento(s) no cuadran (débito ≠ crédito)`,
      desc: 'Ve a Motor Contable → Diario Contable → Regenerar Diario.',
      items: (alertas.descuadres || []).slice(0, 3).map(d =>
        `${d.descripcion} — DR: ${d.total_debe} / CR: ${d.total_haber} / Δ: ${d.diferencia}`),
    },
    {
      show: (met.ingresos_sin_debito || 0) > 0,
      sev: 'CRÍTICO', borderColor: C.danger, bg: C.dangerBg, textColor: C.dangerText,
      title: `${met.ingresos_sin_debito} ingreso(s) con ITBMS sin marcar como débito fiscal`,
      desc: 'El asiento no generará la línea ITBMS 2201. Edita la transacción y activa "ITBMS aplica".',
      items: (alertas.ingreso_sin_debito || []).slice(0, 3).map(t =>
        `${t.fecha} — ${t.descripcion} — ITBMS: ${fmt(t.itbms)}`),
    },
    {
      show: (met.exentos_con_itbms || 0) > 0,
      sev: 'ATENCIÓN', borderColor: C.warning, bg: C.warningBg, textColor: C.warningText,
      title: `${met.exentos_con_itbms} transacción(es) marcada(s) como exenta(s) pero con ITBMS > 0`,
      desc: 'Si la transacción es exenta de ITBMS, el campo ITBMS debería ser 0. Corregir en Diario Contable.',
      items: (alertas.exento_con_itbms || []).slice(0, 3).map(t =>
        `${t.fecha} — ${t.descripcion} (${t.tipo}) — ITBMS: ${fmt(t.itbms)}`),
    },
    {
      show: (met.itbms_sin_factura || 0) > 0,
      sev: 'ATENCIÓN', borderColor: C.warning, bg: C.warningBg, textColor: C.warningText,
      title: `${met.itbms_sin_factura} gasto(s) con ITBMS deducible pero sin factura`,
      desc: 'El crédito fiscal ITBMS NO aplica sin factura de respaldo. Activa "Tiene factura" o desmarca "Deducible".',
      items: (alertas.sin_factura || []).slice(0, 3).map(t =>
        `${t.fecha} — ${t.descripcion} — ITBMS: ${fmt(t.itbms)}`),
    },
    {
      show: (alertas.sin_cuenta || []).length > 0,
      sev: 'ATENCIÓN', borderColor: C.warning, bg: C.warningBg, textColor: C.warningText,
      title: `${(alertas.sin_cuenta || []).length} gasto(s) sin cuenta contable`,
      desc: 'Auto-clasificar en Motor Contable les asignará una cuenta automáticamente.',
      items: [],
    },
    {
      show: (met.duplicados_potenciales || 0) > 0,
      sev: 'REVISAR', borderColor: C.accent, bg: C.infoBg, textColor: C.infoText,
      title: `${met.duplicados_potenciales} posible(s) duplicado(s)`,
      desc: 'Misma fecha, monto y banco más de una vez. Verifica que no se importaron dos veces.',
      items: (alertas.duplicados || []).slice(0, 3).map(d =>
        `${d.fecha} — ${fmt(d.monto)} en ${d.banco} × ${d.veces}`),
    },
  ].filter(a => a.show);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:C.text }}>Control de Calidad Contable</div>
          <div style={{ fontSize:14, color:C.textMuted, marginTop:3 }}>
            Validaciones ITBMS · Descuadres · Datos incompletos
          </div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <input type='month' value={periodo} onChange={e => setPeriodo(e.target.value)}
            style={{ ...inpSt, width:155, padding:'8px 12px' }} />
          <Btn onClick={verificarCuadre} loading={cuadreBusy} variant='ghost'>
            <Icon name='shield' size={15} color={C.accent} /> Verificar Cuadre
          </Btn>
        </div>
      </div>

      {/* Resultado verificación cuadre */}
      {cuadreRes && (
        <div style={{
          background: cuadreRes.cuadra ? C.successBg : C.dangerBg,
          border: `1px solid ${cuadreRes.cuadra ? C.success : C.danger}33`,
          borderLeft: `4px solid ${cuadreRes.cuadra ? C.success : C.danger}`,
          borderRadius:10, padding:'14px 20px', marginBottom:20,
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{cuadreRes.mensaje}</div>
            {(cuadreRes.anomalias?.length || 0) > 0 && (
              <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>
                {cuadreRes.anomalias.length} asiento(s) registrados en el log de errores
              </div>
            )}
          </div>
          <Icon name={cuadreRes.cuadra ? 'check' : 'x'} size={24}
            color={cuadreRes.cuadra ? C.success : C.danger} />
        </div>
      )}

      {/* Score card */}
      {!busy && calidad && (
        <>
          <Card style={{ marginBottom:20, display:'flex', alignItems:'center', gap:24, padding:'16px 24px' }}>
            <div style={{ textAlign:'center', flexShrink:0 }}>
              <div style={{ fontSize:44, fontWeight:800, color:scoreColor, lineHeight:1 }}>
                {calidad.score}
              </div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:4, textTransform:'uppercase' }}>/ 100</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:8 }}>
                {nivelLabel} · {met.total_transacciones || 0} transacciones
              </div>
              <div style={{ height:10, background:C.surfaceAlt, borderRadius:20, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${calidad.score}%`,
                  background:scoreColor, borderRadius:20, transition:'width 0.5s ease' }} />
              </div>
              <div style={{ display:'flex', gap:14, fontSize:12, marginTop:8, flexWrap:'wrap' }}>
                {(met.sin_clasificar    || 0)>0 && <span style={{color:C.warningText}}>⚠ {met.sin_clasificar} sin clasificar</span>}
                {(met.descuadres        || 0)>0 && <span style={{color:C.dangerText }}>✗ {met.descuadres} descuadre(s)</span>}
                {(met.ingresos_sin_debito||0)>0 && <span style={{color:C.dangerText }}>✗ {met.ingresos_sin_debito} sin débito fiscal</span>}
                {(met.exentos_con_itbms || 0)>0 && <span style={{color:C.dangerText }}>✗ {met.exentos_con_itbms} exento c/ITBMS</span>}
                {(met.exentos           || 0)>0 && <span style={{color:C.textLight  }}>◌ {met.exentos} exentos</span>}
                {calidad.score>=90 && ALERT_BLOCKS.length===0 && <span style={{color:C.success}}>✓ Sin alertas activas</span>}
              </div>
            </div>
            <button onClick={() => window.open(`/api/reportes/calidad-pdf?periodo=${periodo}`, '_blank')}
              style={{ background:C.dangerBg, border:`1px solid ${C.danger}22`, padding:'8px 14px',
                borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600,
                color:C.dangerText, fontFamily:'inherit', flexShrink:0 }}>
              📄 PDF Calidad
            </button>
          </Card>

          {/* Alertas detalladas */}
          {ALERT_BLOCKS.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
              {ALERT_BLOCKS.map((a, i) => (
                <div key={i} style={{ background:a.bg, border:`1px solid ${a.borderColor}44`,
                  borderLeft:`4px solid ${a.borderColor}`, borderRadius:8, padding:'12px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                    <strong style={{ color:a.textColor, fontSize:13 }}>{a.title}</strong>
                    <span style={{ fontSize:10, background:a.bg, color:a.textColor, padding:'2px 10px',
                      borderRadius:20, fontWeight:700, border:`1px solid ${a.borderColor}44`, flexShrink:0 }}>
                      {a.sev}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{a.desc}</div>
                  {a.items.map((item, j) => (
                    <div key={j} style={{ fontSize:11, color:a.textColor, marginTop:6,
                      fontFamily:'JetBrains Mono,monospace',
                      background:`${a.borderColor}10`, padding:'4px 8px', borderRadius:4 }}>
                      • {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* KPI cards */}
      {!busy && stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:20 }}>
          {[
            { l:'Críticos',     v:stats.criticos  ||0, c:C.danger,  ico:'x'     },
            { l:'Errores',      v:stats.errores   ||0, c:C.danger,  ico:'x'     },
            { l:'Advertencias', v:stats.warnings  ||0, c:C.warning, ico:'bell'  },
            { l:'Pendientes',   v:stats.pendientes||0, c:C.accent,  ico:'shield' },
          ].map(k => <KpiCard key={k.l} label={k.l} value={k.v} icon={k.ico} color={k.c} />)}
        </div>
      )}

      {/* Filtros log */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['todos','Todos'],['criticos','Críticos'],['warning','Advertencias'],['info','Info']].map(([v,l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{
            padding:'6px 14px', borderRadius:20, cursor:'pointer', fontFamily:'inherit',
            border:`1px solid ${filtro===v ? C.accent : C.border}`,
            background:filtro===v ? C.infoBg : 'none',
            color:filtro===v ? C.accent : C.textMuted, fontWeight:600, fontSize:12,
          }}>{l}</button>
        ))}
      </div>

      {/* Tabla errores */}
      {busy ? <Spinner /> : filtrados.length === 0 ? (
        <Card style={{ textAlign:'center', padding:'48px 24px' }}>
          <Icon name='shield' size={40} color={C.success} />
          <div style={{ fontSize:15, fontWeight:600, color:C.textMuted, marginTop:12 }}>
            Sin errores en el log para {periodo}
          </div>
        </Card>
      ) : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.surfaceAlt }}>
              <TH>Tipo</TH><TH>Descripción</TH><TH>Transacción</TH>
              <TH>Severidad</TH><TH>Fecha</TH><TH>Acción</TH>
            </tr></thead>
            <tbody>
              {filtrados.map((e, i) => {
                const [bg, tc] = sevColor[e.severidad] || sevColor.info;
                return (
                  <tr key={e.id} style={{ background:i%2?C.surfaceAlt:C.surface, opacity:e.resuelto?0.5:1 }}>
                    <TD style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:C.infoText }}>
                      {e.tipo_error}
                    </TD>
                    <TD style={{ maxWidth:220, fontSize:12 }}>{e.descripcion}</TD>
                    <TD style={{ fontSize:12, color:C.textMuted }}>
                      {e.tx_descripcion ? e.tx_descripcion.slice(0, 28)+'…' : '—'}
                    </TD>
                    <TD>
                      <span style={{ background:bg, color:tc, padding:'2px 9px',
                        borderRadius:20, fontSize:11, fontWeight:700, textTransform:'uppercase' }}>
                        {e.severidad}
                      </span>
                    </TD>
                    <TD style={{ fontSize:11, color:C.textLight, fontFamily:'JetBrains Mono,monospace' }}>
                      {String(e.created_at).slice(0, 10)}
                    </TD>
                    <TD>
                      {!e.resuelto
                        ? <button onClick={() => resolver(e.id)} style={{ background:C.successBg,
                            border:'none', padding:'5px 10px', borderRadius:6, cursor:'pointer',
                            fontSize:11, fontWeight:600, color:C.successText, fontFamily:'inherit' }}>
                            Resolver
                          </button>
                        : <span style={{ fontSize:11, color:C.textLight }}>✓</span>}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding:'10px 20px', borderTop:`1px solid ${C.border}`, fontSize:12, color:C.textMuted }}>
            {filtrados.length} registro(s) · {periodo}
          </div>
        </Card>
      )}
    </div>
  );
};
