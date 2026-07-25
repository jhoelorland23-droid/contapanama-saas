// App root — login → onboarding → screens.

const App = () => {
  const { user, view, onboarding } = window.useApp();

  if (!user) return <Login />;
  if (onboarding) return <window.Onboarding />;

  if (view === "hoy") return <window.ScreenHoy />;
  if (view === "plata") return <window.ScreenPlata />;
  if (view === "impuestos") return <window.ScreenImpuestos />;
  if (view === "documentos") return <window.ScreenDocumentos />;
  if (view === "cpa") return <window.ScreenCpa />;

  return <window.ScreenHoy />;
};

const Login = () => {
  const { login } = window.useApp();
  const [email, setEmail] = React.useState("roberto@roasteriadelcasco.pa");
  const [pwd, setPwd] = React.useState("Demo2026!");
  const [mode, setMode] = React.useState("login");

  const submit = () => {
    login(
      { email, nombre: "Roberto Vargas", iniciales: "RV", despacho: "Roastería del Casco" },
      { skipOnboarding: mode === "login" }
    );
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr 1fr", background: "var(--bg)" }}>

      {/* Left: form */}
      <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 56 }}>
          <window.Logo size={32} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>ContaPanamá</div>
            <div style={{ fontSize: 10.5, color: "var(--muted-2)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 1 }}>SO Financiero · v3</div>
          </div>
        </div>

        <div style={{ maxWidth: 380 }}>
          <div className="eyebrow teal with-bar">{mode === "login" ? "Bienvenido de nuevo" : "Empieza gratis"}</div>
          <h1 className="display-l" style={{ fontSize: 56, marginTop: 14 }}>
            {mode === "login" ? <>Tu negocio<br/>te espera.</> : <>Empieza<br/>tranquilo.</>}
          </h1>
          <p className="body-l" style={{ marginTop: 12, color: "var(--muted)" }}>
            {mode === "login"
              ? "Continuá donde lo dejaste — tu marzo va +18%."
              : "14 días gratis, sin tarjeta. Después decides."}
          </p>

          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Correo">
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="vos@tunegocio.pa" style={{ width: "100%" }} />
            </Field>
            <Field label="Contraseña">
              <input value={pwd} onChange={e => setPwd(e.target.value)} type="password" style={{ width: "100%" }} />
            </Field>

            <button className="btn ink lg" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={submit}>
              {mode === "login" ? "Entrar" : "Crear cuenta"} <window.Ico name="arrowRight" size={14} />
            </button>

            <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--surface)", borderRadius: 8, fontSize: 11.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <window.Ico name="zap" size={12} color="var(--gold)" />
              <span><b style={{ color: "var(--ink)" }}>Demo:</b> credenciales precargadas. Dale entrar.</span>
            </div>

            <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: "var(--muted)" }}>
              {mode === "login" ? (
                <>¿Primera vez? <span style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }} onClick={() => setMode("register")}>Crear cuenta gratis</span></>
              ) : (
                <>¿Ya tienes cuenta? <span style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }} onClick={() => setMode("login")}>Entrar</span></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: visual */}
      <div style={{
        background: "linear-gradient(160deg, #0F4C4A 0%, #0B3937 100%)",
        position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "44px 56px", color: "#FAF8F3"
      }}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: .12 }}>
          {[...Array(24)].map((_, i) => (
            <path key={i} d={`M 0 ${i * 40} Q 200 ${i * 40 - 24} 400 ${i * 40} T 800 ${i * 40}`}
              fill="none" stroke="#C9A75C" strokeWidth="0.5" />
          ))}
        </svg>

        <div style={{ position: "relative" }}>
          <div className="eyebrow with-bar" style={{ color: "var(--gold)" }}>· Tranquilidad</div>
        </div>

        <div style={{ position: "relative", maxWidth: 460 }}>
          <h2 className="serif" style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            "Si te fiscalizan mañana,<br/>
            <em style={{ color: "var(--gold)" }}>estás listo</em>."
          </h2>
          <p style={{ marginTop: 18, color: "#C8CFD2", maxWidth: 380, fontSize: 14, lineHeight: 1.55 }}>
            La promesa que persigue cada decisión del producto. No tienes que entender contabilidad — el sistema piensa por ti.
          </p>
        </div>

        <div style={{ position: "relative", display: "flex", gap: 20, alignItems: "center", fontSize: 11, color: "#7A8285" }}>
          <window.Pill tone="ghost" style={{ borderColor: "rgba(255,255,255,.1)", color: "#A8B0B3" }}>DGI integrado</window.Pill>
          <window.Pill tone="ghost" style={{ borderColor: "rgba(255,255,255,.1)", color: "#A8B0B3" }}>Banca abierta</window.Pill>
          <window.Pill tone="ghost" style={{ borderColor: "rgba(255,255,255,.1)", color: "#A8B0B3" }}>Tu CPA conectado</window.Pill>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <window.AppProvider><App /></window.AppProvider>
);
