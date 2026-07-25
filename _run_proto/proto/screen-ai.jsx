// Screen: Asistente IA. Real LLM via window.claude.complete with accounting context.

const SYSTEM_CONTEXT = `Eres el asistente contable de ContaPanamá, una app SaaS para CPAs en Panamá.
Tienes acceso a los datos del despacho "Méndez & Asociados" (mock para demo).

DATOS DEL MES (Marzo 2025):
- Ingresos del mes: $24,580.00 (+12.4% vs feb)
- Gastos del mes: $9,840.50 (−3.2% vs feb)
- Utilidad antes impuestos: $14,739.50
- ITBMS débito fiscal: $1,720.60
- ITBMS crédito fiscal: $688.44
- ITBMS neto a pagar a DGI: $1,032.16 (vence 15 marzo)
- 47 clientes activos · 2 omisos
- 142 asientos procesados, 3 sin clasificar

TOP CLIENTES POR INGRESOS (marzo):
1. Distribuidora Sur S.A. — $6,800.00 (+24% vs feb)
2. Constructora Istmo S.A. — $4,200.00 (+12% vs feb)
3. Maersk Panamá — $3,800.00 (−8% vs feb)
4. Carlos Méndez Palacios — $1,500.00

REGLAS DE NEGOCIO PANAMÁ:
- ITBMS estándar 7%
- ISR persona jurídica: 25%
- ISR persona natural: progresivo
- F.430 ITBMS se presenta los 15 de cada mes
- DGI exige factura electrónica desde 2024

Responde en español panameño profesional, conciso (3-5 oraciones máximo).
Cuando muestres cifras, usa formato $X,XXX.XX.
Si te piden una acción, sugiere el módulo de la app (Diario, Fiscal, Bandeja OCR, FE, etc).`;

const SUGGESTIONS = [
  "¿Cuánto debo declarar de ITBMS este mes?",
  "Compara mi P&L marzo vs. febrero",
  "¿Qué clientes no han pagado facturas vencidas?",
  "¿Cuál es mi margen bruto por línea?",
  "Detecta transacciones duplicadas posibles",
  "Resúmeme las obligaciones próximas",
];

const MESES_ABR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const fmtPeriodo = (p) => {
  if (!p || p.length < 7) return "—";
  const m = parseInt(p.slice(5, 7), 10) - 1;
  return `${MESES_ABR[m] || "—"} ${p.slice(0, 4)}`;
};

const ScreenAI = () => {
  const { user, api, isLive, tweaks, periodo } = window.useApp();
  const [convId, setConvId] = React.useState(null);
  const ctxQ = window.useApiQuery(() => api.get(`/dashboard?periodo=${periodo}`), [periodo, isLive], { enabled: isLive, fallback: null });
  const ctx = (ctxQ.data && ctxQ.data.financiero) ? ctxQ.data : null;
  const [messages, setMessages] = React.useState([
    {
      role: "ai",
      content: `Hola ${user?.nombre?.split(" ")[0] || "Carlos"}. Soy tu copiloto contable. Tengo acceso a tus libros de marzo. ¿Qué te ayudo a entender hoy?`,
    },
  ]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }]);
    setBusy(true);

    try {
      if (isLive) {
        // Backend real: usa los datos del despacho como contexto.
        const r = await api.post("/ai/chat", { mensaje: q, conversacion_id: convId || undefined });
        if (r.conversacion_id) setConvId(r.conversacion_id);
        setMessages(m => [...m, { role: "ai", content: r.respuesta }]);
      } else if (window.claude && window.claude.complete) {
        // Entorno con LLM integrado (canvas)
        const transcript = [
          SYSTEM_CONTEXT,
          ...messages.map(m => `${m.role === "user" ? "Usuario" : "Asistente"}: ${typeof m.content === "string" ? m.content : ""}`),
          `Usuario: ${q}`,
          "Asistente:",
        ].join("\n\n");
        const reply = await window.claude.complete(transcript);
        setMessages(m => [...m, { role: "ai", content: reply.trim() }]);
      } else {
        // Demo sin backend
        await new Promise(res => setTimeout(res, 600));
        setMessages(m => [...m, { role: "ai", content: "Respuesta de demostración. Conéctate al backend (modo live) para respuestas con tus datos reales." }]);
      }
    } catch (e) {
      setMessages(m => [...m, { role: "ai", content: e.message || "No pude conectarme al asistente. Reintenta en un momento.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Asistente IA"]}
        actions={
          <button className="btn ghost" onClick={() => { setMessages(messages.slice(0, 1)); setConvId(null); }}>
            <window.Ico name="x" size={13} />Nueva conversación
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "calc(100vh - 60px)", overflow: "hidden" }}>
        {/* Chat panel */}
        <div style={{ display: "flex", flexDirection: "column", padding: "20px 32px", overflow: "hidden", background: "var(--bg)" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 0", display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.map((m, i) => (
              <Bubble key={i} who={m.role} content={m.content} error={m.error} />
            ))}
            {busy && (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <AIDot />
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", padding: "12px 16px", borderRadius: "12px 12px 12px 4px" }}>
                  <Typing />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{
            marginTop: 14, padding: "12px 16px",
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 12, display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 4px 14px rgba(0,0,0,.04)"
          }}>
            <window.Ico name="sparkle" size={16} color="var(--teal)" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Pregunta algo sobre tu mes…"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent", color: "var(--ink)", fontFamily: "inherit" }}
              disabled={busy}
            />
            <span className="mono" style={{ padding: "3px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 10.5, color: "var(--muted)" }}>↵</span>
            <button onClick={() => send()} disabled={busy || !input.trim()} className="btn teal" style={{
              padding: "7px 12px",
              opacity: !input.trim() ? .45 : 1
            }}>
              <window.Ico name="send" size={13} />
            </button>
          </div>
        </div>

        {/* Suggestions side */}
        <div style={{ background: "var(--surface)", borderLeft: "1px solid var(--line)", padding: "22px 22px", overflowY: "auto" }}>
          <div className="xs" style={{ color: "var(--teal)" }}>· Sugerencias rápidas</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {SUGGESTIONS.map((s, i) => (
              <div key={i} onClick={() => send(s)} style={{
                padding: "10px 12px", background: "var(--paper)",
                border: "1px solid var(--line)", borderRadius: 7,
                fontSize: 12.5, color: "var(--ink)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                transition: "border-color 120ms"
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
                <window.Ico name="zap" size={12} color="var(--gold)" />
                <span>{s}</span>
              </div>
            ))}
          </div>

          <div className="xs" style={{ color: "var(--teal)", marginTop: 22 }}>· Contexto que estoy leyendo</div>
          <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--paper)", borderRadius: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            <b style={{ color: "var(--ink)" }}>Despacho:</b> {tweaks.firmName}<br/>
            <b style={{ color: "var(--ink)" }}>Período:</b> {fmtPeriodo(periodo)}<br/>
            {ctx ? (
              <>
                <b style={{ color: "var(--ink)" }}>Ingresos:</b> {window.fmt$(+ctx.financiero.ingresos || 0)}<br/>
                <b style={{ color: "var(--ink)" }}>Gastos:</b> {window.fmt$(+ctx.financiero.gastos || 0)}<br/>
                <b style={{ color: "var(--ink)" }}>Clientes activos:</b> {ctx.clientes.activos || 0}<br/>
              </>
            ) : (
              <span style={{ color: "var(--muted-2)" }}>Cargando datos…</span>
            )}
            <b style={{ color: "var(--ink)" }}>Reglas:</b> ITBMS 7%, ISR Panamá
          </div>
        </div>
      </div>
    </>
  );
};

const AIDot = () => (
  <div style={{
    width: 28, height: 28, borderRadius: 7, background: "var(--gold)",
    color: "#0B1318", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, fontFamily: "Instrument Serif, serif", fontSize: 16
  }}>₵</div>
);

const Bubble = ({ who, content, error }) => {
  if (who === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          maxWidth: "75%", background: "var(--ink)", color: "var(--bg)",
          padding: "10px 14px", borderRadius: "12px 12px 4px 12px",
          fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap"
        }}>
          {content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <AIDot />
      <div style={{
        maxWidth: "82%",
        background: error ? "var(--red-bg)" : "var(--paper)",
        border: "1px solid " + (error ? "var(--red)" : "var(--line)"),
        padding: "12px 16px", borderRadius: "12px 12px 12px 4px",
        fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55, whiteSpace: "pre-wrap"
      }}>
        {content}
      </div>
    </div>
  );
};

const Typing = () => (
  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 6, height: 6, borderRadius: 999, background: "var(--muted-2)",
        animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`
      }} />
    ))}
    <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}`}</style>
  </div>
);

Object.assign(window, { ScreenAI });
