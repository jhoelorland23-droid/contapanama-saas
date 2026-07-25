// Shell — premium dark sidebar (Linear/Notion/Arc) + topbar.

const Shell = ({ active, topbar, children }) => {
  const { navigate, navItems, setPalette } = window.useApp();

  // Group items by section
  const sections = [];
  const seen = {};
  navItems.forEach(it => {
    if (!seen[it.section]) { seen[it.section] = []; sections.push([it.section, seen[it.section]]); }
    seen[it.section].push(it);
  });

  // Determine "active" id — for ops:* routes, match by workspace prefix
  const matchActive = (itId) => {
    if (active === itId) return true;
    if (itId.startsWith("ops:") && active && active.startsWith("ops:")) {
      return itId.split(":")[1] === active.split(":")[1];
    }
    return false;
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden", position: "relative" }}>

      {/* Ambient cinematic orbs */}
      <div className="ambient-orbs">
        <div className="orb gold"   style={{ width: 600, height: 600, top: -200, left: 200, opacity: 0.18 }} />
        <div className="orb orange" style={{ width: 500, height: 500, bottom: -150, right: -100, opacity: 0.15 }} />
        <div className="orb violet" style={{ width: 400, height: 400, top: "40%", right: "30%", opacity: 0.08 }} />
      </div>

      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0,
        background: "var(--bg-elev)",
        borderRight: "1px solid var(--hairline)",
        display: "flex", flexDirection: "column",
        position: "relative", zIndex: 2
      }}>
        {/* Logo + firm */}
        <div style={{ padding: "16px 14px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <window.Logo size={30} glow />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>ContaPanamá OS</div>
            <div style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>Méndez & Asociados</div>
          </div>
        </div>

        {/* Firm switcher */}
        <div style={{ padding: "0 10px 12px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", background: "var(--glass-2)",
            borderRadius: 8, fontSize: 12, cursor: "pointer",
            border: "1px solid var(--hairline)"
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: "linear-gradient(135deg, #FF7849 0%, #E25C2D 100%)", color: "#0A0A0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>M</div>
            <span style={{ flex: 1, color: "var(--text-2)" }}>Méndez & Asociados</span>
            <window.Ico name="chevronDown" size={12} color="var(--text-4)" />
          </div>
        </div>

        {/* Search trigger */}
        <div style={{ padding: "0 10px 10px" }}>
          <div onClick={() => setPalette(true)} style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "8px 12px", borderRadius: 8,
            background: "var(--glass)", color: "var(--text-3)",
            fontSize: 12.5, cursor: "pointer",
            border: "1px solid var(--hairline)",
            transition: "all .15s"
          }}>
            <window.Ico name="search" size={13} color="var(--text-4)" />
            <span style={{ flex: 1 }}>Buscar o ejecutar…</span>
            <window.KBD>⌘K</window.KBD>
          </div>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 10px 16px" }}>
          {sections.map(([sectionName, items], si) => (
            <div key={sectionName} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 600, color: "var(--text-5)",
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "8px 12px 6px"
              }}>{sectionName}</div>
              {items.map(it => {
                const on = matchActive(it.id);
                return (
                  <div key={it.id} onClick={() => navigate(it.id)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 12px", borderRadius: 7, marginBottom: 1,
                    background: on ? "var(--glass-strong)" : "transparent",
                    color: on ? "var(--text)" : "var(--text-3)",
                    fontSize: 12.8, fontWeight: on ? 500 : 400,
                    cursor: "pointer", transition: "all .12s",
                    position: "relative",
                  }} onMouseEnter={e => { if(!on) e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.color = "var(--text-2)"; }}
                     onMouseLeave={e => { if(!on) e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}>
                    <window.Ico name={it.icon} size={14} color={on ? "var(--gold)" : "currentColor"} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.new && <window.Pill tone="gold">NEW</window.Pill>}
                    {it.count != null && (
                      <span style={{ fontSize: 10, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>{it.count}</span>
                    )}
                    {it.alert && (
                      <span style={{
                        minWidth: 16, height: 16, padding: "0 5px", borderRadius: 8,
                        background: "var(--red-soft)", color: "var(--red)",
                        fontSize: 9.5, fontWeight: 600,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>{it.alert}</span>
                    )}
                    {on && (
                      <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: "var(--gold)", borderRadius: 2 }} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--hairline)",
          display: "flex", alignItems: "center", gap: 10
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "linear-gradient(135deg, #D4A86A, #B98C4D)",
            color: "#1a1306", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11.5, fontWeight: 700
          }}>CM</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Carlos Méndez</div>
            <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>CPA Senior · Plan Firm</div>
          </div>
          <window.Ico name="more" size={14} color="var(--text-4)" style={{ cursor: "pointer" }} />
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 2 }}>
        {topbar}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
};

const Topbar = ({ crumbs, action, hint }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 28px",
    borderBottom: "1px solid var(--hairline)",
    background: "rgba(10,10,11,0.6)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    position: "relative", zIndex: 1
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {crumbs && crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <window.Ico name="chevronRight" size={11} color="var(--text-5)" />}
          <span style={{ fontSize: 13, color: i === crumbs.length - 1 ? "var(--text)" : "var(--text-3)", fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>{c}</span>
        </React.Fragment>
      ))}
      {hint && <span style={{ marginLeft: 12, fontSize: 11.5, color: "var(--text-4)" }}>{hint}</span>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {action}
    </div>
  </div>
);

Object.assign(window, { Shell, Topbar });
