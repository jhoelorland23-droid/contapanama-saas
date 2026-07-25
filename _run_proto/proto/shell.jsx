// Shell — interactive Sidebar + Topbar.

const NAV_GROUPS = [
  { group: "Operación", items: [
    { id: "panel", label: "Panel del despacho", icon: "users" },
    { id: "dashboard", label: "Dashboard", icon: "dash" },
    { id: "ocr", label: "Bandeja OCR", icon: "inbox" },
    { id: "clientes", label: "Clientes", icon: "users" },
  ]},
  { group: "Contabilidad", items: [
    { id: "diario", label: "Diario contable", icon: "book" },
    { id: "ai", label: "Asistente IA", icon: "sparkle", badge: "AI" },
  ]},
  { group: "Cumplimiento", items: [
    { id: "fiscal", label: "Módulo fiscal", icon: "tax", badge: "DGI" },
    { id: "fe", label: "Factura electrónica", icon: "send" },
  ]},
  { group: "Salida", items: [
    { id: "reportes", label: "Reportes PDF", icon: "pdf" },
  ]},
];

const Sidebar = () => {
  const { user, view, navigate, tweaks, setTweak, showToast, logout, api, isLive } = window.useApp();
  const [cfgOpen, setCfgOpen] = React.useState(false);
  const [firmDraft, setFirmDraft] = React.useState(tweaks.firmName);
  const [wiping, setWiping] = React.useState(false);

  const openCfg = () => { setFirmDraft(tweaks.firmName); setCfgOpen(true); };
  const saveCfg = () => {
    const v = firmDraft.trim();
    if (v) setTweak("firmName", v);
    setCfgOpen(false);
    if (showToast) showToast("Configuración guardada ✓", { icon: "check" });
  };
  // Contadores reales del sidebar (OCR pendientes + Clientes totales)
  const ocrStats = window.useApiQuery(() => api.get("/ocr/stats"), [isLive], { enabled: isLive, fallback: null });
  const clientesQ = window.useApiQuery(() => api.get("/clientes"), [isLive], { enabled: isLive, fallback: null });
  const sidebarCount = (id) => {
    if (!isLive) return null;
    if (id === "ocr") { return ocrStats.data ? (+ocrStats.data.revisar || 0) : null; }
    if (id === "clientes") { return (clientesQ.data && clientesQ.data.data) ? clientesQ.data.data.length : null; }
    return null;
  };

  const limpiarDemo = async () => {
    if (!isLive) { showToast("Solo disponible en modo live"); return; }
    if (!window.confirm("¿Borrar TODOS los datos demo (clientes, transacciones, facturas, OCR, IA, vencimientos) de tu cuenta? Esta acción no se puede deshacer.")) return;
    setWiping(true);
    try {
      await api.post("/auth/reset-data", {});
      showToast("Datos demo eliminados ✓", { icon: "check" });
      setCfgOpen(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      showToast(e.message || "No se pudo limpiar");
    } finally { setWiping(false); }
  };

  return (
    <div className="sb">
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #15201D", display: "flex", alignItems: "center", gap: 10 }}>
        <window.Logo size={30} />
        <div>
          <div style={{ fontWeight: 700, color: "#FAF8F3", fontSize: 14, letterSpacing: "-0.01em" }}>ContaPanamá</div>
          <div style={{ color: "#5C6A66", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".12em", marginTop: 1 }}>v3 · Beta</div>
        </div>
      </div>

      {/* Despacho switcher */}
      <div style={{ padding: "8px 14px 6px" }}>
        <div onClick={openCfg} title="Configurar despacho" style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
          background: "#142220", borderRadius: 7, fontSize: 12, color: "#7C8884", cursor: "pointer"
        }}>
          <window.Ico name="building" size={13} />
          <span style={{ color: "#CCD3CE", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tweaks.firmName}
          </span>
          <span style={{ color: "#5C6A66", fontSize: 10 }}>▾</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {NAV_GROUPS.map(g => (
          <React.Fragment key={g.group}>
            <div className="sb-section">{g.group}</div>
            <div style={{ padding: "0 10px" }}>
              {g.items.map(it => {
                const on = view === it.id;
                const cnt = sidebarCount(it.id);
                return (
                  <div key={it.id} onClick={() => navigate(it.id)}
                    className={`sb-item ${on ? "on" : ""}`}>
                    <span className="dot" style={{ width: 5, height: 5, borderRadius: 999, background: on ? "var(--gold)" : "#3A4744", flexShrink: 0 }} />
                    <window.Ico name={it.icon} size={14} color={on ? "#FAF8F3" : "#6B7975"} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {cnt != null && cnt > 0 && <span style={{ fontSize: 10.5, color: "#6B7975", fontVariantNumeric: "tabular-nums" }}>{cnt}</span>}
                    {it.badge && (
                      <span style={{
                        fontSize: 8.5, padding: "1px 5px", borderRadius: 3,
                        background: it.badge === "AI" ? "var(--gold)" : it.badge === "DGI" ? "#2A3A37" : "#2A3A37",
                        color: it.badge === "AI" ? "#0A1311" : "#9AA5A1",
                        fontWeight: 700, letterSpacing: ".06em"
                      }}>{it.badge}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div style={{ padding: "12px 14px", borderTop: "1px solid #15201D", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#142220", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
          {user?.iniciales}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: "#FAF8F3", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nombre}</div>
          <div style={{ fontSize: 10.5, color: "#5C6A66" }}>{user?.licencia}</div>
        </div>
        <window.Ico name="cog" size={14} color="#5C6A66" style={{ cursor: "pointer" }} onClick={openCfg} />
      </div>

      <window.Modal open={cfgOpen} onClose={() => setCfgOpen(false)} title="Configuración"
        footer={
          <>
            <button className="btn ghost" onClick={() => { setCfgOpen(false); logout(); }}>Cerrar sesión</button>
            <button className="btn teal" onClick={saveCfg}>Guardar</button>
          </>
        }>
        <window.FormField label="Nombre del despacho" hint="Aparece en la barra lateral y en los reportes.">
          <input className="inp" value={firmDraft} onChange={e => setFirmDraft(e.target.value)} placeholder="Tu despacho contable" autoFocus />
        </window.FormField>
        <window.FormField label="Usuario (correo)">
          <input className="inp" value={user?.email || ""} disabled />
        </window.FormField>

        <div style={{ marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div className="xs" style={{ color: "var(--red)" }}>· Zona delicada</div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
            Borra los datos de ejemplo (clientes, transacciones, facturas, recibos OCR, conversaciones de IA y vencimientos) para arrancar tu cuenta en blanco. Tu usuario y tu configuración se conservan.
          </div>
          <button className="btn danger" disabled={wiping || !isLive} onClick={limpiarDemo} style={{ marginTop: 10 }}>
            {wiping ? "Limpiando…" : "Limpiar datos demo"}
          </button>
          {!isLive && <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-2)" }}>Disponible solo en modo live.</div>}
        </div>
      </window.Modal>
    </div>
  );
};

const Topbar = ({ crumbs, actions = null }) => {
  const { setPalette, showToast, periodo, setPeriodo, clienteId, clienteNombre, seleccionarCliente, api, isLive, view } = window.useApp();
  const cliQ = window.useApiQuery(() => api.get("/clientes"), [isLive], { enabled: isLive, fallback: { data: [] } });
  const lista = (cliQ.data && cliQ.data.data) || [];
  // En Panel del despacho mostramos TODOS los clientes — el selector de cliente no aplica.
  const ocultarSelectorCliente = view === "panel" || view === "clientes";
  return (
    <div className="tb">
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, flexWrap: "wrap" }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: "var(--muted-2)" }}>/</span>}
            <span style={i === crumbs.length - 1 ? { color: "var(--ink)", fontWeight: 600 } : {}}>{c}</span>
          </React.Fragment>
        ))}
        <label style={{
          marginLeft: 14, display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 10px", border: "1px solid var(--line)",
          borderRadius: 999, fontSize: 11.5, background: "var(--paper)", cursor: "pointer"
        }} title="Cambiar período">
          Período
          <input type="month" value={periodo} onChange={e => e.target.value && setPeriodo(e.target.value)}
            style={{ border: "none", background: "transparent", fontSize: 11.5, fontWeight: 700, color: "var(--ink)", outline: "none", fontFamily: "inherit", cursor: "pointer" }} />
        </label>
        {!ocultarSelectorCliente && (
          <label style={{
            marginLeft: 4, display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 10px 3px 12px", border: "1px solid var(--line)",
            borderRadius: 999, fontSize: 11.5,
            background: clienteId ? "var(--teal-50)" : "var(--paper)",
            cursor: "pointer"
          }} title="Filtrar por cliente">
            <window.Ico name="users" size={11} color={clienteId ? "var(--teal)" : "var(--muted)"} />
            <select
              value={clienteId || ""}
              onChange={e => {
                const id = e.target.value || null;
                const c = lista.find(x => x.id === id);
                seleccionarCliente(id, c ? c.nombre : null);
              }}
              style={{ border: "none", background: "transparent", fontSize: 11.5, fontWeight: 700, color: clienteId ? "var(--teal-700)" : "var(--ink)", outline: "none", fontFamily: "inherit", cursor: "pointer", paddingRight: 4 }}
            >
              <option value="">Todos los clientes</option>
              {lista.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div onClick={() => setPalette(true)} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 8, padding: "7px 12px", fontSize: 12.5, color: "var(--muted-2)",
          width: 280, cursor: "pointer"
        }}>
          <window.Ico name="search" size={13} color="var(--muted-2)" />
          <span>Buscar o ejecutar comando…</span>
          <span className="mono" style={{ marginLeft: "auto", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 4, fontSize: 10.5, color: "var(--muted)", background: "var(--bg)" }}>⌘K</span>
        </div>
        {actions}
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "var(--teal)", color: "#FAF8F3",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11.5, fontWeight: 700, cursor: "pointer"
        }} title="Notificaciones">
          <window.Ico name="bell" size={14} />
        </div>
      </div>
    </div>
  );
};

// Reusable modal + drawer (controlled)
const Modal = ({ open, onClose, title, children, width = 560, footer = null }) => {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <window.Ico name="x" size={16} color="var(--muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ borderTop: "1px solid var(--line)", padding: "14px 22px", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
};

const Drawer = ({ open, onClose, title, children, footer = null, width = 560 }) => {
  if (!open) return null;
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="drawer" style={{ width }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <window.Ico name="x" size={16} color="var(--muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ borderTop: "1px solid var(--line)", padding: "14px 22px", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>{footer}</div>}
      </div>
    </>
  );
};

const FormField = ({ label, children, hint, error }) => (
  <div style={{ marginBottom: 14 }}>
    <label className="lbl">{label}</label>
    {children}
    {hint && !error && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{hint}</div>}
    {error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 5 }}>{error}</div>}
  </div>
);

// Cliente picker — autocomplete sobre /api/clientes
const ClientePicker = ({ value, onSelect, placeholder = "Buscar cliente por nombre o RUC…" }) => {
  const { api, isLive } = window.useApp();
  const [q, setQ] = React.useState(value || "");
  const [open, setOpen] = React.useState(false);
  const clientesQ = window.useApiQuery(() => api.get("/clientes"), [isLive], { enabled: isLive, fallback: { data: [] } });
  React.useEffect(() => { setQ(value || ""); }, [value]);
  const lista = (clientesQ.data && clientesQ.data.data) || [];
  const filtered = q ? lista.filter(c => (c.nombre || "").toLowerCase().includes(q.toLowerCase()) || (c.ruc || "").includes(q)) : lista;
  return (
    <div style={{ position: "relative" }}>
      <input className="inp" value={q} placeholder={placeholder}
        onChange={e => { setQ(e.target.value); setOpen(true); onSelect && onSelect({ nombre: e.target.value, id: null, ruc: null }); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)} />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
          background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8,
          boxShadow: "0 8px 20px rgba(0,0,0,.12)", zIndex: 50,
          maxHeight: 260, overflowY: "auto"
        }}>
          {filtered.slice(0, 10).map(c => (
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); onSelect && onSelect(c); setQ(c.nombre); setOpen(false); }}
              style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--line-2)" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{c.ruc || "—"}{c.estado ? ` · ${c.estado}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, Modal, Drawer, FormField, ClientePicker, NAV_GROUPS });
