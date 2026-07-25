// Operaciones — the deep operational layer.
// "Simple arriba, poderoso debajo". A workspace shell with 7 modules.

// ─── Workspace definitions ────────────────────────────────────────
const WORKSPACES = {
  finanzas: {
    label: "Finanzas",
    icon: "wallet",
    accent: "var(--gold)",
    description: "Conciliaciones · flujo de caja · diarios · mayor",
    sections: [
      { id: "fin-cash",       label: "Flujo de caja",       icon: "trendingUp" },
      { id: "fin-reconcile",  label: "Conciliaciones",      icon: "link" },
      { id: "fin-diario",     label: "Diario general",      icon: "documents" },
      { id: "fin-12m",        label: "Diario 12 meses",     icon: "calendar" },
      { id: "fin-mayor",      label: "Mayor general",       icon: "database" },
      { id: "fin-cxc",        label: "Cuentas por cobrar",  icon: "inbox" },
      { id: "fin-cxp",        label: "Cuentas por pagar",   icon: "send" },
    ],
  },
  ventas: {
    label: "Ventas",
    icon: "trendingUp",
    accent: "var(--green)",
    description: "Facturas · cotizaciones · clientes · POS · cobros",
    sections: [
      { id: "ven-facturas",   label: "Facturas",            icon: "receipt" },
      { id: "ven-cotiza",     label: "Cotizaciones",        icon: "documents" },
      { id: "ven-clientes",   label: "Clientes",            icon: "users" },
      { id: "ven-pos",        label: "Punto de venta",      icon: "zap" },
      { id: "ven-reportes",   label: "Reportes",            icon: "analytics" },
      { id: "ven-cobros",     label: "Estados de cobro",    icon: "inbox" },
    ],
  },
  compras: {
    label: "Compras",
    icon: "send",
    accent: "var(--orange)",
    description: "Proveedores · órdenes · gastos · validaciones IA",
    sections: [
      { id: "com-prov",       label: "Proveedores",         icon: "building" },
      { id: "com-compras",    label: "Compras",             icon: "receipt" },
      { id: "com-gastos",     label: "Gastos operativos",   icon: "send" },
      { id: "com-validar",    label: "Validaciones IA",     icon: "sparkles" },
      { id: "com-reportes",   label: "Reportes",            icon: "analytics" },
    ],
  },
  itbms: {
    label: "ITBMS",
    icon: "itbms",
    accent: "var(--red)",
    description: "Compras · ventas · F.430 · diferencias · alertas DGI",
    sections: [
      { id: "it-ventas",      label: "Reporte ventas",      icon: "trendingUp" },
      { id: "it-compras",     label: "Reporte compras",     icon: "trendingDown" },
      { id: "it-f430",        label: "Formulario 430",      icon: "documents" },
      { id: "it-diff",        label: "Diferencias",         icon: "shield" },
      { id: "it-alertas",     label: "Alertas fiscales",    icon: "bell" },
    ],
  },
  inventario: {
    label: "Inventario",
    icon: "layers",
    accent: "var(--violet)",
    description: "Stock · kardex · costo promedio · alertas",
    sections: [
      { id: "inv-stock",      label: "Stock actual",        icon: "database" },
      { id: "inv-entradas",   label: "Entradas",            icon: "arrowDown" },
      { id: "inv-salidas",    label: "Salidas",             icon: "arrowUp" },
      { id: "inv-kardex",     label: "Kardex",              icon: "documents" },
      { id: "inv-costo",      label: "Costo promedio",      icon: "analytics" },
      { id: "inv-alertas",    label: "Alertas",             icon: "bell" },
    ],
  },
  servicios: {
    label: "Servicios",
    icon: "workflow",
    accent: "var(--blue)",
    description: "Contratos · igualas · tareas · facturación automática",
    sections: [
      { id: "srv-contratos",  label: "Contratos",           icon: "documents" },
      { id: "srv-igualas",    label: "Igualas mensuales",   icon: "calendar" },
      { id: "srv-tareas",     label: "Tareas recurrentes",  icon: "workflow" },
      { id: "srv-billing",    label: "Facturación auto",    icon: "zap" },
    ],
  },
  documentos: {
    label: "Documentos",
    icon: "documents",
    accent: "var(--gold)",
    description: "OCR IA · clasificación · evidencia · validación",
    sections: [
      { id: "doc-ocr",        label: "Bandeja OCR",         icon: "camera" },
      { id: "doc-clasif",     label: "Clasificación IA",    icon: "sparkles" },
      { id: "doc-evid",       label: "Evidencia tributaria",icon: "shield" },
      { id: "doc-validar",    label: "Validación fiscal",   icon: "check" },
    ],
  },
};

// ─── Operations entry — routes between workspace IDs ─────────────────
const ScreenOperaciones = () => {
  const { view } = window.useApp();
  // view comes in as "ops:finanzas:fin-cash" — we parse it
  const [, wsId, secId] = view.split(":");
  const ws = WORKSPACES[wsId] || WORKSPACES.finanzas;
  const section = ws.sections.find(s => s.id === secId) || ws.sections[0];

  return (
    <window.Shell active={`ops:${wsId}`} topbar={
      <window.Topbar
        crumbs={["Operaciones", ws.label, section.label]}
        hint={ws.description}
        action={<>
          <button className="btn ghost"><window.Ico name="filter" size={13} />Filtros</button>
          <button className="btn ghost"><window.Ico name="download" size={13} />Exportar</button>
          <button className="btn gold"><window.Ico name="plus" size={13} />Nuevo</button>
        </>}
      />
    }>
      <WorkspaceShell ws={ws} wsId={wsId} section={section} />
    </window.Shell>
  );
};

// ─── Workspace shell — left rail + main content ─────────────────────
const WorkspaceShell = ({ ws, wsId, section }) => {
  const { navigate } = window.useApp();

  return (
    <div style={{ display: "flex", height: "100%", maxWidth: 1600, margin: "0 auto" }}>
      {/* Workspace sub-nav */}
      <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--hairline)", padding: "24px 14px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 10px 14px" }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: `${ws.accent}20`, color: ws.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${ws.accent}30`
          }}>
            <window.Ico name={ws.icon} size={12} />
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{ws.label}</div>
        </div>

        {ws.sections.map(s => {
          const on = section.id === s.id;
          return (
            <div key={s.id} onClick={() => navigate(`ops:${wsId}:${s.id}`)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 12px", borderRadius: 7, marginBottom: 1,
              background: on ? "var(--glass-strong)" : "transparent",
              color: on ? "var(--text)" : "var(--text-3)",
              fontSize: 12.5, fontWeight: on ? 500 : 400,
              cursor: "pointer", transition: "all .12s", position: "relative"
            }} onMouseEnter={e => { if (!on) { e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.color = "var(--text-2)"; } }}
               onMouseLeave={e => { if (!on) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; } }}>
              <window.Ico name={s.icon} size={13} color={on ? ws.accent : "currentColor"} />
              <span style={{ flex: 1 }}>{s.label}</span>
              {on && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: ws.accent, borderRadius: 2 }} />}
            </div>
          );
        })}
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px 48px" }}>
        <SectionRouter wsId={wsId} sectionId={section.id} accent={ws.accent} />
      </div>
    </div>
  );
};

// ─── Section content router ──────────────────────────────────────────
const SectionRouter = ({ wsId, sectionId, accent }) => {
  // Each section has its own content. Most reuse the same "executive + drill" pattern.
  switch (sectionId) {
    case "fin-cash":      return <FlujoCaja accent={accent} />;
    case "fin-reconcile": return <Conciliaciones accent={accent} />;
    case "fin-diario":    return <DiarioGeneral accent={accent} />;
    case "fin-12m":       return <Diario12M accent={accent} />;
    case "fin-mayor":     return <MayorGeneral accent={accent} />;
    case "fin-cxc":       return <CXC accent={accent} />;
    case "fin-cxp":       return <CXP accent={accent} />;

    case "ven-facturas":  return <Facturas accent={accent} />;
    case "ven-cotiza":    return <Cotizaciones accent={accent} />;
    case "ven-clientes":  return <ClientesVentas accent={accent} />;
    case "ven-pos":       return <POS accent={accent} />;
    case "ven-reportes":  return <ReportesVentas accent={accent} />;
    case "ven-cobros":    return <Cobros accent={accent} />;

    case "com-prov":      return <Proveedores accent={accent} />;
    case "com-compras":   return <Compras accent={accent} />;
    case "com-gastos":    return <Gastos accent={accent} />;
    case "com-validar":   return <ValidacionesIA accent={accent} />;
    case "com-reportes":  return <ReportesCompras accent={accent} />;

    case "it-ventas":     return <ITBMSVentas accent={accent} />;
    case "it-compras":    return <ITBMSCompras accent={accent} />;
    case "it-f430":       return <F430 accent={accent} />;
    case "it-diff":       return <Diferencias accent={accent} />;
    case "it-alertas":    return <AlertasFiscales accent={accent} />;

    case "inv-stock":     return <Stock accent={accent} />;
    case "inv-entradas":  return <Entradas accent={accent} />;
    case "inv-salidas":   return <Salidas accent={accent} />;
    case "inv-kardex":    return <Kardex accent={accent} />;
    case "inv-costo":     return <CostoPromedio accent={accent} />;
    case "inv-alertas":   return <AlertasInv accent={accent} />;

    case "srv-contratos": return <Contratos accent={accent} />;
    case "srv-igualas":   return <Igualas accent={accent} />;
    case "srv-tareas":    return <Tareas accent={accent} />;
    case "srv-billing":   return <BillingAuto accent={accent} />;

    case "doc-ocr":       return <BandejaOCR accent={accent} />;
    case "doc-clasif":    return <ClasifIA accent={accent} />;
    case "doc-evid":      return <Evidencia accent={accent} />;
    case "doc-validar":   return <ValidacionFiscal accent={accent} />;

    default: return <FlujoCaja accent={accent} />;
  }
};

// ─── Reusable primitives ──────────────────────────────────────────
const ExecHeader = ({ eyebrow, headline, sub, accent, stats = [] }) => (
  <div className="anim-in d1" style={{ marginBottom: 32 }}>
    <div className="eyebrow">· {eyebrow}</div>
    <h1 style={{
      fontSize: 40, lineHeight: 1.12, letterSpacing: "-0.025em",
      fontWeight: 600, marginTop: 10, color: "var(--text)"
    }}>
      {headline}
    </h1>
    {sub && <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10, maxWidth: 720, lineHeight: 1.55 }}>{sub}</p>}

    {stats.length > 0 && (
      <div style={{ marginTop: 24, display: "flex", gap: 22, alignItems: "center", color: "var(--text-3)", fontSize: 13 }}>
        {stats.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--text-5)" }} />}
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <span className="num" style={{ color: s.tone || "var(--text)", fontWeight: 600, fontSize: 15 }}>{s.v}</span>
              <span style={{ color: "var(--text-4)" }}>{s.k}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    )}
  </div>
);

const DataTable = ({ cols, rows, onRow }) => (
  <div className="anim-in d2" style={{
    border: "1px solid var(--hairline)", borderRadius: 14, overflow: "hidden",
    background: "var(--surface)"
  }}>
    <table className="tbl">
      <thead><tr>{cols.map(c => <th key={c.k} className={c.r ? "r" : ""} style={{ width: c.w }}>{c.k}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={onRow ? "hoverable" : ""} onClick={onRow ? () => onRow(r) : undefined}>
            {cols.map(c => {
              const v = r[c.f];
              if (c.render) return <td key={c.f} className={c.r ? "r" : ""}>{c.render(v, r)}</td>;
              return <td key={c.f} className={c.r ? "r" : ""}>{v}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AIBanner = ({ accent, t, sub, cta }) => (
  <div className="anim-in d3" style={{
    marginTop: 22, padding: "18px 22px",
    borderRadius: 12, background: "var(--glass-2)",
    backdropFilter: "blur(20px)", border: "1px solid var(--hairline)",
    display: "flex", alignItems: "center", gap: 16
  }}>
    <div className="ai-glow" style={{
      width: 32, height: 32, borderRadius: 9,
      background: "linear-gradient(135deg, #D4A86A, #FF7849)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      <window.Ico name="sparkles" size={13} color="#0A0A0B" />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{t}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
    {cta && <button className="btn s gold">{cta}</button>}
  </div>
);

const MoneyCell = ({ v, sign, tone }) => {
  const c = tone === "in" ? "var(--green)" : tone === "out" ? "var(--text)" : "var(--text-2)";
  return <span className="mono" style={{ fontWeight: 600, color: c }}>{sign}{window.fmt$(Math.abs(v), { decimals: 0 })}</span>;
};

// ─────────────────────────────────────────────────────────────────────
// FINANZAS
// ─────────────────────────────────────────────────────────────────────

const FlujoCaja = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Flujo de caja · Marzo 2026"
      headline={<>Tienes <span style={{ color: accent }}>$42,810</span> en caja y bancos.</>}
      sub="3 cuentas conectadas vía banca abierta. Reconciliado hace 4 minutos."
      stats={[
        { k: "entró este mes", v: "$284k", tone: "var(--green)" },
        { k: "salió este mes", v: "$167k" },
        { k: "neto", v: "+$117k", tone: "var(--gold)" },
      ]}
    />

    <AIBanner
      t="Tu caja libre proyectada para abril es $89k — suficiente para tu planilla y el ITBMS del 15."
      sub="No necesitas mover líneas de crédito este mes. Si quisieras invertir parte, recomiendo dejar $20k de colchón."
      cta="Ver escenarios"
    />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "Cuenta", f: "name" },
          { k: "Banco", f: "bank" },
          { k: "Tipo", f: "type" },
          { k: "Última sync", f: "sync" },
          { k: "Saldo", f: "balance", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { name: "Operativa principal",  bank: "Banco General", type: "Corriente",  sync: "hace 4 min", balance: 32478 },
          { name: "Reserva",              bank: "Banesco",       type: "Ahorros",     sync: "hace 12 min", balance: 8902 },
          { name: "Yappy Empresa",        bank: "Banco General", type: "Wallet",      sync: "hace 2 min", balance: 1430 },
        ]}
      />
    </div>
  </>
);

const Conciliaciones = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Conciliaciones bancarias · marzo"
      headline={<><span style={{ color: "var(--green)" }}>96%</span> auto-conciliado.</>}
      sub="142 movimientos esta semana. Solo 6 esperan tus ojos."
      stats={[
        { k: "conciliados", v: "142", tone: "var(--green)" },
        { k: "pendientes", v: "6", tone: "var(--orange)" },
        { k: "tasa IA", v: "96%", tone: accent },
      ]}
    />

    <AIBanner accent={accent} t="6 movimientos sin documento de respaldo." sub="2 son transferencias internas (clasificadas auto), 4 necesitan tu confirmación." cta="Revisar (4)" />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "Fecha", f: "date", w: 90 },
          { k: "Movimiento", f: "desc" },
          { k: "Cuenta sugerida IA", f: "ai" },
          { k: "Monto", f: "amt", r: true, render: (v, r) => <MoneyCell v={v} sign={r.in ? "+" : "−"} tone={r.in ? "in" : "out"} /> },
          { k: "Estado", f: "status", render: v => <window.Pill tone={v === "Conciliado" ? "green" : "orange"} dot>{v}</window.Pill> },
        ]}
        rows={[
          { date: "Hoy", desc: "Pago de Maersk · FE-2451", ai: "Cobranza ventas", amt: 4800, in: true, status: "Conciliado" },
          { date: "Hoy", desc: "Squarepay POS · ventas", ai: "Ventas mostrador", amt: 1240, in: true, status: "Conciliado" },
          { date: "Ayer", desc: "Cargo desconocido", ai: "Por confirmar", amt: 89, in: false, status: "Revisar" },
          { date: "Ayer", desc: "Planilla 1ra quincena", ai: "Planilla", amt: 2840, in: false, status: "Conciliado" },
          { date: "Ayer", desc: "Transferencia entre cuentas", ai: "Mov. interno", amt: 5000, in: false, status: "Conciliado" },
          { date: "Sáb", desc: "Pago Yappy entrada", ai: "Venta mostrador", amt: 380, in: true, status: "Conciliado" },
        ]}
      />
    </div>
  </>
);

const DiarioGeneral = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Diario general · marzo 2026"
      headline={<>1,247 asientos esta mes.</>}
      sub="Generados automáticamente desde transacciones bancarias, facturas y reglas contables del catálogo."
      stats={[{ k: "asientos", v: "1,247" }, { k: "líneas", v: "3,892" }, { k: "cuadrados", v: "100%", tone: "var(--green)" }]}
    />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "#", f: "id", w: 80 },
          { k: "Fecha", f: "date", w: 100 },
          { k: "Concepto", f: "desc" },
          { k: "Cuenta", f: "account" },
          { k: "Débito", f: "debit", r: true, render: v => v ? <span className="mono">{window.fmt$(v, { decimals: 2 })}</span> : <span style={{ color: "var(--text-5)" }}>—</span> },
          { k: "Crédito", f: "credit", r: true, render: v => v ? <span className="mono">{window.fmt$(v, { decimals: 2 })}</span> : <span style={{ color: "var(--text-5)" }}>—</span> },
        ]}
        rows={[
          { id: "DA-1247", date: "11 mar 26", desc: "Cobro Maersk · FE-2451", account: "1101 Banco General",       debit: 4800, credit: null },
          { id: "DA-1247", date: "11 mar 26", desc: "Cobro Maersk · FE-2451", account: "4101 Ingresos servicios",  debit: null, credit: 4486 },
          { id: "DA-1247", date: "11 mar 26", desc: "Cobro Maersk · FE-2451", account: "2110 ITBMS por pagar",     debit: null, credit: 314 },
          { id: "DA-1246", date: "10 mar 26", desc: "Pago alquiler oficina", account: "5210 Alquileres",          debit: 1800, credit: null },
          { id: "DA-1246", date: "10 mar 26", desc: "Pago alquiler oficina", account: "1101 Banco General",       debit: null, credit: 1800 },
          { id: "DA-1245", date: "10 mar 26", desc: "Compra granos verdes", account: "5110 Compras",             debit: 1620, credit: null },
          { id: "DA-1245", date: "10 mar 26", desc: "Compra granos verdes", account: "1101 Banco General",       debit: null, credit: 1620 },
        ]}
      />
    </div>
  </>
);

const Diario12M = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Diario combinado · últimos 12 meses"
      headline={<>$3.2M de flujo gestionado.</>}
      sub="Comparativo anual por cuenta. Útil para preparar Estado de Resultados y declaración de Renta."
      stats={[{ k: "ingresos", v: "$2.4M", tone: "var(--green)" }, { k: "gastos", v: "$1.4M" }, { k: "utilidad", v: "$1.0M", tone: accent }]}
    />

    <div style={{ marginTop: 22, padding: 24, background: "var(--surface)", borderRadius: 14, border: "1px solid var(--hairline)" }}>
      <table className="tbl" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Cuenta</th>
            {["Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic","Ene","Feb","Mar"].map(m => <th key={m} className="r" style={{ fontSize: 9.5 }}>{m}</th>)}
            <th className="r" style={{ color: accent, fontSize: 10 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["4101 Ingresos servicios",     [42,58,72,88,105,124,142,165,188,210,232,284], 1710],
            ["4102 Ingresos productos",     [18,22,28,32,38,44,50,58,68,78,84,92],         612],
            ["5110 Compras",                [8,11,14,17,20,24,28,33,38,42,46,52],          333],
            ["5210 Alquileres",             [1.8]*12,                                       21.6],
            ["5310 Planilla",               [12,12,14,16,18,20,22,24,26,28,30,34],          256],
          ].map((r, i) => (
            <tr key={i} className="hoverable">
              <td style={{ color: "var(--text)" }}>{r[0]}</td>
              {(Array.isArray(r[1]) ? r[1] : Array(12).fill(r[1])).map((v, j) => (
                <td key={j} className="r mono" style={{ fontSize: 11 }}>{typeof v === "number" ? `${v}k` : v}</td>
              ))}
              <td className="r mono" style={{ color: accent, fontWeight: 600 }}>${r[2]}k</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

const MayorGeneral = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Mayor general · marzo 2026"
      headline={<>Saldos por cuenta del catálogo.</>}
      sub="Drilldown a cada cuenta para ver sus asientos del período."
      stats={[{ k: "cuentas", v: "187" }, { k: "con saldo", v: "94" }, { k: "diferencia", v: "$0.00", tone: "var(--green)" }]}
    />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "Código", f: "code", w: 110, render: v => <span className="mono">{v}</span> },
          { k: "Cuenta", f: "name" },
          { k: "Saldo anterior", f: "prev", r: true, render: v => <span className="mono">${v.toLocaleString()}</span> },
          { k: "Débitos", f: "debit", r: true, render: v => <span className="mono">${v.toLocaleString()}</span> },
          { k: "Créditos", f: "credit", r: true, render: v => <span className="mono">${v.toLocaleString()}</span> },
          { k: "Saldo actual", f: "balance", r: true, render: v => <span className="mono" style={{ color: accent, fontWeight: 600 }}>${v.toLocaleString()}</span> },
        ]}
        rows={[
          { code: "1101", name: "Banco General",        prev: 28210, debit: 24800, credit: 20532, balance: 32478 },
          { code: "1102", name: "Banesco",              prev: 7400,  debit: 6420,  credit: 4918,  balance: 8902 },
          { code: "1201", name: "Cuentas por cobrar",   prev: 6800,  debit: 12400, credit: 10780, balance: 8420 },
          { code: "2101", name: "Cuentas por pagar",    prev: 4200,  debit: 5240,  credit: 4180,  balance: 3140 },
          { code: "2110", name: "ITBMS por pagar",      prev: 0,     debit: 688,   credit: 1720,  balance: 1032 },
          { code: "4101", name: "Ingresos servicios",   prev: 0,     debit: 0,     credit: 24580, balance: 24580 },
          { code: "5210", name: "Alquileres",           prev: 0,     debit: 1800,  credit: 0,     balance: 1800 },
        ]}
      />
    </div>
  </>
);

const CXC = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Cuentas por cobrar"
      headline={<>Te deben <span style={{ color: "var(--orange)" }}>$8,420</span>.</>}
      sub="6 facturas abiertas. 2 vencidas hace más de 5 días."
      stats={[{ k: "facturas", v: "6" }, { k: "vencidas", v: "2", tone: "var(--red)" }, { k: "días promedio", v: "12d" }]}
    />

    <AIBanner accent={accent} t="Constructora Istmo paga típicamente al día 8." sub="Hoy es día 12. Recomiendo recordatorio amable hoy mismo." cta="Redactar correo" />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "FE", f: "fe", w: 90, render: v => <span className="mono">{v}</span> },
          { k: "Cliente", f: "cli" },
          { k: "Emitida", f: "issued" },
          { k: "Vence", f: "due", render: (v, r) => <window.Pill tone={r.tone}>{v}</window.Pill> },
          { k: "Días", f: "days", w: 60, r: true },
          { k: "Saldo", f: "amt", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { fe: "FE-2451", cli: "Constructora Istmo S.A.", issued: "12 mar", due: "Vencida 5d", tone: "red", days: 5, amt: 4200 },
          { fe: "FE-2440", cli: "C. Méndez Palacios",       issued: "05 mar", due: "Vencida 12d", tone: "red", days: 12, amt: 1500 },
          { fe: "FE-2452", cli: "Maersk Panamá",            issued: "10 mar", due: "Vence en 8d", tone: "orange", days: -8, amt: 3200 },
          { fe: "FE-2435", cli: "Distribuidora Sur",        issued: "03 mar", due: "Vence en 15d", tone: "ghost", days: -15, amt: 6800 },
          { fe: "FE-2428", cli: "Café del Centro",          issued: "28 feb", due: "Vence en 3d", tone: "orange", days: -3, amt: 920 },
          { fe: "FE-2422", cli: "Restaurante Mar",          issued: "25 feb", due: "Vence en 5d", tone: "ghost", days: -5, amt: 540 },
        ]}
      />
    </div>
  </>
);

const CXP = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Cuentas por pagar"
      headline={<>Debes <span style={{ color: "var(--red)" }}>$3,140</span>.</>}
      sub="2 cuentas abiertas. 1 vencida."
      stats={[{ k: "cuentas", v: "2" }, { k: "vencidas", v: "1", tone: "var(--red)" }]}
    />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "Doc", f: "doc", w: 110, render: v => <span className="mono">{v}</span> },
          { k: "Proveedor", f: "prov" },
          { k: "Recibida", f: "received" },
          { k: "Vence", f: "due", render: (v, r) => <window.Pill tone={r.tone}>{v}</window.Pill> },
          { k: "Monto", f: "amt", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { doc: "FE-1188", prov: "Office Depot",                   received: "07 mar", due: "Vencida 2d",  tone: "red",   amt: 420.5 },
          { doc: "REF-8821", prov: "Banco General · préstamo",      received: "10 mar", due: "Vence 10 abr", tone: "ghost", amt: 950 },
        ]}
      />
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────────
// VENTAS
// ─────────────────────────────────────────────────────────────────────

const Facturas = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Facturas emitidas · marzo"
      headline={<><span style={{ color: accent }}>24 facturas</span> por $48,720.</>}
      sub="Todas con CUFE DGI. ITBMS recaudado: $1,720.60."
      stats={[{ k: "FE", v: "24" }, { k: "monto", v: "$48,720" }, { k: "ITBMS", v: "$1,720" }]}
    />

    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "FE", f: "fe", w: 100, render: v => <span className="mono">{v}</span> },
          { k: "Cliente", f: "cli" },
          { k: "Emitida", f: "date" },
          { k: "CUFE", f: "cufe", render: () => <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>FE-{Math.floor(Math.random()*9999999)}</span> },
          { k: "ITBMS", f: "itbms", r: true, render: v => <span className="mono">{window.fmt$(v, { decimals: 2 })}</span> },
          { k: "Total", f: "total", r: true, render: v => <MoneyCell v={v} tone="in" sign="+" /> },
          { k: "Estado", f: "status", render: v => <window.Pill tone={v === "Cobrada" ? "green" : "orange"} dot>{v}</window.Pill> },
        ]}
        rows={[
          { fe: "FE-2451", cli: "Constructora Istmo",   date: "12 mar", itbms: 294,    total: 4494,    status: "Pendiente" },
          { fe: "FE-2452", cli: "Maersk Panamá",        date: "10 mar", itbms: 209,    total: 3409,    status: "Pendiente" },
          { fe: "FE-2440", cli: "C. Méndez Palacios",   date: "05 mar", itbms: 105,    total: 1605,    status: "Pendiente" },
          { fe: "FE-2435", cli: "Distribuidora Sur",    date: "03 mar", itbms: 476,    total: 7276,    status: "Pendiente" },
          { fe: "FE-2428", cli: "Café del Centro",      date: "28 feb", itbms: 64.40,  total: 984.40,  status: "Cobrada" },
          { fe: "FE-2422", cli: "Restaurante Mar",      date: "25 feb", itbms: 37.80,  total: 577.80,  status: "Cobrada" },
        ]}
      />
    </div>
  </>
);

const Cotizaciones = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Cotizaciones" headline={<><span style={{ color: accent }}>8 cotizaciones</span> abiertas.</>} sub="$24k en pipeline. 3 esperan respuesta del cliente." stats={[{ k: "abiertas", v: "8" }, { k: "valor", v: "$24k" }, { k: "tasa cierre", v: "62%", tone: "var(--green)" }]} />
    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "#", f: "id", w: 100, render: v => <span className="mono">{v}</span> },
          { k: "Cliente potencial", f: "cli" },
          { k: "Servicio", f: "service" },
          { k: "Emitida", f: "date" },
          { k: "Estado", f: "status", render: v => <window.Pill tone={v === "Aceptada" ? "green" : v === "En revisión" ? "orange" : "ghost"} dot>{v}</window.Pill> },
          { k: "Monto", f: "amt", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { id: "COT-145", cli: "Tech Solutions PA", service: "Contabilidad mensual", date: "10 mar", status: "Aceptada", amt: 2200 },
          { id: "COT-144", cli: "Logística Atlántico", service: "Auditoría Q1", date: "08 mar", status: "En revisión", amt: 4800 },
          { id: "COT-143", cli: "Boutique Centro", service: "Renta + ITBMS", date: "05 mar", status: "Esperando", amt: 1200 },
          { id: "COT-142", cli: "Empresa nueva", service: "Setup inicial", date: "03 mar", status: "Esperando", amt: 3500 },
        ]}
      />
    </div>
  </>
);

const ClientesVentas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Clientes activos" headline={<>47 clientes generan $284k al mes.</>} sub="Top 5 representa el 64% del MRR. Diversificación saludable." stats={[{ k: "activos", v: "47" }, { k: "MRR", v: "$284k", tone: accent }, { k: "LTV promedio", v: "$28k" }]} />
    <AIBanner accent={accent} t="Tech Solutions PA cierra esta semana." sub="Empezó onboarding el lunes. La IA ya redactó su carta de bienvenida." cta="Revisar" />
  </>
);

const POS = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Punto de venta · hoy" headline={<><span style={{ color: accent }}>$1,240</span> en ventas POS.</>} sub="Squarepay conectado. 18 transacciones procesadas. ITBMS auto-aplicado." stats={[{ k: "ventas hoy", v: "$1,240" }, { k: "transacciones", v: "18" }, { k: "ticket promedio", v: "$69" }]} />
    <AIBanner accent={accent} t="El POS se sincronizó con tu Diario General en tiempo real." sub="Cada venta generó FE + asiento contable + ITBMS automáticamente." cta="Ver FEs del día" />
  </>
);

const ReportesVentas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Reportes de ventas" headline={<>Marzo cierra 22% arriba de febrero.</>} sub="$48,720 vs $39,852. La mayor parte por Maersk y Distribuidora Sur." stats={[{ k: "vs feb", v: "+22%", tone: "var(--green)" }, { k: "vs mar 2025", v: "+184%", tone: accent }]} />
  </>
);

const Cobros = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Estados de cobro" headline={<>$8,420 en cobranza activa.</>} sub="Edad promedio: 12 días. Política: recordatorio al día 10, escalamiento al día 30." stats={[{ k: "activos", v: "$8,420" }, { k: "0-30d", v: "$5,260", tone: "var(--green)" }, { k: "30-60d", v: "$3,160", tone: "var(--orange)" }]} />
  </>
);

// ─────────────────────────────────────────────────────────────────────
// COMPRAS
// ─────────────────────────────────────────────────────────────────────

const Proveedores = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Proveedores activos" headline={<>32 proveedores · $9,840 este mes.</>} sub="Office Depot, Banco General y proveedor de granos son tus top 3." stats={[{ k: "activos", v: "32" }, { k: "compras mes", v: "$9,840" }, { k: "top 3 share", v: "58%" }]} />
    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "Proveedor", f: "name" },
          { k: "RUC", f: "ruc", render: v => <span className="mono" style={{ fontSize: 11.5 }}>{v}</span> },
          { k: "Categoría", f: "cat" },
          { k: "Última compra", f: "last" },
          { k: "Total mes", f: "total", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { name: "Café Volcán S.A.",          ruc: "8-NT-1-4521",  cat: "Inventario",   last: "10 mar", total: 1620 },
          { name: "Office Depot Panamá",       ruc: "8-NT-1-1245",  cat: "Suministros",  last: "07 mar", total: 420 },
          { name: "Inmobiliaria Bella Vista",  ruc: "8-NT-1-8821",  cat: "Alquiler",     last: "08 mar", total: 1800 },
          { name: "Banco General · préstamo",  ruc: "—",             cat: "Financieros",  last: "10 mar", total: 950 },
          { name: "Empleados · planilla",      ruc: "varios",        cat: "Personal",     last: "10 mar", total: 2840 },
        ]}
      />
    </div>
  </>
);

const Compras = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Compras del mes" headline={<>$9,840 en compras · 18 facturas recibidas.</>} sub="Todas con factura electrónica del proveedor. ITBMS crédito disponible: $688." stats={[{ k: "facturas", v: "18" }, { k: "ITBMS crédito", v: "$688", tone: accent }]} />
  </>
);

const Gastos = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Gastos operativos" headline={<>$9,840 desglosados en 5 categorías.</>} sub="Compras, planilla, alquiler, servicios y otros. Todos deducibles." stats={[{ k: "deducibles", v: "100%", tone: "var(--green)" }, { k: "categorías", v: "5" }]} />
  </>
);

const ValidacionesIA = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Validaciones IA" headline={<><span style={{ color: accent }}>247 validaciones</span> esta semana.</>} sub="OCR + lógica fiscal. Detecta facturas duplicadas, montos sospechosos y proveedores nuevos." stats={[{ k: "validadas", v: "247" }, { k: "flagged", v: "3", tone: "var(--orange)" }]} />
    <AIBanner accent={accent} t="Detecté 1 factura potencialmente duplicada de Office Depot." sub="Mismo monto ($420.50), mismo día, números FE consecutivos. Pude ser un cobro doble o un descuido del proveedor." cta="Revisar" />
  </>
);

const ReportesCompras = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Reportes de compras" headline={<>Compras crecieron 12% vs febrero.</>} sub="En línea con el crecimiento de ventas. Margen bruto: 79%." stats={[{ k: "compras", v: "$9,840" }, { k: "vs feb", v: "+12%" }, { k: "margen bruto", v: "79%", tone: "var(--green)" }]} />
  </>
);

// ─────────────────────────────────────────────────────────────────────
// ITBMS
// ─────────────────────────────────────────────────────────────────────

const ITBMSVentas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="ITBMS ventas · marzo" headline={<>Recaudaste <span style={{ color: accent }}>$1,720.60</span>.</>} sub="24 ventas afectas. 7% sobre base imponible de $24,580." stats={[{ k: "afectas", v: "24" }, { k: "base", v: "$24,580" }, { k: "ITBMS", v: "$1,720.60", tone: accent }]} />
  </>
);

const ITBMSCompras = ({ accent }) => (
  <>
    <ExecHeader eyebrow="ITBMS compras · marzo" headline={<>Te cobraron <span style={{ color: accent }}>$688.44</span>.</>} sub="18 compras deducibles. Crédito fiscal aprovechable." stats={[{ k: "deducibles", v: "18" }, { k: "base", v: "$9,840" }, { k: "crédito", v: "$688.44", tone: accent }]} />
  </>
);

const F430 = ({ accent }) => (
  <>
    <ExecHeader
      eyebrow="Formulario 430 · marzo 2026"
      headline={<>Neto a pagar: <span style={{ color: accent }}>$1,032.16</span></>}
      sub="Vence sábado 15 de marzo. Ya generado, firmado por IA, listo para enviar a DGI."
      stats={[{ k: "débito", v: "$1,720.60" }, { k: "crédito", v: "$688.44" }, { k: "neto", v: "$1,032.16", tone: accent }]}
    />
    <AIBanner accent={accent} t="F.430 listo. XML + PDF generados." sub="Solo necesita tu aprobación. Tu CPA lo verá automáticamente al firmarlo." cta="Aprobar y enviar" />
  </>
);

const Diferencias = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Diferencias fiscales" headline={<>Sin diferencias detectadas.</>} sub="Comparamos asientos contables vs F.430 cada noche. Marzo cuadra al céntimo." stats={[{ k: "diferencias", v: "$0.00", tone: "var(--green)" }, { k: "última revisión", v: "hace 6h" }]} />
  </>
);

const AlertasFiscales = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Alertas fiscales" headline={<>2 alertas activas.</>} sub="Ambas leves. Sin riesgo de multa este mes." stats={[{ k: "activas", v: "2" }, { k: "críticas", v: "0", tone: "var(--green)" }]} />
    <AIBanner accent={accent} t="Aviso de operación vence en 152 días (agosto)." sub="Te avisaré 60 días antes. No urgente." />
  </>
);

// ─────────────────────────────────────────────────────────────────────
// INVENTARIO
// ─────────────────────────────────────────────────────────────────────

const Stock = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Stock actual" headline={<>247 SKUs · valor en libros <span style={{ color: accent }}>$18,420</span>.</>} sub="Costo promedio actualizado por la IA. 3 SKUs en alerta de stock mínimo." stats={[{ k: "SKUs", v: "247" }, { k: "valor", v: "$18,420" }, { k: "alertas", v: "3", tone: "var(--orange)" }]} />
    <div style={{ marginTop: 22 }}>
      <DataTable
        cols={[
          { k: "SKU", f: "sku", w: 110, render: v => <span className="mono" style={{ fontSize: 11.5 }}>{v}</span> },
          { k: "Producto", f: "name" },
          { k: "Categoría", f: "cat" },
          { k: "Stock", f: "qty", r: true, render: (v, r) => <span style={{ color: r.alert ? "var(--orange)" : "var(--text)" }}>{v} {r.unit}</span> },
          { k: "Costo prom.", f: "cost", r: true, render: v => <span className="mono">${v.toFixed(2)}</span> },
          { k: "Valor", f: "value", r: true, render: v => <MoneyCell v={v} tone="out" /> },
        ]}
        rows={[
          { sku: "GRN-VOL-01", name: "Café verde · Volcán Origen",     cat: "Materias primas", qty: 124, unit: "kg",  cost: 18.40, value: 2281.60 },
          { sku: "GRN-VOL-02", name: "Café verde · Volcán Especial",  cat: "Materias primas", qty: 8,   unit: "kg",  cost: 32.00, value: 256, alert: true },
          { sku: "TOS-CAS-01", name: "Café tostado · Casco Edition",  cat: "Producto final",  qty: 84,  unit: "lb",  cost: 12.80, value: 1075.20 },
          { sku: "EMB-12OZ",   name: "Bolsa 12oz con válvula",         cat: "Empaque",         qty: 320, unit: "und", cost: 0.85,  value: 272 },
          { sku: "ESP-FIL-1",  name: "Filtros V60 #02",                cat: "Insumos",         qty: 12,  unit: "cajas", cost: 8.50, value: 102, alert: true },
        ]}
      />
    </div>
  </>
);

const Entradas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Entradas de inventario · marzo" headline={<>12 entradas · $4,280 en compras.</>} sub="Todas vinculadas a facturas de proveedor con ITBMS deducible." />
  </>
);

const Salidas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Salidas · marzo" headline={<>89 salidas registradas.</>} sub="Por ventas (POS + manuales) y consumo interno. Costo de venta calculado por costo promedio." />
  </>
);

const Kardex = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Kardex" headline={<>Movimientos por SKU.</>} sub="Trazabilidad completa: cada entrada y salida con fecha, cantidad, costo y saldo." />
  </>
);

const CostoPromedio = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Costo promedio · método ponderado" headline={<>Actualizado en tiempo real.</>} sub="Cada compra recalcula el costo promedio. Cada venta usa el costo vigente al momento." />
  </>
);

const AlertasInv = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Alertas de inventario" headline={<><span style={{ color: "var(--orange)" }}>3 SKUs</span> bajo el mínimo.</>} sub="Café verde Volcán Especial, filtros V60, y bolsas 8oz." stats={[{ k: "alertas", v: "3", tone: "var(--orange)" }]} />
    <AIBanner accent={accent} t="Recomiendo orden de compra para 3 SKUs." sub="Basado en consumo promedio, vas a necesitar reorden esta semana. ¿La preparo?" cta="Generar OC" />
  </>
);

// ─────────────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────────────

const Contratos = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Contratos activos" headline={<>47 contratos · $284k MRR.</>} sub="Todos vigentes. 12 renovaciones automáticas en abril." stats={[{ k: "activos", v: "47" }, { k: "auto-renew", v: "42" }, { k: "MRR", v: "$284k", tone: accent }]} />
  </>
);

const Igualas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Igualas mensuales" headline={<>42 igualas · facturación automática.</>} sub="El día 1 de cada mes la IA emite las 42 FE, las envía al cliente, y crea el asiento contable." stats={[{ k: "mensuales", v: "42" }, { k: "monto mensual", v: "$268k" }]} />
    <AIBanner accent={accent} t="Próxima emisión automática: 1 de abril · $268,400." sub="42 facturas, 42 emails, 42 asientos. Tiempo estimado: 4 minutos para la IA." />
  </>
);

const Tareas = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Tareas recurrentes" headline={<>16 tareas programadas esta semana.</>} sub="ITBMS, planillas CSS, revisión de conciliaciones, llamadas a clientes." />
  </>
);

const BillingAuto = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Facturación automática" headline={<>$268k facturados automáticamente este mes.</>} sub="42 clientes · cero intervención manual. Tasa de error: 0%." stats={[{ k: "auto FE", v: "42" }, { k: "monto", v: "$268k" }, { k: "errores", v: "0", tone: "var(--green)" }]} />
  </>
);

// ─────────────────────────────────────────────────────────────────────
// DOCUMENTOS
// ─────────────────────────────────────────────────────────────────────

const BandejaOCR = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Bandeja OCR · IA" headline={<>89 recibos procesados esta semana.</>} sub="OCR + IA contextual. 3 esperan tus ojos. 96% de precisión." stats={[{ k: "procesados", v: "89" }, { k: "pendientes", v: "3", tone: "var(--orange)" }, { k: "precisión IA", v: "96%", tone: accent }]} />
    <AIBanner accent={accent} t="3 recibos necesitan tu aprobación." sub="Office Depot ($420), Estación Texaco ($45), Felipe Motta ($312 — al 50% deducible)." cta="Revisar" />
  </>
);

const ClasifIA = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Clasificación automática IA" headline={<>247 transacciones clasificadas esta semana.</>} sub="Por cliente, cuenta contable y categoría fiscal. Cada clasificación con score de confianza." stats={[{ k: "clasificadas", v: "247" }, { k: "alta confianza", v: "232" }, { k: "media confianza", v: "15", tone: "var(--orange)" }]} />
  </>
);

const Evidencia = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Evidencia tributaria" headline={<>12,400 documentos archivados.</>} sub="Cada peso que entró o salió tiene su respaldo. Auditoría-ready hace 47 días seguidos." stats={[{ k: "documentos", v: "12,400" }, { k: "audit-ready", v: "47d", tone: "var(--green)" }]} />
  </>
);

const ValidacionFiscal = ({ accent }) => (
  <>
    <ExecHeader eyebrow="Validación fiscal" headline={<>100% de tus FE pasan validación DGI.</>} sub="Antes de emitir, la IA valida RUC del cliente, código de cuenta, retenciones y monto contra reglas DGI vigentes." stats={[{ k: "validez", v: "100%", tone: "var(--green)" }, { k: "rechazos DGI", v: "0", tone: "var(--green)" }]} />
  </>
);

// Workspace navigation entry — adds Operations menu items
Object.assign(window, { ScreenOperaciones, WORKSPACES });
