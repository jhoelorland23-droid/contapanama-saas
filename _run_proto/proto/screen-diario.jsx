// Screen: Diario Contable. Tabla densa con drawer de detalle + filtros vivos + bulk actions.

const ALL_TXNS = [
  { id: 1, f: "12 mar", d: "Honorarios profesionales Q1", cli: "Constructora Istmo S.A.", cta: "4101", ctaN: "Ingresos por servicios", tipo: "ing", monto: 4200, itbms: 294, st: "ok", doc: "FE-2451" },
  { id: 2, f: "10 mar", d: "Cuota préstamo BG marzo", cli: "Banco General", cta: "2110", ctaN: "Préstamos por pagar", tipo: "egr", monto: 950, itbms: 0, st: "ok", doc: "REF-8821" },
  { id: 3, f: "10 mar", d: "Comisión bancaria mensual", cli: "Banesco", cta: "5510", ctaN: "Gastos financieros", tipo: "egr", monto: 28.50, itbms: 0, st: "warn", doc: "—" },
  { id: 4, f: "08 mar", d: "Alquiler oficina marzo 2025", cli: "Inmobiliaria Bella Vista", cta: "5210", ctaN: "Alquileres", tipo: "egr", monto: 1800, itbms: 126, st: "ok", doc: "ALQ-03-25" },
  { id: 5, f: "08 mar", d: "Internet + telefonía corporativa", cli: "+Móvil S.A.", cta: "5310", ctaN: "Servicios públicos", tipo: "egr", monto: 145.80, itbms: 10.21, st: "ok", doc: "FE-99821" },
  { id: 6, f: "07 mar", d: "Papelería y suministros", cli: "Office Depot", cta: "5260", ctaN: "Materiales oficina", tipo: "egr", monto: 420.50, itbms: 29.44, st: "ok", doc: "FE-1188" },
  { id: 7, f: "07 mar", d: "Asesoría legal contratos", cli: "Bufete Arrocha", cta: null, ctaN: null, tipo: "egr", monto: 750, itbms: 52.50, st: "err", doc: "FE-2210" },
  { id: 8, f: "05 mar", d: "Servicios contables marzo", cli: "Carlos Méndez Palacios", cta: "4101", ctaN: "Ingresos por servicios", tipo: "ing", monto: 1500, itbms: 105, st: "ok", doc: "FE-2440" },
  { id: 9, f: "05 mar", d: "Combustible y peajes", cli: "Varios", cta: "5240", ctaN: "Transporte", tipo: "egr", monto: 89.40, itbms: 0, st: "ok", doc: "—" },
  { id: 10, f: "03 mar", d: "Honorarios auditoría Q1 2025", cli: "Distribuidora Sur S.A.", cta: "4101", ctaN: "Ingresos por servicios", tipo: "ing", monto: 6800, itbms: 476, st: "ok", doc: "FE-2435" },
  { id: 11, f: "02 mar", d: "Suscripción software contable", cli: "—", cta: null, ctaN: null, tipo: "egr", monto: 89, itbms: 0, st: "err", doc: "INV-USA" },
  { id: 12, f: "01 mar", d: "Anticipo cliente Maersk", cli: "Maersk Panamá", cta: "2105", ctaN: "Anticipos clientes", tipo: "ing", monto: 12000, itbms: 0, st: "ok", doc: "ANT-001" },
];

const ScreenDiario = () => {
  const { showToast, api, isLive } = window.useApp();
  const [filter, setFilter] = React.useState({ tipo: "Todos", st: "Todos", q: "" });
  const [sel, setSel] = React.useState(new Set());
  const [drillId, setDrillId] = React.useState(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const { periodo, clienteId } = window.useApp();
  const cli = clienteId ? `&cliente_id=${clienteId}` : "";

  const txnsQ = window.useApiQuery(
    () => api.get(`/transacciones?periodo=${periodo}${cli}`),
    [periodo, isLive, clienteId],
    { enabled: isLive, fallback: { data: ALL_TXNS } }
  );

  // ── Nueva transacción (guardado real) ───────────────────────────────────
  // Fecha por defecto: si el período activo es el mes actual, usa hoy; si no, el día 15 del período.
  const defaultFecha = (() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return hoy.startsWith(periodo) ? hoy : `${periodo}-15`;
  })();
  const emptyForm = { fecha: defaultFecha, tipo: "ing", descripcion: "", cliente: "", cliente_id: null, monto: "", itbmsAuto: true, cuenta: "" };
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [editing, setEditing] = React.useState(null);

  const cerrarModal = () => { setNewOpen(false); setEditing(null); setForm(emptyForm); };

  const guardarAsiento = async () => {
    if (!form.descripcion.trim()) { showToast("Falta la descripción"); return; }
    const montoNum = parseFloat(form.monto);
    if (!montoNum || montoNum <= 0) { showToast("Ingresa un monto válido (mayor a 0)"); return; }

    if (!isLive) {
      cerrarModal();
      showToast(editing ? "Cambios guardados (demo)" : "Asiento creado (demo)", { icon: "check" });
      return;
    }

    setSaving(true);
    try {
      const tipo = form.tipo === "ing" ? "ingreso" : "gasto";
      if (editing) {
        await api.put(`/transacciones/${editing}`, {
          fecha: form.fecha,
          descripcion: form.descripcion.trim(),
          tipo,
          monto: montoNum,
          cliente_id: form.cliente_id || null,
          cliente_nombre: form.cliente.trim(),
          itbms: form.itbmsAuto ? +(montoNum * 0.07).toFixed(2) : 0,
        });
        showToast("Cambios guardados ✓", { icon: "check" });
      } else {
        const payload = { fecha: form.fecha, descripcion: form.descripcion.trim(), tipo, monto: montoNum };
        if (form.cliente_id) payload.cliente_id = form.cliente_id;
      if (form.cliente.trim()) payload.cliente_nombre = form.cliente.trim();
        if (!form.itbmsAuto) { payload.itbms = 0; payload.itbms_aplica = false; }
        await api.post("/transacciones", payload);
        showToast("Asiento creado ✓", { icon: "check" });
      }
      cerrarModal();
      txnsQ.refetch();
    } catch (e) {
      showToast(e.message || "No se pudo guardar el asiento");
    } finally {
      setSaving(false);
    }
  };

  const abrirNuevo = () => { setEditing(null); setForm(emptyForm); setNewOpen(true); };

  const abrirEdicion = (id) => {
    const r = raw.find(x => String(x.id) === String(id));
    if (!r) { showToast("No se pudo cargar la transacción"); return; }
    setForm({
      fecha: r.fecha ? String(r.fecha).slice(0, 10) : emptyForm.fecha,
      tipo: (r.tipo === "gasto" || r.tipo === "egr") ? "egr" : "ing",
      descripcion: r.descripcion || r.d || "",
      cliente: r.cliente_nombre || r.cli || "",
      cliente_id: r.cliente_id || null,
      monto: String(r.monto ?? ""),
      itbmsAuto: true,
      cuenta: r.cuenta_contable || "",
    });
    setEditing(id);
    setDrillId(null);
    setNewOpen(true);
  };

  // ── Auto-clasificar con IA ─────────────────────────────────────────────
  const [autoOpen, setAutoOpen] = React.useState(false);
  const [sugerencias, setSugerencias] = React.useState([]);
  const [autoLoading, setAutoLoading] = React.useState(false);
  const [aplicando, setAplicando] = React.useState(false);

  const abrirAutoClasificar = async () => {
    if (!isLive) { showToast("Disponible solo en modo live"); return; }
    const sinClasificar = (raw || []).filter(t => !t.cuenta_contable);
    if (sinClasificar.length === 0) { showToast("¡No hay transacciones sin clasificar!"); return; }
    setAutoOpen(true);
    setAutoLoading(true);
    setSugerencias([]);
    try {
      const resultados = await Promise.all(sinClasificar.map(async (t) => {
        try {
          const s = await api.post("/ai/sugerir-cuenta", {
            descripcion: t.descripcion,
            tipo: t.tipo,
            monto: +t.monto || 0,
            cliente_id: t.cliente_id,
            cliente_nombre: t.cliente_nombre,
          });
          return { txn: t, ...s, apply: s.confianza >= 70 };
        } catch {
          return { txn: t, cuenta: null, nombre: null, confianza: 0, razon: "Error", apply: false };
        }
      }));
      setSugerencias(resultados);
    } finally {
      setAutoLoading(false);
    }
  };

  const aplicarSugerencias = async () => {
    const a = sugerencias.filter(s => s.apply && s.cuenta);
    if (a.length === 0) { showToast("Marca al menos una sugerencia para aplicar"); return; }
    setAplicando(true);
    let ok = 0, fail = 0;
    for (const s of a) {
      try {
        await api.put(`/transacciones/${s.txn.id}`, { cuenta_contable: `${s.cuenta} ${s.nombre || ""}`.trim() });
        ok++;
      } catch { fail++; }
    }
    setAplicando(false);
    setAutoOpen(false);
    setSugerencias([]);
    showToast(`${ok} transacci${ok === 1 ? "ón" : "ones"} clasificada${ok === 1 ? "" : "s"} ✓${fail ? ` · ${fail} con error` : ""}`, { icon: "check" });
    txnsQ.refetch();
  };

  const toggleSugerencia = (i) => setSugerencias(s => s.map((x, idx) => idx === i ? { ...x, apply: !x.apply } : x));

  const eliminarAsiento = async (id) => {
    if (!window.confirm("¿Eliminar esta transacción? Esta acción no se puede deshacer.")) return;
    if (!isLive) { setDrillId(null); showToast("Transacción eliminada (demo)", { icon: "check" }); return; }
    try {
      await api.delete(`/transacciones/${id}`);
      setDrillId(null);
      showToast("Transacción eliminada ✓", { icon: "check" });
      txnsQ.refetch();
    } catch (e) {
      showToast(e.message || "No se pudo eliminar");
    }
  };

  // Normalize backend records
  const raw = (isLive && txnsQ.data?.data) ? txnsQ.data.data : ALL_TXNS;
  const txns = raw.map(t => ({
    id: t.id,
    f: t.f || (t.fecha ? new Date(t.fecha).toLocaleDateString("es-PA", { day: "2-digit", month: "short" }) : "—"),
    d: t.d || t.descripcion || "Sin descripción",
    cli: t.cli || t.cliente_nombre || "—",
    cta: t.cta || (t.cuenta_contable && t.cuenta_contable.slice(0, 4)),
    ctaN: t.ctaN || (t.cuenta_contable && t.cuenta_contable.slice(5)),
    tipo: t.tipo === "ingreso" ? "ing" : t.tipo === "gasto" ? "egr" : t.tipo,
    monto: +t.monto || 0,
    itbms: +t.itbms || 0,
    st: t.st || (t.cuenta_contable ? "ok" : "err"),
    doc: t.doc || t.documento || "—",
  }));

  const filtered = txns.filter(t => {
    if (filter.tipo === "Ingresos" && t.tipo !== "ing") return false;
    if (filter.tipo === "Egresos" && t.tipo !== "egr") return false;
    if (filter.st === "Sin clasificar" && t.st !== "err") return false;
    if (filter.st === "Revisar" && t.st !== "warn") return false;
    if (filter.q && !t.d.toLowerCase().includes(filter.q.toLowerCase()) &&
        !t.doc.toLowerCase().includes(filter.q.toLowerCase())) return false;
    return true;
  });

  const toggleSel = (id) => {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  };
  const toggleAll = () => {
    if (sel.size === filtered.length) setSel(new Set());
    else setSel(new Set(filtered.map(t => t.id)));
  };

  const sumIng = filtered.filter(t => t.tipo === "ing").reduce((a, t) => a + t.monto, 0);
  const sumEgr = filtered.filter(t => t.tipo === "egr").reduce((a, t) => a + t.monto, 0);
  const sumItbDeb = filtered.filter(t => t.tipo === "ing").reduce((a, t) => a + t.itbms, 0);
  const sumItbCre = filtered.filter(t => t.tipo === "egr").reduce((a, t) => a + t.itbms, 0);
  const errores = txns.filter(t => t.st === "err").length;

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Contabilidad", "Diario contable"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => showToast("Importando CSV…", { icon: "upload" })}>
              <window.Ico name="upload" size={13} />Importar
            </button>
            <button className="btn primary" onClick={abrirNuevo}>
              <window.Ico name="plus" size={13} />Nuevo asiento
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {[
            ["Asientos", filtered.length, null],
            ["Ingresos", window.fmt$(sumIng), null],
            ["Egresos", window.fmt$(sumEgr), null],
            ["ITBMS débito", window.fmt$(sumItbDeb), null],
            ["ITBMS crédito", window.fmt$(sumItbCre), null],
          ].map(([l, v, d]) => (
            <div key={l} className="card" style={{ padding: "12px 16px" }}>
              <div className="xs">{l}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <div className="num mono" style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
                {d && <span style={{ fontSize: 10.5, color: d.startsWith("+") ? "var(--green)" : "var(--muted)", fontWeight: 600 }}>{d}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="card" style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10, marginTop: 14 }}>
          <window.Ico name="filter" size={14} color="var(--muted)" />
          <FilterChip label="Tipo" value={filter.tipo} options={["Todos", "Ingresos", "Egresos"]} onChange={v => setFilter({ ...filter, tipo: v })} />
          <FilterChip label="Estado" value={filter.st} options={["Todos", "Sin clasificar", "Revisar"]} onChange={v => setFilter({ ...filter, st: v })} />
          <div style={{ width: 1, height: 18, background: "var(--line)" }} />
          {errores > 0 && (
            <div onClick={abrirAutoClasificar} title="Auto-clasificar con IA" style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11.5,
              border: "1px solid var(--teal)", background: "var(--teal-50)", color: "var(--teal-700)",
              cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5
            }}>
              <window.Ico name="sparkle" size={11} color="var(--teal)" />
              Auto-clasificar {errores} con IA
            </div>
          )}

          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)" }}>
            <window.Ico name="search" size={12} color="var(--muted)" />
            <input value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })}
              placeholder="Buscar descripción o documento…"
              style={{ border: "none", outline: "none", fontSize: 12, width: 220, background: "transparent", fontFamily: "inherit", color: "var(--ink)" }} />
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, marginTop: 12, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={sel.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} style={{ accentColor: "var(--teal)" }} />
                </th>
                <th style={{ width: 64 }}>Fecha</th>
                <th>Descripción</th>
                <th>Cliente / Contraparte</th>
                <th>Cuenta contable</th>
                <th>Tipo</th>
                <th className="r" style={{ width: 110 }}>Monto</th>
                <th className="r" style={{ width: 90 }}>ITBMS</th>
                <th style={{ width: 80 }}>Doc.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => setDrillId(r.id)}
                  style={{ background: sel.has(r.id) ? "#FBF6E7" : "transparent" }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)}
                      style={{ accentColor: "var(--teal)" }} />
                  </td>
                  <td className="muted mono" style={{ fontSize: 11.5 }}>{r.f}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {r.st === "err" && <span title="Sin clasificar" style={{ width: 6, height: 6, background: "var(--red)", borderRadius: 999 }} />}
                      {r.st === "warn" && <span title="Revisar" style={{ width: 6, height: 6, background: "var(--amber)", borderRadius: 999 }} />}
                      {r.st === "ok" && <span style={{ width: 6, height: 6 }} />}
                      <span style={{ fontWeight: 600 }}>{r.d}</span>
                    </div>
                  </td>
                  <td className="muted">{r.cli}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {r.cta ? (
                      <span><b style={{ color: "var(--ink)" }}>{r.cta}</b> <span style={{ color: "var(--muted-2)" }}>· {r.ctaN}</span></span>
                    ) : (
                      <span style={{ color: "var(--muted-2)", fontStyle: "italic" }}>Sin cuenta</span>
                    )}
                  </td>
                  <td><window.Pill tone={r.tipo === "ing" ? "green" : "grey"}>{r.tipo === "ing" ? "Ingreso" : "Egreso"}</window.Pill></td>
                  <td className="r num mono" style={{ fontWeight: 700, color: r.tipo === "ing" ? "var(--green)" : "var(--ink)" }}>
                    {r.tipo === "ing" ? "+" : "−"}{window.fmt$(r.monto)}
                  </td>
                  <td className="r num mono muted">{r.itbms ? window.fmt$(r.itbms) : "—"}</td>
                  <td className="mono" style={{ fontSize: 11, color: r.doc === "—" ? "var(--muted-2)" : "var(--teal)" }}>{r.doc}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Sin resultados con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk action bar */}
      {sel.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(calc(-50% + 120px))",
          background: "var(--ink)", color: "var(--bg)",
          borderRadius: 10, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,.25)",
          fontSize: 12.5, zIndex: 50
        }}>
          <span style={{ fontWeight: 700 }}>{sel.size} seleccionado{sel.size > 1 ? "s" : ""}</span>
          <span style={{ width: 1, height: 14, background: "#2A3A37" }} />
          <span onClick={() => { showToast(`Clasificando ${sel.size} con IA…`, { icon: "sparkle" }); setSel(new Set()); }}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--gold)", cursor: "pointer" }}>
            <window.Ico name="sparkle" size={13} />Auto-clasificar
          </span>
          <span onClick={() => { showToast("Conciliando contra banco…", { icon: "bank" }); setSel(new Set()); }}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <window.Ico name="link" size={13} />Conciliar
          </span>
          <span onClick={() => { showToast("Exportando CSV…", { icon: "download" }); setSel(new Set()); }}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <window.Ico name="download" size={13} />Exportar
          </span>
          <span onClick={() => setSel(new Set())} style={{ display: "flex", alignItems: "center", gap: 6, color: "#FF8C7B", cursor: "pointer" }}>
            <window.Ico name="x" size={13} />Limpiar
          </span>
        </div>
      )}

      {/* Detail drawer */}
      <window.Drawer open={drillId !== null} onClose={() => setDrillId(null)} title="Detalle del asiento"
        footer={
          <>
            <button className="btn ghost" onClick={() => setDrillId(null)}>Cerrar</button>
            <button className="btn danger" onClick={() => eliminarAsiento(drillId)}>Eliminar</button>
            <button className="btn primary" onClick={() => abrirEdicion(drillId)}><window.Ico name="cog" size={13} />Editar</button>
          </>
        }>
        {drillId !== null && <TxnDrawer t={txns.find(t => t.id === drillId)} />}
      </window.Drawer>

      {/* New asiento modal */}
      <window.Modal open={newOpen} onClose={cerrarModal} title={editing ? "Editar asiento" : "Nuevo asiento contable"}
        footer={
          <>
            <button className="btn ghost" onClick={cerrarModal}>Cancelar</button>
            <button className="btn teal" disabled={saving} onClick={guardarAsiento}>{saving ? "Guardando…" : (editing ? "Guardar cambios" : "Crear asiento")}</button>
          </>
        }>
        <NewAsientoForm form={form} setF={setF} />
      </window.Modal>

      <window.Modal open={autoOpen} width={720} onClose={() => !aplicando && setAutoOpen(false)} title="Auto-clasificar con IA"
        footer={
          <>
            <button className="btn ghost" disabled={aplicando} onClick={() => setAutoOpen(false)}>Cancelar</button>
            <button className="btn teal" disabled={aplicando || autoLoading || sugerencias.filter(s => s.apply).length === 0} onClick={aplicarSugerencias}>
              {aplicando ? "Aplicando…" : `Aplicar ${sugerencias.filter(s => s.apply).length} cambio${sugerencias.filter(s => s.apply).length === 1 ? "" : "s"}`}
            </button>
          </>
        }>
        {autoLoading ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)" }}>
            La IA está analizando {(raw || []).filter(t => !t.cuenta_contable).length} transacciones…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
              Revisa cada sugerencia. Las que tienen <b>confianza alta (≥70%)</b> vienen marcadas; desmarca las que no apliquen.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
              {sugerencias.map((s, i) => (
                <div key={s.txn.id} style={{
                  padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8,
                  background: s.apply ? "var(--teal-50)" : "var(--paper)",
                  borderColor: s.apply ? "var(--teal)" : "var(--line)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <input type="checkbox" checked={s.apply} onChange={() => toggleSugerencia(i)}
                      style={{ accentColor: "var(--teal)", marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.txn.descripcion}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                        {s.txn.cliente_nombre || "Sin cliente"} · {s.txn.tipo} · {window.fmt$(+s.txn.monto || 0)}
                      </div>
                      <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--paper)", borderRadius: 6, border: "1px solid var(--line)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <window.Ico name="sparkle" size={12} color="var(--gold)" />
                          <span className="mono" style={{ fontWeight: 700, color: "var(--teal-700)" }}>{s.cuenta || "—"}</span>
                          <span style={{ fontSize: 12.5 }}>{s.nombre || "Sin sugerencia"}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: s.confianza >= 70 ? "var(--green)" : "var(--amber)", fontWeight: 700 }}>
                            {s.confianza}% confianza
                          </span>
                        </div>
                        {s.razon && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>"{s.razon}"</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </window.Modal>
    </>
  );
};

const FilterChip = ({ label, value, options, onChange }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative" }}>
      <div onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 10px", borderRadius: 6,
        fontSize: 11.5, cursor: "pointer",
        border: "1px solid var(--line)",
        background: value !== "Todos" ? "var(--surface)" : "transparent",
        color: "var(--muted)",
      }}>
        <span>{label}</span>
        <b style={{ color: "var(--ink)" }}>{value}</b>
        <span style={{ opacity: .6 }}>▾</span>
      </div>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 6,
            background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7,
            boxShadow: "0 10px 30px rgba(0,0,0,.12)", minWidth: 140, overflow: "hidden"
          }}>
            {options.map(o => (
              <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{
                padding: "8px 12px", fontSize: 12.5, cursor: "pointer",
                background: o === value ? "var(--surface)" : "transparent",
                color: o === value ? "var(--ink)" : "var(--muted)",
                fontWeight: o === value ? 700 : 500
              }}>{o}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const TxnDrawer = ({ t }) => (
  <div>
    <window.Pill tone={t.tipo === "ing" ? "green" : "grey"} dot>{t.tipo === "ing" ? "Ingreso" : "Egreso"}</window.Pill>
    <h2 className="serif" style={{ fontSize: 26, marginTop: 12, fontWeight: 400 }}>{t.d}</h2>

    <div className="num mono" style={{ fontSize: 38, fontWeight: 700, marginTop: 14, color: t.tipo === "ing" ? "var(--green)" : "var(--ink)" }}>
      {t.tipo === "ing" ? "+" : "−"}{window.fmt$(t.monto)}
    </div>
    {t.itbms > 0 && <div className="num mono" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>+ ITBMS {window.fmt$(t.itbms)}</div>}

    <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {[
        ["Fecha", t.f + " 2025"],
        ["Cliente / contraparte", t.cli],
        ["Cuenta contable", t.cta ? `${t.cta} · ${t.ctaN}` : "— Sin clasificar"],
        ["Documento", t.doc],
      ].map(([k, v]) => (
        <div key={k}>
          <div className="xs">{k}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{v}</div>
        </div>
      ))}
    </div>

    <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--teal-50)", borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="card-title" style={{ margin: 0, color: "var(--teal-700)" }}>Asiento contable generado</div>
        <span style={{ fontSize: 10.5, color: "var(--teal)" }}><b>Auto</b></span>
      </div>
      <div className="mono" style={{ fontSize: 12, marginTop: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", color: "var(--muted)", fontSize: 10.5, paddingBottom: 4, borderBottom: "1px solid #BCD7D2" }}>
          <span>Cuenta</span><span style={{ textAlign: "right" }}>Debe</span><span style={{ textAlign: "right" }}>Haber</span>
        </div>
        <Line k="1101 Caja general" debe={window.fmt$(t.monto + t.itbms)} />
        {t.cta && <Line k={`${t.cta} ${t.ctaN}`} haber={window.fmt$(t.monto)} />}
        {t.itbms > 0 && <Line k="2201 ITBMS débito fiscal" haber={window.fmt$(t.itbms)} />}
      </div>
    </div>

  </div>
);

const Line = ({ k, debe, haber }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", padding: "6px 0" }}>
    <span>{k}</span>
    <span style={{ textAlign: "right" }}>{debe || "—"}</span>
    <span style={{ textAlign: "right" }}>{haber || "—"}</span>
  </div>
);

const NewAsientoForm = ({ form, setF }) => {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <window.FormField label="Fecha"><input className="inp" type="date" value={form.fecha} onChange={e => setF("fecha", e.target.value)} /></window.FormField>
        <window.FormField label="Tipo">
          <div style={{ display: "flex", gap: 6 }}>
            {[["ing", "Ingreso"], ["egr", "Egreso"]].map(([k, l]) => (
              <button key={k} onClick={() => setF("tipo", k)} className="btn" style={{
                flex: 1, justifyContent: "center",
                background: form.tipo === k ? "var(--ink)" : "var(--paper)",
                color: form.tipo === k ? "var(--bg)" : "var(--ink)",
                borderColor: form.tipo === k ? "var(--ink)" : "var(--line)"
              }}>{l}</button>
            ))}
          </div>
        </window.FormField>
      </div>
      <window.FormField label="Descripción"><input className="inp" placeholder="Honorarios profesionales…" autoFocus value={form.descripcion} onChange={e => setF("descripcion", e.target.value)} /></window.FormField>
      <window.FormField label="Cliente / contraparte" hint="Escribe para buscar; elige de la lista para enlazarlo a tu cartera de clientes.">
        <window.ClientePicker value={form.cliente} onSelect={(c) => { setF("cliente", c.nombre || ""); setF("cliente_id", c.id || null); }} />
      </window.FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <window.FormField label="Monto"><input className="inp num mono" placeholder="0.00" inputMode="decimal" value={form.monto} onChange={e => setF("monto", e.target.value)} /></window.FormField>
        <window.FormField label="ITBMS 7% aplica">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}>
            <input type="checkbox" checked={form.itbmsAuto} onChange={e => setF("itbmsAuto", e.target.checked)} style={{ accentColor: "var(--teal)" }} />
            <span style={{ fontSize: 13 }}>Calcular automáticamente</span>
          </label>
        </window.FormField>
      </div>
      <window.FormField label="Cuenta contable" hint="Opcional (referencia)">
        <input className="inp mono" placeholder="Ej: 4101 Ingresos por servicios" value={form.cuenta} onChange={e => setF("cuenta", e.target.value)} />
      </window.FormField>
    </>
  );
};

Object.assign(window, { ScreenDiario });
