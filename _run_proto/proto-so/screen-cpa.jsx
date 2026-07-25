// "Mi CPA" — chat with your accountant. A person, not a module.

const ScreenCpa = () => {
  const { showToast } = window.useApp();
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState([
    { who: "cpa", t: "Listo Roberto, revisé marzo. Aprueba el ITBMS de $1,032 y queda firmado.", time: "11:14 a.m." },
    { who: "me",  t: "Le doy. ¿La cuenta Yappy Empresa la cuento como ingreso o como caja chica?", time: "11:18 a.m." },
    { who: "cpa", t: "Como caja menor, sí. La separé en el catálogo. Queda contabilizada como '1102 Yappy Empresa' automático.", time: "11:22 a.m." },
    { who: "cpa", t: "Por cierto: vi que Felipe Motta $312 está clasificada como atención a clientes pero ese tipo de gasto no es deducible al 100% — la dejé al 50%. Total: te ahorras como $11 de ITBMS crédito que la DGI rechazaría.", time: "11:23 a.m.", attached: true },
    { who: "me",  t: "Increíble, gracias. ¿Algo más?", time: "11:30 a.m." },
    { who: "cpa", t: "Nada. Pasa el sábado el pago y queda. Te llamo si veo algo raro.", time: "11:31 a.m." },
  ]);

  const send = () => {
    if (!draft.trim()) return;
    setMessages(m => [...m, { who: "me", t: draft, time: "Ahora" }]);
    setDraft("");
    setTimeout(() => {
      setMessages(m => [...m, { who: "cpa", t: "Ya lo veo. Te confirmo en un rato.", time: "Ahora" }]);
      showToast("Carlos te respondió", { icon: "users", sound: false });
    }, 1200);
  };

  return (
    <window.Shell active="cpa" topbar={
      <window.Topbar
        left={<>
          <window.Pill tone="ghost">MI CPA</window.Pill>
          <span>Tu contador, conectado al instante.</span>
        </>}
        right={<>
          <button className="btn ghost"><window.Ico name="users" size={13} />Cambiar CPA</button>
          <button className="btn ink"><window.Ico name="send" size={13} />Enviar cierre del mes</button>
        </>}
      />
    }>

      <div style={{ padding: "32px 48px", maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Profile */}
          <div style={{ display: "flex", gap: 22, alignItems: "center" }} className="anim-in">
            <div style={{
              width: 100, height: 100, borderRadius: 999,
              background: "linear-gradient(135deg, #1F8A5B 0%, #0D4A47 100%)",
              color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Instrument Serif, serif", fontSize: 42
            }}>CM</div>
            <div>
              <div className="eyebrow teal">· Tu CPA · vivo</div>
              <div className="display-s" style={{ marginTop: 6 }}>Carlos Méndez</div>
              <div className="body" style={{ color: "var(--muted)", marginTop: 4 }}>
                Méndez & Asociados · Lic. 4521
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11.5, color: "var(--muted)" }}>
                <span><window.Ico name="check" size={11} color="var(--green)" /> <b style={{ color: "var(--ink)" }}>Te vio</b> hace 2h</span>
                <span><window.Ico name="clock" size={11} /> Responde en <b style={{ color: "var(--ink)" }}>~3h</b></span>
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="card anim-in d2" style={{ padding: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 520 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="eyebrow teal">· Conversación</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-2)" }}>Carlos ve tus datos en vivo</div>
            </div>

            <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
              <Day t="Hoy" />
              {messages.map((m, i) => <Bubble key={i} {...m} />)}
            </div>

            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center" }}>
              <window.Ico name="camera" size={15} color="var(--muted-2)" style={{ cursor: "pointer" }} />
              <input placeholder="Escribe a Carlos…" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} style={{ flex: 1, border: "none", padding: "8px 0", fontSize: 13 }} />
              <window.Ico name="whatsapp" size={15} color="#25D366" style={{ cursor: "pointer" }} />
              <button className="btn s ink" onClick={send}><window.Ico name="send" size={11} /></button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card anim-in d2" style={{ padding: "20px 22px" }}>
            <div className="eyebrow teal">· Lo que Carlos ve</div>
            <div className="h2" style={{ marginTop: 6 }}>Acceso en vivo · solo lectura</div>
            <div className="body-s" style={{ color: "var(--muted)", marginTop: 6 }}>
              No le envías Excel. Carlos ve tus números, recibos y FE en tiempo real desde su propia app.
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["Plata · ingresos, gastos, caja", true],
                ["Impuestos · ITBMS, renta", true],
                ["Documentos · recibos y FE", true],
                ["Editar tus transacciones", false],
                ["Cerrar período / firmar", true],
              ].map(([t, ok], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i === 4 ? 0 : "1px solid var(--line-2)" }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: ok ? "var(--green-soft)" : "var(--red-soft)", color: ok ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <window.Ico name={ok ? "check" : "x"} size={10} stroke={2.4} />
                  </span>
                  <span style={{ fontSize: 12, flex: 1, color: "var(--ink)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card warm anim-in d3" style={{ padding: "20px 22px" }}>
            <div className="eyebrow gold">· Próximas firmas</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["ITBMS marzo · F.430", "vence 15 mar · espera tu aprobación", "amber"],
                ["Cierre mensual marzo", "tras aprobar ITBMS", "ghost"],
                ["Renta natural 2024", "ya firmado", "green"],
              ].map(([t, sub, tone], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--paper)", borderRadius: 8 }}>
                  <window.Pill tone={tone} dot>·</window.Pill>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card ink anim-in d4" style={{ padding: "20px 22px" }}>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>· Loop sin fricción</div>
            <div className="h2" style={{ marginTop: 8, color: "var(--bg)" }}>Carlos te cobra $200/mes.</div>
            <div className="body-s" style={{ color: "#A8B0B3", marginTop: 8 }}>
              Antes: Excel mensual, idas y vueltas. Ahora: revisión continua. Ambos ganan tiempo, ambos están más tranquilos.
            </div>
          </div>
        </div>
      </div>
    </window.Shell>
  );
};

const Day = ({ t }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--muted-2)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
    <span>{t}</span>
    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
  </div>
);

const Bubble = ({ who, t, time, attached = false }) => (
  <div className="anim-in" style={{ display: "flex", justifyContent: who === "me" ? "flex-end" : "flex-start", gap: 10 }}>
    {who === "cpa" && (
      <div style={{
        width: 26, height: 26, borderRadius: 999,
        background: "linear-gradient(135deg, #1F8A5B 0%, #0D4A47 100%)",
        color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9.5, fontWeight: 700, flexShrink: 0
      }}>CM</div>
    )}
    <div style={{ maxWidth: "76%" }}>
      <div style={{
        padding: "10px 13px", borderRadius: 11,
        background: who === "me" ? "var(--ink)" : "var(--surface)",
        color: who === "me" ? "var(--bg)" : "var(--ink)",
        fontSize: 12.5, lineHeight: 1.5
      }}>{t}</div>
      <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 3, textAlign: who === "me" ? "right" : "left" }}>
        {time}{attached && <> · 1 ajuste aplicado</>}
      </div>
    </div>
  </div>
);

Object.assign(window, { ScreenCpa });
