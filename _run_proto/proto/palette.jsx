// Command Palette — ⌘K. Navigate, run actions, search clients.

const COMMANDS = [
  { id: "go-dashboard", section: "Ir a", label: "Dashboard", icon: "dash", action: "nav:dashboard", keys: "G D" },
  { id: "go-diario", section: "Ir a", label: "Diario contable", icon: "book", action: "nav:diario", keys: "G J" },
  { id: "go-ocr", section: "Ir a", label: "Bandeja OCR", icon: "inbox", action: "nav:ocr", keys: "G O" },
  { id: "go-fiscal", section: "Ir a", label: "Módulo fiscal · DGI", icon: "tax", action: "nav:fiscal", keys: "G F" },
  { id: "go-fe", section: "Ir a", label: "Factura electrónica", icon: "send", action: "nav:fe" },
  { id: "go-clientes", section: "Ir a", label: "Clientes", icon: "users", action: "nav:clientes", keys: "G C" },
  { id: "go-ai", section: "Ir a", label: "Asistente IA", icon: "sparkle", action: "nav:ai" },
  { id: "go-reportes", section: "Ir a", label: "Reportes PDF", icon: "pdf", action: "nav:reportes" },

  { id: "new-fe", section: "Crear", label: "Nueva factura electrónica", icon: "send", action: "new:fe", keys: "N F" },
  { id: "new-txn", section: "Crear", label: "Nueva transacción", icon: "plus", action: "new:txn", keys: "N T" },
  { id: "new-client", section: "Crear", label: "Nuevo cliente", icon: "users", action: "new:client" },
  { id: "upload-receipt", section: "Crear", label: "Subir recibo / captura OCR", icon: "camera", action: "new:ocr" },

  { id: "gen-itbms", section: "Acciones", label: "Generar Formulario 430 ITBMS marzo", icon: "tax", action: "act:itbms" },
  { id: "gen-er", section: "Acciones", label: "Generar Estado de Resultados marzo", icon: "pdf", action: "act:er" },
  { id: "classify-all", section: "Acciones", label: "Auto-clasificar transacciones pendientes", icon: "sparkle", action: "act:classify" },
  { id: "close-period", section: "Acciones", label: "Cerrar período marzo 2025", icon: "lock", action: "act:close" },

  { id: "ask-ai", section: "Asistente", label: "Preguntar a la IA: ¿Cuánto debo declarar de ITBMS?", icon: "sparkle", action: "ai:itbms" },
  { id: "ask-ai-2", section: "Asistente", label: "Detectar gastos inusuales este mes", icon: "sparkle", action: "ai:anom" },
];

const CommandPalette = () => {
  const { palette, setPalette, navigate, showToast } = window.useApp();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef();

  React.useEffect(() => {
    if (palette) {
      setQ(""); setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [palette]);

  if (!palette) return null;

  const filtered = q
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))
    : COMMANDS;

  const grouped = {};
  filtered.forEach(c => { (grouped[c.section] = grouped[c.section] || []).push(c); });

  const run = (cmd) => {
    setPalette(false);
    const [kind, val] = cmd.action.split(":");
    if (kind === "nav") navigate(val);
    else if (kind === "new") {
      if (val === "fe") navigate("fe");
      else if (val === "ocr") navigate("ocr");
      else showToast(`Crear ${val} (demo)`, { icon: "plus" });
    } else if (kind === "act") {
      showToast(`Ejecutando: ${cmd.label}`, { icon: "zap" });
    } else if (kind === "ai") {
      navigate("ai");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Escape") { setPalette(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[idx]) run(filtered[idx]); }
  };

  let runningIdx = -1;

  return (
    <div className="cmd-bg" onClick={() => setPalette(false)}>
      <div className="cmd" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <window.Ico name="search" size={15} color="var(--muted)" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={handleKey}
            placeholder="Escribe un comando, busca cliente o pregunta a la IA…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14.5, background: "transparent", color: "var(--ink)", fontFamily: "inherit" }} />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", padding: "2px 6px", border: "1px solid var(--line)", borderRadius: 4 }}>ESC</span>
        </div>

        <div style={{ maxHeight: 460, overflowY: "auto", padding: "8px 0" }}>
          {Object.keys(grouped).length === 0 && (
            <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Sin resultados. ¿Quieres preguntárselo a la IA?
            </div>
          )}
          {Object.entries(grouped).map(([section, cmds]) => (
            <div key={section}>
              <div style={{ padding: "8px 18px 4px", fontSize: 10.5, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>{section}</div>
              {cmds.map(c => {
                runningIdx++;
                const active = runningIdx === idx;
                return (
                  <div key={c.id} onClick={() => run(c)} onMouseEnter={() => setIdx(runningIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 18px", cursor: "pointer",
                      background: active ? "var(--teal-50)" : "transparent",
                      borderLeft: active ? "2px solid var(--teal)" : "2px solid transparent"
                    }}>
                    <window.Ico name={c.icon} size={14} color={active ? "var(--teal)" : "var(--muted)"} />
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{c.label}</span>
                    {c.keys && <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)", padding: "1px 5px", border: "1px solid var(--line)", borderRadius: 4 }}>{c.keys}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--line)", display: "flex", gap: 14, alignItems: "center", fontSize: 11, color: "var(--muted)" }}>
          <span>↑↓ navegar</span>
          <span>↵ ejecutar</span>
          <span style={{ marginLeft: "auto" }}>{filtered.length} comandos</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CommandPalette });
