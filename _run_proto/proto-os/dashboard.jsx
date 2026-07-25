// Dashboard — "Hoy". Premium emotional surface.
// VisionOS / Arc / Apple Wallet aesthetic. No boxes. No grids. Just light + meaning.

const Dashboard = () => {
  const { navigate, showToast } = window.useApp();
  const [aiOpen, setAiOpen] = React.useState(false);

  // Time-aware greeting
  const now = new Date();
  const h = now.getHours();
  const greeting = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
  const moment   = h < 12 ? "esta mañana" : h < 18 ? "esta tarde" : "esta noche";

  // Living priority — chosen by context (here we hardcode but the shape is reactive)
  const priority = LIVING_PRIORITY;

  // Mouse parallax for orbs
  const stageRef = React.useRef(null);
  React.useEffect(() => {
    const onMove = (e) => {
      if (!stageRef.current) return;
      const r = stageRef.current.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      stageRef.current.style.setProperty("--px", x.toFixed(3));
      stageRef.current.style.setProperty("--py", y.toFixed(3));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <window.Shell active="dashboard" topbar={
      <window.Topbar
        crumbs={["Hoy"]}
        hint={<><span style={{ color: "var(--green)" }}>● </span><span style={{ opacity: 0.7 }}>todo en orden · martes 11 de marzo · 11:42</span></>}
        action={
          <button className="btn ghost" onClick={() => setAiOpen(true)}>
            <window.Ico name="sparkles" size={13} color="var(--gold)" />
            <span style={{ opacity: 0.85 }}>Habla con tu copiloto</span>
            <window.KBD>⌘K</window.KBD>
          </button>
        }
      />
    }>

      <div ref={stageRef} style={{
        maxWidth: 960, margin: "0 auto", padding: "80px 56px 96px",
        position: "relative", "--px": 0, "--py": 0,
      }}>

        {/* ─── Living parallax orbs — interior to the stage ─── */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
        }}>
          <div style={{
            position: "absolute", top: -60, left: "30%",
            width: 520, height: 520, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,168,106,0.16), transparent 65%)",
            filter: "blur(40px)",
            transform: "translate3d(calc(var(--px) * 30px), calc(var(--py) * 20px), 0)",
            transition: "transform 1.2s cubic-bezier(.2,.7,.2,1)"
          }} />
          <div style={{
            position: "absolute", top: 200, right: "10%",
            width: 380, height: 380, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,120,73,0.10), transparent 65%)",
            filter: "blur(40px)",
            transform: "translate3d(calc(var(--px) * -40px), calc(var(--py) * 25px), 0)",
            transition: "transform 1.2s cubic-bezier(.2,.7,.2,1)"
          }} />
          <div style={{
            position: "absolute", bottom: 100, left: "20%",
            width: 320, height: 320, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167,139,250,0.08), transparent 65%)",
            filter: "blur(40px)",
            transform: "translate3d(calc(var(--px) * 20px), calc(var(--py) * -30px), 0)",
            transition: "transform 1.2s cubic-bezier(.2,.7,.2,1)"
          }} />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>

          {/* ─────────────────────────────────────────────
              HERO — la frase del día
              ───────────────────────────────────────────── */}
          <div className="anim-in d1" style={{ marginBottom: 88 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 22,
              opacity: 0.75
            }}>
              <span className="breathe" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {greeting}, Carlos. Tu firma respira tranquila {moment}.
              </span>
            </div>

            <h1 style={{
              fontSize: 72, lineHeight: 1.06, letterSpacing: "-0.035em",
              fontWeight: 600, margin: 0, color: "var(--text)",
            }}>
              Todo está<br/>
              <span style={{
                background: "linear-gradient(135deg, #D4A86A 0%, #FF7849 60%, #D4A86A 100%)",
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "gradient-shift 8s ease-in-out infinite",
              }}>bajo control</span>.
            </h1>

            <p style={{
              fontSize: 17, lineHeight: 1.55, color: "var(--text-3)",
              marginTop: 22, maxWidth: 520, fontWeight: 400
            }}>
              43 clientes al día · $284k facturados · 22 horas ahorradas por la IA esta semana.
            </p>
          </div>

          {/* ─────────────────────────────────────────────
              PRIORIDAD VIVA — floating glass, no border
              ───────────────────────────────────────────── */}
          <div className="anim-in d2" style={{ marginBottom: 96 }}>
            <LivingPriority p={priority} onResolve={() => showToast("3 declaraciones enviadas a firma", { icon: "check" })} onSeeMore={() => navigate("itbms")} />
          </div>

          {/* ─────────────────────────────────────────────
              SUSURROS DE LA IA — proactivos, sin caja
              ───────────────────────────────────────────── */}
          <div className="anim-in d3" style={{ marginBottom: 96 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 9,
              marginBottom: 28, opacity: 0.7
            }}>
              <window.Ico name="sparkles" size={11} color="var(--gold)" />
              <span style={{ fontSize: 11.5, color: "var(--text-3)", letterSpacing: "0.04em" }}>Tu copiloto se adelantó a tres cosas.</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <Whisper
                tone="violet"
                icon="trendingUp"
                t="Café del Casco tuvo su mejor mes en 2 años."
                sub="Creció 34%. Te dejé el escenario de renta proyectado en su perfil — vale una llamada esta semana."
                action="Ver Café del Casco"
                onClick={() => navigate("clientes")}
              />
              <Whisper
                tone="gold"
                icon="zap"
                t="3 gastos sin factura en Marina del Pacífico."
                sub="$840 de crédito fiscal en riesgo. Redacté el correo al proveedor — solo necesita tu aprobación."
                action="Aprobar el envío"
              />
              <Whisper
                tone="orange"
                icon="shield"
                t="Tu Q1 cierra 8.4× arriba del año pasado."
                sub="A este ritmo, $850k facturados antes de abril. Preparé el brief ejecutivo por si lo necesitás."
                action="Abrir brief"
                onClick={() => navigate("analytics")}
              />
            </div>
          </div>

          {/* ─────────────────────────────────────────────
              CALMA — la línea base
              ───────────────────────────────────────────── */}
          <div className="anim-in d4" style={{
            display: "flex", alignItems: "center", gap: 18,
            paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.04)",
            opacity: 0.7
          }}>
            <window.Ico name="shield" size={14} color="var(--green)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                Si te fiscalizan mañana, estás listo.
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 4 }}>
                12,400 documentos archivados · 100% de tus clientes al día con DGI · auditoría-ready hace 47 días seguidos.
              </div>
            </div>
            <window.Ico name="arrowRight" size={12} color="var(--text-4)" style={{ cursor: "pointer" }} onClick={() => navigate("analytics")} />
          </div>

        </div>
      </div>

      {/* AI sheet */}
      {aiOpen && <AISheet onClose={() => setAiOpen(false)} onAsk={(q) => { setAiOpen(false); navigate("ai", { aiQuery: q }); }} />}

      {/* Inline keyframes for hero gradient + countdown pulse */}
      <style>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes countdown-bar {
          0%, 100% { transform: scaleX(1); opacity: 0.9; }
          50% { transform: scaleX(1.02); opacity: 1; }
        }
        @keyframes glass-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </window.Shell>
  );
};

// ─── Living Priority ────────────────────────────────────────────
// A floating "tile" with no border. Reacts to time. Suggests action.

const LIVING_PRIORITY = {
  countdown: "4 días",
  countdownLong: "Sábado 15 de marzo",
  eyebrow: "TU UNA COSA · ESTA SEMANA",
  headline: "4 declaraciones de ITBMS",
  amount: 8420,
  body: "La IA ya las preparó. Tres están listas para firma del cliente. Constructora Istmo necesita 5 minutos tuyos para regularizar dos meses atrasados.",
  status: "3 de 4 listas",
  progress: 0.75,
  cta: "Resolver con la IA",
  estimated: "8 minutos",
};

const LivingPriority = ({ p, onResolve, onSeeMore }) => (
  <div style={{ position: "relative" }}>
    {/* Light bloom behind */}
    <div style={{
      position: "absolute", inset: -40, borderRadius: 40,
      background: "radial-gradient(ellipse at 30% 0%, rgba(212,168,106,0.18), transparent 60%)",
      filter: "blur(20px)", pointerEvents: "none"
    }} />

    {/* Floating glass tile */}
    <div style={{
      position: "relative",
      background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
      backdropFilter: "blur(40px) saturate(160%)",
      WebkitBackdropFilter: "blur(40px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 28,
      padding: "36px 40px 32px",
      overflow: "hidden",
      boxShadow: "0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      {/* Inside-orb */}
      <div style={{
        position: "absolute", top: -100, right: -60,
        width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,168,106,0.22), transparent 60%)",
        filter: "blur(20px)", pointerEvents: "none"
      }} />

      {/* Shimmer line that travels through the card */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(212,168,106,0.4), transparent)",
        animation: "glass-shimmer 6s ease-in-out infinite",
      }} />

      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 24 }}>
        {/* Living countdown badge */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "18px 16px", borderRadius: 16,
          background: "rgba(0,0,0,0.3)",
          border: "1px solid rgba(212,168,106,0.18)",
          minWidth: 88, flexShrink: 0,
          position: "relative"
        }}>
          <span style={{ fontSize: 9.5, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.14em" }}>VENCE</span>
          <span className="serif" style={{ fontSize: 36, color: "var(--gold)", lineHeight: 1, marginTop: 8, fontFamily: "Instrument Serif, serif", letterSpacing: "-0.02em" }}>4</span>
          <span style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>días</span>
          {/* live pulse */}
          <span className="breathe" style={{
            position: "absolute", top: 12, right: 12,
            width: 6, height: 6, borderRadius: 999, background: "var(--gold)"
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--gold)", letterSpacing: "0.12em" }}>{p.eyebrow}</span>

          <h2 style={{
            fontSize: 30, lineHeight: 1.2, letterSpacing: "-0.02em",
            fontWeight: 500, marginTop: 12, marginBottom: 4, color: "var(--text)"
          }}>
            {p.headline} por <span style={{
              background: "linear-gradient(135deg, #D4A86A, #FF7849)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>${p.amount.toLocaleString()}</span>
          </h2>

          <p style={{ fontSize: 13.5, color: "var(--text-3)", lineHeight: 1.6, margin: "10px 0 0", maxWidth: 560 }}>
            {p.body}
          </p>

          {/* Progress bar — visual feedback that the IA is making things easier */}
          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              flex: 1, height: 3, borderRadius: 999,
              background: "rgba(255,255,255,0.06)", overflow: "hidden"
            }}>
              <div style={{
                width: `${p.progress * 100}%`, height: "100%",
                background: "linear-gradient(90deg, #D4A86A, #FF7849)",
                borderRadius: 999, transformOrigin: "left",
                animation: "countdown-bar 3s ease-in-out infinite",
              }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{p.status}</span>
          </div>

          {/* Actions — flush, no card framing */}
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={onResolve} style={{
              padding: "12px 20px", borderRadius: 12,
              background: "linear-gradient(135deg, #D4A86A 0%, #B98C4D 100%)",
              color: "#1a1306", border: 0,
              fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 0 30px rgba(212,168,106,0.3)",
              display: "inline-flex", alignItems: "center", gap: 7,
              fontFamily: "inherit"
            }}>
              <window.Ico name="zap" size={13} color="#1a1306" />
              {p.cta}
            </button>
            <button onClick={onSeeMore} style={{
              padding: "12px 16px", borderRadius: 12,
              background: "transparent", color: "var(--text-2)", border: 0,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit"
            }}>
              Cliente por cliente →
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>~{p.estimated}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── Whisper — proactive insight, no card, just light + meaning ─────────────
const Whisper = ({ tone, icon, t, sub, action, onClick }) => {
  const colors = { red: "var(--red)", orange: "var(--orange)", violet: "var(--violet)", gold: "var(--gold)", green: "var(--green)" };
  const accent = colors[tone];

  return (
    <div onClick={onClick} style={{
      padding: "26px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      display: "flex", gap: 22, alignItems: "flex-start",
      cursor: onClick ? "pointer" : "default",
      transition: "all .2s"
    }} onMouseEnter={e => { e.currentTarget.style.paddingLeft = "12px"; }}
       onMouseLeave={e => { e.currentTarget.style.paddingLeft = "0px"; }}>
      {/* Vertical accent line — replaces icon container */}
      <div style={{
        width: 2, alignSelf: "stretch", flexShrink: 0,
        background: `linear-gradient(180deg, ${accent}, transparent)`,
        borderRadius: 2, opacity: 0.7
      }} />

      <div style={{
        width: 24, height: 24, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent, marginTop: 2
      }}>
        <window.Ico name={icon} size={14} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", lineHeight: 1.4, letterSpacing: "-0.005em" }}>{t}</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>{sub}</div>
        <div style={{
          marginTop: 14, fontSize: 12, color: accent,
          display: "inline-flex", alignItems: "center", gap: 5,
          fontWeight: 500, opacity: 0.9
        }}>
          {action} <window.Ico name="arrowRight" size={11} />
        </div>
      </div>
    </div>
  );
};

// AI sheet — minimal, voice-first feel
const AISheet = ({ onClose, onAsk }) => {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const proactive = [
    { t: "¿Quién necesita más mi atención esta semana?", icon: "users" },
    { t: "Resumen para mi reunión con Maersk mañana", icon: "message" },
    { t: "Compará marzo con marzo del año pasado", icon: "trendingUp" },
    { t: "¿Hay algo raro en los gastos de mis clientes?", icon: "shield" },
  ];

  return (
    <>
      <div className="palette-scrim" onClick={onClose} />
      <div className="anim-in" style={{
        position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
        width: 640, zIndex: 250,
        background: "rgba(20,20,24,0.85)",
        backdropFilter: "blur(60px) saturate(180%)",
        WebkitBackdropFilter: "blur(60px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(212,168,106,0.08)"
      }}>
        <div style={{ padding: "20px 24px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <div className="ai-glow" style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, #D4A86A, #FF7849)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <window.Ico name="sparkles" size={14} color="#0A0A0B" />
          </div>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && q.trim()) onAsk(q); }}
            placeholder="Tu copiloto te escucha…"
            style={{
              flex: 1, background: "transparent", border: 0, outline: 0,
              padding: 0, fontSize: 15.5, color: "var(--text)", fontFamily: "inherit"
            }}
          />
          <window.KBD>esc</window.KBD>
        </div>

        <div style={{ padding: "4px 8px 16px" }}>
          {proactive.map((s, i) => (
            <div key={i} onClick={() => onAsk(s.t)} style={{
              padding: "12px 16px", margin: "0 8px", borderRadius: 10,
              cursor: "pointer", color: "var(--text-2)",
              fontSize: 13.5, transition: "all .12s",
              display: "flex", alignItems: "center", gap: 12
            }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text)"; }}
               onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}>
              <window.Ico name={s.icon} size={13} color="var(--gold)" />
              <span style={{ flex: 1 }}>{s.t}</span>
              <window.Ico name="arrowRight" size={11} color="var(--text-5)" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { Dashboard });
