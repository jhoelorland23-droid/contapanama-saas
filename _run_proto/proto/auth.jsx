// Login + Register screen.

const AuthScreen = () => {
  const { login, register, tweaks, isLive, showToast } = window.useApp();
  const [mode, setMode] = React.useState("login");
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === "login") {
        await login(email, pwd);
        showToast(isLive ? "Conectado al backend ✓" : "Bienvenido de vuelta", { icon: "check" });
      } else {
        await register(nombre || "Usuario", email, pwd);
        showToast("¡Cuenta creada!", { icon: "check" });
      }
    } catch (e) {
      setErr(e.message || "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid", gridTemplateColumns: "1.05fr 1fr",
      background: "var(--bg)"
    }}>
      {/* Left: form */}
      <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 56 }}>
          <window.Logo size={32} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>ContaPanamá</div>
            <div className="xs">v3 · Beta</div>
          </div>
        </div>

        <div style={{ maxWidth: 380 }}>
          <div className="xs" style={{ color: "var(--teal)" }}>· {mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</div>
          <h1 className="serif" style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "12px 0 8px" }}>
            {mode === "login" ? <>Entrar al<br/>despacho.</> : <>Tu despacho<br/>moderno.</>}
          </h1>
          <div style={{ marginTop: 28 }}>
            {mode === "register" && (
              <window.FormField label="Nombre completo">
                <input value={nombre} onChange={e => setNombre(e.target.value)} className="inp" placeholder="Ej: Juan Pérez CPA" />
              </window.FormField>
            )}
            <window.FormField label="Correo electrónico">
              <input value={email} onChange={e => setEmail(e.target.value)} className="inp" type="email" placeholder="contador@tudespacho.pa" />
            </window.FormField>
            <window.FormField label="Contraseña" hint={mode === "register" ? "Mínimo 8 caracteres, 1 mayúscula y 1 número" : null}>
              <div style={{ position: "relative" }}>
                <input value={pwd} onChange={e => setPwd(e.target.value)} className="inp" type="password" style={{ paddingRight: 38 }} />
                <window.Ico name="eye" size={15} color="var(--muted-2)" style={{ position: "absolute", right: 12, top: 12, cursor: "pointer" }} />
              </div>
            </window.FormField>

            <button className="btn teal" disabled={busy} onClick={submit} style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 13.5, marginTop: 14 }}>
              {busy ? "Procesando…" : <>{mode === "login" ? "Iniciar sesión" : "Crear mi cuenta"}<window.Ico name="arrowRight" size={14} /></>}
            </button>

            {err && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red)", borderRadius: 8, fontSize: 12.5, color: "#7B2218", display: "flex", alignItems: "center", gap: 8 }}>
                <window.Ico name="alert" size={14} color="var(--red)" />
                <span style={{ flex: 1 }}>{err}</span>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "var(--muted)" }}>
              {mode === "login" ? (
                <>¿Primera vez? <span onClick={() => setMode("register")} style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }}>Crear cuenta gratis</span></>
              ) : (
                <>¿Ya tienes cuenta? <span onClick={() => setMode("login")} style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }}>Inicia sesión</span></>
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
        {/* abstract canal-water motif */}
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: .12 }}>
          {[...Array(20)].map((_, i) => (
            <path key={i} d={`M 0 ${i * 50} Q 200 ${i * 50 - 30} 400 ${i * 50} T 800 ${i * 50}`}
              fill="none" stroke="#C9A75C" strokeWidth="0.5" />
          ))}
        </svg>

        <div style={{ position: "relative", zIndex: 2 }}>
          <span className="pill" style={{ background: "rgba(201,167,92,.18)", color: "#E8D9AE", border: "1px solid rgba(201,167,92,.3)" }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: "#C9A75C" }} />· Hecho en Panamá
          </span>
        </div>

        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="serif" style={{ fontSize: 56, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Contabilidad<br/>limpia.<br/><em>Tuya.</em>
          </div>
          <div style={{ marginTop: 22, fontSize: 14, color: "#A9B2AF", maxWidth: 380, lineHeight: 1.55 }}>
            Diario, fiscal, recibos y facturación electrónica — en un solo lugar, hecho para CPAs de Panamá.
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2 }} />
      </div>
    </div>
  );
};

Object.assign(window, { AuthScreen });
