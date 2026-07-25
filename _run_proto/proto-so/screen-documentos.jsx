// "Documentos" — archived evidence. Receipts OCR, FE, contracts. Each peso has a paper behind it.

const ScreenDocumentos = () => {
  const { showToast, celebrate } = window.useApp();
  const [filter, setFilter] = React.useState("todos");
  const [approved, setApproved] = React.useState(new Set());

  const approve = (id) => {
    setApproved(s => new Set(s).add(id));
    celebrate("Recibo archivado", "Auto-clasificado en Suministros");
  };

  return (
    <window.Shell active="documentos" topbar={
      <window.Topbar
        left={<>
          <window.Pill tone="ghost">DOCUMENTOS · MARZO</window.Pill>
          <span>Tu archivo respira por ti.</span>
        </>}
        right={<>
          <button className="btn ghost"><window.Ico name="camera" size={13} />Capturar recibo</button>
          <button className="btn ink"><window.Ico name="plus" size={13} />Subir archivo</button>
        </>}
      />
    }>

      <div style={{ padding: "36px 48px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 36, alignItems: "flex-end", marginBottom: 28 }} className="anim-in">
          <div>
            <div className="eyebrow teal">· Archivo del mes</div>
            <div className="display-l" style={{ marginTop: 6, fontSize: 78 }}>
              <window.CountUp value={142} decimals={0} /> recibos<br/>
              <em style={{ color: "var(--teal)" }}>archivados</em>.
            </div>
            <div className="body-l" style={{ marginTop: 8, color: "var(--muted)" }}>
              Cada peso que entró o salió este mes tiene respaldo. <b style={{ color: "var(--ink)" }}>Auditoría-ready.</b>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DocStat k="Capturados con celular" v="89" sub="OCR + IA" />
            <DocStat k="FE emitidas" v="24" sub="todas con CUFE DGI" />
            <DocStat k="Importados del banco" v="29" sub="auto-conciliados" />
          </div>
        </div>

        {/* Bandeja IA */}
        <div className="card anim-in d2" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <window.Pill tone="amber" dot>{3 - approved.size} NECESITAN TUS OJOS</window.Pill>
              <div className="h3">Recibos pendientes</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["todos","Todos",3],["pendientes","Pendientes",3 - approved.size],["listos","Listos",approved.size]].map(([id, label, count]) => (
                <div key={id} onClick={() => setFilter(id)} style={{
                  padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                  background: filter === id ? "var(--surface)" : "transparent",
                  fontSize: 11.5, fontWeight: filter === id ? 700 : 500,
                  color: filter === id ? "var(--ink)" : "var(--muted)"
                }}>
                  {label} <span style={{ fontSize: 10.5, color: "var(--muted-2)" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
            {[
              { id: "r1", vendor: "Office Depot", subt: "Multiplaza", monto: 420.50, itbms: 29.44, fecha: "Hoy 14:22", cuenta: "Suministros", conf: 96 },
              { id: "r2", vendor: "Estación Texaco", subt: "Costa del Este", monto: 45.20, itbms: 0, fecha: "Hoy 09:18", cuenta: "Transporte", conf: 99, divider: true },
              { id: "r3", vendor: "Felipe Motta", subt: "Centro Empresarial", monto: 312.00, itbms: 21.84, fecha: "Ayer 19:40", cuenta: "Atención a clientes", conf: 78, warn: true, divider: true },
            ].map(r => (
              <ReceiptCard key={r.id} {...r} approved={approved.has(r.id)} onApprove={() => approve(r.id)} />
            ))}
          </div>
        </div>

        {/* Archive table + AI stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }} className="anim-in d3">
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
              <div className="eyebrow teal">· Archivo mensual</div>
              <window.Pill tone="ghost">100% AUDITADO</window.Pill>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Documento</th>
                  <th>Proveedor / Cliente</th>
                  <th>Tipo</th>
                  <th className="r">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["12 mar", "FE-2451", "Constructora Istmo (cliente)", "Factura emitida", 4200, "Firmada"],
                  ["10 mar", "REF-8821", "Banco General", "Préstamo", -950, "Conciliado"],
                  ["08 mar", "ALQ-MAR", "Inmobiliaria Bella Vista", "Recibo alquiler", -1800, "Archivado"],
                  ["07 mar", "FE-1188", "Office Depot", "Recibo OCR", -420.50, "Auto-clasificado"],
                  ["05 mar", "FE-2440", "C. Méndez Palacios", "Factura emitida", 1500, "Firmada"],
                  ["03 mar", "FE-2435", "Distribuidora Sur (cliente)", "Factura emitida", 6800, "Firmada"],
                ].map((r, i) => (
                  <tr key={i} className="hoverable">
                    <td className="muted">{r[0]}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{r[1]}</td>
                    <td><b>{r[2]}</b></td>
                    <td className="muted">{r[3]}</td>
                    <td className="r num" style={{ fontWeight: 700, color: r[4] > 0 ? "var(--green)" : "var(--ink)" }}>
                      {r[4] > 0 ? "+" : "−"}{window.fmt$(Math.abs(r[4]), { decimals: 0 })}
                    </td>
                    <td>
                      <window.Pill tone={r[5] === "Firmada" ? "teal" : "green"}>{r[5]}</window.Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card ink" style={{ padding: "22px 24px", display: "flex", flexDirection: "column" }}>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>· La IA hizo por ti</div>
            <div className="display-s" style={{ marginTop: 10, color: "var(--bg)", fontSize: 38 }}>
              <em style={{ color: "var(--gold)" }}>4 horas</em><br/>
              esta semana.
            </div>
            <div className="body-s" style={{ color: "#A8B0B3", marginTop: 10, lineHeight: 1.55 }}>
              Lo que automatizó por ti, traducido a tiempo de tu día.
            </div>

            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["Clasificó 89 recibos", "OCR + IA"],
                ["Concilió 29 movimientos", "Automático"],
                ["Emitió 24 facturas DGI", "Con CUFE"],
                ["Calculó ITBMS vivo", "Tiempo real"],
              ].map(([t, sub], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 999, background: "rgba(201,165,90,.15)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <window.Ico name="check" size={10} stroke={2.5} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--bg)", flex: 1 }}>{t}</div>
                  <div style={{ fontSize: 10, color: "#7A8285" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </window.Shell>
  );
};

const DocStat = ({ k, v, sub }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 10, background: "var(--surface)" }}>
    <div className="num serif" style={{ fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
    <div>
      <div style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  </div>
);

const ReceiptCard = ({ vendor, subt, monto, itbms, fecha, cuenta, conf, warn = false, divider = false, approved, onApprove }) => (
  <div style={{
    padding: "20px 22px",
    borderLeft: divider ? "1px solid var(--line-2)" : "none",
    display: "flex", flexDirection: "column", gap: 10,
    opacity: approved ? 0.5 : 1, transition: "opacity .3s"
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{vendor}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{subt} · {fecha}</div>
      </div>
      <window.Pill tone={warn ? "amber" : "teal"} dot>IA {conf}%</window.Pill>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px dashed var(--line-2)" }}>
      <div className="num serif" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>${monto.toFixed(2)}</div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>ITBMS ${itbms.toFixed(2)}</div>
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <window.Ico name="sparkle" size={11} color="var(--teal)" />
      <span style={{ fontSize: 11.5, color: "var(--ink)" }}>Lo guardo como <b>{cuenta}</b></span>
    </div>

    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {approved ? (
        <div style={{ flex: 1, padding: "6px 10px", borderRadius: 6, background: "var(--green-soft)", color: "var(--green)", textAlign: "center", fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <window.Ico name="check" size={11} stroke={2.4} /> Archivado
        </div>
      ) : (
        <>
          <button className="btn s" style={{ flex: 1, justifyContent: "center" }}>Cambiar</button>
          <button className="btn s ink" style={{ flex: 2, justifyContent: "center" }} onClick={onApprove}>
            <window.Ico name="check" size={11} />Aprobar
          </button>
        </>
      )}
    </div>
  </div>
);

Object.assign(window, { ScreenDocumentos });
