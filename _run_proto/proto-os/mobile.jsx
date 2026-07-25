// Mobile preview — Nubank/Mercury/Revolut feel. Embedded as a Settings sub-tab + accessible via Cmd+K.

const ScreenMobile = () => (
  <window.Shell active="settings" topbar={
    <window.Topbar
      crumbs={["Sistema", "App móvil"]}
      hint="Vista previa · iPhone 15 Pro · iOS 18"
      action={<button className="btn ghost"><window.Ico name="download" size={13} />Descargar TestFlight</button>}
    />
  }>
    <div style={{ padding: "40px 48px 64px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Hero */}
      <div className="anim-in d1" style={{ marginBottom: 48 }}>
        <div className="eyebrow">· ContaPanamá OS Mobile</div>
        <h1 style={{ fontSize: 56, lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 600, marginTop: 16, maxWidth: 800 }}>
          Tu firma <span style={{
            background: "linear-gradient(135deg, #D4A86A, #FF7849)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>en el bolsillo</span>.
        </h1>
        <p className="body" style={{ marginTop: 16, maxWidth: 580, fontSize: 15 }}>
          Premium fintech feel. Nubank · Mercury · Revolut. La firma respira contigo desde el primer minuto del día.
        </p>
      </div>

      {/* 3 phones */}
      <div className="anim-in d2" style={{
        display: "flex", justifyContent: "center", gap: 32,
        padding: "20px 0 40px"
      }}>
        <Phone label="Pulso · 5 segundos">
          <MobilePulse />
        </Phone>
        <Phone label="IA viva · el centro" highlight>
          <MobileAI />
        </Phone>
        <Phone label="Aprobar con un toque">
          <MobileAction />
        </Phone>
      </div>

      {/* Principles */}
      <div className="anim-in d3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 32 }}>
        <Principle t="Una decisión a la vez" sub="Lo que la app pide hoy, cabe en un pulgar. Más nada." />
        <Principle t="La IA está en el centro" sub="No es un botón. Es la pantalla. Hablás. Resuelve." />
        <Principle t="Sin gráficos densos" sub="Si querés profundidad, abrís el desktop. El móvil es para acción." />
      </div>
    </div>
  </window.Shell>
);

// ── Phone frame ──────────────────────────────────────────
const Phone = ({ label, children, highlight = false }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
    <div style={{
      width: 320, height: 660, borderRadius: 48,
      background: "#0A0A0B",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: highlight
        ? "0 0 60px rgba(212,168,106,0.25), 0 40px 80px rgba(0,0,0,0.6)"
        : "0 30px 60px rgba(0,0,0,0.5)",
      padding: 5, position: "relative",
      transform: highlight ? "scale(1.05)" : "scale(1)",
      transition: "all .3s"
    }}>
      {/* Notch */}
      <div style={{
        position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        width: 100, height: 28, borderRadius: 20,
        background: "#000", zIndex: 10
      }} />
      <div style={{
        width: "100%", height: "100%", borderRadius: 44,
        background: "linear-gradient(180deg, #18181C 0%, #0F0F11 100%)",
        overflow: "hidden", position: "relative",
        color: "var(--text)"
      }}>
        {children}
      </div>
    </div>
    <div style={{
      padding: "6px 14px", borderRadius: 999,
      background: highlight ? "var(--gold-soft)" : "var(--glass-2)",
      color: highlight ? "var(--gold)" : "var(--text-3)",
      border: "1px solid var(--hairline)",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase"
    }}>{label}</div>
  </div>
);

// ── Screen 1: Pulse ──────────────────────────────────────
const MobilePulse = () => (
  <div style={{ padding: "52px 22px 22px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #D4A86A, #B98C4D)", color: "#1a1306", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>CM</div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>Buenos días</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Carlos</div>
        </div>
      </div>
      <window.Ico name="bell" size={16} color="var(--text-3)" />
    </div>

    {/* Hero */}
    <div style={{ paddingTop: 12 }}>
      <div className="eyebrow" style={{ color: "var(--text-4)" }}>· Hoy</div>
      <div style={{
        fontSize: 52, fontWeight: 600, marginTop: 8, lineHeight: 1.05, letterSpacing: "-0.03em"
      }}>
        Tu firma<br/>va <span style={{
          background: "linear-gradient(135deg, #D4A86A, #FF7849)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>bien</span>.
      </div>
    </div>

    {/* Priority pill */}
    <div style={{
      marginTop: 28, padding: "16px 16px", borderRadius: 16,
      background: "linear-gradient(180deg, rgba(212,168,106,0.08), transparent)",
      border: "1px solid rgba(212,168,106,0.25)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <window.Ico name="zap" size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Sábado · 4 días</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>4 ITBMS por $8,420</div>
          <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 4, lineHeight: 1.4 }}>3 listas. 1 necesita 5 min.</div>
        </div>
      </div>
      <button style={{
        marginTop: 14, width: "100%", padding: "11px 0",
        background: "var(--gold)", color: "#1a1306",
        border: 0, borderRadius: 10,
        fontSize: 13, fontWeight: 600, fontFamily: "inherit"
      }}>
        Resolver con IA
      </button>
    </div>

    {/* Quiet stats */}
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <Row k="Ingresos del mes" v="$284k" />
      <Row k="Clientes al día" v="43 de 47" />
      <Row k="Salud fiscal" v="100%" tone="green" />
    </div>
  </div>
);

// ── Screen 2: AI as center ───────────────────────────────
const MobileAI = () => (
  <div style={{ padding: "52px 0 22px", display: "flex", flexDirection: "column", height: "100%" }}>
    <div style={{ padding: "0 22px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Hola, Carlos</span>
      <window.Ico name="more" size={16} color="var(--text-3)" />
    </div>

    <div style={{ padding: "0 22px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 24 }}>
      <div className="ai-glow" style={{
        width: 80, height: 80, margin: "0 auto",
        borderRadius: 22, background: "linear-gradient(135deg, #D4A86A, #FF7849)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <window.Ico name="sparkles" size={32} color="#0A0A0B" />
      </div>

      <div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          ¿Qué necesitas<br/>saber hoy?
        </div>
        <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 10, lineHeight: 1.5 }}>
          Tu copiloto te conoce.<br/>Te conoce a tus 47 clientes.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          "¿Cómo va Maersk este mes?",
          "¿Qué vence esta semana?",
          "Resumen del trimestre",
        ].map((s, i) => (
          <div key={i} style={{
            padding: "11px 16px", borderRadius: 12,
            background: "var(--glass-2)", border: "1px solid var(--hairline)",
            fontSize: 12.5, textAlign: "left",
            display: "flex", alignItems: "center", gap: 9
          }}>
            <window.Ico name="sparkles" size={11} color="var(--gold)" />
            <span style={{ flex: 1 }}>{s}</span>
            <window.Ico name="arrowRight" size={11} color="var(--text-5)" />
          </div>
        ))}
      </div>
    </div>

    {/* Bottom voice input */}
    <div style={{ padding: "12px 22px 22px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "12px 16px", borderRadius: 14,
        background: "var(--glass-2)", border: "1px solid var(--hairline-strong)"
      }}>
        <span style={{ flex: 1, fontSize: 13, color: "var(--text-4)" }}>Habla o escribe…</span>
        <div className="ai-glow" style={{
          width: 32, height: 32, borderRadius: 999,
          background: "linear-gradient(135deg, #D4A86A, #FF7849)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <window.Ico name="sparkles" size={13} color="#0A0A0B" />
        </div>
      </div>
    </div>
  </div>
);

// ── Screen 3: One-tap action ─────────────────────────────
const MobileAction = () => (
  <div style={{ padding: "52px 22px 22px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
      <window.Ico name="arrowRight" size={16} color="var(--text-3)" style={{ transform: "rotate(180deg)" }} />
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>ITBMS · Marzo</div>
      <window.Ico name="more" size={16} color="var(--text-3)" />
    </div>

    <div>
      <div className="eyebrow" style={{ color: "var(--gold)" }}>· A presentar</div>
      <div style={{ fontSize: 56, fontWeight: 700, marginTop: 10, lineHeight: 1, letterSpacing: "-0.03em" }}>
        $8,420
      </div>
      <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 8 }}>4 declaraciones · sábado 15 de marzo</div>
    </div>

    <div style={{
      marginTop: 28, padding: "16px 16px", borderRadius: 14,
      background: "var(--glass-2)", border: "1px solid var(--hairline)"
    }}>
      <Row k="Maersk Panamá" v="$2,800" tone="green-tag" />
      <Row k="Distribuidora Sur" v="$1,820" tone="green-tag" />
      <Row k="Café del Casco" v="$600" tone="green-tag" />
      <Row k="Constructora Istmo" v="$3,200" tone="orange-tag" border={false} />
    </div>

    {/* AI commentary */}
    <div style={{
      marginTop: 14, padding: "12px 14px", borderRadius: 12,
      background: "rgba(212,168,106,0.06)", border: "1px solid rgba(212,168,106,0.2)",
      display: "flex", gap: 9, alignItems: "flex-start"
    }}>
      <window.Ico name="sparkles" size={11} color="var(--gold)" style={{ marginTop: 2 }} />
      <span style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>
        3 listas. Constructora Istmo lleva 2 meses atrasada — recomiendo abrirla primero.
      </span>
    </div>

    {/* Big approve button */}
    <div style={{ marginTop: 28 }}>
      <button style={{
        width: "100%", padding: "16px 0",
        background: "linear-gradient(135deg, #D4A86A 0%, #B98C4D 100%)",
        color: "#1a1306", border: 0, borderRadius: 14,
        fontSize: 15, fontWeight: 700, fontFamily: "inherit",
        boxShadow: "0 0 40px rgba(212,168,106,0.25)"
      }}>
        Resolver las 3 listas
      </button>
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "var(--text-4)" }}>
        Constructora se abre aparte
      </div>
    </div>
  </div>
);

const Row = ({ k, v, tone, border = true }) => {
  const tagColor = tone === "green-tag" ? "var(--green)" : tone === "orange-tag" ? "var(--orange)" : null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0",
      borderBottom: border ? "1px solid var(--hairline)" : "0"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {tagColor && <span style={{ width: 5, height: 5, borderRadius: 999, background: tagColor }} />}
        <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{k}</span>
      </div>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: tone === "green" ? "var(--green)" : "var(--text)" }}>{v}</span>
    </div>
  );
};

const Principle = ({ t, sub }) => (
  <div className="card" style={{ padding: "20px 22px" }}>
    <div className="h3" style={{ marginBottom: 6 }}>{t}</div>
    <div className="body-s" style={{ color: "var(--text-4)" }}>{sub}</div>
  </div>
);

Object.assign(window, { ScreenMobile });
