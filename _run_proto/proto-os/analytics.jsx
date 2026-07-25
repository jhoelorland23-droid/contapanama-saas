// Analytics + Documents + Automations + Settings — supporting screens.

const ScreenAnalytics = () => (
  <window.Shell active="analytics" topbar={
    <window.Topbar crumbs={["Insights", "Analytics"]} hint="Inteligencia de negocio · 12 meses"
      action={<button className="btn ghost"><window.Ico name="download" size={13} />Exportar PDF</button>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <div className="anim-in d1" style={{ marginBottom: 28 }}>
        <div className="eyebrow">· Inteligencia de negocio</div>
        <h1 className="display-l" style={{ marginTop: 10 }}>
          La firma <span style={{ color: "var(--gold)" }}>crece 8.4×</span> año contra año.<br/>
          <span style={{ color: "var(--text-3)" }}>$3.2M en flujo gestionado.</span>
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <BigStat label="Flujo gestionado YTD" value="$3.2M" delta="+842%" />
        <BigStat label="Clientes promedio" value="42.5" delta="+14" />
        <BigStat label="Retención" value="100%" delta="12 meses" tone="green" />
        <BigStat label="LTV cliente" value="$28k" delta="+22%" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--hairline)" }}>
            <div className="eyebrow">· Crecimiento</div>
            <div className="h2" style={{ marginTop: 6 }}>Ingresos vs Clientes</div>
          </div>
          <BigChart />
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <div className="eyebrow">· Industrias</div>
          <div className="h2" style={{ marginTop: 6, marginBottom: 14 }}>Mix de clientes</div>
          {[
            ["Comercio", 22, "var(--gold)"],
            ["Restaurantes", 18, "var(--orange)"],
            ["Servicios", 16, "var(--violet)"],
            ["Construcción", 14, "var(--blue)"],
            ["Tecnología", 12, "var(--green)"],
            ["Otros", 18, "var(--text-4)"],
          ].map(([t, pct, c], i) => (
            <div key={t} style={{ padding: "10px 0", borderBottom: i < 5 ? "1px solid var(--hairline)" : "0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "var(--text-2)" }}>{t}</span>
                <span className="mono" style={{ color: "var(--text-4)" }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "var(--glass-2)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${pct * 4}%`, height: "100%", background: c, transition: "width .8s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </window.Shell>
);

const ScreenDocuments = () => (
  <window.Shell active="documents" topbar={
    <window.Topbar crumbs={["Gestión", "Documentos"]} hint="Gestión documental · 12,400 archivos"
      action={<>
        <button className="btn ghost"><window.Ico name="upload" size={13} />Subir</button>
        <button className="btn gold"><window.Ico name="plus" size={13} />Nueva carpeta</button>
      </>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <h1 className="h1" style={{ marginBottom: 16 }}>Documentos</h1>

      <div className="card glass" style={{ padding: "24px 28px", display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
        <div className="ai-glow" style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #D4A86A, #FF7849)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <window.Ico name="sparkles" size={15} color="#0A0A0B" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="h3">La IA clasificó 89 recibos esta semana</div>
          <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 3 }}>OCR + IA · 96% de precisión. 3 esperan tus ojos.</div>
        </div>
        <button className="btn gold">Revisar (3)</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { name: "Recibos OCR", count: 4200, icon: "receipt" },
          { name: "Facturas emitidas", count: 1820, icon: "documents" },
          { name: "Contratos", count: 340, icon: "documents" },
          { name: "Declaraciones DGI", count: 980, icon: "fiscal" },
          { name: "Estados financieros", count: 2400, icon: "analytics" },
          { name: "Conciliaciones bancarias", count: 1640, icon: "database" },
          { name: "Reportes auditoría", count: 380, icon: "shield" },
          { name: "Comunicaciones cliente", count: 640, icon: "message" },
        ].map(f => (
          <div key={f.name} className="card" style={{ padding: "18px 20px", cursor: "pointer" }}>
            <window.Ico name={f.icon} size={18} color="var(--gold)" />
            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 14, color: "var(--text)" }}>{f.name}</div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 3 }}>{f.count.toLocaleString()} archivos</div>
          </div>
        ))}
      </div>
    </div>
  </window.Shell>
);

const ScreenAutomations = () => (
  <window.Shell active="automations" topbar={
    <window.Topbar crumbs={["Gestión", "Automatizaciones"]} hint="12 activas · ahorras 22h/semana"
      action={<button className="btn gold"><window.Ico name="plus" size={13} />Nueva</button>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <div className="anim-in d1" style={{ marginBottom: 28 }}>
        <div className="eyebrow">· Workflows activos</div>
        <h1 className="display-l" style={{ marginTop: 10 }}>
          Automatizaciones te ahorran<br/>
          <span style={{ color: "var(--gold)" }}>22 horas</span> a la semana.
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { id: 1, t: "Auto-clasificar transacciones bancarias",  trigger: "Cada vez que un banco envía un movimiento",  action: "Clasificar con IA + asignar cuenta",        active: true,  saves: "8h/sem", runs: 1840 },
          { id: 2, t: "Generar F.430 mensual por cliente",        trigger: "Día 5 de cada mes",                          action: "Generar PDF + XML + enviar para firma",     active: true,  saves: "4h/sem", runs: 47 },
          { id: 3, t: "Recordar vencimientos DGI",                trigger: "3 días antes del vencimiento",               action: "WhatsApp + email al cliente y al equipo",   active: true,  saves: "2h/sem", runs: 124 },
          { id: 4, t: "Detectar facturas duplicadas",             trigger: "Al subir cualquier factura",                 action: "Comparar con histórico, marcar para revisar", active: true, saves: "1h/sem", runs: 6 },
          { id: 5, t: "Avisar pago tardío de cliente",            trigger: "Cliente paga > 30 días tarde",               action: "Alerta + nota en el perfil del cliente",    active: true,  saves: "3h/sem", runs: 12 },
          { id: 6, t: "Resumen ejecutivo semanal",                trigger: "Lunes 7am",                                  action: "Generar y enviar por email a Carlos",       active: true,  saves: "1h/sem", runs: 52 },
          { id: 7, t: "Conciliar Yappy Empresa",                  trigger: "Tiempo real (al cobro)",                     active: false, draft: true },
          { id: 8, t: "Enviar reporte trimestral al cliente",     trigger: "Día 5 del primer mes del trimestre",         active: false, draft: true },
        ].map(a => (
          <div key={a.id} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
              <window.Ico name="workflow" size={14} color={a.active ? "var(--gold)" : "var(--text-4)"} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{a.t}</div>
              {a.active ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="breathe" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
                  <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 600 }}>ACTIVA</span>
                </span>
              ) : (
                <window.Pill tone="ghost">Borrador</window.Pill>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--text-4)", marginBottom: 6 }}>
              <span style={{ color: "var(--text-3)", minWidth: 60 }}>Cuándo:</span>
              <span>{a.trigger}</span>
            </div>
            {a.action && (
              <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--text-4)" }}>
                <span style={{ color: "var(--text-3)", minWidth: 60 }}>Acción:</span>
                <span>{a.action}</span>
              </div>
            )}
            {a.active && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--hairline)", display: "flex", gap: 14, fontSize: 10.5, color: "var(--text-4)" }}>
                <span><b style={{ color: "var(--gold)" }}>{a.saves}</b> ahorradas</span>
                <span>·</span>
                <span><b style={{ color: "var(--text-2)" }}>{a.runs}</b> ejecuciones</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  </window.Shell>
);

const ScreenSettings = () => (
  <window.Shell active="settings" topbar={
    <window.Topbar crumbs={["Sistema", "Configuración"]} hint="Méndez & Asociados · Plan Firm" />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 className="h1" style={{ marginBottom: 16 }}>Configuración</h1>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 32 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {["Firma", "Usuarios", "Facturación", "Integraciones", "API & Webhooks", "Seguridad", "Notificaciones"].map((s, i) => (
            <div key={s} style={{
              padding: "8px 12px", borderRadius: 7, cursor: "pointer",
              background: i === 0 ? "var(--glass-strong)" : "transparent",
              color: i === 0 ? "var(--text)" : "var(--text-3)",
              fontSize: 12.5, fontWeight: i === 0 ? 500 : 400
            }}>{s}</div>
          ))}
        </nav>
        <div className="card" style={{ padding: 28 }}>
          <h2 className="h2" style={{ marginBottom: 14 }}>Información de la firma</h2>
          <Field label="Nombre comercial" value="Méndez & Asociados, S.A." />
          <Field label="RUC" value="155-987-1-2026 DV 45" mono />
          <Field label="Licencia CPA" value="Lic. 4521" mono />
          <Field label="Email contacto" value="carlos@mendezasociados.pa" />
          <Field label="Teléfono" value="+507 6234-1100" />
          <Field label="Dirección" value="Calle 50, Torre Banistmo, piso 22, Panamá" />
        </div>
      </div>
    </div>
  </window.Shell>
);

// Helpers
const BigStat = ({ label, value, delta, tone }) => {
  const c = { green: "var(--green)", gold: "var(--gold)", red: "var(--red)" }[tone] || "var(--text)";
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div className="eyebrow">· {label}</div>
      <div className="display-s num" style={{ marginTop: 10, color: c }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--green)", marginTop: 6 }}>{delta}</div>
    </div>
  );
};

const Field = ({ label, value, mono }) => (
  <div style={{ padding: "14px 0", borderBottom: "1px solid var(--hairline)", display: "grid", gridTemplateColumns: "180px 1fr 80px", gap: 16, alignItems: "center" }}>
    <span style={{ fontSize: 12, color: "var(--text-4)" }}>{label}</span>
    <span className={mono ? "mono" : ""} style={{ fontSize: 13, color: "var(--text)" }}>{value}</span>
    <button className="btn s ghost">Editar</button>
  </div>
);

const BigChart = () => {
  // Long bar chart for analytics
  const months = ["Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic","Ene","Feb","Mar"];
  const data = [42, 58, 72, 88, 105, 124, 142, 165, 188, 210, 232, 284];
  const max = 320;
  const W = 800, H = 280, P = { l: 36, r: 20, t: 20, b: 36 };
  const bw = (W - P.l - P.r) / data.length;

  return (
    <div style={{ padding: "20px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 280 }}>
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A86A" />
            <stop offset="100%" stopColor="#B98C4D" />
          </linearGradient>
        </defs>
        {[0, .5, 1].map(p => {
          const y = P.t + p * (H - P.t - P.b);
          return <line key={p} x1={P.l} x2={W-P.r} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />;
        })}
        {data.map((v, i) => {
          const x = P.l + bw * i + bw * 0.15;
          const h = (v / max) * (H - P.t - P.b);
          const y = H - P.b - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw * 0.7} height={h} fill="url(#bg)" rx="3" />
              <text x={x + bw * 0.35} y={H - 12} fontSize="9.5" fill="rgba(255,255,255,0.4)" textAnchor="middle">{months[i]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

Object.assign(window, { ScreenAnalytics, ScreenDocuments, ScreenAutomations, ScreenSettings });
