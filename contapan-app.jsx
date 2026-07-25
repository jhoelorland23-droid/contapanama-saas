import { useState, useMemo } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const CLIENTES_INIT = [
  { id: 1, nombre: "Constructora Istmo S.A.", ruc: "155-789-1", tipo: "jurídica", actividad: "Construcción", estado: "activo", nit: "NT-00234" },
  { id: 2, nombre: "Carlos Méndez Palacios", ruc: "8-123-456", tipo: "natural", actividad: "Consultoría", estado: "activo", nit: "NT-00892" },
  { id: 3, nombre: "Tech Pacific Corp", ruc: "345-101-2", tipo: "jurídica", actividad: "Tecnología", estado: "omiso", nit: "NT-01101" },
  { id: 4, nombre: "María Torres Vega", ruc: "4-234-789", tipo: "natural", actividad: "Comercio", estado: "activo", nit: "NT-00456" },
  { id: 5, nombre: "Grupo Logístico Atlántico", ruc: "210-567-3", tipo: "jurídica", actividad: "Logística", estado: "inactivo", nit: "NT-00789" },
];

const TRANSACCIONES_INIT = [
  { id: 1, fecha: "2025-03-01", cliente: "Constructora Istmo S.A.", descripcion: "Factura de servicios de consultoría", tipo: "ingreso", monto: 3500, itbms: 245, deducible: false, banco: "Banco Nacional", ref: "CHQ-001234" },
  { id: 2, fecha: "2025-03-05", cliente: "Carlos Méndez Palacios", descripcion: "Honorarios profesionales - Marzo", tipo: "ingreso", monto: 1800, itbms: 126, deducible: false, banco: "Banistmo", ref: "TRF-0045" },
  { id: 3, fecha: "2025-03-08", cliente: "Tech Pacific Corp", descripcion: "Alquiler de oficina - Marzo", tipo: "gasto", monto: 850, itbms: 59.5, deducible: true, banco: "Banco Nacional", ref: "CHQ-001235" },
  { id: 4, fecha: "2025-03-12", cliente: "María Torres Vega", descripcion: "Venta de mercancía - Lote #14", tipo: "ingreso", monto: 5200, itbms: 364, deducible: false, banco: "BAC", ref: "TRF-0089" },
  { id: 5, fecha: "2025-03-15", cliente: "Constructora Istmo S.A.", descripcion: "Servicios de contabilidad mensual", tipo: "ingreso", monto: 2100, itbms: 147, deducible: false, banco: "Banco Nacional", ref: "TRF-0102" },
  { id: 6, fecha: "2025-03-18", cliente: "Grupo Logístico Atlántico", descripcion: "Papelería y útiles de oficina", tipo: "gasto", monto: 320, itbms: 22.4, deducible: true, banco: "Banistmo", ref: "EFE-0023" },
  { id: 7, fecha: "2025-03-22", cliente: "Carlos Méndez Palacios", descripcion: "Servicios de internet y telefonía", tipo: "gasto", monto: 180, itbms: 12.6, deducible: true, banco: "BAC", ref: "DEB-0011" },
];

const VENCIMIENTOS = [
  { id: 1, descripcion: "Declaración ITBMS - Marzo 2025", entidad: "DGI", fecha: "2025-04-15", cliente: "Todos", urgencia: "alta" },
  { id: 2, descripcion: "Declaración Renta - 2024", entidad: "DGI", fecha: "2025-03-31", cliente: "Constructora Istmo S.A.", urgencia: "critica" },
  { id: 3, descripcion: "Aviso de Operación - Municipio", entidad: "Municipio", fecha: "2025-04-30", cliente: "Tech Pacific Corp", urgencia: "media" },
  { id: 4, descripcion: "Declaración ITBMS - Febrero 2025", entidad: "DGI", fecha: "2025-04-01", cliente: "María Torres Vega", urgencia: "alta" },
  { id: 5, descripcion: "Declaración de Renta Estimada", entidad: "DGI", fecha: "2025-06-30", cliente: "Grupo Logístico Atlántico", urgencia: "baja" },
];

// ─── STYLE TOKENS ─────────────────────────────────────────────────────────────
const C = {
  nav: "#0f1923",
  navHover: "#1a2d3e",
  navActive: "#0e3a5c",
  accent: "#0ea5e9",
  accentDark: "#0284c7",
  bg: "#f0f4f8",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  success: "#10b981",
  successBg: "#ecfdf5",
  successText: "#065f46",
  warning: "#f59e0b",
  warningBg: "#fffbeb",
  warningText: "#92400e",
  danger: "#ef4444",
  dangerBg: "#fef2f2",
  dangerText: "#991b1b",
  info: "#0ea5e9",
  infoBg: "#f0f9ff",
  infoText: "#0c4a6e",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("es-PA", { style: "currency", currency: "USD" }).format(n);
const estadoBadge = (e) => {
  const map = { activo: [C.success, C.successBg, C.successText], inactivo: [C.textLight, "#f1f5f9", "#475569"], omiso: [C.danger, C.dangerBg, C.dangerText] };
  const [, bg, text] = map[e] || map.inactivo;
  return { background: bg, color: text, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "inline-block", textTransform: "uppercase", letterSpacing: "0.05em" };
};
const urgenciaBadge = (u) => {
  const map = { critica: [C.dangerBg, C.dangerText], alta: [C.warningBg, C.warningText], media: [C.infoBg, C.infoText], baja: ["#f8fafc", C.textMuted] };
  const [bg, color] = map[u] || map.baja;
  return { background: bg, color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "inline-block", textTransform: "uppercase", letterSpacing: "0.04em" };
};

// ─── ICONS (inline SVG) ───────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const paths = {
    dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    journal: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    tax: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z",
    report: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    plus: "M12 4v16m8-8H4",
    check: "M5 13l4 4L19 7",
    x: "M6 18L18 6M6 6l12 12",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    arrow: "M13 7l5 5m0 0l-5 5m5-5H6",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    trending: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    dollar: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  };
  return (
    <svg width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
};

// ─── CARD COMPONENT ───────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", ...style }}>{children}</div>
);

const KpiCard = ({ label, value, sub, icon, color = C.accent }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "flex-start", gap: 16 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={20} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>{sub}</div>}
    </div>
  </div>
);

// ─── MODAL ────────────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, width = 540 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: width, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 4, borderRadius: 6 }}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  </div>
);

// ─── INPUT COMPONENTS ─────────────────────────────────────────────────────────
const inputStyle = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.surfaceAlt, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" };
const FormField = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "clientes", label: "Clientes", icon: "users" },
  { id: "transacciones", label: "Diario Contable", icon: "journal" },
  { id: "fiscal", label: "Módulo Fiscal", icon: "tax" },
  { id: "reportes", label: "Reportes", icon: "report" },
  { id: "alertas", label: "Alertas", icon: "bell" },
];

const Sidebar = ({ active, setActive }) => (
  <div style={{ width: 230, background: C.nav, display: "flex", flexDirection: "column", height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 100 }}>
    <div style={{ padding: "24px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, background: C.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="dollar" size={18} color="#fff" />
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>ContaPanamá</div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>Sistema Contable</div>
        </div>
      </div>
    </div>

    <div style={{ padding: "0 12px", flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 8px 6px" }}>Módulos</div>
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => setActive(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, background: isActive ? C.navActive : "transparent", color: isActive ? "#e0f2fe" : "#94a3b8", fontWeight: isActive ? 600 : 400, fontSize: 14, textAlign: "left", transition: "all 0.15s", fontFamily: "inherit" }}>
            <Icon name={item.icon} size={17} color={isActive ? C.accent : "#64748b"} />
            {item.label}
          </button>
        );
      })}
    </div>

    <div style={{ padding: "12px 12px 20px", borderTop: "1px solid #1e293b" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#bfdbfe" }}>CP</div>
        <div>
          <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>Contador CPA</div>
          <div style={{ color: "#475569", fontSize: 11 }}>Administrador</div>
        </div>
      </div>
    </div>
  </div>
);

// ─── VIEWS ────────────────────────────────────────────────────────────────────

// DASHBOARD VIEW
const DashboardView = ({ clientes, transacciones, vencimientos }) => {
  const ingresos = transacciones.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gastos = transacciones.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const itbmsDebito = transacciones.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.itbms, 0);
  const itbmsCredito = transacciones.filter((t) => t.tipo === "gasto" && t.deducible).reduce((s, t) => s + t.itbms, 0);
  const clientesActivos = clientes.filter((c) => c.estado === "activo").length;
  const omisos = clientes.filter((c) => c.estado === "omiso").length;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Dashboard</div>
        <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>Resumen general — Marzo 2025</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <KpiCard label="Ingresos del Mes" value={fmt(ingresos)} sub="↑ +12% vs Feb" icon="trending" color="#10b981" />
        <KpiCard label="Gastos del Mes" value={fmt(gastos)} sub="↓ -3% vs Feb" icon="dollar" color="#f59e0b" />
        <KpiCard label="ITBMS a Pagar" value={fmt(itbmsDebito - itbmsCredito)} sub={`Débito: ${fmt(itbmsDebito)}`} icon="tax" color="#0ea5e9" />
        <KpiCard label="Clientes Activos" value={clientesActivos} sub={`${omisos} omisos — ${clientes.length} total`} icon="users" color="#8b5cf6" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Últimas transacciones */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Últimos Movimientos</div>
            <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, cursor: "pointer" }}>Ver todos →</div>
          </div>
          {transacciones.slice(0, 5).map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.descripcion}</div>
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{t.fecha} · {t.cliente}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.tipo === "ingreso" ? C.success : C.danger }}>
                  {t.tipo === "ingreso" ? "+" : "-"}{fmt(t.monto)}
                </div>
                <div style={{ fontSize: 10, color: C.textLight }}>ITBMS: {fmt(t.itbms)}</div>
              </div>
            </div>
          ))}
        </Card>

        {/* Vencimientos */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Alertas de Vencimiento</div>
            <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, cursor: "pointer" }}>Ver todos →</div>
          </div>
          {vencimientos.slice(0, 5).map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{v.descripcion}</div>
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{v.cliente} · {v.entidad}</div>
              </div>
              <div style={{ textAlign: "right", marginLeft: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>{v.fecha}</div>
                <span style={urgenciaBadge(v.urgencia)}>{v.urgencia}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Resumen ITBMS */}
      <Card style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Resumen ITBMS — Marzo 2025</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { label: "ITBMS Débito (Ventas)", value: fmt(itbmsDebito), color: C.danger, bg: C.dangerBg },
            { label: "ITBMS Crédito (Compras)", value: fmt(itbmsCredito), color: C.success, bg: C.successBg },
            { label: "Saldo a Pagar DGI", value: fmt(itbmsDebito - itbmsCredito), color: C.accent, bg: C.infoBg },
          ].map((item) => (
            <div key={item.label} style={{ background: item.bg, border: `1px solid ${item.color}22`, borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: item.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// CLIENTES VIEW
const ClientesView = ({ clientes, setClientes }) => {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", ruc: "", nit: "", tipo: "jurídica", actividad: "", estado: "activo" });
  const [editId, setEditId] = useState(null);

  const filtered = clientes.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()) || c.ruc.includes(search));

  const handleSave = () => {
    if (!form.nombre || !form.ruc) return;
    if (editId) {
      setClientes(clientes.map((c) => (c.id === editId ? { ...c, ...form } : c)));
    } else {
      setClientes([...clientes, { ...form, id: Date.now() }]);
    }
    setShowModal(false);
    setEditId(null);
    setForm({ nombre: "", ruc: "", nit: "", tipo: "jurídica", actividad: "", estado: "activo" });
  };

  const handleEdit = (c) => {
    setForm({ nombre: c.nombre, ruc: c.ruc, nit: c.nit, tipo: c.tipo, actividad: c.actividad, estado: c.estado });
    setEditId(c.id);
    setShowModal(true);
  };

  const handleDelete = (id) => setClientes(clientes.filter((c) => c.id !== id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Gestión de Clientes</div>
          <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>{clientes.length} clientes registrados</div>
        </div>
        <button onClick={() => { setEditId(null); setForm({ nombre: "", ruc: "", nit: "", tipo: "jurídica", actividad: "", estado: "activo" }); setShowModal(true); }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: C.accent, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          <Icon name="plus" size={16} color="#fff" /> Nuevo Cliente
        </button>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="search" size={16} color={C.textMuted} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o RUC..." style={{ border: "none", outline: "none", fontSize: 14, flex: 1, fontFamily: "inherit", color: C.text, background: "transparent" }} />
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surfaceAlt }}>
              {["Cliente / Razón Social", "RUC", "Tipo", "Actividad", "Estado", "Acciones"].map((h) => (
                <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : C.surfaceAlt }}>
                <td style={{ padding: "14px 20px" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>NIT: {c.nit}</div>
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: C.textMuted, fontFamily: "JetBrains Mono, monospace" }}>{c.ruc}</td>
                <td style={{ padding: "14px 20px" }}>
                  <span style={{ fontSize: 12, background: c.tipo === "jurídica" ? C.infoBg : "#fdf4ff", color: c.tipo === "jurídica" ? C.infoText : "#7c3aed", padding: "2px 10px", borderRadius: 20, fontWeight: 600, textTransform: "capitalize" }}>{c.tipo}</span>
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: C.textMuted }}>{c.actividad}</td>
                <td style={{ padding: "14px 20px" }}><span style={estadoBadge(c.estado)}>{c.estado}</span></td>
                <td style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleEdit(c)} style={{ background: C.infoBg, border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer", color: C.infoText }}><Icon name="edit" size={14} color={C.infoText} /></button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: C.dangerBg, border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}><Icon name="trash" size={14} color={C.dangerText} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <Modal title={editId ? "Editar Cliente" : "Nuevo Cliente"} onClose={() => setShowModal(false)}>
          <FormField label="Nombre / Razón Social">
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Constructora ABC S.A." style={inputStyle} />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="RUC">
              <input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} placeholder="Ej: 155-789-1" style={inputStyle} />
            </FormField>
            <FormField label="NIT">
              <input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="Ej: NT-00234" style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Tipo de Contribuyente">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                <option value="jurídica">Persona Jurídica</option>
                <option value="natural">Persona Natural</option>
              </select>
            </FormField>
            <FormField label="Estado Fiscal">
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={inputStyle}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="omiso">Omiso</option>
              </select>
            </FormField>
          </div>
          <FormField label="Actividad Económica">
            <input value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })} placeholder="Ej: Construcción, Comercio, Tecnología..." style={inputStyle} />
          </FormField>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setShowModal(false)} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: C.textMuted }}>Cancelar</button>
            <button onClick={handleSave} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Guardar Cliente</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// TRANSACCIONES VIEW
const TransaccionesView = ({ transacciones, setTransacciones, clientes }) => {
  const [showModal, setShowModal] = useState(false);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [form, setForm] = useState({ fecha: "", cliente: "", descripcion: "", tipo: "ingreso", monto: "", itbms: "", deducible: false, banco: "", ref: "" });

  const filtered = transacciones.filter((t) => filterTipo === "todos" || t.tipo === filterTipo);
  const totalIngresos = filtered.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const totalGastos = filtered.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);

  const handleSave = () => {
    if (!form.fecha || !form.descripcion || !form.monto) return;
    const monto = parseFloat(form.monto);
    const itbms = parseFloat(form.itbms) || monto * 0.07;
    setTransacciones([...transacciones, { ...form, id: Date.now(), monto, itbms: parseFloat(itbms.toFixed(2)) }]);
    setShowModal(false);
    setForm({ fecha: "", cliente: "", descripcion: "", tipo: "ingreso", monto: "", itbms: "", deducible: false, banco: "", ref: "" });
  };

  const calcItbms = (monto) => {
    const m = parseFloat(monto);
    if (!isNaN(m)) setForm((f) => ({ ...f, itbms: (m * 0.07).toFixed(2) }));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Diario Contable</div>
          <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>Registro de ingresos y gastos — Marzo 2025</div>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: C.accent, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          <Icon name="plus" size={16} color="#fff" /> Nuevo Registro
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        <KpiCard label="Total Ingresos" value={fmt(totalIngresos)} icon="trending" color={C.success} />
        <KpiCard label="Total Gastos" value={fmt(totalGastos)} icon="dollar" color={C.warning} />
        <KpiCard label="Resultado Neto" value={fmt(totalIngresos - totalGastos)} icon="check" color={totalIngresos - totalGastos >= 0 ? C.success : C.danger} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["todos", "ingreso", "gasto"].map((tipo) => (
          <button key={tipo} onClick={() => setFilterTipo(tipo)} style={{ padding: "7px 18px", borderRadius: 20, border: `1px solid ${filterTipo === tipo ? C.accent : C.border}`, background: filterTipo === tipo ? C.infoBg : "none", color: filterTipo === tipo ? C.accent : C.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
            {tipo === "todos" ? "Todos" : tipo === "ingreso" ? "Ingresos" : "Gastos"}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surfaceAlt }}>
              {["Fecha", "Descripción", "Cliente", "Tipo", "Monto", "ITBMS", "Banco / Ref", "Deducible"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : C.surfaceAlt }}>
                <td style={{ padding: "12px 16px", fontSize: 12, color: C.textMuted, fontFamily: "JetBrains Mono, monospace" }}>{t.fecha}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 220 }}>{t.descripcion}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: C.textMuted }}>{t.cliente}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.tipo === "ingreso" ? C.successBg : C.dangerBg, color: t.tipo === "ingreso" ? C.successText : C.dangerText, textTransform: "uppercase" }}>{t.tipo}</span>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: t.tipo === "ingreso" ? C.success : C.danger }}>{t.tipo === "ingreso" ? "+" : "-"}{fmt(t.monto)}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: C.textMuted }}>{fmt(t.itbms)}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.banco}</div>
                  <div style={{ fontSize: 11, color: C.textLight, fontFamily: "JetBrains Mono, monospace" }}>{t.ref}</div>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  {t.deducible ? <span style={{ color: C.success, fontWeight: 700, fontSize: 13 }}>✓</span> : <span style={{ color: C.textLight, fontSize: 13 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f8fafc", borderTop: `2px solid ${C.border}` }}>
              <td colSpan={4} style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" }}>Totales del Período</td>
              <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700, color: C.text }}>{fmt(filtered.reduce((s, t) => s + (t.tipo === "ingreso" ? t.monto : -t.monto), 0))}</td>
              <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: C.text }}>{fmt(filtered.reduce((s, t) => s + t.itbms, 0))}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {showModal && (
        <Modal title="Nuevo Registro Contable" onClose={() => setShowModal(false)} width={580}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Fecha">
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle} />
            </FormField>
            <FormField label="Tipo de Movimiento">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                <option value="ingreso">Ingreso</option>
                <option value="gasto">Gasto</option>
              </select>
            </FormField>
          </div>
          <FormField label="Descripción / Concepto">
            <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Factura de servicios de consultoría" style={inputStyle} />
          </FormField>
          <FormField label="Cliente">
            <select value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} style={inputStyle}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Monto (USD)">
              <input type="number" value={form.monto} onChange={(e) => { setForm({ ...form, monto: e.target.value }); calcItbms(e.target.value); }} placeholder="0.00" style={inputStyle} />
            </FormField>
            <FormField label="ITBMS (7% auto-calculado)">
              <input type="number" value={form.itbms} onChange={(e) => setForm({ ...form, itbms: e.target.value })} placeholder="0.00" style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Banco">
              <select value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} style={inputStyle}>
                <option value="">Seleccionar banco...</option>
                {["Banco Nacional", "Banistmo", "BAC", "Banesco", "Global Bank", "Caja de Ahorros"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </FormField>
            <FormField label="Referencia / Cheque">
              <input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="Ej: CHQ-001234" style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <input type="checkbox" id="deducible" checked={form.deducible} onChange={(e) => setForm({ ...form, deducible: e.target.checked })} style={{ width: 16, height: 16, accentColor: C.accent }} />
            <label htmlFor="deducible" style={{ fontSize: 14, color: C.textMuted, cursor: "pointer" }}>Gasto deducible (para ITBMS crédito fiscal)</label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowModal(false)} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: C.textMuted }}>Cancelar</button>
            <button onClick={handleSave} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Registrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// FISCAL VIEW
const FiscalView = ({ transacciones }) => {
  const ingresos = transacciones.filter((t) => t.tipo === "ingreso");
  const gastos = transacciones.filter((t) => t.tipo === "gasto");
  const gastosDed = gastos.filter((t) => t.deducible);
  const totalIngresos = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalGastos = gastos.reduce((s, t) => s + t.monto, 0);
  const itbmsDebito = ingresos.reduce((s, t) => s + t.itbms, 0);
  const itbmsCredito = gastosDed.reduce((s, t) => s + t.itbms, 0);
  const itbmsNeto = itbmsDebito - itbmsCredito;
  const rentaBase = totalIngresos - totalGastos;
  const tasaRenta = rentaBase > 11000 ? 0.25 : 0.15;
  const impuestoRenta = Math.max(0, rentaBase * tasaRenta);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Módulo Fiscal — Panamá</div>
        <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>Cálculos automáticos DGI · ITBMS · Renta · Municipio</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* ITBMS */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, background: C.infoBg, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="tax" size={18} color={C.accent} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Declaración ITBMS</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>Impuesto de Transferencia de Bienes Corporales Muebles</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {[
              ["Base imponible (Ingresos)", fmt(totalIngresos), C.text],
              ["ITBMS Débito (Ventas 7%)", fmt(itbmsDebito), C.dangerText],
              ["ITBMS Crédito (Compras deducibles)", fmt(itbmsCredito), C.successText],
              ["", null, null],
              ["ITBMS NETO A PAGAR", fmt(itbmsNeto), C.accent],
            ].map(([label, val, color], i) =>
              val ? (
                <tr key={i} style={{ borderBottom: i === 3 ? `2px solid ${C.border}` : `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 0", fontSize: 13, color: C.textMuted }}>{label}</td>
                  <td style={{ padding: "10px 0", fontSize: i === 4 ? 16 : 14, fontWeight: i === 4 ? 800 : 600, color, textAlign: "right" }}>{val}</td>
                </tr>
              ) : <tr key={i}><td colSpan={2} style={{ height: 8 }}></td></tr>
            )}
          </table>
          <div style={{ marginTop: 16, background: C.warningBg, border: `1px solid ${C.warning}33`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon name="bell" size={14} color={C.warning} />
            <div style={{ fontSize: 12, color: C.warningText }}>Vencimiento: <strong>15 de abril de 2025</strong> · Formulario 430 DGI</div>
          </div>
        </Card>

        {/* Renta */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, background: "#fdf4ff", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="dollar" size={18} color="#7c3aed" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Declaración de Renta</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>Impuesto sobre la Renta (ISR) — Panamá</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {[
              ["Total Ingresos Brutos", fmt(totalIngresos), C.text],
              ["(-) Gastos Deducibles", fmt(gastosDed.reduce((s, t) => s + t.monto, 0)), C.textMuted],
              ["(-) Total Costos y Gastos", fmt(totalGastos), C.textMuted],
              ["", null, null],
              ["Renta Gravable", fmt(rentaBase), C.text],
              [`Tasa aplicable (${(tasaRenta * 100).toFixed(0)}%)`, "—", C.textMuted],
              ["", null, null],
              ["IMPUESTO SOBRE LA RENTA", fmt(impuestoRenta), "#7c3aed"],
            ].map(([label, val, color], i) =>
              val ? (
                <tr key={i} style={{ borderBottom: [3, 6].includes(i) ? `2px solid ${C.border}` : `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 0", fontSize: 13, color: C.textMuted }}>{label}</td>
                  <td style={{ padding: "10px 0", fontSize: i === 7 ? 15 : 13, fontWeight: i === 7 ? 800 : 600, color, textAlign: "right" }}>{val}</td>
                </tr>
              ) : <tr key={i}><td colSpan={2} style={{ height: 6 }}></td></tr>
            )}
          </table>
          <div style={{ marginTop: 16, background: C.infoBg, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon name="calendar" size={14} color={C.accent} />
            <div style={{ fontSize: 12, color: C.infoText }}>Vencimiento anual: <strong>31 de marzo</strong> · Formulario 101 DGI</div>
          </div>
        </Card>
      </div>

      {/* Tabla resumen fiscal */}
      <Card style={{ marginTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Calendario de Obligaciones Fiscales — Panamá 2025</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surfaceAlt }}>
              {["Obligación", "Entidad", "Periodicidad", "Próximo Vencimiento", "Estado"].map((h) => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { ob: "Declaración ITBMS", entidad: "DGI", period: "Mensual", fecha: "15-Apr-2025", estado: "pendiente" },
              { ob: "Impuesto sobre la Renta", entidad: "DGI", period: "Anual", fecha: "31-Mar-2025", estado: "vencido" },
              { ob: "Aviso de Operaciones", entidad: "MICI", period: "Anual", fecha: "31-Mar-2025", estado: "presentado" },
              { ob: "Impuesto Municipio", entidad: "Municipio", period: "Trimestral", fecha: "30-Apr-2025", estado: "pendiente" },
              { ob: "Planilla CSS", entidad: "CSS", period: "Mensual", fecha: "15-Apr-2025", estado: "pendiente" },
              { ob: "Declaración Renta Estimada", entidad: "DGI", period: "Anual", fecha: "30-Jun-2025", estado: "proximo" },
            ].map((row, i) => {
              const colorMap = { pendiente: [C.warningBg, C.warningText], vencido: [C.dangerBg, C.dangerText], presentado: [C.successBg, C.successText], proximo: [C.infoBg, C.infoText] };
              const [bg, tc] = colorMap[row.estado];
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : C.surfaceAlt }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 13, color: C.text }}>{row.ob}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: C.textMuted }}>{row.entidad}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: C.textMuted }}>{row.period}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono, monospace" }}>{row.fecha}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: bg, color: tc, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{row.estado}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// REPORTES VIEW
const ReportesView = ({ transacciones, clientes }) => {
  const ingresos = transacciones.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gastos = transacciones.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const utilidad = ingresos - gastos;
  const margen = ingresos > 0 ? ((utilidad / ingresos) * 100).toFixed(1) : 0;

  const reports = [
    { id: 1, titulo: "Diario Combinado — Marzo 2025", desc: "Registro completo de ingresos y gastos listo para auditoría", icon: "journal", color: C.accent },
    { id: 2, titulo: "Estado de Resultados — Q1 2025", desc: "Ingresos, costos, gastos y utilidad neta del trimestre", icon: "trending", color: C.success },
    { id: 3, titulo: "Declaración ITBMS — Marzo 2025", desc: "Formulario 430 con débito, crédito y saldo a pagar", icon: "tax", color: "#7c3aed" },
    { id: 4, titulo: "Flujo de Caja — Marzo 2025", desc: "Movimientos de efectivo y conciliación bancaria", icon: "dollar", color: C.warning },
    { id: 5, titulo: "Reporte por Cliente — Constructora Istmo", desc: "Detalle de transacciones y estado fiscal por cliente", icon: "users", color: "#ec4899" },
    { id: 6, titulo: "Balance General — Marzo 2025", desc: "Activos, pasivos y patrimonio al cierre del mes", icon: "report", color: "#14b8a6" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Reportes y Estados Financieros</div>
        <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>Reportes automáticos listos para auditoría y DGI</div>
      </div>

      {/* Estado de Resultados inline */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20 }}>Estado de Resultados — Marzo 2025</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2px 1fr", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.success, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Ingresos</div>
            {transacciones.filter((t) => t.tipo === "ingreso").map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.textMuted }}>{t.descripcion}</span>
                <span style={{ fontWeight: 600, color: C.text }}>{fmt(t.monto)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", fontSize: 14, fontWeight: 800 }}>
              <span>Total Ingresos</span>
              <span style={{ color: C.success }}>{fmt(ingresos)}</span>
            </div>
          </div>
          <div style={{ background: C.border }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Gastos y Costos</div>
            {transacciones.filter((t) => t.tipo === "gasto").map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.textMuted }}>{t.descripcion}</span>
                <span style={{ fontWeight: 600, color: C.text }}>{fmt(t.monto)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", fontSize: 14, fontWeight: 800 }}>
              <span>Total Gastos</span>
              <span style={{ color: C.danger }}>{fmt(gastos)}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20, padding: "16px 20px", background: utilidad >= 0 ? C.successBg : C.dangerBg, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: utilidad >= 0 ? C.successText : C.dangerText, textTransform: "uppercase", letterSpacing: "0.06em" }}>Utilidad / Pérdida Neta</div>
            <div style={{ fontSize: 12, color: utilidad >= 0 ? C.successText : C.dangerText, marginTop: 2, opacity: 0.8 }}>Margen: {margen}%</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: utilidad >= 0 ? C.success : C.danger }}>{fmt(utilidad)}</div>
        </div>
      </Card>

      {/* Report cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {reports.map((r) => (
          <div key={r.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px", cursor: "pointer", transition: "box-shadow 0.15s" }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: r.color + "18", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Icon name={r.icon} size={18} color={r.color} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{r.titulo}</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 16 }}>{r.desc}</div>
            <button style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: r.color, background: r.color + "15", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="report" size={13} color={r.color} /> Generar PDF
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ALERTAS VIEW
const AlertasView = ({ vencimientos }) => (
  <div>
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Centro de Alertas y Vencimientos</div>
      <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>Obligaciones próximas y vencimientos fiscales</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vencimientos.map((v) => {
        const bg = { critica: C.dangerBg, alta: C.warningBg, media: C.infoBg, baja: C.surfaceAlt }[v.urgencia];
        const border = { critica: C.danger, alta: C.warning, media: C.accent, baja: C.border }[v.urgencia];
        return (
          <div key={v.id} style={{ background: bg, border: `1px solid ${border}44`, borderLeft: `4px solid ${border}`, borderRadius: 10, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Icon name="bell" size={20} color={border} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{v.descripcion}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{v.cliente} · {v.entidad}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{v.fecha}</div>
              <span style={urgenciaBadge(v.urgencia)}>{v.urgencia}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [clientes, setClientes] = useState(CLIENTES_INIT);
  const [transacciones, setTransacciones] = useState(TRANSACCIONES_INIT);
  const vencimientos = VENCIMIENTOS;

  const renderView = () => {
    switch (activeView) {
      case "dashboard": return <DashboardView clientes={clientes} transacciones={transacciones} vencimientos={vencimientos} />;
      case "clientes": return <ClientesView clientes={clientes} setClientes={setClientes} />;
      case "transacciones": return <TransaccionesView transacciones={transacciones} setTransacciones={setTransacciones} clientes={clientes} />;
      case "fiscal": return <FiscalView transacciones={transacciones} />;
      case "reportes": return <ReportesView transacciones={transacciones} clientes={clientes} />;
      case "alertas": return <AlertasView vencimientos={vencimientos} />;
      default: return null;
    }
  };

  return (
    <>
      <style>{FONTS}</style>
      <style>{`* { font-family: 'Plus Jakarta Sans', sans-serif; box-sizing: border-box; margin: 0; padding: 0; } input, select, textarea, button { font-family: 'Plus Jakarta Sans', sans-serif; }`}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
        <Sidebar active={activeView} setActive={setActiveView} />
        <main style={{ marginLeft: 230, flex: 1, padding: "36px 40px", minHeight: "100vh" }}>
          {renderView()}
        </main>
      </div>
    </>
  );
}
