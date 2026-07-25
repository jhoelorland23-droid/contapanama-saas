// Screen: Módulo Fiscal. ITBMS detail + ISR projection + calendar DGI.

const ScreenFiscal = () => {
  const { showToast, api, isLive, periodo, clienteId } = window.useApp();
  const cli = clienteId ? `&cliente_id=${clienteId}` : "";

  const itbmsQ = window.useApiQuery(
    () => api.get(`/fiscal/itbms?periodo=${periodo}${cli}`),
    [periodo, isLive, clienteId],
    { enabled: isLive, fallback: { debito: 1720.60, credito: 688.44, saldo_pagar: 1032.16, num_ventas: 24, num_compras_ded: 18 } }
  );
  const rentaQ = window.useApiQuery(
    () => api.get(`/fiscal/renta?anio=2025`),
    [isLive],
    { enabled: isLive, fallback: { ingresos_brutos: 73140, gastos_deducibles: 29521.50, renta_neta: 43618.50, isr: 10904.63, tasa: "25% (jurídica)" } }
  );

  const it = itbmsQ.data || {};
  const rt = (rentaQ.data && rentaQ.data.data) || rentaQ.data || {};
  const debito = +it.debito || +it.itbms_debito || 1720.60;
  const credito = +it.credito || +it.itbms_credito || 688.44;
  const neto = +it.saldo_pagar || +it.itbms_neto || 1032.16;
  const ventas = it.num_ventas || 24;
  const compras = it.num_compras_ded || 18;
  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Cumplimiento", "Módulo fiscal"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => showToast("Descargando XML…", { icon: "download" })}>
              <window.Ico name="download" size={13} />XML DGI
            </button>
            <button className="btn primary" onClick={async () => {
              if (isLive) {
                try { await api.pdf(`/reportes/itbms?periodo=${periodo}`, `itbms-${periodo}.pdf`); showToast("PDF descargado ✓", { icon: "check" }); }
                catch (e) { showToast(e.message, { icon: "alert" }); }
              } else { showToast("Generando Formulario 430…", { icon: "pdf" }); }
            }}>
              <window.Ico name="pdf" size={13} />Generar F.430
            </button>
          </>
        }
      />
      <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ITBMS Big card */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div className="xs" style={{ color: "var(--teal)" }}>· ITBMS · Formulario 430</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
                <span className="serif num" style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em" }}>{window.fmt$(neto)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Neto a pagar a la DGI · {window.fmtPeriodo(periodo)}</div>
            </div>
            <div style={{ display: "flex", gap: 32, alignItems: "flex-end" }}>
              <BItem label="Débito fiscal" value={window.fmt$(debito)} sub={`${ventas} ventas afectas`} />
              <span style={{ color: "var(--muted-2)", fontSize: 20 }}>−</span>
              <BItem label="Crédito fiscal" value={window.fmt$(credito)} sub={`${compras} compras con factura`} />
              <span style={{ color: "var(--muted-2)", fontSize: 20 }}>=</span>
              <BItem label="A pagar" value={window.fmt$(neto)} highlight />
            </div>
          </div>
          <div style={{ padding: "14px 24px", background: "var(--surface)", display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
                <span>Ventas del período · {ventas}</span>
                <span>Compras con factura · {compras}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--line-2)", overflow: "hidden" }} />
            </div>
            <button className="btn ghost" onClick={() => window.useApp().navigate("diario")}>
              <window.Ico name="sparkle" size={13} />Auto-clasificar pendientes
            </button>
            <button className="btn teal" onClick={() => showToast("Período cerrado", { icon: "lock" })}>
              <window.Ico name="check" size={13} />Cerrar período
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
          {/* ISR */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <div className="card-title" style={{ margin: 0 }}>ISR · Estimado 2025</div>
            </div>
            <div style={{ padding: 18 }}>
              {(() => {
                const detalle = rt.detalle || [];
                const ing = detalle.reduce((a, d) => a + (+d.ingresos_brutos || 0), 0) || +rt.ingresos_brutos || 73140;
                const ded = detalle.reduce((a, d) => a + (+d.gastos_deducibles || 0), 0) || +rt.gastos_deducibles || 29521.50;
                const base = detalle.reduce((a, d) => a + (+d.renta_neta || 0), 0) || +rt.renta_neta || 43618.50;
                const isr = +rt.total_impuesto || (detalle.reduce((a, d) => a + (+d.impuesto || 0), 0)) || 10904.63;
                const tasa = detalle[0]?.tipo_persona === "natural" ? "Natural · progresivo" : "25% (jurídica)";
                return (
                  <>
                    {[
                      ["Ingresos acumulados", window.fmt$(ing)],
                      ["Gastos deducibles", window.fmt$(ded)],
                      ["Base imponible", window.fmt$(base)],
                      ["Tasa aplicable", tasa],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line-2)" }}>
                        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{k}</span>
                        <span className="num mono" style={{ fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0 4px", borderTop: "2px solid var(--ink)", marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>ISR proyectado</span>
                      <span className="serif num" style={{ fontSize: 24 }}>{window.fmt$(isr)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                      Anticipo trimestral del 30% aplica para abril.
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Calendar */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
              <div className="card-title" style={{ margin: 0 }}>Calendario de obligaciones · Marzo–Abril</div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--red)" }} />DGI</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--blue)" }} />CSS</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--amber)" }} />Municipio</span>
              </div>
            </div>
            <CalendarMonth />
          </div>
        </div>
      </div>
    </>
  );
};

const BItem = ({ label, value, sub, highlight }) => (
  <div>
    <div className="xs">{label}</div>
    <div className="num mono" style={{ fontSize: 20, fontWeight: 700, color: highlight ? "var(--teal)" : "var(--ink)", marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 3 }}>{sub}</div>}
  </div>
);

const CalendarMonth = () => {
  const { showToast } = window.useApp();
  const days = Array.from({ length: 35 }, (_, i) => {
    const d = i - 5;
    return d > 0 && d <= 31 ? d : null;
  });
  const events = {
    7: [{ t: "Planilla CSS feb", tone: "blue" }],
    15: [{ t: "ITBMS marzo · F.430", tone: "red" }],
    20: [{ t: "Retenciones DGI", tone: "red" }],
    25: [{ t: "Impuesto municipal", tone: "amber" }],
    31: [{ t: "Renta natural 2024", tone: "red" }],
  };
  const today = 11;
  const dow = ["L", "M", "X", "J", "V", "S", "D"];
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {dow.map(d => <div key={d} className="xs" style={{ textAlign: "center", padding: "4px 0" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {days.map((d, i) => {
          const ev = d ? events[d] : null;
          const isToday = d === today;
          return (
            <div key={i} onClick={() => ev && showToast(ev.map(e => e.t).join(", "), { icon: "bell" })}
              style={{
                background: !d ? "transparent" : isToday ? "var(--ink)" : "var(--paper)",
                color: isToday ? "var(--bg)" : "var(--ink)",
                border: d ? "1px solid var(--line)" : "0",
                borderRadius: 7, padding: "6px 7px",
                minHeight: 58, display: "flex", flexDirection: "column", gap: 3,
                cursor: ev ? "pointer" : "default"
              }}>
              {d && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--gold)" : "var(--muted)" }}>{d}</div>
                  {ev && ev.map((e, k) => (
                    <div key={k} style={{
                      fontSize: 9.5, lineHeight: 1.2, padding: "2px 4px", borderRadius: 3,
                      background: e.tone === "red" ? "var(--red-bg)" : e.tone === "blue" ? "var(--blue-bg)" : "var(--amber-bg)",
                      color: e.tone === "red" ? "var(--red)" : e.tone === "blue" ? "#1E3F8C" : "#7A5610",
                      fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>{e.t}</div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { ScreenFiscal });
