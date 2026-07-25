/**
 * TransaccionesView.jsx — Diario Contable (Producción)
 *
 * Campos implementados:
 *   tiene_factura  → crédito fiscal ITBMS solo si está marcado
 *   itbms_exento   → bloquea ITBMS, lo pone en 0, señal visual
 *   itbms_aplica   → calculado automáticamente al guardar
 *
 * Validaciones:
 *   - Duplicado detectado en backend (409) → alerta clara
 *   - Formulario valida campos requeridos antes de enviar
 *   - itbms_exento deshabilita el campo ITBMS y lo limpia
 */
const TransaccionesView = () => {
  const [rows,    setRows]    = useState([]);
  const [clientes,setCli]     = useState([]);
  const [resumen, setRes]     = useState(null);
  const [filtro,  setFiltro]  = useState('todos');
  const [desde,   setDesde]   = useState('');
  const [hasta,   setHasta]   = useState('');
  const [busy,    setBusy]    = useState(true);
  const [err,     setErr]     = useState(null);
  const [modal,   setModal]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [formErr, setFormErr] = useState({});

  const periodo = new Date().toISOString().slice(0, 7);

  const EMPTY = {
    fecha: '', cliente_id: '', descripcion: '', tipo: 'ingreso',
    monto: '', itbms: '', deducible: false,
    tiene_factura: false,   // ← ¿hay factura de respaldo?
    itbms_exento:  false,   // ← ¿exento de ITBMS por ley?
    banco: '', referencia: '',
  };
  const [form, setForm] = useState(EMPTY);

  // ── Carga ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      let q = `?periodo=${periodo}`;
      if (filtro !== 'todos') q += `&tipo=${filtro}`;
      if (desde) q += `&desde=${desde}`;
      if (hasta) q += `&hasta=${hasta}`;
      const [tx, sm, cl] = await Promise.all([
        api.get(`/api/transacciones${q}`),
        api.get(`/api/transacciones/resumen?periodo=${periodo}`),
        api.get('/api/clientes'),
      ]);
      setRows(tx.data || []); setRes(sm); setCli(cl.data || []);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }, [periodo, filtro, desde, hasta]);

  useEffect(() => { load(); }, [load]);

  // ── ITBMS auto al cambiar monto ───────────────────────────────────────────
  const onMontoChange = (v) => {
    const upd = { monto: v };
    if (!form.itbms_exento) {
      const m = parseFloat(v);
      if (!isNaN(m) && m > 0) upd.itbms = (m * 0.07).toFixed(2);
    }
    setForm(f => ({ ...f, ...upd }));
  };

  // ── Toggle exento ─────────────────────────────────────────────────────────
  const onExentoChange = (checked) => {
    setForm(f => ({ ...f, itbms_exento: checked, itbms: checked ? '0' : f.itbms }));
  };

  // ── Validación ────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.fecha)              e.fecha       = 'Requerida';
    if (!form.descripcion.trim()) e.descripcion = 'Requerida';
    if (!form.monto || parseFloat(form.monto) <= 0) e.monto = 'Debe ser mayor a 0';
    setFormErr(e);
    return Object.keys(e).length === 0;
  };

  // ── Abrir edición ─────────────────────────────────────────────────────────
  const openEdit = (t) => {
    setForm({
      fecha: fmtDate(t.fecha), cliente_id: t.cliente_id || '',
      descripcion: t.descripcion, tipo: t.tipo,
      monto: String(t.monto), itbms: String(t.itbms),
      deducible:     t.deducible     || false,
      tiene_factura: t.tiene_factura || false,
      itbms_exento:  t.itbms_exento  || false,
      banco: t.banco || '', referencia: t.referencia || '',
    });
    setEditId(t.id); setFormErr({}); setModal(true);
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        itbms_aplica: !form.itbms_exento && parseFloat(form.itbms || 0) > 0,
      };
      if (editId) await api.put(`/api/transacciones/${editId}`, payload);
      else        await api.post('/api/transacciones', payload);
      setModal(false); setForm(EMPTY); setEditId(null); setFormErr({}); load();
    } catch (e) {
      // Duplicado detectado por el backend (409)
      if (e.status === 409 || e.message?.includes('duplicada')) {
        alert('⚠ Transacción duplicada detectada.\n\nYa existe una transacción con la misma fecha, monto, banco y referencia.\n\nVerifica en el listado antes de guardar.');
      } else {
        alert(e.message);
      }
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm('¿Eliminar esta transacción?')) return;
    try { await api.delete(`/api/transacciones/${id}`); load(); }
    catch (e) { alert(e.message); }
  };

  const BANCOS = ['Banco Nacional', 'Banistmo', 'BAC', 'Banesco', 'Global Bank', 'Caja de Ahorros'];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:C.text }}>Diario Contable</div>
          <div style={{ fontSize:14, color:C.textMuted, marginTop:3 }}>
            {rows.length} registros · {periodo}
          </div>
        </div>
        <Btn onClick={() => { setEditId(null); setForm(EMPTY); setFormErr({}); setModal(true); }}>
          <Icon name='plus' size={16} color='#fff' /> Nuevo Registro
        </Btn>
      </div>

      {/* KPIs */}
      {resumen && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:20 }}>
          <KpiCard label='Ingresos'   value={fmt(resumen.total_ingresos)} icon='trending' color={C.success} />
          <KpiCard label='Gastos'     value={fmt(resumen.total_gastos)}   icon='dollar'   color={C.warning} />
          <KpiCard label='Resultado'  value={fmt(resumen.utilidad_neta)}  icon='check'
            color={parseFloat(resumen.utilidad_neta || 0) >= 0 ? C.success : C.danger} />
          <KpiCard label='ITBMS Neto' value={fmt(resumen.itbms_neto)}    icon='tax'      color={C.accent} />
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        {['todos','ingreso','gasto'].map(t => (
          <button key={t} onClick={() => setFiltro(t)} style={{
            padding:'7px 18px', borderRadius:20, cursor:'pointer', fontFamily:'inherit',
            border:`1px solid ${filtro===t ? C.accent : C.border}`,
            background:filtro===t ? C.infoBg : 'none',
            color:filtro===t ? C.accent : C.textMuted, fontWeight:600, fontSize:13,
          }}>
            {t === 'todos' ? 'Todos' : t === 'ingreso' ? 'Ingresos' : 'Gastos'}
          </button>
        ))}
        <div style={{ display:'flex', gap:8, marginLeft:'auto', alignItems:'center' }}>
          <span style={{ fontSize:12, color:C.textMuted }}>Desde</span>
          <input type='date' value={desde} onChange={e => setDesde(e.target.value)}
            style={{ ...inpSt, width:140, padding:'6px 10px' }} />
          <span style={{ fontSize:12, color:C.textMuted }}>Hasta</span>
          <input type='date' value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ ...inpSt, width:140, padding:'6px 10px' }} />
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); }}
              style={{ background:'none', border:'none', cursor:'pointer', color:C.danger, fontSize:12 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {err && <ErrBox msg={err} onRetry={load} />}

      {/* Tabla */}
      {busy ? <Spinner /> : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:C.surfaceAlt }}>
              <TH>Fecha</TH><TH>Descripción</TH><TH>Cliente</TH>
              <TH>Tipo</TH><TH right>Monto</TH><TH right>ITBMS</TH>
              <TH>Banco</TH><TH>Fact.</TH><TH></TH>
            </tr></thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} style={{ background:i%2 ? C.surfaceAlt : C.surface }}>
                  <TD style={{ fontFamily:'JetBrains Mono,monospace', color:C.textMuted, fontSize:12 }}>
                    {fmtDate(t.fecha)}
                  </TD>
                  <TD style={{ fontWeight:600, maxWidth:200 }}>
                    <div>{t.descripcion}</div>
                    {t.itbms_exento && (
                      <span style={{ fontSize:10, background:'#fdf4ff', color:'#7c3aed',
                        padding:'1px 6px', borderRadius:20, fontWeight:700 }}>exento</span>
                    )}
                  </TD>
                  <TD style={{ color:C.textMuted, fontSize:12 }}>{t.cliente_nombre || '—'}</TD>
                  <TD>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                      textTransform:'uppercase',
                      background:t.tipo==='ingreso' ? C.successBg : C.dangerBg,
                      color:      t.tipo==='ingreso' ? C.successText : C.dangerText }}>
                      {t.tipo}
                    </span>
                  </TD>
                  <TD style={{ fontWeight:700, textAlign:'right',
                    color:t.tipo==='ingreso' ? C.success : C.danger }}>
                    {t.tipo==='ingreso' ? '+' : '-'}{fmt(t.monto)}
                  </TD>
                  <TD style={{ color:C.textMuted, textAlign:'right', fontSize:12 }}>{fmt(t.itbms)}</TD>
                  <TD style={{ fontSize:12 }}>{t.banco || '—'}</TD>
                  <TD style={{ textAlign:'center' }}>
                    {t.tiene_factura
                      ? <span style={{ color:C.success, fontWeight:700 }}>✓</span>
                      : <span style={{ color:C.textLight }}>—</span>}
                  </TD>
                  <TD>
                    <div style={{ display:'flex', gap:5 }}>
                      <button onClick={() => openEdit(t)} style={{ background:C.infoBg, border:'none',
                        padding:'5px 7px', borderRadius:6, cursor:'pointer' }}>
                        <Icon name='edit' size={13} color={C.infoText} />
                      </button>
                      <button onClick={() => del(t.id)} style={{ background:C.dangerBg, border:'none',
                        padding:'5px 7px', borderRadius:6, cursor:'pointer' }}>
                        <Icon name='trash' size={13} color={C.dangerText} />
                      </button>
                    </div>
                  </TD>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:'40px', color:C.textMuted }}>
                  Sin transacciones en este período
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* ═══════ MODAL NUEVO / EDITAR ═══════════════════════════════════════ */}
      {modal && (
        <Modal
          title={editId ? 'Editar Transacción' : 'Nuevo Registro Contable'}
          onClose={() => { setModal(false); setEditId(null); setFormErr({}); }}
          width={580}
        >
          {/* Fecha + Tipo */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Fld label={<>Fecha {formErr.fecha && <span style={{color:C.danger,fontSize:11}}>{formErr.fecha}</span>}</>}>
              <input type='date' value={form.fecha}
                onChange={e => setForm({ ...form, fecha:e.target.value })}
                style={{ ...inpSt, borderColor:formErr.fecha ? C.danger : C.border }} />
            </Fld>
            <Fld label='Tipo'>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo:e.target.value })} style={inpSt}>
                <option value='ingreso'>Ingreso</option>
                <option value='gasto'>Gasto</option>
              </select>
            </Fld>
          </div>

          {/* Descripción */}
          <Fld label={<>Descripción {formErr.descripcion && <span style={{color:C.danger,fontSize:11}}>{formErr.descripcion}</span>}</>}>
            <input value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion:e.target.value })}
              placeholder='Ej: Pago alquiler oficina marzo'
              style={{ ...inpSt, borderColor:formErr.descripcion ? C.danger : C.border }} />
          </Fld>

          {/* Cliente */}
          <Fld label='Cliente'>
            <select value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id:e.target.value })} style={inpSt}>
              <option value=''>Sin cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Fld>

          {/* Monto + ITBMS */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Fld label={<>Monto (USD) {formErr.monto && <span style={{color:C.danger,fontSize:11}}>{formErr.monto}</span>}</>}>
              <input type='number' value={form.monto}
                onChange={e => onMontoChange(e.target.value)}
                placeholder='0.00'
                style={{ ...inpSt, borderColor:formErr.monto ? C.danger : C.border }} />
            </Fld>
            <Fld label={
              <>ITBMS (7%)
                {form.itbms_exento && (
                  <span style={{ marginLeft:6, fontSize:10, color:'#7c3aed', fontWeight:700 }}>EXENTO</span>
                )}
              </>
            }>
              <input type='number' value={form.itbms}
                onChange={e => setForm({ ...form, itbms:e.target.value })}
                placeholder='0.00'
                disabled={form.itbms_exento}
                style={{ ...inpSt, opacity:form.itbms_exento ? 0.45 : 1 }} />
            </Fld>
          </div>

          {/* Banco + Referencia */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Fld label='Banco'>
              <select value={form.banco} onChange={e => setForm({ ...form, banco:e.target.value })} style={inpSt}>
                <option value=''>Seleccionar banco...</option>
                {BANCOS.map(b => <option key={b}>{b}</option>)}
              </select>
            </Fld>
            <Fld label='Referencia / Cheque'>
              <input value={form.referencia}
                onChange={e => setForm({ ...form, referencia:e.target.value })}
                placeholder='Ej: CHQ-001234'
                style={inpSt} />
            </Fld>
          </div>

          {/* ── Checkboxes ITBMS ─────────────────────────────────────────── */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>

            {/* Deducible */}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type='checkbox' id='ded' checked={form.deducible}
                onChange={e => setForm({ ...form, deducible:e.target.checked })}
                style={{ width:16, height:16, accentColor:C.accent }} />
              <span style={{ fontSize:14, color:C.textMuted }}>Gasto deducible</span>
            </label>

            {/* Tiene factura — solo si es deducible */}
            {form.deducible && (
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', paddingLeft:24 }}>
                <input type='checkbox' id='factura' checked={form.tiene_factura}
                  onChange={e => setForm({ ...form, tiene_factura:e.target.checked })}
                  style={{ width:16, height:16, accentColor:C.success }} />
                <span style={{ fontSize:13, color:C.textMuted }}>
                  Tiene factura de respaldo
                  <span style={{ fontSize:11, marginLeft:6,
                    color:form.tiene_factura ? C.successText : C.textLight }}>
                    {form.tiene_factura
                      ? '→ ITBMS crédito fiscal aplica'
                      : '→ Sin factura: ITBMS no recuperable'}
                  </span>
                </span>
              </label>
            )}

            {/* Exento de ITBMS */}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type='checkbox' id='exento' checked={form.itbms_exento}
                onChange={e => onExentoChange(e.target.checked)}
                style={{ width:16, height:16, accentColor:'#8b5cf6' }} />
              <span style={{ fontSize:14, color:C.textMuted }}>
                Exento de ITBMS
                <span style={{ fontSize:11, marginLeft:6, color:form.itbms_exento ? '#8b5cf6' : C.textLight }}>
                  {form.itbms_exento ? '→ Sin ITBMS (salud, educación, exportación, etc.)' : ''}
                </span>
              </span>
            </label>
          </div>

          {/* Tooltip reglas ITBMS */}
          <div style={{ background:C.infoBg, border:`1px solid ${C.accent}22`, borderRadius:8,
            padding:'10px 14px', marginBottom:16, fontSize:12, color:C.infoText }}>
            <strong>Reglas ITBMS:</strong>{' '}
            Ingreso con ITBMS → débito fiscal CR 2201.{' '}
            Gasto deducible <em>con factura</em> → crédito fiscal DR 1301.{' '}
            Sin factura → ITBMS incluido en el gasto (no recuperable).{' '}
            Exento → ningún asiento ITBMS.
          </div>

          {/* Botones */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant='secondary' onClick={() => { setModal(false); setEditId(null); setFormErr({}); }}>
              Cancelar
            </Btn>
            <Btn onClick={save} loading={saving}>
              {editId ? 'Actualizar' : 'Registrar'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};
