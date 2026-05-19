import React, { useState, useEffect, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";
const WA_NUM  = "50769295152";

const apiFetch = async (path, opts = {}) => {
  const token = localStorage.getItem("cp_token");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res  = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};

const api = {
  get:    p      => apiFetch(p),
  post:   (p, b) => apiFetch(p, { method: "POST",   body: JSON.stringify(b) }),
  put:    (p, b) => apiFetch(p, { method: "PUT",    body: JSON.stringify(b) }),
  patch:  (p, b) => apiFetch(p, { method: "PATCH",  body: JSON.stringify(b) }),
  delete: p      => apiFetch(p, { method: "DELETE" }),
};

// ─── Colors ───────────────────────────────────────────────────────────────
const C = {
  bg:"#f0f4f8", surface:"#ffffff", border:"#e2e8f0",
  text:"#0f172a", muted:"#64748b", light:"#94a3b8",
  accent:"#0ea5e9", accentBg:"#f0f9ff",
  success:"#10b981", successBg:"#ecfdf5",
  warning:"#f59e0b", warningBg:"#fffbeb",
  danger:"#ef4444",  dangerBg:"#fef2f2",
  wa:"#25D366", waBg:"#f0fdf4",
  purple:"#8b5cf6", purpleBg:"#f5f3ff",
  orange:"#f97316", orangeBg:"#fff7ed",
  pink:"#ec4899", pinkBg:"#fdf2f8",
};

const ESTADOS = [
  { id:"nuevo",      label:"Nuevo",      color:C.accent,   bg:C.accentBg  },
  { id:"contactado", label:"Contactado", color:C.warning,  bg:C.warningBg },
  { id:"calificado", label:"Calificado", color:C.purple,   bg:C.purpleBg  },
  { id:"propuesta",  label:"Propuesta",  color:C.orange,   bg:C.orangeBg  },
  { id:"convertido", label:"Convertido", color:C.success,  bg:C.successBg },
  { id:"perdido",    label:"Perdido",    color:C.danger,   bg:C.dangerBg  },
];

const FUENTES = [
  { id:"web",       label:"Web",       emoji:"🌐" },
  { id:"whatsapp",  label:"WhatsApp",  emoji:"💬" },
  { id:"instagram", label:"Instagram", emoji:"📸" },
  { id:"tiktok",    label:"TikTok",    emoji:"🎵" },
  { id:"referido",  label:"Referido",  emoji:"🤝" },
  { id:"google",    label:"Google",    emoji:"🔍" },
  { id:"llamada",   label:"Llamada",   emoji:"📞" },
  { id:"otro",      label:"Otro",      emoji:"📌" },
];

const CATEGORIAS_TPL = [
  { id:"bienvenida",   label:"Bienvenida",   emoji:"👋" },
  { id:"cotizacion",   label:"Cotización",   emoji:"💰" },
  { id:"recordatorio", label:"Recordatorio", emoji:"⚠️" },
  { id:"seguimiento",  label:"Seguimiento",  emoji:"🔄" },
  { id:"cierre",       label:"Cierre",       emoji:"🎉" },
  { id:"general",      label:"General",      emoji:"📝" },
];

const SERVICIOS = [
  "Declaración de renta","Contabilidad mensual","ITBMS / Paz y Salvo",
  "Nóminas y planillas","Constitución de empresa","Auditoría",
  "Asesoría tributaria","Balances financieros","Otro",
];

// ─── Atoms ────────────────────────────────────────────────────────────────
const inpSt = { width:"100%", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, color:C.text, background:"#f8fafc", boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
const lblSt = { display:"block", fontSize:12, fontWeight:600, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.04em" };
const Fld   = ({ label, children }) => <div style={{ marginBottom:16 }}><label style={lblSt}>{label}</label>{children}</div>;

const Btn = ({ children, onClick, variant="primary", small, style={}, disabled, loading }) => {
  const vs = {
    primary:  { background:C.accent,   color:"#fff", border:"none" },
    success:  { background:C.success,  color:"#fff", border:"none" },
    danger:   { background:C.danger,   color:"#fff", border:"none" },
    ghost:    { background:"none",     color:C.muted, border:`1px solid ${C.border}` },
    wa:       { background:C.wa,       color:"#fff", border:"none" },
    outline:  { background:"none",     color:C.accent, border:`1px solid ${C.accent}` },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ padding: small ? "6px 12px" : "9px 18px", borderRadius:8, fontWeight:600,
               fontSize: small ? 12 : 14, cursor: (disabled||loading) ? "not-allowed" : "pointer",
               fontFamily:"inherit", display:"flex", alignItems:"center", gap:6,
               opacity:(disabled||loading) ? 0.6 : 1, ...vs[variant], ...style }}>
      {loading ? "..." : children}
    </button>
  );
};

const Badge = ({ text, color, bg }) => (
  <span style={{ background: bg||"#f1f5f9", color: color||C.muted, padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, display:"inline-block", textTransform:"uppercase", letterSpacing:"0.04em" }}>{text}</span>
);

const estadoBadge  = id => ESTADOS.find(e => e.id===id) || { label:id, color:C.muted, bg:"#f1f5f9" };
const fuenteInfo   = id => FUENTES.find(f => f.id===id) || { label:id, emoji:"📌" };
const waLink       = (msg='') => `https://wa.me/${WA_NUM}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
const fmtDate      = d => d ? new Date(d).toLocaleDateString("es-PA",{day:"2-digit",month:"short",year:"2-digit"}) : "—";
const fmt          = n => n ? new Intl.NumberFormat("es-PA",{style:"currency",currency:"USD"}).format(n) : "—";

const Modal = ({ title, onClose, children, width=580 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:C.surface, borderRadius:16, width:"100%", maxWidth:width, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.surface, zIndex:1 }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{title}</div>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:20, lineHeight:1, padding:"0 4px" }}>×</button>
      </div>
      <div style={{ padding:24 }}>{children}</div>
    </div>
  </div>
);

const KpiCard = ({ label, value, sub, color=C.accent, emoji }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", display:"flex", alignItems:"flex-start", gap:14, minWidth:140 }}>
    <div style={{ width:42, height:42, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{emoji}</div>
    <div>
      <div style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:C.text, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.light, marginTop:3 }}>{sub}</div>}
    </div>
  </div>
);

// ─── Lead Form ────────────────────────────────────────────────────────────
const LeadForm = ({ initial={}, onSave, onClose }) => {
  const [form, setForm] = useState({
    nombre:"", telefono:"", email:"", empresa:"", servicio:"",
    mensaje:"", fuente:"web", estado:"nuevo", prioridad:"media",
    notas:"", valor_estimado:"", ...initial,
    valor_estimado: initial.valor_estimado || "",
  });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const s = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSave = async () => {
    if (!form.nombre.trim()) return setErr("El nombre es obligatorio.");
    setBusy(true); setErr("");
    try {
      const body = { ...form };
      if (body.valor_estimado === "") body.valor_estimado = null;
      if (initial.id) await api.put(`/api/leads/${initial.id}`, body);
      else            await api.post("/api/leads", body);
      onSave();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      {err && <div style={{ background:C.dangerBg, color:C.danger, border:`1px solid ${C.danger}33`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13 }}>⚠ {err}</div>}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
        <Fld label="Nombre completo *"><input value={form.nombre} onChange={s("nombre")} placeholder="Juan Pérez" style={inpSt}/></Fld>
        <Fld label="Teléfono (con código)"><input value={form.telefono} onChange={s("telefono")} placeholder="+507 6000-0000" style={inpSt}/></Fld>
        <Fld label="Correo electrónico"><input type="email" value={form.email} onChange={s("email")} placeholder="juan@empresa.com" style={inpSt}/></Fld>
        <Fld label="Empresa / Negocio"><input value={form.empresa} onChange={s("empresa")} placeholder="Nombre de la empresa" style={inpSt}/></Fld>
        <Fld label="Servicio de interés">
          <select value={form.servicio} onChange={s("servicio")} style={inpSt}>
            <option value="">Sin especificar</option>
            {SERVICIOS.map(sv => <option key={sv} value={sv}>{sv}</option>)}
          </select>
        </Fld>
        <Fld label="Fuente">
          <select value={form.fuente} onChange={s("fuente")} style={inpSt}>
            {FUENTES.map(f => <option key={f.id} value={f.id}>{f.emoji} {f.label}</option>)}
          </select>
        </Fld>
        <Fld label="Estado">
          <select value={form.estado} onChange={s("estado")} style={inpSt}>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Fld>
        <Fld label="Prioridad">
          <select value={form.prioridad} onChange={s("prioridad")} style={inpSt}>
            <option value="alta">🔴 Alta</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🟢 Baja</option>
          </select>
        </Fld>
        <Fld label="Valor estimado (USD)">
          <input type="number" min="0" step="50" value={form.valor_estimado} onChange={s("valor_estimado")} placeholder="150" style={inpSt}/>
        </Fld>
      </div>
      <Fld label="Mensaje / consulta inicial">
        <textarea value={form.mensaje} onChange={s("mensaje")} rows={3} placeholder="¿Qué necesita el cliente?" style={{ ...inpSt, resize:"vertical" }}/>
      </Fld>
      <Fld label="Notas internas">
        <textarea value={form.notas} onChange={s("notas")} rows={2} placeholder="Notas privadas sobre el lead…" style={{ ...inpSt, resize:"vertical" }}/>
      </Fld>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={handleSave} loading={busy}>{initial.id ? "Guardar cambios" : "Crear lead"}</Btn>
      </div>
    </>
  );
};

// ─── Lead Card ────────────────────────────────────────────────────────────
const LeadCard = ({ lead, onEdit, onDelete, onEstado, onWa }) => {
  const est  = estadoBadge(lead.estado);
  const fuen = fuenteInfo(lead.fuente);
  const waMsg = `Hola ${lead.nombre}, le contacta Orlando Panamá CPA. ¿En qué le puedo ayudar?`;

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 4px rgba(0,0,0,0.04)", cursor:"pointer" }}
      onClick={() => onEdit(lead)}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ fontWeight:700, fontSize:14, color:C.text, flex:1, marginRight:8 }}>{lead.nombre}</div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          {lead.prioridad==="alta" && <span title="Alta prioridad" style={{ fontSize:14 }}>🔴</span>}
          <Badge text={fuen.emoji + " " + fuen.label} color={C.muted} bg="#f1f5f9"/>
        </div>
      </div>

      {lead.empresa && <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>🏢 {lead.empresa}</div>}
      {lead.servicio && <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>📋 {lead.servicio}</div>}
      {lead.telefono && <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>📱 {lead.telefono}</div>}
      {lead.valor_estimado && <div style={{ fontSize:12, color:C.success, fontWeight:600, marginBottom:4 }}>💵 {fmt(lead.valor_estimado)}</div>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
        <div style={{ fontSize:11, color:C.light }}>{fmtDate(lead.created_at)}</div>
        <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
          <button title="WhatsApp" onClick={() => window.open(waLink(waMsg),'_blank')}
            style={{ background:C.waBg, color:C.wa, border:`1px solid ${C.wa}44`, borderRadius:7, padding:"4px 8px", cursor:"pointer", fontSize:13, fontWeight:700 }}>💬</button>
          <button title="Editar" onClick={() => onEdit(lead)}
            style={{ background:"#f0f9ff", color:C.accent, border:`1px solid ${C.accent}44`, borderRadius:7, padding:"4px 8px", cursor:"pointer", fontSize:12 }}>✏️</button>
          <button title="Eliminar" onClick={() => onDelete(lead.id)}
            style={{ background:C.dangerBg, color:C.danger, border:`1px solid ${C.danger}33`, borderRadius:7, padding:"4px 8px", cursor:"pointer", fontSize:12 }}>🗑</button>
        </div>
      </div>
    </div>
  );
};

// ─── Kanban Pipeline ──────────────────────────────────────────────────────
const Pipeline = ({ leads, onEdit, onDelete, onEstado, onWa }) => {
  const stages = ESTADOS.filter(e => e.id !== "perdido");
  const perdidos = leads.filter(l => l.estado === "perdido");

  return (
    <div style={{ overflowX:"auto", paddingBottom:16 }}>
      <div style={{ display:"flex", gap:14, minWidth:900 }}>
        {stages.map(stage => {
          const cols = leads.filter(l => l.estado === stage.id);
          return (
            <div key={stage.id} style={{ flex:1, minWidth:180 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, padding:"8px 12px", background:stage.bg, borderRadius:8, border:`1px solid ${stage.color}33` }}>
                <span style={{ fontSize:13, fontWeight:700, color:stage.color }}>{stage.label}</span>
                <span style={{ background:stage.color, color:"#fff", borderRadius:12, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{cols.length}</span>
              </div>
              {cols.map(lead => (
                <LeadCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} onEstado={onEstado} onWa={onWa}/>
              ))}
              {cols.length===0 && <div style={{ textAlign:"center", color:C.light, fontSize:12, padding:"20px 0", border:`2px dashed ${C.border}`, borderRadius:10 }}>Sin leads</div>}
            </div>
          );
        })}
        {/* Perdidos colapsado */}
        {perdidos.length > 0 && (
          <div style={{ minWidth:160 }}>
            <div style={{ padding:"8px 12px", background:C.dangerBg, borderRadius:8, border:`1px solid ${C.danger}33`, marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.danger }}>Perdidos</span>
              <span style={{ background:C.danger, color:"#fff", borderRadius:12, padding:"2px 8px", fontSize:11, fontWeight:700, marginLeft:8 }}>{perdidos.length}</span>
            </div>
            {perdidos.map(lead => (
              <LeadCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} onEstado={onEstado} onWa={onWa}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Templates WhatsApp ───────────────────────────────────────────────────
const TemplatesTab = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);
  const [form, setForm]           = useState({ nombre:"", categoria:"general", mensaje:"" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/api/whatsapp/templates"); setTemplates(r.data||[]); }
    catch{}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditItem(null); setForm({ nombre:"", categoria:"general", mensaje:"" }); setModal(true); };
  const openEdit = tpl => { setEditItem(tpl); setForm({ nombre:tpl.nombre, categoria:tpl.categoria, mensaje:tpl.mensaje }); setModal(true); };

  const handleSave = async () => {
    if (!form.nombre||!form.mensaje) return;
    try {
      if (editItem) await api.put(`/api/whatsapp/templates/${editItem.id}`, form);
      else          await api.post("/api/whatsapp/templates", form);
      setModal(false); load();
    } catch(e) { alert(e.message); }
  };

  const handleDelete = async id => {
    if (!confirm("¿Eliminar este template?")) return;
    await api.delete(`/api/whatsapp/templates/${id}`); load();
  };

  const copiar = (id, texto) => {
    navigator.clipboard.writeText(texto).catch(()=>{});
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  const catInfo = id => CATEGORIAS_TPL.find(c=>c.id===id)||{emoji:"📝",label:id};

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Templates de respuesta rápida</div>
          <div style={{ fontSize:13, color:C.muted }}>Mensajes predefinidos para WhatsApp. Copia y envía en segundos.</div>
        </div>
        <Btn onClick={openNew}>+ Nuevo template</Btn>
      </div>

      {loading ? <div style={{ color:C.muted, textAlign:"center", padding:"40px 0" }}>Cargando...</div> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 }}>
          {templates.map(tpl => {
            const cat = catInfo(tpl.categoria);
            return (
              <div key={tpl.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:4 }}>{tpl.nombre}</div>
                    <Badge text={cat.emoji + " " + cat.label} color={C.muted} bg="#f1f5f9"/>
                    {tpl.usos > 0 && <span style={{ fontSize:11, color:C.light, marginLeft:8 }}>usado {tpl.usos}x</span>}
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.text, background:C.waBg, border:`1px solid ${C.wa}22`, borderRadius:8, padding:"10px 12px", lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom:12, maxHeight:120, overflowY:"auto" }}>
                  {tpl.mensaje}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn small variant="wa" onClick={() => { copiar(tpl.id, tpl.mensaje); api.post(`/api/whatsapp/templates/${tpl.id}/usar`,{}).catch(()=>{}); }}>
                    {copiadoId===tpl.id ? "✓ Copiado" : "📋 Copiar"}
                  </Btn>
                  <Btn small variant="outline" onClick={() => window.open(`https://wa.me/${WA_NUM}?text=${encodeURIComponent(tpl.mensaje)}`,'_blank')}>Abrir WA</Btn>
                  <Btn small variant="ghost" onClick={() => openEdit(tpl)}>Editar</Btn>
                  <Btn small variant="ghost" onClick={() => handleDelete(tpl.id)} style={{ color:C.danger }}>🗑</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={editItem ? "Editar template" : "Nuevo template"} onClose={() => setModal(false)}>
          <Fld label="Nombre del template">
            <input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Bienvenida inicial" style={inpSt}/>
          </Fld>
          <Fld label="Categoría">
            <select value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))} style={inpSt}>
              {CATEGORIAS_TPL.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </Fld>
          <Fld label="Mensaje (puedes usar {{nombre}} como variable)">
            <textarea value={form.mensaje} onChange={e=>setForm(p=>({...p,mensaje:e.target.value}))} rows={6} placeholder="Escribe el mensaje aquí…" style={{ ...inpSt, resize:"vertical" }}/>
          </Fld>
          <div style={{ fontSize:11, color:C.muted, marginBottom:16 }}>
            Variables disponibles: <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4}}>{"{{nombre}}"}</code> — nombre del cliente
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="wa" onClick={handleSave}>💾 Guardar template</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Links de Conversión WhatsApp ─────────────────────────────────────────
const LinksTab = () => {
  const links = [
    { label:"Asesoría general",       msg:"Hola Orlando, me gustaría una asesoría contable en Panamá. ¿Cuánto cobras?",       color:C.accent  },
    { label:"Declaración de renta",   msg:"Hola Orlando CPA, necesito ayuda con mi declaración de renta. ¿Pueden ayudarme?",  color:C.purple  },
    { label:"ITBMS / Paz y Salvo",    msg:"Hola, necesito asesoría con el ITBMS y obtener paz y salvo fiscal en Panamá.",     color:C.warning },
    { label:"Nóminas y planillas",    msg:"Hola Orlando, me interesa el servicio de manejo de nóminas para mi empresa.",       color:C.orange  },
    { label:"Constituir empresa",     msg:"Hola, quiero constituir una empresa en Panamá. ¿Qué pasos debo seguir?",           color:C.success },
    { label:"Contabilidad mensual",   msg:"Hola Orlando CPA, necesito un contador para llevar mi contabilidad mensual.",      color:C.pink    },
    { label:"Cotización rápida",      msg:"Hola, quisiera una cotización de sus servicios contables por favor.",              color:C.danger  },
    { label:"Agenda una asesoría",    msg:"Hola Orlando, me gustaría agendar una asesoría contable. ¿Cuándo tienes disponibilidad?", color:C.accent },
  ];
  const [copiado, setCopiado] = useState(null);
  const copiar = (idx, url) => {
    navigator.clipboard.writeText(url).catch(()=>{});
    setCopiado(idx); setTimeout(()=>setCopiado(null), 2500);
  };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:4 }}>Links de conversión a WhatsApp</div>
        <div style={{ fontSize:13, color:C.muted }}>Copia estos links y úsalos en bio de Instagram/TikTok, sitio web, Google Business, emails y anuncios.</div>
      </div>

      <div style={{ background:C.waBg, border:`1px solid ${C.wa}33`, borderRadius:12, padding:"16px 20px", marginBottom:24 }}>
        <div style={{ fontWeight:700, color:C.wa, marginBottom:6, fontSize:14 }}>💬 Link principal de WhatsApp</div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <code style={{ flex:1, background:"#fff", padding:"8px 12px", borderRadius:7, fontSize:13, border:`1px solid ${C.border}`, wordBreak:"break-all" }}>
            {`https://wa.me/${WA_NUM}`}
          </code>
          <Btn small variant="wa" onClick={() => copiar("main", `https://wa.me/${WA_NUM}`)}>
            {copiado==="main" ? "✓ Copiado" : "📋 Copiar"}
          </Btn>
          <Btn small variant="ghost" onClick={() => window.open(`https://wa.me/${WA_NUM}`, "_blank")}>Abrir</Btn>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(420px, 1fr))", gap:14 }}>
        {links.map((lk, i) => {
          const url = waLink(lk.msg);
          return (
            <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:lk.color, flexShrink:0 }}/>
                <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{lk.label}</div>
              </div>
              <div style={{ fontSize:12, color:C.muted, background:"#f8fafc", borderRadius:7, padding:"8px 10px", marginBottom:10, lineHeight:1.5, wordBreak:"break-all" }}>
                {url.length > 100 ? url.slice(0,97)+"..." : url}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn small variant="wa" onClick={() => copiar(i, url)}>{copiado===i?"✓ Copiado":"📋 Copiar link"}</Btn>
                <Btn small variant="ghost" onClick={() => window.open(url,"_blank")}>Probar</Btn>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:28, background:"#0f172a", borderRadius:12, padding:"20px 24px", color:"#e2e8f0" }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:"#fff" }}>📋 Donde usar estos links</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10, fontSize:13 }}>
          {[
            ["📸 Instagram", "Bio del perfil @orlando_cpapty"],
            ["🎵 TikTok", "Bio del perfil @orlando_cpapty"],
            ["🌐 Sitio web", "CTAs en cada sección de orlandopanamacpa.com"],
            ["🔍 Google Business", "Botón 'Enviar mensaje' del perfil"],
            ["📧 Email", "Firma de correo y boletines"],
            ["📣 Meta Ads", "Botón CTA en anuncios de Facebook/Instagram"],
            ["💼 LinkedIn", "Contacto del perfil profesional"],
            ["📱 Linktree/Beacons", "Página de links para redes sociales"],
          ].map(([t,d],i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.05)", borderRadius:8, padding:"10px 12px" }}>
              <div style={{ fontWeight:700, marginBottom:3 }}>{t}</div>
              <div style={{ color:"#94a3b8", fontSize:12 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Estrategia & Roadmap ─────────────────────────────────────────────────
const EstrategiaTab = () => (
  <div style={{ maxWidth:800 }}>
    <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:4 }}>Arquitectura Digital — Orlando Panamá CPA</div>
    <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>"Rendirse no es una opción" — Ecosistema digital diseñado para convertir seguidores en clientes.</div>

    {/* Flujo del cliente */}
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 22px", marginBottom:18 }}>
      <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:14 }}>🔄 Flujo ideal del cliente</div>
      <div style={{ display:"flex", alignItems:"center", gap:0, overflowX:"auto" }}>
        {[
          ["📱","Redes sociales\n@orlando_cpapty"],
          ["→",""],
          ["💬","WhatsApp\n+507 6929-5152"],
          ["→",""],
          ["🤖","Respuesta\nautomática"],
          ["→",""],
          ["📋","Calificación\ndel lead"],
          ["→",""],
          ["🤝","Propuesta\ny cierre"],
          ["→",""],
          ["✅","Cliente\nrecurrente"],
        ].map(([e,t],i) => t ? (
          <div key={i} style={{ textAlign:"center", minWidth:90, padding:"8px 4px" }}>
            <div style={{ fontSize:24, marginBottom:4 }}>{e}</div>
            <div style={{ fontSize:11, color:C.muted, lineHeight:1.4, whiteSpace:"pre-line" }}>{t}</div>
          </div>
        ) : (
          <div key={i} style={{ fontSize:20, color:C.light, padding:"0 4px" }}>→</div>
        ))}
      </div>
    </div>

    {/* Herramientas recomendadas */}
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 22px", marginBottom:18 }}>
      <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:14 }}>🛠 Stack tecnológico recomendado</div>
      <div style={{ display:"grid", gap:10 }}>
        {[
          { e:"💬", t:"WhatsApp Business App", d:"Gratis. Catálogo, respuestas rápidas, etiquetas de clientes. Empezar aquí.", s:"✅ Implementar YA", sc:C.success },
          { e:"🔗", t:"Linktree / Beacons.ai", d:"Página de links para la bio de Instagram/TikTok. Conecta todos tus CTAs.", s:"✅ Implementar YA", sc:C.success },
          { e:"🤖", t:"ManyChat", d:"Bot de Instagram/FB. Respuesta automática a DMs, captura de emails/teléfonos.", s:"🟡 Fase 2", sc:C.warning },
          { e:"⚡", t:"Meta Business Suite", d:"Gestiona anuncios, DMs de Instagram/FB y WhatsApp Business desde un lugar.", s:"🟡 Fase 2", sc:C.warning },
          { e:"🔄", t:"Make (Zapier gratuito)", d:"Automatizar: lead en formulario → notificación WhatsApp → CRM.", s:"🟡 Fase 2", sc:C.warning },
          { e:"📞", t:"WhatsApp Business API (Meta Cloud)", d:"Envío masivo, chatbots avanzados, integraciones. Requiere verificación de negocio.", s:"🔵 Fase 3", sc:C.accent },
          { e:"📊", t:"CRM (HubSpot Free / Notion)", d:"Gestión de pipeline completo. HubSpot tiene plan gratuito robusto.", s:"🔵 Fase 3", sc:C.accent },
          { e:"📅", t:"Calendly", d:"Agenda de asesorías. Integra con WhatsApp y Google Calendar.", s:"🔵 Fase 3", sc:C.accent },
        ].map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:14, padding:"12px 14px", background:"#f8fafc", borderRadius:9, alignItems:"flex-start", border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:22, flexShrink:0 }}>{r.e}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:13, color:C.text, marginBottom:2 }}>{r.t}</div>
              <div style={{ fontSize:12, color:C.muted }}>{r.d}</div>
            </div>
            <span style={{ background:r.sc+"18", color:r.sc, padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{r.s}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Límites WhatsApp */}
    <div style={{ background:C.dangerBg, border:`1px solid ${C.danger}33`, borderRadius:12, padding:"18px 22px", marginBottom:18 }}>
      <div style={{ fontWeight:700, fontSize:14, color:C.danger, marginBottom:12 }}>⚠️ Restricciones importantes de WhatsApp</div>
      <div style={{ display:"grid", gap:8, fontSize:13 }}>
        {[
          "WhatsApp Business App: máximo ~256 contactos en listas de difusión. Solo reciben quienes te tienen guardado.",
          "WhatsApp Business API: no se puede hacer spam. Primero debes recibir un mensaje del cliente (ventana 24h).",
          "Meta puede bloquear números que envíen mensajes masivos no solicitados. No compres bases de datos.",
          "Templates de la API deben ser aprobados por Meta antes de usarse (proceso toma 24-48h).",
          "Límite inicial de la API: 1,000 conversaciones únicas/mes. Escala con historial y calificación.",
          "Para usar la API necesitas: número dedicado, cuenta Meta Business verificada, BM ID aprobado.",
        ].map((t,i) => <div key={i} style={{ display:"flex", gap:8 }}><span style={{ color:C.danger }}>•</span><span style={{ color:C.text }}>{t}</span></div>)}
      </div>
    </div>

    {/* Roadmap */}
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 22px" }}>
      <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:14 }}>🗺 Roadmap de implementación</div>
      <div style={{ display:"grid", gap:12 }}>
        {[
          { fase:"Fase 1 — Ahora mismo (0 costo)", color:C.success, items:[
            "✅ Activar WhatsApp Business App en +507 6929-5152",
            "✅ Configurar catálogo de servicios en WhatsApp Business",
            "✅ Crear 5-8 respuestas rápidas para preguntas frecuentes",
            "✅ Poner link wa.me en bio de @orlando_cpapty (Instagram y TikTok)",
            "✅ Crear Linktree/Beacons con todos los CTAs al WhatsApp",
            "✅ Activar perfil de Google Business Profile con botón WhatsApp",
            "✅ Usar este módulo CRM para rastrear todos los leads",
          ]},
          { fase:"Fase 2 — Primer mes ($29-49/mes)", color:C.warning, items:[
            "📌 Conectar ManyChat a Instagram para auto-responder DMs",
            "📌 Crear flujo: 'Comenta PRECIO' → bot envía info → captura email",
            "📌 Configurar Meta Business Suite para gestión centralizada",
            "📌 Activar Meta Ads con botón 'Enviar mensaje a WhatsApp'",
            "📌 Crear formulario de contacto en orlandopanamacpa.com conectado a este CRM",
            "📌 Configurar Make para automatizar notificaciones de leads",
          ]},
          { fase:"Fase 3 — Escala ($99-199/mes)", color:C.accent, items:[
            "🚀 Solicitar acceso a WhatsApp Business API (Meta Cloud)",
            "🚀 Configurar chatbot de calificación automática de leads",
            "🚀 Integrar Calendly para agendar asesorías desde WhatsApp",
            "🚀 Migrar a HubSpot CRM para pipeline completo",
            "🚀 Implementar seguimiento automatizado post-consulta",
            "🚀 Análisis de conversión y optimización de embudos",
          ]},
        ].map((fase, i) => (
          <div key={i} style={{ border:`1px solid ${fase.color}33`, borderRadius:10, padding:"14px 16px" }}>
            <div style={{ fontWeight:700, color:fase.color, marginBottom:10, fontSize:13 }}>{fase.fase}</div>
            <div style={{ display:"grid", gap:6 }}>
              {fase.items.map((item, j) => <div key={j} style={{ fontSize:13, color:C.text, paddingLeft:4 }}>{item}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── MAIN VIEW ────────────────────────────────────────────────────────────
export default function LeadsView() {
  const [tab,      setTab]      = useState("pipeline");
  const [leads,    setLeads]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [filtro,   setFiltro]   = useState({ estado:"", fuente:"", search:"" });
  const [waConfig, setWaConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro.estado) params.set("estado", filtro.estado);
      if (filtro.fuente)  params.set("fuente",  filtro.fuente);
      if (filtro.search)  params.set("search",  filtro.search);
      const [r, s, wc] = await Promise.all([
        api.get(`/api/leads?${params}`),
        api.get("/api/leads/stats"),
        api.get("/api/whatsapp/config").catch(() => null),
      ]);
      setLeads(r.data || []);
      setStats(s);
      setWaConfig(wc);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditLead(null); setModal(true); };
  const openEdit = lead => { setEditLead(lead); setModal(true); };

  const handleDelete = async id => {
    if (!confirm("¿Eliminar este lead?")) return;
    await api.delete(`/api/leads/${id}`); load();
  };

  const handleEstado = async (id, estado) => {
    await api.patch(`/api/leads/${id}/estado`, { estado }); load();
  };

  const TABS = [
    { id:"pipeline",  label:"Pipeline",         emoji:"📊" },
    { id:"templates", label:"Templates WA",     emoji:"💬" },
    { id:"links",     label:"Links conversión",  emoji:"🔗" },
    { id:"estrategia",label:"Estrategia",       emoji:"🗺" },
  ];

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:C.text, display:"flex", alignItems:"center", gap:10 }}>
            💬 WhatsApp & Leads
            {waConfig && !waConfig.configurado && (
              <span style={{ background:C.warningBg, color:C.warning, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700 }}>API no configurada</span>
            )}
          </div>
          <div style={{ fontSize:14, color:C.muted, marginTop:3 }}>Pipeline de prospectos · Links de conversión · Templates · Estrategia digital</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <a href={`https://wa.me/${WA_NUM}`} target="_blank" rel="noopener noreferrer"
            style={{ background:C.wa, color:"#fff", padding:"9px 18px", borderRadius:8, textDecoration:"none", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:6 }}>
            💬 Abrir WhatsApp
          </a>
          <Btn onClick={openNew}>+ Nuevo lead</Btn>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div style={{ display:"flex", gap:12, marginBottom:24, overflowX:"auto", paddingBottom:8 }}>
          <KpiCard emoji="👥" label="Total leads"       value={stats.total}       color={C.accent}/>
          <KpiCard emoji="🆕" label="Nuevos"            value={stats.nuevos}      color={C.accent}  sub="sin contactar"/>
          <KpiCard emoji="✅" label="Convertidos"       value={stats.convertidos} color={C.success} sub={`${stats.tasa_conversion||0}% conversión`}/>
          <KpiCard emoji="💵" label="Pipeline $"        value={`$${Number(stats.valor_pipeline||0).toLocaleString()}`} color={C.warning}/>
          <KpiCard emoji="💬" label="Via WhatsApp"      value={stats.desde_whatsapp} color={C.wa}/>
          <KpiCard emoji="📸" label="Via Instagram"     value={stats.desde_instagram} color={C.pink}/>
          <KpiCard emoji="📅" label="Leads este mes"    value={stats.leads_mes}   color={C.purple}/>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:`2px solid ${C.border}`, paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 18px", background:"none", border:"none", borderBottom: tab===t.id ? `3px solid ${C.accent}` : "3px solid transparent", cursor:"pointer", fontWeight: tab===t.id ? 700 : 500, color: tab===t.id ? C.accent : C.muted, fontSize:14, display:"flex", alignItems:"center", gap:6, marginBottom:-2, fontFamily:"inherit" }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Pipeline Tab */}
      {tab==="pipeline" && (
        <>
          {/* Filtros */}
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            <input value={filtro.search} onChange={e=>setFiltro(p=>({...p,search:e.target.value}))} placeholder="🔍 Buscar lead…" style={{ ...inpSt, width:220 }}/>
            <select value={filtro.estado} onChange={e=>setFiltro(p=>({...p,estado:e.target.value}))} style={{ ...inpSt, width:160 }}>
              <option value="">Todos los estados</option>
              {ESTADOS.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            <select value={filtro.fuente} onChange={e=>setFiltro(p=>({...p,fuente:e.target.value}))} style={{ ...inpSt, width:160 }}>
              <option value="">Todas las fuentes</option>
              {FUENTES.map(f=><option key={f.id} value={f.id}>{f.emoji} {f.label}</option>)}
            </select>
            <Btn variant="ghost" small onClick={() => setFiltro({ estado:"", fuente:"", search:"" })}>Limpiar</Btn>
          </div>

          {loading ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>Cargando pipeline…</div>
          ) : (
            <Pipeline leads={leads} onEdit={openEdit} onDelete={handleDelete} onEstado={handleEstado} onWa={() => {}}/>
          )}
        </>
      )}

      {tab==="templates"  && <TemplatesTab/>}
      {tab==="links"      && <LinksTab/>}
      {tab==="estrategia" && <EstrategiaTab/>}

      {/* Modal lead */}
      {modal && (
        <Modal title={editLead ? `Editar: ${editLead.nombre}` : "Nuevo lead"} onClose={() => setModal(false)} width={640}>
          {editLead && (
            <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
              {ESTADOS.map(e => (
                <button key={e.id} onClick={() => handleEstado(editLead.id, e.id)}
                  style={{ padding:"6px 14px", borderRadius:20, border:`2px solid ${editLead.estado===e.id ? e.color : C.border}`, background: editLead.estado===e.id ? e.bg : "#fff", color: editLead.estado===e.id ? e.color : C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  {e.label}
                </button>
              ))}
              {editLead.telefono && (
                <a href={`https://wa.me/${editLead.telefono.replace(/\D/g,'')}?text=${encodeURIComponent('Hola '+editLead.nombre+', le contacta Orlando Panamá CPA.')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft:"auto", background:C.wa, color:"#fff", padding:"6px 14px", borderRadius:20, textDecoration:"none", fontSize:12, fontWeight:700 }}>
                  💬 WhatsApp
                </a>
              )}
            </div>
          )}
          <LeadForm initial={editLead||{}} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)}/>
        </Modal>
      )}
    </div>
  );
}
