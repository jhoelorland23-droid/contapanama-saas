// Screen: Clientes — CRUD-ish list with new client modal.

const CLIENTES = [
  { id: 1, nombre: "Constructora Istmo S.A.", ruc: "155-789-1", nit: "NT-00234", tipo: "jurídica", actividad: "Construcción", ingresos: 42400, txns: 28, estado: "activo" },
  { id: 2, nombre: "Distribuidora Sur S.A.", ruc: "155-892-1", nit: "NT-00891", tipo: "jurídica", actividad: "Comercio mayorista", ingresos: 31800, txns: 19, estado: "activo" },
  { id: 3, nombre: "Maersk Panamá", ruc: "155-1024-3", nit: "NT-04412", tipo: "jurídica", actividad: "Logística", ingresos: 23400, txns: 12, estado: "activo" },
  { id: 4, nombre: "Carlos Méndez Palacios", ruc: "8-PA-789-1", nit: "—", tipo: "natural", actividad: "Servicios profesionales", ingresos: 9800, txns: 8, estado: "activo" },
  { id: 5, nombre: "Bufete Arrocha & Asoc.", ruc: "155-441-2", nit: "NT-08821", tipo: "jurídica", actividad: "Legal", ingresos: 18200, txns: 11, estado: "activo" },
  { id: 6, nombre: "Roberto Salinas Vega", ruc: "7-NT-512-9", nit: "—", tipo: "natural", actividad: "Independiente", ingresos: 4200, txns: 6, estado: "omiso" },
  { id: 7, nombre: "Grupo Pacífico Importadora", ruc: "155-2244-1", nit: "NT-99100", tipo: "jurídica", actividad: "Importación", ingresos: 28100, txns: 14, estado: "activo" },
  { id: 8, nombre: "Café del Volcán S.A.", ruc: "155-330-4", nit: "NT-77821", tipo: "jurídica", actividad: "Agricultura", ingresos: 6800, txns: 5, estado: "activo" },
  { id: 9, nombre: "Studio C&G Arquitectos", ruc: "8-NT-1180-2", nit: "NT-12440", tipo: "jurídica", actividad: "Arquitectura", ingresos: 12200, txns: 9, estado: "inactivo" },
  { id: 10, nombre: "Hotel Boquete View", ruc: "155-560-6", nit: "NT-22250", tipo: "jurídica", actividad: "Hotelería", ingresos: 14600, txns: 8, estado: "omiso" },
];

const ScreenClientes = () => {
  const { showToast, api, isLive } = window.useApp();
  const [q, setQ] = React.useState("");
  const [estado, setEstado] = React.useState("Todos");
  const [tipo, setTipo] = React.useState("Todos");
  const [openNew, setOpenNew] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const params = new URLSearchParams();
  if (q) params.set("search", q);
  if (estado !== "Todos") params.set("estado", estado.toLowerCase());
  if (tipo !== "Todos") params.set("tipo", tipo.toLowerCase());

  const cliQ = window.useApiQuery(
    () => api.get(`/clientes?${params.toString()}`),
    [params.toString(), isLive],
    { enabled: isLive, fallback: { data: CLIENTES } }
  );

  const raw = (isLive && cliQ.data?.data) ? cliQ.data.data : CLIENTES;
  const normalized = raw.map(c => ({
    id: c.id,
    nombre: c.nombre,
    ruc: c.ruc,
    nit: c.nit || "—",
    tipo: c.tipo,
    actividad: c.actividad || "—",
    ingresos: +c.ingresos || +c.total_ingresos || 0,
    txns: +c.txns || +c.total_transacciones || 0,
    estado: c.estado,
  }));

  // Apply local filters on demo data; backend already filtered when live
  const filtered = isLive ? normalized : normalized.filter(c => {
    if (estado !== "Todos" && c.estado !== estado.toLowerCase()) return false;
    if (tipo !== "Todos" && c.tipo !== tipo.toLowerCase()) return false;
    if (q && !c.nombre.toLowerCase().includes(q.toLowerCase()) && !c.ruc.includes(q)) return false;
    return true;
  });

  const totalIng = normalized.reduce((a, c) => a + c.ingresos, 0);
  const activos = normalized.filter(c => c.estado === "activo").length;
  const omisos = normalized.filter(c => c.estado === "omiso").length;

  const save = async (form) => {
    if (!isLive) { showToast(editing ? "Cambios guardados" : "Cliente creado (demo)", { icon: "check" }); return; }
    try {
      if (editing) await api.put(`/clientes/${editing.id}`, form);
      else await api.post("/clientes", form);
      showToast(editing ? "Cambios guardados ✓" : "Cliente creado ✓", { icon: "check" });
      cliQ.refetch();
    } catch (e) {
      showToast(e.message, { icon: "alert" });
    }
  };

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Operación", "Clientes"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => showToast("Exportando…", { icon: "download" })}>
              <window.Ico name="download" size={13} />Exportar
            </button>
            <button className="btn primary" onClick={() => setOpenNew(true)}>
              <window.Ico name="plus" size={13} />Nuevo cliente
            </button>
          </>
        }
      />

      <div style={{ padding: "22px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          <Stat label="Total clientes" v={normalized.length} />
          <Stat label="Activos" v={activos} tone="green" />
          <Stat label="Omisos" v={omisos} tone="red" />
          <Stat label="Ingresos generados" v={window.fmt$(totalIng, { decimals: 0 })} />
        </div>

        {/* Filter bar */}
        <div className="card" style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10, marginBottom: 12 }}>
          <window.Ico name="search" size={14} color="var(--muted)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o RUC…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--ink)", fontFamily: "inherit" }} />
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="inp" style={{ width: 150, padding: "6px 10px", fontSize: 12 }}>
            <option>Todos</option><option>Jurídica</option><option>Natural</option>
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value)} className="inp" style={{ width: 130, padding: "6px 10px", fontSize: 12 }}>
            <option>Todos</option><option>Activo</option><option>Inactivo</option><option>Omiso</option>
          </select>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente / razón social</th>
                <th>RUC</th>
                <th>Tipo</th>
                <th>Actividad</th>
                <th className="r">Ingresos</th>
                <th className="r">Asientos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                        background: "var(--teal-50)", color: "var(--teal-700)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "Instrument Serif, serif", fontSize: 14, fontWeight: 400
                      }}>{c.nombre.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 2 }}>NIT {c.nit}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono muted">{c.ruc}</td>
                  <td>
                    <window.Pill tone={c.tipo === "jurídica" ? "blue" : "gold"}>{c.tipo}</window.Pill>
                  </td>
                  <td className="muted">{c.actividad}</td>
                  <td className="r num mono" style={{ fontWeight: 700, color: "var(--green)" }}>{window.fmt$(c.ingresos, { decimals: 0 })}</td>
                  <td className="r num mono muted">{c.txns}</td>
                  <td>
                    <window.Pill tone={c.estado === "activo" ? "green" : c.estado === "omiso" ? "red" : "grey"} dot>{c.estado}</window.Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ClienteModal
        open={openNew || !!editing}
        editing={editing}
        onClose={() => { setOpenNew(false); setEditing(null); }}
        onSave={async (form) => {
          await save(form);
          setOpenNew(false); setEditing(null);
        }}
      />
    </>
  );
};

const ClienteModal = ({ open, editing, onClose, onSave }) => {
  const [form, setForm] = React.useState({
    nombre: "", ruc: "", nit: "", tipo: "jurídica", actividad: "", email: "", notas: "", estado: "activo",
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        nombre: editing?.nombre || "",
        ruc: editing?.ruc || "",
        nit: editing?.nit === "—" ? "" : (editing?.nit || ""),
        tipo: editing?.tipo || "jurídica",
        actividad: editing?.actividad === "—" ? "" : (editing?.actividad || ""),
        email: editing?.email || "",
        notas: editing?.notas || "",
        estado: editing?.estado || "activo",
      });
    }
  }, [open, editing?.id]);

  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <window.Modal open={open} onClose={onClose}
      title={editing ? "Editar cliente" : "Nuevo cliente"}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn teal" onClick={() => onSave(form)}>
            {editing ? "Guardar" : "Crear cliente"}
          </button>
        </>
      }>
      <window.FormField label="Nombre / razón social">
        <input className="inp" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Constructora Istmo S.A." autoFocus />
      </window.FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <window.FormField label="RUC"><input className="inp mono" value={form.ruc} onChange={e => set("ruc", e.target.value)} placeholder="155-789-1" /></window.FormField>
        <window.FormField label="NIT"><input className="inp mono" value={form.nit} onChange={e => set("nit", e.target.value)} placeholder="NT-00234" /></window.FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <window.FormField label="Tipo">
          <select className="inp" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
            <option value="jurídica">Persona jurídica</option>
            <option value="natural">Persona natural</option>
          </select>
        </window.FormField>
        <window.FormField label="Actividad económica">
          <input className="inp" value={form.actividad} onChange={e => set("actividad", e.target.value)} placeholder="Construcción" />
        </window.FormField>
      </div>
      <window.FormField label="Correo del contacto">
        <input className="inp" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="contacto@cliente.pa" />
      </window.FormField>
    </window.Modal>
  );
};

const Stat = ({ label, v, tone }) => (
  <div className="card" style={{ padding: "13px 16px" }}>
    <div className="xs">{label}</div>
    <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : "var(--ink)" }}>{v}</div>
  </div>
);

Object.assign(window, { ScreenClientes });
