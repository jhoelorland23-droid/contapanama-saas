// Command Palette — ⌘K. Linear / Raycast / Arc style.

const CommandPalette = () => {
  const { palette, setPalette, navigate, showToast } = window.useApp();
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (palette && inputRef.current) {
      inputRef.current.focus();
      setQ("");
    }
  }, [palette]);

  if (!palette) return null;

  const items = [
    { group: "Navegar", items: [
      { id: "go-dashboard", label: "Ir a Dashboard", icon: "home", kbd: "G D", run: () => navigate("dashboard") },
      { id: "go-ai", label: "Abrir ContaPanamá AI", icon: "sparkles", kbd: "G A", run: () => navigate("ai") },
      { id: "go-clientes", label: "Ver clientes", icon: "users", kbd: "G C", run: () => navigate("clientes") },
      { id: "go-itbms", label: "Ver ITBMS", icon: "itbms", kbd: "G I", run: () => navigate("itbms") },
      { id: "go-fiscal", label: "Módulo fiscal", icon: "fiscal", run: () => navigate("fiscal") },
      { id: "go-analytics", label: "Analytics", icon: "analytics", run: () => navigate("analytics") },
    ]},
    { group: "Acciones", items: [
      { id: "new-client", label: "Crear cliente nuevo", icon: "plus", run: () => showToast("Abriendo formulario…", { icon: "plus" }) },
      { id: "gen-itbms", label: "Generar Formulario 430 (ITBMS)", icon: "fiscal", run: () => showToast("Generando F.430 para marzo", { icon: "fiscal" }) },
      { id: "import-tx", label: "Importar transacciones bancarias", icon: "upload", run: () => showToast("Conectando bancos…", { icon: "link" }) },
      { id: "export-report", label: "Exportar reporte mensual", icon: "download", run: () => showToast("Descargando reporte…", { icon: "download" }) },
    ]},
    { group: "Preguntar a la IA", items: [
      { id: "ai-1", label: "¿Cuáles clientes tienen alertas tributarias críticas?", icon: "sparkles", run: () => navigate("ai", { aiQuery: "¿Cuáles clientes tienen alertas tributarias críticas?" }) },
      { id: "ai-2", label: "Resumen ejecutivo de este mes", icon: "sparkles", run: () => navigate("ai", { aiQuery: "Dame un resumen ejecutivo del mes" }) },
      { id: "ai-3", label: "¿Qué ITBMS vence esta semana?", icon: "sparkles", run: () => navigate("ai", { aiQuery: "¿Qué declaraciones ITBMS vencen esta semana?" }) },
    ]},
  ];

  const filtered = q.trim()
    ? items.map(g => ({ ...g, items: g.items.filter(it => it.label.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.items.length)
    : items;

  return (
    <>
      <div className="palette-scrim" onClick={() => setPalette(false)} />
      <div className="anim-in" style={{
        position: "fixed", top: "12vh", left: "50%", transform: "translateX(-50%)",
        width: 640, maxHeight: "70vh", zIndex: 201,
        background: "rgba(20,20,24,0.85)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: "1px solid var(--hairline-strong)",
        borderRadius: 14, overflow: "hidden",
        boxShadow: "var(--shadow-lg)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--hairline)" }}>
          <window.Ico name="search" size={16} color="var(--text-4)" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Escribe un comando, busca, o pregúntale a la IA…"
            style={{
              flex: 1, background: "transparent", border: 0, outline: 0,
              padding: 0, fontSize: 15, color: "var(--text)"
            }}
          />
          <window.KBD>esc</window.KBD>
        </div>

        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: "8px 0" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
              No hay resultados para "<span style={{ color: "var(--text-2)" }}>{q}</span>"
            </div>
          )}
          {filtered.map(g => (
            <div key={g.group} style={{ padding: "4px 0" }}>
              <div style={{ padding: "6px 20px", fontSize: 10, color: "var(--text-5)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{g.group}</div>
              {g.items.map(it => (
                <div key={it.id} onClick={it.run} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 20px", cursor: "pointer", color: "var(--text-2)",
                  fontSize: 13, transition: "all .12s"
                }} onMouseEnter={e => { e.currentTarget.style.background = "var(--glass-strong)"; e.currentTarget.style.color = "var(--text)"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}>
                  <window.Ico name={it.icon} size={14} color="var(--text-3)" />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.kbd && <window.KBD>{it.kbd}</window.KBD>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 20px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-4)" }}>
          <span><window.KBD>↑↓</window.KBD> navegar · <window.KBD>↵</window.KBD> ejecutar</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <window.Ico name="sparkles" size={11} color="var(--gold)" />
            <span>Powered by ContaPanamá AI</span>
          </span>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { CommandPalette });
