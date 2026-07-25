// "Hoy" — the screen the owner opens first. One priority. One pulse. One conversation.

const ScreenHoy = () => {
  const { navigate, showToast, celebrate } = window.useApp();
  const [aiOpen, setAiOpen] = React.useState(false);

  return (
    <window.Shell active="hoy" topbar={
      <window.Topbar
        left={<>
          <window.Pill tone="ghost">MARTES · 11 MAR</window.Pill>
          <span>Buenos días, <b style={{ color: "var(--ink)" }}>Roberto</b>.</span>
        </>}
        right={<>
          <button className="btn ghost"><window.Ico name="search" size={13} />Buscar</button>
          <button className="btn ghost" style={{ position: "relative" }}>
            <window.Ico name="bell" size={13} />
            <span style={{ position: "absolute", top: 4, right: 6, width: 6, height: 6, borderRadius: 999, background: "var(--red)" }} />
          </button>
          <button className="btn ink" onClick={() => navigate("plata")}><window.Ico name="plus" size={13} />Cobrar</button>
        </>}
      />
    }>

      <div style={{ padding: "36px 48px 48px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, maxWidth: 1440, margin: "0 auto" }}>

        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>

          {/* Hero greeting */}
          <div className="anim-in d1">
            <div className="eyebrow teal">· Lo que importa hoy</div>
            <h1 className="display-l" style={{ marginTop: 10 }}>
              Tu negocio va<br/>
              <em style={{ color: "var(--teal)" }}>+18% arriba</em><br/>
              de febrero.
            </h1>
            <div className="body-l" style={{ marginTop: 14, color: "var(--muted)" }}>
              Entraron <b className="num" style={{ color: "var(--ink)" }}>$24,580</b>, salieron <b className="num" style={{ color: "var(--ink)" }}>$9,840</b>. Te quedaron <b className="num" style={{ color: "var(--ink)" }}>$14,739</b> de utilidad.
            </div>
          </div>

          {/* Priority */}
          <div className="card anim-in d2" style={{
            padding: "22px 24px",
            borderColor: "var(--gold)",
            background: "linear-gradient(180deg, var(--gold-50) 0%, var(--paper) 60%)"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: "var(--ink)", color: "var(--gold)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                <window.Ico name="zap" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <window.Pill tone="gold">PRIORIDAD · ESTA SEMANA</window.Pill>
                <div className="h2" style={{ marginTop: 8 }}>
                  El sábado pagas ITBMS · <span className="num">$1,032</span>
                </div>
                <p className="body-s" style={{ marginTop: 6, color: "var(--muted)" }}>
                  Ya está calculado. Solo necesitas aprobarlo. Tu CPA Carlos lo verá automáticamente.
                </p>
                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn ink" onClick={() => {
                    celebrate("ITBMS aprobado", "Carlos ya lo está revisando");
                  }}>Aprobar y archivar</button>
                  <button className="btn ghost" onClick={() => navigate("impuestos")}>Ver el cálculo</button>
                  <div style={{ flex: 1 }} />
                  <window.Pill tone="ghost"><window.Ico name="clock" size={11} />4 días</window.Pill>
                </div>
              </div>
            </div>
          </div>

          {/* IA conversational */}
          <div className="card ink anim-in d3" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: "var(--gold)",
                color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "Instrument Serif, serif", fontSize: 16
              }}>₵</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Pregúntale a tu copiloto</div>
                <div style={{ fontSize: 11, color: "#A8B0B3", marginTop: 1 }}>Conoce tus números en tiempo real.</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                "¿Puedo darme una bonificación de $3,000 este mes?",
                "¿Cuál fue mi mejor cliente del trimestre?",
                "¿Me alcanza la plata para pagar la planilla del viernes?",
              ].map((q, i) => (
                <div key={i} onClick={() => { setAiOpen(true); showToast("Pensando…", { duration: 1200, sound: false }); }} style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,255,255,.06)",
                  fontSize: 12.5, color: "var(--bg)",
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer"
                }}>
                  <window.Ico name="sparkle" size={12} color="var(--gold)" />
                  <span style={{ flex: 1 }}>{q}</span>
                  <window.Ico name="arrowRight" size={11} color="#7A8285" />
                </div>
              ))}
              <div style={{ marginTop: 6, padding: "8px 12px", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <window.Ico name="zap" size={12} color="#7A8285" />
                <input placeholder="Pregunta lo que quieras…" style={{ flex: 1, background: "transparent", border: "0", color: "var(--bg)", padding: 0 }} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Pulse */}
          <div className="card anim-in d2" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="eyebrow teal">· Pulso del negocio</div>
              <window.Pill tone="green" dot>EN REGLA</window.Pill>
            </div>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <PulseRow k="ITBMS marzo" v="$1,032 listos" sub="vence sáb 15" tone="amber" />
              <PulseRow k="Renta 2025" v="$10,904 proyectada" sub="31 mar 2026" tone="muted" />
              <PulseRow k="Por cobrar" v="$8,420 · 6 facturas" sub="2 vencidas" tone="red" />
              <PulseRow k="Caja + bancos" v="$42,810" sub="3 cuentas" tone="green" />
            </div>

            <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--surface)", borderRadius: 9, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Si te fiscalizan hoy, <b style={{ color: "var(--ink)" }}>estás listo</b>. 142 transacciones con evidencia.
            </div>
          </div>

          {/* Esta semana — algo bueno */}
          <div className="card warm anim-in d3" style={{ padding: "20px 22px", cursor: "pointer" }} onClick={() => navigate("plata")}>
            <div className="eyebrow gold">· Esta semana</div>
            <div className="serif" style={{ marginTop: 6, fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Maersk te <em style={{ color: "var(--teal)" }}>pagó</em><br/>
              <window.CountUp value={4800} decimals={0} prefix="$" /> el lunes.
            </div>
            <div className="body-s" style={{ marginTop: 8, color: "var(--muted)" }}>
              Factura FE-2451. Conciliado automático con Banco General.
            </div>
          </div>

          {/* CPA */}
          <div onClick={() => window.useApp().navigate("cpa")} className="anim-in d4" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 12, background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #1F8A5B 0%, #0D4A47 100%)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>CM</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Carlos · tu CPA</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"Listo, revisé marzo. Aprueba ITBMS."</div>
            </div>
            <window.BreathDot size={6} color="var(--green)" />
          </div>

        </div>
      </div>

      {/* AI Drawer */}
      {aiOpen && <AIDrawer onClose={() => setAiOpen(false)} />}
    </window.Shell>
  );
};

const PulseRow = ({ k, v, sub, tone = "muted" }) => {
  const c = { green: "var(--green)", red: "var(--red)", amber: "var(--amber)", muted: "var(--muted)" }[tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {tone !== "muted" ? <window.BreathDot size={6} color={c} /> : <span style={{ width: 6, height: 6, borderRadius: 999, background: c, opacity: 0.4 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{k}</div>
        <div className="num" style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{v}</div>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted-2)", textAlign: "right" }}>{sub}</div>
    </div>
  );
};

const AIDrawer = ({ onClose }) => (
  <>
    <div className="scrim" onClick={onClose} />
    <div className="drawer" style={{ width: 520 }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ink)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif, serif", fontSize: 17 }}>₵</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Tu copiloto</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Ve tus datos en vivo</div>
        </div>
        <window.Ico name="x" size={16} color="var(--muted)" style={{ cursor: "pointer" }} onClick={onClose} />
      </div>
      <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        <div className="anim-in" style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: 10, fontSize: 13, color: "var(--ink)", marginBottom: 16, maxWidth: "85%" }}>
          ¿Puedo darme una bonificación de $3,000 este mes?
        </div>
        <div className="anim-in d2" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--ink)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif, serif", fontSize: 14, flexShrink: 0 }}>₵</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>
            Sí, <b>sin problema</b>. Te explico por qué:<br/><br/>
            Tienes <b className="num">$42,810</b> en caja. Después de pagar el ITBMS del sábado y separar la renta del mes ($908), te quedan <b className="num">$40,870</b> libres.<br/><br/>
            Sacar $3,000 te deja con <b className="num">$37,870</b> — todavía bien sobre tu colchón mínimo de $20k. La utilidad de marzo cubre 4× esa bonificación.<br/><br/>
            <span style={{ color: "var(--muted)" }}>El ITBMS sobre tu bonificación no aplica (es retiro de utilidad, no salario).</span>
          </div>
        </div>
        <div className="anim-in d3" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <window.Pill tone="teal" style={{ cursor: "pointer" }}>Registrar el retiro</window.Pill>
          <window.Pill tone="ghost" style={{ cursor: "pointer" }}>¿Y si fueran $5k?</window.Pill>
          <window.Pill tone="ghost" style={{ cursor: "pointer" }}>Avisarle a Carlos</window.Pill>
        </div>
      </div>
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center" }}>
        <input placeholder="Pregunta lo que quieras…" style={{ flex: 1, fontSize: 13 }} />
        <button className="btn ink s"><window.Ico name="send" size={11} /></button>
      </div>
    </div>
  </>
);

Object.assign(window, { ScreenHoy });
