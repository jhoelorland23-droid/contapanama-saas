// Onboarding — 60 seconds, 3 questions, then you're inside your business.

const Onboarding = () => {
  const { user, setOnboarding, celebrate, showToast } = window.useApp();
  const [step, setStep] = React.useState(0);
  const [tipo, setTipo] = React.useState("");
  const [banco, setBanco] = React.useState(null);
  const [bankProgress, setBankProgress] = React.useState(0);

  // Simulate bank import once user picks a bank
  React.useEffect(() => {
    if (step !== 1 || !banco) return;
    const interval = setInterval(() => {
      setBankProgress(p => {
        if (p >= 5) { clearInterval(interval); return 5; }
        return p + 1;
      });
    }, 700);
    return () => clearInterval(interval);
  }, [step, banco]);

  const finish = () => {
    celebrate("Tu negocio está vivo", "Ya organicé 47 transacciones por ti");
    showToast("Bienvenido, Roberto", { icon: "sparkle" });
    setOnboarding(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "var(--bg)", display: "flex", flexDirection: "column", zIndex: 50 }}>

      {/* Top */}
      <div style={{ padding: "22px 36px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <window.Logo size={28} light />
          <div className="h3" style={{ color: "var(--bg)" }}>ContaPanamá</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Steps active={step} />
          <span style={{ fontSize: 12, color: "#7A8285", cursor: "pointer" }} onClick={finish}>Saltar →</span>
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 48px" }}>
        {step === 0 && (
          <StepOne tipo={tipo} setTipo={setTipo} onNext={() => setStep(1)} />
        )}
        {step === 1 && (
          <StepTwo banco={banco} setBanco={setBanco} progress={bankProgress} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <StepThree onFinish={finish} />
        )}
      </div>

      {/* Bottom philosophy */}
      <div style={{ padding: "16px 36px", borderTop: "1px solid rgba(255,255,255,.06)", textAlign: "center", color: "#5A6166", fontSize: 11 }}>
        60 segundos. Lo que sigue, lo hago yo en background.
      </div>
    </div>
  );
};

const Steps = ({ active }) => (
  <div style={{ display: "flex", gap: 8 }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: i === active ? 28 : 12, height: 4, borderRadius: 999,
        background: i <= active ? "var(--gold)" : "rgba(255,255,255,.1)",
        transition: "all .4s"
      }} />
    ))}
  </div>
);

const StepOne = ({ tipo, setTipo, onNext }) => {
  const options = [
    { id: "tienda", t: "Tengo una tienda física o ecommerce", icon: "card" },
    { id: "freelance", t: "Soy freelance o independiente", icon: "users" },
    { id: "b2b", t: "Vendo servicios a empresas", icon: "building" },
    { id: "pyme", t: "Tengo una pyme (5–20 empleados)", icon: "users" },
    { id: "otro", t: "Algo más", icon: "plus" },
  ];

  return (
    <div style={{ maxWidth: 640, width: "100%" }} className="anim-in">
      <div className="eyebrow with-bar" style={{ color: "var(--gold)" }}>· Paso 1 de 3 · 20 segundos</div>
      <h1 className="display-l" style={{ marginTop: 14, color: "var(--bg)", fontSize: 56 }}>
        Cuéntame: <em style={{ color: "var(--gold)" }}>¿qué hace tu negocio?</em>
      </h1>
      <p className="body-l" style={{ marginTop: 12, color: "#A8B0B3", maxWidth: 560 }}>
        Con esto configuro tus cuentas, tus impuestos y el plan del mes. Una sola pregunta. Yo hago el resto.
      </p>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((o, i) => (
          <div key={o.id} onClick={() => setTipo(o.id)} className="anim-in" style={{
            animationDelay: `${0.05 * i}s`,
            display: "flex", alignItems: "center", gap: 12,
            padding: "13px 16px", borderRadius: 10,
            background: tipo === o.id ? "rgba(201,165,90,.12)" : "rgba(255,255,255,.04)",
            border: tipo === o.id ? "1px solid rgba(201,165,90,.5)" : "1px solid transparent",
            cursor: "pointer", transition: "all .2s"
          }}>
            <window.Ico name={o.icon} size={15} color={tipo === o.id ? "var(--gold)" : "#7A8285"} />
            <span style={{ fontSize: 13.5, color: tipo === o.id ? "var(--bg)" : "#A8B0B3", flex: 1 }}>{o.t}</span>
            {tipo === o.id && <window.Ico name="check" size={13} color="var(--gold)" stroke={2.5} />}
          </div>
        ))}
      </div>

      <button className="btn gold lg" style={{ marginTop: 28, width: "100%", justifyContent: "center", opacity: tipo ? 1 : 0.4, pointerEvents: tipo ? "auto" : "none" }} onClick={onNext}>
        Siguiente <window.Ico name="arrowRight" size={14} />
      </button>
    </div>
  );
};

const StepTwo = ({ banco, setBanco, progress, onNext }) => {
  const bancos = [
    { id: "bg", t: "Banco General", abbr: "BG", color: "#0064B0" },
    { id: "banesco", t: "Banesco", abbr: "B", color: "#005EAC" },
    { id: "global", t: "Global Bank", abbr: "G", color: "#E30613" },
    { id: "bac", t: "BAC Credomatic", abbr: "BAC", color: "#D4111C" },
  ];

  const tasks = [
    "Importando movimientos (90 días)",
    "Clasificando con IA por proveedor",
    "Detectando ingresos vs gastos",
    "Calculando tu ITBMS automático",
    "Preparando tu primera vista",
  ];

  return (
    <div style={{ maxWidth: 640, width: "100%" }} className="anim-in">
      <div className="eyebrow with-bar" style={{ color: "var(--gold)" }}>· Paso 2 de 3 · 30 segundos</div>
      <h1 className="display-l" style={{ marginTop: 14, color: "var(--bg)", fontSize: 56 }}>
        Conéctame <em style={{ color: "var(--gold)" }}>tu banco</em>.
      </h1>
      <p className="body-l" style={{ marginTop: 12, color: "#A8B0B3", maxWidth: 560 }}>
        Banca abierta. Solo lectura. No guardo tu contraseña. En 30 segundos vas a ver tus últimos 90 días organizados.
      </p>

      {!banco ? (
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {bancos.map((b, i) => (
            <div key={b.id} onClick={() => setBanco(b.id)} className="anim-in" style={{
              animationDelay: `${0.05 * i}s`,
              display: "flex", alignItems: "center", gap: 12,
              padding: "16px 16px", borderRadius: 10,
              background: "rgba(255,255,255,.04)",
              cursor: "pointer", transition: "all .2s"
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: b.color, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 13
              }}>{b.abbr}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--bg)" }}>{b.t}</div>
                <div style={{ fontSize: 10.5, color: "#7A8285" }}>Banca abierta · Yappy Empresa</div>
              </div>
              <window.Ico name="arrowRight" size={13} color="#5A6166" />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 28, padding: "20px 22px", background: "rgba(255,255,255,.04)", borderRadius: 12 }} className="anim-in">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: bancos.find(b => b.id === banco).color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{bancos.find(b => b.id === banco).abbr}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{bancos.find(b => b.id === banco).t}</div>
              <div style={{ fontSize: 11, color: "#7A8285" }}>{progress >= 5 ? "Conectado ✓" : "Conectando…"}</div>
            </div>
            {progress < 5 && <window.BreathDot size={8} color="var(--gold)" />}
            {progress >= 5 && <window.Ico name="check" size={16} color="#7CFFB2" stroke={2.4} />}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((t, i) => {
              const done = progress > i;
              const live = progress === i;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  {done && <div style={{ width: 14, height: 14, borderRadius: 999, background: "rgba(31,138,91,.2)", color: "#34C759", display: "flex", alignItems: "center", justifyContent: "center" }}><window.Ico name="check" size={9} stroke={3} /></div>}
                  {live && <window.BreathDot size={6} color="var(--gold)" />}
                  {!done && !live && <div style={{ width: 14, height: 14, borderRadius: 999, border: "1px solid rgba(255,255,255,.12)" }} />}
                  <span style={{ color: done || live ? "var(--bg)" : "#5A6166" }}>{t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {progress >= 5 && (
        <button className="btn gold lg" style={{ marginTop: 24, width: "100%", justifyContent: "center" }} onClick={onNext}>
          Listo, muéstrame mi negocio <window.Ico name="arrowRight" size={14} />
        </button>
      )}

      <div style={{ marginTop: 18, padding: "10px 14px", background: "rgba(31,138,91,.08)", borderRadius: 8, fontSize: 11.5, color: "#A8E0C9", display: "flex", alignItems: "center", gap: 8 }}>
        <window.Ico name="shield" size={12} />
        <span>Banca abierta certificada. Solo veo. No toco. No guardo contraseñas.</span>
      </div>
    </div>
  );
};

const StepThree = ({ onFinish }) => {
  React.useEffect(() => {
    const t = setTimeout(onFinish, 2400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ maxWidth: 540, width: "100%", textAlign: "center" }} className="anim-in">
      <div className="breathe" style={{
        width: 88, height: 88, margin: "0 auto",
        borderRadius: 999, background: "var(--gold)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <window.Ico name="sparkle" size={36} color="var(--ink)" />
      </div>
      <h1 className="display-m" style={{ color: "var(--bg)", marginTop: 28, fontSize: 56 }}>
        Tu negocio<br/>
        está <em style={{ color: "var(--gold)" }}>vivo</em>.
      </h1>
      <p className="body-l" style={{ color: "#A8B0B3", marginTop: 14 }}>
        Organicé 47 transacciones, calculé tu ITBMS, y te tengo una vista lista.
      </p>
    </div>
  );
};

Object.assign(window, { Onboarding });
