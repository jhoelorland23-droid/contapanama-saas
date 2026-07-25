// Clientes — CRM pipeline view.

const CLIENTS = [
  { id: 1, name: "Maersk Panamá",           abbr: "M",  industry: "Naviera",       mrr: 4800, status: "active",   risk: "low",    lastSync: "hace 4 min",    color: "#60A5FA", contact: "Diego Cárdenas" },
  { id: 2, name: "Constructora Istmo",      abbr: "CI", industry: "Construcción",  mrr: 3200, status: "at-risk",  risk: "high",   lastSync: "hace 2 días",   color: "#D4A86A", contact: "Marcela Fonseca" },
  { id: 3, name: "Distribuidora Sur",       abbr: "DS", industry: "Comercio",      mrr: 2400, status: "active",   risk: "low",    lastSync: "hace 12 min",   color: "#A78BFA", contact: "Roberto Vega" },
  { id: 4, name: "Café del Casco",          abbr: "CC", industry: "Restaurante",   mrr: 1800, status: "active",   risk: "medium", lastSync: "hace 1h",       color: "#FF7849", contact: "Sandra Lobo" },
  { id: 5, name: "Marina del Pacífico",     abbr: "MP", industry: "Turismo",       mrr: 1500, status: "active",   risk: "medium", lastSync: "hace 27 min",   color: "#4ADE80", contact: "Pablo Esquivel" },
  { id: 6, name: "Bufete Jiménez & Cía",    abbr: "BJ", industry: "Legal",         mrr: 1400, status: "active",   risk: "low",    lastSync: "hace 5 min",    color: "#F87171", contact: "Andrés Jiménez" },
  { id: 7, name: "Boutique Centro",         abbr: "BC", industry: "Retail",        mrr: 980,  status: "active",   risk: "low",    lastSync: "hace 18 min",   color: "#D4A86A", contact: "María Lucía Bonet" },
  { id: 8, name: "Tech Solutions PA",       abbr: "TS", industry: "Tecnología",    mrr: 2200, status: "onboarding", risk: "low",  lastSync: "—",             color: "#60A5FA", contact: "Joaquín Saldívar" },
  { id: 9, name: "Restaurante Mar",          abbr: "RM", industry: "Restaurante",   mrr: 870,  status: "active",   risk: "low",    lastSync: "hace 1h",       color: "#FF7849", contact: "Cecilia Mar" },
  { id: 10, name: "Logística Atlántico",    abbr: "LA", industry: "Logística",     mrr: 2800, status: "active",   risk: "low",    lastSync: "hace 8 min",    color: "#A78BFA", contact: "Mauricio Trejos" },
];

const ScreenClientes = () => {
  const { showToast } = window.useApp();
  const [view, setView] = React.useState("table");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");

  const filtered = CLIENTS.filter(c => {
    if (filter === "active" && c.status !== "active") return false;
    if (filter === "at-risk" && c.risk === "low") return false;
    if (filter === "onboarding" && c.status !== "onboarding") return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalMrr = CLIENTS.reduce((a, c) => a + c.mrr, 0);
  const atRisk = CLIENTS.filter(c => c.risk === "high" || c.risk === "medium").length;

  return (
    <window.Shell active="clientes" topbar={
      <window.Topbar
        crumbs={["Gestión", "Clientes"]}
        hint={<>{CLIENTS.length} cuentas · {window.fmt$(totalMrr, { decimals: 0 })} MRR · {atRisk} en riesgo</>}
        action={<>
          <button className="btn ghost"><window.Ico name="download" size={13} />Exportar</button>
          <button className="btn ghost"><window.Ico name="filter" size={13} />Filtros</button>
          <button className="btn gold"><window.Ico name="plus" size={13} />Cliente nuevo</button>
        </>}
      />
    }>

      <div style={{ padding: "28px 32px 48px", maxWidth: 1600, margin: "0 auto" }}>

        {/* KPI bar */}
        <div className="anim-in d1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
          <KStat label="Activos"        value={CLIENTS.filter(c=>c.status==="active").length} sub={`+3 este mes`} tone="green" />
          <KStat label="MRR total"      value={window.fmt$(totalMrr, { decimals: 0 })} sub="+22% vs feb" tone="gold" />
          <KStat label="En riesgo"      value={atRisk} sub="atención de la IA" tone="red" />
          <KStat label="Onboarding"     value={CLIENTS.filter(c=>c.status==="onboarding").length} sub="cierran esta semana" tone="violet" />
        </div>

        {/* Toolbar */}
        <div className="anim-in d2" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 420 }}>
            <window.Ico name="search" size={13} color="var(--text-4)" style={{ position: "absolute", left: 12, top: 11 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, RUC, contacto…" style={{ width: "100%", paddingLeft: 34 }} />
          </div>
          <div style={{ display: "flex", gap: 2, background: "var(--glass-2)", padding: 3, borderRadius: 7, border: "1px solid var(--hairline)" }}>
            {[
              ["all", "Todos", CLIENTS.length],
              ["active", "Activos", CLIENTS.filter(c=>c.status==="active").length],
              ["at-risk", "En riesgo", atRisk],
              ["onboarding", "Onboarding", CLIENTS.filter(c=>c.status==="onboarding").length],
            ].map(([id, label, count]) => (
              <div key={id} onClick={() => setFilter(id)} style={{
                padding: "5px 12px", borderRadius: 5, cursor: "pointer",
                background: filter === id ? "var(--surface-3)" : "transparent",
                color: filter === id ? "var(--text)" : "var(--text-3)",
                fontSize: 11.5, fontWeight: filter === id ? 500 : 400,
                display: "flex", alignItems: "center", gap: 6
              }}>
                {label} <span style={{ fontSize: 10, color: "var(--text-5)" }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2, background: "var(--glass-2)", padding: 3, borderRadius: 7, border: "1px solid var(--hairline)" }}>
            {[["table","layers"], ["board","workflow"]].map(([id, icon]) => (
              <div key={id} onClick={() => setView(id)} style={{
                padding: "5px 9px", borderRadius: 5, cursor: "pointer",
                background: view === id ? "var(--surface-3)" : "transparent",
              }}>
                <window.Ico name={icon} size={12} color={view === id ? "var(--text)" : "var(--text-4)"} />
              </div>
            ))}
          </div>
        </div>

        {/* Table view */}
        {view === "table" && (
          <div className="card anim-in d3" style={{ overflow: "hidden", padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" style={{ accentColor: "var(--gold)" }} /></th>
                  <th>Cliente</th>
                  <th>Industria</th>
                  <th>Contacto</th>
                  <th className="r">MRR</th>
                  <th>Estado</th>
                  <th>IA dice</th>
                  <th>Última sync</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="hoverable">
                    <td><input type="checkbox" style={{ accentColor: "var(--gold)" }} /></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: c.color, color: "#0A0A0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700 }}>{c.abbr}</div>
                        <div>
                          <div style={{ color: "var(--text)", fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{c.status === "onboarding" ? "En onboarding" : "Cliente activo"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{c.industry}</td>
                    <td>{c.contact}</td>
                    <td className="r mono" style={{ fontWeight: 600, color: "var(--text)" }}>{window.fmt$(c.mrr, { decimals: 0 })}</td>
                    <td>
                      <window.Pill tone={c.status === "active" ? "green" : c.status === "at-risk" ? "red" : "violet"} dot>
                        {c.status === "active" ? "Activo" : c.status === "at-risk" ? "En riesgo" : "Onboarding"}
                      </window.Pill>
                    </td>
                    <td>
                      <window.Pill tone={c.risk === "high" ? "red" : c.risk === "medium" ? "orange" : "ghost"}>
                        {c.risk === "high" ? "Atención" : c.risk === "medium" ? "Revisar" : "OK"}
                      </window.Pill>
                    </td>
                    <td className="muted">{c.lastSync}</td>
                    <td><window.Ico name="more" size={13} color="var(--text-4)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Board view */}
        {view === "board" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {["Activos", "En riesgo", "Onboarding", "Lead"].map((col, i) => (
              <BoardColumn key={col} title={col} clients={CLIENTS.filter(c => {
                if (i === 0) return c.status === "active" && c.risk === "low";
                if (i === 1) return c.risk !== "low";
                if (i === 2) return c.status === "onboarding";
                return false;
              })} placeholder={i === 3 ? "Arrastrá un lead aquí" : null} />
            ))}
          </div>
        )}
      </div>
    </window.Shell>
  );
};

const KStat = ({ label, value, sub, tone }) => {
  const c = { gold: "var(--gold)", green: "var(--green)", red: "var(--red)", violet: "var(--violet)", orange: "var(--orange)" }[tone] || "var(--text)";
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div className="eyebrow">· {label}</div>
      <div className="h1 num" style={{ marginTop: 6, color: c }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 3 }}>{sub}</div>
    </div>
  );
};

const BoardColumn = ({ title, clients, placeholder }) => (
  <div style={{ background: "var(--glass)", border: "1px solid var(--hairline)", borderRadius: 12, padding: 12 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 12px" }}>
      <div className="h3">{title}</div>
      <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{clients.length}</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 240 }}>
      {clients.map(c => (
        <div key={c.id} className="card" style={{ padding: "12px 14px", cursor: "grab" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: c.color, color: "#0A0A0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{c.abbr}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{c.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{c.industry}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--hairline)" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{window.fmt$(c.mrr, { decimals: 0 })}</span>
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>{c.lastSync}</span>
          </div>
        </div>
      ))}
      {placeholder && clients.length === 0 && (
        <div style={{ padding: "40px 12px", textAlign: "center", color: "var(--text-5)", fontSize: 11.5, borderRadius: 8, border: "1px dashed var(--hairline-strong)" }}>
          {placeholder}
        </div>
      )}
    </div>
  </div>
);

Object.assign(window, { ScreenClientes });
