// Onboarding wizard — 4 steps that the user said are missing.
// Step 1: nombre del despacho / logo
// Step 2: configurar plan de cuentas (preset Panamá DGI o desde cero)
// Step 3: invitar equipo
// Step 4: primer cliente o saltar

const Onboarding = () => {
  const { onboarding, setOnboarding, tweaks, setTweak, showToast } = window.useApp();
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({
    firmName: tweaks.firmName || "Mi Despacho",
    plan: "dgi-pa",
    invites: [{ email: "", rol: "asistente" }],
    firstClient: { nombre: "", ruc: "", tipo: "jurídica" },
  });

  if (!onboarding) return null;

  const STEPS = [
    { tag: "Tu despacho", desc: "Cuéntanos cómo se llama tu firma" },
    { tag: "Plan de cuentas", desc: "Arranca con un catálogo panameño preconfigurado" },
    { tag: "Invita a tu equipo", desc: "Hasta 3 personas en plan Estudio" },
    { tag: "Listo para empezar", desc: "Tu primer cliente — o salta este paso" },
  ];

  const next = () => {
    if (step < 3) setStep(step + 1);
    else {
      setTweak("firmName", data.firmName);
      setTweak("showOnboarding", false);
      setOnboarding(false);
      showToast("¡Despacho listo! Empieza con el dashboard.", { icon: "check", duration: 3500 });
    }
  };
  const back = () => setStep(s => Math.max(0, s - 1));
  const skip = () => {
    setTweak("showOnboarding", false);
    setOnboarding(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "var(--bg)", overflow: "auto",
      display: "flex", flexDirection: "column"
    }}>
      {/* Top */}
      <div style={{
        padding: "20px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid var(--line)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <window.Logo size={28} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>ContaPanamá</div>
        </div>
        <div onClick={skip} style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
          Saltar configuración →
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>
        {/* Step rail */}
        <div style={{ padding: "44px 36px", background: "var(--surface)", borderRight: "1px solid var(--line)" }}>
          <div className="xs" style={{ color: "var(--teal)" }}>· Configuración</div>
          <h2 className="serif" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 8, fontWeight: 400 }}>
            Vamos a dejar<br/>tu despacho listo<br/>en 2 minutos.
          </h2>

          <div style={{ marginTop: 36 }}>
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", alignItems: "flex-start" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                    background: done ? "var(--teal)" : active ? "var(--ink)" : "transparent",
                    border: !done && !active ? "1.5px solid var(--line)" : "0",
                    color: "#FAF8F3", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, marginTop: 2
                  }}>
                    {done ? <window.Ico name="check" size={12} stroke={2.4} /> : i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? "var(--ink)" : done ? "var(--muted)" : "var(--muted-2)" }}>{s.tag}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            marginTop: 50, padding: "14px 16px",
            background: "var(--paper)", borderRadius: 10, border: "1px solid var(--line)",
            fontSize: 12, color: "var(--muted)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <window.Ico name="sparkle" size={13} color="var(--gold)" />
              <b style={{ color: "var(--ink)" }}>Tip</b>
            </div>
            Lo que configures aquí lo puedes cambiar después desde Ajustes. Nada queda en piedra.
          </div>
        </div>

        {/* Step content */}
        <div style={{ overflow: "auto", padding: "44px 60px", display: "flex", flexDirection: "column" }}>
          <div style={{ maxWidth: 580, flex: 1 }}>
            {step === 0 && <Step1 data={data} setData={setData} />}
            {step === 1 && <Step2 data={data} setData={setData} />}
            {step === 2 && <Step3 data={data} setData={setData} />}
            {step === 3 && <Step4 data={data} setData={setData} />}
          </div>

          {/* Footer actions */}
          <div style={{
            marginTop: 36, paddingTop: 22, borderTop: "1px solid var(--line)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>Paso {step + 1} de 4</div>
            <div style={{ display: "flex", gap: 10 }}>
              {step > 0 && (
                <button className="btn ghost" onClick={back}>
                  <window.Ico name="arrowLeft" size={13} />Atrás
                </button>
              )}
              <button className="btn teal" onClick={next}>
                {step === 3 ? "Entrar al despacho" : "Siguiente"}<window.Ico name="arrowRight" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step1 = ({ data, setData }) => (
  <>
    <div className="xs" style={{ color: "var(--teal)" }}>· Paso 1</div>
    <h2 className="serif" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 8, fontWeight: 400 }}>
      ¿Cómo se llama tu despacho?
    </h2>
    <p className="lede" style={{ marginTop: 10 }}>
      Es lo que verán tus clientes en facturas, reportes y en el portal. Lo puedes cambiar después.
    </p>

    <div style={{ marginTop: 28 }}>
      <window.FormField label="Nombre del despacho">
        <input className="inp" value={data.firmName} onChange={e => setData({ ...data, firmName: e.target.value })}
          placeholder="Méndez & Asociados" autoFocus />
      </window.FormField>
      <window.FormField label="Logo (opcional)">
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 16px", border: "2px dashed var(--line)", borderRadius: 10,
          cursor: "pointer", background: "var(--paper)"
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--teal-50)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <window.Ico name="upload" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Arrastra tu logo aquí</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>PNG o SVG · cuadrado · mínimo 200×200px</div>
          </div>
          <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700 }}>Seleccionar →</span>
        </div>
      </window.FormField>

      <div style={{ marginTop: 18, padding: "14px 18px", background: "var(--surface)", borderRadius: 10 }}>
        <div className="xs">Preview en facturas</div>
        <div style={{ marginTop: 10, padding: "16px 18px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--ink)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif, serif", fontSize: 17 }}>
            {data.firmName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("") || "M"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{data.firmName || "Tu Despacho"}</div>
            <div className="xs" style={{ margin: 0 }}>Factura electrónica · FE-2025-001</div>
          </div>
          <div className="serif num" style={{ fontSize: 22 }}>$1,500.00</div>
        </div>
      </div>
    </div>
  </>
);

const Step2 = ({ data, setData }) => {
  const PLANS = [
    { id: "dgi-pa", t: "Plan DGI Panamá", d: "Catálogo basado en NIIF + cuentas locales DGI. 142 cuentas. Recomendado.", reco: true },
    { id: "blank", t: "En blanco", d: "Empieza con un catálogo mínimo de 12 cuentas y construye desde ahí." },
    { id: "import", t: "Importar desde Excel", d: "Sube tu plan de cuentas actual. Lo mapeamos automáticamente." },
  ];
  return (
    <>
      <div className="xs" style={{ color: "var(--teal)" }}>· Paso 2</div>
      <h2 className="serif" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 8, fontWeight: 400 }}>
        Elige tu plan de cuentas.
      </h2>
      <p className="lede" style={{ marginTop: 10 }}>
        Lo configuras una vez y se aplica a todos tus clientes. Puedes editar cada cuenta después.
      </p>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
        {PLANS.map(p => {
          const sel = data.plan === p.id;
          return (
            <div key={p.id} onClick={() => setData({ ...data, plan: p.id })}
              style={{
                padding: "16px 18px", borderRadius: 10, cursor: "pointer",
                border: sel ? "2px solid var(--ink)" : "1px solid var(--line)",
                background: sel ? "var(--surface)" : "var(--paper)",
                display: "flex", gap: 14, alignItems: "flex-start"
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                border: "2px solid " + (sel ? "var(--ink)" : "var(--line)"),
                background: "var(--paper)", padding: 3, marginTop: 1, flexShrink: 0
              }}>
                {sel && <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--ink)" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.t}</div>
                  {p.reco && <window.Pill tone="gold">Recomendado</window.Pill>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{p.d}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 22, padding: "12px 16px", background: "var(--teal-50)", borderRadius: 10, fontSize: 12, color: "var(--teal-700)", display: "flex", alignItems: "center", gap: 8 }}>
        <window.Ico name="sparkle" size={13} color="var(--teal)" />
        <span><b>Incluye automáticamente:</b> ITBMS débito (2201), ITBMS crédito (1130), retenciones, anticipos y todas las cuentas que la DGI exige en el F.430.</span>
      </div>
    </>
  );
};

const Step3 = ({ data, setData }) => {
  const addRow = () => setData({ ...data, invites: [...data.invites, { email: "", rol: "asistente" }] });
  const updateRow = (i, k, v) => {
    const next = data.invites.slice();
    next[i] = { ...next[i], [k]: v };
    setData({ ...data, invites: next });
  };
  const remove = (i) => setData({ ...data, invites: data.invites.filter((_, k) => k !== i) });

  return (
    <>
      <div className="xs" style={{ color: "var(--teal)" }}>· Paso 3</div>
      <h2 className="serif" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 8, fontWeight: 400 }}>
        Invita a tu equipo.
      </h2>
      <p className="lede" style={{ marginTop: 10 }}>
        Cada persona tendrá su login y los permisos según su rol. Puedes saltar este paso.
      </p>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {data.invites.map((inv, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px 32px", gap: 8, alignItems: "center" }}>
            <input className="inp" value={inv.email} onChange={e => updateRow(i, "email", e.target.value)} placeholder="colega@tudespacho.pa" type="email" />
            <select className="inp" value={inv.rol} onChange={e => updateRow(i, "rol", e.target.value)}>
              <option value="admin">Administrador</option>
              <option value="cpa">CPA</option>
              <option value="asistente">Asistente</option>
              <option value="viewer">Solo lectura</option>
            </select>
            {data.invites.length > 1 && (
              <button className="btn ghost" onClick={() => remove(i)} style={{ padding: "8px 10px" }}>
                <window.Ico name="x" size={13} color="var(--muted)" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="btn ghost" onClick={addRow} style={{ marginTop: 12 }}>
        <window.Ico name="plus" size={13} />Agregar otra persona
      </button>

      <div style={{ marginTop: 28, padding: "14px 16px", background: "var(--surface)", borderRadius: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
        <b style={{ color: "var(--ink)" }}>Roles incluidos:</b><br/>
        · <b>Administrador</b>: control total + facturación<br/>
        · <b>CPA</b>: contabilidad + firmar FE + reportes<br/>
        · <b>Asistente</b>: capturar transacciones, OCR, sin firmar<br/>
        · <b>Solo lectura</b>: ver dashboards y reportes
      </div>
    </>
  );
};

const Step4 = ({ data, setData }) => (
  <>
    <div className="xs" style={{ color: "var(--teal)" }}>· Paso 4 · Último</div>
    <h2 className="serif" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 8, fontWeight: 400 }}>
      ¿Quieres cargar tu<br/>primer cliente?
    </h2>
    <p className="lede" style={{ marginTop: 10 }}>
      Opcional. Lo puedes hacer cuando quieras desde Clientes → Nuevo.
    </p>

    <div style={{ marginTop: 24 }}>
      <window.FormField label="Razón social / Nombre">
        <input className="inp" value={data.firstClient.nombre} onChange={e => setData({ ...data, firstClient: { ...data.firstClient, nombre: e.target.value } })} placeholder="Constructora Istmo S.A." />
      </window.FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <window.FormField label="RUC">
          <input className="inp" value={data.firstClient.ruc} onChange={e => setData({ ...data, firstClient: { ...data.firstClient, ruc: e.target.value } })} placeholder="155-789-1" />
        </window.FormField>
        <window.FormField label="Tipo">
          <select className="inp" value={data.firstClient.tipo} onChange={e => setData({ ...data, firstClient: { ...data.firstClient, tipo: e.target.value } })}>
            <option value="jurídica">Persona jurídica</option>
            <option value="natural">Persona natural</option>
          </select>
        </window.FormField>
      </div>
    </div>

    <div style={{ marginTop: 28, padding: "20px 24px", background: "var(--ink)", color: "#FAF8F3", borderRadius: 14, display: "flex", gap: 18, alignItems: "center" }}>
      <window.Ico name="sparkle" size={26} color="var(--gold)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Tu despacho está listo</div>
        <div style={{ color: "#A9B2AF", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
          Lo siguiente: sube algunos recibos a la Bandeja OCR para ver cómo la IA los clasifica. O empieza a registrar transacciones manualmente.
        </div>
      </div>
    </div>
  </>
);

Object.assign(window, { Onboarding });
