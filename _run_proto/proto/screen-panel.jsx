// Screen: Panel del despacho — command center con TODOS los clientes del CPA.
// Cada tarjeta muestra ingresos, pendientes y estado. Clic → entra al modo "ver este cliente".

const ScreenPanel = () => {
  const { api, isLive, periodo, navigate, seleccionarCliente, showToast } = window.useApp();

  const cliQ = window.useApiQuery(() => api.get("/clientes"), [isLive], { enabled: isLive, fallback: { data: [] } });
  const txQ = window.useApiQuery(() => api.get(`/transacciones?periodo=${periodo}`), [periodo, isLive], { enabled: isLive, fallback: { data: [] } });
  const ocrQ = window.useApiQuery(() => api.get("/ocr/recibos?limit=200"), [isLive], { enabled: isLive, fallback: { data: [] } });
  const feQ = window.useApiQuery(() => api.get("/fe/facturas?estado=borrador&limit=200"), [isLive], { enabled: isLive, fallback: { data: [] } });
  const vencQ = window.useApiQuery(() => api.get("/vencimientos"), [isLive], { enabled: isLive, fallback: { data: [] } });

  const loading = isLive && (cliQ.loading || txQ.loading);
  const clientes = (cliQ.data && cliQ.data.data) || [];
  const txns = (txQ.data && txQ.data.data) || [];
  const recibos = (ocrQ.data && ocrQ.data.data) || [];
  const borradores = (feQ.data && feQ.data.data) || [];
  const vencimientos = (vencQ.data && vencQ.data.data) || [];
  const hoy = new Date().toISOString().slice(0, 10);

  // Agregar resúmenes por cliente
  const resumen = clientes.map(c => {
    const sus = txns.filter(t => t.cliente_id === c.id);
    const ing = sus.filter(t => t.tipo === "ingreso").reduce((a, t) => a + (+t.monto || 0), 0);
    const gas = sus.filter(t => t.tipo === "gasto").reduce((a, t) => a + (+t.monto || 0), 0);
    const sinCuenta = sus.filter(t => !t.cuenta_contable).length;
    const ocrPend = recibos.filter(r => r.cliente_id === c.id && r.estado === "revisar").length;
    const fePend = borradores.filter(f => f.cliente_id === c.id).length;
    const pendientes = sinCuenta + ocrPend + fePend;
    // Próximo vencimiento de este cliente (más cercano a hoy y no completado)
    const venc = vencimientos
      .filter(v => v.cliente_id === c.id)
      .sort((a, b) => String(a.fecha).slice(0,10).localeCompare(String(b.fecha).slice(0,10)))[0] || null;
    let vencDias = null;
    if (venc) {
      const d = String(venc.fecha).slice(0, 10);
      vencDias = Math.round((new Date(d) - new Date(hoy)) / 86400000);
    }
    return { ...c, ingresos: ing, gastos: gas, utilidad: ing - gas, num_txns: sus.length, sinCuenta, ocrPend, fePend, pendientes, venc, vencDias };
  });

  // Ordenar: con pendientes primero, luego por ingresos
  resumen.sort((a, b) => (b.pendientes - a.pendientes) || (b.ingresos - a.ingresos));

  const total = {
    ingresos: resumen.reduce((a, c) => a + c.ingresos, 0),
    gastos: resumen.reduce((a, c) => a + c.gastos, 0),
    pendientes: resumen.reduce((a, c) => a + c.pendientes, 0),
    clientesConPendientes: resumen.filter(c => c.pendientes > 0).length,
    clientesAlDia: resumen.filter(c => c.pendientes === 0 && c.num_txns > 0).length,
  };

  const abrirCliente = (c) => {
    seleccionarCliente(c.id, c.nombre);
    navigate("dashboard");
  };

  // ── Invitación al portal del cliente ─────────────────────────────────
  const [portalOpen, setPortalOpen] = React.useState(false);
  const [portalCliente, setPortalCliente] = React.useState(null);
  const [portalEmail, setPortalEmail] = React.useState("");
  const [portalUrl, setPortalUrl] = React.useState(null);
  const [portalLoading, setPortalLoading] = React.useState(false);

  const abrirInvitarPortal = (c) => {
    setPortalCliente(c); setPortalEmail(""); setPortalUrl(null); setPortalOpen(true);
  };
  const cerrarPortal = () => { setPortalOpen(false); setPortalCliente(null); setPortalUrl(null); setPortalEmail(""); };
  const enviarInvitacion = async () => {
    if (!portalEmail.trim()) { showToast("Falta el correo del cliente"); return; }
    setPortalLoading(true);
    try {
      const r = await api.post("/portal/accesos", {
        cliente_id: portalCliente.id,
        email: portalEmail.trim().toLowerCase(),
        nombre: portalCliente.nombre,
      });
      const base = window.location.origin;
      setPortalUrl(`${base}/portal/aceptar?token=${r.invite_url.split("token=")[1] || ""}`);
      showToast("Invitación creada ✓", { icon: "check" });
    } catch (e) {
      showToast(e.message || "No se pudo crear la invitación");
    } finally { setPortalLoading(false); }
  };

  const copiarUrl = async () => {
    try { await navigator.clipboard.writeText(portalUrl); showToast("Enlace copiado al portapapeles ✓", { icon: "check" }); }
    catch { showToast("No se pudo copiar; selecciónalo a mano"); }
  };

  // ── Chat con clientes (CPA side) ─────────────────────────────────────
  const sinLeerQ = window.useApiQuery(() => api.get("/portal/cpa/mensajes-sin-leer"), [isLive], { enabled: isLive, fallback: { porCliente: {}, total: 0 } });
  const sinLeer = (sinLeerQ.data && sinLeerQ.data.porCliente) || {};

  const [chatCliente, setChatCliente] = React.useState(null);
  const [chatMsgs, setChatMsgs] = React.useState([]);
  const [chatTexto, setChatTexto] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatEndRef = React.useRef(null);

  const cargarChat = async (cli) => {
    setChatLoading(true);
    try { const r = await api.get(`/portal/cpa/mensajes?cliente_id=${cli.id}`); setChatMsgs(r.data || []); sinLeerQ.refetch(); }
    catch (e) { showToast(e.message); }
    finally { setChatLoading(false); }
  };
  const abrirChat = (c) => { setChatCliente(c); setChatMsgs([]); setChatTexto(""); cargarChat(c); };
  const cerrarChat = () => { setChatCliente(null); setChatMsgs([]); };
  const enviarChat = async () => {
    const t = chatTexto.trim();
    if (!t || !chatCliente) return;
    try {
      const nuevo = await api.post("/portal/cpa/mensajes", { cliente_id: chatCliente.id, contenido: t });
      setChatMsgs(m => [...m, nuevo]);
      setChatTexto("");
    } catch (e) { showToast(e.message); }
  };
  React.useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs.length]);

  // ── Gestión de accesos al portal ─────────────────────────────────────
  const [accesosOpen, setAccesosOpen] = React.useState(false);
  const accesosQ = window.useApiQuery(() => api.get("/portal/accesos"), [isLive, accesosOpen], { enabled: isLive && accesosOpen, fallback: { data: [] } });
  const accesos = (accesosQ.data && accesosQ.data.data) || [];

  const revocarAcceso = async (a) => {
    if (!window.confirm(`¿Revocar el acceso de ${a.email} (${a.cliente_nombre})? Ya no podrá entrar al portal.`)) return;
    try {
      await api.delete(`/portal/accesos/${a.id}`);
      showToast("Acceso revocado ✓", { icon: "check" });
      accesosQ.refetch();
    } catch (e) { showToast(e.message); }
  };

  return (
    <>
      <window.Topbar
        crumbs={["Inicio", "Panel del despacho"]}
        actions={
          <>
            <button className="btn ghost" onClick={() => setAccesosOpen(true)}>
              <window.Ico name="users" size={13} />Accesos al portal
            </button>
            <button className="btn primary" onClick={() => navigate("clientes")}>
              <window.Ico name="plus" size={13} />Nuevo cliente
            </button>
          </>
        }
      />

      <div style={{ padding: "22px 28px" }}>
        {/* Resumen del despacho */}
        <div style={{ padding: "8px 0 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="xs" style={{ color: "var(--teal)" }}>· Panorama del despacho · {window.fmtPeriodo(periodo)}</div>
          <div style={{ display: "flex", gap: 36, marginTop: 10, alignItems: "baseline" }}>
            <div>
              <div className="serif num" style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.02em" }}>{resumen.length}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>clientes</div>
            </div>
            <div>
              <div className="serif num" style={{ fontSize: 28, lineHeight: 1, color: "var(--green)" }}>{total.clientesAlDia}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>al día</div>
            </div>
            <div>
              <div className="serif num" style={{ fontSize: 28, lineHeight: 1, color: total.clientesConPendientes > 0 ? "var(--amber)" : "var(--muted-2)" }}>
                {total.clientesConPendientes}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>con pendientes</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="serif num" style={{ fontSize: 24, lineHeight: 1 }}>{window.fmt$(total.ingresos)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>ingresos totales del período</div>
            </div>
          </div>
        </div>

        {/* Grid de tarjetas */}
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>Cargando tus clientes…</div>
        ) : resumen.length === 0 ? (
          <div className="card" style={{ padding: 50, textAlign: "center", marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Aún no tienes clientes.</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>
              Crea tu primer cliente para empezar a llevar sus libros.
            </div>
            <button className="btn teal" onClick={() => navigate("clientes")} style={{ marginTop: 18 }}>
              <window.Ico name="plus" size={13} />Crear primer cliente
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginTop: 22 }}>
            {resumen.map(c => <ClienteCard key={c.id} c={c} onOpen={() => abrirCliente(c)} onInvitar={() => abrirInvitarPortal(c)} onChat={() => abrirChat(c)} sinLeer={sinLeer[c.id] || 0} />)}
          </div>
        )}
      </div>

      <window.Modal open={accesosOpen} width={640} onClose={() => setAccesosOpen(false)} title="Accesos al portal del cliente"
        footer={<button className="btn ghost" onClick={() => setAccesosOpen(false)}>Cerrar</button>}>
        {accesosQ.loading ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>Cargando…</div>
        ) : accesos.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>
            Aún no has invitado a ningún cliente al portal.<br />
            Usa "Invitar al portal" en la tarjeta de cada cliente.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accesos.map(a => (
              <div key={a.id} style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.cliente_nombre}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{a.email}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>
                    {a.acepta_at
                      ? `Activo desde ${String(a.acepta_at).slice(0, 10)}${a.ultima_sesion ? ` · última sesión ${String(a.ultima_sesion).slice(0, 10)}` : ""}`
                      : "Invitación pendiente de aceptar"}
                  </div>
                </div>
                <window.Pill tone={a.acepta_at ? "green" : "amber"} dot>{a.acepta_at ? "Activo" : "Pendiente"}</window.Pill>
                <button className="btn danger" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => revocarAcceso(a)}>Revocar</button>
              </div>
            ))}
          </div>
        )}
      </window.Modal>

      <window.Modal open={!!chatCliente} width={560} onClose={cerrarChat}
        title={chatCliente ? `Mensajes · ${chatCliente.nombre}` : ""}
        footer={
          <>
            <input className="inp" value={chatTexto} onChange={e => setChatTexto(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviarChat()}
              placeholder="Escribe un mensaje a tu cliente…"
              style={{ flex: 1, marginRight: 8 }} />
            <button className="btn ghost" onClick={cerrarChat}>Cerrar</button>
            <button className="btn teal" disabled={!chatTexto.trim()} onClick={enviarChat}>Enviar</button>
          </>
        }>
        <div style={{ height: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px" }}>
          {chatLoading ? (
            <div style={{ textAlign: "center", color: "var(--muted)", margin: "auto" }}>Cargando conversación…</div>
          ) : chatMsgs.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted-2)", margin: "auto", fontSize: 13 }}>
              Sin mensajes aún. Escribe el primero — tu cliente lo verá en su portal.
            </div>
          ) : chatMsgs.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.remitente === "cpa" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "75%",
                padding: "8px 12px",
                borderRadius: m.remitente === "cpa" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: m.remitente === "cpa" ? "var(--teal)" : "var(--surface)",
                color: m.remitente === "cpa" ? "#FAF8F3" : "var(--ink)",
                fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.45
              }}>
                {m.contenido}
                <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 4 }}>
                  {new Date(m.created_at).toLocaleString("es-PA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </window.Modal>

      <window.Modal open={portalOpen} onClose={cerrarPortal}
        title={portalUrl ? "Invitación creada" : `Invitar a ${portalCliente?.nombre || "cliente"} al portal`}
        footer={
          portalUrl ? (
            <>
              <button className="btn ghost" onClick={cerrarPortal}>Cerrar</button>
              <button className="btn teal" onClick={copiarUrl}>
                <window.Ico name="check" size={13} />Copiar enlace
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={cerrarPortal}>Cancelar</button>
              <button className="btn teal" disabled={portalLoading || !portalEmail.trim()} onClick={enviarInvitacion}>
                {portalLoading ? "Creando…" : "Generar invitación"}
              </button>
            </>
          )
        }>
        {!portalUrl ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
              Tu cliente recibirá un enlace para entrar a su <b>propio portal</b>: verá sus números, podrá subir recibos y enviarte mensajes — todo separado y seguro.
            </div>
            <window.FormField label="Correo del cliente">
              <input className="inp" type="email" value={portalEmail}
                onChange={e => setPortalEmail(e.target.value)}
                placeholder="contacto@cliente.pa" autoFocus />
            </window.FormField>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
              Comparte este enlace con tu cliente <b>{portalCliente?.nombre}</b> por correo o WhatsApp. Es de un solo uso.
            </div>
            <div className="mono" style={{
              padding: "12px 14px", background: "var(--surface)", borderRadius: 8,
              fontSize: 11.5, color: "var(--ink)", wordBreak: "break-all"
            }}>{portalUrl}</div>
            <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--teal-50)", borderRadius: 6, fontSize: 11.5, color: "var(--teal-700)" }}>
              💡 La página de bienvenida del cliente se construirá pronto. Por ahora el backend ya emite el token; cuando montemos la página, este enlace funcionará completo.
            </div>
          </>
        )}
      </window.Modal>
    </>
  );
};

const ClienteCard = ({ c, onOpen, onInvitar, onChat, sinLeer }) => {
  const iniciales = (c.nombre || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const tonoEstado = c.pendientes > 0 ? "amber" : c.num_txns > 0 ? "green" : "grey";
  const labelEstado = c.pendientes > 0 ? `${c.pendientes} pendiente${c.pendientes === 1 ? "" : "s"}` : c.num_txns > 0 ? "Al día" : "Sin movimientos";

  return (
    <div className="card" onClick={onOpen} style={{
      padding: "18px 20px", cursor: "pointer",
      borderLeft: `3px solid ${c.pendientes > 0 ? "var(--amber)" : c.num_txns > 0 ? "var(--green)" : "var(--line)"}`,
      transition: "transform 120ms ease, box-shadow 120ms"
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: "var(--teal-50)", color: "var(--teal-700)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Instrument Serif, serif", fontSize: 15, fontWeight: 400
        }}>{iniciales}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>RUC {c.ruc || "—"}</div>
        </div>
        <window.Pill tone={tonoEstado} dot>{labelEstado}</window.Pill>
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-2)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div className="xs" style={{ color: "var(--muted-2)" }}>Ingresos</div>
          <div className="num mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: c.ingresos > 0 ? "var(--green)" : "var(--ink)" }}>
            {window.fmt$(c.ingresos, { decimals: 0 })}
          </div>
        </div>
        <div>
          <div className="xs" style={{ color: "var(--muted-2)" }}>Asientos</div>
          <div className="num mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{c.num_txns}</div>
        </div>
      </div>

      {c.pendientes > 0 && (
        <div style={{ marginTop: 12, padding: "8px 10px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 11.5, color: "#7A5610", display: "flex", flexDirection: "column", gap: 3 }}>
          {c.sinCuenta > 0 && <span>• {c.sinCuenta} transacci{c.sinCuenta === 1 ? "ón" : "ones"} sin clasificar</span>}
          {c.ocrPend > 0 && <span>• {c.ocrPend} recibo{c.ocrPend === 1 ? "" : "s"} OCR por revisar</span>}
          {c.fePend > 0 && <span>• {c.fePend} factura{c.fePend === 1 ? "" : "s"} en borrador</span>}
        </div>
      )}

      {c.venc && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: 11.5, display: "flex", alignItems: "center", gap: 8,
          background: c.vencDias < 0 ? "var(--red-bg)" : c.vencDias <= 7 ? "var(--amber-bg)" : "var(--surface)",
          color: c.vencDias < 0 ? "var(--red)" : c.vencDias <= 7 ? "#7A5610" : "var(--muted)"
        }}>
          <window.Ico name="tax" size={12} />
          <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.venc.descripcion}</span>
          <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
            {c.vencDias < 0 ? `Vencido hace ${Math.abs(c.vencDias)}d` : c.vencDias === 0 ? "Hoy" : `En ${c.vencDias}d`}
          </span>
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line-2)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn ghost" style={{ fontSize: 11, padding: "5px 9px", position: "relative" }}
          onClick={e => { e.stopPropagation(); onChat && onChat(); }}>
          <window.Ico name="mail" size={11} color="var(--teal)" />Mensajes
          {sinLeer > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--red)", color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              minWidth: 16, height: 16, padding: "0 4px",
              borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center"
            }}>{sinLeer}</span>
          )}
        </button>
        <button className="btn ghost" style={{ fontSize: 11, padding: "5px 9px" }}
          onClick={e => { e.stopPropagation(); onInvitar && onInvitar(); }}>
          <window.Ico name="send" size={11} color="var(--teal)" />Invitar al portal
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { ScreenPanel });
