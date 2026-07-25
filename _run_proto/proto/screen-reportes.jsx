// Screen: Reportes PDF — biblioteca de reportes generables, agrupados por categoría.

const REPORTES = [
  { cat: "Estados financieros", items: [
    { id: "er", t: "Estado de Resultados", d: "P&L del período seleccionado", time: "~3 seg", real: true, endpoint: "/reportes/estado-resultados" },
    { id: "bg", t: "Balance General", d: "Activos, pasivos y patrimonio al cierre", time: "~3 seg", real: false },
    { id: "fc", t: "Flujo de Caja", d: "Movimientos de efectivo del período", time: "~4 seg", real: false },
    { id: "cp", t: "Cambios en el Patrimonio", d: "Evolución del capital", time: "~3 seg", real: false },
  ]},
  { cat: "Cumplimiento DGI", items: [
    { id: "f430", t: "Formulario 430 ITBMS", d: "Declaración mensual de ITBMS", time: "~2 seg", real: true, urgent: true, endpoint: "/reportes/itbms" },
    { id: "iru", t: "Informe de Renta", d: "Para presentar declaración anual ISR", time: "~5 seg", real: false },
    { id: "ret", t: "Retenciones DGI", d: "Detalle de retenciones efectuadas", time: "~2 seg", real: false },
    { id: "f60", t: "Formulario 60", d: "Resumen anual operaciones", time: "~6 seg", real: false },
  ]},
  { cat: "Contabilidad", items: [
    { id: "dia", t: "Diario Combinado", d: "Asientos completos del período", time: "~5 seg", real: true, endpoint: "/reportes/diario" },
    { id: "may", t: "Libro Mayor", d: "Saldos por cuenta del catálogo", time: "~6 seg", real: false },
    { id: "bc", t: "Balance de Comprobación", d: "Verificación de cuadre por cuenta", time: "~4 seg", real: false },
    { id: "anal", t: "Análisis por cliente", d: "Detalle de ingresos y costos por cliente", time: "~3 seg", real: false },
  ]},
];

const ScreenReportes = () => {
  const { showToast, api, isLive, periodo, user } = window.useApp();
  const [generating, setGenerating] = React.useState(null);
  const [recent, setRecent] = React.useState([]);

  const generar = async (r) => {
    setGenerating(r.id);
    try {
      if (isLive && r.endpoint) {
        await api.pdf(`${r.endpoint}?periodo=${periodo}`, `${r.id}-${periodo}.pdf`);
        showToast(`${r.t} descargado ✓`, { icon: "download" });
      } else {
        await new Promise(res => setTimeout(res, 1100));
        showToast(`${r.t} generado (demo)`, { icon: "download" });
      }
      setRecent(prev => [{ t: r.t, date: "Ahora", who: (user && user.nombre) || "Tú", size: window.fmtPeriodo(periodo) }, ...prev].slice(0, 5));
    } catch (e) {
      showToast(e.message, { icon: "alert" });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Salida", "Reportes PDF"]}
        actions={
          <button className="btn ghost"><window.Ico name="history" size={13} />Historial</button>
        }
      />

      <div style={{ padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 22 }}>
        <div>
          {REPORTES.map(group => (
            <div key={group.cat} style={{ marginBottom: 26 }}>
              <div className="xs" style={{ color: "var(--teal)", marginBottom: 12 }}>· {group.cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {group.items.map(r => (
                  <div key={r.id} className="card" style={{ padding: "16px 18px", cursor: "pointer", position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{
                        width: 38, height: 46, background: r.real ? "var(--gold-soft)" : "var(--line-2)",
                        color: r.real ? "var(--amber)" : "var(--muted-2)",
                        borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "Instrument Serif, serif", fontSize: 12, fontWeight: 700
                      }}>PDF</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {r.urgent && <window.Pill tone="amber" dot>4 días</window.Pill>}
                        {!r.real && <window.Pill tone="grey">Próximamente</window.Pill>}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 12 }}>{r.t}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{r.d}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>{r.time}</span>
                      <button className="btn teal" disabled={!r.real || generating === r.id}
                        onClick={() => r.real && generar(r)}
                        style={{ padding: "6px 12px", fontSize: 11.5, opacity: r.real ? 1 : .4 }}>
                        {generating === r.id ? "Generando…" : <><window.Ico name="download" size={11} />Generar PDF</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="xs" style={{ color: "var(--teal)", marginBottom: 12 }}>· Recientes</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {recent.length > 0 ? recent.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: i === recent.length - 1 ? 0 : "1px solid var(--line-2)", cursor: "pointer" }}>
                <div style={{ width: 30, height: 38, background: "var(--gold-soft)", color: "var(--amber)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Instrument Serif, serif", fontSize: 10, fontWeight: 700 }}>PDF</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.t}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{r.date} · {r.who} · {r.size}</div>
                </div>
                <window.Ico name="download" size={13} color="var(--teal)" />
              </div>
            )) : (
              <div style={{ padding: "30px 18px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
                Aún no has generado reportes. Genera uno desde la columna de la izquierda.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { ScreenReportes });
