import React, { useState, useEffect } from "react";

// ─── Design tokens (mismo esquema que App.jsx) ────────────────────────────
const C = {
  nav:"#0f1923", navActive:"#0e3a5c", accent:"#0ea5e9",
  bg:"#f0f4f8", surface:"#ffffff", surfaceAlt:"#f8fafc", border:"#e2e8f0",
  text:"#0f172a", textMuted:"#64748b", textLight:"#94a3b8",
  success:"#10b981", successBg:"#ecfdf5", successText:"#065f46",
  warning:"#f59e0b", warningBg:"#fffbeb", warningText:"#92400e",
  danger:"#ef4444", dangerBg:"#fef2f2", dangerText:"#991b1b",
  info:"#0ea5e9", infoBg:"#f0f9ff", infoText:"#0c4a6e",
};

const API_URL = import.meta.env.VITE_API_URL || "";
const apiFetch = async (path, opts = {}) => {
  const token = localStorage.getItem("cp_token");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};

const lblSt = { display:"block", fontSize:12, fontWeight:600, color:C.textMuted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.04em" };
const inpSt = { width:"100%", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, color:C.text, background:C.surfaceAlt, boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
const Fld = ({ label, children }) => <div style={{ marginBottom:16 }}><label style={lblSt}>{label}</label>{children}</div>;

const Card = ({ children, style={} }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"20px 24px", ...style }}>{children}</div>
);

const Btn = ({ children, onClick, variant="primary", loading=false, style={}, ...p }) => {
  const styles = {
    primary:   { background:C.accent, color:"#fff", border:"none" },
    secondary: { background:"none", color:C.textMuted, border:`1px solid ${C.border}` },
    danger:    { background:C.danger, color:"#fff", border:"none" },
    success:   { background:C.success, color:"#fff", border:"none" },
  };
  return (
    <button onClick={onClick} disabled={loading} {...p}
      style={{ padding:"9px 20px", borderRadius:8, fontWeight:600, fontSize:14, cursor:loading?"wait":"pointer",
               fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, opacity:loading?0.7:1,
               ...styles[variant], ...style }}>
      {loading ? "Procesando..." : children}
    </button>
  );
};

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", userSelect:"none" }}>
    <div onClick={onChange} style={{
      width:42, height:24, borderRadius:12, background:checked?C.accent:C.border,
      position:"relative", transition:"background 0.2s", flexShrink:0, cursor:"pointer"
    }}>
      <div style={{
        position:"absolute", top:3, left:checked?18:3, width:18, height:18,
        borderRadius:"50%", background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)"
      }}/>
    </div>
    <span style={{ fontSize:14, color:C.text, fontWeight:500 }}>{label}</span>
  </label>
);

const PlatformIcon = ({ platform, size=32 }) => {
  if (platform === "instagram") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#f09433"/>
        <stop offset="25%" stopColor="#e6683c"/>
        <stop offset="50%" stopColor="#dc2743"/>
        <stop offset="75%" stopColor="#cc2366"/>
        <stop offset="100%" stopColor="#bc1888"/>
      </linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig)"/>
      <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.5" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/>
    </svg>
  );
  if (platform === "tiktok") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="5" fill="#000"/>
      <path d="M19 9.5a5.5 5.5 0 01-3.5-1.3V16a4.5 4.5 0 11-4.5-4.5h.5v2h-.5a2.5 2.5 0 102.5 2.5V5h2a3.5 3.5 0 003.5 3.5v1z" fill="#fff"/>
    </svg>
  );
  return null;
};

const PLATFORM_LABELS = { instagram: "Instagram", tiktok: "TikTok" };

const DEFAULT_PROMPTS = {
  instagram: `Eres el asistente de atención al cliente de {nombre_negocio} en Instagram.
Responde de forma amable, breve y profesional en español.
Si alguien pregunta por precios, servicios o disponibilidad, da la información que tengas y ofrece contacto directo para más detalles.
Si no puedes responder algo, invita a contactar por DM o llamar directamente.
Máximo 2-3 oraciones por respuesta.`,
  tiktok: `Eres el asistente de {nombre_negocio} en TikTok.
Responde de forma cercana, breve y positiva en español.
Usa un tono juvenil pero profesional.
Si no sabes algo, invita a escribir por DM.
Máximo 2 oraciones por respuesta.`,
};

// ─── Formulario de configuración por plataforma ───────────────────────────
const PlatformForm = ({ platform, initial, onSaved }) => {
  const def = initial || {};
  const [form, setForm] = useState({
    activo:               def.activo ?? false,
    access_token:         "",
    page_id:              def.page_id || "",
    account_id:           def.account_id || "",
    nombre_negocio:       def.nombre_negocio || "",
    mensaje_bienvenida:   def.mensaje_bienvenida || "",
    prompt_contexto:      def.prompt_contexto || DEFAULT_PROMPTS[platform],
    responder_comentarios: def.responder_comentarios ?? true,
    responder_dm:          def.responder_dm ?? true,
    solo_preguntas:        def.solo_preguntas ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = { ...form };
      if (!payload.access_token) delete payload.access_token; // no sobreescribir si vacío
      await apiFetch(`/api/social/config/${platform}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMsg({ type:"success", text:"Configuración guardada correctamente." });
      setForm(f => ({ ...f, access_token: "" })); // limpiar campo token
      onSaved?.();
    } catch (e) {
      setMsg({ type:"error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <PlatformIcon platform={platform} size={36}/>
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>{PLATFORM_LABELS[platform]}</div>
            <div style={{ fontSize:12, color:C.textMuted }}>
              {def.updated_at ? `Actualizado: ${new Date(def.updated_at).toLocaleDateString("es-PA")}` : "Sin configurar aún"}
            </div>
          </div>
        </div>
        <Toggle checked={form.activo} onChange={() => set("activo", !form.activo)} label={form.activo ? "Activo" : "Inactivo"}/>
      </div>

      {msg && (
        <div style={{ padding:"10px 14px", borderRadius:8, fontSize:13, fontWeight:500,
          background: msg.type==="success" ? C.successBg : C.dangerBg,
          color: msg.type==="success" ? C.successText : C.dangerText,
          border:`1px solid ${msg.type==="success" ? C.success+"44" : C.danger+"44"}` }}>
          {msg.text}
        </div>
      )}

      <Fld label="Nombre del negocio">
        <input style={inpSt} value={form.nombre_negocio} onChange={e=>set("nombre_negocio",e.target.value)}
          placeholder="Ej: ContaPanamá, Mi Tienda, etc."/>
      </Fld>

      <Fld label={platform === "instagram" ? "Access Token (Meta Graph API)" : "Access Token (TikTok API)"}>
        <input style={inpSt} type="password" value={form.access_token} onChange={e=>set("access_token",e.target.value)}
          placeholder={def.access_token ? "••••••• (dejar vacío para no cambiar)" : "Pega aquí el token de acceso"}/>
      </Fld>

      {platform === "instagram" && (
        <Fld label="Page ID / Business Account ID">
          <input style={inpSt} value={form.page_id} onChange={e=>set("page_id",e.target.value)}
            placeholder="Ej: 123456789012345"/>
        </Fld>
      )}

      {platform === "tiktok" && (
        <Fld label="Open ID (cuenta TikTok)">
          <input style={inpSt} value={form.account_id} onChange={e=>set("account_id",e.target.value)}
            placeholder="Ej: _000abcXYZ..."/>
        </Fld>
      )}

      <div style={{ background:C.surfaceAlt, borderRadius:10, padding:"16px", border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>¿Qué responder automáticamente?</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Toggle checked={form.responder_comentarios} onChange={()=>set("responder_comentarios",!form.responder_comentarios)}
            label="Responder comentarios en publicaciones"/>
          <Toggle checked={form.responder_dm} onChange={()=>set("responder_dm",!form.responder_dm)}
            label="Responder mensajes directos (DM)"/>
          <Toggle checked={form.solo_preguntas} onChange={()=>set("solo_preguntas",!form.solo_preguntas)}
            label="Solo responder si detecta una pregunta o consulta"/>
        </div>
      </div>

      <Fld label="Contexto para la IA (describe tu negocio y cómo debe responder)">
        <textarea style={{ ...inpSt, minHeight:120, resize:"vertical" }} value={form.prompt_contexto}
          onChange={e=>set("prompt_contexto",e.target.value)}
          placeholder="Escribe aquí el contexto de tu negocio, preguntas frecuentes, tono de respuesta, etc."/>
        <div style={{ fontSize:11, color:C.textLight, marginTop:4 }}>
          La IA usará esto para generar respuestas personalizadas. Puedes incluir precios, horarios, servicios, etc.
        </div>
      </Fld>

      <Fld label="Mensaje de bienvenida opcional (se añade al final de cada respuesta)">
        <input style={inpSt} value={form.mensaje_bienvenida} onChange={e=>set("mensaje_bienvenida",e.target.value)}
          placeholder="Ej: ¡Gracias por contactarnos! 😊"/>
      </Fld>

      <Btn onClick={save} loading={saving} style={{ alignSelf:"flex-start" }}>
        Guardar configuración
      </Btn>
    </div>
  );
};

// ─── Vista de logs ────────────────────────────────────────────────────────
const LogsPanel = ({ plataforma }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = plataforma ? `?plataforma=${plataforma}` : "";
    apiFetch(`/api/social/logs${qs}`)
      .then(d => setLogs(d.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [plataforma]);

  if (loading) return <div style={{ color:C.textMuted, fontSize:13, padding:"20px 0" }}>Cargando historial...</div>;
  if (!logs.length) return (
    <div style={{ textAlign:"center", padding:"40px 0", color:C.textMuted, fontSize:14 }}>
      <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
      No hay respuestas automáticas registradas aún.
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {logs.map(l => (
        <div key={l.id} style={{
          border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px",
          background:C.surface, borderLeft:`3px solid ${l.respondido ? C.success : l.error ? C.danger : C.warning}`
        }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
            <PlatformIcon platform={l.plataforma} size={16}/>
            <span style={{ fontSize:11, fontWeight:600, color:C.textMuted, textTransform:"uppercase" }}>{l.tipo}</span>
            {l.es_pregunta && <span style={{ fontSize:10, background:C.infoBg, color:C.infoText, padding:"2px 8px", borderRadius:10, fontWeight:600 }}>PREGUNTA</span>}
            {l.respondido && <span style={{ fontSize:10, background:C.successBg, color:C.successText, padding:"2px 8px", borderRadius:10, fontWeight:600 }}>RESPONDIDO</span>}
            {l.error && <span style={{ fontSize:10, background:C.dangerBg, color:C.dangerText, padding:"2px 8px", borderRadius:10, fontWeight:600 }}>ERROR</span>}
            <span style={{ fontSize:11, color:C.textLight, marginLeft:"auto" }}>{new Date(l.created_at).toLocaleString("es-PA")}</span>
          </div>
          <div style={{ fontSize:13, color:C.textMuted, marginBottom:4 }}>
            <strong style={{ color:C.text }}>Recibido:</strong> {l.mensaje_entrada}
          </div>
          {l.mensaje_salida && (
            <div style={{ fontSize:13, color:C.text, background:C.infoBg, padding:"8px 12px", borderRadius:6, marginTop:4 }}>
              <strong>Respuesta IA:</strong> {l.mensaje_salida}
            </div>
          )}
          {l.error && (
            <div style={{ fontSize:12, color:C.dangerText, marginTop:4 }}>Error: {l.error}</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Vista principal ──────────────────────────────────────────────────────
export default function SocialMediaView() {
  const [configs, setConfigs]     = useState({});
  const [stats, setStats]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("instagram");
  const [showLogs, setShowLogs]   = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, statsRes] = await Promise.all([
        apiFetch("/api/social/config"),
        apiFetch("/api/social/stats").catch(() => ({ stats: [] })),
      ]);
      const map = {};
      for (const c of cfgRes.configs || []) map[c.plataforma] = c;
      setConfigs(map);
      setStats(statsRes.stats || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const webhookBase = (typeof window !== "undefined" ? window.location.origin : "") + (API_URL || "");
  const WEBHOOK_URLS = {
    instagram: `${webhookBase}/api/social/webhook/instagram`,
    tiktok:    `${webhookBase}/api/social/webhook/tiktok`,
  };

  const statFor = (p) => stats.find(s => s.plataforma === p) || {};

  const Tab = ({ id, label, platform }) => (
    <button onClick={()=>{ setActiveTab(id); setShowLogs(false); }}
      style={{
        padding:"8px 18px", borderRadius:8, border:"none", cursor:"pointer",
        fontFamily:"inherit", fontSize:14, fontWeight:600,
        background:activeTab===id ? C.accent : "transparent",
        color:activeTab===id ? "#fff" : C.textMuted,
        display:"flex", alignItems:"center", gap:8,
      }}>
      <PlatformIcon platform={platform} size={18}/>
      {label}
    </button>
  );

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"60px 0", color:C.textMuted, fontSize:14 }}>
      Cargando configuración...
    </div>
  );

  const st = statFor(activeTab);

  return (
    <div style={{ maxWidth:820, margin:"0 auto", padding:"0 0 40px" }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:C.text, margin:0 }}>Auto-respuesta en Redes Sociales</h2>
        <p style={{ fontSize:14, color:C.textMuted, margin:"6px 0 0" }}>
          Responde automáticamente preguntas y consultas en comentarios y DMs usando Inteligencia Artificial.
        </p>
      </div>

      {/* KPIs */}
      {stats.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:20 }}>
          {["instagram","tiktok"].map(p => {
            const s = statFor(p);
            if (!s.total) return null;
            return (
              <Card key={p} style={{ padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <PlatformIcon platform={p} size={20}/>
                  <span style={{ fontWeight:600, fontSize:13 }}>{PLATFORM_LABELS[p]}</span>
                </div>
                <div style={{ fontSize:22, fontWeight:700, color:C.text }}>{s.respondidos}</div>
                <div style={{ fontSize:12, color:C.textMuted }}>de {s.total} mensajes respondidos</div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, background:C.surfaceAlt, padding:4, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:20, width:"fit-content" }}>
        <Tab id="instagram" label="Instagram" platform="instagram"/>
        <Tab id="tiktok"    label="TikTok"    platform="tiktok"/>
      </div>

      {/* Config panel */}
      <Card style={{ marginBottom:16 }}>
        <PlatformForm
          key={activeTab}
          platform={activeTab}
          initial={configs[activeTab]}
          onSaved={loadData}
        />
      </Card>

      {/* Webhook info */}
      <Card style={{ marginBottom:16, background:C.infoBg, border:`1px solid ${C.accent}33` }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.infoText, marginBottom:10 }}>
          URL del Webhook — configura esto en Meta / TikTok for Business
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px" }}>
          <code style={{ fontSize:12, color:C.text, flex:1, wordBreak:"break-all" }}>{WEBHOOK_URLS[activeTab]}</code>
          <button onClick={()=>navigator.clipboard?.writeText(WEBHOOK_URLS[activeTab])}
            style={{ border:"none", background:C.accent, color:"#fff", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", flexShrink:0 }}>
            Copiar
          </button>
        </div>
        {activeTab === "instagram" && (
          <div style={{ fontSize:12, color:C.infoText, marginTop:8 }}>
            Verify Token: <code style={{ background:"#fff", padding:"2px 6px", borderRadius:4 }}>{typeof window!=="undefined" ? (window.__INSTAGRAM_VERIFY_TOKEN__ || "contapanama_ig_verify") : "contapanama_ig_verify"}</code>
            {" — "} configura la variable <code>INSTAGRAM_WEBHOOK_VERIFY_TOKEN</code> en tu servidor si deseas cambiarlo.
          </div>
        )}
      </Card>

      {/* Logs */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:showLogs?16:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:C.text }}>
            Historial de respuestas automáticas
            {st.total > 0 && <span style={{ fontSize:12, color:C.textMuted, fontWeight:400, marginLeft:8 }}>({st.respondidos} de {st.total})</span>}
          </div>
          <Btn variant="secondary" onClick={()=>setShowLogs(v=>!v)} style={{ padding:"6px 14px", fontSize:13 }}>
            {showLogs ? "Ocultar" : "Ver historial"}
          </Btn>
        </div>
        {showLogs && <LogsPanel plataforma={activeTab}/>}
      </Card>
    </div>
  );
}
