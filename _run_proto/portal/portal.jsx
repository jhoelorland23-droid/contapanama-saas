// ContaPanamá — Portal del cliente
// Mini-app separada de la del CPA. Auth propio (portal_token).
// Vistas: Aceptar invitación · Login · Dashboard (números) · Subir recibo · Mensajes.

const LS_TOKEN = "cp3_portal_token";
const LS_ME    = "cp3_portal_me";
const API_BASE = "__API_BASE__"; // sustituido en build

// ── API client con token de portal ────────────────────────────────────────
const portalFetch = async (path, opts = {}) => {
  const token = localStorage.getItem(LS_TOKEN);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${API_BASE}/portal${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};
const apiGet  = (p)    => portalFetch(p);
const apiPost = (p, b) => portalFetch(p, { method: "POST", body: JSON.stringify(b) });

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt$ = (n) => "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
const fmtPer = (p) => {
  if (!p || p.length < 7) return "—";
  const m = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${m[parseInt(p.slice(5,7),10)-1] || "—"} ${p.slice(0,4)}`;
};
const getUrlParam = (k) => new URLSearchParams(window.location.search).get(k);

// ── Root component ────────────────────────────────────────────────────────
const PortalApp = () => {
  const initialToken = localStorage.getItem(LS_TOKEN);
  const initialMe = (() => { try { return JSON.parse(localStorage.getItem(LS_ME) || "null"); } catch { return null; } })();
  const inviteToken = getUrlParam("token");
  const path = window.location.pathname;
  const isAceptar = /\/portal\/aceptar/.test(path) || (inviteToken && !initialToken);

  const [token, setToken] = React.useState(initialToken);
  const [me, setMe] = React.useState(initialMe);
  const [toast, setToast] = React.useState(null);

  const showToast = (msg, opts = {}) => {
    setToast({ msg, ok: opts.ok });
    setTimeout(() => setToast(null), opts.duration || 2400);
  };

  const setAuth = (newToken, newMe) => {
    localStorage.setItem(LS_TOKEN, newToken);
    if (newMe) localStorage.setItem(LS_ME, JSON.stringify(newMe));
    setToken(newToken); setMe(newMe);
    // limpia el token de la URL si vino por ?token=
    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, "/portal/");
    }
  };

  const logout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_ME);
    setToken(null); setMe(null);
    window.history.replaceState({}, document.title, "/portal/");
  };

  // Cargar /me después de login si me es null
  React.useEffect(() => {
    if (token && !me) {
      apiGet("/me")
        .then(m => { setMe(m); localStorage.setItem(LS_ME, JSON.stringify(m)); })
        .catch(() => logout());
    }
  }, [token]);

  let screen;
  if (!token && isAceptar && inviteToken) {
    screen = <Aceptar inviteToken={inviteToken} onAuth={setAuth} showToast={showToast} />;
  } else if (!token) {
    screen = <Login onAuth={setAuth} showToast={showToast} />;
  } else {
    screen = <Dashboard me={me} onLogout={logout} showToast={showToast} />;
  }

  return (
    <>
      {screen}
      {toast && <div className="toast">{toast.msg}</div>}
    </>
  );
};

// ── Aceptar invitación ───────────────────────────────────────────────────
const Aceptar = ({ inviteToken, onAuth, showToast }) => {
  const [pwd, setPwd] = React.useState("");
  const [pwd2, setPwd2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const submit = async () => {
    setErr(null);
    if (pwd.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pwd !== pwd2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const r = await apiPost("/auth/aceptar", { token: inviteToken, password: pwd });
      onAuth(r.token, null);
      showToast("¡Bienvenido a tu portal!");
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <Logo />
      <h1 className="serif">Bienvenido.</h1>
      <p className="lede">Tu contador te dio acceso a este portal. Aquí ves tus números y le envías documentos sin tener que escribir un correo.</p>
      <p className="lede" style={{ marginTop: 8 }}>Crea una contraseña para entrar la próxima vez.</p>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
        <input className="inp" type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus />
      </Field>
      <Field label="Confirma contraseña">
        <input className="inp" type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
      </Field>
      {err && <ErrBox>{err}</ErrBox>}
      <button className="btn teal" disabled={busy} onClick={submit} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
        {busy ? "Activando…" : "Entrar al portal"}
      </button>
    </Card>
  );
};

// ── Login ────────────────────────────────────────────────────────────────
const Login = ({ onAuth, showToast }) => {
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await apiPost("/auth/login", { email: email.trim().toLowerCase(), password: pwd });
      onAuth(r.token, null);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <Logo />
      <h1 className="serif">Entra a tu portal.</h1>
      <p className="lede">El espacio seguro entre tú y tu contador.</p>
      <Field label="Correo">
        <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field label="Contraseña">
        <input className="inp" type="password" value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
      </Field>
      {err && <ErrBox>{err}</ErrBox>}
      <button className="btn teal" disabled={busy} onClick={submit} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
        {busy ? "Entrando…" : "Iniciar sesión"}
      </button>
      <p style={{ marginTop: 18, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
        ¿No tienes acceso? Pídele a tu contador que te envíe una invitación.
      </p>
    </Card>
  );
};

// ── Dashboard (post-login) ───────────────────────────────────────────────
const Dashboard = ({ me, onLogout, showToast }) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("resumen");
  const fileRef = React.useRef(null);
  const [subiendo, setSubiendo] = React.useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setData(await apiGet("/dashboard")); }
    catch (e) { showToast("No se pudo cargar: " + e.message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { if (me) cargar(); }, [me]);

  const subirRecibo = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const token = localStorage.getItem(LS_TOKEN);
      const res = await fetch(`${API_BASE}/portal/recibos/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      showToast("Recibo enviado a tu contador ✓");
    } catch (e) { showToast(e.message); }
    finally { setSubiendo(false); }
  };

  if (!me) return <Card><div style={{ textAlign: "center", color: "var(--muted)" }}>Cargando…</div></Card>;

  const fin = data?.financiero;
  const porCobrar = data?.por_cobrar;
  const utilidad = fin ? (+fin.ingresos - +fin.gastos) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Topbar */}
      <div style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)", padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <Logo small />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{me.cliente_nombre}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Portal del cliente · Atendido por {me.cpa_nombre || "tu contador"}</div>
        </div>
        <button className="btn ghost" onClick={onLogout} style={{ fontSize: 12 }}>Salir</button>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--line)", padding: "0 16px", display: "flex", gap: 4, overflowX: "auto", whiteSpace: "nowrap" }}>
        <Tab active={tab === "resumen"} onClick={() => setTab("resumen")}>Resumen</Tab>
        <Tab active={tab === "facturas"} onClick={() => setTab("facturas")}>Facturas</Tab>
        <Tab active={tab === "mensajes"} onClick={() => setTab("mensajes")}>Mensajes</Tab>
        <Tab active={tab === "subir"} onClick={() => setTab("subir")}>Enviar recibo</Tab>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px" }}>
        {tab === "resumen" && (
          loading ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Cargando tus números…</div> : (
            <>
              <div className="xs" style={{ color: "var(--teal)" }}>· Tu período · {fmtPer(data?.periodo)}</div>
              <div style={{ marginTop: 8, padding: "20px 22px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>Utilidad antes de impuestos</div>
                <div className="serif num" style={{ fontSize: 44, lineHeight: 1, marginTop: 6, letterSpacing: "-0.02em" }}>{fmt$(utilidad)}</div>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div className="xs" style={{ color: "var(--muted-2)" }}>Ingresos</div>
                    <div className="num mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: "var(--green)" }}>{fmt$(fin?.ingresos)}</div>
                  </div>
                  <div>
                    <div className="xs" style={{ color: "var(--muted-2)" }}>Gastos</div>
                    <div className="num mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{fmt$(fin?.gastos)}</div>
                  </div>
                </div>
              </div>

              {porCobrar && +porCobrar.num > 0 && (
                <div style={{ marginTop: 14, padding: "16px 20px", background: "var(--teal-50)", borderRadius: 10, border: "1px solid #BCD7D2" }}>
                  <div className="xs" style={{ color: "var(--teal-700)" }}>· Por cobrar</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>
                    Tienes <b className="num mono">{fmt$(porCobrar.pendiente)}</b> en <b>{porCobrar.num} factura{porCobrar.num == 1 ? "" : "s"}</b> por cobrar.
                  </div>
                </div>
              )}

              <div style={{ marginTop: 22, padding: "14px 16px", background: "var(--surface)", borderRadius: 8, fontSize: 12, color: "var(--muted)" }}>
                Estos números los actualiza <b>{me.cpa_nombre || "tu contador"}</b> conforme registra tus movimientos. Si ves algo raro, escríbele.
              </div>
            </>
          )
        )}

        {tab === "facturas" && <Facturas showToast={showToast} />}

        {tab === "mensajes" && <Chat me={me} showToast={showToast} />}

        {tab === "subir" && (
          <>
            <div className="xs" style={{ color: "var(--teal)" }}>· Enviar un recibo</div>
            <p className="lede" style={{ marginTop: 10 }}>
              Tira aquí cualquier factura, ticket o recibo que tengas. Tu contador lo recibe en segundos y se encarga de clasificarlo.
            </p>
            <input ref={fileRef} type="file" accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={e => { subirRecibo(e.target.files[0]); e.target.value = ""; }} />
            <button className="btn teal" disabled={subiendo} onClick={() => fileRef.current && fileRef.current.click()}
              style={{ marginTop: 16, width: "100%", justifyContent: "center", padding: "14px" }}>
              {subiendo ? "Enviando…" : "Elegir archivo y enviar"}
            </button>
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted-2)", textAlign: "center" }}>
              Foto del celular, PDF, captura de pantalla — todo sirve.
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Facturas del cliente ─────────────────────────────────────────────────
const Facturas = ({ showToast }) => {
  const [facturas, setFacturas] = React.useState(null);

  React.useEffect(() => {
    apiGet("/facturas")
      .then(r => setFacturas(r.data || []))
      .catch(e => { showToast(e.message); setFacturas([]); });
  }, []);

  if (facturas === null) return <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Cargando tus facturas…</div>;

  return (
    <>
      <div className="xs" style={{ color: "var(--teal)" }}>· Tus facturas</div>
      {facturas.length === 0 ? (
        <div style={{ marginTop: 14, padding: "36px 20px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Aún no tienes facturas emitidas. Cuando tu contador te facture, aparecerán aquí.
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {facturas.map(f => (
            <div key={f.id} style={{
              padding: "14px 16px", background: "var(--paper)", border: "1px solid var(--line)",
              borderRadius: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{f.numero || "(sin número)"}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  {f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="num mono" style={{ fontSize: 16, fontWeight: 700 }}>{fmt$(f.total)}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted-2)" }}>ITBMS {fmt$(f.itbms)}</div>
              </div>
              <span style={{
                padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                background: f.estado === "autorizada" ? "var(--green-bg)" : "var(--red-bg)",
                color: f.estado === "autorizada" ? "#0E5A3F" : "#7B2218"
              }}>{f.estado === "autorizada" ? "AUTORIZADA" : "ANULADA"}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ── Chat con el contador ─────────────────────────────────────────────────
const Chat = ({ me, showToast }) => {
  const [msgs, setMsgs] = React.useState([]);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [cargando, setCargando] = React.useState(true);
  const endRef = React.useRef(null);

  const cargar = async () => {
    try { const r = await apiGet("/mensajes"); setMsgs(r.data || []); }
    catch (e) { showToast(e.message); }
    finally { setCargando(false); }
  };
  React.useEffect(() => { cargar(); const id = setInterval(cargar, 10000); return () => clearInterval(id); }, []);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      const nuevo = await apiPost("/mensajes", { contenido: t });
      setMsgs(m => [...m, nuevo]);
      setTexto("");
    } catch (e) { showToast(e.message); }
    finally { setEnviando(false); }
  };

  return (
    <>
      <div className="xs" style={{ color: "var(--teal)" }}>· Conversación con {me?.cpa_nombre || "tu contador"}</div>
      <div style={{ marginTop: 12, padding: "14px 16px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, height: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {cargando ? (
          <div style={{ textAlign: "center", color: "var(--muted)", margin: "auto" }}>Cargando…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted-2)", margin: "auto", fontSize: 13 }}>
            Aún no hay mensajes. Escribe el primero para preguntarle algo a tu contador.
          </div>
        ) : msgs.map(m => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.remitente === "cliente" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%",
              padding: "8px 12px",
              borderRadius: m.remitente === "cliente" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              background: m.remitente === "cliente" ? "var(--teal)" : "var(--surface)",
              color: m.remitente === "cliente" ? "#FAF8F3" : "var(--ink)",
              fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.45
            }}>
              {m.contenido}
              <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 4 }}>
                {new Date(m.created_at).toLocaleString("es-PA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input className="inp" value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviar()}
          placeholder="Escribe un mensaje…" disabled={enviando} style={{ flex: 1 }} />
        <button className="btn teal" disabled={enviando || !texto.trim()} onClick={enviar}>Enviar</button>
      </div>
    </>
  );
};

// ── Componentes UI ───────────────────────────────────────────────────────
const Card = ({ children }) => (
  <div style={{
    minHeight: "100vh", background: "var(--bg)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 20
  }}>
    <div style={{
      width: "100%", maxWidth: 440, background: "var(--paper)",
      border: "1px solid var(--line)", borderRadius: 16, padding: "40px 32px",
      boxShadow: "0 20px 60px rgba(0,0,0,.06)"
    }}>{children}</div>
  </div>
);

const Logo = ({ small }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: small ? 0 : 32 }}>
    <div style={{
      width: small ? 28 : 36, height: small ? 28 : 36, borderRadius: small ? 6 : 8,
      background: "var(--ink)", color: "var(--gold)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Instrument Serif, serif", fontSize: small ? 18 : 22, fontWeight: 400
    }}>₵</div>
    <div>
      <div style={{ fontWeight: 700, fontSize: small ? 13 : 15 }}>ContaPanamá</div>
      {!small && <div className="xs">Portal del cliente</div>}
    </div>
  </div>
);

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label className="lbl">{label}</label>
    {children}
    {hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{hint}</div>}
  </div>
);

const ErrBox = ({ children }) => (
  <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red)", borderRadius: 8, fontSize: 12.5, color: "#7B2218" }}>{children}</div>
);

const Tab = ({ active, onClick, children }) => (
  <div onClick={onClick} style={{
    padding: "12px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    color: active ? "var(--ink)" : "var(--muted)",
    borderBottom: active ? "2px solid var(--teal)" : "2px solid transparent",
    transition: "color 120ms, border-color 120ms"
  }}>{children}</div>
);

// ── Bootstrap ────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(<PortalApp />);
