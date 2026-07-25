// "Impuestos" — DGI without fear. ITBMS at day, Renta projected, fiscal calendar.

const ScreenImpuestos = () => {
  const { celebrate } = window.useApp();
  const [aprobado, setAprobado] = React.useState(false);

  return (
    <window.Shell active="impuestos" topbar={
      <window.Topbar
        left={<>
          <window.Pill tone="ghost">IMPUESTOS · MARZO</window.Pill>
          <span>Tu DGI está al día.</span>
        </>}
        right={<>
          <button className="btn ghost"><window.Ico name="doc" size={13} />Para mi CPA</button>
          <button className="btn ink"><window.Ico name="shield" size={13} />Si me fiscalizan</button>
        </>}
      />
    }>

      <div style={{ padding: "36px 48px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Hero */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }} className="anim-in">
          <div>
            <div className="eyebrow teal">· Estado fiscal</div>
            <div className="display-l" style={{ marginTop: 8, fontSize: 86 }}>
              Estás <em style={{ color: "var(--green)" }}>listo</em>.
            </div>
            <div className="body-l" style={{ marginTop: 8, color: "var(--muted)", maxWidth: 560 }}>
              Si te fiscalizan hoy, todo cuadra. 142 transacciones con evidencia archivada. ITBMS al día. Renta proyectada continuamente.
            </div>
          </div>
          <div style={{
            width: 132, height: 132, borderRadius: 999,
            background: "var(--green-soft)", color: "var(--green)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }} className="breathe">
            <window.Ico name="shield" size={60} stroke={1.4} />
          </div>
        </div>

        {/* ITBMS + Renta */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, marginBottom: 18 }} className="anim-in d2">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="eyebrow teal">· ITBMS · Formulario 430</div>
                {aprobado ? <window.Pill tone="green" dot>APROBADO</window.Pill> : <window.Pill tone="amber" dot>4 DÍAS</window.Pill>}
              </div>
              <div className="display-m" style={{ marginTop: 12 }}>
                <window.CountUp value={1032} prefix="$" decimals={0} />
                <span style={{ color: "var(--muted)", fontSize: 24 }}>.16</span>
              </div>
              <div className="body" style={{ marginTop: 4, color: "var(--muted)" }}>
                Neto a pagar el <b style={{ color: "var(--ink)" }}>sábado 15 de marzo</b>. Ya está calculado y listo.
              </div>
            </div>

            <div style={{ padding: "16px 24px", background: "var(--surface)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <BreakDown k="Lo que cobraste" v="$1,720.60" sub="24 ventas afectas" />
                <BreakDown k="Lo que te cobraron" v="$688.44" sub="18 compras con factura" />
                <BreakDown k="Le pagas a DGI" v="$1,032.16" sub="diferencia neta" highlight />
              </div>
            </div>

            <div style={{ padding: "16px 24px", display: "flex", gap: 10, alignItems: "center" }}>
              {!aprobado ? (
                <button className="btn ink" onClick={() => {
                  setAprobado(true);
                  celebrate("ITBMS aprobado", "Carlos lo está revisando ahora");
                }}><window.Ico name="check" size={13} />Aprobar y archivar</button>
              ) : (
                <button className="btn" style={{ background: "var(--green-soft)", color: "var(--green)", borderColor: "var(--green)" }}>
                  <window.Ico name="check" size={13} />Aprobado · esperando CPA
                </button>
              )}
              <button className="btn ghost"><window.Ico name="doc" size={13} />Ver cálculo</button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Tu CPA lo verá automático</div>
            </div>
          </div>

          {/* Renta */}
          <div className="card ink" style={{ padding: "24px 26px" }}>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>· Renta 2025 · proyección viva</div>
            <div className="display-s" style={{ marginTop: 12, color: "var(--bg)" }}>
              <window.CountUp value={10904} prefix="$" decimals={0} />
            </div>
            <div className="body" style={{ marginTop: 4, color: "#A8B0B3" }}>
              vencerá el <b style={{ color: "var(--bg)" }}>31 marzo 2026</b>. Faltan 12 meses para apartarla.
            </div>

            <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(255,255,255,.04)", borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Plan sugerido</div>
              <div style={{ fontSize: 12.5, color: "var(--bg)", marginTop: 6, lineHeight: 1.5 }}>
                Apartá <b className="num">$908/mes</b> en una cuenta separada y no te asustás en marzo.
              </div>
              <button className="btn s gold" style={{ marginTop: 12 }}><window.Ico name="zap" size={11} />Ahorro automático</button>
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: "#7A8285", lineHeight: 1.5 }}>
              Base imponible: $43,618 · Tasa 25% jurídica · Anticipo trimestral activo
            </div>
          </div>
        </div>

        {/* Calendar + Anexos */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }} className="anim-in d3">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="eyebrow teal">· Calendario fiscal · 3 meses</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)" }}>
                  <Legend dot="var(--red)" label="DGI" />
                  <Legend dot="var(--amber)" label="Municipio" />
                  <Legend dot="var(--teal)" label="CSS" />
                </div>
              </div>
            </div>
            <Calendar />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: "20px 22px" }}>
              <div className="eyebrow teal">· Listo para tu CPA</div>
              <div className="h3" style={{ marginTop: 6 }}>Anexos del mes</div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  ["Anexo 1 · Ventas afectas", "$24,580"],
                  ["Anexo 2 · Compras deducibles", "$9,840"],
                  ["Anexo 3 · Retenciones", "—"],
                  ["FE emitidas (24)", "PDF + XML"],
                ].map(([t, v]) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
                    <window.Ico name="doc" size={12} color="var(--teal)" />
                    <span style={{ flex: 1, marginLeft: 10, fontSize: 12 }}>{t}</span>
                    <span className="num" style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
              <button className="btn s ink" style={{ marginTop: 14 }}>
                <window.Ico name="send" size={10} />Enviarle todo a Carlos
              </button>
            </div>

            <div className="card warm" style={{ padding: "20px 22px" }}>
              <div className="eyebrow" style={{ color: "var(--amber)" }}>· Aviso de operación</div>
              <div className="h3" style={{ marginTop: 6 }}>Renuevas en agosto</div>
              <div className="body-s" style={{ color: "var(--muted)", marginTop: 6 }}>
                Tu permiso del MICI vence el <b style={{ color: "var(--ink)" }}>14 ago 2026</b>. Te avisaré 60 días antes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </window.Shell>
  );
};

const BreakDown = ({ k, v, sub, highlight = false }) => (
  <div>
    <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k}</div>
    <div className="num serif" style={{ fontSize: 22, marginTop: 6, color: highlight ? "var(--teal)" : "var(--ink)", letterSpacing: "-0.02em" }}>{v}</div>
    <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 2 }}>{sub}</div>
  </div>
);

const Legend = ({ dot, label }) => (
  <span><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: dot, marginRight: 5, verticalAlign: "middle" }} />{label}</span>
);

const Calendar = () => {
  const today = 11;
  const events = {
    "Mar/15": "red", "Mar/20": "red", "Mar/25": "amber", "Mar/31": "red",
    "Abr/05": "teal", "Abr/15": "red",
    "May/15": "red",
  };
  const months = [
    { name: "Mar", days: 31, offset: 5, current: true },
    { name: "Abr", days: 30, offset: 1 },
    { name: "May", days: 31, offset: 3 },
  ];
  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {months.map(m => (
        <div key={m.name}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{m.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {["L","M","X","J","V","S","D"].map(d => (
              <div key={d} style={{ fontSize: 9, color: "var(--muted-2)", textAlign: "center", padding: "2px 0", fontWeight: 600 }}>{d}</div>
            ))}
            {Array.from({ length: m.offset }).map((_, i) => <div key={"o"+i} />)}
            {Array.from({ length: m.days }).map((_, i) => {
              const day = i + 1;
              const key = `${m.name}/${String(day).padStart(2, "0")}`;
              const tone = events[key];
              const isToday = m.current && day === today;
              return (
                <div key={day} style={{
                  minHeight: 28, padding: "3px 2px", textAlign: "center",
                  background: isToday ? "var(--ink)" : "transparent",
                  color: isToday ? "var(--gold)" : tone ? "var(--ink)" : "var(--muted-2)",
                  borderRadius: 5,
                  position: "relative", fontSize: 10, fontWeight: tone ? 700 : 500
                }}>
                  {day}
                  {tone && (
                    <div style={{
                      position: "absolute", bottom: 1, left: 2, right: 2,
                      height: 3, borderRadius: 999,
                      background: tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : "var(--teal)"
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

Object.assign(window, { ScreenImpuestos });
