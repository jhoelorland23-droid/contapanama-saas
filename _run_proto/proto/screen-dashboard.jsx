// Screen: Dashboard. Interactive. Click KPIs to navigate. Click "next action" items to jump.
// In live mode fetches /dashboard + /transacciones; in demo mode uses mock data.

const MOCK_DASHBOARD = {
  periodo: "2025-03",
  clientes: { total: 50, activos: 47, omisos: 2, inactivos: 1 },
  financiero: { ingresos: 24580, gastos: 9840.50, utilidad: 14739.50, itbms_debito: 1720.60, itbms_credito: 688.44, itbms_neto: 1032.16 },
  vencimientos: [
    { id: 1, descripcion: "ITBMS marzo — Form. 430", entidad: "DGI", fecha: "2025-03-15", urgencia: "critica" },
    { id: 2, descripcion: "Renta natural 2024", entidad: "DGI · C. Méndez", fecha: "2025-03-31", urgencia: "alta" },
    { id: 3, descripcion: "Planilla CSS febrero", entidad: "CSS · Istmo S.A.", fecha: "2025-04-05", urgencia: "media" },
    { id: 4, descripcion: "Reporte fiscal Q1", entidad: "DGI · Distribuidora", fecha: "2025-04-15", urgencia: "baja" },
  ],
  evolucion: [
    ["Ene", 18.2, 9.1], ["Feb", 21.9, 10.2], ["Mar", 24.6, 9.8],
    ["Abr", 22.1, 11.4], ["May", 28.0, 12.7], ["Jun", 25.4, 10.9],
    ["Jul", 31.2, 14.1], ["Ago", 26.8, 12.5], ["Sep", 24.0, 9.9],
    ["Oct", 27.5, 11.8], ["Nov", 30.8, 13.2], ["Dic", 35.1, 15.4],
  ].map(([periodo, ingresos, gastos]) => ({ periodo: `2025-${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].indexOf(periodo)+1}`.replace(/-(\d)$/, '-0$1'), ingresos: ingresos * 1000, gastos: gastos * 1000 })),
};

const ScreenDashboard = () => {
  const { navigate, showToast, api, isLive, periodo, clienteId, clienteNombre } = window.useApp();
  const [drillTxn, setDrillTxn] = React.useState(null);
  const cli = clienteId ? `&cliente_id=${clienteId}` : "";

  const dash = window.useApiQuery(
    () => api.get(`/dashboard?periodo=${periodo}${cli}`),
    [periodo, isLive, clienteId],
    { enabled: isLive, fallback: MOCK_DASHBOARD }
  );
  const txns = window.useApiQuery(
    () => api.get(`/transacciones?periodo=${periodo}&limit=6${cli}`),
    [periodo, isLive, clienteId],
    { enabled: isLive, fallback: { data: MOCK_TXNS } }
  );

  // Use live data when available, otherwise mock
  const data = (isLive && dash.data) ? dash.data : MOCK_DASHBOARD;
  const txData = (isLive && txns.data) ? txns.data.data || [] : MOCK_TXNS;

  // IA proactiva: anomalías detectadas
  const insightsQ = window.useApiQuery(() => api.get(`/ai/insights?periodo=${periodo}`), [periodo, isLive], { enabled: isLive, fallback: null });
  const insights = (insightsQ.data && insightsQ.data.insights) || [];

  // Pendientes reales para el banner de estado (respetan cliente activo)
  const allTxns = window.useApiQuery(() => api.get(`/transacciones?periodo=${periodo}${cli}`), [periodo, isLive, clienteId], { enabled: isLive, fallback: null });
  const ocrStats = window.useApiQuery(() => api.get("/ocr/stats"), [isLive], { enabled: isLive, fallback: null });
  const feBorr = window.useApiQuery(() => api.get(`/fe/facturas?estado=borrador&limit=100${clienteId ? `&cliente_id=${clienteId}` : ""}`), [isLive, clienteId], { enabled: isLive, fallback: null });
  const pendings = isLive ? {
    sinClasificar: (allTxns.data && allTxns.data.data) ? allTxns.data.data.filter(t => !t.cuenta_contable).length : 0,
    ocrRevisar: ocrStats.data ? (+ocrStats.data.revisar || 0) : 0,
    feBorrador: (feBorr.data && feBorr.data.data) ? feBorr.data.data.length : 0,
  } : null;
  const totalPending = pendings ? pendings.sinClasificar + pendings.ocrRevisar + pendings.feBorrador : 0;
  const loadingPending = isLive && (allTxns.loading || ocrStats.loading || feBorr.loading);

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Dashboard"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => showToast("Exportando CSV…", { icon: "download" })}>
              <window.Ico name="download" size={13} />Exportar
            </button>
            <button className="btn primary" onClick={() => navigate("fe")}>
              <window.Ico name="plus" size={13} />Nueva FE
            </button>
          </>
        }
      />

      {/* Live-mode status banner */}
      {isLive && (dash.loading || dash.error) && (
        <div style={{
          padding: "8px 32px",
          background: dash.error ? "var(--red-bg)" : "var(--surface)",
          borderBottom: "1px solid var(--line)",
          fontSize: 12, color: dash.error ? "var(--red)" : "var(--muted)",
          display: "flex", alignItems: "center", gap: 10
        }}>
          <window.Ico name={dash.error ? "alert" : "globe"} size={13} />
          {dash.loading && <span>Cargando datos en vivo desde {window.useApp().tweaks.apiBase}…</span>}
          {dash.error && <span><b>{dash.error.message}</b> · Mostrando datos demo. <span onClick={dash.refetch} style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }}>Reintentar</span></span>}
        </div>
      )}

      <div style={{ padding: "24px 32px" }}>
        {isLive && !loadingPending && (
          totalPending === 0 ? (
            <div className="card" style={{ padding: "12px 16px", background: "var(--green-bg)", borderColor: "var(--green)", display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <window.Ico name="check" size={16} stroke={2.4} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0E5A3F" }}>Todo al día.</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Sin transacciones por clasificar, sin recibos pendientes, sin facturas en borrador.</div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: "14px 18px", background: "var(--amber-bg)", borderColor: "var(--amber)", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--amber)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700 }}>
                  {totalPending}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#7A5610" }}>
                  Tienes {totalPending} cosa{totalPending === 1 ? "" : "s"} pendiente{totalPending === 1 ? "" : "s"}:
                </div>
              </div>
              <div style={{ marginTop: 10, paddingLeft: 40, display: "flex", flexDirection: "column", gap: 6 }}>
                {pendings.sinClasificar > 0 && (
                  <div onClick={() => navigate("diario")} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", color: "var(--ink)" }}>
                    <span style={{ color: "var(--amber)" }}>●</span>
                    {pendings.sinClasificar} transacci{pendings.sinClasificar === 1 ? "ón" : "ones"} sin cuenta contable
                    <window.Ico name="arrowRight" size={12} color="var(--muted-2)" />
                  </div>
                )}
                {pendings.ocrRevisar > 0 && (
                  <div onClick={() => navigate("ocr")} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", color: "var(--ink)" }}>
                    <span style={{ color: "var(--amber)" }}>●</span>
                    {pendings.ocrRevisar} recibo{pendings.ocrRevisar === 1 ? "" : "s"} OCR por revisar
                    <window.Ico name="arrowRight" size={12} color="var(--muted-2)" />
                  </div>
                )}
                {pendings.feBorrador > 0 && (
                  <div onClick={() => navigate("fe")} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", color: "var(--ink)" }}>
                    <span style={{ color: "var(--amber)" }}>●</span>
                    {pendings.feBorrador} factura{pendings.feBorrador === 1 ? "" : "s"} en borrador
                    <window.Ico name="arrowRight" size={12} color="var(--muted-2)" />
                  </div>
                )}
              </div>
            </div>
          )
        )}
        <HeroLine fin={data.financiero} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 22 }}>
          <KpiCard label="Ingresos" value={+data.financiero.ingresos} sub="Del período" onClick={() => navigate("diario")} />
          <KpiCard label="Gastos operativos" value={+data.financiero.gastos} sub="Del período" onClick={() => navigate("diario")} />
          <KpiCard label="ITBMS neto a pagar" value={+data.financiero.itbms_neto} sub="A la DGI" tone="amber" onClick={() => navigate("fiscal")} />
          <KpiCard label="Clientes activos" value={+data.clientes.activos} prefix="" decimals={0} sub={`${data.clientes.omisos || 0} omisos`} onClick={() => navigate("clientes")} />
        </div>

        {/* IA proactiva — anomalías y patrones detectados */}
        {isLive && insights.length > 0 && (
          <div className="card" style={{ marginTop: 16, padding: "16px 20px", background: "var(--paper)", borderColor: "var(--gold)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <window.Ico name="sparkle" size={15} color="var(--gold)" />
              <div style={{ fontSize: 13, fontWeight: 700 }}>La IA detectó {insights.length} cosa{insights.length === 1 ? "" : "s"} para revisar</div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>Tu copiloto contable, mirando los libros por ti</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.slice(0, 5).map((it, i) => (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: 7, fontSize: 12.5,
                  background: it.severidad === "alta" ? "var(--red-bg)" : it.severidad === "media" ? "var(--amber-bg)" : "var(--surface)",
                  borderLeft: `3px solid ${it.severidad === "alta" ? "var(--red)" : it.severidad === "media" ? "var(--amber)" : "var(--muted-2)"}`,
                }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>{it.mensaje}</div>
                  {it.accion && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>→ {it.accion}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
          <EvolutionChart data={data.evolucion} isLive={isLive} />
          <Obligations items={data.vencimientos} />
        </div>

        <div style={{ marginTop: 16 }}>
          <RecentTxnsTable txns={txData} onRow={setDrillTxn} />
        </div>
      </div>

      <window.Drawer open={!!drillTxn} onClose={() => setDrillTxn(null)} title="Detalle de transacción"
        footer={
          <>
            <button className="btn ghost" onClick={() => setDrillTxn(null)}>Cerrar</button>
            <button className="btn primary" onClick={() => { setDrillTxn(null); navigate("diario"); }}>
              Ver en diario completo<window.Ico name="arrowRight" size={13} />
            </button>
          </>
        }>
        {drillTxn && <TxnDetail t={drillTxn} />}
      </window.Drawer>
    </>
  );
};

const HeroLine = ({ fin }) => {
  const utilidad = +fin.ingresos - +fin.gastos;
  return (
    <div style={{ padding: "8px 0 18px", borderBottom: "1px solid var(--line)" }}>
      <div className="xs" style={{ color: "var(--teal)" }}>· Resultado del período</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
        <span className="serif num" style={{ fontSize: 64, lineHeight: 1, letterSpacing: "-0.025em" }}>{window.fmt$(utilidad)}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
        Utilidad antes de impuestos
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, hint }) => (
  <div>
    <div className="xs">{label}</div>
    <div className="num" style={{ fontSize: 19, fontWeight: 700, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{hint}</div>
  </div>
);

const KpiCard = ({ label, value, delta, sub, tone, prefix = "$", decimals = 2, onClick }) => {
  const v = prefix + new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  const up = delta != null && delta > 0;
  return (
    <div className="card" onClick={onClick} style={{ padding: "16px 18px", cursor: "pointer", transition: "transform 120ms ease, border-color 120ms" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--muted-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; }}>
      <div className="xs">{label}</div>
      <div className="serif num" style={{ fontSize: "var(--kpi-num)", lineHeight: 1, letterSpacing: "-0.02em", marginTop: 8 }}>{v}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</div>
        {delta != null && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: up ? "var(--green)" : tone === "amber" ? "var(--amber)" : "var(--muted)"
          }}>
            {up ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
};

const EvolutionChart = ({ data: raw, isLive }) => {
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const realData = (raw && raw.length)
    ? raw.map(r => {
        const m = parseInt((r.periodo || "").slice(5, 7)) - 1;
        return [months[m] || "—", +r.ingresos / 1000, +r.gastos / 1000];
      })
    : null;

  // En modo live, si hay menos de 2 períodos con datos: estado vacío honesto.
  if (isLive && (!realData || realData.length < 2)) {
    return (
      <div className="card" style={{ padding: "26px 22px", minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="card-title" style={{ margin: 0 }}>Ingresos vs. gastos</div>
        <div style={{ marginTop: 22, textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
          Aún no hay suficiente historial para mostrar la evolución.<br />
          Registra movimientos en al menos dos períodos y aparecerá aquí.
        </div>
      </div>
    );
  }

  const data = realData || [
    ["Ene", 18.2, 9.1], ["Feb", 21.9, 10.2], ["Mar", 24.6, 9.8],
    ["Abr", 22.1, 11.4], ["May", 28.0, 12.7], ["Jun", 25.4, 10.9],
    ["Jul", 31.2, 14.1], ["Ago", 26.8, 12.5], ["Sep", 24.0, 9.9],
    ["Oct", 27.5, 11.8], ["Nov", 30.8, 13.2], ["Dic", 35.1, 15.4],
  ];
  const initialHover = data.findIndex(d => d[0] === "Mar");
  const [hover, setHover] = React.useState(initialHover >= 0 ? initialHover : data.length - 1);
  const max = 38;
  const W = 700, H = 240, P = { l: 36, r: 18, t: 12, b: 26 };
  const cw = (W - P.l - P.r) / data.length;
  const ix = (i) => P.l + cw * i + cw / 2;
  const iy = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const ingPath = data.map((d, i) => `${i ? "L" : "M"}${ix(i)},${iy(d[1])}`).join(" ");
  const gasPath = data.map((d, i) => `${i ? "L" : "M"}${ix(i)},${iy(d[2])}`).join(" ");
  const ingArea = `${ingPath} L${ix(data.length - 1)},${H - P.b} L${ix(0)},${H - P.b} Z`;

  return (
    <div className="card" style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>Ingresos vs. gastos · 2025</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {data[hover][0]} ·
            <b className="num" style={{ color: "var(--teal)", margin: "0 6px" }}>${data[hover][1].toFixed(1)}k</b>
            ingresos ·
            <b className="num" style={{ color: "var(--gold)", margin: "0 6px" }}>${data[hover][2].toFixed(1)}k</b>
            gastos
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--muted)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 2.5, background: "var(--teal)" }} />Ingresos</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 2.5, background: "var(--gold)" }} />Gastos</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 240 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="tealfade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0F4C4A" stopOpacity=".18" />
            <stop offset="100%" stopColor="#0F4C4A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((p, i) => {
          const y = P.t + p * (H - P.t - P.b);
          return (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="#EFEDE4" strokeWidth="1" />
              <text x={P.l - 6} y={y + 3} fontSize="9" fill="#8A949B" textAnchor="end" fontFamily="JetBrains Mono">
                ${Math.round((1 - p) * max)}k
              </text>
            </g>
          );
        })}
        <rect x={ix(hover) - cw / 2 + 4} y={P.t} width={cw - 8} height={H - P.t - P.b} fill="#FBF6E7" rx="4" />
        <path d={ingArea} fill="url(#tealfade)" />
        <path d={ingPath} stroke="#0F4C4A" strokeWidth="1.8" fill="none" />
        <path d={gasPath} stroke="#C9A75C" strokeWidth="1.8" fill="none" />
        {data.map((d, i) => (
          <g key={d[0]} onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }}>
            <rect x={ix(i) - cw / 2} y={P.t} width={cw} height={H - P.t - P.b} fill="transparent" />
            <circle cx={ix(i)} cy={iy(d[1])} r={i === hover ? 4 : 2.5} fill="#fff" stroke="#0F4C4A" strokeWidth="1.6" />
            <circle cx={ix(i)} cy={iy(d[2])} r={i === hover ? 3.5 : 2.5} fill="#fff" stroke="#C9A75C" strokeWidth="1.6" />
            <text x={ix(i)} y={H - 10} fontSize="9.5" fill={i === hover ? "var(--ink)" : "#8A949B"} textAnchor="middle" fontFamily="Inter Tight" fontWeight={i === hover ? 700 : 400}>{d[0]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const NextActions = () => {
  const { navigate, showToast } = window.useApp();
  const items = [
    { icon: "alert", tone: "red", t: "3 transacciones sin clasificar", d: "Motor → Auto-clasificar", go: () => navigate("diario") },
    { icon: "tax", tone: "amber", t: "ITBMS marzo vence en 4 días", d: "Generar Form. 430 · $1,032.16", go: () => navigate("fiscal") },
    { icon: "sparkle", tone: "teal", t: "5 recibos esperando en bandeja OCR", d: "Revisar y aprobar asientos", go: () => navigate("ocr") },
    { icon: "send", tone: "muted", t: "Constructora Istmo: cobrar FE-2451", d: "$4,200 vencida hace 3 días", go: () => showToast("Recordatorio enviado por WhatsApp", { icon: "check" }) },
  ];
  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--line-2)" }}>
        <div className="card-title" style={{ margin: 0 }}>Tu próxima acción</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Ordenado por urgencia y valor</div>
      </div>
      <div style={{ flex: 1 }}>
        {items.map((it, i) => (
          <div key={i} onClick={it.go} style={{
            display: "flex", gap: 12, padding: "13px 20px", cursor: "pointer",
            borderBottom: i === items.length - 1 ? 0 : "1px solid var(--line-2)",
            transition: "background 120ms"
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: it.tone === "red" ? "var(--red-bg)" : it.tone === "amber" ? "var(--amber-bg)" :
                          it.tone === "teal" ? "var(--teal-50)" : "var(--line-2)",
              color: it.tone === "red" ? "var(--red)" : it.tone === "amber" ? "var(--amber)" :
                     it.tone === "teal" ? "var(--teal)" : "var(--muted)"
            }}>
              <window.Ico name={it.icon} size={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{it.t}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{it.d}</div>
            </div>
            <window.Ico name="arrowRight" size={13} color="var(--muted-2)" />
          </div>
        ))}
      </div>
    </div>
  );
};

const MOCK_TXNS = [
  { id: 1, f: "12 mar", fecha: "2025-03-12", d: "Honorarios — Constructora Istmo S.A.", descripcion: "Honorarios — Constructora Istmo S.A.", cli: "Constructora Istmo S.A.", cliente_nombre: "Constructora Istmo S.A.", cta: "4101 Ingresos por servicios", tipo: "ingreso", monto: 4200, itbms: 294, doc: "FE-2451" },
  { id: 2, f: "10 mar", fecha: "2025-03-10", d: "Cuota préstamo BG cuenta operativa", descripcion: "Cuota préstamo BG", cli: "Banco General", cliente_nombre: "Banco General", cta: "2110 Préstamos por pagar", tipo: "gasto", monto: 950, itbms: 0, doc: "REF-8821" },
  { id: 3, f: "08 mar", fecha: "2025-03-08", d: "Pago alquiler oficina marzo", descripcion: "Alquiler oficina marzo", cli: "Inmobiliaria Bella Vista", cliente_nombre: "Inmobiliaria Bella Vista", cta: "5210 Alquileres", tipo: "gasto", monto: 1800, itbms: 0, doc: "ALQ-MAR" },
  { id: 4, f: "07 mar", fecha: "2025-03-07", d: "Compra papelería Office Depot", descripcion: "Compra papelería", cli: "Office Depot", cliente_nombre: "Office Depot", cta: "5260 Materiales oficina", tipo: "gasto", monto: 420.50, itbms: 29.44, doc: "FE-1188" },
  { id: 5, f: "05 mar", fecha: "2025-03-05", d: "Servicios contables — C. Méndez", descripcion: "Servicios contables", cli: "Carlos Méndez Palacios", cliente_nombre: "C. Méndez Palacios", cta: "4101 Ingresos por servicios", tipo: "ingreso", monto: 1500, itbms: 105, doc: "FE-2440" },
  { id: 6, f: "03 mar", fecha: "2025-03-03", d: "Honorarios — Distribuidora Sur", descripcion: "Honorarios auditoría Q1", cli: "Distribuidora Sur S.A.", cliente_nombre: "Distribuidora Sur", cta: "4101 Ingresos por servicios", tipo: "ingreso", monto: 6800, itbms: 476, doc: "FE-2435" },
];

const RecentTxnsTable = ({ txns, onRow }) => {
  const [filter, setFilter] = React.useState("Todos");
  // Normalize backend records to the shape this component needs
  const normalized = (txns || []).map(t => ({
    id: t.id,
    f: t.f || (t.fecha ? new Date(t.fecha).toLocaleDateString("es-PA", { day: "2-digit", month: "short" }) : "—"),
    d: t.d || t.descripcion || "Sin descripción",
    cli: t.cli || t.cliente_nombre || "—",
    cta: t.cta || t.cuenta_contable || "—",
    tipo: (t.tipo === "ingreso" || t.tipo === "ing") ? "ing" : "egr",
    monto: +t.monto || 0,
    itbms: +t.itbms || 0,
    doc: t.doc || t.documento || "—",
    fecha: t.fecha,
    descripcion: t.descripcion,
  }));
  const filtered = normalized.filter(t =>
    filter === "Todos" ? true :
    filter === "Ingresos" ? t.tipo === "ing" :
    filter === "Gastos" ? t.tipo === "egr" : true
  ).slice(0, 6);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title" style={{ margin: 0 }}>Últimos movimientos</div>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
          {["Todos", "Ingresos", "Gastos"].map(f => (
            <span key={f} onClick={() => setFilter(f)} style={{
              cursor: "pointer",
              color: filter === f ? "var(--ink)" : "var(--muted)",
              fontWeight: filter === f ? 700 : 500
            }}>{f}</span>
          ))}
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Fecha</th>
            <th>Descripción</th>
            <th className="r">Monto</th>
            <th className="r">ITBMS</th>
            <th style={{ width: 70 }}>Doc.</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id} onClick={() => onRow(r)}>
              <td className="muted mono" style={{ fontSize: 11.5 }}>{r.f}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{r.d}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 2 }}>{r.cta}</div>
              </td>
              <td className="r num mono" style={{ fontWeight: 700, color: r.tipo === "ing" ? "var(--green)" : "var(--ink)" }}>
                {r.tipo === "ing" ? "+" : "−"}{window.fmt$(r.monto)}
              </td>
              <td className="r num mono muted">{r.itbms ? window.fmt$(r.itbms) : "—"}</td>
              <td className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>{r.doc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Obligations = ({ items: rawItems }) => {
  const { navigate } = window.useApp();
  // Map backend vencimientos shape → display shape
  const items = (rawItems && rawItems.length > 0)
    ? rawItems.map(v => {
        const d = new Date(v.fecha);
        const today = new Date("2025-03-11");
        const days = Math.max(0, Math.round((d - today) / 86400000));
        const fmt = d.toLocaleDateString("es-PA", { day: "2-digit", month: "short" });
        const toneMap = { critica: "red", alta: "amber", media: "amber", baja: "muted" };
        return {
          date: fmt, days, t: v.descripcion,
          e: [v.cliente_nombre, v.entidad].filter(Boolean).join(" · ") || "DGI",
          amt: v.monto ? window.fmt$(+v.monto) : "—",
          tone: toneMap[v.urgencia] || "muted",
        };
      }).slice(0, 4)
    : [
        { date: "15 mar", days: 4, t: "ITBMS marzo — Form. 430", e: "DGI", amt: "$1,032.16", tone: "red" },
        { date: "31 mar", days: 20, t: "Renta natural 2024", e: "DGI · C. Méndez", amt: "—", tone: "amber" },
        { date: "05 abr", days: 25, t: "Planilla CSS febrero", e: "CSS · Istmo S.A.", amt: "$2,840", tone: "amber" },
        { date: "15 abr", days: 35, t: "Reporte fiscal Q1", e: "DGI · Distribuidora", amt: "—", tone: "muted" },
      ];
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
        <div className="card-title" style={{ margin: 0 }}>Obligaciones próximas</div>
        <span onClick={() => navigate("fiscal")} style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600, cursor: "pointer" }}>Ver calendario →</span>
      </div>
      {items.map((it, i) => (
        <div key={i} onClick={() => navigate("fiscal")} style={{
          display: "grid", gridTemplateColumns: "56px 1fr auto",
          gap: 14, padding: "14px 20px", cursor: "pointer",
          borderBottom: i === items.length - 1 ? 0 : "1px solid var(--line-2)",
          alignItems: "center"
        }}>
          <div style={{
            textAlign: "center", padding: "6px 0",
            background: it.tone === "red" ? "var(--red-bg)" : it.tone === "amber" ? "var(--amber-bg)" : "var(--line-2)",
            borderRadius: 6
          }}>
            <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: it.tone === "red" ? "var(--red)" : it.tone === "amber" ? "var(--amber)" : "var(--muted)" }}>
              {it.date.toUpperCase()}
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>{it.days}d</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.t}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{it.e}</div>
          </div>
          <div className="num mono" style={{ fontWeight: 700, fontSize: 13 }}>{it.amt}</div>
        </div>
      ))}
    </div>
  );
};

const TxnDetail = ({ t }) => (
  <div>
    <window.Pill tone={t.tipo === "ing" ? "green" : "grey"} dot>{t.tipo === "ing" ? "Ingreso" : "Egreso"}</window.Pill>
    <h2 className="serif" style={{ fontSize: 28, marginTop: 12, fontWeight: 400 }}>{t.d}</h2>
    <div className="num mono" style={{ fontSize: 42, fontWeight: 700, marginTop: 14, color: t.tipo === "ing" ? "var(--green)" : "var(--ink)" }}>
      {t.tipo === "ing" ? "+" : "−"}{window.fmt$(t.monto)}
    </div>

    <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {[
        ["Fecha", t.f + " 2025"],
        ["Cliente / contraparte", t.cli],
        ["Cuenta contable", t.cta],
        ["ITBMS", t.itbms ? window.fmt$(t.itbms) : "—"],
        ["Documento", t.doc],
        ["Estado", "Conciliado"],
      ].map(([k, v]) => (
        <div key={k}>
          <div className="xs">{k}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{v}</div>
        </div>
      ))}
    </div>

    <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--teal-50)", borderRadius: 10 }}>
      <div className="card-title" style={{ margin: 0, color: "var(--teal-700)" }}>Asiento generado</div>
      <div className="mono" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", color: "var(--muted)", fontSize: 10.5, paddingBottom: 4, borderBottom: "1px solid var(--line-2)" }}>
          <span>Cuenta</span><span style={{ textAlign: "right" }}>Debe</span><span style={{ textAlign: "right" }}>Haber</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", paddingTop: 6 }}>
          <span>1101 Caja</span><span style={{ textAlign: "right" }}>{window.fmt$(t.monto + t.itbms)}</span><span style={{ textAlign: "right" }}>—</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px" }}>
          <span>{t.cta}</span><span style={{ textAlign: "right" }}>—</span><span style={{ textAlign: "right" }}>{window.fmt$(t.monto)}</span>
        </div>
        {t.itbms > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px" }}>
            <span>2201 ITBMS débito fiscal</span><span style={{ textAlign: "right" }}>—</span><span style={{ textAlign: "right" }}>{window.fmt$(t.itbms)}</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

Object.assign(window, { ScreenDashboard });
