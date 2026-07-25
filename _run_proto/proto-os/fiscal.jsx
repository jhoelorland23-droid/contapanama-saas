// Fiscal & ITBMS & DGI screens (consolidated — share much UI)

const ScreenFiscal = () => {
  const { showToast } = window.useApp();
  return (
    <window.Shell active="fiscal" topbar={
      <window.Topbar
        crumbs={["Cumplimiento", "Fiscal"]}
        hint={<>Marzo 2026 · 47 clientes · ITBMS + Renta</>}
        action={<>
          <button className="btn ghost"><window.Ico name="download" size={13} />XML DGI</button>
          <button className="btn gold"><window.Ico name="fiscal" size={13} />Generar F.430</button>
        </>}
      />
    }>
      <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
        <div className="anim-in" style={{ marginBottom: 22 }}>
          <div className="eyebrow">· Vista global · Marzo 2026</div>
          <h1 className="display-l" style={{ marginTop: 12, maxWidth: 1000 }}>
            La firma maneja <span style={{ color: "var(--gold)" }}>$31,420</span> en ITBMS este mes.<br/>
            <span style={{ color: "var(--text-3)" }}>4 declaraciones vencen el sábado.</span>
          </h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
          <Stat label="ITBMS gestionado" value="$31,420" delta="+12.1%" tone="gold" />
          <Stat label="Por presentar"    value="4"        sub="vencen sábado" tone="red" />
          <Stat label="Presentadas"      value="43"       sub="de 47 clientes" tone="green" />
          <Stat label="Renta proyectada" value="$284k"    sub="acumulado 2026" tone="default" />
        </div>

        {/* Vencimientos table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="eyebrow">· Calendario · próximas 4 semanas</div>
              <div className="h2" style={{ marginTop: 6 }}>Declaraciones por presentar</div>
            </div>
            <window.Pill tone="red" dot>4 críticas esta semana</window.Pill>
          </div>
          <table className="tbl">
            <thead><tr>
              <th>Cliente</th><th>Tipo</th><th>Período</th><th>Vence</th>
              <th className="r">Neto</th><th>Estado</th><th>IA</th><th style={{ width: 130 }}></th>
            </tr></thead>
            <tbody>
              {[
                ["Constructora Istmo", "ITBMS · F.430", "Marzo 26", "Sáb 15 mar · 4d",  3200, "red",    "Pendiente",  "Generar"],
                ["Maersk Panamá",      "ITBMS · F.430", "Marzo 26", "Sáb 15 mar · 4d",  2800, "green",  "Listo",      "Enviar"],
                ["Distribuidora Sur",  "ITBMS · F.430", "Marzo 26", "Sáb 15 mar · 4d",  1820, "green",  "Listo",      "Enviar"],
                ["Café del Casco",     "ITBMS · F.430", "Marzo 26", "Sáb 15 mar · 4d",  600,  "red",    "Pendiente",  "Generar"],
                ["Marina del Pacífico","Retenciones",   "Feb 26",   "Mié 20 mar · 9d",  240,  "orange", "Por revisar","Revisar"],
                ["C. Méndez (natural)","Renta",         "2025",     "31 mar · 20d",     1100, "ghost",  "Borrador",   "Continuar"],
              ].map((r, i) => (
                <tr key={i} className="hoverable">
                  <td><b style={{ color: "var(--text)" }}>{r[0]}</b></td>
                  <td>{r[1]}</td>
                  <td className="muted">{r[2]}</td>
                  <td><window.Pill tone={r[5] === "red" ? "red" : r[5] === "orange" ? "orange" : "ghost"}>{r[3]}</window.Pill></td>
                  <td className="r mono" style={{ fontWeight: 600 }}>${r[4].toLocaleString()}</td>
                  <td><window.Pill tone={r[5]}>{r[6]}</window.Pill></td>
                  <td><window.Ico name="sparkles" size={11} color="var(--gold)" /></td>
                  <td><button className="btn s">{r[7]}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </window.Shell>
  );
};

const ScreenITBMS = () => (
  <window.Shell active="itbms" topbar={
    <window.Topbar
      crumbs={["Cumplimiento", "ITBMS"]}
      hint="Formulario 430 · Marzo 2026"
      action={<>
        <button className="btn ghost"><window.Ico name="download" size={13} />XML lote</button>
        <button className="btn gold"><window.Ico name="zap" size={13} />Generar todos (4)</button>
      </>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <div className="anim-in d1" style={{ marginBottom: 28 }}>
        <div className="eyebrow">· ITBMS de la firma · marzo 2026</div>
        <h1 className="display-l" style={{ marginTop: 10 }}>
          <span style={{ color: "var(--gold)" }}>$31,420</span> netos<br/>
          <span style={{ color: "var(--text-3)" }}>a presentar el sábado.</span>
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: "22px 24px" }}>
          <div className="eyebrow">· Desglose</div>
          <div style={{ marginTop: 18 }}>
            <BD k="Débito fiscal (ventas)" v="$48,720" sub="24 clientes con ventas afectas" />
            <BD k="Crédito fiscal (compras)" v="$17,300" sub="18 clientes con compras deducibles" highlight />
            <BD k="Retenciones aplicadas" v="-$0" sub="—" />
            <div style={{ height: 1, background: "var(--hairline-strong)", margin: "16px 0" }} />
            <BD k="Neto a presentar" v="$31,420" sub="suma de 4 declaraciones" big />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button className="btn gold lg"><window.Ico name="check" size={13} />Aprobar todo</button>
            <button className="btn lg"><window.Ico name="eye" size={13} />Revisar cliente por cliente</button>
          </div>
        </div>

        <div className="card glass" style={{ padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="ai-glow" style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #D4A86A, #FF7849)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <window.Ico name="sparkles" size={12} color="#0A0A0B" />
            </div>
            <div className="h3">Recomendaciones IA</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Reco icon="shield" tone="red" t="2 clientes con ITBMS pendiente desde febrero." sub="Constructora Istmo, Café del Casco — generar atrasado primero." />
            <Reco icon="trendingUp" tone="gold" t="Tres clientes pueden reclamar crédito fiscal mayor." sub="Detecté facturas no clasificadas como deducibles. +$840." />
            <Reco icon="zap" tone="violet" t="Puedo enviar el F.430 a los 4 clientes por WhatsApp." sub="Con un click. Esperan tu autorización." />
          </div>
        </div>
      </div>
    </div>
  </window.Shell>
);

const ScreenDeclarations = () => (
  <window.Shell active="declarations" topbar={
    <window.Topbar
      crumbs={["Cumplimiento", "Declaraciones"]}
      hint="Histórico de presentaciones · 2026"
      action={<button className="btn gold"><window.Ico name="plus" size={13} />Nueva declaración</button>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <h1 className="h1" style={{ marginBottom: 14 }}>Declaraciones</h1>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Tipo</th><th>Período</th><th>Presentada</th><th className="r">Monto</th><th>Estado</th></tr></thead>
          <tbody>
            {[
              ["Maersk Panamá", "ITBMS F.430", "Feb 2026", "12 feb · ✓", 2750, "green"],
              ["Distribuidora Sur", "ITBMS F.430", "Feb 2026", "12 feb · ✓", 1820, "green"],
              ["Constructora Istmo", "ITBMS F.430", "Ene 2026", "20 feb · tarde", 3100, "orange"],
              ["Café del Casco", "Renta natural 2024", "2024", "Marzo 2025 · ✓", 4200, "green"],
            ].map((r, i) => (
              <tr key={i} className="hoverable">
                <td><b>{r[0]}</b></td>
                <td>{r[1]}</td>
                <td className="muted">{r[2]}</td>
                <td className="muted">{r[3]}</td>
                <td className="r mono" style={{ fontWeight: 600 }}>${r[4].toLocaleString()}</td>
                <td><window.Pill tone={r[5]} dot>{r[5] === "green" ? "Aceptada" : "Con multa"}</window.Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </window.Shell>
);

const ScreenDGI = () => (
  <window.Shell active="dgi" topbar={
    <window.Topbar
      crumbs={["Cumplimiento", "DGI"]}
      hint="Centro de cumplimiento · DGI Panamá"
      action={<button className="btn ghost"><window.Ico name="globe" size={13} />Portal DGI</button>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <div className="anim-in" style={{ marginBottom: 28 }}>
        <div className="eyebrow">· DGI</div>
        <h1 className="display-l" style={{ marginTop: 10 }}>
          <span style={{ color: "var(--green)" }}>43 de 47</span> clientes<br/>
          <span style={{ color: "var(--text-3)" }}>al día con la DGI.</span>
        </h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Pillar t="Facturación electrónica" v="24" sub="clientes activos en FE" icon="receipt" tone="gold" />
        <Pillar t="Avisos de operación" v="42" sub="renovados al día" icon="building" tone="default" />
        <Pillar t="RUC verificado" v="47" sub="100% de los clientes" icon="shield" tone="green" />
      </div>
    </div>
  </window.Shell>
);

const ScreenMunicipios = () => (
  <window.Shell active="municipios" topbar={
    <window.Topbar
      crumbs={["Cumplimiento", "Municipios"]}
      hint="Impuestos municipales · Marzo 2026"
      action={<button className="btn ghost"><window.Ico name="download" size={13} />Reporte</button>}
    />
  }>
    <div style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>
      <h1 className="h1" style={{ marginBottom: 14 }}>Municipios</h1>
      <div className="card" style={{ padding: 24 }}>
        <div className="body">Gestión de impuestos municipales para los 47 clientes. Panamá, San Miguelito, Arraiján, La Chorrera, Colón.</div>
        <div style={{ marginTop: 18, padding: 20, background: "var(--glass)", borderRadius: 10, textAlign: "center", color: "var(--text-4)", fontSize: 12.5 }}>
          Vista demo · datos en producción
        </div>
      </div>
    </div>
  </window.Shell>
);

// Helpers
const Stat = ({ label, value, delta, sub, tone }) => {
  const c = { gold: "var(--gold)", green: "var(--green)", red: "var(--red)", default: "var(--text)" }[tone];
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div className="eyebrow">· {label}</div>
      <div className="h1 num" style={{ marginTop: 6, color: c }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 3 }}>{delta} vs mes anterior</div>}
      {sub && <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
};

const BD = ({ k, v, sub, highlight, big }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: big ? "16px 0 6px" : "10px 0", borderBottom: !big ? "1px solid var(--hairline)" : "none" }}>
    <div>
      <div style={{ fontSize: big ? 14 : 12, color: "var(--text-2)", fontWeight: big ? 600 : 400 }}>{k}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{sub}</div>
    </div>
    <div className={`num ${big ? "display-s" : "h2"}`} style={{ color: big ? "var(--gold)" : highlight ? "var(--text-3)" : "var(--text)", fontFamily: big ? "Instrument Serif, serif" : undefined, letterSpacing: big ? "-0.025em" : undefined }}>{v}</div>
  </div>
);

const Reco = ({ icon, tone, t, sub }) => {
  const c = { red: "var(--red)", gold: "var(--gold)", violet: "var(--violet)", green: "var(--green)", orange: "var(--orange)" }[tone];
  return (
    <div style={{ padding: "12px 14px", borderRadius: 9, background: "var(--glass)", border: "1px solid var(--hairline)", display: "flex", gap: 11 }}>
      <window.Ico name={icon} size={13} color={c} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{t}</div>
        <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
};

const Pillar = ({ t, v, sub, icon, tone }) => {
  const c = { gold: "var(--gold)", green: "var(--green)", default: "var(--text)" }[tone];
  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="eyebrow">· {t}</div>
        <window.Ico name={icon} size={14} color={c} />
      </div>
      <div className="display-s num" style={{ marginTop: 10, color: c }}>{v}</div>
      <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 6 }}>{sub}</div>
    </div>
  );
};

Object.assign(window, { ScreenFiscal, ScreenITBMS, ScreenDeclarations, ScreenDGI, ScreenMunicipios });
