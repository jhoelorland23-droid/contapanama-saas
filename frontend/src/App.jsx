import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import PricingView from "./PricingView";

// ═══════════════════════════════════════════════════════════════════════════
//  API LAYER — todas las llamadas al backend centralizadas
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = import.meta.env.VITE_API_URL || "";

const apiFetch = async (path, opts = {}) => {
  const token = localStorage.getItem("cp_token");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};

const api = {
  get:    path        => apiFetch(path),
  post:   (path, body)=> apiFetch(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    (path, body)=> apiFetch(path, { method: "PUT",    body: JSON.stringify(body) }),
  patch:  (path, body)=> apiFetch(path, { method: "PATCH",  body: JSON.stringify(body) }),
  delete: path        => apiFetch(path, { method: "DELETE" }),
  pdf:    async (path) => {
    const token = localStorage.getItem("cp_token");
    const res   = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||"Error PDF"); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = path.split("/").pop().split("?")[0] + ".pdf";
    a.click(); URL.revokeObjectURL(url);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH CONTEXT
// ═══════════════════════════════════════════════════════════════════════════
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cp_token");
    if (!token) { setLoading(false); return; }
    api.get("/api/auth/me")
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem("cp_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user } = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("cp_token", token);
    setUser(user);
  };

  const register = async (nombre, email, password) => {
    const { token, user } = await api.post("/api/auth/register", { nombre, email, password });
    localStorage.setItem("cp_token", token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem("cp_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const C = {
  nav:"#0f1923", navActive:"#0e3a5c", accent:"#0ea5e9",
  bg:"#f0f4f8", surface:"#ffffff", surfaceAlt:"#f8fafc", border:"#e2e8f0",
  text:"#0f172a", textMuted:"#64748b", textLight:"#94a3b8",
  success:"#10b981", successBg:"#ecfdf5", successText:"#065f46",
  warning:"#f59e0b", warningBg:"#fffbeb", warningText:"#92400e",
  danger:"#ef4444",  dangerBg:"#fef2f2",  dangerText:"#991b1b",
  info:"#0ea5e9",    infoBg:"#f0f9ff",    infoText:"#0c4a6e",
};

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const fmt = n => new Intl.NumberFormat("es-PA",{style:"currency",currency:"USD"}).format(n||0);
const fmtDate = d => d ? String(d).slice(0,10) : "—";

const estadoBadge = e => {
  const m = { activo:[C.successBg,C.successText], inactivo:["#f1f5f9","#475569"], omiso:[C.dangerBg,C.dangerText] };
  const [bg,color] = m[e]||m.inactivo;
  return {background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,display:"inline-block",textTransform:"uppercase"};
};
const urgBadge = u => {
  const m = {critica:[C.dangerBg,C.dangerText],alta:[C.warningBg,C.warningText],media:[C.infoBg,C.infoText],baja:["#f8fafc",C.textMuted]};
  const [bg,color] = m[u]||m.baja;
  return {background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,display:"inline-block",textTransform:"uppercase"};
};

// ═══════════════════════════════════════════════════════════════════════════
//  ICONS
// ═══════════════════════════════════════════════════════════════════════════
const PATHS = {
  dashboard:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  users:"M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  journal:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  tax:"M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  report:"M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  bell:"M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  plus:"M12 4v16m8-8H4", check:"M5 13l4 4L19 7", x:"M6 18L18 6M6 6l12 12",
  search:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  dollar:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  trending:"M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  lock:"M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  pdf:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  refresh:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  bank:"M3 6l9-3 9 3M3 6v12l9 3 9-3V6",
  brain:"M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  layers:"M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  creditcard:"M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  shield:"M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};
const Icon = ({name,size=18,color="currentColor"}) => (
  <svg width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d={PATHS[name]||""}/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
//  UI ATOMS
// ═══════════════════════════════════════════════════════════════════════════
const Card = ({children,style={}}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",...style}}>{children}</div>
);

const KpiCard = ({label,value,sub,icon,color=C.accent}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",display:"flex",alignItems:"flex-start",gap:16}}>
    <div style={{width:44,height:44,borderRadius:10,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <Icon name={icon} size={20} color={color}/>
    </div>
    <div>
      <div style={{fontSize:13,color:C.textMuted,marginBottom:4,fontWeight:500}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color:C.text,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:12,color:C.textLight,marginTop:4}}>{sub}</div>}
    </div>
  </div>
);

const Spinner = ({text="Cargando..."}) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"60px 0",gap:10,color:C.textMuted,fontSize:14}}>
    <Icon name="refresh" size={18} color={C.textMuted}/>{text}
  </div>
);

const ErrBox = ({msg,onRetry}) => (
  <div style={{background:C.dangerBg,border:`1px solid ${C.danger}33`,borderLeft:`4px solid ${C.danger}`,borderRadius:8,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,fontSize:13,color:C.dangerText}}>
    <span>⚠ {msg}</span>
    {onRetry&&<button onClick={onRetry} style={{background:C.danger,color:"#fff",border:"none",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>Reintentar</button>}
  </div>
);

const inpSt = {width:"100%",padding:"9px 12px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,color:C.text,background:C.surfaceAlt,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};
const lblSt = {display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"};
const Fld   = ({label,children}) => <div style={{marginBottom:16}}><label style={lblSt}>{label}</label>{children}</div>;

const Btn = ({children,onClick,variant="primary",loading=false,style={},...p}) => {
  const styles = {
    primary:  {background:C.accent,color:"#fff",border:"none"},
    secondary:{background:"none",color:C.textMuted,border:`1px solid ${C.border}`},
    danger:   {background:C.danger,color:"#fff",border:"none"},
    success:  {background:C.success,color:"#fff",border:"none"},
    ghost:    {background:"none",color:C.accent,border:`1px solid ${C.accent}`},
  };
  return (
    <button onClick={onClick} disabled={loading} {...p}
      style={{padding:"9px 20px",borderRadius:8,fontWeight:600,fontSize:14,cursor:loading?"wait":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,opacity:loading?0.7:1,...styles[variant],...style}}>
      {loading?"Procesando...":children}
    </button>
  );
};

const Modal = ({title,onClose,children,width=540}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:C.surface,borderRadius:16,width:"100%",maxWidth:width,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.surface,zIndex:1}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.textMuted,padding:4}}>
          <Icon name="x" size={18}/>
        </button>
      </div>
      <div style={{padding:24}}>{children}</div>
    </div>
  </div>
);

const TH = ({children,right}) => (
  <th style={{padding:"12px 16px",textAlign:right?"right":"left",fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>
    {children}
  </th>
);
const TD = ({children,style={}}) => (
  <td style={{padding:"12px 16px",fontSize:13,color:C.text,borderBottom:`1px solid ${C.border}`,...style}}>{children}</td>
);

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN / REGISTER SCREEN
// ═══════════════════════════════════════════════════════════════════════════
const AuthScreen = () => {
  const { login, register } = useAuth();
  const [mode, setMode]   = useState("login");
  const [form, setForm]   = useState({ nombre:"", email:"", password:"" });
  const [err,  setErr]    = useState("");
  const [busy, setBusy]   = useState(false);

  const handleSubmit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "login")    await login(form.email, form.password);
      else                     await register(form.nombre, form.email, form.password);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onKey = e => e.key === "Enter" && handleSubmit();

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1923 0%,#0e3a5c 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.surface,borderRadius:20,padding:"44px 48px",width:"100%",maxWidth:440,boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:36}}>
          <div style={{width:46,height:46,background:C.accent,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="dollar" size={22} color="#fff"/>
          </div>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>ContaPanamá</div>
            <div style={{fontSize:12,color:C.textMuted}}>Sistema Contable SaaS</div>
          </div>
        </div>

        <div style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:6}}>
          {mode==="login"?"Iniciar sesión":"Crear cuenta"}
        </div>
        <div style={{fontSize:14,color:C.textMuted,marginBottom:28}}>
          {mode==="login"?"Accede a tu plataforma contable":"Registra tu cuenta de contador"}
        </div>

        {err && <ErrBox msg={err}/>}

        {mode==="register" && (
          <Fld label="Nombre completo">
            <input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Juan Pérez CPA" style={inpSt} onKeyDown={onKey}/>
          </Fld>
        )}
        <Fld label="Correo electrónico">
          <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="contador@tuempresa.pa" style={inpSt} onKeyDown={onKey}/>
        </Fld>
        <Fld label="Contraseña">
          <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={mode==="register"?"Mínimo 8 caracteres, 1 mayúscula, 1 número":""} style={inpSt} onKeyDown={onKey}/>
        </Fld>

        <Btn onClick={handleSubmit} loading={busy} style={{width:"100%",justifyContent:"center",marginTop:8,padding:"12px"}}>
          <Icon name="lock" size={16} color="#fff"/>
          {mode==="login"?"Entrar":"Registrarme"}
        </Btn>

        <div style={{textAlign:"center",marginTop:20,fontSize:13,color:C.textMuted}}>
          {mode==="login"?(
            <>¿No tienes cuenta?{" "}
              <span onClick={()=>setMode("register")} style={{color:C.accent,cursor:"pointer",fontWeight:600}}>Regístrate</span>
            </>
          ):(
            <>¿Ya tienes cuenta?{" "}
              <span onClick={()=>setMode("login")} style={{color:C.accent,cursor:"pointer",fontWeight:600}}>Inicia sesión</span>
            </>
          )}
        </div>

        <div style={{marginTop:24,padding:"12px 16px",background:C.infoBg,borderRadius:8,fontSize:12,color:C.infoText}}>
          <strong>Demo:</strong> admin@contapanama.pa / Admin123!
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
const NAV = [
  {id:"dashboard",    label:"Dashboard",        icon:"dashboard"},
  {id:"flujo",        label:"Flujo de Trabajo",  icon:"trending"},
  {id:"clientes",     label:"Clientes",         icon:"users"},
  {id:"transacciones",label:"Diario Contable",  icon:"journal"},
  {id:"contabilidad", label:"Motor Contable",   icon:"brain"},
  {id:"prestamos",    label:"Préstamos",        icon:"creditcard"},
  {id:"fiscal",       label:"Módulo Fiscal",    icon:"tax"},
  {id:"conciliacion", label:"Conciliación",     icon:"bank"},
  {id:"calidad",      label:"Control Calidad",  icon:"shield"},
  {id:"reportes",     label:"Reportes PDF",     icon:"report"},
  {id:"alertas",      label:"Alertas",          icon:"bell"},
  {id:"precios",      label:"Planes y Precios", icon:"dollar"},
];

const Sidebar = ({active,setActive}) => {
  const {user,logout} = useAuth();
  return (
    <div style={{width:230,background:C.nav,display:"flex",flexDirection:"column",height:"100vh",position:"fixed",left:0,top:0,zIndex:100}}>
      <div style={{padding:"24px 20px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:C.accent,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="dollar" size={18} color="#fff"/>
          </div>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:15,lineHeight:1.2}}>ContaPanamá</div>
            <div style={{color:"#64748b",fontSize:11,marginTop:1}}>SaaS Contable</div>
          </div>
        </div>
      </div>
      <div style={{padding:"0 12px",flex:1,overflowY:"auto"}}>
        {NAV.map(item=>{
          const on=active===item.id;
          return (
            <button key={item.id} onClick={()=>setActive(item.id)}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",marginBottom:2,background:on?"#0e3a5c":"transparent",color:on?"#e0f2fe":"#94a3b8",fontWeight:on?600:400,fontSize:14,textAlign:"left",fontFamily:"inherit"}}>
              <Icon name={item.icon} size={17} color={on?C.accent:"#64748b"}/>
              {item.label}
            </button>
          );
        })}
      </div>
      <div style={{padding:"12px 12px 20px",borderTop:"1px solid #1e293b"}}>
        <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#bfdbfe",flexShrink:0}}>
            {user?.nombre?.slice(0,2).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:"#cbd5e1",fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.nombre}</div>
            <div style={{color:"#475569",fontSize:11,textTransform:"capitalize"}}>{user?.rol}</div>
          </div>
        </div>
        <button onClick={logout} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:"#64748b",fontSize:13,fontFamily:"inherit"}}>
          <Icon name="logout" size={15} color="#64748b"/> Cerrar sesión
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════
const DashboardView = () => {
  const [data,setData]   = useState(null);
  const [txns,setTxns]   = useState([]);
  const [err, setErr]    = useState(null);
  const [busy,setBusy]   = useState(true);
  const periodo = new Date().toISOString().slice(0,7);

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      const [d,t]=await Promise.all([
        api.get(`/api/dashboard?periodo=${periodo}`),
        api.get(`/api/transacciones?periodo=${periodo}`),
      ]);
      setData(d); setTxns(t.data||[]);
    } catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[periodo]);

  useEffect(()=>{load();},[load]);

  if(busy) return <Spinner/>;
  if(err)  return <ErrBox msg={err} onRetry={load}/>;

  const fin=data.financiero;
  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Dashboard</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Datos en tiempo real — {periodo}</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <KpiCard label="Ingresos del Mes"  value={fmt(fin.ingresos)}     sub="Período actual"  icon="trending" color={C.success}/>
        <KpiCard label="Gastos del Mes"    value={fmt(fin.gastos)}       sub="Período actual"  icon="dollar"   color={C.warning}/>
        <KpiCard label="ITBMS Neto DGI"    value={fmt(fin.itbms_neto)}   sub={`Débito: ${fmt(fin.itbms_debito)}`} icon="tax" color={C.info}/>
        <KpiCard label="Clientes Activos"  value={data.clientes.activos} sub={`${data.clientes.omisos} omisos`} icon="users" color="#8b5cf6"/>
      </div>

      {/* Evolución mensual */}
      {data.evolucion?.length>0 && (
        <Card style={{marginBottom:24}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:16}}>Evolución Mensual {new Date().getFullYear()}</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:100}}>
            {data.evolucion.map(m=>{
              const maxVal=Math.max(...data.evolucion.map(x=>Math.max(parseFloat(x.ingresos),parseFloat(x.gastos))),1);
              const hi = Math.round((parseFloat(m.ingresos)/maxVal)*90);
              const hg = Math.round((parseFloat(m.gastos)/maxVal)*90);
              return (
                <div key={m.periodo} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{display:"flex",gap:2,alignItems:"flex-end",height:90}}>
                    <div title={`Ingresos: ${fmt(m.ingresos)}`} style={{width:14,height:hi||2,background:C.success,borderRadius:"3px 3px 0 0"}}/>
                    <div title={`Gastos: ${fmt(m.gastos)}`}   style={{width:14,height:hg||2,background:C.danger,borderRadius:"3px 3px 0 0"}}/>
                  </div>
                  <div style={{fontSize:9,color:C.textLight}}>{m.periodo.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:16,marginTop:8}}>
            <span style={{fontSize:11,color:C.textMuted,display:"flex",gap:4,alignItems:"center"}}>
              <span style={{width:10,height:10,background:C.success,borderRadius:2,display:"inline-block"}}/>Ingresos
            </span>
            <span style={{fontSize:11,color:C.textMuted,display:"flex",gap:4,alignItems:"center"}}>
              <span style={{width:10,height:10,background:C.danger,borderRadius:2,display:"inline-block"}}/>Gastos
            </span>
          </div>
        </Card>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>Últimos Movimientos</div>
          {txns.slice(0,6).map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{t.descripcion}</div>
                <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{fmtDate(t.fecha)} · {t.cliente_nombre||"—"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                <div style={{fontSize:13,fontWeight:700,color:t.tipo==="ingreso"?C.success:C.danger}}>
                  {t.tipo==="ingreso"?"+":"-"}{fmt(t.monto)}
                </div>
                <div style={{fontSize:10,color:C.textLight}}>ITBMS: {fmt(t.itbms)}</div>
              </div>
            </div>
          ))}
          {txns.length===0&&<div style={{fontSize:13,color:C.textLight,textAlign:"center",padding:"20px 0"}}>Sin transacciones este período</div>}
        </Card>

        <Card>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>Alertas de Vencimiento</div>
          {data.vencimientos.map(v=>(
            <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{v.descripcion}</div>
                <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{v.cliente_nombre||"Todos"} · {v.entidad}</div>
              </div>
              <div style={{textAlign:"right",marginLeft:12}}>
                <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{fmtDate(v.fecha)}</div>
                <span style={urgBadge(v.urgencia)}>{v.urgencia}</span>
              </div>
            </div>
          ))}
          {data.vencimientos.length===0&&<div style={{fontSize:13,color:C.textLight,textAlign:"center",padding:"20px 0"}}>Sin vencimientos pendientes 🎉</div>}
        </Card>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  CLIENTES VIEW
// ═══════════════════════════════════════════════════════════════════════════
const ClientesView = () => {
  const [rows,setRows] = useState([]);
  const [search,setSearch] = useState("");
  const [busy,setBusy]  = useState(true);
  const [err,setErr]    = useState(null);
  const [saving,setSaving]=useState(false);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [formErrors,setFormErrors]=useState({});
  const EMPTY={nombre:"",ruc:"",nit:"",tipo:"jurídica",actividad:"",estado:"activo",telefono:"",email:""};
  const [form,setForm]=useState(EMPTY);

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      const q=search?`?search=${encodeURIComponent(search)}`:"";
      const res=await api.get(`/api/clientes${q}`);
      setRows(res.data||[]);
    } catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[search]);

  useEffect(()=>{const t=setTimeout(load,350);return()=>clearTimeout(t);},[load]);

  const openNew  = ()=>{setForm(EMPTY);setEditId(null);setFormErrors({});setModal(true);};
  const openEdit = c=>{setForm({nombre:c.nombre,ruc:c.ruc,nit:c.nit||"",tipo:c.tipo,actividad:c.actividad||"",estado:c.estado,telefono:c.telefono||"",email:c.email||""});setEditId(c.id);setFormErrors({});setModal(true);};

  const validateCliente = () => {
    const e={};
    if(!form.nombre.trim()) e.nombre="Nombre requerido";
    if(!form.ruc.trim()) e.ruc="RUC requerido";
    if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email="Email inválido";
    setFormErrors(e);
    return Object.keys(e).length===0;
  };

  const save = async()=>{
    if(!validateCliente()) return;
    setSaving(true);
    try{
      if(editId) await api.put(`/api/clientes/${editId}`,form);
      else       await api.post("/api/clientes",form);
      setModal(false); setFormErrors({}); load();
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  const del = async id=>{
    if(!confirm("¿Eliminar este cliente y todas sus transacciones?"))return;
    try{await api.delete(`/api/clientes/${id}`);load();}
    catch(e){alert(e.message);}
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Gestión de Clientes</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{rows.length} clientes en base de datos</div>
        </div>
        <Btn onClick={openNew}><Icon name="plus" size={16} color="#fff"/>Nuevo Cliente</Btn>
      </div>

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Icon name="search" size={16} color={C.textMuted}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o RUC..." style={{border:"none",outline:"none",fontSize:14,flex:1,fontFamily:"inherit",color:C.text,background:"transparent"}}/>
        </div>
      </Card>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Cliente / Razón Social</TH><TH>RUC</TH><TH>Tipo</TH>
              <TH>Actividad</TH><TH right>Ingresos</TH><TH right>Txns</TH><TH>Estado</TH><TH>Acciones</TH>
            </tr></thead>
            <tbody>
              {rows.map((c,i)=>(
                <tr key={c.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD><div style={{fontWeight:600}}>{c.nombre}</div><div style={{fontSize:11,color:C.textLight}}>NIT: {c.nit}</div></TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted}}>{c.ruc}</TD>
                  <TD><span style={{fontSize:12,background:c.tipo==="jurídica"?C.infoBg:"#fdf4ff",color:c.tipo==="jurídica"?C.infoText:"#7c3aed",padding:"2px 10px",borderRadius:20,fontWeight:600}}>{c.tipo}</span></TD>
                  <TD style={{color:C.textMuted}}>{c.actividad||"—"}</TD>
                  <TD style={{fontWeight:600,color:C.success,textAlign:"right"}}>{fmt(c.total_ingresos)}</TD>
                  <TD style={{textAlign:"right",color:C.textMuted,fontSize:12}}>{c.total_transacciones||0}</TD>
                  <TD><span style={estadoBadge(c.estado)}>{c.estado}</span></TD>
                  <TD>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>openEdit(c)} style={{background:C.infoBg,border:"none",padding:"6px 8px",borderRadius:6,cursor:"pointer"}}><Icon name="edit" size={14} color={C.infoText}/></button>
                      <button onClick={()=>del(c.id)}   style={{background:C.dangerBg,border:"none",padding:"6px 8px",borderRadius:6,cursor:"pointer"}}><Icon name="trash" size={14} color={C.dangerText}/></button>
                    </div>
                  </TD>
                </tr>
              ))}
              {rows.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:"40px",color:C.textMuted}}>No hay clientes registrados</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {modal&&(
        <Modal title={editId?"Editar Cliente":"Nuevo Cliente"} onClose={()=>{setModal(false);setFormErrors({});}}>
          <Fld label={<>Nombre / Razón Social{formErrors.nombre&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.nombre}</span>}</>}>
            <input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} style={{...inpSt,borderColor:formErrors.nombre?C.danger:C.border}}/>
          </Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label={<>RUC{formErrors.ruc&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.ruc}</span>}</>}>
              <input value={form.ruc} onChange={e=>setForm({...form,ruc:e.target.value})} placeholder="155-789-1" style={{...inpSt,borderColor:formErrors.ruc?C.danger:C.border}}/>
            </Fld>
            <Fld label="NIT"><input value={form.nit} onChange={e=>setForm({...form,nit:e.target.value})} placeholder="NT-00234" style={inpSt}/></Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Tipo">
              <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} style={inpSt}>
                <option value="jurídica">Persona Jurídica</option>
                <option value="natural">Persona Natural</option>
              </select>
            </Fld>
            <Fld label="Estado">
              <select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})} style={inpSt}>
                <option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="omiso">Omiso</option>
              </select>
            </Fld>
          </div>
          <Fld label="Actividad Económica"><input value={form.actividad} onChange={e=>setForm({...form,actividad:e.target.value})} style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Teléfono"><input value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} style={inpSt}/></Fld>
            <Fld label={<>Email{formErrors.email&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.email}</span>}</>}>
              <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={{...inpSt,borderColor:formErrors.email?C.danger:C.border}}/>
            </Fld>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setModal(false);setFormErrors({});}}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>{editId?"Actualizar":"Guardar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  TRANSACCIONES VIEW
// ═══════════════════════════════════════════════════════════════════════════
const TransaccionesView = () => {
  const [rows,setRows]     = useState([]);
  const [clientes,setCli]  = useState([]);
  const [resumen,setRes]   = useState(null);
  const [filtro,setFiltro] = useState("todos");
  const [desde,setDesde]   = useState("");
  const [hasta,setHasta]   = useState("");
  const [busy,setBusy]     = useState(true);
  const [err,setErr]       = useState(null);
  const [modal,setModal]   = useState(false);
  const [saving,setSaving] = useState(false);
  const [editId,setEditId] = useState(null);
  const [formErrors,setFormErrors] = useState({});
  const periodo = new Date().toISOString().slice(0,7);
  const EMPTY={fecha:"",cliente_id:"",descripcion:"",tipo:"ingreso",monto:"",itbms:"",deducible:false,tiene_factura:false,itbms_exento:false,banco:"",referencia:""};
  const [form,setForm]=useState(EMPTY);

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      let q=`?periodo=${periodo}`;
      if(filtro!=="todos") q+=`&tipo=${filtro}`;
      if(desde) q+=`&desde=${desde}`;
      if(hasta) q+=`&hasta=${hasta}`;
      const [tx,sm,cl]=await Promise.all([
        api.get(`/api/transacciones${q}`),
        api.get(`/api/transacciones/resumen?periodo=${periodo}`),
        api.get("/api/clientes"),
      ]);
      setRows(tx.data||[]); setRes(sm); setCli(cl.data||[]);
    }catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[periodo,filtro,desde,hasta]);

  useEffect(()=>{load();},[load]);

  const openEdit = t => {
    setForm({fecha:fmtDate(t.fecha),cliente_id:t.cliente_id||"",descripcion:t.descripcion,tipo:t.tipo,monto:String(t.monto),itbms:String(t.itbms),deducible:t.deducible,tiene_factura:t.tiene_factura||false,itbms_exento:t.itbms_exento||false,banco:t.banco||"",referencia:t.referencia||""});
    setEditId(t.id); setFormErrors({}); setModal(true);
  };

  const validateForm = () => {
    const e={};
    if(!form.fecha) e.fecha="Fecha requerida";
    if(!form.descripcion.trim()) e.descripcion="Descripción requerida";
    if(!form.monto || isNaN(parseFloat(form.monto)) || parseFloat(form.monto)<=0) e.monto="Monto debe ser mayor a 0";
    setFormErrors(e);
    return Object.keys(e).length===0;
  };

  const save = async()=>{
    if(!validateForm()) return;
    setSaving(true);
    try{
      if(editId) await api.put(`/api/transacciones/${editId}`,form);
      else       await api.post("/api/transacciones",form);
      setModal(false); setForm(EMPTY); setEditId(null); setFormErrors({}); load();
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  const calcItbms = v=>{
    const m=parseFloat(v);
    if(!isNaN(m)) setForm(f=>({...f,itbms:(m*0.07).toFixed(2)}));
  };

  const del = async id=>{
    if(!confirm("¿Eliminar esta transacción?"))return;
    await api.delete(`/api/transacciones/${id}`); load();
  };

  const BANCOS=["Banco Nacional","Banistmo","BAC","Banesco","Global Bank","Caja de Ahorros"];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Diario Contable</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{rows.length} registros · {periodo}</div>
        </div>
        <Btn onClick={()=>{setEditId(null);setForm(EMPTY);setFormErrors({});setModal(true);}}><Icon name="plus" size={16} color="#fff"/>Nuevo Registro</Btn>
      </div>

      {resumen&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
          <KpiCard label="Ingresos"  value={fmt(resumen.total_ingresos)} icon="trending" color={C.success}/>
          <KpiCard label="Gastos"    value={fmt(resumen.total_gastos)}   icon="dollar"   color={C.warning}/>
          <KpiCard label="Resultado" value={fmt(resumen.utilidad_neta)}  icon="check"    color={parseFloat(resumen.utilidad_neta)>=0?C.success:C.danger}/>
          <KpiCard label="ITBMS Neto" value={fmt(resumen.itbms_neto)}   icon="tax"      color={C.info}/>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        {["todos","ingreso","gasto"].map(t=>(
          <button key={t} onClick={()=>setFiltro(t)} style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${filtro===t?C.accent:C.border}`,background:filtro===t?C.infoBg:"none",color:filtro===t?C.accent:C.textMuted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {t==="todos"?"Todos":t==="ingreso"?"Ingresos":"Gastos"}
          </button>
        ))}
        <div style={{display:"flex",gap:8,marginLeft:"auto",alignItems:"center"}}>
          <span style={{fontSize:12,color:C.textMuted}}>Desde</span>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{...inpSt,width:140,padding:"6px 10px"}}/>
          <span style={{fontSize:12,color:C.textMuted}}>Hasta</span>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{...inpSt,width:140,padding:"6px 10px"}}/>
          {(desde||hasta)&&<button onClick={()=>{setDesde("");setHasta("");}} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:12,fontFamily:"inherit"}}>✕ Limpiar</button>}
        </div>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Fecha</TH><TH>Descripción</TH><TH>Cliente</TH>
              <TH>Tipo</TH><TH right>Monto</TH><TH right>ITBMS</TH>
              <TH>Banco / Ref</TH><TH>Ded.</TH><TH></TH>
            </tr></thead>
            <tbody>
              {rows.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted,fontSize:12}}>{fmtDate(t.fecha)}</TD>
                  <TD style={{fontWeight:600,maxWidth:200}}>{t.descripcion}</TD>
                  <TD style={{color:C.textMuted,fontSize:12}}>{t.cliente_nombre||"—"}</TD>
                  <TD><span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:t.tipo==="ingreso"?C.successBg:C.dangerBg,color:t.tipo==="ingreso"?C.successText:C.dangerText,textTransform:"uppercase"}}>{t.tipo}</span></TD>
                  <TD style={{fontWeight:700,color:t.tipo==="ingreso"?C.success:C.danger,textAlign:"right"}}>{t.tipo==="ingreso"?"+":"-"}{fmt(t.monto)}</TD>
                  <TD style={{color:C.textMuted,textAlign:"right"}}>{fmt(t.itbms)}</TD>
                  <TD><div style={{fontSize:12,fontWeight:600}}>{t.banco}</div><div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{t.referencia}</div></TD>
                  <TD style={{textAlign:"center"}}>{t.deducible?<span style={{color:C.success,fontWeight:700}}>✓</span>:<span style={{color:C.textLight}}>—</span>}</TD>
                  <TD>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>openEdit(t)} style={{background:C.infoBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer"}}><Icon name="edit" size={13} color={C.infoText}/></button>
                      <button onClick={()=>del(t.id)} style={{background:C.dangerBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer"}}><Icon name="trash" size={13} color={C.dangerText}/></button>
                    </div>
                  </TD>
                </tr>
              ))}
              {rows.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:"40px",color:C.textMuted}}>Sin transacciones</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {modal&&(
        <Modal title={editId?"Editar Transacción":"Nuevo Registro Contable"} onClose={()=>{setModal(false);setEditId(null);setFormErrors({});}} width={560}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label={<>Fecha{formErrors.fecha&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.fecha}</span>}</>}>
              <input type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})} style={{...inpSt,borderColor:formErrors.fecha?C.danger:C.border}}/>
            </Fld>
            <Fld label="Tipo">
              <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} style={inpSt}>
                <option value="ingreso">Ingreso</option><option value="gasto">Gasto</option>
              </select>
            </Fld>
          </div>
          <Fld label={<>Descripción / Concepto{formErrors.descripcion&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.descripcion}</span>}</>}>
            <input value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} style={{...inpSt,borderColor:formErrors.descripcion?C.danger:C.border}}/>
          </Fld>
          <Fld label="Cliente">
            <select value={form.cliente_id} onChange={e=>setForm({...form,cliente_id:e.target.value})} style={inpSt}>
              <option value="">Sin cliente específico</option>
              {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label={<>Monto (USD){formErrors.monto&&<span style={{color:C.danger,marginLeft:6,fontSize:11}}>{formErrors.monto}</span>}</>}>
              <input type="number" value={form.monto} onChange={e=>{setForm({...form,monto:e.target.value});calcItbms(e.target.value);}} style={{...inpSt,borderColor:formErrors.monto?C.danger:C.border}}/>
            </Fld>
            <Fld label="ITBMS (7% auto)">
              <input type="number" value={form.itbms} onChange={e=>setForm({...form,itbms:e.target.value})} style={inpSt}/>
            </Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Banco">
              <select value={form.banco} onChange={e=>setForm({...form,banco:e.target.value})} style={inpSt}>
                <option value="">Seleccionar banco...</option>
                {BANCOS.map(b=><option key={b}>{b}</option>)}
              </select>
            </Fld>
            <Fld label="Referencia / Cheque"><input value={form.referencia} onChange={e=>setForm({...form,referencia:e.target.value})} placeholder="CHQ-001234" style={inpSt}/></Fld>
          </div>
          <div style={{display:"flex",gap:24,marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" id="ded" checked={form.deducible} onChange={e=>setForm({...form,deducible:e.target.checked})} style={{width:16,height:16,accentColor:C.accent}}/>
              <label htmlFor="ded" style={{fontSize:14,color:C.textMuted,cursor:"pointer"}}>Gasto deducible</label>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" id="factura" checked={form.tiene_factura||false} onChange={e=>setForm({...form,tiene_factura:e.target.checked})} style={{width:16,height:16,accentColor:C.success}}/>
              <label htmlFor="factura" style={{fontSize:14,color:C.textMuted,cursor:"pointer"}}>
                Tiene factura <span style={{fontSize:11,color:form.tiene_factura&&form.deducible?C.successText:C.textLight,marginLeft:4}}>{form.tiene_factura&&form.deducible?"→ ITBMS crédito fiscal aplica":""}</span>
              </label>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" id="exento" checked={form.itbms_exento||false} onChange={e=>setForm({...form,itbms_exento:e.target.checked,itbms:e.target.checked?"0":form.itbms})} style={{width:16,height:16,accentColor:"#8b5cf6"}}/>
              <label htmlFor="exento" style={{fontSize:14,color:C.textMuted,cursor:"pointer"}}>
                Exento de ITBMS <span style={{fontSize:11,color:"#8b5cf6",marginLeft:4}}>{form.itbms_exento?"→ Sin ITBMS (exención legal)":""}</span>
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>{setModal(false);setEditId(null);setFormErrors({});}}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>{editId?"Actualizar":"Registrar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  FISCAL VIEW
// ═══════════════════════════════════════════════════════════════════════════
const FiscalView = () => {
  const [itbms,setItbms]=useState(null);
  const [renta,setRenta]=useState(null);
  const [cal,setCal]    =useState([]);
  const [busy,setBusy]  =useState(true);
  const [err,setErr]    =useState(null);
  const periodo=new Date().toISOString().slice(0,7);
  const anio=new Date().getFullYear();

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{
      const[i,r,c]=await Promise.all([
        api.get(`/api/fiscal/itbms?periodo=${periodo}`),
        api.get(`/api/fiscal/renta?anio=${anio}`),
        api.get(`/api/fiscal/calendario?anio=${anio}`),
      ]);
      setItbms(i);setRenta(r);
      setCal((c.obligaciones||[]).filter(o=>o.estado!=="pendiente"||o.periodo?.includes(String(anio))));
    }catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[periodo,anio]);

  useEffect(()=>{load();},[load]);

  if(busy) return <Spinner/>;
  if(err)  return <ErrBox msg={err} onRetry={load}/>;

  const estColor={vencido:[C.dangerBg,C.dangerText],proximo:[C.warningBg,C.warningText],presentado:[C.successBg,C.successText],pendiente:[C.infoBg,C.infoText]};
  const totalISR = renta?.total_impuesto||0;

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Módulo Fiscal — Panamá</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Cálculos automáticos desde PostgreSQL · DGI · ITBMS · ISR</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>
        {itbms&&<Card>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:38,height:38,background:C.infoBg,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="tax" size={18} color={C.accent}/></div>
            <div><div style={{fontWeight:700,fontSize:15,color:C.text}}>ITBMS — Formulario 430</div>
            <div style={{fontSize:12,color:C.textMuted}}>Período: {itbms.periodo} · Tasa: 7%</div></div>
          </div>
          {[["Base Imponible (Ventas)",fmt(itbms.base_imponible),C.text],
            ["ITBMS Débito (Ventas × 7%)",fmt(itbms.debito),C.dangerText],
            ["ITBMS Crédito (Compras deducibles)",fmt(itbms.credito),C.successText],
            [null,null,null],
            ["ITBMS NETO A PAGAR",fmt(itbms.saldo_pagar),C.accent],
          ].map(([l,v,c],i)=>v?(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i===3?`2px solid ${C.border}`:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.textMuted}}>{l}</span>
              <span style={{fontSize:i===4?16:13,fontWeight:i===4?800:600,color:c}}>{v}</span>
            </div>
          ):<div key={i} style={{height:8}}/>)}
          <div style={{marginTop:14,background:C.warningBg,border:`1px solid ${C.warning}33`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.warningText}}>
            Vencimiento: <strong>{itbms.vencimiento}</strong> · {itbms.validacion?.mensaje}
          </div>
        </Card>}
        {renta&&<Card>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:38,height:38,background:"#fdf4ff",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="dollar" size={18} color="#7c3aed"/></div>
            <div><div style={{fontWeight:700,fontSize:15,color:C.text}}>ISR — Formulario 101</div>
            <div style={{fontSize:12,color:C.textMuted}}>Año fiscal: {renta.anio} · Tasas panameñas</div></div>
          </div>
          {renta.detalle?.map((d,i)=>(
            <div key={i} style={{marginBottom:16,padding:14,background:C.surfaceAlt,borderRadius:8}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:10}}>
                Persona {d.tipo_persona||"General"}
              </div>
              {[["Ingresos Brutos",fmt(d.ingresos_brutos),C.text],
                ["(-) Gastos Deducibles",fmt(d.gastos_deducibles),C.textMuted],
                ["Renta Neta Gravable",fmt(d.renta_neta),C.text],
                [`ISR (${(d.tasa*100).toFixed(0)}% — ${d.metodo})`,fmt(d.impuesto),"#7c3aed"],
              ].map(([l,v,c],j)=>(
                <div key={j} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.textMuted}}>{l}</span>
                  <span style={{fontSize:j===3?14:12,fontWeight:j===3?800:600,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{padding:"12px 16px",background:"#fdf4ff",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>TOTAL ISR A PAGAR</div>
            <div style={{fontSize:20,fontWeight:800,color:"#7c3aed"}}>{fmt(totalISR)}</div>
          </div>
          <div style={{marginTop:10,fontSize:12,color:C.infoText}}>Vencimiento: <strong>{renta.vencimiento}</strong></div>
        </Card>}
      </div>

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,fontSize:15,fontWeight:700,color:C.text}}>Calendario de Obligaciones {anio}</div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.surfaceAlt}}>
            <TH>Obligación</TH><TH>Entidad</TH><TH>Formulario</TH><TH>Periodicidad</TH><TH>Vencimiento</TH><TH>Estado</TH>
          </tr></thead>
          <tbody>
            {cal.map((o,i)=>{
              const[bg,tc]=estColor[o.estado]||estColor.pendiente;
              return(
                <tr key={i} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD style={{fontWeight:600}}>{o.descripcion}</TD>
                  <TD style={{color:C.textMuted}}>{o.entidad}</TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted,fontSize:12}}>{o.formulario}</TD>
                  <TD style={{color:C.textMuted,textTransform:"capitalize"}}>{o.periodicidad}</TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",fontWeight:600,fontSize:12}}>{o.fecha_vencimiento}</TD>
                  <TD><span style={{background:bg,color:tc,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{o.estado}</span></TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONCILIACIÓN VIEW
// ═══════════════════════════════════════════════════════════════════════════
const ConciliacionView = () => {
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(true);
  const [err,setErr]=useState(null);
  const [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{const r=await api.get(`/api/fiscal/conciliacion?periodo=${periodo}`);setData(r);}
    catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[periodo]);

  useEffect(()=>{load();},[load]);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Conciliación Bancaria</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Compara registros contables vs movimientos bancarios</div>
        </div>
        <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:160}}/>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:data&&(
        <>
          {data.alertas?.length>0&&(
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}33`,borderLeft:`4px solid ${C.warning}`,borderRadius:10,padding:"14px 18px",marginBottom:20}}>
              <div style={{fontWeight:700,color:C.warningText,marginBottom:6}}>⚠ {data.alertas.length} diferencia(s) detectada(s)</div>
              {data.alertas.map((a,i)=>(
                <div key={i} style={{fontSize:13,color:C.warningText}}>• {a.banco}: diferencia de {fmt(a.diferencia)}</div>
              ))}
            </div>
          )}
          <Card style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:C.surfaceAlt}}>
                <TH>Banco</TH><TH right>Saldo Contable</TH><TH right>Saldo Banco</TH>
                <TH right>Diferencia</TH><TH>Transacciones</TH><TH>Estado</TH>
              </tr></thead>
              <tbody>
                {data.resumen?.map((r,i)=>{
                  const eColor={conciliado:[C.successBg,C.successText],diferencia:[C.dangerBg,C.dangerText],sin_datos:["#f8fafc",C.textMuted]}[r.estado];
                  return(
                    <tr key={i} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontWeight:600}}>{r.banco}</TD>
                      <TD style={{textAlign:"right",fontWeight:600}}>{fmt(r.saldo_contable)}</TD>
                      <TD style={{textAlign:"right",color:C.textMuted}}>{r.saldo_banco==="Sin registros bancarios"?<span style={{color:C.textLight,fontSize:12}}>Sin datos</span>:fmt(r.saldo_banco)}</TD>
                      <TD style={{textAlign:"right",fontWeight:700,color:r.diferencia==="N/A"?C.textLight:parseFloat(r.diferencia)===0?C.success:C.danger}}>
                        {r.diferencia==="N/A"?"—":fmt(r.diferencia)}
                      </TD>
                      <TD style={{color:C.textMuted,fontSize:12}}>{r.num_transacciones} registros</TD>
                      <TD><span style={{background:eColor?.[0],color:eColor?.[1],padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{r.estado.replace("_"," ")}</span></TD>
                    </tr>
                  );
                })}
                {(!data.resumen||data.resumen.length===0)&&(
                  <tr><td colSpan={6} style={{textAlign:"center",padding:"40px",color:C.textMuted}}>No hay datos de conciliación para este período. Registra transacciones con banco asignado.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  REPORTES VIEW — PDFs reales
// ═══════════════════════════════════════════════════════════════════════════
const ReportesView = () => {
  const [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));
  const [clientes,setCli]  =useState([]);
  const [cliSel,setCliSel] =useState("");
  const [resumen,setRes]   =useState(null);
  const [txns,setTxns]     =useState([]);
  const [busy,setBusy]     =useState(true);
  const [genPDF,setGenPDF] =useState("");

  useEffect(()=>{
    Promise.all([
      api.get(`/api/transacciones/resumen?periodo=${periodo}`),
      api.get(`/api/transacciones?periodo=${periodo}`),
      api.get("/api/clientes"),
    ]).then(([r,t,c])=>{setRes(r);setTxns(t.data||[]);setCli(c.data||[]);}).finally(()=>setBusy(false));
  },[periodo]);

  const generar = async(tipo, isJson=false) => {
    setGenPDF(tipo);
    try{
      if(isJson) {
        const data=await api.get(`/api/reportes/diario-json?periodo=${periodo}`);
        const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url;
        a.download=`diario-${periodo}.json`; a.click();
        URL.revokeObjectURL(url);
        return;
      }
      let path="";
      if(tipo==="diario")      path=`/api/reportes/diario?periodo=${periodo}`;
      if(tipo==="estado")      path=`/api/reportes/estado-resultados?periodo=${periodo}`;
      if(tipo==="itbms")       path=`/api/reportes/itbms?periodo=${periodo}`;
      if(tipo==="diario-json") path=`/api/reportes/diario-json?periodo=${periodo}`;
      if(tipo==="cliente"&&cliSel) path=`/api/reportes/cliente/${cliSel}?periodo=${periodo}`;
      if(!path){alert("Selecciona un cliente para el reporte individual");return;}
      await api.pdf(path);
    }catch(e){alert("Error generando reporte: "+e.message);}
    finally{setGenPDF("");}
  };

  if(busy) return <Spinner/>;

  const ing=txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+parseFloat(t.monto),0);
  const gst=txns.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+parseFloat(t.monto),0);
  const util=ing-gst;
  const margen=ing>0?((util/ing)*100).toFixed(1):0;

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Reportes PDF Profesionales</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Generación real de PDFs · Diario combinado · Estado de resultados · ITBMS</div>
      </div>

      {/* Selector de período */}
      <Card style={{marginBottom:24}}>
        <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Período</div>
            <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:160}}/>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Cliente (para reporte individual)</div>
            <select value={cliSel} onChange={e=>setCliSel(e.target.value)} style={{...inpSt,width:260}}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Estado de resultados inline */}
      <Card style={{marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:20}}>Vista Previa — Estado de Resultados {periodo}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2px 1fr",gap:24}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.success,textTransform:"uppercase",marginBottom:12}}>Ingresos</div>
            {txns.filter(t=>t.tipo==="ingreso").map(t=>(
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                <span style={{color:C.textMuted}}>{t.descripcion}</span>
                <span style={{fontWeight:600}}>{fmt(t.monto)}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",fontSize:14,fontWeight:800}}>
              <span>Total Ingresos</span><span style={{color:C.success}}>{fmt(ing)}</span>
            </div>
          </div>
          <div style={{background:C.border}}/>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.danger,textTransform:"uppercase",marginBottom:12}}>Gastos y Costos</div>
            {txns.filter(t=>t.tipo==="gasto").map(t=>(
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                <span style={{color:C.textMuted}}>{t.descripcion}</span>
                <span style={{fontWeight:600}}>{fmt(t.monto)}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",fontSize:14,fontWeight:800}}>
              <span>Total Gastos</span><span style={{color:C.danger}}>{fmt(gst)}</span>
            </div>
          </div>
        </div>
        <div style={{marginTop:20,padding:"16px 20px",background:util>=0?C.successBg:C.dangerBg,borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:util>=0?C.successText:C.dangerText,textTransform:"uppercase"}}>{util>=0?"Utilidad Neta":"Pérdida Neta"}</div>
            <div style={{fontSize:12,color:util>=0?C.successText:C.dangerText,opacity:0.8}}>Margen: {margen}%</div>
          </div>
          <div style={{fontSize:26,fontWeight:800,color:util>=0?C.success:C.danger}}>{fmt(util)}</div>
        </div>
      </Card>

      {/* Botones PDF */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
        {[
          {id:"diario",  icon:"journal", title:"Diario Combinado",        desc:"Todos los asientos del período, agrupados por fecha. Listo para auditoría DGI.",           color:C.accent},
          {id:"estado",  icon:"trending",title:"Estado de Resultados",   desc:"Ingresos, gastos y utilidad neta. Formato profesional con márgenes y análisis.",           color:C.success},
          {id:"itbms",   icon:"tax",     title:"Declaración ITBMS (430)",desc:"Débito, crédito fiscal y saldo a pagar. Referencia al Formulario 430 de la DGI.",         color:"#7c3aed"},
          {id:"cliente", icon:"users",   title:"Reporte por Cliente",    desc:"Historial completo de transacciones para el cliente seleccionado arriba.",                  color:"#ec4899"},
        ].map(r=>(
          <div key={r.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24}}>
            <div style={{width:44,height:44,borderRadius:10,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <Icon name={r.icon} size={20} color={r.color}/>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{r.title}</div>
            <div style={{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:18}}>{r.desc}</div>
            <Btn onClick={()=>generar(r.id, r.json||false)} loading={genPDF===r.id} style={{background:r.color,color:"#fff",border:"none"}}>
              <Icon name={r.json?"layers":"pdf"} size={15} color="#fff"/>
              {genPDF===r.id?"Generando...":(r.json?"Exportar JSON":"Descargar PDF")}
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  ALERTAS VIEW
// ═══════════════════════════════════════════════════════════════════════════
const AlertasView = () => {
  const [rows,setRows]=useState([]);
  const [busy,setBusy]=useState(true);
  const [err,setErr]=useState(null);
  const [modal,setModal]=useState(false);
  const [saving,setSaving]=useState(false);
  const EMPTY={descripcion:"",entidad:"DGI",fecha:"",urgencia:"media",cliente_nombre:"Todos"};
  const [form,setForm]=useState(EMPTY);

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{const r=await api.get("/api/vencimientos");setRows(r.data||[]);}
    catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const completar=async id=>{await api.patch(`/api/vencimientos/${id}/completar`,{});load();};
  const eliminar =async id=>{await api.delete(`/api/vencimientos/${id}`);load();};
  const save=async()=>{
    setSaving(true);
    try{await api.post("/api/vencimientos",form);setModal(false);setForm(EMPTY);load();}
    catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Centro de Alertas</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{rows.length} alertas pendientes</div>
        </div>
        <Btn onClick={()=>setModal(true)}><Icon name="plus" size={16} color="#fff"/>Nueva Alerta</Btn>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {rows.map(v=>{
            const bc={critica:C.danger,alta:C.warning,media:C.accent,baja:C.border}[v.urgencia];
            const bg={critica:C.dangerBg,alta:C.warningBg,media:C.infoBg,baja:C.surfaceAlt}[v.urgencia];
            return(
              <div key={v.id} style={{background:bg,border:`1px solid ${bc}44`,borderLeft:`4px solid ${bc}`,borderRadius:10,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <Icon name="bell" size={20} color={bc}/>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:C.text}}>{v.descripcion}</div>
                    <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>{v.cliente_nombre||"Todos"} · {v.entidad}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>{fmtDate(v.fecha)}</div>
                    <span style={urgBadge(v.urgencia)}>{v.urgencia}</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>completar(v.id)} style={{background:C.successBg,border:"none",padding:"7px 9px",borderRadius:7,cursor:"pointer"}}><Icon name="check" size={14} color={C.success}/></button>
                    <button onClick={()=>eliminar(v.id)}  style={{background:C.dangerBg,border:"none",padding:"7px 9px",borderRadius:7,cursor:"pointer"}}><Icon name="trash" size={14} color={C.dangerText}/></button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length===0&&<Card style={{textAlign:"center",color:C.textMuted,padding:"40px"}}>🎉 Sin alertas pendientes</Card>}
        </div>
      )}

      {modal&&(
        <Modal title="Nueva Alerta" onClose={()=>setModal(false)} width={460}>
          <Fld label="Descripción"><input value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Entidad">
              <select value={form.entidad} onChange={e=>setForm({...form,entidad:e.target.value})} style={inpSt}>
                {["DGI","CSS","Municipio","MICI","Otro"].map(e=><option key={e}>{e}</option>)}
              </select>
            </Fld>
            <Fld label="Urgencia">
              <select value={form.urgencia} onChange={e=>setForm({...form,urgencia:e.target.value})} style={inpSt}>
                <option value="critica">Crítica</option><option value="alta">Alta</option>
                <option value="media">Media</option><option value="baja">Baja</option>
              </select>
            </Fld>
          </div>
          <Fld label="Fecha de Vencimiento"><input type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})} style={inpSt}/></Fld>
          <Fld label="Cliente / Observación"><input value={form.cliente_nombre} onChange={e=>setForm({...form,cliente_nombre:e.target.value})} placeholder="Todos" style={inpSt}/></Fld>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>Guardar Alerta</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  IMPORTAR TAB — CSV / JSON bank statement importer
// ═══════════════════════════════════════════════════════════════════════════
const ImportarTab = () => {
  const [clientes, setCli]    = useState([]);
  const [formato, setFormato] = useState("csv");
  const [banco, setBanco]     = useState("generico");
  const [clienteId, setCliId] = useState("");
  const [contenido, setCont]  = useState("");
  const [busy, setBusy]       = useState(false);
  const [resultado, setRes]   = useState(null);
  const [historial, setHist]  = useState([]);
  const [histBusy, setHistBusy] = useState(true);

  useEffect(()=>{
    Promise.all([
      api.get("/api/clientes"),
      api.get("/api/contabilidad/importaciones"),
    ]).then(([c,h])=>{ setCli(c.data||[]); setHist(h.data||[]); }).finally(()=>setHistBusy(false));
  },[]);

  const handleFile = e => {
    const file=e.target.files?.[0]; if(!file) return;
    const fmt=file.name.endsWith('.json')?'json':'csv';
    setFormato(fmt);
    // Auto-detect banco
    const n=file.name.toLowerCase();
    if(/banco.nacional/.test(n)) setBanco('banco_nacional');
    else if(/banistmo/.test(n))  setBanco('banistmo');
    else if(/\bbac\b/.test(n))   setBanco('bac');
    else if(/banesco/.test(n))   setBanco('banesco');

    const reader=new FileReader();
    reader.onload=ev=>setCont(ev.target.result||"");
    reader.readAsText(file);
  };

  const importar = async () => {
    if(!contenido.trim()) return alert("Pega el contenido o carga un archivo.");
    setBusy(true); setRes(null);
    try {
      const r=await api.post("/api/contabilidad/importar",{
        contenido, formato, banco,
        cliente_id: clienteId||undefined,
        nombre_archivo: `importacion-${Date.now()}.${formato}`,
      });
      setRes(r);
      // Refresh historial
      api.get("/api/contabilidad/importaciones").then(h=>setHist(h.data||[]));
    } catch(e){ alert(e.message); }
    finally { setBusy(false); }
  };

  const BANCOS=[
    {v:"generico",l:"Genérico (auto-detectar)"},
    {v:"banco_nacional",l:"Banco Nacional de Panamá"},
    {v:"banistmo",l:"Banistmo"},
    {v:"bac",l:"BAC Credomatic"},
    {v:"banesco",l:"Banesco"},
  ];

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      {/* Panel izquierdo: formulario */}
      <div>
        <Card style={{marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}}>Importar Extracto Bancario</div>

          <Fld label="Banco">
            <select value={banco} onChange={e=>setBanco(e.target.value)} style={inpSt}>
              {BANCOS.map(b=><option key={b.v} value={b.v}>{b.l}</option>)}
            </select>
          </Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Formato">
              <select value={formato} onChange={e=>setFormato(e.target.value)} style={inpSt}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </Fld>
            <Fld label="Cliente (opcional)">
              <select value={clienteId} onChange={e=>setCliId(e.target.value)} style={inpSt}>
                <option value="">Sin cliente</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Fld>
          </div>

          {/* Upload o pegar */}
          <Fld label="Archivo CSV / JSON">
            <input type="file" accept=".csv,.json,.txt" onChange={handleFile}
              style={{...inpSt,padding:"8px 12px",cursor:"pointer"}}/>
          </Fld>

          <Fld label="O pegar contenido directamente">
            <textarea value={contenido} onChange={e=>setCont(e.target.value)}
              placeholder={`Fecha,Descripción,Débito,Crédito,Referencia\n01/03/2025,YAPPY RECIBIDO,,500.00,TRF001\n02/03/2025,ALQUILER OFICINA,850.00,,CHQ-123`}
              style={{...inpSt,height:120,resize:"vertical",fontFamily:"JetBrains Mono,monospace",fontSize:11}}/>
          </Fld>

          <Btn onClick={importar} loading={busy} style={{width:"100%",justifyContent:"center"}}>
            <Icon name="refresh" size={15} color="#fff"/>Importar y Clasificar
          </Btn>

          {resultado&&(
            <div style={{marginTop:16,background:resultado.importadas>0?C.successBg:C.warningBg,border:`1px solid ${resultado.importadas>0?C.success:C.warning}33`,borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>{resultado.mensaje}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {l:"Importadas",v:resultado.importadas,c:C.success},
                  {l:"Duplicadas", v:resultado.duplicadas,c:C.warning},
                  {l:"Errores",    v:resultado.errores,   c:C.danger},
                ].map(k=>(
                  <div key={k.l} style={{textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
                    <div style={{fontSize:11,color:C.textMuted}}>{k.l}</div>
                  </div>
                ))}
              </div>
              {resultado.detalles_error?.length>0&&(
                <div style={{marginTop:12,fontSize:11,color:C.dangerText,background:C.dangerBg,borderRadius:6,padding:"8px 10px",maxHeight:80,overflowY:"auto"}}>
                  {resultado.detalles_error.slice(0,5).map((e,i)=><div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Formatos aceptados */}
        <Card>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>Formato CSV esperado</div>
          <div style={{background:"#0f1923",borderRadius:8,padding:14,fontFamily:"JetBrains Mono,monospace",fontSize:11,color:"#a5f3fc",lineHeight:1.8,overflowX:"auto"}}>
            <div style={{color:"#64748b"}}># Banco Nacional / Banistmo</div>
            <div>Fecha,Descripción,Débito,Crédito,Referencia</div>
            <div style={{color:"#94a3b8"}}>01/03/2025,YAPPY RECIBIDO,,500.00,TRF001</div>
            <div style={{color:"#94a3b8"}}>02/03/2025,ALQUILER OFICINA,850.00,,CHQ-123</div>
            <div style={{marginTop:8,color:"#64748b"}}># BAC / Genérico</div>
            <div>Fecha,Concepto,Monto,Tipo,No. Referencia</div>
            <div style={{color:"#94a3b8"}}>2025-03-05,HONORARIOS RECIBIDOS,1500,Crédito,TRF-045</div>
          </div>
          <div style={{marginTop:10,fontSize:12,color:C.textMuted,lineHeight:1.7}}>
            • El sistema auto-detecta duplicados comparando fecha + monto + banco.<br/>
            • Cada fila importada se clasifica automáticamente con el motor contable.<br/>
            • PDF: exporte como CSV desde su banco (pendiente integración nativa).
          </div>
        </Card>
      </div>

      {/* Panel derecho: historial */}
      <Card style={{padding:0,overflow:"hidden",alignSelf:"start"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700,color:C.text}}>Historial de Importaciones</div>
        {histBusy?<Spinner/>:(
          <div>
            {historial.map((h,i)=>(
              <div key={h.id} style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:i%2?C.surfaceAlt:C.surface}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>{h.nombre_archivo}</div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{h.cliente_nombre||"Sin cliente"} · {h.banco} · {String(h.created_at).slice(0,10)}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:h.estado==="completado"?C.successBg:C.warningBg,color:h.estado==="completado"?C.successText:C.warningText,textTransform:"uppercase"}}>{h.estado}</span>
                </div>
                <div style={{display:"flex",gap:16,marginTop:8,fontSize:12}}>
                  <span style={{color:C.success}}>✓ {h.importadas} import.</span>
                  <span style={{color:C.warning}}>⊘ {h.duplicadas} dup.</span>
                  {h.errores>0&&<span style={{color:C.danger}}>✗ {h.errores} err.</span>}
                </div>
              </div>
            ))}
            {historial.length===0&&<div style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Sin importaciones</div>}
          </div>
        )}
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  APRENDIZAJE TAB — historial de correcciones + reglas auto-generadas
// ═══════════════════════════════════════════════════════════════════════════
const AprendizajeTab = () => {
  const [correcciones, setCor] = useState([]);
  const [busy, setBusy]        = useState(true);
  const [err, setErr]          = useState(null);

  useEffect(()=>{
    api.get("/api/contabilidad/correcciones")
      .then(r=>setCor(r.data||[]))
      .catch(e=>setErr(e.message))
      .finally(()=>setBusy(false));
  },[]);

  const autoGen  = correcciones.filter(c=>c.regla_generada_id);
  const sinRegla = correcciones.filter(c=>!c.regla_generada_id);

  return (
    <div>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        {[
          {l:"Total correcciones",   v:correcciones.length,  c:C.accent,  ico:"edit"},
          {l:"Reglas auto-generadas",v:autoGen.length,       c:C.success, ico:"brain"},
          {l:"Sin regla aún",        v:sinRegla.length,       c:C.warning, ico:"bell"},
        ].map(k=>(
          <KpiCard key={k.l} label={k.l} value={k.v} icon={k.ico} color={k.c}
            sub={k.l==="Sin regla aún"?"3 correcciones = nueva regla":""}/>
        ))}
      </div>

      <div style={{background:C.infoBg,border:`1px solid ${C.accent}33`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:13,color:C.infoText,display:"flex",gap:8,alignItems:"flex-start"}}>
        <Icon name="brain" size={16} color={C.accent}/>
        <div>El sistema aprende de tus correcciones. Cuando corriges la misma descripción 3 veces con la misma cuenta, se genera automáticamente una nueva regla de clasificación.</div>
      </div>

      {err&&<ErrBox msg={err}/>}
      {busy?<Spinner/>:(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Descripción original</TH><TH>Cuenta original</TH>
              <TH>Cuenta corregida</TH><TH>Cliente</TH>
              <TH>Regla generada</TH><TH>Fecha</TH>
            </tr></thead>
            <tbody>
              {correcciones.map((c,i)=>(
                <tr key={c.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD style={{maxWidth:180,fontSize:12}}>{c.descripcion_orig}</TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,color:C.danger}}>{c.cuenta_original||"—"}</TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,color:C.success,fontWeight:700}}>{c.cuenta_correcta}</TD>
                  <TD style={{fontSize:12,color:C.textMuted}}>{c.cliente_nombre||"—"}</TD>
                  <TD>
                    {c.regla_generada_id
                      ? <span style={{background:C.successBg,color:C.successText,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>✓ {c.regla_nombre||"Auto"}</span>
                      : <span style={{fontSize:11,color:C.textLight}}>Pendiente</span>}
                  </TD>
                  <TD style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{String(c.created_at).slice(0,10)}</TD>
                </tr>
              ))}
              {!correcciones.length&&<tr><td colSpan={6} style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Sin correcciones aún. Cuando corrijas una clasificación, aparecerá aquí.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  REGLAS TAB — CRUD de reglas de clasificación dinámicas
// ═══════════════════════════════════════════════════════════════════════════
const CUENTAS_COMUNES = [
  {c:"1102",n:"Bancos"},{c:"1301",n:"ITBMS Crédito Fiscal"},
  {c:"2201",n:"ITBMS por Pagar"},{c:"4101",n:"Servicios Profesionales"},
  {c:"4102",n:"Ventas"},{c:"4103",n:"Honorarios"},
  {c:"4104",n:"Consultoría"},{c:"4105",n:"Servicios Contables"},
  {c:"4901",n:"Otros Ingresos"},{c:"6101",n:"Sueldos"},
  {c:"6102",n:"CSS"},{c:"6201",n:"Alquiler"},
  {c:"6202",n:"Telefonía"},{c:"6203",n:"Servicios Públicos"},
  {c:"6204",n:"Papelería"},{c:"6205",n:"Mantenimiento"},
  {c:"6206",n:"Transporte"},{c:"6207",n:"Alimentación"},
  {c:"6208",n:"Proveedores"},{c:"6209",n:"Servicios Contratados"},
  {c:"6301",n:"Publicidad"},{c:"6402",n:"Com. Bancarias"},
  {c:"6901",n:"Otros Gastos"},
];

const ReglasTab = () => {
  const [rows, setRows]     = useState([]);
  const [busy, setBusy]     = useState(true);
  const [err, setErr]       = useState(null);
  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("todas");
  const EMPTY = {nombre:"",patron:"",tipo:"gasto",cuenta_codigo:"6901",deducible:false,etiqueta:"",confianza:"alta",prioridad:100};
  const [form, setForm]     = useState(EMPTY);
  const [patErr, setPatErr] = useState("");

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try { const r=await api.get("/api/contabilidad/reglas"); setRows(r.data||[]); }
    catch(e){ setErr(e.message); }
    finally { setBusy(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const testPatron = v => {
    try { new RegExp(v,'i'); setPatErr(""); } catch(e){ setPatErr("Regex inválido: "+e.message); }
  };

  const openNew  = ()=>{ setForm(EMPTY); setEditId(null); setPatErr(""); setModal(true); };
  const openEdit = r=>{ setForm({nombre:r.nombre,patron:r.patron,tipo:r.tipo,cuenta_codigo:r.cuenta_codigo,deducible:r.deducible,etiqueta:r.etiqueta,confianza:r.confianza,prioridad:r.prioridad}); setEditId(r.id); setPatErr(""); setModal(true); };

  const save = async()=>{
    if(!form.nombre||!form.patron||!form.etiqueta) return;
    if(patErr) return;
    setSaving(true);
    try {
      if(editId) await api.put(`/api/contabilidad/reglas/${editId}`,form);
      else       await api.post("/api/contabilidad/reglas",form);
      setModal(false); load();
    } catch(e){ alert(e.message); }
    finally { setSaving(false); }
  };

  const del = async id=>{
    if(!confirm("¿Eliminar esta regla?")) return;
    try { await api.delete(`/api/contabilidad/reglas/${id}`); load(); }
    catch(e){ alert(e.message); }
  };

  const toggle = async(id,activo)=>{
    try { await api.put(`/api/contabilidad/reglas/${id}`,{activo:!activo}); load(); }
    catch(e){ alert(e.message); }
  };

  const filtradas = rows.filter(r =>
    filter==="todas" || filter==="mias" ? (filter==="todas"||r.usuario_id) : !r.usuario_id
  );

  const confColor={alta:C.success,media:C.warning,baja:C.danger};

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",gap:8}}>
          {["todas","mias","globales"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${filter===f?C.accent:C.border}`,background:filter===f?C.infoBg:"none",color:filter===f?C.accent:C.textMuted,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
              {f==="todas"?"Todas":f==="mias"?"Mis reglas":"Globales"} {f==="todas"?`(${rows.length})`:f==="mias"?`(${rows.filter(r=>r.usuario_id).length})`:`(${rows.filter(r=>!r.usuario_id).length})`}
            </button>
          ))}
        </div>
        <Btn onClick={openNew}><Icon name="plus" size={15} color="#fff"/>Nueva Regla</Btn>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Nombre</TH><TH>Patrón (regex)</TH><TH>Tipo</TH>
              <TH>Cuenta</TH><TH>Confianza</TH><TH>Origen</TH><TH>Acciones</TH>
            </tr></thead>
            <tbody>
              {filtradas.map((r,i)=>(
                <tr key={r.id} style={{background:i%2?C.surfaceAlt:C.surface,opacity:r.activo?1:0.5}}>
                  <TD style={{fontWeight:600}}>{r.nombre}</TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,color:C.infoText,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.patron}>
                    {r.patron.length>40?r.patron.slice(0,40)+"…":r.patron}
                  </TD>
                  <TD><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,textTransform:"uppercase",background:r.tipo==="ingreso"?C.successBg:C.dangerBg,color:r.tipo==="ingreso"?C.successText:C.dangerText}}>{r.tipo}</span></TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:C.textMuted}}>{r.cuenta_codigo}{r.deducible&&<span style={{marginLeft:6,fontSize:10,background:C.infoBg,color:C.infoText,padding:"1px 5px",borderRadius:20,fontWeight:700}}>ded.</span>}</TD>
                  <TD><span style={{fontSize:11,fontWeight:700,color:confColor[r.confianza]||C.textMuted}}>{r.confianza}</span></TD>
                  <TD>
                    <span style={{fontSize:11,background:r.usuario_id?C.infoBg:"#f0fdf4",color:r.usuario_id?C.infoText:"#166534",padding:"2px 8px",borderRadius:20,fontWeight:600}}>
                      {r.usuario_id?"Propia":"Global"}
                    </span>
                  </TD>
                  <TD>
                    <div style={{display:"flex",gap:6}}>
                      {r.usuario_id&&<button onClick={()=>openEdit(r)} style={{background:C.infoBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer"}}><Icon name="edit" size={13} color={C.infoText}/></button>}
                      <button onClick={()=>toggle(r.id,r.activo)} style={{background:r.activo?C.warningBg:C.successBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,color:r.activo?C.warningText:C.successText}}>
                        {r.activo?"Off":"On"}
                      </button>
                      {r.usuario_id&&<button onClick={()=>del(r.id)} style={{background:C.dangerBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer"}}><Icon name="trash" size={13} color={C.dangerText}/></button>}
                    </div>
                  </TD>
                </tr>
              ))}
              {!filtradas.length&&<tr><td colSpan={7} style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Sin reglas</td></tr>}
            </tbody>
          </table>
          <div style={{padding:"10px 20px",borderTop:`1px solid ${C.border}`,fontSize:12,color:C.textMuted}}>
            {filtradas.length} reglas · Prioridad: menor número = se aplica primero
          </div>
        </Card>
      )}

      {modal&&(
        <Modal title={editId?"Editar Regla":"Nueva Regla de Clasificación"} onClose={()=>setModal(false)} width={560}>
          <Fld label="Nombre de la regla"><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Supermercados Panamá" style={inpSt}/></Fld>
          <Fld label={<>Patrón (regex){patErr&&<span style={{color:C.danger,marginLeft:8,fontSize:11}}>{patErr}</span>}</>}>
            <input value={form.patron} onChange={e=>{setForm({...form,patron:e.target.value});testPatron(e.target.value);}} placeholder="Ej: supermercado|el\s?rey|riba\s?smith" style={{...inpSt,fontFamily:"JetBrains Mono,monospace",borderColor:patErr?C.danger:C.border}}/>
            <div style={{fontSize:11,color:C.textLight,marginTop:4}}>Usa | para alternativas. El patrón es case-insensitive.</div>
          </Fld>
          <Fld label="Etiqueta visible"><input value={form.etiqueta} onChange={e=>setForm({...form,etiqueta:e.target.value})} placeholder="Ej: Supermercado" style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Tipo">
              <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} style={inpSt}>
                <option value="gasto">Gasto</option><option value="ingreso">Ingreso</option>
              </select>
            </Fld>
            <Fld label="Cuenta contable">
              <select value={form.cuenta_codigo} onChange={e=>setForm({...form,cuenta_codigo:e.target.value})} style={inpSt}>
                {CUENTAS_COMUNES.map(c=><option key={c.c} value={c.c}>{c.c} — {c.n}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            <Fld label="Confianza">
              <select value={form.confianza} onChange={e=>setForm({...form,confianza:e.target.value})} style={inpSt}>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
            </Fld>
            <Fld label="Prioridad (menor=primero)">
              <input type="number" value={form.prioridad} onChange={e=>setForm({...form,prioridad:parseInt(e.target.value)||100})} style={inpSt}/>
            </Fld>
            <div style={{paddingTop:22,display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" id="ded2" checked={form.deducible} onChange={e=>setForm({...form,deducible:e.target.checked})} style={{width:16,height:16,accentColor:C.accent}}/>
              <label htmlFor="ded2" style={{fontSize:13,color:C.textMuted,cursor:"pointer"}}>Deducible</label>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} loading={saving} style={{...(!patErr?{}:{opacity:0.5})}}>Guardar Regla</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  MOTOR CONTABLE VIEW
// ═══════════════════════════════════════════════════════════════════════════
const ContabilidadView = () => {
  const [tab, setTab]           = useState("clasificar");
  const [periodo, setPeriodo]   = useState(new Date().toISOString().slice(0,7));

  // Clasificar
  const [descTest, setDescTest]     = useState("");
  const [clasifRes, setClasifRes]   = useState(null);
  const [clasifBusy, setClasifBusy] = useState(false);

  // Diario
  const [diario, setDiario]         = useState(null);
  const [diarioBusy, setDiarioBusy] = useState(false);
  const [diarioErr, setDiarioErr]   = useState(null);
  const [genBusy, setGenBusy]       = useState(false);

  // ITBMS
  const [itbms, setItbms]           = useState(null);
  const [itbmsBusy, setItbmsBusy]   = useState(false);

  // Catálogo
  const [catalogo, setCatalogo]     = useState([]);
  const [catBusy, setCatBusy]       = useState(false);
  const [catSearch, setCatSearch]   = useState("");
  const [catModal, setCatModal]     = useState(false);
  const [catForm, setCatForm]       = useState({codigo:"",nombre:"",tipo:"GASTO",naturaleza:"DEUDORA",categoria:""});
  const [catSaving, setCatSaving]   = useState(false);

  const loadDiario = useCallback(async () => {
    setDiarioBusy(true); setDiarioErr(null);
    try { setDiario(await api.get(`/api/contabilidad/diario?periodo=${periodo}`)); }
    catch(e) { setDiarioErr(e.message); }
    finally { setDiarioBusy(false); }
  }, [periodo]);

  const loadItbms = useCallback(async () => {
    setItbmsBusy(true);
    try { setItbms(await api.get(`/api/contabilidad/itbms?periodo=${periodo}`)); }
    catch(e) {}
    finally { setItbmsBusy(false); }
  }, [periodo]);

  const loadCatalogo = useCallback(async () => {
    setCatBusy(true);
    try { const r=await api.get("/api/contabilidad/catalogo"); setCatalogo(r.data||[]); }
    catch(e) {}
    finally { setCatBusy(false); }
  }, []);

  useEffect(() => {
    if (tab==="diario")   loadDiario();
    if (tab==="itbms")    loadItbms();
    if (tab==="catalogo") loadCatalogo();
  }, [tab, loadDiario, loadItbms, loadCatalogo]);

  const testClasificar = async () => {
    if (!descTest.trim()) return;
    setClasifBusy(true); setClasifRes(null);
    try { setClasifRes(await api.post("/api/contabilidad/clasificar",{descripcion:descTest})); }
    catch(e) { alert(e.message); }
    finally { setClasifBusy(false); }
  };

  const clasificarBatch = async () => {
    if (!confirm(`¿Clasificar automáticamente todas las transacciones de ${periodo}?`)) return;
    setGenBusy(true);
    try {
      const r=await api.post("/api/contabilidad/clasificar-batch",{periodo});
      alert(`✓ ${r.total} transacciones clasificadas\nAlta: ${r.confianza?.alta} | Media: ${r.confianza?.media} | Baja: ${r.confianza?.baja}`);
    } catch(e) { alert(e.message); }
    finally { setGenBusy(false); }
  };

  const generarDiario = async () => {
    setGenBusy(true); setDiarioErr(null);
    try { await api.post("/api/contabilidad/generar-diario",{periodo}); await loadDiario(); }
    catch(e) { setDiarioErr(e.message); }
    finally { setGenBusy(false); }
  };

  const guardarCuenta = async () => {
    if (!catForm.codigo||!catForm.nombre) return;
    setCatSaving(true);
    try {
      await api.post("/api/contabilidad/catalogo",catForm);
      setCatModal(false); setCatForm({codigo:"",nombre:"",tipo:"GASTO",naturaleza:"DEUDORA",categoria:""}); loadCatalogo();
    } catch(e) { alert(e.message); }
    finally { setCatSaving(false); }
  };

  const confBadge = c => {
    const m={alta:[C.successBg,C.successText],media:[C.warningBg,C.warningText],baja:[C.dangerBg,C.dangerText]};
    const [bg,color]=m[c]||m.baja;
    return {background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,display:"inline-block",textTransform:"uppercase"};
  };

  const tipoBadge = t => {
    const m={ACTIVO:[C.infoBg,C.infoText],PASIVO:["#fdf4ff","#7c3aed"],INGRESO:[C.successBg,C.successText],GASTO:[C.dangerBg,C.dangerText],COSTO:[C.warningBg,C.warningText],PATRIMONIO:["#f0fdf4","#166534"]};
    const [bg,color]=m[t]||[C.surfaceAlt,C.textMuted];
    return {background:bg,color,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,textTransform:"uppercase"};
  };

  const TABS=[{id:"clasificar",label:"Clasificador"},{id:"diario",label:"Diario Contable"},{id:"itbms",label:"ITBMS"},{id:"reglas",label:"Reglas"},{id:"importar",label:"Importar"},{id:"aprendizaje",label:"Aprendizaje"},{id:"catalogo",label:"Plan de Cuentas"}];
  const catFiltrado=catalogo.filter(c=>!catSearch||c.codigo.includes(catSearch)||c.nombre.toLowerCase().includes(catSearch.toLowerCase())||c.categoria?.toLowerCase().includes(catSearch.toLowerCase()));

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Motor Contable Inteligente</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Clasificación automática · Asientos contables · Plan de cuentas</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:160,padding:"8px 12px"}}/>
          <Btn onClick={clasificarBatch} loading={genBusy} variant="ghost">
            <Icon name="brain" size={15} color={C.accent}/>Auto-clasificar
          </Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:24,background:C.surfaceAlt,padding:4,borderRadius:10,width:"fit-content"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:tab===t.id?600:400,background:tab===t.id?C.surface:C.surfaceAlt,color:tab===t.id?C.text:C.textMuted,boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: CLASIFICADOR */}
      {tab==="clasificar"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
          <Card>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}}>Probar Clasificador</div>
            <Fld label="Descripción de la transacción">
              <input value={descTest} onChange={e=>setDescTest(e.target.value)} onKeyDown={e=>e.key==="Enter"&&testClasificar()} placeholder="Ej: Alquiler de oficina Marzo..." style={inpSt}/>
            </Fld>
            <Btn onClick={testClasificar} loading={clasifBusy} style={{marginBottom:20}}>
              <Icon name="brain" size={15} color="#fff"/>Clasificar
            </Btn>
            {clasifRes&&(
              <div style={{background:C.surfaceAlt,borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text}}>{clasifRes.etiqueta}</div>
                  <span style={confBadge(clasifRes.confianza)}>{clasifRes.confianza}</span>
                </div>
                {[
                  ["Tipo detectado",   clasifRes.tipo?.toUpperCase(),                                       clasifRes.tipo==="ingreso"?C.success:C.danger],
                  ["Cuenta sugerida",  `${clasifRes.cuenta} — ${clasifRes.cuenta_info?.nombre||""}`,        C.text],
                  ["Categoría",        clasifRes.cuenta_info?.categoria||"—",                              C.textMuted],
                  ["Gasto deducible",  clasifRes.deducible?"Sí (ITBMS crédito fiscal)":"No",               clasifRes.deducible?C.success:C.textMuted],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                    <span style={{color:C.textMuted}}>{l}</span>
                    <span style={{fontWeight:600,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>Reglas de Clasificación</div>
            <div style={{fontSize:12,color:C.textMuted,marginBottom:14}}>Palabras clave que activan cada categoría</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:400,overflowY:"auto"}}>
              {[
                {cat:"Supermercados",      pal:"supermercado, el rey, riba smith, machetazo, price smart",tipo:"gasto",  cta:"6207"},
                {cat:"Restaurantes",       pal:"restaurante, almuerzo, cena, cafetería, fast food",       tipo:"gasto",  cta:"6207"},
                {cat:"Alquiler",           pal:"alquiler, arrendamiento, renta local",                    tipo:"gasto",  cta:"6201",ded:true},
                {cat:"Telefonía/Internet", pal:"internet, telefonía, celular, claro, movistar, tigo",     tipo:"gasto",  cta:"6202",ded:true},
                {cat:"Papelería",          pal:"papelería, útiles, suministros, tinta, tóner",            tipo:"gasto",  cta:"6204",ded:true},
                {cat:"Proveedores",        pal:"proveedor, compra material, insumo",                      tipo:"gasto",  cta:"6208",ded:true},
                {cat:"Servicios públicos", pal:"electricidad, luz, agua, ENEL, IDAAN",                    tipo:"gasto",  cta:"6203",ded:true},
                {cat:"Com. bancarias",     pal:"comisión banco, cargo banco, mantenimiento cuenta",       tipo:"gasto",  cta:"6402"},
                {cat:"CSS/Planilla",       pal:"css, seguro social, cuota patronal",                      tipo:"gasto",  cta:"6102"},
                {cat:"Publicidad",         pal:"publicidad, marketing, facebook ads, google ads",         tipo:"gasto",  cta:"6301",ded:true},
                {cat:"Honorarios",         pal:"honorario, honorarios",                                   tipo:"ingreso",cta:"4103"},
                {cat:"Consultoría",        pal:"consult, asesor",                                         tipo:"ingreso",cta:"4104"},
                {cat:"Ventas",             pal:"venta, mercancía, lote, producto",                        tipo:"ingreso",cta:"4102"},
                {cat:"Transferencias",     pal:"transferencia recibida, depósito, abono",                 tipo:"ingreso",cta:"4901"},
              ].map(r=>(
                <div key={r.cat} style={{background:C.surfaceAlt,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:C.text}}>{r.cat}</div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.pal}</div>
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
                    <span style={{fontSize:10,background:r.tipo==="ingreso"?C.successBg:C.dangerBg,color:r.tipo==="ingreso"?C.successText:C.dangerText,padding:"2px 6px",borderRadius:20,fontWeight:700}}>{r.tipo}</span>
                    {r.ded&&<span style={{fontSize:10,background:C.infoBg,color:C.infoText,padding:"2px 6px",borderRadius:20,fontWeight:700}}>ded.</span>}
                    <span style={{fontSize:10,fontFamily:"JetBrains Mono,monospace",color:C.textMuted}}>{r.cta}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB: DIARIO */}
      {tab==="diario"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:14,color:C.textMuted}}>{diario?.generado?`${diario.resumen?.total_lineas||0} líneas · período ${periodo}`:"Diario no generado para este período"}</div>
            <Btn onClick={generarDiario} loading={genBusy}>
              <Icon name="refresh" size={15} color="#fff"/>{diario?.generado?"Regenerar":"Generar Diario"}
            </Btn>
          </div>
          {diarioErr&&<ErrBox msg={diarioErr} onRetry={loadDiario}/>}
          {diarioBusy&&<Spinner text="Cargando diario..."/>}
          {!diarioBusy&&diario?.generado&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                {[
                  {l:"Total Debe",  v:fmt(diario.resumen?.total_debe),  c:C.danger},
                  {l:"Total Haber", v:fmt(diario.resumen?.total_haber), c:C.success},
                  {l:"Diferencia",  v:fmt(Math.abs((diario.resumen?.total_debe||0)-(diario.resumen?.total_haber||0))), c:diario.resumen?.cuadra?C.success:C.danger},
                  {l:"Estado",      v:diario.resumen?.cuadra?"✓ CUADRA":"✗ NO CUADRA", c:diario.resumen?.cuadra?C.success:C.danger},
                ].map(k=>(
                  <div key={k.l} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
                    <div style={{fontSize:11,color:C.textMuted,fontWeight:600,textTransform:"uppercase",marginBottom:6}}>{k.l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>
              {diario.entradas?.map(entrada=>(
                <Card key={entrada.fecha} style={{marginBottom:16,padding:0,overflow:"hidden"}}>
                  <div style={{background:"#dbeafe",padding:"10px 20px",display:"flex",justifyContent:"space-between"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1e40af"}}>📅 {entrada.fecha}</div>
                    <div style={{fontSize:12,color:"#1e40af"}}>{entrada.asientos.length} líneas</div>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:C.surfaceAlt}}>
                      <TH>Cuenta</TH><TH>Descripción</TH><TH>Etiqueta</TH>
                      <TH right>Debe</TH><TH right>Haber</TH><TH>Tipo</TH>
                    </tr></thead>
                    <tbody>
                      {entrada.asientos.map((a,i)=>(
                        <tr key={i} style={{background:i%2?C.surfaceAlt:C.surface}}>
                          <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:12}}>
                            <div style={{fontWeight:700,color:C.text}}>{a.cuenta_codigo}</div>
                            <div style={{fontSize:10,color:C.textLight}}>{(a.cuenta_nombre||"").split(" - ").slice(1).join(" - ")}</div>
                          </TD>
                          <TD style={{maxWidth:200,fontSize:12}}>{a.descripcion}</TD>
                          <TD>{a.etiqueta&&<span style={{fontSize:11,background:C.infoBg,color:C.infoText,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{a.etiqueta}</span>}</TD>
                          <TD style={{textAlign:"right",fontWeight:700,color:a.debe>0?C.danger:C.textLight}}>{a.debe>0?fmt(a.debe):"—"}</TD>
                          <TD style={{textAlign:"right",fontWeight:700,color:a.haber>0?C.success:C.textLight}}>{a.haber>0?fmt(a.haber):"—"}</TD>
                          <TD>
                            {a.tipo_linea&&(
                              <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,textTransform:"uppercase",background:a.tipo_linea==="itbms_debito"?C.dangerBg:a.tipo_linea==="itbms_credito"?C.successBg:C.surfaceAlt,color:a.tipo_linea==="itbms_debito"?C.dangerText:a.tipo_linea==="itbms_credito"?C.successText:C.textMuted}}>
                                {a.tipo_linea.replace("_"," ")}
                              </span>
                            )}
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </>
          )}
          {!diarioBusy&&!diario?.generado&&!diarioErr&&(
            <Card style={{textAlign:"center",padding:"48px 24px"}}>
              <Icon name="journal" size={40} color={C.textLight}/>
              <div style={{fontSize:15,fontWeight:600,color:C.textMuted,marginTop:12,marginBottom:6}}>Diario no generado</div>
              <div style={{fontSize:13,color:C.textLight,marginBottom:20}}>Genera los asientos de {periodo} con partida doble automática</div>
              <Btn onClick={generarDiario} loading={genBusy}><Icon name="refresh" size={15} color="#fff"/>Generar Diario {periodo}</Btn>
            </Card>
          )}
        </div>
      )}

      {/* TAB: ITBMS */}
      {tab==="itbms"&&(
        <div>
          {itbmsBusy&&<Spinner/>}
          {itbms&&!itbmsBusy&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:20}}>
                {[
                  {l:"Débito Fiscal (Ventas)",        v:fmt(itbms.debito_fiscal),  c:C.danger,  bg:C.dangerBg,  ico:"trending"},
                  {l:"Crédito Fiscal (Compras ded.)", v:fmt(itbms.credito_fiscal), c:C.success, bg:C.successBg, ico:"check"},
                  {l:"Saldo Neto a Pagar DGI",        v:fmt(itbms.saldo_neto),     c:C.accent,  bg:C.infoBg,    ico:"tax"},
                ].map(k=>(
                  <div key={k.l} style={{background:k.bg,border:`1px solid ${k.c}22`,borderRadius:12,padding:"18px 22px",display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{width:40,height:40,background:k.c+"18",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name={k.ico} size={18} color={k.c}/></div>
                    <div>
                      <div style={{fontSize:11,color:k.c,fontWeight:600,marginBottom:4,textTransform:"uppercase"}}>{k.l}</div>
                      <div style={{fontSize:22,fontWeight:800,color:C.text}}>{k.v}</div>
                    </div>
                  </div>
                ))}
              </div>
              {itbms.vencimiento&&(
                <div style={{background:C.warningBg,border:`1px solid ${C.warning}33`,borderRadius:8,padding:"10px 16px",marginBottom:20,fontSize:13,color:C.warningText,display:"flex",gap:8,alignItems:"center"}}>
                  <Icon name="bell" size={15} color={C.warning}/>Vencimiento: <strong>{itbms.vencimiento}</strong> · Formulario 430 DGI
                </div>
              )}
              <Card style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700,color:C.text}}>Detalle por Transacción</div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:C.surfaceAlt}}>
                    <TH>Fecha</TH><TH>Descripción</TH><TH right>Base</TH><TH right>ITBMS</TH><TH>Tipo</TH>
                  </tr></thead>
                  <tbody>
                    {itbms.detalle?.map((d,i)=>(
                      <tr key={d.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                        <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:C.textMuted}}>{d.fecha}</TD>
                        <TD style={{fontSize:13}}>{d.descripcion}</TD>
                        <TD style={{textAlign:"right"}}>{fmt(d.base)}</TD>
                        <TD style={{textAlign:"right",fontWeight:700,color:d.tipo==="debito"?C.danger:C.success}}>{fmt(d.itbms)}</TD>
                        <TD><span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:700,textTransform:"uppercase",background:d.tipo==="debito"?C.dangerBg:C.successBg,color:d.tipo==="debito"?C.dangerText:C.successText}}>{d.tipo==="debito"?"Débito Fiscal":"Crédito Fiscal"}</span></TD>
                      </tr>
                    ))}
                    {(!itbms.detalle||!itbms.detalle.length)&&<tr><td colSpan={5} style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Sin transacciones con ITBMS</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr style={{background:C.surfaceAlt,borderTop:`2px solid ${C.border}`}}>
                      <td colSpan={3} style={{padding:"12px 16px",fontSize:12,fontWeight:700,color:C.textMuted,textTransform:"uppercase"}}>Totales período</td>
                      <td style={{padding:"12px 16px",textAlign:"right",fontSize:13,fontWeight:800}}>D: {fmt(itbms.debito_fiscal)} / C: {fmt(itbms.credito_fiscal)}</td>
                      <td style={{padding:"12px 16px"}}><span style={{background:C.infoBg,color:C.infoText,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>Neto: {fmt(itbms.saldo_neto)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB: CATÁLOGO */}
      {tab==="reglas"&&<ReglasTab uid={null} onUpdate={()=>setDescTest("")}/>}

      {/* TAB: IMPORTAR */}
      {tab==="importar"&&<ImportarTab/>}

      {/* TAB: APRENDIZAJE */}
      {tab==="aprendizaje"&&<AprendizajeTab/>}

      {/* TAB: CATÁLOGO */}
      {tab==="catalogo"&&(
        <div>
          <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"center"}}>
            <Card style={{flex:1,padding:"10px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Icon name="search" size={15} color={C.textMuted}/>
                <input value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Buscar código, nombre o categoría..." style={{border:"none",outline:"none",fontSize:14,flex:1,fontFamily:"inherit",background:"transparent",color:C.text}}/>
              </div>
            </Card>
            <Btn onClick={()=>setCatModal(true)}><Icon name="plus" size={15} color="#fff"/>Nueva Cuenta</Btn>
          </div>
          {catBusy?<Spinner/>:(
            <Card style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Código</TH><TH>Nombre</TH><TH>Tipo</TH><TH>Naturaleza</TH><TH>Categoría</TH>
                </tr></thead>
                <tbody>
                  {catFiltrado.map((c,i)=>(
                    <tr key={c.codigo} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontFamily:"JetBrains Mono,monospace",fontWeight:700,color:C.accent,fontSize:13}}>{c.codigo}</TD>
                      <TD style={{fontWeight:500,fontSize:13}}>{c.nombre}</TD>
                      <TD><span style={tipoBadge(c.tipo)}>{c.tipo}</span></TD>
                      <TD style={{fontSize:12,color:C.textMuted}}>{c.naturaleza}</TD>
                      <TD style={{fontSize:12,color:C.textLight}}>{c.categoria||"—"}</TD>
                    </tr>
                  ))}
                  {!catFiltrado.length&&<tr><td colSpan={5} style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Sin resultados</td></tr>}
                </tbody>
              </table>
              <div style={{padding:"10px 20px",borderTop:`1px solid ${C.border}`,fontSize:12,color:C.textMuted}}>{catFiltrado.length} cuentas {catSearch?"filtradas":"en el catálogo"}</div>
            </Card>
          )}
          {catModal&&(
            <Modal title="Nueva Cuenta Contable" onClose={()=>setCatModal(false)} width={460}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <Fld label="Código"><input value={catForm.codigo} onChange={e=>setCatForm({...catForm,codigo:e.target.value})} placeholder="Ej: 6210" style={inpSt}/></Fld>
                <Fld label="Tipo">
                  <select value={catForm.tipo} onChange={e=>setCatForm({...catForm,tipo:e.target.value})} style={inpSt}>
                    {["ACTIVO","PASIVO","PATRIMONIO","INGRESO","GASTO","COSTO"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </Fld>
              </div>
              <Fld label="Nombre de la Cuenta"><input value={catForm.nombre} onChange={e=>setCatForm({...catForm,nombre:e.target.value})} placeholder="Ej: Gastos de Capacitación" style={inpSt}/></Fld>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <Fld label="Naturaleza">
                  <select value={catForm.naturaleza} onChange={e=>setCatForm({...catForm,naturaleza:e.target.value})} style={inpSt}>
                    <option value="DEUDORA">Deudora</option><option value="ACREEDORA">Acreedora</option>
                  </select>
                </Fld>
                <Fld label="Categoría"><input value={catForm.categoria} onChange={e=>setCatForm({...catForm,categoria:e.target.value})} placeholder="Ej: Gastos de Personal" style={inpSt}/></Fld>
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <Btn variant="secondary" onClick={()=>setCatModal(false)}>Cancelar</Btn>
                <Btn onClick={guardarCuenta} loading={catSaving}>Guardar Cuenta</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
//  PRÉSTAMOS VIEW
// ═══════════════════════════════════════════════════════════════════════════
const PrestamosView = () => {
  const [prestamos, setPrestamos] = useState([]);
  const [busy, setBusy]           = useState(true);
  const [err,  setErr]            = useState(null);
  const [modal, setModal]         = useState(false);
  const [pagoModal, setPagoModal] = useState(null);
  const [tablaModal, setTablaModal]= useState(null);
  const [tabla, setTabla]         = useState(null);
  const [pagos, setPagos]         = useState([]);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const EMPTY_P   = {descripcion:'',banco_acreedor:'',monto_original:'',tasa_interes:'',cuota_mensual:'',fecha_inicio:'',fecha_fin:'',notas:''};
  const EMPTY_PAG = {fecha:new Date().toISOString().slice(0,10),monto:'',banco:'',referencia:''};
  const [formP,   setFormP]   = useState(EMPTY_P);
  const [formPag, setFormPag] = useState(EMPTY_PAG);

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try { const r=await api.get('/api/prestamos'); setPrestamos(r.data||[]); }
    catch(e){ setErr(e.message); } finally{ setBusy(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const openNuevo  = ()=>{ setFormP(EMPTY_P); setEditId(null); setModal(true); };
  const openEditar = p=>{ setFormP({descripcion:p.descripcion,banco_acreedor:p.banco_acreedor||'',monto_original:String(p.monto_original),tasa_interes:String(p.tasa_interes||0),cuota_mensual:String(p.cuota_mensual||''),fecha_inicio:String(p.fecha_inicio).slice(0,10),fecha_fin:p.fecha_fin?String(p.fecha_fin).slice(0,10):'',notas:p.notas||''}); setEditId(p.id); setModal(true); };

  const savePrestamo = async()=>{
    if(!formP.descripcion||!formP.monto_original||!formP.fecha_inicio) return;
    setSaving(true);
    try {
      const body={...formP,monto_original:parseFloat(formP.monto_original),tasa_interes:parseFloat(formP.tasa_interes)||0,cuota_mensual:formP.cuota_mensual?parseFloat(formP.cuota_mensual):undefined};
      if(editId) await api.put(`/api/prestamos/${editId}`,body);
      else       await api.post('/api/prestamos',body);
      setModal(false); load();
    } catch(e){ alert(e.message); } finally{ setSaving(false); }
  };

  const registrarPago = async()=>{
    if(!formPag.fecha||!formPag.monto) return;
    setSaving(true);
    try {
      const r=await api.post(`/api/prestamos/${pagoModal}/registrar-pago`,{...formPag,monto:parseFloat(formPag.monto)});
      alert(r.mensaje); setPagoModal(null); setFormPag(EMPTY_PAG); load();
    } catch(e){ alert(e.message); } finally{ setSaving(false); }
  };

  const verTabla = async id=>{
    try { const r=await api.get(`/api/prestamos/${id}/tabla-amortizacion`); setTabla(r); setTablaModal(id); }
    catch(e){ alert(e.message); }
  };

  const verPagos = async id=>{
    try { const r=await api.get(`/api/prestamos/${id}/pagos`); setPagos(r.data||[]); setPagoModal(id); }
    catch(e){ alert(e.message); }
  };

  const eliminar = async id=>{
    if(!confirm('¿Desactivar este préstamo?')) return;
    try { await api.delete(`/api/prestamos/${id}`); load(); } catch(e){ alert(e.message); }
  };

  const totalSaldo=prestamos.reduce((s,p)=>s+parseFloat(p.saldo_pendiente||0),0);

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Gestión de Préstamos</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{prestamos.length} activos · Saldo total: {fmt(totalSaldo)}</div>
        </div>
        <Btn onClick={openNuevo}><Icon name='plus' size={16} color='#fff'/>Nuevo Préstamo</Btn>
      </div>
      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {prestamos.length===0?(
            <Card style={{textAlign:'center',padding:'48px 24px'}}>
              <Icon name='creditcard' size={40} color={C.textLight}/>
              <div style={{fontSize:15,fontWeight:600,color:C.textMuted,marginTop:12,marginBottom:6}}>Sin préstamos registrados</div>
              <div style={{fontSize:13,color:C.textLight,marginBottom:20}}>Registra préstamos para separar capital e intereses automáticamente</div>
              <Btn onClick={openNuevo}><Icon name='plus' size={15} color='#fff'/>Registrar Préstamo</Btn>
            </Card>
          ):prestamos.map(p=>{
            const pct=p.monto_original>0?Math.round((1-p.saldo_pendiente/p.monto_original)*100):0;
            return(
              <Card key={p.id}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:C.text}}>{p.descripcion}</div>
                    <div style={{fontSize:13,color:C.textMuted,marginTop:3}}>{p.banco_acreedor||'Sin banco'} · Tasa: {((parseFloat(p.tasa_interes)||0)*100).toFixed(2)}% anual{p.cuota_mensual?` · Cuota: ${fmt(p.cuota_mensual)}/mes`:''}</div>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>verTabla(p.id)} style={{background:C.infoBg,border:'none',padding:'6px 12px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,color:C.infoText}}>Tabla</button>
                    <button onClick={()=>verPagos(p.id)} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,padding:'6px 12px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,color:C.textMuted}}>Pagos ({p.num_pagos})</button>
                    <button onClick={()=>openEditar(p)} style={{background:C.infoBg,border:'none',padding:'6px 8px',borderRadius:7,cursor:'pointer'}}><Icon name='edit' size={14} color={C.infoText}/></button>
                    <button onClick={()=>eliminar(p.id)} style={{background:C.dangerBg,border:'none',padding:'6px 8px',borderRadius:7,cursor:'pointer'}}><Icon name='trash' size={14} color={C.dangerText}/></button>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:C.textMuted,marginBottom:6}}>
                    <span>Amortizado: {pct}%</span>
                    <span>Saldo: <strong style={{color:C.danger}}>{fmt(p.saldo_pendiente)}</strong> / {fmt(p.monto_original)}</span>
                  </div>
                  <div style={{height:8,background:C.surfaceAlt,borderRadius:20,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:C.success,borderRadius:20}}/>
                  </div>
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{fontSize:12,color:C.textMuted}}>Inicio: {String(p.fecha_inicio).slice(0,10)}</div>
                  <div style={{marginLeft:'auto'}}>
                    <Btn onClick={()=>{setFormPag(EMPTY_PAG);verPagos(p.id);}} style={{background:C.success,color:'#fff',border:'none',padding:'7px 16px',fontSize:13}}>
                      <Icon name='plus' size={14} color='#fff'/>Registrar Cuota
                    </Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal&&(
        <Modal title={editId?'Editar Préstamo':'Nuevo Préstamo'} onClose={()=>setModal(false)} width={560}>
          <Fld label='Descripción'><input value={formP.descripcion} onChange={e=>setFormP({...formP,descripcion:e.target.value})} placeholder='Ej: Préstamo Banco Nacional' style={inpSt}/></Fld>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Fld label='Banco / Acreedor'><input value={formP.banco_acreedor} onChange={e=>setFormP({...formP,banco_acreedor:e.target.value})} style={inpSt}/></Fld>
            <Fld label='Monto Original (USD)'><input type='number' value={formP.monto_original} onChange={e=>setFormP({...formP,monto_original:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Fld label='Tasa Anual (0.065 = 6.5%)'><input type='number' step='0.001' value={formP.tasa_interes} onChange={e=>setFormP({...formP,tasa_interes:e.target.value})} style={inpSt}/></Fld>
            <Fld label='Cuota Mensual (opcional)'><input type='number' value={formP.cuota_mensual} onChange={e=>setFormP({...formP,cuota_mensual:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Fld label='Fecha Inicio'><input type='date' value={formP.fecha_inicio} onChange={e=>setFormP({...formP,fecha_inicio:e.target.value})} style={inpSt}/></Fld>
            <Fld label='Fecha Vencimiento'><input type='date' value={formP.fecha_fin} onChange={e=>setFormP({...formP,fecha_fin:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{background:C.infoBg,border:`1px solid ${C.accent}22`,borderRadius:8,padding:'10px 14px',fontSize:12,color:C.infoText,marginBottom:16}}>
            Asientos automáticos: Capital → DR 2301 (Pasivo) · Interés → DR 6401 (Gasto Financiero)
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <Btn variant='secondary' onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={savePrestamo} loading={saving}>Guardar Préstamo</Btn>
          </div>
        </Modal>
      )}

      {pagoModal&&(
        <Modal title='Registrar Cuota de Préstamo' onClose={()=>{setPagoModal(null);setPagos([]);}} width={520}>
          <div style={{background:C.successBg,border:`1px solid ${C.success}33`,borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:C.successText}}>
            El sistema separará automáticamente capital e interés según la tasa configurada.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Fld label='Fecha de Pago'><input type='date' value={formPag.fecha} onChange={e=>setFormPag({...formPag,fecha:e.target.value})} style={inpSt}/></Fld>
            <Fld label='Monto Total'><input type='number' value={formPag.monto} onChange={e=>setFormPag({...formPag,monto:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <Fld label='Banco'><input value={formPag.banco} onChange={e=>setFormPag({...formPag,banco:e.target.value})} style={inpSt}/></Fld>
            <Fld label='Referencia'><input value={formPag.referencia} onChange={e=>setFormPag({...formPag,referencia:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginBottom:20}}>
            <Btn onClick={registrarPago} loading={saving} style={{background:C.success,color:'#fff',border:'none'}}><Icon name='check' size={15} color='#fff'/>Registrar Cuota</Btn>
          </div>
          {pagos.length>0&&(
            <>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>Historial de Pagos</div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  {['Fecha','Cuota','Capital','Interés','Saldo'].map(h=><TH key={h} right>{h}</TH>)}
                </tr></thead>
                <tbody>
                  {pagos.map((p,i)=>(
                    <tr key={p.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{textAlign:'right',fontSize:12}}>{fmtDate(p.fecha)}</TD>
                      <TD style={{textAlign:'right',fontWeight:600}}>{fmt(p.cuota_total)}</TD>
                      <TD style={{textAlign:'right',color:C.success}}>{fmt(p.capital)}</TD>
                      <TD style={{textAlign:'right',color:C.danger}}>{fmt(p.interes)}</TD>
                      <TD style={{textAlign:'right',color:C.textMuted,fontSize:12}}>{fmt(p.saldo_despues)}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Modal>
      )}

      {tablaModal&&tabla&&(
        <Modal title='Tabla de Amortización' onClose={()=>{setTablaModal(null);setTabla(null);}} width={620}>
          <div style={{fontSize:13,color:C.textMuted,marginBottom:14}}>{tabla.prestamo?.descripcion} · {tabla.total_cuotas} cuotas estimadas</div>
          <div style={{maxHeight:400,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead style={{position:'sticky',top:0}}>
                <tr style={{background:C.nav}}>
                  {['#','Mes','Cuota','Capital','Interés','Saldo'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'right',fontSize:11,fontWeight:700,color:'#94a3b8'}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tabla.tabla?.map((r,i)=>(
                  <tr key={r.mes} style={{background:i%2?C.surfaceAlt:C.surface}}>
                    <TD style={{textAlign:'right',fontSize:12,color:C.textLight}}>{r.mes}</TD>
                    <TD style={{textAlign:'right',fontSize:12,color:C.textMuted,fontFamily:'JetBrains Mono,monospace'}}>{r.fecha}</TD>
                    <TD style={{textAlign:'right',fontWeight:600}}>{fmt(r.cuota)}</TD>
                    <TD style={{textAlign:'right',color:C.success}}>{fmt(r.capital)}</TD>
                    <TD style={{textAlign:'right',color:C.danger}}>{fmt(r.interes)}</TD>
                    <TD style={{textAlign:'right',color:C.textMuted}}>{fmt(r.saldo)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONTROL DE CALIDAD VIEW
// ═══════════════════════════════════════════════════════════════════════════
const CalidadView = () => {
  const [stats, setStats]         = useState(null);
  const [errores, setErrores]     = useState([]);
  const [cuadreRes, setCuadre]    = useState(null);
  const [busy, setBusy]           = useState(true);
  const [cuadreBusy, setCuadreBusy] = useState(false);
  const [periodo, setPeriodo]     = useState(new Date().toISOString().slice(0,7));
  const [filtro, setFiltro]       = useState('todos');

  const [calidad, setCalidad] = useState(null);

  const load = useCallback(async()=>{
    setBusy(true);
    try {
      const [s,e,cal]=await Promise.all([
        api.get(`/api/errores/stats?periodo=${periodo}`),
        api.get(`/api/errores?periodo=${periodo}`),
        api.get(`/api/errores/calidad/${periodo}`),
      ]);
      setStats(s); setErrores(e.data||[]); setCalidad(cal);
    } catch(ex){} finally{ setBusy(false); }
  },[periodo]);
  useEffect(()=>{ load(); },[load]);

  const verificarCuadre = async()=>{
    setCuadreBusy(true); setCuadre(null);
    try { setCuadre(await api.get(`/api/errores/cuadre/${periodo}`)); }
    catch(e){ alert(e.message); } finally{ setCuadreBusy(false); }
  };

  const resolver = async id=>{
    try { await api.patch(`/api/errores/${id}/resolver`,{}); load(); }
    catch(e){ alert(e.message); }
  };

  const sevColor={critico:[C.dangerBg,C.dangerText],error:[C.dangerBg,C.dangerText],warning:[C.warningBg,C.warningText],info:[C.infoBg,C.infoText]};
  const filtrados=errores.filter(e=>filtro==='todos'?true:filtro==='criticos'?e.severidad==='critico':filtro==='warning'?e.severidad==='warning':e.severidad==='info');

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Control de Calidad Contable</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Validaciones, descuadres y alertas del motor contable</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type='month' value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:155,padding:'8px 12px'}}/>
          <Btn onClick={verificarCuadre} loading={cuadreBusy} variant='ghost'>
            <Icon name='shield' size={15} color={C.accent}/>Verificar Cuadre
          </Btn>
        </div>
      </div>

      {cuadreRes&&(
        <div style={{background:cuadreRes.cuadra?C.successBg:C.dangerBg,border:`1px solid ${cuadreRes.cuadra?C.success:C.danger}33`,borderLeft:`4px solid ${cuadreRes.cuadra?C.success:C.danger}`,borderRadius:10,padding:'14px 20px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{cuadreRes.mensaje}</div>
            {cuadreRes.anomalias?.length>0&&<div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{cuadreRes.anomalias.length} asiento(s) con diferencias registrados en el log</div>}
          </div>
          <Icon name={cuadreRes.cuadra?'check':'x'} size={24} color={cuadreRes.cuadra?C.success:C.danger}/>
        </div>
      )}

      {!busy&&calidad&&(
        <>
          {/* Score de calidad */}
          <Card style={{marginBottom:20,display:'flex',alignItems:'center',gap:24,padding:'16px 24px'}}>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontSize:40,fontWeight:800,color:calidad.score>=90?C.success:calidad.score>=70?C.warning:C.danger,lineHeight:1}}>{calidad.score}</div>
              <div style={{fontSize:11,color:C.textMuted,marginTop:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>/ 100</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>
                Calidad: {calidad.nivel==='excelente'?'Excelente ✓':calidad.nivel==='bueno'?'Bueno':'Requiere Atención ⚠'}
              </div>
              <div style={{height:8,background:C.surfaceAlt,borderRadius:20,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${calidad.score}%`,background:calidad.score>=90?C.success:calidad.score>=70?C.warning:C.danger,borderRadius:20,transition:'width 0.4s'}}/>
              </div>
            </div>
            <button onClick={()=>window.open(`/api/reportes/calidad-pdf?periodo=${periodo}`,'_blank')} style={{background:C.dangerBg,border:`1px solid ${C.danger}22`,padding:'8px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,color:C.dangerText,fontFamily:'inherit'}}>
              📄 Exportar PDF
            </button>
          </Card>

          {/* Alertas detalladas de calidad */}
          {(calidad.metricas?.sin_clasificar>0||calidad.metricas?.descuadres>0||calidad.metricas?.itbms_sin_factura>0||calidad.metricas?.duplicados_potenciales>0)&&(
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
              {calidad.metricas.sin_clasificar>0&&(
                <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><strong style={{color:C.warningText}}>{calidad.metricas.sin_clasificar} transacciones sin clasificar</strong><div style={{fontSize:12,color:C.textMuted,marginTop:2}}>Ve al Motor Contable → Auto-clasificar período</div></div>
                  <span style={{fontSize:11,background:C.warningBg,color:C.warningText,padding:'2px 10px',borderRadius:20,fontWeight:700,border:`1px solid ${C.warning}44`}}>ATENCIÓN</span>
                </div>
              )}
              {calidad.metricas.descuadres>0&&(
                <div style={{background:C.dangerBg,border:`1px solid ${C.danger}44`,borderLeft:`4px solid ${C.danger}`,borderRadius:8,padding:'12px 16px'}}>
                  <strong style={{color:C.dangerText}}>{calidad.metricas.descuadres} asiento(s) no cuadran</strong>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>Regenerar el diario desde el Motor Contable</div>
                  {calidad.alertas?.descuadres?.slice(0,3).map((d,i)=>(
                    <div key={i} style={{fontSize:11,color:C.dangerText,marginTop:6,fontFamily:'JetBrains Mono,monospace'}}>• {d.descripcion} — DR:{d.total_debe} CR:{d.total_haber} Δ:{d.diferencia}</div>
                  ))}
                </div>
              )}
              {calidad.metricas.itbms_sin_factura>0&&(
                <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px'}}>
                  <strong style={{color:C.warningText}}>{calidad.metricas.itbms_sin_factura} gasto(s) deducibles sin factura</strong>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>El crédito fiscal ITBMS no aplica sin factura de respaldo</div>
                  {calidad.alertas?.sin_factura?.slice(0,3).map((t,i)=>(
                    <div key={i} style={{fontSize:11,color:C.warningText,marginTop:6}}>• {t.fecha} — {t.descripcion} — ITBMS: {fmt(t.itbms)}</div>
                  ))}
                </div>
              )}
              {calidad.metricas.duplicados_potenciales>0&&(
                <div style={{background:C.infoBg,border:`1px solid ${C.accent}44`,borderLeft:`4px solid ${C.accent}`,borderRadius:8,padding:'12px 16px'}}>
                  <strong style={{color:C.infoText}}>{calidad.metricas.duplicados_potenciales} posible(s) duplicado(s)</strong>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>Misma fecha, monto y banco detectados más de una vez</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!busy&&stats&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:20}}>
          {[
            {l:'Críticos',    v:stats.criticos||0,  c:C.danger,  ico:'x'},
            {l:'Errores',     v:stats.errores||0,   c:C.danger,  ico:'x'},
            {l:'Advertencias',v:stats.warnings||0,  c:C.warning, ico:'bell'},
            {l:'Pendientes',  v:stats.pendientes||0,c:C.accent,  ico:'shield'},
          ].map(k=><KpiCard key={k.l} label={k.l} value={k.v} icon={k.ico} color={k.c}/>)}
        </div>
      )}

      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {[['todos','Todos'],['criticos','Críticos'],['warning','Advertencias'],['info','Info']].map(([v,l])=>(
          <button key={v} onClick={()=>setFiltro(v)} style={{padding:'6px 14px',borderRadius:20,border:`1px solid ${filtro===v?C.accent:C.border}`,background:filtro===v?C.infoBg:'none',color:filtro===v?C.accent:C.textMuted,fontWeight:600,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
            {l}
          </button>
        ))}
      </div>

      {busy?<Spinner/>:filtrados.length===0?(
        <Card style={{textAlign:'center',padding:'48px 24px'}}>
          <Icon name='shield' size={40} color={C.success}/>
          <div style={{fontSize:15,fontWeight:600,color:C.textMuted,marginTop:12}}>Sin errores contables en {periodo}</div>
          <div style={{fontSize:13,color:C.textLight,marginTop:6}}>El período está libre de inconsistencias</div>
        </Card>
      ):(
        <Card style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Tipo</TH><TH>Descripción</TH><TH>Transacción</TH><TH>Severidad</TH><TH>Fecha</TH><TH>Acción</TH>
            </tr></thead>
            <tbody>
              {filtrados.map((e,i)=>{
                const [bg,tc]=sevColor[e.severidad]||sevColor.info;
                return(
                  <tr key={e.id} style={{background:i%2?C.surfaceAlt:C.surface,opacity:e.resuelto?0.5:1}}>
                    <TD style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:C.infoText}}>{e.tipo_error}</TD>
                    <TD style={{maxWidth:220,fontSize:12}}>{e.descripcion}</TD>
                    <TD style={{fontSize:12,color:C.textMuted}}>{e.tx_descripcion?e.tx_descripcion.slice(0,28)+'…':'—'}</TD>
                    <TD><span style={{background:bg,color:tc,padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:700,textTransform:'uppercase'}}>{e.severidad}</span></TD>
                    <TD style={{fontSize:11,color:C.textLight,fontFamily:'JetBrains Mono,monospace'}}>{String(e.created_at).slice(0,10)}</TD>
                    <TD>{!e.resuelto?<button onClick={()=>resolver(e.id)} style={{background:C.successBg,border:'none',padding:'5px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600,color:C.successText}}>Resolver</button>:<span style={{fontSize:11,color:C.textLight}}>✓</span>}</TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:'10px 20px',borderTop:`1px solid ${C.border}`,fontSize:12,color:C.textMuted}}>{filtrados.length} registros · {periodo}</div>
        </Card>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
//  FLUJO VIEW — Flujo simplificado: cargar → validar → generar → exportar
// ═══════════════════════════════════════════════════════════════════════════
const FlujoView = () => {
  const [paso, setPaso]     = useState(1);   // 1=cargar 2=validar 3=generar 4=exportar
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0,7));
  const [calidad, setCal]   = useState(null);
  const [diario,  setDiario]= useState(null);
  const [busy1,   setBusy1] = useState(false);
  const [busy2,   setBusy2] = useState(false);
  const [busy3,   setBusy3] = useState(false);
  const [txTotal, setTxTotal] = useState(null);

  // ── Paso 1: Verificar cuántas transacciones hay ─────────────────────────
  const verificarDatos = useCallback(async () => {
    setBusy1(true);
    try {
      const [tx, cal] = await Promise.all([
        api.get(`/api/transacciones/resumen?periodo=${periodo}`),
        api.get(`/api/errores/calidad/${periodo}`),
      ]);
      setTxTotal(tx);
      setCal(cal);
      setPaso(2);
    } catch(e){ alert(e.message); }
    finally{ setBusy1(false); }
  }, [periodo]);

  // ── Paso 2: Clasificar y validar ────────────────────────────────────────
  const clasificarYValidar = async () => {
    setBusy2(true);
    try {
      // Auto-clasificar pendientes
      if (calidad?.metricas?.sin_clasificar > 0) {
        await api.post('/api/contabilidad/clasificar-batch', { periodo });
      }
      // Refrescar calidad
      const cal = await api.get(`/api/errores/calidad/${periodo}`);
      setCal(cal);
      setPaso(3);
    } catch(e){ alert(e.message); }
    finally{ setBusy2(false); }
  };

  // ── Paso 3: Generar diario ──────────────────────────────────────────────
  const generarDiario = async () => {
    setBusy3(true);
    try {
      await api.post('/api/contabilidad/generar-diario', { periodo });
      const d = await api.get(`/api/contabilidad/diario?periodo=${periodo}`);
      setDiario(d);
      setPaso(4);
    } catch(e){ alert(e.message); }
    finally{ setBusy3(false); }
  };

  // ── Paso 4: Exportar ─────────────────────────────────────────────────────
  const exportarJSON = async () => {
    try {
      const data = await api.get(`/api/reportes/diario-json?periodo=${periodo}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `diario-${periodo}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ alert(e.message); }
  };

  const exportarPDF = async (tipo) => {
    try {
      const token = localStorage.getItem('cp_token');
      const res   = await fetch(`/api/reportes/${tipo}?periodo=${periodo}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `${tipo}-${periodo}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ alert(e.message); }
  };

  // ── Helpers UI ────────────────────────────────────────────────────────────
  const PASOS = ['Cargar período', 'Validar datos', 'Generar diario', 'Exportar'];
  const scoreColor = !calidad ? C.textMuted
    : calidad.score >= 90 ? C.success
    : calidad.score >= 70 ? C.warning : C.danger;

  return (
    <div>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Flujo de Trabajo</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Proceso simplificado: cargar → validar → generar → exportar</div>
      </div>

      {/* Stepper */}
      <div style={{display:'flex',alignItems:'center',marginBottom:32}}>
        {PASOS.map((nombre,i)=>{
          const n=i+1;
          const done=paso>n;
          const active=paso===n;
          return (
            <React.Fragment key={n}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,
                  background:done?C.success:active?C.accent:C.surfaceAlt,
                  color:done||active?'#fff':C.textMuted,
                  border:`2px solid ${done?C.success:active?C.accent:C.border}`}}>
                  {done?'✓':n}
                </div>
                <div style={{fontSize:12,fontWeight:active?700:400,color:active?C.text:C.textMuted,whiteSpace:'nowrap'}}>{nombre}</div>
              </div>
              {i<PASOS.length-1&&(
                <div style={{flex:1,height:2,margin:'0 8px',background:paso>n?C.success:C.border,marginBottom:20}}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── PASO 1: Seleccionar período ──────────────────────────────────── */}
      {paso===1&&(
        <Card>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Seleccionar período contable</div>
          <div style={{fontSize:13,color:C.textMuted,marginBottom:20}}>Elige el mes que deseas procesar. El sistema verificará automáticamente los datos.</div>
          <div style={{display:'flex',gap:16,alignItems:'flex-end'}}>
            <div style={{flex:1,maxWidth:240}}>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:'uppercase'}}>Período</label>
              <input type='month' value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:'100%'}}/>
            </div>
            <Btn onClick={verificarDatos} loading={busy1}>
              <Icon name='trending' size={15} color='#fff'/>Verificar Período
            </Btn>
          </div>
        </Card>
      )}

      {/* ── PASO 2: Validar datos ─────────────────────────────────────────── */}
      {paso===2&&calidad&&(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Score */}
          <Card style={{display:'flex',alignItems:'center',gap:20,padding:'16px 24px'}}>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontSize:40,fontWeight:800,color:scoreColor,lineHeight:1}}>{calidad.score}</div>
              <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>SCORE</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>
                Período {periodo} · {calidad.metricas?.total_transacciones||0} transacciones
              </div>
              <div style={{height:8,background:C.surfaceAlt,borderRadius:20,overflow:'hidden',marginBottom:8}}>
                <div style={{height:'100%',width:`${calidad.score}%`,background:scoreColor,borderRadius:20}}/>
              </div>
              <div style={{display:'flex',gap:16,fontSize:12,color:C.textMuted}}>
                {calidad.metricas?.sin_clasificar>0&&<span style={{color:C.warningText}}>⚠ {calidad.metricas.sin_clasificar} sin clasificar</span>}
                {calidad.metricas?.sin_asiento>0&&<span style={{color:C.warningText}}>⚠ {calidad.metricas.sin_asiento} sin asiento</span>}
                {calidad.metricas?.descuadres>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.descuadres} descuadre(s)</span>}
                {calidad.metricas?.ingresos_sin_debito>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.ingresos_sin_debito} ingreso sin débito fiscal</span>}
                {calidad.metricas?.exentos_con_itbms>0&&<span style={{color:C.dangerText}}>✗ {calidad.metricas.exentos_con_itbms} exento con ITBMS</span>}
                {calidad.score>=90&&<span style={{color:C.success}}>✓ Datos listos para generar</span>}
              </div>
            </div>
          </Card>

          {/* Alertas detalladas */}
          {calidad.alertas?.ingreso_sin_debito?.length>0&&(
            <div style={{background:C.dangerBg,border:`1px solid ${C.danger}44`,borderLeft:`4px solid ${C.danger}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.dangerText}}>Ingresos con ITBMS sin marcar como débito fiscal:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>Estos ingresos tienen ITBMS > 0 pero no tienen itbms_aplica=true. El asiento no generará débito fiscal correctamente.</div>
              {calidad.alertas.ingreso_sin_debito.map((t,i)=>(
                <div key={i} style={{fontSize:11,color:C.dangerText,marginTop:6}}>• {t.fecha} — {t.descripcion} — ITBMS: {fmt(t.itbms)}</div>
              ))}
            </div>
          )}
          {calidad.alertas?.exento_con_itbms?.length>0&&(
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.warningText}}>Transacciones marcadas como exentas pero con ITBMS > 0:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>Si son exentas, el campo ITBMS debería ser 0. Corregir en el Diario Contable.</div>
              {calidad.alertas.exento_con_itbms.map((t,i)=>(
                <div key={i} style={{fontSize:11,color:C.warningText,marginTop:6}}>• {t.fecha} — {t.descripcion} ({t.tipo}) — ITBMS: {fmt(t.itbms)}</div>
              ))}
            </div>
          )}
          {calidad.alertas?.sin_cuenta?.length>0&&(
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderLeft:`4px solid ${C.warning}`,borderRadius:8,padding:'12px 16px'}}>
              <strong style={{color:C.warningText}}>{calidad.alertas.sin_cuenta.length} gasto(s) sin cuenta contable:</strong>
              <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>El botón Auto-clasificar las asignará automáticamente.</div>
            </div>
          )}

          <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'center'}}>
            <button onClick={()=>setPaso(1)} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 18px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              ← Volver
            </button>
            <div style={{display:'flex',gap:10}}>
              {calidad.metricas?.sin_clasificar>0&&(
                <Btn onClick={clasificarYValidar} loading={busy2} variant='ghost'>
                  <Icon name='brain' size={15} color={C.accent}/>Auto-clasificar y continuar
                </Btn>
              )}
              <Btn onClick={()=>setPaso(3)} variant={calidad.score>=70?'primary':'secondary'}>
                {calidad.score>=70?'Generar Diario →':'Continuar de todas formas →'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── PASO 3: Generar diario ────────────────────────────────────────── */}
      {paso===3&&(
        <Card>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Generar Diario Combinado</div>
          <div style={{fontSize:13,color:C.textMuted,marginBottom:20}}>
            Se generarán los asientos contables con partida doble para todas las transacciones de {periodo}.
            Los asientos existentes serán reemplazados.
          </div>
          <div style={{background:C.infoBg,border:`1px solid ${C.accent}22`,borderRadius:8,padding:'12px 16px',marginBottom:20,fontSize:12,color:C.infoText}}>
            <strong>¿Qué genera el diario?</strong><br/>
            Por cada transacción: asiento con DR (débito) y CR (crédito) en partida doble.
            ITBMS débito fiscal → CR 2201. ITBMS crédito fiscal (con factura) → DR 1301.
            Cuotas de préstamo → DR capital (2301) + DR interés (6401).
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'space-between'}}>
            <button onClick={()=>setPaso(2)} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 18px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              ← Volver
            </button>
            <Btn onClick={generarDiario} loading={busy3}>
              <Icon name='journal' size={15} color='#fff'/>Generar Diario {periodo}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── PASO 4: Exportar ──────────────────────────────────────────────── */}
      {paso===4&&diario&&(
        <div>
          {/* Resumen del diario generado */}
          <Card style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:C.text}}>✓ Diario generado correctamente</div>
                <div style={{fontSize:13,color:C.textMuted,marginTop:3}}>{diario.resumen?.total_lineas||0} líneas · Período {periodo}</div>
              </div>
              <span style={{background:diario.resumen?.cuadra?C.successBg:C.dangerBg,color:diario.resumen?.cuadra?C.successText:C.dangerText,padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:700}}>
                {diario.resumen?.cuadra?'✓ CUADRA':'✗ NO CUADRA'}
              </span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {[
                {l:'Total Debe',  v:fmt(diario.resumen?.total_debe),  c:C.danger},
                {l:'Total Haber', v:fmt(diario.resumen?.total_haber), c:C.success},
                {l:'Diferencia',  v:fmt(Math.abs((diario.resumen?.total_debe||0)-(diario.resumen?.total_haber||0))), c:diario.resumen?.cuadra?C.success:C.danger},
              ].map(k=>(
                <div key={k.l} style={{background:C.surfaceAlt,borderRadius:8,padding:'12px 16px'}}>
                  <div style={{fontSize:11,color:C.textMuted,fontWeight:600,textTransform:'uppercase',marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Opciones de exportación */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:20}}>
            {[
              {label:'Diario PDF',        icon:'pdf',     action:()=>exportarPDF('diario'),             color:C.accent},
              {label:'ITBMS 430 PDF',     icon:'tax',     action:()=>exportarPDF('itbms'),              color:'#7c3aed'},
              {label:'Estado Result. PDF',icon:'trending', action:()=>exportarPDF('estado-resultados'), color:C.success},
              {label:'Diario JSON',       icon:'layers',   action:exportarJSON,                         color:'#6366f1'},
              {label:'Calidad PDF',       icon:'shield',   action:()=>window.open(`/api/reportes/calidad-pdf?periodo=${periodo}`,'_blank'), color:C.danger},
            ].map(r=>(
              <div key={r.label} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{width:34,height:34,background:r.color+'18',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon name={r.icon} size={16} color={r.color}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{r.label}</div>
                </div>
                <button onClick={r.action} style={{background:r.color,color:'#fff',border:'none',padding:'7px 14px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',textAlign:'center'}}>
                  Descargar
                </button>
              </div>
            ))}
          </div>

          {/* Primeras entradas del diario */}
          {diario.entradas?.slice(0,3).map(entrada=>(
            <Card key={entrada.fecha} style={{marginBottom:12,padding:0,overflow:'hidden'}}>
              <div style={{background:'#dbeafe',padding:'8px 16px',display:'flex',justifyContent:'space-between'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#1e40af'}}>📅 {entrada.fecha}</div>
                <div style={{fontSize:12,color:'#1e40af'}}>{entrada.asientos?.length||0} líneas</div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Cuenta</TH><TH>Descripción</TH><TH right>Debe</TH><TH right>Haber</TH><TH>Tipo</TH>
                </tr></thead>
                <tbody>
                  {(entrada.asientos||[]).map((a,i)=>(
                    <tr key={i} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
                        <div style={{fontWeight:700,color:C.text}}>{a.cuenta_codigo}</div>
                        <div style={{fontSize:10,color:C.textLight}}>{(a.cuenta_nombre||'').split(' - ').slice(1).join(' ')}</div>
                      </TD>
                      <TD style={{fontSize:12,maxWidth:180}}>{a.descripcion}</TD>
                      <TD style={{textAlign:'right',fontWeight:700,color:a.debe>0?C.danger:C.textLight}}>{a.debe>0?fmt(a.debe):'—'}</TD>
                      <TD style={{textAlign:'right',fontWeight:700,color:a.haber>0?C.success:C.textLight}}>{a.haber>0?fmt(a.haber):'—'}</TD>
                      <TD><span style={{fontSize:10,padding:'2px 6px',borderRadius:20,fontWeight:700,textTransform:'uppercase',background:a.tipo_linea==='itbms_debito'?C.dangerBg:a.tipo_linea==='itbms_credito'?C.successBg:C.surfaceAlt,color:a.tipo_linea==='itbms_debito'?C.dangerText:a.tipo_linea==='itbms_credito'?C.successText:C.textMuted}}>
                        {(a.tipo_linea||'').replace('_',' ')}
                      </span></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {diario.entradas?.length>3&&(
            <div style={{textAlign:'center',fontSize:12,color:C.textMuted,padding:'8px'}}>
              ... y {diario.entradas.length-3} fechas más. Ver completo en Motor Contable → Diario Contable.
            </div>
          )}

          <div style={{display:'flex',justifyContent:'center',marginTop:16}}>
            <button onClick={()=>{setPaso(1);setCal(null);setDiario(null);setTxTotal(null);}} style={{background:'none',border:`1px solid ${C.border}`,padding:'9px 20px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',color:C.textMuted}}>
              Procesar otro período
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
const AppShell = () => {
  const { user, loading } = useAuth();
  const [view, setView]   = useState("dashboard");

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}>
      <div style={{textAlign:"center",color:C.textMuted}}>
        <Icon name="refresh" size={32} color={C.accent}/><div style={{marginTop:12,fontSize:14}}>Cargando ContaPanamá...</div>
      </div>
    </div>
  );

  if (!user) return <AuthScreen/>;

  const VIEWS = {
    dashboard:     <DashboardView/>,
    flujo:         <FlujoView/>,
    clientes:      <ClientesView/>,
    transacciones: <TransaccionesView/>,
    contabilidad:  <ContabilidadView/>,
    prestamos:     <PrestamosView/>,
    fiscal:        <FiscalView/>,
    conciliacion:  <ConciliacionView/>,
    calidad:       <CalidadView/>,
    reportes:      <ReportesView/>,
    alertas:       <AlertasView/>,
    precios:       <PricingView token={user?.token} currentPlan={user?.plan||'gratis'}/>,
  };

  return (
    <>
      <style>{FONTS}</style>
      <style>{`*{font-family:'Plus Jakarta Sans',sans-serif;box-sizing:border-box;margin:0;padding:0;}input,select,textarea,button{font-family:inherit;}`}</style>
      <div style={{display:"flex",minHeight:"100vh",background:C.bg}}>
        <Sidebar active={view} setActive={setView}/>
        <main style={{marginLeft:230,flex:1,padding:"36px 40px",minHeight:"100vh"}}>
          {VIEWS[view]||null}
        </main>
      </div>
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppShell/>
    </AuthProvider>
  );
}
