// AI Center · refactored. Claude as the operating brain.
// Mode switcher · live context · memory · workflows · ambient suggestions.

const AICenter = () => {
  const { aiQuery, setAiQuery, navigate } = window.useApp();
  const [mode, setMode] = React.useState("empresario");
  const [messages, setMessages] = React.useState(SEED);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (aiQuery) { send(aiQuery); setAiQuery(null); }
  }, [aiQuery]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = (text) => {
    const q = (text || "").trim();
    if (!q) return;
    setMessages(m => [...m, { role: "user", text: q }]);
    setDraft("");
    setMessages(m => [...m, { role: "assistant", typing: true }]);

    setTimeout(() => {
      setMessages(m => {
        const next = [...m];
        const i = next.findIndex(x => x.typing);
        if (i >= 0) next[i] = answer(q, mode);
        return next;
      });
    }, 1200);
  };

  return (
    <window.Shell active="ai" topbar={
      <window.Topbar
        crumbs={[
          <span key="c" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <window.Ico name="sparkles" size={12} color="var(--gold)" />
            ContaPanamá AI
            <span style={{ fontSize: 10.5, color: "var(--text-5)", marginLeft: 4, padding: "2px 7px", borderRadius: 5, background: "var(--glass-2)", border: "1px solid var(--hairline)" }}>Claude Sonnet 4.5</span>
          </span>
        ]}
        hint={<span><span className="breathe" style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: "var(--gold)", marginRight: 7, verticalAlign: "middle" }} />contexto vivo · 47 clientes · marzo 2026</span>}
        action={
          <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--glass-2)", borderRadius: 8, border: "1px solid var(--hairline)" }}>
            {[["empresario", "Empresario"], ["cpa", "CPA"]].map(([id, label]) => (
              <div key={id} onClick={() => setMode(id)} style={{
                padding: "5px 12px", borderRadius: 5, cursor: "pointer",
                background: mode === id ? "var(--surface-3)" : "transparent",
                color: mode === id ? "var(--text)" : "var(--text-3)",
                fontSize: 11.5, fontWeight: mode === id ? 500 : 400,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {mode === id && <span style={{ width: 5, height: 5, borderRadius: 999, background: mode === "empresario" ? "var(--gold)" : "var(--violet)" }} />}
                {label}
              </div>
            ))}
          </div>
        }
      />
    }>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 320px", height: "100%", maxWidth: 1700, margin: "0 auto" }}>

        {/* LEFT · Memory + Context */}
        <aside style={{ borderRight: "1px solid var(--hairline)", padding: "24px 20px", overflowY: "auto", background: "var(--bg-elev)" }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>· Contexto vivo</div>

          {/* Context now */}
          <div style={{
            padding: "14px 16px", borderRadius: 11,
            background: "var(--glass-2)", border: "1px solid var(--hairline)",
            marginBottom: 18
          }}>
            <div style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 9 }}>Lo que sé ahora</div>
            <CtxRow k="Empresa" v="Méndez & Asociados" />
            <CtxRow k="Rol" v={mode === "cpa" ? "CPA Partner" : "Owner"} />
            <CtxRow k="Modo" v={mode === "cpa" ? "Técnico fiscal" : "Conversacional"} tone={mode === "cpa" ? "violet" : "gold"} />
            <CtxRow k="Período" v="Marzo 2026" />
            <CtxRow k="Días a vencimiento" v="4 días" tone="orange" />
            <CtxRow k="Industria" v="Firma contable" />
            <CtxRow k="Clientes activos" v="47" />
          </div>

          {/* Memory */}
          <div className="eyebrow" style={{ marginBottom: 12 }}>· Memoria semántica</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {MEMORY.map(m => (
              <div key={m.id} style={{ padding: "10px 12px", borderRadius: 9, background: "var(--glass)", border: "1px solid var(--hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <window.Ico name={m.icon} size={10} color="var(--gold)" />
                  <span style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{m.kind}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4 }}>{m.t}</div>
              </div>
            ))}
          </div>

          {/* Connectors live */}
          <div className="eyebrow" style={{ marginBottom: 12 }}>· Conectores activos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {CONNECTORS.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 7 }}>
                <window.Ico name={c.icon} size={11} color={c.live ? "var(--gold)" : "var(--text-5)"} />
                <span style={{ fontSize: 11.5, color: c.live ? "var(--text-2)" : "var(--text-5)", flex: 1 }}>{c.t}</span>
                {c.live && <span className="breathe" style={{ width: 5, height: 5, borderRadius: 999, background: "var(--green)" }} />}
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER · Chat */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "40px 56px 16px" }}>
            {messages.length === 0
              ? <Empty mode={mode} onPick={send} />
              : (
                <div style={{ maxWidth: 760, margin: "0 auto" }}>
                  {messages.map((m, i) => <Msg key={i} {...m} mode={mode} onPick={send} />)}
                </div>
              )
            }
          </div>

          {/* Composer */}
          <div style={{ padding: "16px 56px 26px", borderTop: "1px solid var(--hairline)", background: "rgba(10,10,11,0.6)", backdropFilter: "blur(20px)" }}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              <div style={{
                padding: "14px 18px",
                background: "var(--glass-2)", backdropFilter: "blur(20px)",
                border: "1px solid var(--hairline-strong)", borderRadius: 14,
                display: "flex", flexDirection: "column", gap: 12
              }}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
                  placeholder={mode === "cpa" ? "Consultá al cerebro · análisis técnico, fiscal, auditoría…" : "Tu copiloto te escucha. Pregunta lo que quieras…"}
                  rows={2}
                  style={{
                    width: "100%", background: "transparent", border: 0, outline: 0,
                    padding: 0, fontSize: 14.5, color: "var(--text)",
                    resize: "none", fontFamily: "inherit", lineHeight: 1.5
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-5)", display: "flex", alignItems: "center", gap: 5 }}>
                    <window.Ico name="layers" size={10} color="var(--text-4)" />
                    Contexto: 47 clientes · marzo · {mode}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button className="btn s ghost"><window.Ico name="upload" size={11} />Adjuntar</button>
                  <button className="btn s ghost"><window.Ico name="camera" size={11} />Foto</button>
                  <button onClick={() => send(draft)} disabled={!draft.trim()} className="btn s gold">
                    <window.Ico name="send" size={11} color="#1a1306" />Enviar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT · Capabilities + Workflows */}
        <aside style={{ background: "var(--bg-elev)", borderLeft: "1px solid var(--hairline)", overflowY: "auto", padding: "24px 20px" }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>· Lo que el cerebro puede hacer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {CAPABILITIES.map(c => (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 9, background: "var(--glass)", border: "1px solid var(--hairline)",
                cursor: "pointer", transition: "all .12s"
              }} onMouseEnter={e => e.currentTarget.style.background = "var(--glass-strong)"}
                 onMouseLeave={e => e.currentTarget.style.background = "var(--glass)"}>
                <window.Ico name={c.icon} size={12} color={c.color} />
                <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{c.t}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{ marginBottom: 12 }}>· Workflows automáticos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {WORKFLOWS.map(w => (
              <div key={w.id} style={{ padding: "11px 13px", borderRadius: 9, background: "var(--glass)", border: "1px solid var(--hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <window.Ico name="workflow" size={10} color="var(--gold)" />
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text)", flex: 1 }}>{w.t}</span>
                  <span className="breathe" style={{ width: 5, height: 5, borderRadius: 999, background: "var(--green)" }} />
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.4 }}>{w.sub}</div>
              </div>
            ))}
          </div>

          {/* Provider transparency */}
          <div style={{ marginTop: 24, padding: "12px 14px", background: "var(--glass)", border: "1px solid var(--hairline)", borderRadius: 9 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Provider Layer</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              Razonamiento: <b style={{ color: "var(--text-2)" }}>Claude Sonnet 4.5</b><br/>
              OCR vision: <b style={{ color: "var(--text-2)" }}>Claude Sonnet 4.5</b><br/>
              Clasificación bulk: <b style={{ color: "var(--text-2)" }}>Llama 3 70B · local</b><br/>
              Embeddings: <b style={{ color: "var(--text-2)" }}>Voyage-3</b>
            </div>
          </div>
        </aside>
      </div>
    </window.Shell>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

const CtxRow = ({ k, v, tone }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 11 }}>
    <span style={{ color: "var(--text-4)" }}>{k}</span>
    <span style={{ color: tone === "gold" ? "var(--gold)" : tone === "violet" ? "var(--violet)" : tone === "orange" ? "var(--orange)" : "var(--text-2)", fontWeight: 500 }}>{v}</span>
  </div>
);

const Empty = ({ mode, onPick }) => (
  <div style={{ maxWidth: 700, margin: "12vh auto 0", textAlign: "center" }}>
    <div className="ai-glow" style={{
      width: 72, height: 72, margin: "0 auto",
      borderRadius: 20, background: "linear-gradient(135deg, #D4A86A, #FF7849)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <window.Ico name="sparkles" size={32} color="#0A0A0B" />
    </div>
    <h1 style={{ fontSize: 44, fontWeight: 600, marginTop: 32, lineHeight: 1.1, letterSpacing: "-0.025em" }}>
      {mode === "cpa" ? "El cerebro fiscal te escucha." : "Tu copiloto te conoce."}
    </h1>
    <p style={{ fontSize: 14.5, color: "var(--text-3)", marginTop: 14, maxWidth: 520, margin: "14px auto 0" }}>
      {mode === "cpa"
        ? "Análisis fiscal, auditoría, riesgos DGI, conciliación profunda. Hablale técnico — entiende."
        : "Te conoce a vos, a tus 47 clientes, a tu marzo. Hablale como hablás con tu mejor asociado."}
    </p>

    <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, textAlign: "left" }}>
      {(mode === "cpa" ? PROMPTS_CPA : PROMPTS_OWNER).map((p, i) => (
        <div key={i} onClick={() => onPick(p)} style={{
          padding: "14px 16px", borderRadius: 10,
          background: "var(--glass)", border: "1px solid var(--hairline)",
          cursor: "pointer", transition: "all .12s",
          display: "flex", alignItems: "center", gap: 11
        }} onMouseEnter={e => { e.currentTarget.style.background = "var(--glass-strong)"; e.currentTarget.style.borderColor = "var(--hairline-strong)"; }}
           onMouseLeave={e => { e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.borderColor = "var(--hairline)"; }}>
          <window.Ico name="sparkles" size={11} color="var(--gold)" />
          <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{p}</span>
        </div>
      ))}
    </div>
  </div>
);

const Msg = ({ role, text, typing, blocks, suggestions, mode, onPick }) => {
  if (typing) return (
    <div className="anim-in" style={{ display: "flex", gap: 14, padding: "18px 0" }}>
      <div className="ai-glow" style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #D4A86A, #FF7849)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <window.Ico name="sparkles" size={12} color="#0A0A0B" />
      </div>
      <div style={{ flex: 1, paddingTop: 6, color: "var(--text-4)", fontSize: 12, fontStyle: "italic" }}>
        <span className="breathe" style={{ display: "inline-block", width: 4, height: 4, borderRadius: 999, background: "var(--gold)", marginRight: 6, verticalAlign: "middle" }} />
        leyendo contexto · pensando · planeando…
      </div>
    </div>
  );

  if (role === "user") return (
    <div className="anim-in" style={{ display: "flex", justifyContent: "flex-end", padding: "10px 0" }}>
      <div style={{
        maxWidth: "75%", padding: "11px 16px",
        background: "var(--glass-strong)", border: "1px solid var(--hairline-strong)",
        borderRadius: 12, fontSize: 14, lineHeight: 1.5
      }}>{text}</div>
    </div>
  );

  return (
    <div className="anim-in" style={{ display: "flex", gap: 14, padding: "18px 0" }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #D4A86A, #FF7849)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <window.Ico name="sparkles" size={12} color="#0A0A0B" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {text && <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text-2)" }} dangerouslySetInnerHTML={{ __html: text }} />}
        {blocks && blocks.map((b, i) => <Block key={i} {...b} />)}
        {suggestions && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => onPick(s)} style={{
                padding: "5px 11px", borderRadius: 999,
                background: "var(--glass-2)", border: "1px solid var(--hairline-strong)",
                fontSize: 11.5, color: "var(--gold)", cursor: "pointer"
              }}>{s}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Block = ({ kind, ...props }) => {
  if (kind === "table") return (
    <div className="card" style={{ marginTop: 14, overflow: "hidden" }}>
      <table className="tbl">
        <thead><tr>{props.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{props.rows.map((r, i) => (
          <tr key={i} className="hoverable">
            {r.map((cell, j) => <td key={j} className={j === r.length - 1 ? "r" : ""}>{cell}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  if (kind === "stats") return (
    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: `repeat(${props.items.length}, 1fr)`, gap: 10 }}>
      {props.items.map((s, i) => (
        <div key={i} className="card" style={{ padding: "14px 16px" }}>
          <div className="eyebrow">· {s.k}</div>
          <div className="h2 num" style={{ marginTop: 6, color: s.tone ? `var(--${s.tone})` : "var(--text)" }}>{s.v}</div>
          {s.sub && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 3 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
  if (kind === "alert") return (
    <div className="card" style={{ marginTop: 14, padding: "14px 16px", borderColor: `var(--${props.tone})`, background: `var(--${props.tone}-soft)` }}>
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        <window.Ico name="shield" size={14} color={`var(--${props.tone})`} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: `var(--${props.tone})` }}>{props.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>{props.body}</div>
        </div>
      </div>
    </div>
  );
  if (kind === "plan") return (
    <div style={{ marginTop: 14, padding: "16px 18px", borderRadius: 12, background: "var(--glass)", border: "1px solid var(--hairline)" }}>
      <div className="eyebrow" style={{ marginBottom: 12, color: "var(--gold)" }}>· Plan propuesto · {props.steps.length} pasos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {props.steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: "var(--glass-2)", border: "1px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, color: "var(--gold)", fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text)" }}>{s.t}</div>
              <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 3 }}>{s.tool && <span className="mono" style={{ background: "var(--glass-2)", padding: "1px 5px", borderRadius: 4 }}>{s.tool}</span>} {s.sub}</div>
            </div>
            {s.approval && <window.Pill tone="orange">requiere aprobación</window.Pill>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hairline)", display: "flex", gap: 8 }}>
        <button className="btn s gold"><window.Ico name="zap" size={11} />Ejecutar plan</button>
        <button className="btn s ghost">Modificar pasos</button>
      </div>
    </div>
  );
  return null;
};

// ─── Memory + Context + Workflow data ─────────────────────────

const MEMORY = [
  { id: 1, kind: "patrón aprendido", icon: "sparkles", t: "Constructora Istmo paga típicamente al día 8." },
  { id: 2, kind: "preferencia", icon: "user", t: "Carlos prefiere lenguaje técnico en F.430." },
  { id: 3, kind: "decisión previa", icon: "check", t: "Felipe Motta clasificado 50% deducible (acordado mar-10)." },
];

const CONNECTORS = [
  { id: 1, t: "Banca abierta · 3 bancos", icon: "link", live: true },
  { id: 2, t: "DGI · API fiscal Panamá", icon: "globe", live: true },
  { id: 3, t: "PAC · facturación electrónica", icon: "shield", live: true },
  { id: 4, t: "Email · Gmail Workspace", icon: "send", live: true },
  { id: 5, t: "WhatsApp Business API", icon: "whatsapp", live: true },
  { id: 6, t: "Yappy Empresa", icon: "card", live: false },
];

const CAPABILITIES = [
  { id: 1, icon: "link", color: "var(--gold)",   t: "Concilia bancos automático" },
  { id: 2, icon: "fiscal", color: "var(--red)",  t: "Genera F.430 + XML DGI" },
  { id: 3, icon: "camera", color: "var(--violet)", t: "OCR de facturas en español" },
  { id: 4, icon: "shield", color: "var(--orange)", t: "Detecta anomalías + duplicados" },
  { id: 5, icon: "trendingUp", color: "var(--green)", t: "Analiza flujo de caja" },
  { id: 6, icon: "documents", color: "var(--gold)", t: "Lee y explica reportes" },
  { id: 7, icon: "send", color: "var(--blue)",  t: "Redacta correos profesionales" },
  { id: 8, icon: "workflow", color: "var(--violet)", t: "Crea workflows multi-paso" },
];

const WORKFLOWS = [
  { id: 1, t: "ITBMS mensual · batch",    sub: "Genera, valida y envía F.430 a los 47 clientes el día 5." },
  { id: 2, t: "Cierre mensual asistido",   sub: "Concilia, calcula, alerta y prepara para firma CPA." },
  { id: 3, t: "Detección de anomalías",   sub: "Escaneo diario · marca movimientos atípicos." },
  { id: 4, t: "Onboarding cliente nuevo", sub: "Crea catálogo, conecta banco, importa histórico." },
];

const PROMPTS_OWNER = [
  "¿Quién necesita más mi atención esta semana?",
  "¿Cuánto me queda libre después de obligaciones?",
  "Compara este trimestre con el del año pasado",
  "Dame un brief para mi reunión con Maersk",
];

const PROMPTS_CPA = [
  "Analizá el ITBMS de Constructora Istmo · marzo + febrero",
  "Listame omisos del F.430 a la fecha · con riesgo de multa cuantificado",
  "Conciliá Banco General contra el mayor 1101 · marzo",
  "Generá borrador de Renta Natural 2025 · C. Méndez Palacios",
];

// ─── Answers (mode-aware) ─────────────────────────────────────

const answer = (q, mode) => {
  const ql = q.toLowerCase();

  if (ql.includes("ejecutivo") || ql.includes("resumen") || ql.includes("brief") || ql.includes("mes") || ql.includes("trimestre")) {
    if (mode === "cpa") return {
      role: "assistant",
      text: `<b>Análisis Q1 2026 · Méndez & Asociados</b><br/><br/>Cierra el trimestre con $842k consolidados (8 empresas), crecimiento 8.4× YoY. ITBMS recaudado consolidado: $58,940 con neto a pagar de $31,420 para marzo (vence sáb 15-mar). Margen operativo 41.2%, dentro del rango histórico [38-44%].`,
      blocks: [
        { kind: "stats", items: [
          { k: "MRR consolidado", v: "$284k", tone: "gold", sub: "+22.4% vs feb" },
          { k: "ITBMS débito Q1", v: "$58.9k", sub: "47 declaraciones" },
          { k: "ITBMS crédito Q1", v: "$27.5k", sub: "deducible verificado" },
          { k: "Neto a presentar", v: "$31,420", tone: "red", sub: "vence 15-mar" },
        ]},
        { kind: "alert", tone: "red", title: "Omisión Art. 712 · Constructora Istmo",
          body: "F.430 Feb-26 sin presentar (omisión 38 días). Riesgo cuantificado: multa B/.500 base + 2% mensual sobre $1,200 = $1,224. Recomendación: rectificativa con allanamiento antes del 15-mar para reducir multa en 50%." }
      ],
      suggestions: ["Generá rectificativa de Constructora Istmo", "Listame todos los omisos", "Cálculo de Renta proyectada consolidada"],
    };

    return {
      role: "assistant",
      text: `Tu firma viene <b>excelente</b>. Marzo cerrará 22% arriba de febrero — son $284k facturados. Si seguís este ritmo, Q1 cierra 8× arriba del año pasado.`,
      blocks: [
        { kind: "stats", items: [
          { k: "Marzo", v: "$284k", tone: "gold", sub: "+22.4%" },
          { k: "Clientes", v: "47", sub: "100% retención" },
          { k: "IA te ahorró", v: "22h", sub: "esta semana" },
          { k: "Salud fiscal", v: "100%", tone: "green", sub: "al día" },
        ]},
        { kind: "alert", tone: "red", title: "Una cosa que necesita tu atención",
          body: "Constructora Istmo no presentó ITBMS de febrero. Si no se regulariza esta semana son $1,200 de multa. Puedo arreglarlo si me decís." }
      ],
      suggestions: ["Regulariza a Constructora Istmo", "Generá el F.430 de los 4 pendientes", "¿Puedo darme una bonificación este mes?"],
    };
  }

  if (ql.includes("alerta") || ql.includes("crítico") || ql.includes("riesgo") || ql.includes("omiso")) {
    if (mode === "cpa") return {
      role: "assistant",
      text: `<b>Análisis de riesgo fiscal · firma completa</b>`,
      blocks: [
        { kind: "table",
          cols: ["RUC", "Cliente", "Tipo", "Período", "Riesgo $", "Base legal"],
          rows: [
            ["155-789-1", "Constructora Istmo", "Omisión F.430", "Feb-26", "$1,224", "Art. 712 CF"],
            ["155-654-2", "Marina del Pacífico", "Doc. inexistente", "Mar-26", "$840",   "Art. 17 Ley 76"],
            ["155-112-5", "Café del Casco",     "Renta extemp.",  "2024",   "$2,100", "Art. 695 CF"],
          ]
        },
        { kind: "alert", tone: "orange", title: "Recomendación legal",
          body: "Solicitud de allanamiento bajo Art. 1078 para Constructora reduce multa al 50%. Plazo: 15-mar. Preparé el escrito." }
      ],
      suggestions: ["Generá el allanamiento", "Cuantificá riesgo de fiscalización por cliente", "Auditoría preventiva Café del Casco"],
    };
    return {
      role: "assistant",
      text: `Detecté <b>3 cosas críticas</b> esta semana:`,
      blocks: [
        { kind: "table",
          cols: ["Cliente", "Qué pasa", "Cuánto cuesta", "Acción"],
          rows: [
            ["Constructora Istmo", "No presentó ITBMS feb", "$1,200 multa", "Regularizar"],
            ["Marina del Pacífico", "3 gastos sin factura", "$840 perdidos", "Solicitar"],
            ["Café del Casco", "Renta 2024 vencida", "$2,100 multa", "Presentar"],
          ]
        },
      ],
      suggestions: ["Arregla a Constructora", "Redactá los 3 correos", "¿Cuánto pierdo si no actúo?"],
    };
  }

  if (ql.includes("itbms") || ql.includes("430") || ql.includes("generá") || ql.includes("genera")) {
    return {
      role: "assistant",
      text: mode === "cpa"
        ? `Procedo. Te dejo el plan de ejecución para validación antes de submit a DGI:`
        : `Listo. Te muestro el plan — 5 minutos y queda:`,
      blocks: [
        { kind: "plan", steps: [
          { t: "Leer movimientos · 47 clientes · marzo 2026", tool: "read_transactions", sub: "filtrar por status=pending" },
          { t: "Calcular ITBMS débito/crédito por cliente",   tool: "calculate_itbms", sub: "validar con conciliación bancaria" },
          { t: "Detectar anomalías en compras deducibles",    tool: "detect_anomalies", sub: "marcar facturas sin RUC del cliente" },
          { t: "Generar 4 F.430 · PDF + XML DGI",             tool: "generate_f430", sub: "validar RUC + cuentas contables" },
          { t: "Presentar 4 PDFs para tu firma",              tool: "ui_review", sub: "vista lado a lado · 30 segundos cada uno", approval: true },
          { t: "Submit a DGI · obtener CUFE",                 tool: "submit_to_dgi", sub: "API directa · respuesta <5s" },
          { t: "Enviar copia firmada al cliente",             tool: "send_email", sub: "Gmail + WhatsApp para los 4" },
        ]}
      ],
      suggestions: ["Ejecutá el plan", "Cambiá orden", "Modo solo borrador"],
    };
  }

  // Default
  return {
    role: "assistant",
    text: mode === "cpa"
      ? `Entendido. Buscando en tu contexto fiscal y operativo… La respuesta dependerá de los datos en vivo. En producción, este modo ejecuta análisis técnico profundo con citación de normativa DGI panameña.`
      : `Buscando en lo que sé de tu firma… En producción, mi cerebro lee tus 47 clientes en vivo y te responde con datos reales y acciones ejecutables.`,
    suggestions: PROMPTS_OWNER.slice(0, 3),
  };
};

const SEED = [];

Object.assign(window, { AICenter });
