// Screen: Bandeja OCR — navegable. Click recibo en queue para ver, aprobar/rechazar.

const RECEIPTS = [
  { id: 1, vendor: "Office Depot Panamá", date: "07 mar", amt: 420.50, subtotal: 391.06, itbms: 29.44, status: "review", cuenta: "5260", cuentaN: "Materiales oficina", conf: 96, ruc: "8-NT-1-12345" },
  { id: 2, vendor: "Estación Texaco Costa del Este", date: "06 mar", amt: 45.20, subtotal: 45.20, itbms: 0, status: "review", cuenta: "5240", cuentaN: "Transporte", conf: 99, ruc: "8-NT-1-22310" },
  { id: 3, vendor: "+Móvil S.A.", date: "08 mar", amt: 145.80, subtotal: 135.59, itbms: 10.21, status: "review", cuenta: "5310", cuentaN: "Servicios públicos", conf: 94, ruc: "8-NT-1-08000" },
  { id: 4, vendor: "Riba Smith Multiplaza", date: "11 mar", amt: 87.40, subtotal: 87.40, itbms: 0, status: "review", cuenta: "5410", cuentaN: "Atenciones a clientes", conf: 78, ruc: "8-NT-1-11140", low: true },
  { id: 5, vendor: "Felipe Motta", date: "11 mar", amt: 312.00, subtotal: 290.16, itbms: 21.84, status: "review", cuenta: "5410", cuentaN: "Atenciones a clientes", conf: 88, ruc: "8-NT-1-04250" },
  { id: 6, vendor: "Inmobiliaria Bella Vista", date: "08 mar", amt: 1800, subtotal: 1800, itbms: 126, status: "done", cuenta: "5210", cuentaN: "Alquileres", conf: 100, ruc: "8-NT-1-09988" },
  { id: 7, vendor: "Bufete Arrocha & Asoc.", date: "07 mar", amt: 750, subtotal: 697.50, itbms: 52.50, status: "done", cuenta: "5340", cuentaN: "Honorarios legales", conf: 100, ruc: "8-NT-1-10010" },
];

const OCR_STATUS = { revisar: "review", aprobado: "done", rechazado: "rejected", procesando: "processing", pendiente: "processing", error: "error" };

const ScreenOCR = () => {
  const { showToast, api, isLive, tweaks } = window.useApp();
  const [selId, setSelId] = React.useState(null);
  const [tab, setTab] = React.useState("review");
  const [statuses, setStatuses] = React.useState(Object.fromEntries(RECEIPTS.map(r => [r.id, r.status])));
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);

  const recibosQ = window.useApiQuery(
    () => api.get(`/ocr/recibos?limit=100`),
    [isLive],
    { enabled: isLive, fallback: null }
  );

  // Origen del backend para imágenes (apiBase sin el sufijo /api)
  const apiOrigin = (tweaks.apiBase || "").replace(/\/api\/?$/, "");

  // Lista normalizada: live (backend) o demo (RECEIPTS)
  const receipts = React.useMemo(() => {
    if (isLive && recibosQ.data && recibosQ.data.data) {
      return recibosQ.data.data.map(r => ({
        id: r.id,
        vendor: r.proveedor_extracted || r.archivo_nombre || "Recibo",
        date: r.fecha_extracted ? new Date(r.fecha_extracted).toLocaleDateString("es-PA", { day: "2-digit", month: "short" }) : "—",
        amt: +(r.total_extracted != null ? r.total_extracted : ((+r.subtotal_extracted || 0) + (+r.itbms_extracted || 0))) || 0,
        subtotal: +r.subtotal_extracted || 0,
        itbms: +r.itbms_extracted || 0,
        status: OCR_STATUS[r.estado] || "processing",
        cuenta: r.cuenta_sugerida || "—",
        cuentaN: r.cuenta_sugerida_nombre || "Sin clasificar",
        conf: Math.round(+r.cuenta_sugerida_conf || +r.confianza || 0),
        ruc: r.ruc_extracted || "—",
        doc: r.documento_extracted || "—",
        img: r.archivo_url ? apiOrigin + r.archivo_url : null,
      }));
    }
    return RECEIPTS.map(r => ({ ...r, status: statuses[r.id], img: null }));
  }, [isLive, recibosQ.data, statuses]);

  // Selección por defecto
  React.useEffect(() => {
    if (!receipts.length) { if (selId !== null) setSelId(null); return; }
    if (selId == null || !receipts.some(r => r.id === selId)) {
      const first = receipts.find(r => r.status === "review") || receipts[0];
      setSelId(first.id);
    }
  }, [receipts, selId]);

  const queue = receipts.filter(r => tab === "all" ? true : r.status === tab);
  const sel = receipts.find(r => r.id === selId) || null;

  const counts = {
    review: receipts.filter(r => r.status === "review").length,
    done: receipts.filter(r => r.status === "done").length,
    rejected: receipts.filter(r => r.status === "rejected").length,
  };

  const onUploadClick = () => {
    if (!isLive) { showToast("Subir recibos (demo)", { icon: "upload" }); return; }
    fileRef.current && fileRef.current.click();
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const token = localStorage.getItem("cp3_token");
      const res = await fetch(`${tweaks.apiBase}/ocr/recibos`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Error ${res.status}`); }
      showToast("Recibo subido — procesando…", { icon: "upload" });
      setTab("review");
      setTimeout(() => recibosQ.refetch(), 1200);
      setTimeout(() => recibosQ.refetch(), 2800);
    } catch (err) {
      showToast(err.message || "No se pudo subir el recibo");
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!sel) return;
    if (!isLive) {
      setStatuses({ ...statuses, [selId]: "done" });
      showToast(`Asentado: ${sel.vendor} · ${window.fmt$(sel.amt)}`, { icon: "check" });
      return;
    }
    setBusy(true);
    try {
      const r = await api.patch(`/ocr/recibos/${sel.id}/aprobar`, {});
      showToast(`Asentado: ${sel.vendor} · ${window.fmt$(sel.amt)}`, { icon: "check" });
      setSelId(null);
      recibosQ.refetch();
    } catch (e) { showToast(e.message || "No se pudo aprobar"); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    if (!sel) return;
    if (!isLive) {
      setStatuses({ ...statuses, [selId]: "rejected" });
      showToast(`Rechazado: ${sel.vendor}`, { icon: "x" });
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/ocr/recibos/${sel.id}/rechazar`, {});
      showToast(`Rechazado: ${sel.vendor}`, { icon: "x" });
      setSelId(null);
      recibosQ.refetch();
    } catch (e) { showToast(e.message || "No se pudo rechazar"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={onFile} />
      <window.Topbar
        crumbs={["Inicio", "Operación", "Bandeja OCR"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => showToast("Captura con celular (próximamente)", { icon: "camera" })}>
              <window.Ico name="camera" size={13} />Capturar con celular
            </button>
            <button className="btn primary" disabled={busy} onClick={onUploadClick}>
              <window.Ico name="upload" size={13} />{busy ? "Subiendo…" : "Subir recibos"}
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 380px", height: "calc(100vh - 60px)", borderTop: "1px solid var(--line)" }}>
        {/* Queue */}
        <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--paper)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
            <div className="card-title" style={{ margin: 0 }}>Bandeja</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 11.5 }}>
              {[
                ["review", `Por revisar (${counts.review})`],
                ["done", `Procesados (${counts.done})`],
                ["rejected", `Rechazados (${counts.rejected})`],
              ].map(([k, l]) => (
                <span key={k} onClick={() => setTab(k)} style={{
                  cursor: "pointer",
                  color: tab === k ? "var(--ink)" : "var(--muted)",
                  fontWeight: tab === k ? 700 : 500
                }}>{l}</span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {queue.map(r => {
              const isSel = r.id === selId;
              return (
                <div key={r.id} onClick={() => setSelId(r.id)} style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--line-2)",
                  background: isSel ? "var(--surface)" : "transparent",
                  borderLeft: isSel ? "3px solid var(--teal)" : "3px solid transparent",
                  display: "flex", gap: 12, cursor: "pointer"
                }}>
                  <div style={{
                    width: 32, height: 40, background: "var(--line-2)", borderRadius: 4,
                    flexShrink: 0, position: "relative", overflow: "hidden"
                  }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 2px, transparent 2px 5px)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{r.date} · <b className="num mono">{window.fmt$(r.amt)}</b></div>
                    <div style={{ marginTop: 4 }}>
                      {r.status === "done" ? <window.Pill tone="green" dot>Asentado</window.Pill> :
                       r.status === "rejected" ? <window.Pill tone="red" dot>Rechazado</window.Pill> :
                       r.status === "processing" ? <window.Pill tone="grey" dot>Procesando…</window.Pill> :
                       r.status === "error" ? <window.Pill tone="red" dot>Error</window.Pill> :
                       <window.Pill tone={(r.conf && r.conf < 85) || r.low ? "amber" : "blue"} dot>IA {r.conf}%</window.Pill>}
                    </div>
                  </div>
                </div>
              );
            })}
            {queue.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Nada por aquí.</div>
            )}
          </div>
        </div>

        {/* Receipt preview */}
        <div style={{ background: "#F0EFE7", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          {sel ? (
            <>
              {sel.img
                ? <img src={sel.img} alt={sel.vendor} style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain", background: "#fff", padding: 8, boxShadow: "0 10px 30px rgba(0,0,0,.12)", borderRadius: 6 }} />
                : <ReceiptMock sel={sel} />}
              <div style={{ position: "absolute", left: 24, top: 24, padding: "8px 12px", background: "var(--ink)", color: "var(--bg)", borderRadius: 7, fontSize: 11.5, display: "flex", gap: 8, alignItems: "center" }}>
                <window.Ico name="sparkle" size={13} color="var(--gold)" />
                <span>OCR + IA · {sel.conf}% confianza</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Sin recibo seleccionado</div>
              <div style={{ fontSize: 12.5, marginTop: 6 }}>{isLive ? 'Usa "Subir recibos" para empezar.' : "Selecciona un recibo de la bandeja."}</div>
            </div>
          )}
        </div>

        {/* Extract panel */}
        <div style={{ borderLeft: "1px solid var(--line)", background: "var(--paper)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
            <div className="card-title" style={{ margin: 0 }}>Datos extraídos</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Revisa los datos antes de contabilizar.</div>
          </div>

          {sel ? (
            <>
              <div style={{ padding: "14px 20px", flex: 1, overflowY: "auto" }}>
                <ExtractField label="Proveedor" value={sel.vendor} matched={sel.ruc && sel.ruc !== "—" ? `RUC ${sel.ruc}` : null} />
                <ExtractField label="Fecha" value={sel.date} />
                <ExtractField label="Subtotal" value={window.fmt$(sel.subtotal)} />
                <ExtractField label="ITBMS 7%" value={sel.itbms ? window.fmt$(sel.itbms) : "$0.00"} />
                <ExtractField label="Total" value={window.fmt$(sel.amt)} big />

                <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--teal-50)", borderRadius: 8, border: "1px solid #BCD7D2" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <window.Ico name="sparkle" size={14} color="var(--teal)" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--teal-700)" }}>Asiento sugerido</span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11.5 }}>
                    <JEntry cta={sel.cuenta} name={sel.cuentaN} debe={window.fmt$(sel.subtotal)} />
                    {sel.itbms > 0 && <JEntry cta="2201" name="ITBMS crédito fiscal" debe={window.fmt$(sel.itbms)} />}
                    <JEntry cta="1101" name="Caja general" haber={window.fmt$(sel.amt)} />
                  </div>
                </div>
              </div>

              {sel.status === "review" ? (
                <div style={{ borderTop: "1px solid var(--line)", padding: "14px 20px", display: "flex", gap: 8 }}>
                  <button className="btn ghost" disabled={busy} onClick={reject} style={{ flex: 1, justifyContent: "center" }}>
                    <window.Ico name="x" size={13} color="var(--muted)" />Rechazar
                  </button>
                  <button className="btn teal" disabled={busy} onClick={approve} style={{ flex: 2, justifyContent: "center" }}>
                    <window.Ico name="check" size={13} />{busy ? "Procesando…" : "Aprobar y contabilizar"}
                  </button>
                </div>
              ) : (
                <div style={{ borderTop: "1px solid var(--line)", padding: "14px 20px" }}>
                  <window.Pill tone={sel.status === "done" ? "green" : sel.status === "rejected" ? "red" : "grey"} dot>
                    {sel.status === "done" ? "Asentado" : sel.status === "rejected" ? "Rechazado" : sel.status === "processing" ? "Procesando…" : "—"}
                  </window.Pill>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
              {isLive ? "Sube un recibo para ver sus datos." : "Selecciona un recibo."}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const ExtractField = ({ label, value, matched, big = false }) => (
  <div style={{ padding: "9px 0", borderBottom: "1px solid var(--line-2)" }}>
    <div className="xs" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ color: "var(--teal)", fontSize: 9.5, fontWeight: 700 }}>● DETECTADO</span>
    </div>
    <div className="num" style={{ fontSize: big ? 22 : 14, fontWeight: 700, marginTop: 4, letterSpacing: big ? "-0.01em" : "0" }}>{value}</div>
    {matched && <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>↳ {matched}</div>}
  </div>
);

const JEntry = ({ cta, name, debe, haber }) => (
  <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 78px 78px", padding: "5px 0", fontSize: 11.5, alignItems: "baseline" }}>
    <span className="mono" style={{ color: "var(--teal-700)", fontWeight: 700 }}>{cta}</span>
    <span style={{ color: "var(--ink)" }}>{name}</span>
    <span className="num mono" style={{ textAlign: "right", fontWeight: 600 }}>{debe || ""}</span>
    <span className="num mono" style={{ textAlign: "right", fontWeight: 600 }}>{haber || ""}</span>
  </div>
);

const ReceiptMock = ({ sel }) => (
  <div style={{
    width: 320, background: "#fff", padding: "26px 26px",
    boxShadow: "0 10px 30px rgba(0,0,0,.08)",
    fontFamily: "JetBrains Mono, monospace",
    transform: "rotate(-1.2deg)"
  }}>
    <div style={{ textAlign: "center", borderBottom: "1px dashed #ccc", paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{sel.vendor.toUpperCase()}</div>
      <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>RUC {sel.ruc}</div>
    </div>
    <div style={{ fontSize: 10, color: "#444", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Fecha:</span><span>{sel.date}/2025</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Documento:</span><span>FE-{sel.id.toString().padStart(4, "0")}</span></div>
    </div>
    <div style={{ fontSize: 10.5, lineHeight: 1.8, color: "#222" }}>
      {sel.id === 1 && <>Papel A4 5x · · · · · · · 62.50<br/>Carpetas · · · · · · · · 48.00<br/>Tinta HP color · · · · · 127.50<br/>Calculadora · · · · · · · 89.00<br/>Bolígrafos · · · · · · · · 18.50<br/>Etiquetas · · · · · · · · 27.20<br/>Folders · · · · · · · · · 18.36</>}
      {sel.id === 2 && <>Gasolina 91 · · · · · · · 45.20</>}
      {sel.id === 3 && <>Plan corporativo · · · · 99.00<br/>Internet fibra · · · · · 46.80</>}
      {sel.id === 4 && <>Atención clientes · · · · 87.40</>}
      {sel.id === 5 && <>Vino Malbec x2 · · · · · 124.00<br/>Whisky 12 años · · · · · 188.00</>}
      {sel.id === 6 && <>Alquiler marzo · · · · · 1800.00</>}
      {sel.id === 7 && <>Honorarios marzo · · · · 697.50</>}
    </div>
    <div style={{ borderTop: "1px dashed #ccc", marginTop: 12, paddingTop: 8, fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>SUBTOTAL</span><span>{sel.subtotal.toFixed(2)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>ITBMS</span><span>{sel.itbms.toFixed(2)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 700, fontSize: 13 }}><span>TOTAL</span><span>{sel.amt.toFixed(2)}</span></div>
    </div>
  </div>
);

Object.assign(window, { ScreenOCR });
