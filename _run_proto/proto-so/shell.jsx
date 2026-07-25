// Shell — the sidebar + topbar wrapper used by every screen.

const Shell = ({ active, children, topbar }) => {
  const { navigate, sound, setSound } = window.useApp();
  const items = [
    { id: "hoy",         label: "Hoy",        icon: "sparkle", badge: 1 },
    { id: "plata",       label: "Plata",      icon: "wallet" },
    { id: "impuestos",   label: "Impuestos",  icon: "tax",     pill: "$1,032" },
    { id: "documentos",  label: "Documentos", icon: "folder",  badge: 3 },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>

      {/* Sidebar */}
      <div style={{
        width: 224, background: "var(--ink)", color: "var(--bg)",
        display: "flex", flexDirection: "column", flexShrink: 0
      }}>
        <div style={{ padding: "20px 18px 16px", display: "flex", alignItems: "center", gap: 11 }}>
          <window.Logo size={30} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>ContaPanamá</div>
            <div style={{ color: "#7A8285", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 1 }}>Tu negocio</div>
          </div>
        </div>

        {/* Negocio switcher */}
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", background: "rgba(255,255,255,.06)",
            borderRadius: 9, fontSize: 12.5, cursor: "pointer"
          }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--gold)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif, serif", fontSize: 12 }}>R</div>
            <span style={{ flex: 1 }}>Roastería del Casco</span>
            <span style={{ color: "var(--muted-2)", fontSize: 10 }}>▾</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "0 10px" }}>
          {items.map(it => {
            const on = active === it.id;
            return (
              <div key={it.id} onClick={() => navigate(it.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 7, marginBottom: 2,
                background: on ? "rgba(201,165,90,.12)" : "transparent",
                color: on ? "var(--bg)" : "#A8B0B3",
                fontSize: 13.5, fontWeight: on ? 600 : 500,
                cursor: "pointer", transition: "background .15s"
              }}>
                <window.Ico name={it.icon} size={15} color={on ? "var(--gold)" : "#7A8285"} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badge && (
                  <span style={{
                    minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
                    background: on ? "var(--gold)" : "rgba(255,255,255,.1)",
                    color: on ? "var(--ink)" : "#A8B0B3",
                    fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>{it.badge}</span>
                )}
                {it.pill && (
                  <span className="mono" style={{ fontSize: 10, color: on ? "var(--gold)" : "#7A8285", fontWeight: 700 }}>{it.pill}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* CPA */}
        <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "16px 14px" }} />
        <div style={{ padding: "0 10px" }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6A7174", padding: "0 12px 8px" }}>Tu equipo</div>
          <div onClick={() => navigate("cpa")} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 7,
            background: active === "cpa" ? "rgba(201,165,90,.12)" : "transparent",
            color: active === "cpa" ? "var(--bg)" : "#A8B0B3",
            fontSize: 13, cursor: "pointer"
          }}>
            <window.Ico name="users" size={15} color={active === "cpa" ? "var(--gold)" : "#7A8285"} />
            <span style={{ flex: 1 }}>Mi CPA</span>
            <window.BreathDot size={6} color="var(--gold)" />
          </div>
        </div>

        {/* User card */}
        <div style={{ marginTop: "auto", padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--gold)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>RV</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--bg)", fontWeight: 600 }}>Roberto Vargas</div>
            <div style={{ fontSize: 10, color: "#7A8285" }}>Plan Pro</div>
          </div>
          <window.Ico
            name={sound ? "bell" : "bell"}
            size={13}
            color={sound ? "var(--gold)" : "#7A8285"}
            style={{ cursor: "pointer", opacity: sound ? 1 : 0.5 }}
            onClick={() => setSound(!sound)} />
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {topbar}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
};

const Topbar = ({ left, right }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 32px", borderBottom: "1px solid var(--line)",
    background: "var(--bg)", flexShrink: 0
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: "var(--muted)" }}>
      {left}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {right}
    </div>
  </div>
);

Object.assign(window, { Shell, Topbar });
