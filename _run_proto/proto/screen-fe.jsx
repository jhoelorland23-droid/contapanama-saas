// Screen: Factura Electrónica — flujo completo de 4 pasos
// 1) Cliente + datos · 2) Líneas · 3) Revisar y validar · 4) Firmar y transmitir

const FE_CONDICION = {
  "Contado": "contado",
  "Crédito · 15 días": "credito_15",
  "Crédito · 30 días": "credito_30",
  "Crédito · 45 días": "credito_45",
};

const ScreenFE = () => {
  const { showToast, api, isLive, tweaks } = window.useApp();
  const [step, setStep] = React.useState(0);
  const [transmitting, setTransmitting] = React.useState(false);
  const [transmitted, setTransmitted] = React.useState(false);
  const [cufe, setCufe] = React.useState(null);
  const [mode, setMode] = React.useState("list");

  const [data, setData] = React.useState({
    cliente: "Constructora Istmo S.A.",
    cliente_id: null,
    ruc: "155-789-1-2024",
    dv: "47",
    punto: "001-002 · Oficina central",
    fecha: "2025-03-20",
    condicion: "Crédito · 30 días",
    lineas: [
      { id: 1, desc: "Honorarios profesionales — Auditoría Q1 2025", cant: 1, p: 6800, itbms: true, cuenta: "4101" },
      { id: 2, desc: "Asesoría tributaria mes de marzo", cant: 1, p: 1200, itbms: true, cuenta: "4101" },
    ],
  });

  const STEPS = [
    { tag: "Receptor", desc: "Cliente y datos fiscales" },
    { tag: "Líneas", desc: "Productos / servicios" },
    { tag: "Revisar", desc: "Validar antes de firmar" },
    { tag: "Transmitir", desc: "Enviar al PAC" },
  ];

  const sub = data.lineas.reduce((a, l) => a + l.cant * l.p, 0);
  const itbms = data.lineas.reduce((a, l) => a + (l.itbms ? l.cant * l.p * 0.07 : 0), 0);
  const tot = sub + itbms;

  const transmit = async () => {
    if (!isLive) {
      setTransmitting(true);
      setTimeout(() => {
        setTransmitting(false); setTransmitted(true);
        setCufe("FE0100000-0000000-2-DEMO-" + Math.random().toString(16).slice(2, 8).toUpperCase());
        showToast("Factura transmitida ✓ (demo)", { icon: "check", duration: 3500 });
      }, 1900);
      return;
    }
    // Validaciones
    if (!data.cliente.trim() || !data.ruc.trim()) { showToast("Falta el receptor (nombre y RUC)"); return; }
    const lineas = data.lineas.filter(l => (l.desc || "").trim() && l.cant > 0 && l.p >= 0);
    if (!lineas.length) { showToast("Agrega al menos una línea válida"); return; }

    setTransmitting(true);
    try {
      const fact = await api.post("/fe/facturas", {
        cliente_id: data.cliente_id || undefined,
        receptor_ruc: data.ruc.trim(),
        receptor_nombre: data.cliente.trim(),
        receptor_dv: (data.dv || "").trim() || undefined,
        condicion_pago: FE_CONDICION[data.condicion] || "contado",
        moneda: "USD",
        lineas: lineas.map(l => ({
          descripcion: l.desc.trim(),
          cantidad: l.cant,
          precio_unitario: l.p,
          itbms_aplica: !!l.itbms,
          cuenta_contable: l.cuenta || null,
        })),
      });
      const r = await api.post(`/fe/facturas/${fact.id}/transmitir`, {});
      setCufe(r.cufe || "AUTORIZADO");
      setTransmitting(false); setTransmitted(true);
      showToast(`Factura ${r.numero || ""} autorizada ✓`, { icon: "check", duration: 3500 });
    } catch (e) {
      setTransmitting(false);
      showToast(e.message || "No se pudo transmitir la factura");
    }
  };

  if (mode === "list") {
    return <FacturaList onNueva={() => { setStep(0); setTransmitted(false); setCufe(null); setMode("nueva"); }} />;
  }

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Salida", "Factura electrónica", "Nueva"]}
        actions={
          <button className="btn ghost" onClick={() => setMode("list")}>
            <window.Ico name="arrowLeft" size={13} />Facturas
          </button>
        }
      />

      <div style={{ padding: "20px 28px 40px" }}>
        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 22px" }}>
          {STEPS.map((s, i) => {
            const done = i < step || transmitted;
            const active = i === step && !transmitted;
            return (
              <React.Fragment key={s.tag}>
                <div onClick={() => !transmitted && i < step && setStep(i)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: done || active ? "pointer" : "default",
                  opacity: !done && !active ? .55 : 1
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 999,
                    background: done ? "var(--teal)" : active ? "var(--ink)" : "transparent",
                    border: !done && !active ? "1.5px solid var(--line)" : "0",
                    color: "#FAF8F3", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11.5, fontWeight: 700
                  }}>{done ? <window.Ico name="check" size={13} stroke={2.4} /> : i + 1}</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: active || done ? 700 : 600 }}>{s.tag}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{s.desc}</div>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: i < step || transmitted ? "var(--teal)" : "var(--line)", margin: "0 18px" }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 22 }}>
          <div>
            {step === 0 && !transmitted && <StepReceptor data={data} setData={setData} />}
            {step === 1 && !transmitted && <StepLineas data={data} setData={setData} />}
            {step === 2 && !transmitted && <StepRevisar data={data} sub={sub} itbms={itbms} tot={tot} firmName={tweaks.firmName} />}
            {(step === 3 || transmitted) && <StepTransmitir transmitting={transmitting} transmitted={transmitted} onTransmit={transmit} cufe={cufe} />}

            {/* Bottom action bar */}
            {!transmitted && (
              <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button className="btn ghost" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}
                  style={step === 0 ? { opacity: .4, cursor: "default" } : {}}>
                  <window.Ico name="arrowLeft" size={13} />Atrás
                </button>
                {step < 3 ? (
                  <button className="btn teal" onClick={() => setStep(s => s + 1)}>
                    {step === 2 ? "Continuar a transmitir" : "Siguiente"}<window.Ico name="arrowRight" size={13} />
                  </button>
                ) : (
                  <button className="btn teal" disabled={transmitting} onClick={transmit}>
                    {transmitting ? "Transmitiendo…" : <><window.Ico name="send" size={13} />Firmar y transmitir</>}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Side rail with totals + validation summary */}
          <div>
            <div className="card" style={{ padding: "18px 20px", position: "sticky", top: 80 }}>
              <div className="xs" style={{ color: "var(--teal)" }}>· Factura</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, marginTop: 8, fontWeight: 700 }}>FE-2025-002451</div>
              {transmitted ? (
                <window.Pill tone="green" dot style={{ marginTop: 10 }}>TRANSMITIDA · DGI</window.Pill>
              ) : (
                <window.Pill tone="amber" dot style={{ marginTop: 10 }}>BORRADOR</window.Pill>
              )}

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <SumRow k="Subtotal" v={window.fmt$(sub)} />
                <SumRow k="ITBMS 7%" v={window.fmt$(itbms)} />
                <div style={{ marginTop: 10, paddingTop: 12, borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Total</span>
                  <span className="serif num" style={{ fontSize: 28 }}>{window.fmt$(tot)}</span>
                </div>
              </div>

              <div style={{ marginTop: 18, padding: "10px 12px", background: "var(--surface)", borderRadius: 8 }}>
                <div className="xs">PAC</div>
                <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700 }}>Modo demo</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Genera CUFE de prueba · sin transmitir a DGI</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const SumRow = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
    <span style={{ color: "var(--muted)" }}>{k}</span>
    <span className="num mono" style={{ fontWeight: 600 }}>{v}</span>
  </div>
);

const StepReceptor = ({ data, setData }) => (
  <div className="card" style={{ padding: "26px 28px" }}>
    <div className="xs" style={{ color: "var(--teal)" }}>· Paso 1</div>
    <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, marginTop: 6 }}>¿A quién le facturas?</h2>

    <div style={{ marginTop: 24 }}>
      <window.FormField label="Cliente / Receptor" hint="Elige de tu cartera para enlazarlo y autocompletar el RUC.">
        <window.ClientePicker
          value={data.cliente}
          onSelect={(c) => setData({ ...data, cliente: c.nombre || "", cliente_id: c.id || null, ruc: c.ruc || data.ruc, dv: c.id ? "" : data.dv })}
        />
      </window.FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px", gap: 14 }}>
        <window.FormField label="RUC del receptor">
          <input className="inp mono" value={data.ruc} onChange={e => setData({ ...data, ruc: e.target.value })} />
        </window.FormField>
        <window.FormField label="DV">
          <input className="inp mono" value={data.dv} onChange={e => setData({ ...data, dv: e.target.value })} />
        </window.FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <window.FormField label="Punto de facturación">
          <select className="inp" value={data.punto} onChange={e => setData({ ...data, punto: e.target.value })}>
            <option>001-002 · Oficina central</option>
            <option>001-001 · Sucursal Boquete</option>
          </select>
        </window.FormField>
        <window.FormField label="Condición de pago">
          <select className="inp" value={data.condicion} onChange={e => setData({ ...data, condicion: e.target.value })}>
            <option>Contado</option>
            <option>Crédito · 15 días</option>
            <option>Crédito · 30 días</option>
            <option>Crédito · 45 días</option>
          </select>
        </window.FormField>
      </div>
      <window.FormField label="Fecha de emisión">
        <input className="inp" type="date" value={data.fecha} onChange={e => setData({ ...data, fecha: e.target.value })} />
      </window.FormField>
    </div>
  </div>
);

const StepLineas = ({ data, setData }) => {
  const updateLinea = (id, k, v) => {
    setData({ ...data, lineas: data.lineas.map(l => l.id === id ? { ...l, [k]: v } : l) });
  };
  const remove = (id) => setData({ ...data, lineas: data.lineas.filter(l => l.id !== id) });
  const add = () => setData({ ...data, lineas: [...data.lineas, { id: Date.now(), desc: "", cant: 1, p: 0, itbms: true, cuenta: "4101" }] });

  return (
    <div className="card" style={{ padding: "26px 28px" }}>
      <div className="xs" style={{ color: "var(--teal)" }}>· Paso 2</div>
      <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, marginTop: 6 }}>¿Qué le estás cobrando?</h2>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        {data.lineas.map((l, i) => (
          <div key={l.id} style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 10, alignItems: "flex-end" }}>
              <window.FormField label={`Línea ${i + 1}`}>
                <input className="inp" value={l.desc} onChange={e => updateLinea(l.id, "desc", e.target.value)} placeholder="Honorarios profesionales…" />
              </window.FormField>
              <window.FormField label="Cantidad">
                <input className="inp num mono" type="number" value={l.cant} onChange={e => updateLinea(l.id, "cant", parseFloat(e.target.value) || 0)} />
              </window.FormField>
              <window.FormField label="P. unitario">
                <input className="inp num mono" type="number" value={l.p} onChange={e => updateLinea(l.id, "p", parseFloat(e.target.value) || 0)} />
              </window.FormField>
              {data.lineas.length > 1 && (
                <button className="btn ghost" onClick={() => remove(l.id)} style={{ padding: "8px 10px", marginBottom: 14 }}>
                  <window.Ico name="x" size={13} color="var(--muted)" />
                </button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                <input type="checkbox" checked={l.itbms} onChange={e => updateLinea(l.id, "itbms", e.target.checked)} style={{ accentColor: "var(--teal)" }} />
                Aplica ITBMS 7%
              </label>
              <div className="num mono" style={{ fontSize: 14, fontWeight: 700 }}>
                {window.fmt$(l.cant * l.p * (l.itbms ? 1.07 : 1))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn ghost" onClick={add} style={{ marginTop: 12 }}>
        <window.Ico name="plus" size={13} />Agregar línea
      </button>
    </div>
  );
};

const StepRevisar = ({ data, sub, itbms, tot, firmName }) => {
  const checks = [
    ["RUC y DV del receptor", true],
    ["Suma de ITBMS coincide con líneas", true],
    ["Catálogo de actividad económica", true],
    ["Punto de facturación activo", true],
    ["Certificado digital vigente", true],
  ];

  return (
    <div className="card" style={{ padding: "26px 28px" }}>
      <div className="xs" style={{ color: "var(--teal)" }}>· Paso 3</div>
      <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, marginTop: 6 }}>Revisa antes de transmitir.</h2>
      <p className="lede" style={{ marginTop: 6 }}>Una vez transmitida, sólo se puede anular con nota de crédito.</p>

      {/* Mini preview */}
      <div style={{
        marginTop: 22, padding: "22px 26px", border: "1px solid var(--line)",
        borderRadius: 12, background: "var(--surface)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <window.Logo size={26} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{firmName || "Mi Despacho"}</div>
            </div>
            <div className="xs" style={{ marginTop: 8 }}>· FACTURA ELECTRÓNICA · TIPO 01</div>
            <div className="mono" style={{ fontSize: 12.5, marginTop: 4, fontWeight: 700 }}>FE-2025-002451</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="xs">Emisión</div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{data.fecha}</div>
            <div className="xs" style={{ marginTop: 10 }}>Condición</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }}>{data.condicion}</div>
          </div>
        </div>

        <div style={{ background: "var(--paper)", padding: "12px 14px", borderRadius: 8 }}>
          <div className="xs">Receptor</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{data.cliente}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>RUC {data.ruc}-{data.dv}</div>
        </div>

        <table className="tbl" style={{ marginTop: 14, background: "var(--paper)" }}>
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="r" style={{ width: 60 }}>Cant.</th>
              <th className="r" style={{ width: 90 }}>P. unit.</th>
              <th className="r" style={{ width: 100 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lineas.map(l => (
              <tr key={l.id}>
                <td><div style={{ fontWeight: 600 }}>{l.desc || "(sin descripción)"}</div></td>
                <td className="r num mono">{l.cant}</td>
                <td className="r num mono">{window.fmt$(l.p)}</td>
                <td className="r num mono" style={{ fontWeight: 700 }}>{window.fmt$(l.cant * l.p * (l.itbms ? 1.07 : 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <div style={{ width: 280 }}>
            <SumRow k="Subtotal" v={window.fmt$(sub)} />
            <SumRow k="ITBMS 7%" v={window.fmt$(itbms)} />
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1.5px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total a pagar</span>
              <span className="serif num" style={{ fontSize: 26 }}>{window.fmt$(tot)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="xs">Validaciones pre-firma</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {checks.map(([t, ok], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "8px 10px", background: ok ? "var(--green-bg)" : "var(--red-bg)", borderRadius: 7 }}>
              <window.Ico name={ok ? "check" : "x"} size={13} color={ok ? "var(--green)" : "var(--red)"} stroke={2.4} />
              <span style={{ color: "var(--ink)" }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StepTransmitir = ({ transmitting, transmitted, onTransmit, cufe }) => {
  const { navigate, showToast } = window.useApp();
  return (
    <div className="card" style={{ padding: "40px 40px", textAlign: "center" }}>
      {!transmitting && !transmitted && (
        <>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: "var(--teal-50)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <window.Ico name="send" size={32} color="var(--teal)" />
          </div>
          <h2 className="serif" style={{ fontSize: 32, fontWeight: 400, marginTop: 18 }}>Lista para transmitir</h2>
          <p className="lede" style={{ marginTop: 8, maxWidth: 460, margin: "8px auto 0" }}>
            Al firmar, la factura se envía al PAC, que la valida con la DGI y devuelve el CUFE en menos de 4 segundos.
          </p>
          <button className="btn teal" onClick={onTransmit} style={{ marginTop: 28, padding: "14px 30px", fontSize: 14 }}>
            <window.Ico name="send" size={14} />Firmar y transmitir
          </button>
        </>
      )}
      {transmitting && (
        <>
          <div style={{
            width: 80, height: 80, borderRadius: 999,
            border: "3px solid var(--line)", borderTopColor: "var(--teal)",
            margin: "0 auto",
            animation: "spin 800ms linear infinite"
          }} />
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, marginTop: 18 }}>Firmando con certificado…</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            Enviando a FacturaPanamá PAC · Validando con DGI…
          </p>
        </>
      )}
      {transmitted && (
        <>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: "var(--green-bg)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <window.Ico name="check" size={36} color="var(--green)" stroke={2.4} />
          </div>
          <h2 className="serif" style={{ fontSize: 32, fontWeight: 400, marginTop: 18 }}>¡Transmitida con éxito!</h2>
          <p className="lede" style={{ marginTop: 8 }}>La DGI registró la factura. CUFE generado y notificado al cliente.</p>

          <div style={{ marginTop: 22, padding: "16px 18px", background: "var(--ink)", borderRadius: 10, maxWidth: 480, margin: "22px auto 0", textAlign: "left" }}>
            <div className="xs" style={{ color: "var(--gold)" }}>· CUFE</div>
            <div className="mono" style={{ color: "var(--gold-soft)", fontSize: 11.5, marginTop: 6, letterSpacing: "0.04em", wordBreak: "break-all" }}>
              {cufe || "—"}
            </div>
          </div>

          <div style={{ marginTop: 22, display: "flex", justifyContent: "center", gap: 10 }}>
            <button className="btn ghost" onClick={() => showToast("Descargando PDF + XML…", { icon: "download" })}>
              <window.Ico name="download" size={13} />PDF + XML
            </button>
            <button className="btn ghost" onClick={() => showToast("Enviada por correo y WhatsApp", { icon: "send" })}>
              <window.Ico name="send" size={13} />Enviar al cliente
            </button>
            <button className="btn teal" onClick={() => navigate("dashboard")}>Volver al dashboard</button>
          </div>
        </>
      )}
    </div>
  );
};

const FE_DEMO = [
  { id: "d1", numero: "FE-2025-002450", receptor_nombre: "Distribuidora Sur S.A.", fecha_emision: "2025-03-18", total: 7276, estado: "autorizada" },
  { id: "d2", numero: "FE-2025-002449", receptor_nombre: "Maersk Panamá", fecha_emision: "2025-03-12", total: 4066, estado: "autorizada" },
  { id: "d3", numero: null, receptor_nombre: "Tech Pacific Corp", fecha_emision: "2025-03-20", total: 1605, estado: "borrador" },
];

const FE_TONE = { borrador: "amber", transmitiendo: "grey", autorizada: "green", rechazada: "red", anulada: "red" };
const FE_LABEL = { borrador: "Borrador", transmitiendo: "Transmitiendo", autorizada: "Autorizada", rechazada: "Rechazada", anulada: "Anulada" };

const FacturaList = ({ onNueva }) => {
  const { api, isLive } = window.useApp();
  const [estado, setEstado] = React.useState("Todos");
  const [search, setSearch] = React.useState("");

  const url = "/fe/facturas?limit=100" + (estado !== "Todos" ? `&estado=${estado}` : "");
  const q = window.useApiQuery(() => api.get(url), [isLive, estado], { enabled: isLive, fallback: null });
  const todas = (isLive && q.data && q.data.data) ? q.data.data : (isLive ? [] : FE_DEMO);
  const facturas = search
    ? todas.filter(f =>
        (f.receptor_nombre || "").toLowerCase().includes(search.toLowerCase()) ||
        (f.numero || "").toLowerCase().includes(search.toLowerCase()))
    : todas;

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Salida", "Factura electrónica"]}
        actions={
          <button className="btn primary" onClick={onNueva}>
            <window.Ico name="plus" size={13} />Nueva factura
          </button>
        }
      />
      <div style={{ padding: "20px 28px 40px" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10, marginBottom: 12 }}>
          <window.Ico name="search" size={14} color="var(--muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por receptor o número…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--ink)", fontFamily: "inherit" }} />
          <select value={estado} onChange={e => setEstado(e.target.value)} className="inp" style={{ width: 160, padding: "6px 10px", fontSize: 12 }}>
            <option value="Todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="autorizada">Autorizada</option>
            <option value="rechazada">Rechazada</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Número</th>
                <th>Receptor</th>
                <th>Fecha</th>
                <th className="r">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => (
                <tr key={f.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{f.numero || "(borrador)"}</td>
                  <td>{f.receptor_nombre}</td>
                  <td className="mono">{f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : "—"}</td>
                  <td className="r num mono" style={{ fontWeight: 700 }}>{window.fmt$(+f.total || 0)}</td>
                  <td><window.Pill tone={FE_TONE[f.estado] || "grey"} dot>{FE_LABEL[f.estado] || f.estado}</window.Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
          {facturas.length === 0 && (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              {(search || estado !== "Todos")
                ? "Sin resultados con esos filtros."
                : "Aún no has emitido facturas. Crea la primera con \"Nueva factura\"."}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { ScreenFE });
