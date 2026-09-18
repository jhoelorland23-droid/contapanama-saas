import { useState, useEffect, useCallback, createContext, useContext } from "react";

import { createApiClient, SESSION_EVENT } from "./api.mjs";
import { parseBankCsv, reconciliationCsv, bankColumns } from "./bankCsv.mjs";
import { bankAccountLabel, bankAttempt, pendingBankRequests } from "./bankAccounts.mjs";
import { useRef } from "react";
import BankStatements from "./BankStatements.jsx";
import BankSubledger from "./BankSubledger.jsx";
import LedgerConsistency from "./LedgerConsistency.jsx";

// --------------------------------------------------------------------------
//  API LAYER - todas las llamadas al backend centralizadas
// --------------------------------------------------------------------------
const API_URL = import.meta.env.VITE_API_URL || "";
const apiClient = createApiClient(API_URL);
const isRegisteredTransaction = tx => (tx.estado_contable ?? 'registrado') === 'registrado';

const api = {
  ...apiClient,
  pdf:    async (path, filename) => {
    const blob = await apiClient.blob(path);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename || path.split("/").pop().split("?")[0] + ".pdf";
    a.click(); URL.revokeObjectURL(url);
  },
};

// --------------------------------------------------------------------------
//  AUTH CONTEXT
// --------------------------------------------------------------------------
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const onExpired = () => {
      setUser(null);
      setConnectionError("");
      setSessionNotice("Tu sesión venció. Inicia sesión nuevamente.");
      setLoading(false);
    };
    window.addEventListener(SESSION_EVENT, onExpired);
    setConnectionError("");
    const token = localStorage.getItem("cp_token");
    if (!token) {
      setLoading(false);
      return () => window.removeEventListener(SESSION_EVENT, onExpired);
    }
    setLoading(true);
    api.get("/api/auth/me")
      .then(u => { if (active && localStorage.getItem("cp_token") === token) setUser(u); })
      .catch(e => {
        if (active && localStorage.getItem("cp_token") === token && e.status !== 401) {
          setConnectionError(e.message);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener(SESSION_EVENT, onExpired); };
  }, [retryCount]);

  const login = async (email, password) => {
    const { token, user } = await api.post("/api/auth/login", { email: email.trim(), password });
    localStorage.setItem("cp_token", token);
    setConnectionError("");
    setSessionNotice("");
    setUser(user);
  };

  const register = async (nombre, email, password) => {
    const { token, user } = await api.post("/api/auth/register", { nombre, email: email.trim(), password });
    localStorage.setItem("cp_token", token);
    setConnectionError("");
    setSessionNotice("");
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem("cp_token");
    setUser(null);
    setConnectionError("");
    setSessionNotice("");
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, connectionError, sessionNotice, retrySession: () => setRetryCount(n => n + 1) }}>
      {children}
    </AuthCtx.Provider>
  );
};

// --------------------------------------------------------------------------
//  DESIGN TOKENS
// --------------------------------------------------------------------------
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

const BANCOS_PANAMA = ["Banco General","Banco Nacional","Banistmo","BAC","Banesco","Global Bank","Caja de Ahorros"];
const CATEGORIAS_CONTABLES = {
  ingreso: [
    ["ventas_servicios","Ventas / servicios"],
    ["honorarios","Honorarios"],
    ["otros_ingresos","Otros ingresos"],
  ],
  gasto: [
    ["compras_inventario","Compras / inventario"],
    ["alquiler","Alquiler"],
    ["servicios_publicos","Servicios públicos"],
    ["planilla","Planilla"],
    ["honorarios_profesionales","Honorarios profesionales"],
    ["transporte","Transporte"],
    ["impuestos_tasas","Impuestos y tasas"],
    ["banco_comisiones","Banco / comisiones"],
    ["gastos_operativos","Gastos operativos"],
    ["otros_gastos","Otros gastos"],
  ],
};
const categoriaContableLabel = id => (
  [...CATEGORIAS_CONTABLES.ingreso, ...CATEGORIAS_CONTABLES.gasto].find(([value]) => value === id)?.[1] || "Sin categoría"
);
const categoriaDefault = tipo => tipo === "gasto" ? "gastos_operativos" : "ventas_servicios";

// --------------------------------------------------------------------------
//  HELPERS
// --------------------------------------------------------------------------
const fmt = n => new Intl.NumberFormat("es-PA",{style:"currency",currency:"USD"}).format(n||0);
const fmtDate = d => d ? String(d).slice(0,10) : "-";
const totalDocumento = t => Number(t?.monto||0) + Number(t?.itbms||0);
const saldoDocumento = t => Number(t?.saldo_pendiente ?? (t?.estado_pago === "pagado" ? 0 : totalDocumento(t)));
const tienePagos = t => t.pagos?.some(p=>!p.legacy);
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
};
const diasHasta = date => {
  if(!date) return null;
  const hoy = new Date(new Date().toISOString().slice(0,10));
  const fin = new Date(`${date}T00:00:00`);
  return Math.round((fin - hoy) / 86400000);
};
const vencimientoInfo = t => {
  if((t.estado_pago||"pendiente")==="pagado" || !t.fecha_vencimiento) return null;
  const dias = diasHasta(t.fecha_vencimiento);
  if(dias < 0) return {label:`Vencido ${Math.abs(dias)}d`, color:C.dangerText, bg:C.dangerBg};
  if(dias <= 7) return {label:`Vence ${dias}d`, color:C.warningText, bg:C.warningBg};
  return {label:`Vence ${fmtDate(t.fecha_vencimiento)}`, color:C.infoText, bg:C.infoBg};
};
const csvCell = value => `"${String(value ?? "").replace(/"/g,'""')}"`;
const downloadText = (filename, text, type="text/csv;charset=utf-8") => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

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
const pagoBadge = e => {
  const m = {pagado:[C.successBg,C.successText], parcial:[C.warningBg,C.warningText], pendiente:[C.dangerBg,C.dangerText]};
  const [bg,color] = m[e]||m.pendiente;
  return {background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,display:"inline-block",textTransform:"uppercase"};
};

// --------------------------------------------------------------------------
//  ICONS
// --------------------------------------------------------------------------
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
  alert:"M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
};
const Icon = ({name,size=18,color="currentColor"}) => (
  <svg width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d={PATHS[name]||""}/>
  </svg>
);

// --------------------------------------------------------------------------
//  UI ATOMS
// --------------------------------------------------------------------------
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
    <span>Atención: {msg}</span>
    {onRetry&&<button onClick={onRetry} style={{background:C.danger,color:"#fff",border:"none",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>Reintentar</button>}
  </div>
);

const inpSt = {width:"100%",padding:"9px 12px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,color:C.text,background:C.surfaceAlt,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};
const lblSt = {display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"};
const Fld   = ({label,children}) => <div style={{marginBottom:16}}><label style={lblSt}>{label}</label>{children}</div>;

const Btn = ({children,onClick,variant="primary",loading=false,disabled=false,style={},...p}) => {
  const styles = {
    primary:  {background:C.accent,color:"#fff",border:"none"},
    secondary:{background:"none",color:C.textMuted,border:`1px solid ${C.border}`},
    danger:   {background:C.danger,color:"#fff",border:"none"},
    success:  {background:C.success,color:"#fff",border:"none"},
    ghost:    {background:"none",color:C.accent,border:`1px solid ${C.accent}`},
  };
  return (
    <button onClick={onClick} disabled={loading||disabled} {...p}
      style={{padding:"9px 20px",borderRadius:8,fontWeight:600,fontSize:14,cursor:loading?"wait":disabled?"not-allowed":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,opacity:loading?0.7:disabled?0.45:1,...styles[variant],...style}}>
      {loading?"Procesando...":children}
    </button>
  );
};

const Modal = ({title,onClose,children,width=540,closeDisabled=false}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div role="dialog" aria-modal="true" aria-label={title} style={{background:C.surface,borderRadius:16,width:"100%",maxWidth:width,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.surface,zIndex:1}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>{title}</div>
        <button aria-label="Cerrar" disabled={closeDisabled} onClick={onClose} style={{background:"none",border:"none",cursor:closeDisabled?"wait":"pointer",color:C.textMuted,padding:4}}>
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

// --------------------------------------------------------------------------
//  LOGIN / REGISTER SCREEN
// --------------------------------------------------------------------------
const AuthScreen = () => {
  const { login, register, sessionNotice } = useAuth();
  const [mode, setMode]   = useState("login");
  const [form, setForm]   = useState({ nombre:"", email:"", password:"" });
  const [err,  setErr]    = useState("");
  const [busy, setBusy]   = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    setErr(""); setBusy(true);
    try {
      if (mode === "login")    await login(form.email, form.password);
      else                     await register(form.nombre, form.email, form.password);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };


  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1923 0%,#0e3a5c 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} style={{background:C.surface,borderRadius:20,padding:"44px 48px",width:"100%",maxWidth:440,boxSizing:"border-box",boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}}>
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


        {(err || sessionNotice) && <ErrBox msg={err || sessionNotice}/>}

        {mode==="register" && (
          <Fld label="Nombre completo">
            <input aria-label="Nombre completo" autoComplete="name" required value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Juan Pérez CPA" style={inpSt}/>
          </Fld>
        )}
        <Fld label="Correo electrónico">
          <input type="email" aria-label="Correo electrónico" autoComplete="username" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="contador@tuempresa.pa" style={inpSt}/>
        </Fld>
        <Fld label="Contraseña">
          <input type="password" aria-label="Contraseña" autoComplete={mode==="login"?"current-password":"new-password"} required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={mode==="register"?"Mínimo 8 caracteres, 1 mayúscula, 1 número":""} style={inpSt}/>
        </Fld>

        <Btn type="submit" loading={busy} style={{width:"100%",justifyContent:"center",marginTop:8,padding:"12px"}}>
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

        {import.meta.env.DEV && <div style={{marginTop:24,padding:"12px 16px",background:C.infoBg,borderRadius:8,fontSize:12,color:C.infoText,overflowWrap:"anywhere"}}>
          <strong>{import.meta.env.VITE_SQL_REVIEW === '1' ? 'Revisión SQL, datos sintéticos:' : 'Demo:'}</strong> {reviewDemo.email} / {reviewDemo.password}
        </div>}
      </form>
    </div>
  );
};

// --------------------------------------------------------------------------
//  SIDEBAR
// --------------------------------------------------------------------------
const NAV = [
  {id:"control",      label:"Centro CPA",     icon:"dashboard"},
  {id:"dashboard",    label:"Dashboard",      icon:"trending"},
  {id:"clientes",     label:"Clientes",       icon:"users"},
  {id:"transacciones",label:"Diario Contable",icon:"journal"},
  {id:"contabilidad", label:"Contabilidad",   icon:"report"},
  {id:"fiscal",       label:"Módulo Fiscal",  icon:"tax"},
  {id:"conciliacion", label:"Conciliación",   icon:"bank"},
  {id:"propuestas",   label:"Propuestas IA",  icon:"check"},
  {id:"reportes",     label:"Reportes PDF",   icon:"report"},
  {id:"auditoria",     label:"Auditoría",      icon:"lock"},
  {id:"alertas",      label:"Alertas",        icon:"bell"},
];

const Sidebar = ({active,setActive}) => {
  const {user,logout} = useAuth();
  return (
    <div className="app-sidebar" style={{width:230,background:C.nav,display:"flex",flexDirection:"column",height:"100vh",position:"fixed",left:0,top:0,zIndex:100}}>
      <div className="sidebar-brand" style={{padding:"24px 20px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:C.accent,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="dollar" size={18} color="#fff"/>
          </div>
          <div className="sidebar-brand-text">
            <div style={{color:"#fff",fontWeight:700,fontSize:15,lineHeight:1.2}}>ContaPanamá</div>
            <div style={{color:"#64748b",fontSize:11,marginTop:1}}>SaaS Contable</div>
          </div>
        </div>
      </div>
      <div className="sidebar-navigation" style={{padding:"0 12px",flex:1,overflowY:"auto"}}>
        {NAV.map(item=>{
          const on=active===item.id;
          return (
            <button key={item.id} aria-label={item.label} title={item.label} onClick={()=>setActive(item.id)}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",marginBottom:2,background:on?"#0e3a5c":"transparent",color:on?"#e0f2fe":"#94a3b8",fontWeight:on?600:400,fontSize:14,textAlign:"left",fontFamily:"inherit"}}>
              <Icon name={item.icon} size={17} color={on?C.accent:"#64748b"}/>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="sidebar-footer" style={{padding:"12px 12px 20px",borderTop:"1px solid #1e293b"}}>
        <div className="sidebar-user" style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#bfdbfe",flexShrink:0}}>
            {user?.nombre?.slice(0,2).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:"#cbd5e1",fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.nombre}</div>
            <div style={{color:"#475569",fontSize:11,textTransform:"capitalize"}}>{user?.rol}</div>
          </div>
        </div>
        <button aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",borderRadius:7,border:"none",cursor:"pointer",background:"transparent",color:"#64748b",fontSize:13,fontFamily:"inherit"}}>
          <Icon name="logout" size={15} color="#64748b"/> <span className="nav-label">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------
//  DASHBOARD VIEW
// --------------------------------------------------------------------------
const ControlCenterView = ({setView}) => {
  const currentYear = String(new Date().getFullYear());
  const currentPeriod = new Date().toISOString().slice(0,7);
  const [data,setData] = useState(null);
  const [txns,setTxns] = useState([]);
  const [clientes,setClientes] = useState([]);
  const [itbms,setItbms] = useState(null);
  const [cierreContable,setCierreContable] = useState(null);
  const [saldosCorte,setSaldosCorte] = useState(null);
  const [cierreEstado,setCierreEstado] = useState(null);
  const [cierresPeriodo,setCierresPeriodo] = useState(null);
  const [modo,setModo] = useState("mensual");
  const [periodo,setPeriodo] = useState(currentPeriod);
  const [anio,setAnio] = useState(currentYear);
  const [err,setErr] = useState(null);
  const [busy,setBusy] = useState(true);
  const queryScope = modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`;
  const labelScope = modo === "mensual" ? periodo : `${anio} completo`;
  const anioScope = modo === "mensual" ? periodo.slice(0,4) : anio;

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      const [d,t,c,i,cc,ce,cp,sc] = await Promise.all([
        api.get(`/api/dashboard?periodo=${periodo}`),
        api.get(`/api/transacciones?${queryScope}`),
        api.get("/api/clientes"),
        api.get(`/api/fiscal/itbms?periodo=${periodo}`),
        api.get(`/api/contabilidad/cierre?${queryScope}`),
        api.get(`/api/contabilidad/cierre-estado?${queryScope}`),
        api.get(`/api/contabilidad/cierres-periodo?anio=${anioScope}`),
        api.get(`/api/contabilidad/antiguedad?${queryScope}`),
      ]);
      setData(d); setTxns((t.data||[]).filter(isRegisteredTransaction)); setClientes(c.data||[]); setItbms(i); setCierreContable(cc); setCierreEstado(ce.data||null); setCierresPeriodo(cp);
      setSaldosCorte(sc);
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  },[periodo,queryScope,anioScope]);

  useEffect(()=>{load();},[load]);

  if(busy) return <Spinner/>;
  if(err) return <ErrBox msg={err} onRetry={load}/>;

  const fin = {
    ingresos: txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+Number(t.monto||0),0),
    gastos: txns.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+Number(t.monto||0),0),
    itbms_debito: txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+Number(t.itbms||0),0),
    itbms_credito: txns.filter(t=>t.tipo==="gasto"&&t.deducible!==false).reduce((s,t)=>s+Number(t.itbms||0),0),
  };
  fin.itbms_neto = fin.itbms_debito - fin.itbms_credito;
  const venc = data.vencimientos || [];
  const omisos = clientes.filter(c=>c.estado==="omiso");
  const sinActividad = clientes.filter(c=>!parseFloat(c.total_ingresos||0)&&!parseFloat(c.total_gastos||0));
  const itbmsNeto = parseFloat(itbms?.saldo_pagar||0);
  const ingresos = txns.filter(t=>t.tipo==="ingreso");
  const gastos = txns.filter(t=>t.tipo==="gasto");
  const saldos = (saldosCorte?.data||[]).map(t=>({...t,id:t.transaccion_id}));
  const porCobrar = saldos.filter(t=>t.tipo==="por_cobrar");
  const porPagar = saldos.filter(t=>t.tipo==="por_pagar");
  const ordenarVencimiento = arr => [...arr].sort((a,b)=>(a.fecha_vencimiento||"9999-12-31").localeCompare(b.fecha_vencimiento||"9999-12-31"));
  const vencidos = [...porCobrar,...porPagar].filter(t=>vencimientoInfo(t)?.label.startsWith("Vencido"));
  const porVencer = [...porCobrar,...porPagar].filter(t=>vencimientoInfo(t)?.label.startsWith("Vence ") && diasHasta(t.fecha_vencimiento) <= 7);
  const totalPorCobrar = porCobrar.reduce((s,t)=>s+Number(t.total||0),0);
  const totalPorPagar = porPagar.reduce((s,t)=>s+Number(t.total||0),0);
  const urgentes = venc.filter(v=>["critica","alta"].includes(v.urgencia));
  const cierre = [
    {label:"Borradores por revisar", ok:!cierreContable?.total_borradores, detail:cierreContable?.total_borradores?`${cierreContable.total_borradores} sin registrar`:"Sin pendientes"},
    {label:"Movimientos registrados", ok:txns.length>0, detail:txns.length?`${txns.length} registros`:"Sin registros"},
    {label:"Partida doble", ok:cierreContable?.balanceado, detail:cierreContable?.balanceado?"Balanceada":`Diferencia ${fmt(cierreContable?.diferencia)}`},
    {label:"Vinculación bancaria", ok:cierreContable?.control_bancario?.movimientos_verificados === true,
      detail:!cierreContable?.control_bancario ? "Sin verificar" :
        cierreContable.control_bancario.estado === "sin_movimientos" ? "Sin movimientos bancarios" :
        cierreContable.control_bancario.sin_pendientes ? "Movimientos vinculados; saldo sin verificar" :
        `${cierreContable.control_bancario.pagos_pendientes} pagos y ${cierreContable.control_bancario.movimientos_pendientes} filas bancarias pendientes`},
    {label:"ITBMS calculado", ok:!!itbms, detail:fmt(modo==="mensual"?itbmsNeto:fin.itbms_neto)},
    {label:"Clientes sin omisos", ok:omisos.length===0, detail:omisos.length?`${omisos.length} omisos`:"Sin omisos"},
    {label:"Reportes disponibles", ok:txns.length>0, detail:txns.length?"Listos para PDF":"Faltan movimientos"},
  ];
  const avance = Math.round((cierre.filter(x=>x.ok).length/cierre.length)*100);
  const cierreFormal = cierreEstado?.estado || "abierto";
  const cierreFormalStyle = {
    cerrado: [C.successBg, C.successText, "Cerrado"],
    en_revision: [C.infoBg, C.infoText, "En revisión"],
    abierto: [C.surfaceAlt, C.textMuted, "Abierto"],
  }[cierreFormal] || [C.surfaceAlt, C.textMuted, "Abierto"];

  const action = (icon,title,sub,to,color=C.accent) => (
    <button onClick={()=>setView(to)} style={{display:"flex",alignItems:"center",gap:12,padding:14,border:`1px solid ${C.border}`,background:C.surface,borderRadius:8,cursor:"pointer",textAlign:"left",width:"100%"}}>
      <span style={{width:36,height:36,borderRadius:8,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <Icon name={icon} size={18} color={color}/>
      </span>
      <span style={{minWidth:0}}>
        <span style={{display:"block",fontSize:13,fontWeight:800,color:C.text}}>{title}</span>
        <span style={{display:"block",fontSize:11,color:C.textMuted,marginTop:2}}>{sub}</span>
      </span>
    </button>
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:24}}>
        <div>
          <div style={{fontSize:24,fontWeight:800,color:C.text}}>Centro de Control CPA</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:4}}>Cierre, obligaciones y riesgos operativos de {labelScope}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
            {["mensual","anual"].map(m=>(
              <button key={m} onClick={()=>setModo(m)} style={{padding:"9px 14px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {m==="mensual"?"Mes":"12 meses"}
              </button>
            ))}
          </div>
          {modo==="mensual"?(
            <input type="month" value={periodo} onInput={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} onChange={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} style={{...inpSt,width:150}}/>
          ):(
            <input value={anio} onInput={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} onChange={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} style={{...inpSt,width:105}}/>
          )}
          <Btn onClick={load} variant="secondary"><Icon name="refresh" size={15} color={C.textMuted}/>Actualizar</Btn>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1.35fr .65fr",gap:20,marginBottom:20}}>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>Cierre {modo==="mensual"?"del mes":"anual"}</div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>Estado antes de generar reportes</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
              <span style={{background:cierreFormalStyle[0],color:cierreFormalStyle[1],padding:"5px 10px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{cierreFormalStyle[2]}</span>
              <div style={{fontSize:30,fontWeight:800,color:avance>=75?C.success:avance>=50?C.warning:C.danger}}>{avance}%</div>
            </div>
          </div>
          {cierreEstado?.nota&&(
            <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",fontSize:12,color:C.textMuted,marginBottom:12}}>
              Nota CPA: {cierreEstado.nota}
            </div>
          )}
          {cierreFormal==="cerrado"&&(
            <div style={{background:C.successBg,border:`1px solid ${C.success}33`,borderRadius:8,padding:"9px 11px",fontSize:12,color:C.successText,fontWeight:800,marginBottom:12}}>
              Periodo protegido: diario, banco y conciliación quedan en modo consulta hasta reabrirlo en Contabilidad.
            </div>
          )}
          <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:16}}>
            <div style={{height:"100%",width:`${avance}%`,background:avance>=75?C.success:avance>=50?C.warning:C.danger}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {cierre.map(item=>(
              <div key={item.label} style={{display:"flex",gap:10,alignItems:"center",padding:12,border:`1px solid ${item.ok?C.border:C.warning}`,borderRadius:8,background:item.ok?C.surfaceAlt:C.warningBg}}>
                <Icon name={item.ok?"check":"bell"} size={17} color={item.ok?C.success:C.warning}/>
                <div>
                  <div style={{fontSize:12,fontWeight:800,color:C.text}}>{item.label}</div>
                  <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:14}}>Prioridad de hoy</div>
          <div style={{display:"grid",gap:10}}>
            {venc.slice(0,3).map(v=>(
              <div key={v.id} style={{padding:12,borderRadius:8,background:v.urgencia==="critica"?C.dangerBg:v.urgencia==="alta"?C.warningBg:C.infoBg,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.text}}>{v.descripcion}</div>
                  <span style={urgBadge(v.urgencia)}>{v.urgencia}</span>
                </div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:5}}>{v.entidad} - {fmtDate(v.fecha)}</div>
              </div>
            ))}
            {!venc.length&&<div style={{fontSize:13,color:C.successText,background:C.successBg,padding:14,borderRadius:8}}>Sin obligaciones pendientes.</div>}
          </div>
        </Card>
      </div>

      <Card style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>Cierres formales del año</div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>
              {cierresPeriodo?.total || 0} registro(s), {cierresPeriodo?.cerrados || 0} cerrado(s), {cierresPeriodo?.en_revision || 0} en revisión
            </div>
          </div>
          <button onClick={()=>setView("contabilidad")} style={{background:C.infoBg,color:C.infoText,border:"none",borderRadius:7,padding:"8px 11px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
            Ver detalle
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {(cierresPeriodo?.data||[]).slice(0,3).map(row=>(
            <div key={row.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:12,background:C.surfaceAlt}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                <div style={{fontSize:13,fontWeight:900,color:C.text}}>{row.alcance==="anual"?`Año ${row.anio}`:row.periodo}</div>
                <span style={{background:row.estado==="cerrado"?C.successBg:C.infoBg,color:row.estado==="cerrado"?C.successText:C.infoText,padding:"3px 8px",borderRadius:99,fontSize:10,fontWeight:900,textTransform:"uppercase"}}>
                  {row.estado==="cerrado"?"Cerrado":"En revisión"}
                </span>
              </div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:7}}>{row.cliente_nombre||"Toda la cartera"}</div>
              <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{row.cerrado_at?`Cerrado ${fmtDate(row.cerrado_at)}`:"Sin cierre final"}</div>
            </div>
          ))}
          {(!cierresPeriodo?.data||cierresPeriodo.data.length===0)&&(
            <div style={{gridColumn:"1 / -1",fontSize:13,color:C.textMuted,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
              Todavía no hay cierres formales registrados para {anioScope}.
            </div>
          )}
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
        <KpiCard label="Ingresos" value={fmt(fin.ingresos)} sub={`${ingresos.length} ingresos - ${labelScope}`} icon="trending" color={C.success}/>
        <KpiCard label="Gastos" value={fmt(fin.gastos)} sub={`${gastos.length} gastos - ${labelScope}`} icon="dollar" color={C.warning}/>
        <KpiCard label="Por cobrar" value={fmt(totalPorCobrar)} sub={`${porCobrar.length} factura(s)`} icon="bell" color={C.success}/>
        <KpiCard label="Por pagar" value={fmt(totalPorPagar)} sub={`${porPagar.length} gasto(s)`} icon="dollar" color={C.danger}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
        <KpiCard label="Vencidos" value={vencidos.length} sub="Cobros/pagos fuera de fecha" icon="bell" color={C.danger}/>
        <KpiCard label="Próximos 7 días" value={porVencer.length} sub="Cobros/pagos por vencer" icon="check" color={C.warning}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <Card>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:12}}>Cuentas por cobrar</div>
          {ordenarVencimiento(porCobrar).slice(0,5).map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:C.text}}>{t.cliente_nombre||"Sin cliente"}</div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{fmtDate(t.fecha)} - vence {fmtDate(t.fecha_vencimiento)} - {t.descripcion}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:800,color:C.success}}>{fmt(t.total)}</div>
                <div style={{fontSize:10,color:C.textLight,marginTop:2}}>Base {fmt(t.monto)} + ITBMS {fmt(t.itbms)}</div>
                <span style={pagoBadge(t.estado_pago)}>{t.estado_pago||"pendiente"}</span>
                {vencimientoInfo(t)&&<div style={{marginTop:4,fontSize:10,fontWeight:800,color:vencimientoInfo(t).color}}>{vencimientoInfo(t).label}</div>}
              </div>
            </div>
          ))}
          {!porCobrar.length&&<div style={{fontSize:13,color:C.textMuted,padding:"14px 0"}}>No hay cobros pendientes.</div>}
        </Card>
        <Card>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:12}}>Cuentas por pagar</div>
          {ordenarVencimiento(porPagar).slice(0,5).map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:C.text}}>{categoriaContableLabel(t.categoria_contable)}</div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{fmtDate(t.fecha)} - vence {fmtDate(t.fecha_vencimiento)} - {t.descripcion}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:800,color:C.danger}}>{fmt(t.total)}</div>
                <div style={{fontSize:10,color:C.textLight,marginTop:2}}>Base {fmt(t.monto)} + ITBMS {fmt(t.itbms)}</div>
                <span style={pagoBadge(t.estado_pago)}>{t.estado_pago||"pendiente"}</span>
                {vencimientoInfo(t)&&<div style={{marginTop:4,fontSize:10,fontWeight:800,color:vencimientoInfo(t).color}}>{vencimientoInfo(t).label}</div>}
              </div>
            </div>
          ))}
          {!porPagar.length&&<div style={{fontSize:13,color:C.textMuted,padding:"14px 0"}}>No hay pagos pendientes.</div>}
        </Card>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:14}}>Acciones rapidas</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {action("users","Nuevo cliente","Alta o actualizacion","clientes","#8b5cf6")}
            {action("journal","Registrar movimiento","Ingreso o gasto","transacciones",C.success)}
            {action("tax","Revisar impuestos","ITBMS e ISR","fiscal",C.info)}
            {action("report","Generar reportes","PDFs de cierre","reportes","#ec4899")}
          </div>
        </Card>

        <Card>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:14}}>Clientes que revisar</div>
          {[...omisos,...sinActividad].slice(0,5).map(c=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:C.text}}>{c.nombre}</div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{c.ruc} - {c.actividad||"Sin actividad"}</div>
              </div>
              <span style={{fontSize:11,fontWeight:800,borderRadius:99,padding:"4px 8px",background:c.estado==="omiso"?C.dangerBg:C.infoBg,color:c.estado==="omiso"?C.dangerText:C.infoText}}>
                {c.estado==="omiso"?"omiso":"sin actividad"}
              </span>
            </div>
          ))}
          {!omisos.length&&!sinActividad.length&&<div style={{fontSize:13,color:C.textMuted,padding:"16px 0"}}>No hay clientes criticos en este periodo.</div>}
        </Card>
      </div>
    </div>
  );
};

const DashboardView = () => {
  const currentYear = String(new Date().getFullYear());
  const currentPeriod = new Date().toISOString().slice(0,7);
  const [data,setData]   = useState(null);
  const [txns,setTxns]   = useState([]);
  const [modo,setModo]   = useState("mensual");
  const [periodo,setPeriodo] = useState(currentPeriod);
  const [anio,setAnio]   = useState(currentYear);
  const [err, setErr]    = useState(null);
  const [busy,setBusy]   = useState(true);
  const queryScope = modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`;
  const labelScope = modo === "mensual" ? periodo : `${anio} completo`;

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      const [d,t]=await Promise.all([
        api.get(`/api/dashboard?periodo=${periodo}`),
        api.get(`/api/transacciones?${queryScope}`),
      ]);
      setData(d); setTxns((t.data||[]).filter(isRegisteredTransaction));
    } catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[periodo,queryScope]);

  useEffect(()=>{load();},[load]);

  if(busy) return <Spinner/>;
  if(err)  return <ErrBox msg={err} onRetry={load}/>;

  const fin = {
    ingresos: txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+Number(t.monto||0),0),
    gastos: txns.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+Number(t.monto||0),0),
    itbms_debito: txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+Number(t.itbms||0),0),
    itbms_credito: txns.filter(t=>t.tipo==="gasto"&&t.deducible!==false).reduce((s,t)=>s+Number(t.itbms||0),0),
  };
  fin.utilidad = fin.ingresos - fin.gastos;
  fin.itbms_neto = fin.itbms_debito - fin.itbms_credito;
  const evolucion = modo === "anual"
    ? Array.from({length:12},(_,i)=>{
        const mes = `${anio}-${String(i+1).padStart(2,"0")}`;
        const mesRows = txns.filter(t=>(t.periodo||String(t.fecha).slice(0,7))===mes);
        return {
          periodo: mes,
          ingresos: mesRows.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+Number(t.monto||0),0),
          gastos: mesRows.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+Number(t.monto||0),0),
        };
      })
    : (data.evolucion||[]).filter(m=>String(m.periodo).startsWith(periodo.slice(0,4)));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Dashboard</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Datos en tiempo real - {labelScope}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
            {["mensual","anual"].map(m=>(
              <button key={m} onClick={()=>setModo(m)} style={{padding:"9px 14px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {m==="mensual"?"Mes":"12 meses"}
              </button>
            ))}
          </div>
          {modo==="mensual"?(
            <input type="month" value={periodo} onInput={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} onChange={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} style={{...inpSt,width:150}}/>
          ):(
            <input value={anio} onInput={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} onChange={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} style={{...inpSt,width:105}}/>
          )}
          <Btn onClick={load} variant="secondary"><Icon name="refresh" size={15} color={C.textMuted}/>Actualizar</Btn>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <KpiCard label={modo==="mensual"?"Ingresos del Mes":"Ingresos del Año"}  value={fmt(fin.ingresos)}     sub={labelScope}  icon="trending" color={C.success}/>
        <KpiCard label={modo==="mensual"?"Gastos del Mes":"Gastos del Año"}    value={fmt(fin.gastos)}       sub={labelScope}  icon="dollar"   color={C.warning}/>
        <KpiCard label="ITBMS Neto DGI"    value={fmt(fin.itbms_neto)}   sub={`Débito: ${fmt(fin.itbms_debito)}`} icon="tax" color={C.info}/>
        <KpiCard label="Clientes Activos"  value={data.clientes.activos} sub={`${data.clientes.omisos} omisos`} icon="users" color="#8b5cf6"/>
      </div>

      {/* Evolución mensual */}
      {evolucion.length>0 && (
        <Card style={{marginBottom:24}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:16}}>Evolución Mensual {modo==="anual"?anio:periodo.slice(0,4)}</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:100}}>
            {evolucion.map(m=>{
              const maxVal=Math.max(...evolucion.map(x=>Math.max(parseFloat(x.ingresos),parseFloat(x.gastos))),1);
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
                <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{fmtDate(t.fecha)} - {t.cliente_nombre||"-"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                <div style={{fontSize:13,fontWeight:700,color:t.tipo==="ingreso"?C.success:C.danger}}>
                  {t.tipo==="ingreso"?"+":"-"}{fmt(totalDocumento(t))}
                </div>
                <div style={{fontSize:10,color:C.textLight}}>Base: {fmt(t.monto)} - ITBMS: {fmt(t.itbms)}</div>
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
                <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{v.cliente_nombre||"Todos"} - {v.entidad}</div>
              </div>
              <div style={{textAlign:"right",marginLeft:12}}>
                <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{fmtDate(v.fecha)}</div>
                <span style={urgBadge(v.urgencia)}>{v.urgencia}</span>
              </div>
            </div>
          ))}
          {data.vencimientos.length===0&&<div style={{fontSize:13,color:C.textLight,textAlign:"center",padding:"20px 0"}}>Sin vencimientos pendientes </div>}
        </Card>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------
//  CLIENTES VIEW
// --------------------------------------------------------------------------
const ClientesView = () => {
  const [rows,setRows] = useState([]);
  const [search,setSearch] = useState("");
  const [busy,setBusy]  = useState(true);
  const [err,setErr]    = useState(null);
  const [saving,setSaving]=useState(false);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [auditCliente,setAuditCliente]=useState(null);
  const [auditRows,setAuditRows]=useState([]);
  const [auditBusy,setAuditBusy]=useState(false);
  const EMPTY={nombre:"",ruc:"",nit:"",tipo:"jurídica",contribuyente_itbms:true,regimen_fiscal:"general",periodo_fiscal:"calendario",cierre_fiscal_mes:12,actividad:"",estado:"activo",telefono:"",email:""};
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

  const openNew  = ()=>{setForm(EMPTY);setEditId(null);setModal(true);};
  const openEdit = c=>{setForm({nombre:c.nombre,ruc:c.ruc,nit:c.nit||"",tipo:c.tipo,contribuyente_itbms:c.contribuyente_itbms??true,regimen_fiscal:c.regimen_fiscal||"general",periodo_fiscal:c.periodo_fiscal||"calendario",cierre_fiscal_mes:c.cierre_fiscal_mes||12,actividad:c.actividad||"",estado:c.estado,telefono:c.telefono||"",email:c.email||""});setEditId(c.id);setModal(true);};

  const save = async()=>{
    if(!form.nombre||!form.ruc)return;
    setSaving(true);
    try{
      if(editId) await api.put(`/api/clientes/${editId}`,form);
      else       await api.post("/api/clientes",form);
      setModal(false); load();
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  const del = async c=>{
    const total = Number(c.total_transacciones||0);
    if(total>0){alert(`No se puede eliminar este cliente porque tiene ${total} registro(s) contable(s). Edítalo y cambia el estado a inactivo para conservar el historial.`);return;}
    if(!confirm("¿Eliminar este cliente sin historial contable? Esta acción queda registrada en auditoría."))return;
    try{await api.delete(`/api/clientes/${c.id}`);load();}
    catch(e){alert(e.message);}
  };

  const verAuditoria = async c=>{
    setAuditCliente(c); setAuditRows([]); setAuditBusy(true);
    try{
      const res=await api.get(`/api/clientes/${c.id}/auditoria`);
      setAuditRows(res.data||[]);
    }catch(e){alert(e.message);}
    finally{setAuditBusy(false);}
  };
  const resumenEventoCliente = ev => {
    const d = ev.despues_json || {};
    if(ev.accion==="cliente_creado") return `Alta de cliente: ${d.nombre || auditCliente?.nombre || ""}`.trim();
    if(ev.accion==="cliente_actualizado") return `Actualización de perfil/datos: ${d.tipo || auditCliente?.tipo || ""}, ${d.regimen_fiscal || "general"}, cierre ${d.cierre_fiscal_mes || 12}`;
    if(ev.accion==="cliente_eliminado") return "Cliente eliminado sin historial contable.";
    if(ev.accion==="propuesta_ia_recibida") return `Propuesta recibida${ev.source_work_id?` (${ev.source_work_id})`:""}`;
    if(ev.accion==="propuesta_vinculada_a_cliente") return `Propuesta vinculada a ${d.cliente_nombre || auditCliente?.nombre || "cliente"}`;
    if(ev.accion==="propuesta_convertida_a_borrador") return `${d.total || 0} borrador(es) contable(s) creado(s)`;
    if(ev.accion==="borrador_ia_confirmado") return "Borrador confirmado como registro contable.";
    if(ev.accion==="conciliacion_bancaria_confirmada") return `Conciliación bancaria${d.banco?` - ${d.banco}`:""}${d.monto?` - ${fmt(d.monto)}`:""}`;
    if(ev.accion==="conciliacion_bancaria_reversada") return "Conciliación bancaria reversada.";
    if(ev.accion==="transaccion_actualizada") return "Transacción del cliente actualizada.";
    return "Evento operativo registrado.";
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
              <TH>Perfil fiscal</TH><TH>Actividad</TH><TH right>Registros</TH><TH>Ingresos</TH><TH>Estado</TH><TH>Acciones</TH>
            </tr></thead>
            <tbody>
              {rows.map((c,i)=>{
                const tieneHistorial = Number(c.total_transacciones||0)>0;
                return (
                <tr key={c.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD><div style={{fontWeight:600}}>{c.nombre}</div><div style={{fontSize:11,color:C.textLight}}>NIT: {c.nit}</div></TD>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted}}>{c.ruc}</TD>
                  <TD><span style={{fontSize:12,background:c.tipo==="jurídica"?C.infoBg:"#fdf4ff",color:c.tipo==="jurídica"?C.infoText:"#7c3aed",padding:"2px 10px",borderRadius:20,fontWeight:600}}>{c.tipo}</span></TD>
                  <TD style={{fontSize:11,color:C.textMuted}}>
                    <div>{c.contribuyente_itbms===false?"No contribuyente ITBMS":"Contribuyente ITBMS"}</div>
                    <div>{c.regimen_fiscal||"general"} · cierre {c.cierre_fiscal_mes||12}</div>
                  </TD>
                  <TD style={{color:C.textMuted}}>{c.actividad||"-"}</TD>
                  <TD style={{fontWeight:800,textAlign:"right",color:tieneHistorial?C.text:C.textMuted}}>{Number(c.total_transacciones||0)}</TD>
                  <TD style={{fontWeight:600,color:C.success}}>{fmt(c.total_ingresos)}</TD>
                  <TD><span style={estadoBadge(c.estado)}>{c.estado}</span></TD>
                  <TD>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>openEdit(c)} style={{background:C.infoBg,border:"none",padding:"6px 8px",borderRadius:6,cursor:"pointer"}}><Icon name="edit" size={14} color={C.infoText}/></button>
                      <button onClick={()=>verAuditoria(c)} title="Trazabilidad fiscal y contable" style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,padding:"6px 8px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:800,color:C.textMuted}}>Traz.</button>
                      <button onClick={()=>del(c)} disabled={tieneHistorial} title={tieneHistorial?"No se puede eliminar un cliente con historial":"Eliminar cliente"} style={{background:tieneHistorial?C.surfaceAlt:C.dangerBg,border:"none",padding:"6px 8px",borderRadius:6,cursor:tieneHistorial?"not-allowed":"pointer",opacity:tieneHistorial?0.5:1}}><Icon name="trash" size={14} color={tieneHistorial?C.textLight:C.dangerText}/></button>
                    </div>
                  </TD>
                </tr>
                );
              })}
              {rows.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:"40px",color:C.textMuted}}>No hay clientes registrados</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {auditCliente&&(
        <Modal title="Trazabilidad del cliente" onClose={()=>setAuditCliente(null)} width={780}>
          <div style={{display:"grid",gridTemplateColumns:"1.1fr .9fr",gap:12,marginBottom:16}}>
            <div>
              <div style={{fontSize:12,color:C.textMuted,fontWeight:800}}>Cliente</div>
              <div style={{fontSize:16,fontWeight:900,color:C.text,marginTop:3}}>{auditCliente.nombre}</div>
              <div style={{fontSize:12,color:C.textLight,marginTop:3}}>RUC {auditCliente.ruc} - {auditCliente.tipo}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:C.textMuted,fontWeight:800}}>Perfil fiscal</div>
              <div style={{fontSize:13,fontWeight:800,color:C.text,marginTop:3}}>{auditCliente.contribuyente_itbms===false?"No ITBMS":"ITBMS"} - {auditCliente.regimen_fiscal||"general"}</div>
              <div style={{fontSize:11,color:C.textLight}}>Cierre fiscal mes {auditCliente.cierre_fiscal_mes||12}</div>
            </div>
          </div>
          {auditBusy?<Spinner/>:(
            <div style={{display:"grid",gap:10}}>
              {auditRows.length>0&&<div style={{fontSize:12,color:C.textLight}}>Mostrando eventos recientes para revisión; el total completo queda conservado en auditoría.</div>}
              {auditRows.map(ev=>(
                <div key={ev.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:12,background:C.surfaceAlt}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                    <div style={{fontWeight:900,color:C.text}}>{String(ev.accion||"evento").replaceAll("_"," ")}</div>
                    <div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{fmtDate(ev.created_at)}</div>
                  </div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:6}}>
                    {resumenEventoCliente(ev)}
                  </div>
                  {(ev.source_system||ev.source_work_id)&&(
                    <div style={{fontSize:11,color:C.textLight,marginTop:6,fontFamily:"JetBrains Mono,monospace"}}>
                      {[ev.source_system,ev.source_work_id].filter(Boolean).join(" / ")}
                    </div>
                  )}
                </div>
              ))}
              {auditRows.length===0&&<div style={{padding:18,textAlign:"center",color:C.textMuted,border:`1px dashed ${C.border}`,borderRadius:8}}>Este cliente aún no tiene eventos de auditoría.</div>}
            </div>
          )}
        </Modal>
      )}

      {modal&&(
        <Modal title={editId?"Editar Cliente":"Nuevo Cliente"} onClose={()=>setModal(false)}>
          <Fld label="Nombre / Razón Social"><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="RUC"><input value={form.ruc} onChange={e=>setForm({...form,ruc:e.target.value})} placeholder="155-789-1" style={inpSt}/></Fld>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Régimen fiscal">
              <select value={form.regimen_fiscal} onChange={e=>setForm({...form,regimen_fiscal:e.target.value})} style={inpSt}>
                <option value="general">General</option>
                <option value="ampyme">AMPYME</option>
                <option value="no_contribuyente_itbms">No contribuyente ITBMS</option>
                <option value="exento">Exento</option>
              </select>
            </Fld>
            <Fld label="Periodo fiscal">
              <select value={form.periodo_fiscal} onChange={e=>setForm({...form,periodo_fiscal:e.target.value})} style={inpSt}>
                <option value="calendario">Calendario</option>
                <option value="especial">Especial</option>
              </select>
            </Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Mes de cierre fiscal">
              <select value={form.cierre_fiscal_mes} onChange={e=>setForm({...form,cierre_fiscal_mes:Number(e.target.value)})} style={inpSt}>
                {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m,i)=><option key={m} value={i+1}>{m}</option>)}
              </select>
            </Fld>
            <Fld label="ITBMS">
              <select value={form.contribuyente_itbms?"si":"no"} onChange={e=>setForm({...form,contribuyente_itbms:e.target.value==="si"})} style={inpSt}>
                <option value="si">Contribuyente</option>
                <option value="no">No contribuyente</option>
              </select>
            </Fld>
          </div>
          <Fld label="Actividad Económica"><input value={form.actividad} onChange={e=>setForm({...form,actividad:e.target.value})} style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Teléfono"><input value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} style={inpSt}/></Fld>
            <Fld label="Email"><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={inpSt}/></Fld>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  TRANSACCIONES VIEW
// --------------------------------------------------------------------------
const TransaccionesView = ({ onNavigate }) => {
  const { user } = useAuth();
  const currentYear = String(new Date().getFullYear());
  const currentPeriod = new Date().toISOString().slice(0,7);
  const [rows,setRows]     = useState([]);
  const [clientes,setCli]  = useState([]);
  const [resumen,setRes]   = useState(null);
  const [modo,setModo]     = useState("mensual");
  const [periodo,setPeriodo] = useState(currentPeriod);
  const [anio,setAnio]     = useState(currentYear);
  const [clienteId,setClienteId] = useState("");
  const [search,setSearch] = useState("");
  const [filtro,setFiltro] = useState("todos");
  const [estadoFiltro,setEstadoFiltro] = useState("todos");
  const [desde,setDesde]   = useState("");
  const [hasta,setHasta]   = useState("");
  const [busy,setBusy]     = useState(true);
  const [err,setErr]       = useState(null);
  const [modal,setModal]   = useState(false);
  const [saving,setSaving] = useState(false);
  const [auditTx,setAuditTx] = useState(null);
  const [correctionTx,setCorrectionTx] = useState(null);
  const [correctionForm,setCorrectionForm] = useState({});
  const [correctionRevision,setCorrectionRevision] = useState("");
  const [correctionReason,setCorrectionReason] = useState("");
  const [correctionConfirmed,setCorrectionConfirmed] = useState(false);
  const [correctionBusy,setCorrectionBusy] = useState(false);
  const [correctionError,setCorrectionError] = useState("");
  const correctionLabels = { fecha:"Fecha",descripcion:"Descripción",categoria_contable:"Categoría",monto:"Base",itbms:"ITBMS",tasa_itbms:"Tasa ITBMS",categoria_itbms:"Tipo ITBMS",deducible:"Deducible",referencia:"Referencia" };
  const correctionChanges = Object.fromEntries(Object.entries(correctionForm).filter(([field,value])=>{
    const previous=correctionTx?.[field];
    if(field==="deducible")return Boolean(previous)!==Boolean(value);
    return ["monto","itbms","tasa_itbms"].includes(field)?Number(previous||0)!==Number(value):String(previous??"")!==String(value??"");
  }));
  const [paymentTx,setPaymentTx] = useState(null);
  const [paymentForm,setPaymentForm] = useState({fecha_pago:"",metodo_pago:"transferencia",banco:"",referencia_pago:"",cuenta_bancaria_id:""});
  const [bankAccounts,setBankAccounts] = useState([]);
  const [bankAccountsReady,setBankAccountsReady] = useState(false);
  const [newTxError,setNewTxError] = useState("");
  const [paymentError,setPaymentError] = useState("");
  const [paymentSaving,setPaymentSaving] = useState(false);
  const [paymentLoaded,setPaymentLoaded] = useState(false);
  const [voidPayment,setVoidPayment] = useState(null);
  const paymentAttempt = useRef(null);
  const txAttempt = useRef(null);
  const [auditRows,setAuditRows] = useState([]);
  const [auditBusy,setAuditBusy] = useState(false);
  const [pdfBusy,setPdfBusy] = useState(false);
  const [cierreEstado,setCierreEstado] = useState(null);
  const EMPTY={fecha:"",cliente_id:"",cuenta_bancaria_id:"",descripcion:"",tipo:"ingreso",categoria_contable:"ventas_servicios",monto:"",itbms:"",tasa_itbms:"0.07",categoria_itbms:"general",deducible:false,banco:"",referencia:"",estado_pago:"pendiente",fecha_vencimiento:"",fecha_pago:"",metodo_pago:"transferencia",referencia_pago:"",conciliado:false,tipo_documento:"factura"};
  const [form,setForm]=useState(EMPTY);
  const queryBase = `${modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`}${clienteId?`&cliente_id=${clienteId}`:""}${desde?`&desde=${desde}`:""}${hasta?`&hasta=${hasta}`:""}${search.trim()?`&search=${encodeURIComponent(search.trim())}`:""}`;
  const cierreQuery = `${modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`}${clienteId?`&cliente_id=${clienteId}`:""}`;

  const load = useCallback(async()=>{
    setBusy(true); setErr(null);
    try {
      let q=`?${queryBase}`;
      if(filtro!=="todos") q+=`&tipo=${filtro}`;
      const [tx,sm,cl,ce,accounts]=await Promise.all([
        api.get(`/api/transacciones${q}`),
        api.get(`/api/transacciones/resumen?${queryBase}`),
        api.get("/api/clientes"),
        api.get(`/api/contabilidad/cierre-estado?${cierreQuery}`),
        api.get("/api/cuentas-bancarias").catch(e=>{if(e.status===404)return null;throw e;}),
      ]);
      setRows(tx.data||[]); setRes(sm); setCli(cl.data||[]);
      setCierreEstado(ce.data||null);
      setBankAccounts(accounts?.data||[]);setBankAccountsReady(Boolean(accounts));
    }catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[queryBase,cierreQuery,filtro]);

  useEffect(()=>{load();},[load]);

  const calcItbms = (monto, tasa=form.tasa_itbms)=>{
    const m=parseFloat(monto);
    const t=parseFloat(tasa);
    if(!isNaN(m)&&!isNaN(t)) setForm(f=>({...f,itbms:(m*t).toFixed(2)}));
  };

  const changeTasaItbms = e=>{
    const opt=e.target.selectedOptions[0];
    const tasa=e.target.value;
    setForm(f=>({
      ...f,
      tasa_itbms:tasa,
      categoria_itbms:opt?.dataset?.cat||"general",
      itbms:f.monto?((parseFloat(f.monto||0)*parseFloat(tasa||0)).toFixed(2)):""
    }));
  };

  const openNewTx = tipo => {
    if(cierreEstado?.estado==="cerrado"){
      alert(`El ${modo==="mensual"?"periodo":"año"} está cerrado. Reábrelo en Contabilidad antes de registrar movimientos.`);
      return;
    }
    setForm({
      ...EMPTY,
      tipo,
      fecha:new Date().toISOString().slice(0,10),
      fecha_vencimiento:addDays(new Date().toISOString().slice(0,10),30),
      categoria_contable:categoriaDefault(tipo),
      deducible:tipo==="gasto",
    });
    setNewTxError("");
    txAttempt.current=null;
    setModal(true);
  };

  const save = async()=>{
    if(cierreEstado?.estado==="cerrado"){alert("Periodo cerrado. Reábrelo antes de registrar movimientos.");return;}
    if(!form.fecha||!form.descripcion||!form.monto)return;
    setSaving(true);
    setNewTxError("");
    try{
      if(form.estado_pago==="pagado"&&form.metodo_pago!=="efectivo"&&!form.cuenta_bancaria_id)throw new Error("Seleccione la cuenta del cliente que recibió o realizó el pago.");
      // Retain the key until acknowledged so a retry after a lost response cannot publish the document twice.
      if(!txAttempt.current) txAttempt.current=crypto.randomUUID();
      await api.post("/api/transacciones",{...form,idempotencia:txAttempt.current});
      txAttempt.current=null;
      setModal(false); setForm(EMPTY); load();
    }catch(e){setNewTxError(e.message);}
    finally{setSaving(false);}
  };

  const marcarPagado = async t=>{
    setPaymentForm({importe:"",fecha_pago:"",metodo_pago:t.metodo_pago||"transferencia",banco:"",cuenta_bancaria_id:"",referencia_pago:""});
    setPaymentError(""); setPaymentLoaded(false); setVoidPayment(null); paymentAttempt.current=null;
    setPaymentTx(t);
    setPaymentSaving(true);
    try {
      const result=await api.get(`/api/transacciones/${t.id}/pagos`);
      setPaymentTx({...t,...result});
      setPaymentForm(f=>({...f,importe:Number(result.saldo_pendiente).toFixed(2)}));
      setPaymentLoaded(true);
    } catch(error) { setPaymentError(error.message); }
    finally { setPaymentSaving(false); }
  };
  const guardarPago = async event=>{
    event.preventDefault();
    if(paymentSaving||!paymentLoaded)return;
    setPaymentSaving(true); setPaymentError("");
    try {
      const payload={importe:paymentForm.importe,fecha:paymentForm.fecha_pago,metodo_pago:paymentForm.metodo_pago,
        banco:paymentForm.metodo_pago==="efectivo"?"":paymentForm.banco,cuenta_bancaria_id:paymentForm.metodo_pago==="efectivo"?null:paymentForm.cuenta_bancaria_id,referencia:paymentForm.referencia_pago};
      // Retain the key until acknowledged, including edits after an uncertain response.
      if(!paymentAttempt.current) paymentAttempt.current={id:crypto.randomUUID()};
      const result=await api.post(`/api/transacciones/${paymentTx.id}/pagos`,{...payload,idempotencia:paymentAttempt.current.id});
      setPaymentTx({...paymentTx,...result});
      setPaymentForm(f=>({...f,importe:Number(result.saldo_pendiente).toFixed(2),fecha_pago:"",referencia_pago:""}));
      paymentAttempt.current=null;
      await load();
    } catch(error) { setPaymentError(error.message); }
    finally { setPaymentSaving(false); }
  };

  const cambiarPago = async (pago,accion,body={})=>{
    if(paymentSaving)return;
    setPaymentSaving(true); setPaymentError("");
    try {
      const result=await api.post(`/api/transacciones/${paymentTx.id}/pagos/${pago.id}/${accion}`,body);
      setPaymentTx({...paymentTx,...result}); setVoidPayment(null);
      setPaymentForm(f=>({...f,importe:Number(result.saldo_pendiente).toFixed(2)}));
      paymentAttempt.current=null;
      await load();
    } catch(error) {setPaymentError(error.message);}
    finally {setPaymentSaving(false);}
  };

  const conciliar = async t=>{
    if(tienePagos(t)){await marcarPagado(t);return;}
    if(!t.conciliado){
      alert("Para conciliar correctamente, usa el módulo Conciliación y vincula este registro con un movimiento bancario.");
      onNavigate?.("conciliacion");
      return;
    }
    if(!confirm("¿Reversar la conciliación de esta transacción? Quedará registrada en auditoría."))return;
    if(t.estado_pago!=="pagado"){
      alert("Primero registra el cobro o pago. Luego se puede conciliar con el banco.");
      return;
    }
    await api.put(`/api/transacciones/${t.id}`,{conciliado:false,fecha_conciliacion:null});
    load();
  };

  const confirmarBorrador = async t=>{
    if(cierreEstado?.estado==="cerrado"){alert("Periodo cerrado. Reábrelo antes de confirmar borradores.");return;}
    if(!confirm("¿Confirmar este borrador IA como registro contable?"))return;
    await api.post(`/api/transacciones/${t.id}/confirmar-borrador`,{});
    load();
  };

  const verAuditoria = async t=>{
    setAuditTx(t);
    setAuditRows([]);
    setAuditBusy(true);
    try{
      const r=await api.get(`/api/transacciones/${t.id}/auditoria`);
      setAuditRows(r.data||[]);
    }catch(e){
      alert(e.message);
      setAuditTx(null);
    }finally{
      setAuditBusy(false);
    }
  };

  const revisarCorreccion = async tx => {
    setCorrectionTx(tx); setCorrectionBusy(true); setCorrectionError("");
    setCorrectionRevision(""); setCorrectionForm({}); setCorrectionReason(""); setCorrectionConfirmed(false);
    try {
      const result=await api.get(`/api/transacciones/${tx.id}/revision`);
      const document=result.documento;
      setCorrectionTx(document); setCorrectionRevision(result.revision);
      setCorrectionForm(Object.fromEntries(Object.keys(correctionLabels).map(field=>[field,
        field==="deducible"?Boolean(document[field]):document[field]??""])));
    } catch(error) {
      setCorrectionError(error.status===404?"La revisión no está disponible. Comprueba el documento y la actualización del servidor.":error.message);
    } finally {setCorrectionBusy(false);}
  };
  const guardarCorreccion = async event => {
    event.preventDefault();
    if(correctionBusy||!correctionRevision||!correctionConfirmed||!Object.keys(correctionChanges).length)return;
    setCorrectionBusy(true); setCorrectionError("");
    try {
      await api.put(`/api/transacciones/${correctionTx.id}`,{...correctionChanges,motivo_ajuste:correctionReason,revision_esperada:correctionRevision});
      setCorrectionTx(null); await load();
    } catch(error) {setCorrectionError(error.message);setCorrectionConfirmed(false);}
    finally {setCorrectionBusy(false);}
  };

  const del = async id=>{
    if(cierreEstado?.estado==="cerrado"){alert("Periodo cerrado. Reábrelo antes de eliminar registros.");return;}
    const row = rows.find(t=>t.id===id);
    if(row?.conciliado){alert("No se puede eliminar una transacción conciliada. Primero debe reversarse la conciliación.");return;}
    if(!confirm("¿Eliminar esta transacción no conciliada? Esta acción queda registrada en auditoría."))return;
    try {await api.delete(`/api/transacciones/${id}`); await load();}
    catch(error) {alert(error.message);}
  };

  const filtrarEstado = t => {
    if(estadoFiltro==="todos") return true;
    if(estadoFiltro==="borrador_ia") return !isRegisteredTransaction(t);
    if(!isRegisteredTransaction(t)) return false;
    if(estadoFiltro==="pendientes") return t.estado_pago!=="pagado";
    if(estadoFiltro==="pagados") return t.estado_pago==="pagado";
    if(estadoFiltro==="vencidos") return t.estado_pago!=="pagado" && t.fecha_vencimiento && diasHasta(t.fecha_vencimiento) < 0;
    if(estadoFiltro==="proximos") return t.estado_pago!=="pagado" && t.fecha_vencimiento && diasHasta(t.fecha_vencimiento) >= 0 && diasHasta(t.fecha_vencimiento) <= 7;
    if(estadoFiltro==="conciliar") return t.estado_pago==="pagado" && !t.conciliado;
    return true;
  };
  const rowsVisibles = rows.filter(filtrarEstado);

  const exportarCSV = () => {
    const headers = ["fecha","vencimiento","tipo","descripcion","categoria","cliente","estado_pago","fecha_pago","monto_base","itbms","total_documento","banco","referencia","conciliado","estado_contable","total_pagado","saldo_pendiente"];
    const lines = rowsVisibles.map(t => [
      t.fecha, t.fecha_vencimiento, t.tipo, t.descripcion, categoriaContableLabel(t.categoria_contable),
      t.cliente_nombre || "", t.estado_pago || "pendiente", t.fecha_pago || "", t.monto, t.itbms, totalDocumento(t),
      tienePagos(t)?"Ver historial de pagos":t.banco || "", t.referencia_pago || t.referencia || "", t.conciliado ? "si" : "no", t.estado_contable || "registrado", t.total_pagado ?? totalDocumento(t)-saldoDocumento(t), saldoDocumento(t)
    ].map(csvCell).join(","));
    downloadText(`diario-${modo==="mensual"?periodo:anio}-${estadoFiltro}.csv`, [headers.map(csvCell).join(","), ...lines].join("\n"));
  };

  const descargarDiarioPDF = async () => {
    setPdfBusy(true);
    try {
      const txType = filtro !== "todos" ? `&tipo=${filtro}` : "";
      const path = modo === "anual"
        ? `/api/reportes/diario-anual?${queryBase}${txType}`
        : `/api/reportes/diario?${queryBase}${txType}`;
      await api.pdf(path);
    } catch(e) {
      alert("Error generando PDF: "+e.message);
    } finally {
      setPdfBusy(false);
    }
  };

  const BANCOS=BANCOS_PANAMA;
  const registeredRows = rows.filter(isRegisteredTransaction);
  const porCobrar = registeredRows.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+saldoDocumento(t),0);
  const porPagar = registeredRows.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+saldoDocumento(t),0);
  const pagadas = registeredRows.filter(t=>t.estado_pago==="pagado").length;
  const conciliadas = registeredRows.filter(t=>t.conciliado).length;
  const borradoresIA = rows.filter(t=>t.estado_contable==="borrador_ia").length;
  const periodoCerrado = cierreEstado?.estado === "cerrado";

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Diario Contable</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{rowsVisibles.length} de {rows.length} registros - {modo==="mensual"?periodo:`${anio} completo`}</div>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <Btn variant="secondary" onClick={exportarCSV}><Icon name="report" size={16} color={C.textMuted}/>Exportar CSV</Btn>
          <Btn variant="secondary" onClick={descargarDiarioPDF} loading={pdfBusy}><Icon name="pdf" size={16} color={C.textMuted}/>PDF diario</Btn>
          <Btn onClick={()=>openNewTx("ingreso")} disabled={periodoCerrado} style={periodoCerrado?{opacity:.5,cursor:"not-allowed"}:{}}><Icon name="plus" size={16} color="#fff"/>Nuevo ingreso</Btn>
          <button onClick={()=>openNewTx("gasto")} disabled={periodoCerrado} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:8,border:"none",background:C.danger,color:"#fff",fontWeight:700,cursor:periodoCerrado?"not-allowed":"pointer",fontFamily:"inherit",opacity:periodoCerrado?.5:1}}>
            <Icon name="dollar" size={16} color="#fff"/>Nuevo gasto
          </button>
        </div>
      </div>

      {periodoCerrado&&(
        <div style={{background:C.successBg,border:`1px solid ${C.success}33`,borderLeft:`4px solid ${C.success}`,borderRadius:8,padding:"13px 16px",marginBottom:16,color:C.successText,fontSize:13,fontWeight:700}}>
          Documentos del periodo cerrados. Los cobros y pagos posteriores se registran en su fecha real, siempre que ese periodo siga abierto.
        </div>
      )}

      {resumen&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:16,marginBottom:20}}>
          <KpiCard label="Ingresos"  value={fmt(resumen.total_ingresos)} icon="trending" color={C.success}/>
          <KpiCard label="Gastos"    value={fmt(resumen.total_gastos)}   icon="dollar"   color={C.warning}/>
          <KpiCard label="Resultado" value={fmt(resumen.utilidad_neta)}  icon="check"    color={parseFloat(resumen.utilidad_neta)>=0?C.success:C.danger}/>
          <KpiCard label="Por cobrar" value={fmt(porCobrar)}   icon="bell"      color={C.success}/>
          <KpiCard label="Por pagar" value={fmt(porPagar)}   icon="dollar"      color={C.danger}/>
          <KpiCard label="Borradores IA" value={borradoresIA} icon="lock" color={borradoresIA?C.warning:C.success}/>
        </div>
      )}

      <Card style={{marginBottom:16,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
        <div><div style={{fontSize:12,color:C.textMuted,fontWeight:700}}>Cobrados / pagados</div><div style={{fontSize:22,fontWeight:800,color:C.success}}>{pagadas}</div></div>
        <div><div style={{fontSize:12,color:C.textMuted,fontWeight:700}}>Listos para conciliar</div><div style={{fontSize:22,fontWeight:800,color:C.info}}>{registeredRows.filter(t=>t.estado_pago==="pagado"&&!t.conciliado).length}</div></div>
        <div><div style={{fontSize:12,color:C.textMuted,fontWeight:700}}>Conciliados con banco</div><div style={{fontSize:22,fontWeight:800,color:C.text}}>{conciliadas}</div></div>
      </Card>

      {/* Filtros */}
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
          {["mensual","anual"].map(m=>(
            <button key={m} onClick={()=>setModo(m)} style={{padding:"8px 13px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
              {m==="mensual"?"Mensual":"Anual"}
            </button>
          ))}
        </div>
        {modo==="mensual"?(
          <input type="month" value={periodo} onInput={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} onChange={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} style={{...inpSt,width:150,padding:"6px 10px"}}/>
        ):(
          <input value={anio} onInput={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} onChange={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} style={{...inpSt,width:95,padding:"6px 10px"}}/>
        )}
        <select value={clienteId} onChange={e=>setClienteId(e.target.value)} style={{...inpSt,width:220,padding:"6px 10px"}}>
          <option value="">Toda la cartera</option>
          {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar concepto..." style={{...inpSt,width:190,padding:"6px 10px"}}/>
        {["todos","ingreso","gasto"].map(t=>(
          <button key={t} onClick={()=>setFiltro(t)} style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${filtro===t?C.accent:C.border}`,background:filtro===t?C.infoBg:"none",color:filtro===t?C.accent:C.textMuted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {t==="todos"?"Todos":t==="ingreso"?"Ingresos":"Gastos"}
          </button>
        ))}
        {[
          ["todos","Todos pagos"],
          ["pendientes","Pendientes"],
          ["pagados","Pagados"],
          ["vencidos","Vencidos"],
          ["proximos","Próx. 7 días"],
          ["conciliar","Listos conciliar"],
          ["borrador_ia","Borradores IA"],
        ].map(([id,label])=>(
          <button key={id} onClick={()=>setEstadoFiltro(id)} style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${estadoFiltro===id?C.accent:C.border}`,background:estadoFiltro===id?C.infoBg:"none",color:estadoFiltro===id?C.accent:C.textMuted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {label}
          </button>
        ))}
        <div style={{display:"flex",gap:8,marginLeft:"auto",alignItems:"center"}}>
          <span style={{fontSize:12,color:C.textMuted}}>Desde</span>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{...inpSt,width:140,padding:"6px 10px"}}/>
          <span style={{fontSize:12,color:C.textMuted}}>Hasta</span>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{...inpSt,width:140,padding:"6px 10px"}}/>
          {(desde||hasta)&&<button onClick={()=>{setDesde("");setHasta("");}} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:12,fontFamily:"inherit"}}>x Limpiar</button>}
        </div>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <Card style={{padding:0,overflowX:"auto"}}>
          <table style={{width:"100%",minWidth:1240,borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surfaceAlt}}>
              <TH>Fecha</TH><TH>Descripción</TH><TH>Cliente</TH>
              <TH>Tipo</TH><TH>Pago / Vence</TH><TH right>Base</TH><TH right>ITBMS</TH><TH right>Total</TH>
              <TH>Banco / Ref</TH><TH>Conc.</TH><TH>Acciones</TH>
            </tr></thead>
            <tbody>
              {rowsVisibles.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                  <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted,fontSize:12}}>{fmtDate(t.fecha)}</TD>
                  <TD style={{fontWeight:600,maxWidth:200}}>
                    <div>{t.descripcion}</div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{categoriaContableLabel(t.categoria_contable)}</div>
                    {t.estado_contable==="borrador_ia"&&<div style={{display:"inline-block",marginTop:5,padding:"2px 7px",borderRadius:99,background:C.warningBg,color:C.warningText,fontSize:10,fontWeight:800}}>BORRADOR IA</div>}
                  </TD>
                  <TD style={{color:C.textMuted,fontSize:12}}>{t.cliente_nombre||"-"}</TD>
                  <TD><span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:t.tipo==="ingreso"?C.successBg:C.dangerBg,color:t.tipo==="ingreso"?C.successText:C.dangerText,textTransform:"uppercase"}}>{t.tipo}</span></TD>
                  <TD>
                    <span style={pagoBadge(t.estado_pago)}>{t.estado_pago||"pendiente"}</span>
                    {t.fecha_pago&&<div style={{fontSize:11,color:C.textLight,marginTop:3}}>{fmtDate(t.fecha_pago)}</div>}
                    {vencimientoInfo(t)&&<div style={{display:"inline-block",marginTop:4,fontSize:10,fontWeight:800,borderRadius:99,padding:"2px 7px",background:vencimientoInfo(t).bg,color:vencimientoInfo(t).color}}>{vencimientoInfo(t).label}</div>}
                  </TD>
                  <TD style={{fontWeight:700,color:t.tipo==="ingreso"?C.success:C.danger,textAlign:"right"}}>{t.tipo==="ingreso"?"+":"-"}{fmt(t.monto)}</TD>
                  <TD style={{color:C.textMuted,textAlign:"right"}}>
                    <div>{fmt(t.itbms)}</div>
                    <div style={{fontSize:10,color:C.textLight}}>{Math.round(Number(t.tasa_itbms??0.07)*100)}%</div>
                  </TD>
                  <TD style={{fontWeight:900,color:t.tipo==="ingreso"?C.success:C.danger,textAlign:"right"}}>{t.tipo==="ingreso"?"+":"-"}{fmt(totalDocumento(t))}<div style={{fontSize:11,color:C.textMuted,fontWeight:500,marginTop:4}}>Saldo {fmt(saldoDocumento(t))}</div></TD>
                  <TD>{tienePagos(t)?<span style={{fontSize:12}}>{t.pagos.length} registro(s) de pago</span>:<><div style={{fontSize:12,fontWeight:600}}>{t.banco}</div><div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{t.referencia_pago||t.referencia}</div></>}</TD>
                  <TD style={{textAlign:"center"}}>{t.conciliado?<span style={{color:C.success,fontWeight:700}}>Sí</span>:<span style={{color:C.textLight}}>No</span>}</TD>
                  <TD>
                    {t.estado_contable==="borrador_ia"&&<button onClick={()=>confirmarBorrador(t)} disabled={periodoCerrado} style={{background:C.warningBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:periodoCerrado?"not-allowed":"pointer",fontSize:11,fontWeight:700,color:C.warningText,marginRight:6,opacity:periodoCerrado?.5:1}}>Registrar</button>}
                    {isRegisteredTransaction(t)&&<button onClick={()=>marcarPagado(t)} style={{background:C.successBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,color:C.successText,marginRight:6}}>{saldoDocumento(t)>0?(t.tipo==="ingreso"?"Cobrar":"Pagar"):"Pagos"}</button>}
                    {isRegisteredTransaction(t)&&<button onClick={()=>conciliar(t)} style={{background:t.conciliado?C.successBg:C.infoBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,color:t.conciliado?C.successText:C.infoText,marginRight:6}}>Conc.</button>}
                    {isRegisteredTransaction(t)&&["admin","contador"].includes(user?.rol)&&<button aria-label="Corregir documento" title="Corregir documento" onClick={()=>revisarCorreccion(t)} disabled={periodoCerrado||t.conciliado||tienePagos(t)} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,padding:6,borderRadius:6,cursor:"pointer",marginRight:6,opacity:periodoCerrado||t.conciliado||tienePagos(t)?0.4:1}}><Icon name="edit" size={14}/></button>}
                    <button onClick={()=>verAuditoria(t)} title="Trazabilidad" style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,padding:"5px 7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,color:C.textMuted,marginRight:6}}>Traz.</button>
                    <button onClick={()=>del(t.id)} disabled={t.conciliado||periodoCerrado||tienePagos(t)} title={tienePagos(t)?"Documento con historial de pagos":periodoCerrado?"Periodo cerrado":t.conciliado?"No se puede eliminar una transacción conciliada":"Eliminar transacción"} style={{background:t.conciliado||periodoCerrado||tienePagos(t)?C.surfaceAlt:C.dangerBg,border:"none",padding:"5px 7px",borderRadius:6,cursor:t.conciliado||periodoCerrado||tienePagos(t)?"not-allowed":"pointer",opacity:t.conciliado||periodoCerrado||tienePagos(t)?0.5:1}}><Icon name="trash" size={13} color={t.conciliado||periodoCerrado||tienePagos(t)?C.textLight:C.dangerText}/></button>
                  </TD>
                </tr>
              ))}
              {rowsVisibles.length===0&&<tr><td colSpan={11} style={{textAlign:"center",padding:"40px",color:C.textMuted}}>Sin transacciones para este filtro</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {correctionTx&&<Modal title="Corregir documento" width={640} closeDisabled={correctionBusy} onClose={()=>setCorrectionTx(null)}>
        <div style={{fontWeight:700,marginBottom:14,overflowWrap:"anywhere"}}>{correctionTx.cliente_nombre||"Sin cliente asignado"}</div>
        {correctionError&&<div role="alert" style={{marginBottom:14}}><ErrBox msg={correctionError}/><Btn variant="secondary" disabled={correctionBusy} onClick={()=>revisarCorreccion(correctionTx)}>Actualizar documento</Btn></div>}
        {!correctionRevision?correctionBusy&&<Spinner/>:<form onSubmit={guardarCorreccion}>
          <fieldset disabled={correctionBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:14}}>
              <Fld label="Fecha"><input aria-label="Fecha corregida" type="date" required value={correctionForm.fecha} onChange={e=>{setCorrectionForm({...correctionForm,fecha:e.target.value});setCorrectionConfirmed(false);}} style={inpSt}/></Fld>
              <Fld label="Categoría"><select aria-label="Categoría corregida" value={correctionForm.categoria_contable} onChange={e=>{setCorrectionForm({...correctionForm,categoria_contable:e.target.value});setCorrectionConfirmed(false);}} style={inpSt}>
                {(CATEGORIAS_CONTABLES[correctionTx.tipo]||[]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select></Fld>
            </div>
            <Fld label="Descripción"><input aria-label="Descripción corregida" required value={correctionForm.descripcion} onChange={e=>{setCorrectionForm({...correctionForm,descripcion:e.target.value});setCorrectionConfirmed(false);}} style={inpSt}/></Fld>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:14}}>
              <Fld label="Base (USD)"><input aria-label="Base corregida" type="number" min="0.01" step="0.01" required value={correctionForm.monto} onChange={e=>{setCorrectionForm({...correctionForm,monto:e.target.value,itbms:(Number(e.target.value)*Number(correctionForm.tasa_itbms||0)).toFixed(2)});setCorrectionConfirmed(false);}} style={inpSt}/></Fld>
              <Fld label="Tasa ITBMS"><select aria-label="Tasa ITBMS corregida" value={String(Number(correctionForm.tasa_itbms||0))} onChange={e=>{const [tasa,categoria]=[e.target.value,e.target.selectedOptions[0].dataset.cat];setCorrectionForm({...correctionForm,tasa_itbms:tasa,categoria_itbms:categoria,itbms:(Number(correctionForm.monto||0)*Number(tasa)).toFixed(2)});setCorrectionConfirmed(false);}} style={inpSt}>
                <option value="0" data-cat="exento">Exento 0%</option><option value="0.07" data-cat="general">General 7%</option><option value="0.1" data-cat="alcohol_hospedaje">Alcohol / hospedaje 10%</option><option value="0.15" data-cat="tabaco">Tabaco 15%</option>
              </select></Fld>
              <Fld label="ITBMS (USD)"><input aria-label="ITBMS corregido" type="number" min="0" step="0.01" required value={correctionForm.itbms} onChange={e=>{setCorrectionForm({...correctionForm,itbms:e.target.value});setCorrectionConfirmed(false);}} style={inpSt}/></Fld>
            </div>
            <Fld label="Referencia"><input aria-label="Referencia corregida" value={correctionForm.referencia} onChange={e=>{setCorrectionForm({...correctionForm,referencia:e.target.value});setCorrectionConfirmed(false);}} style={inpSt}/></Fld>
            {correctionTx.tipo==="gasto"&&<label style={{display:"flex",gap:8,marginBottom:16,fontSize:13}}><input type="checkbox" checked={correctionForm.deducible} onChange={e=>{setCorrectionForm({...correctionForm,deducible:e.target.checked});setCorrectionConfirmed(false);}}/>Deducible</label>}
            <div aria-label="Cambios propuestos" style={{marginBottom:16,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,padding:"12px 0",fontSize:12,overflowWrap:"anywhere"}}>
              {Object.keys(correctionChanges).length?Object.entries(correctionChanges).map(([field,value])=><div key={field} style={{marginBottom:6}}><strong>{correctionLabels[field]}</strong>: {String(correctionTx[field]??"Sin dato")} → {String(value)}</div>):"Sin cambios"}
            </div>
            <Fld label="Motivo de la corrección"><textarea aria-label="Motivo de la corrección" required minLength={10} maxLength={1000} rows={3} value={correctionReason} onChange={e=>{setCorrectionReason(e.target.value);setCorrectionConfirmed(false);}} style={{...inpSt,resize:"vertical"}}/></Fld>
            <label style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:13,lineHeight:1.5,marginBottom:18}}><input type="checkbox" checked={correctionConfirmed} onChange={e=>setCorrectionConfirmed(e.target.checked)} style={{marginTop:3}}/>Revisé los cambios y autorizo la corrección del documento.</label>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10,flexWrap:"wrap"}}>
              <Btn type="button" variant="secondary" onClick={()=>setCorrectionTx(null)}>Cancelar</Btn>
              <Btn type="submit" loading={correctionBusy} disabled={!correctionConfirmed||correctionReason.trim().length<10||!Object.keys(correctionChanges).length}><Icon name="check" size={16}/>Confirmar corrección</Btn>
            </div>
          </fieldset>
        </form>}
      </Modal>}

      {paymentTx&&(
        <Modal title={paymentTx.tipo==="ingreso"?"Cobros del documento":"Pagos del documento"} closeDisabled={paymentSaving} onClose={()=>{if(!paymentSaving)setPaymentTx(null);}} width={600}>
          <div style={{fontWeight:700,overflowWrap:"anywhere",marginBottom:16}}>{paymentTx.descripcion}</div>
          <div aria-label="Saldos del documento" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,130px),1fr))",gap:10,marginBottom:18}}>
            {[["Documento",totalDocumento(paymentTx)],["Pagado",paymentTx.total_pagado],["Pendiente",paymentTx.saldo_pendiente]].map(([label,value])=>(
              <div key={label}><div style={{fontSize:12,color:C.textMuted}}>{label}</div><strong style={{fontSize:14,overflowWrap:"anywhere"}}>{fmt(value)}</strong></div>
            ))}
          </div>
          {paymentError&&<div role="alert" style={{color:C.dangerText,marginBottom:14}}>{paymentError}</div>}
          {!paymentLoaded?<Btn onClick={()=>marcarPagado(paymentTx)} loading={paymentSaving}>Reintentar</Btn>:<>
            <div aria-label="Historial de pagos" style={{marginBottom:20}}>
              {(paymentTx.pagos||[]).map(p=>(
                <div key={p.id} style={{borderBottom:`1px solid ${C.border}`,padding:"12px 0",overflowWrap:"anywhere"}}>
                  <div style={{display:"flex",gap:10,justifyContent:"space-between",flexWrap:"wrap"}}>
                    <strong>{fmt(p.importe)}</strong>
                    <span style={{fontSize:12,color:C.textMuted}}>{fmtDate(p.fecha)} · {p.metodo_pago==="efectivo"?"Efectivo":p.banco}</span>
                  </div>
                  {p.metodo_pago!=="efectivo"&&<div style={{fontSize:12,color:C.textMuted}}>{bankAccountLabel(bankAccounts.find(a=>a.id===p.cuenta_bancaria_id))}</div>}
                  <div style={{fontSize:12,marginTop:5,color:C.textMuted}}>{p.referencia||"Sin referencia"} · {p.anulado_fecha?"Anulado":p.conciliado?"Conciliado":p.metodo_pago==="efectivo"?"Caja":"Sin conciliar"}</div>
                  {p.anulado_fecha?<div style={{fontSize:12,marginTop:5,color:C.dangerText}}>{fmtDate(p.anulado_fecha)} · {p.anulado_motivo}</div>:
                    <div style={{display:"flex",gap:12,marginTop:8}}>
                      {p.conciliado&&!p.legacy&&<button type="button" disabled={paymentSaving} onClick={()=>{if(confirm("¿Desvincular este pago del movimiento bancario?"))cambiarPago(p,"desconciliar");}} style={{border:0,background:"none",color:C.infoText,cursor:"pointer",padding:0,fontFamily:"inherit"}}>Desconciliar</button>}
                      {!p.conciliado&&<button type="button" disabled={paymentSaving} onClick={()=>setVoidPayment({...p,fecha:"",motivo:""})} style={{border:0,background:"none",color:C.dangerText,cursor:"pointer",padding:0,fontFamily:"inherit"}}>Anular registro</button>}
                    </div>}
                </div>
              ))}
              {!paymentTx.pagos?.length&&<div style={{fontSize:13,color:C.textMuted}}>Sin pagos registrados.</div>}
            </div>
            {voidPayment?<form onSubmit={e=>{e.preventDefault();cambiarPago(voidPayment,"anular",{fecha:voidPayment.fecha,motivo:voidPayment.motivo});}}>
              <fieldset disabled={paymentSaving} style={{border:0,padding:0,margin:0,display:"grid",gap:14,minWidth:0}}>
                <strong>Anular registro de {fmt(voidPayment.importe)}</strong>
                <label htmlFor="void-date">Fecha de anulación<input id="void-date" type="date" required min={String((paymentTx.pagos||[]).find(p=>p.id===voidPayment.id)?.fecha).slice(0,10)} value={voidPayment.fecha} onChange={e=>setVoidPayment({...voidPayment,fecha:e.target.value})} style={inpSt}/></label>
                <label htmlFor="void-reason">Motivo<textarea id="void-reason" required minLength={3} maxLength={1000} value={voidPayment.motivo} onChange={e=>setVoidPayment({...voidPayment,motivo:e.target.value})} style={{...inpSt,resize:"vertical"}}/></label>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><button type="submit" style={{...inpSt,width:"auto",background:C.danger,color:"white"}}>Confirmar anulación</button><button type="button" onClick={()=>setVoidPayment(null)} style={{...inpSt,width:"auto"}}>Cancelar</button></div>
              </fieldset>
            </form>:saldoDocumento(paymentTx)>0&&<form onSubmit={guardarPago}>
              <fieldset disabled={paymentSaving} style={{border:0,padding:0,margin:0,display:"grid",gap:14,minWidth:0}}>
                <label htmlFor="payment-amount">Importe del abono
                  <input id="payment-amount" type="number" required min="0.01" step="0.01" max={saldoDocumento(paymentTx)} value={paymentForm.importe} onChange={e=>setPaymentForm({...paymentForm,importe:e.target.value})} style={inpSt}/>
                </label>
                <label htmlFor="payment-date">Fecha del {paymentTx.tipo==="ingreso"?"cobro":"pago"}
                  <input id="payment-date" type="date" required min={String(paymentTx.fecha).slice(0,10)} value={paymentForm.fecha_pago} onChange={e=>setPaymentForm({...paymentForm,fecha_pago:e.target.value})} style={inpSt}/>
                </label>
                <div><label htmlFor="payment-method">Método de pago</label>
                  <select id="payment-method" value={paymentForm.metodo_pago} onChange={e=>setPaymentForm({...paymentForm,metodo_pago:e.target.value,cuenta_bancaria_id:"",banco:""})} style={inpSt}>
                    <option value="transferencia">Transferencia</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option>
                  </select>
                </div>
                {paymentForm.metodo_pago!=="efectivo"&&<div><label htmlFor="payment-account">Cuenta bancaria del pago</label>
                  <select id="payment-account" required value={paymentForm.cuenta_bancaria_id} onChange={e=>setPaymentForm({...paymentForm,cuenta_bancaria_id:e.target.value,banco:bankAccounts.find(a=>a.id===e.target.value)?.banco||""})} style={inpSt}>
                    <option value="">Seleccione cuenta del cliente</option>{bankAccounts.filter(a=>a.cliente_id===paymentTx.cliente_id&&a.activa).map(a=><option key={a.id} value={a.id}>{bankAccountLabel(a)}</option>)}
                  </select>
                  {paymentForm.cuenta_bancaria_id&&<div style={{fontSize:12,marginTop:6,overflowWrap:"anywhere"}}>{bankAccountLabel(bankAccounts.find(a=>a.id===paymentForm.cuenta_bancaria_id))}</div>}
                  {!bankAccounts.some(a=>a.cliente_id===paymentTx.cliente_id&&a.activa)&&<Btn type="button" variant="secondary" onClick={()=>onNavigate?.("conciliacion")}>Cuentas bancarias</Btn>}
                </div>}
                <label htmlFor="payment-reference">Referencia del pago
                  <input id="payment-reference" maxLength={200} value={paymentForm.referencia_pago} onChange={e=>setPaymentForm({...paymentForm,referencia_pago:e.target.value})} style={inpSt}/>
                </label>
                <button type="submit" style={{...inpSt,background:C.success,color:"white",fontWeight:700,cursor:paymentSaving?"wait":"pointer"}}>{paymentSaving?"Registrando...":paymentTx.tipo==="ingreso"?"Registrar cobro":"Registrar pago"}</button>
              </fieldset>
            </form>}
          </>}
        </Modal>
      )}

      {auditTx&&(
        <Modal title="Trazabilidad de transacción" onClose={()=>setAuditTx(null)} width={760}>
          <div style={{display:"grid",gridTemplateColumns:"1.2fr .8fr",gap:12,marginBottom:16}}>
            <div>
              <div style={{fontSize:12,color:C.textMuted,fontWeight:800}}>Asiento</div>
              <div style={{fontSize:15,fontWeight:800,color:C.text,marginTop:3}}>{auditTx.descripcion}</div>
              <div style={{fontSize:12,color:C.textLight,marginTop:3}}>{auditTx.cliente_nombre||"Sin cliente"} · {fmtDate(auditTx.fecha)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:C.textMuted,fontWeight:800}}>Monto</div>
              <div style={{fontSize:18,fontWeight:900,color:auditTx.tipo==="ingreso"?C.success:C.danger}}>{fmt(auditTx.monto)}</div>
              <div style={{fontSize:11,color:C.textLight}}>{auditTx.conciliado?"Conciliado":"Sin conciliar"}</div>
            </div>
          </div>
          {auditBusy?<Spinner/>:(
            <div style={{display:"grid",gap:10}}>
              {auditRows.map(ev=>(
                <div key={ev.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:12,background:C.surfaceAlt}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                    <div style={{fontWeight:900,color:C.text}}>{String(ev.accion||"evento").replaceAll("_"," ")}</div>
                    <div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{fmtDate(ev.created_at)}</div>
                  </div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:6}}>
                    {ev.accion==="borrador_ia_confirmado"&&"El borrador preparado por IA fue confirmado como registro contable."}
                    {ev.accion==="conciliacion_bancaria_confirmada"&&"El registro fue conciliado contra un movimiento bancario."}
                    {!["borrador_ia_confirmado","conciliacion_bancaria_confirmada"].includes(ev.accion)&&"Evento operativo registrado en auditoria."}
                  </div>
                  {ev.despues_json?.ajuste&&<div style={{marginTop:10,fontSize:13,overflowWrap:"anywhere"}}>
                    <strong>Motivo:</strong> {ev.despues_json.ajuste.motivo}
                    <div style={{marginTop:5,color:C.textMuted}}>Responsable: {ev.despues_json.ajuste.actor?.nombre||ev.usuario_id}</div>
                    <table aria-label="Detalle de la corrección" style={{width:"100%",tableLayout:"fixed",borderCollapse:"collapse",marginTop:12,fontSize:12}}>
                      <thead><tr>{["Campo","Antes","Después"].map(label=><th key={label} style={{textAlign:"left",padding:"8px 4px",borderBottom:`1px solid ${C.border}`}}>{label}</th>)}</tr></thead>
                      <tbody>{ev.despues_json.ajuste.campos.map(field=><tr key={field}>
                        <td style={{padding:"8px 4px"}}>{correctionLabels[field]||field}</td>
                        <td style={{padding:"8px 4px",verticalAlign:"top"}}>{String(ev.antes_json?.[field]??"Sin dato")}</td>
                        <td style={{padding:"8px 4px",verticalAlign:"top",fontWeight:600}}>{String(ev.despues_json[field]??"Sin dato")}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}
                  {ev.despues_json&&(
                    <details style={{marginTop:10,fontSize:12,color:C.textMuted}}><summary style={{cursor:"pointer"}}>Datos del registro</summary>
                    <pre style={{margin:"10px 0 0",padding:10,borderRadius:6,background:C.surface,color:C.textMuted,fontSize:11,overflow:"auto",maxHeight:150}}>
                      {JSON.stringify(ev.despues_json,null,2)}
                    </pre>
                    </details>
                  )}
                </div>
              ))}
              {auditRows.length===0&&<div style={{padding:18,textAlign:"center",color:C.textMuted,border:`1px dashed ${C.border}`,borderRadius:8}}>Esta transacción aún no tiene eventos de auditoría.</div>}
            </div>
          )}
        </Modal>
      )}

      {modal&&(
        <Modal title={form.tipo==="gasto"?"Registrar gasto":"Registrar ingreso"} closeDisabled={saving} onClose={()=>setModal(false)} width={560}>
          {newTxError&&<div role="alert" style={{color:C.danger,marginBottom:16}}>{newTxError}</div>}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={()=>setForm({...form,tipo:"ingreso",categoria_contable:categoriaDefault("ingreso"),deducible:false})} style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1px solid ${form.tipo==="ingreso"?C.success:C.border}`,background:form.tipo==="ingreso"?C.successBg:C.surface,color:form.tipo==="ingreso"?C.successText:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              Ingreso
            </button>
            <button onClick={()=>setForm({...form,tipo:"gasto",categoria_contable:categoriaDefault("gasto"),deducible:true})} style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1px solid ${form.tipo==="gasto"?C.danger:C.border}`,background:form.tipo==="gasto"?C.dangerBg:C.surface,color:form.tipo==="gasto"?C.dangerText:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              Gasto
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Fecha"><input aria-label="Fecha del documento" type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value,fecha_vencimiento:form.fecha_vencimiento||addDays(e.target.value,30)})} style={inpSt}/></Fld>
            <Fld label="Documento">
              <select value={form.tipo_documento} onChange={e=>setForm({...form,tipo_documento:e.target.value})} style={inpSt}>
                <option value="factura">Factura</option><option value="recibo">Recibo / contado</option><option value="cuenta_por_pagar">Cuenta por pagar</option>
              </select>
            </Fld>
          </div>
          <Fld label="Descripción / Concepto"><input aria-label="Concepto del documento" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} style={inpSt}/></Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Cliente">
              <select aria-label="Cliente del documento" value={form.cliente_id} onChange={e=>setForm({...form,cliente_id:e.target.value,cuenta_bancaria_id:"",banco:""})} style={inpSt}>
                <option value="">Sin cliente específico</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Fld>
            <Fld label="Categoría contable">
              <select value={form.categoria_contable} onChange={e=>setForm({...form,categoria_contable:e.target.value})} style={inpSt}>
                {CATEGORIAS_CONTABLES[form.tipo].map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Monto (USD)">
              <input aria-label="Monto del documento" type="number" value={form.monto} onChange={e=>{setForm({...form,monto:e.target.value});calcItbms(e.target.value);}} style={inpSt}/>
            </Fld>
            <Fld label="Tipo de ITBMS">
              <select aria-label="Tasa ITBMS del documento" value={form.tasa_itbms} onChange={changeTasaItbms} style={inpSt}>
                <option value="0" data-cat="exento">Exento / no gravado 0%</option>
                <option value="0.07" data-cat="general">General 7%</option>
                <option value="0.10" data-cat="alcohol_hospedaje">Alcohol u hospedaje 10%</option>
                <option value="0.15" data-cat="tabaco">Cigarrillo / tabaco 15%</option>
              </select>
            </Fld>
          </div>
          <Fld label={`ITBMS calculado (${Math.round(parseFloat(form.tasa_itbms||0)*100)}%)`}>
            <input type="number" value={form.itbms} onChange={e=>setForm({...form,itbms:e.target.value})} style={inpSt}/>
          </Fld>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
            <Fld label="Cuenta bancaria">
              <select aria-label="Cuenta del documento" disabled={form.metodo_pago==="efectivo"||!bankAccountsReady} value={form.cuenta_bancaria_id} onChange={e=>setForm({...form,cuenta_bancaria_id:e.target.value,banco:bankAccounts.find(a=>a.id===e.target.value)?.banco||""})} style={inpSt}>
                <option value="">Seleccione cuenta del cliente</option>
                {bankAccounts.filter(a=>a.cliente_id===form.cliente_id&&a.activa).map(a=><option key={a.id} value={a.id}>{bankAccountLabel(a)}</option>)}
              </select>
              {form.cuenta_bancaria_id&&<div aria-label="Cuenta seleccionada del documento" style={{fontSize:12,marginTop:6,overflowWrap:"anywhere"}}>{bankAccountLabel(bankAccounts.find(a=>a.id===form.cuenta_bancaria_id))}</div>}
            </Fld>
            <Fld label="Referencia / Cheque"><input value={form.referencia} onChange={e=>setForm({...form,referencia:e.target.value})} placeholder="CHQ-001234" style={inpSt}/></Fld>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label={form.tipo==="ingreso"?"Estado del cobro":"Estado del pago"}>
              <select aria-label="Estado del documento" value={form.estado_pago} onChange={e=>setForm({...form,estado_pago:e.target.value,fecha_pago:e.target.value==="pendiente"?"":form.fecha_pago})} style={inpSt}>
                <option value="pendiente">Pendiente</option><option value="pagado">Pagado</option>
              </select>
            </Fld>
            <Fld label={form.tipo==="ingreso"?"Fecha de cobro":"Fecha de pago"}>
              <input aria-label="Fecha del pago inicial" type="date" disabled={form.estado_pago!=="pagado"} value={form.fecha_pago} onChange={e=>setForm({...form,fecha_pago:e.target.value})} style={inpSt}/>
            </Fld>
          </div>
          <Fld label={form.tipo==="ingreso"?"Vencimiento de cobro":"Vencimiento de pago"}>
            <input type="date" value={form.fecha_vencimiento} onChange={e=>setForm({...form,fecha_vencimiento:e.target.value})} style={inpSt}/>
          </Fld>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Fld label="Método">
              <select aria-label="Método del pago inicial" value={form.metodo_pago} onChange={e=>setForm({...form,metodo_pago:e.target.value,cuenta_bancaria_id:"",banco:""})} style={inpSt}>
                <option value="transferencia">Transferencia / ACH</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option>
              </select>
            </Fld>
            <Fld label="Referencia bancaria"><input value={form.referencia_pago} onChange={e=>setForm({...form,referencia_pago:e.target.value})} placeholder="TRF-000123" style={inpSt}/></Fld>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
            <input type="checkbox" id="ded" checked={form.deducible} onChange={e=>setForm({...form,deducible:e.target.checked})} style={{width:16,height:16,accentColor:C.accent}}/>
            <label htmlFor="ded" style={{fontSize:14,color:C.textMuted,cursor:"pointer"}}>Gasto deducible (aplica ITBMS crédito fiscal)</label>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>Registrar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  CONTABILIDAD VIEW
// --------------------------------------------------------------------------
const ContabilidadView = () => {
  const { user } = useAuth();
  const currentYear = String(new Date().getFullYear());
  const currentPeriod = new Date().toISOString().slice(0,7);
  const [modo,setModo] = useState("mensual");
  const [periodo,setPeriodo] = useState(currentPeriod);
  const [anio,setAnio] = useState(currentYear);
  const [balance,setBalance] = useState(null);
  const [cierre,setCierre] = useState(null);
  const [cierreEstado,setCierreEstado] = useState(null);
  const [cierreNota,setCierreNota] = useState("");
  const [cierresPeriodo,setCierresPeriodo] = useState(null);
  const [cierresClientes,setCierresClientes] = useState(null);
  const [cartera,setCartera] = useState(null);
  const [antiguedad,setAntiguedad] = useState(null);
  const [resumenMensual,setResumenMensual] = useState(null);
  const [mayorGeneral,setMayorGeneral] = useState(null);
  const [tipoAntiguedad,setTipoAntiguedad] = useState("todos");
  const [asientos,setAsientos] = useState([]);
  const [plan,setPlan] = useState([]);
  const [clientes,setClientes] = useState([]);
  const [clienteId,setClienteId] = useState("");
  const [cuenta,setCuenta] = useState("1020");
  const [mayor,setMayor] = useState(null);
  const [busy,setBusy] = useState(true);
  const [err,setErr] = useState(null);
  const [pdfBusy,setPdfBusy] = useState("");
  const [libro,setLibro] = useState(null);
  const [revisionLibro,setRevisionLibro] = useState(null);
  const [mostrarLibro,setMostrarLibro] = useState(false);
  const [libroBusy,setLibroBusy] = useState(false);
  const [libroError,setLibroError] = useState("");
  const [libroAceptado,setLibroAceptado] = useState(false);
  const [librosEntidad,setLibrosEntidad] = useState(null);
  const [revisionFolios,setRevisionFolios] = useState(null);
  const [mostrarFolios,setMostrarFolios] = useState(false);
  const [foliosBusy,setFoliosBusy] = useState(false);
  const [foliosError,setFoliosError] = useState("");
  const [foliosAceptados,setFoliosAceptados] = useState(false);

  const queryPeriodo = `${modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`}${clienteId?`&cliente_id=${clienteId}`:""}`;
  const anioResumen = modo === "mensual" ? periodo.slice(0,4) : anio;
  const queryResumen = `anio=${anioResumen}${clienteId?`&cliente_id=${clienteId}`:""}`;
  const mesNombre = periodo => new Date(`${periodo}-01T00:00:00`).toLocaleDateString("es-PA",{month:"short"}).replace(".","");

  const loadAbort = useRef(null);
  const loadEpoch = useRef(0);
  const load = useCallback(async()=>{
    loadAbort.current?.abort();
    const controller = new AbortController(); loadAbort.current = controller;
    const epoch = ++loadEpoch.current;
    const get = path => api.get(path, { signal: controller.signal });
    setBusy(true); setErr(null);
    try{
      const [bal,asi,pc,cl,ci,ce,cp,cc,ca,ag,rm,mg,lb,le] = await Promise.all([
        get(`/api/contabilidad/balance-comprobacion?${queryPeriodo}`),
        get(`/api/contabilidad/asientos?${queryPeriodo}`),
        get("/api/contabilidad/plan-cuentas"),
        get("/api/clientes"),
        get(`/api/contabilidad/cierre?${queryPeriodo}`),
        get(`/api/contabilidad/cierre-estado?${queryPeriodo}`),
        get(`/api/contabilidad/cierres-periodo?anio=${anioResumen}${clienteId?`&cliente_id=${clienteId}`:""}`),
        get(`/api/contabilidad/cierres-clientes?${modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`}`),
        get(`/api/contabilidad/cartera?${modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`}`),
        get(`/api/contabilidad/antiguedad?${queryPeriodo}&tipo=${tipoAntiguedad}`),
        get(`/api/contabilidad/resumen-mensual?${queryResumen}`),
        get(`/api/contabilidad/mayor-general?${queryPeriodo}`),
        get("/api/contabilidad/libro").catch(error => {
          if (error.status === 404) return { estado: "servidor_pendiente" };
          throw error;
        }),
        get("/api/contabilidad/libros-entidad").catch(error => {
          if (error.status === 404) return { estado: "servidor_pendiente", data: [] };
          throw error;
        }),
      ]);
      if (epoch !== loadEpoch.current || controller.signal.aborted) return;
      setBalance(bal);
      setAsientos(asi.data||[]);
      setPlan(pc.data||[]);
      setClientes(cl.data||[]);
      setCierre(ci);
      setCierreEstado(ce.data||null);
      setCierreNota(ce.data?.nota||"");
      setCierresPeriodo(cp);
      setCierresClientes(cc);
      setCartera(ca);
      setAntiguedad(ag);
      setResumenMensual(rm);
      setMayorGeneral(mg);
      setLibro(lb);
      setLibrosEntidad(le);
      const selected = cuenta || pc.data?.[0]?.codigo || "1020";
      setCuenta(selected);
      const my = await get(`/api/contabilidad/mayor/${selected}?${queryPeriodo}`);
      if (epoch === loadEpoch.current && !controller.signal.aborted) setMayor(my);
    }catch(e){if (epoch === loadEpoch.current && !controller.signal.aborted) setErr(e.message);}
    finally{if (epoch === loadEpoch.current && !controller.signal.aborted) setBusy(false);}
  },[queryPeriodo,queryResumen,cuenta,tipoAntiguedad]);

  useEffect(()=>{load();return()=>loadAbort.current?.abort();},[load]);

  const cargarMayor = async codigo => {
    setCuenta(codigo);
    try{
      const my = await api.get(`/api/contabilidad/mayor/${codigo}?${queryPeriodo}`);
      setMayor(my);
    }catch(e){setErr(e.message);}
  };

  const exportarAsientos = () => {
    const headers = ["numero","asiento_id","origen","revision","rectifica_id","fecha","periodo","asiento","cliente","cuenta_codigo","cuenta_nombre","descripcion","debe","haber","tipo_asiento","conciliado","motivo","libro_entidad_id","folio_cliente","folio_original","serie_provisional"];
    const lines = asientos.flatMap(a => a.lineas.map(l => [
      a.numero||"",a.id,a.origen||"preparacion",a.revision||"",a.rectifica_id||"",
      a.fecha,a.periodo,a.descripcion,a.cliente_nombre,l.cuenta_codigo,l.cuenta_nombre,l.descripcion,l.debe,l.haber,a.tipo_asiento,a.conciliado?"si":"no",a.motivo||"",
      a.libro_entidad_id||"",a.numero_libro||"",a.rectifica_numero_libro||"",a.libro_provisional?"si":"no"
    ].map(csvCell).join(",")));
    downloadText(`contabilidad-${modo==="mensual"?periodo:anio}.csv`, [headers.map(csvCell).join(","), ...lines].join("\n"));
  };
  const exportarMayorGeneral = () => {
    const headers = ["cuenta_codigo","cuenta_nombre","fecha","periodo","cliente","descripcion","debe","haber","saldo_acumulado","tipo_asiento","conciliado"];
    const lines = (mayorGeneral?.data||[]).flatMap(cuenta =>
      [
        [cuenta.cuenta_codigo, cuenta.cuenta_nombre, mayorGeneral.desde || "", "", "", "Saldo inicial", 0, 0, cuenta.saldo_inicial, "apertura", ""].map(csvCell).join(","),
        ...(cuenta.movimientos||[]).map(m => [
        cuenta.cuenta_codigo, cuenta.cuenta_nombre, m.fecha, m.periodo, m.cliente_nombre || "",
        m.descripcion_linea || m.descripcion_asiento || "", m.debe, m.haber, m.saldo, m.tipo_asiento || "", m.conciliado ? "si" : "no"
      ].map(csvCell).join(","))]
    );
    downloadText(`mayor-general-${modo==="mensual"?periodo:anio}.csv`, [headers.map(csvCell).join(","), ...lines].join("\n"));
  };
  const exportarCartera = () => {
    const headers = ["cliente","ruc","tipo","estado","movimientos","ingresos","gastos","utilidad","margen_pct","itbms_neto","por_cobrar","por_pagar","pagadas","conciliadas","pagadas_sin_conciliar","cierre_formal","cierre_alcance","riesgo","estado_cierre","pendiente_principal"];
    const lines = (cartera?.data||[]).map(row => [
      row.cliente_nombre,row.ruc,row.tipo_persona,row.estado_cliente,row.total_transacciones,
      row.total_ingresos,row.total_gastos,row.utilidad,row.margen ?? "",row.itbms_neto,
      row.cuentas_por_cobrar,row.cuentas_por_pagar,row.pagadas_count,row.conciliadas_count,row.pagadas_sin_conciliar,
      row.cierre_estado || "abierto",row.cierre_alcance || "",row.riesgo,row.listo_para_cierre ? "listo" : "pendiente",row.principal_pendiente,
    ].map(csvCell).join(","));
    downloadText(`cartera-contable-${modo==="mensual"?periodo:anio}.csv`, [headers.map(csvCell).join(","), ...lines].join("\n"));
  };

  const descargarPDF = async tipo => {
    setPdfBusy(tipo);
    try{
      const base = modo === "mensual" ? `periodo=${periodo}` : `anio=${anio}`;
      const scopedBase = `${base}${clienteId?`&cliente_id=${clienteId}`:""}`;
      let path = "";
      if(tipo==="resumen") path = `/api/reportes/resumen-mensual?${queryResumen}`;
      if(tipo==="libro") path = `/api/reportes/libro-diario?${scopedBase}`;
      if(tipo==="balance") path = `/api/reportes/balance-comprobacion?${scopedBase}`;
      if(tipo==="mayor") path = `/api/reportes/mayor/${cuenta}?${scopedBase}`;
      if(tipo==="mayorGeneral") path = `/api/reportes/mayor-general?${scopedBase}`;
      if(tipo==="cierre") path = `/api/reportes/cierre?${scopedBase}`;
      if(tipo==="clientes") path = `/api/reportes/cierres-clientes?${base}`;
      if(tipo==="antiguedad") path = `/api/reportes/antiguedad?${scopedBase}&tipo=${tipoAntiguedad}`;
      await api.pdf(path, tipo==="libro"?`libro-diario-${modo==="mensual"?periodo:anio}-${clienteId?"cliente":"cartera"}.pdf`:undefined);
    }catch(e){alert("Error generando PDF: "+e.message);}
    finally{setPdfBusy("");}
  };
  const guardarCierreEstado = async estado => {
    try {
      const r = await api.put(`/api/contabilidad/cierre-estado?${queryPeriodo}`, { estado, nota: cierreNota });
      setCierreEstado(r.data);
      await load();
    } catch(e) {
      alert(e.message);
    }
  };
  const abrirRevisionLibro = async () => {
    setMostrarLibro(true); setLibroBusy(true); setLibroError(""); setLibroAceptado(false);
    try {
      const next = await api.get("/api/contabilidad/libro");
      setLibro(next);
      setRevisionLibro(next.revision || null);
      if (next.estado === "incorporado") { setMostrarLibro(false); await load(); }
    } catch (e) { setLibroError(e.message); }
    finally { setLibroBusy(false); }
  };
  const incorporarLibro = async () => {
    if (!libroAceptado || !revisionLibro?.puede_incorporar || libroBusy) return;
    setLibroBusy(true); setLibroError("");
    try {
      const next = await api.post("/api/contabilidad/libro/incorporar", {
        fingerprint: revisionLibro.fingerprint, confirmacion: "INCORPORAR LIBRO",
      });
      setLibro(next); setMostrarLibro(false); setLibroAceptado(false);
      await load();
    } catch (e) { setLibroError(e.message); setLibroAceptado(false); }
    finally { setLibroBusy(false); }
  };
  const numeroAsiento = value => String(value).padStart(6, "0");
  const revisarFolios = async () => {
    setMostrarFolios(true);setFoliosBusy(true);setFoliosError("");setFoliosAceptados(false);setRevisionFolios(null);
    try { setRevisionFolios(await api.get("/api/contabilidad/libros-entidad")); }
    catch(error) { setFoliosError(error.message); }
    finally { setFoliosBusy(false); }
  };
  const incorporarFolios = async () => {
    if(!foliosAceptados||!revisionFolios?.pendientes||foliosBusy)return;
    setFoliosBusy(true);setFoliosError("");
    try {
      await api.post("/api/contabilidad/libros-entidad/incorporar",{fingerprint:revisionFolios.fingerprint,confirmacion:"ASIGNAR LIBROS POR CLIENTE"});
      setMostrarFolios(false);await load();
    } catch(error) { setFoliosError(error.message);setFoliosAceptados(false); }
    finally { setFoliosBusy(false); }
  };
  const tipoAsiento = value => ({
    documento: "Documento", cobro: "Cobro", pago: "Pago", reversa_cobro: "Anulación de cobro",
    reversa_pago: "Anulación de pago", reversa_ajuste: "Corrección",
  }[value] || value);
  const cierreFormalBadge = estado => {
    const styles = {
      cerrado: [C.successBg, C.successText, "Cerrado"],
      en_revision: [C.infoBg, C.infoText, "En revisión"],
      abierto: [C.surfaceAlt, C.textMuted, "Abierto"],
    }[estado || "abierto"] || [C.surfaceAlt, C.textMuted, "Abierto"];
    return <span style={{background:styles[0],color:styles[1],padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase",whiteSpace:"nowrap"}}>{styles[2]}</span>;
  };

  return (
    <div className="contabilidad-view">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",marginBottom:28,gap:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>Contabilidad</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Partida doble, mayor y balance de comprobación</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
            {["mensual","anual"].map(m=>(
              <button key={m} onClick={()=>setModo(m)} style={{padding:"9px 14px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {m==="mensual"?"Mensual":"Anual"}
              </button>
            ))}
          </div>
          {modo==="mensual"?(
            <input type="month" aria-label="Periodo contable" value={periodo} onInput={e=>setPeriodo(e.target.value)} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:200}}/>
          ):(
            <input aria-label="Año contable" value={anio} onInput={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} onChange={e=>setAnio(e.target.value.replace(/\D/g,"").slice(0,4))} style={{...inpSt,width:105}}/>
          )}
          <select aria-label="Cliente contable" value={clienteId} onChange={e=>setClienteId(e.target.value)} style={{...inpSt,width:230}}>
            <option value="">Toda la cartera</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Btn variant="secondary" onClick={load}><Icon name="refresh" size={16}/>Actualizar</Btn>
          <Btn variant="secondary" onClick={exportarAsientos}><Icon name="report" size={16}/>CSV</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("libro")} loading={pdfBusy==="libro"} disabled={busy||libro?.estado!=="incorporado"||librosEntidad?.estado!=="asignado"}
            title={libro?.estado==="incorporado"?"Libro publicado del periodo y cliente seleccionados":"Requiere el libro incorporado en el servidor"}><Icon name="pdf" size={16}/>PDF libro diario</Btn>
          <Btn variant="secondary" onClick={exportarMayorGeneral}><Icon name="report" size={16}/>CSV mayor</Btn>
          <Btn variant="secondary" onClick={exportarCartera} disabled={!cartera?.data?.length}><Icon name="users" size={16}/>CSV cartera</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("resumen")} loading={pdfBusy==="resumen"}><Icon name="pdf" size={16}/>PDF 12 meses</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("cierre")} loading={pdfBusy==="cierre"}><Icon name="pdf" size={16}/>PDF cierre</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("clientes")} loading={pdfBusy==="clientes"}><Icon name="pdf" size={16}/>PDF clientes</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("balance")} loading={pdfBusy==="balance"}><Icon name="pdf" size={16}/>PDF balance</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("mayorGeneral")} loading={pdfBusy==="mayorGeneral"}><Icon name="pdf" size={16}/>PDF mayor general</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("mayor")} loading={pdfBusy==="mayor"}><Icon name="pdf" size={16}/>PDF mayor</Btn>
          <Btn variant="secondary" onClick={()=>descargarPDF("antiguedad")} loading={pdfBusy==="antiguedad"}><Icon name="pdf" size={16}/>PDF antigüedad</Btn>
        </div>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      <LedgerConsistency api={api} query={queryPeriodo} refresh={busy} book={libro} clientName={clientes.find(c=>c.id===clienteId)?.nombre} period={modo==="mensual"?periodo:anio} C={C} Icon={Icon}/>
      {libro&&<section aria-label="Estado del libro contable" style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,padding:"14px 0",marginBottom:16,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,alignItems:"center",minWidth:0}}>
          <Icon name={libro.estado==="incorporado"?"check":"journal"} size={20}/>
          <div>
            <div style={{fontWeight:700,color:libro.estado==="incorporado"?C.successText:C.warningText}}>
              {libro.estado==="incorporado"?"Libro incorporado":libro.estado==="servidor_pendiente"?"Actualización del servidor pendiente":"Libro pendiente de incorporación"}
            </div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>
              {libro.estado==="incorporado"?`${libro.total_asientos} asientos publicados · Toda la cartera`:"Historial en preparación"}
            </div>
          </div>
        </div>
        {libro.estado==="pendiente_revision"&&["admin","contador"].includes(user?.rol)&&
          <Btn variant="secondary" onClick={abrirRevisionLibro}><Icon name="journal" size={16}/>Revisar libro</Btn>}
      </section>}
      {libro?.estado==="incorporado"&&librosEntidad&&<section aria-label="Libros por cliente" style={{marginBottom:20,borderBottom:`1px solid ${C.border}`,paddingBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{fontSize:13,color:C.textMuted}}>{librosEntidad.estado==="servidor_pendiente"?"Numeración por cliente: servidor pendiente":librosEntidad.pendientes?`${librosEntidad.pendientes} asientos pendientes de folio por cliente`:`${librosEntidad.total_libros} libros separados por cliente`}</div>
          {librosEntidad.estado==="pendiente_revision"&&["admin","contador"].includes(user?.rol)&&<Btn variant="secondary" onClick={revisarFolios}><Icon name="journal" size={16}/>Revisar folios</Btn>}
        </div>
        <details style={{marginTop:12}}>
          <summary style={{cursor:"pointer",fontWeight:700,fontSize:14}}>Libros por cliente</summary>
          <div style={{overflowX:"auto",maxHeight:320,marginTop:10}}>
            <table aria-label="Libros separados por cliente" style={{width:"100%",minWidth:620,borderCollapse:"collapse",fontSize:12}}>
              <thead><tr><TH>Cliente</TH><TH>Libro</TH><TH right>Asientos</TH><TH right>Último folio</TH><TH/></tr></thead>
              <tbody>{(librosEntidad.data||[]).map(entity=><tr key={entity.cliente_id||"provisional"}>
                <TD>{entity.cliente_nombre}{entity.provisional&&<div style={{color:C.warningText}}>Serie provisional</div>}</TD>
                <TD style={{fontSize:11,fontFamily:"JetBrains Mono,monospace"}}>{entity.libro_entidad_id||"Pendiente"}</TD>
                <TD style={{textAlign:"right"}}>{entity.asientos}</TD><TD style={{textAlign:"right"}}>{entity.ultimo_folio?numeroAsiento(entity.ultimo_folio):"-"}</TD>
                <TD>{entity.cliente_id&&<Btn variant="secondary" onClick={()=>setClienteId(entity.cliente_id)} aria-label={`Ver libro de ${entity.cliente_nombre}`}><Icon name="journal" size={14}/></Btn>}</TD>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>}
      {mostrarFolios&&<Modal title="Revisión de folios por cliente" width={700} closeDisabled={foliosBusy} onClose={()=>setMostrarFolios(false)}>
        {foliosError&&<div role="alert"><ErrBox msg={foliosError} onRetry={revisarFolios}/></div>}
        {foliosBusy&&!revisionFolios?<Spinner/>:revisionFolios&&<>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Asientos por asignar: {revisionFolios.pendientes}</div>
          <table aria-label="Asignación de folios por cliente" style={{width:"100%",tableLayout:"fixed",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr><th style={{textAlign:"left",padding:8}}>Cliente</th><th style={{width:95,padding:8,textAlign:"right"}}>Pendientes</th></tr></thead>
            <tbody>{revisionFolios.data.map(entity=><tr key={entity.cliente_id||"provisional"}>
              <td style={{padding:8,overflowWrap:"anywhere",borderTop:`1px solid ${C.border}`}}>{entity.cliente_nombre}{entity.provisional&&" (serie provisional)"}</td>
              <td style={{padding:8,textAlign:"right",borderTop:`1px solid ${C.border}`}}>{entity.pendientes}</td>
            </tr>)}</tbody>
          </table>
          <label style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:13,lineHeight:1.5,margin:"20px 0"}}>
            <input type="checkbox" checked={foliosAceptados} disabled={foliosBusy||!revisionFolios.pendientes} onChange={event=>setFoliosAceptados(event.target.checked)} style={{marginTop:4}}/>
            Revisé la separación por cliente y autorizo asignar los folios sin alterar los asientos originales.
          </label>
          <div style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:10}}>
            <Btn variant="secondary" disabled={foliosBusy} onClick={()=>setMostrarFolios(false)}>Cancelar</Btn>
            <Btn loading={foliosBusy} disabled={!foliosAceptados||!revisionFolios.pendientes} onClick={incorporarFolios}><Icon name="check" size={16}/>Confirmar folios</Btn>
          </div>
        </>}
      </Modal>}
      {mostrarLibro&&<Modal title="Revisión del libro contable" width={760} closeDisabled={libroBusy} onClose={()=>setMostrarLibro(false)}>
        {libroError&&<div role="alert" style={{marginBottom:16}}><ErrBox msg={libroError} onRetry={abrirRevisionLibro}/></div>}
        {libroBusy&&!revisionLibro?<Spinner/>:revisionLibro&&<>
          <dl style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:18,margin:"0 0 24px"}}>
            {[
              ["Alcance","Toda la cartera"],
              ["Documentos",revisionLibro.documentos],
              ["Asientos",revisionLibro.asientos],
              ["Desde",revisionLibro.desde?fmtDate(revisionLibro.desde):"Sin registros"],
              ["Hasta",revisionLibro.hasta?fmtDate(revisionLibro.hasta):"Sin registros"],
              ["Debe",fmt(revisionLibro.total_debe)],
              ["Haber",fmt(revisionLibro.total_haber)],
              ["Estado",revisionLibro.balanceado?"Balanceado":"Desbalanceado"],
            ].map(([label,value])=><div key={label}><dt style={{fontSize:12,color:C.textMuted,marginBottom:5}}>{label}</dt><dd style={{margin:0,fontWeight:700,fontSize:14,overflowWrap:"anywhere"}}>{value}</dd></div>)}
          </dl>
          <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Saldos por cuenta</div>
          <div style={{maxHeight:"min(280px, 23vh)",overflowY:"auto",borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}} aria-label="Saldos de incorporación">
              <thead><tr><th style={{textAlign:"left",padding:"10px 0",fontSize:12}}>Cuenta</th><th style={{width:115,textAlign:"right",padding:"10px 0",fontSize:12}}>Saldo</th></tr></thead>
              <tbody>{revisionLibro.cuentas.map(c=><tr key={c.cuenta_codigo}>
                <td style={{padding:"9px 8px 9px 0",fontSize:12,overflowWrap:"anywhere",borderTop:`1px solid ${C.border}`}}><strong>{c.cuenta_codigo}</strong> {c.cuenta_nombre}</td>
                <td style={{padding:"9px 0",textAlign:"right",fontSize:12,fontVariantNumeric:"tabular-nums",borderTop:`1px solid ${C.border}`}}>{fmt(c.saldo)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {revisionLibro.errores?.length>0&&<ul role="alert" style={{fontSize:13,color:C.dangerText,paddingLeft:18}}>{revisionLibro.errores.map((message,i)=><li key={i}>{message}</li>)}</ul>}
          <label style={{display:"flex",alignItems:"flex-start",gap:10,margin:"16px 0",fontSize:13,lineHeight:1.5}}>
            <input type="checkbox" checked={libroAceptado} disabled={libroBusy||!revisionLibro.puede_incorporar} onChange={e=>setLibroAceptado(e.target.checked)} style={{marginTop:4,flexShrink:0}}/>
            Revisé los saldos de toda la cartera y autorizo incorporar este historial.
          </label>
          <div style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:10}}>
            <Btn variant="secondary" disabled={libroBusy} onClick={()=>setMostrarLibro(false)}>Cancelar</Btn>
            <Btn onClick={incorporarLibro} loading={libroBusy} disabled={libroBusy||!libroAceptado||!revisionLibro.puede_incorporar}><Icon name="check" size={16}/>Confirmar incorporación</Btn>
          </div>
        </>}
      </Modal>}
      {busy?<Spinner/>:(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
            <KpiCard label="Asientos" value={balance?.total_asientos||0} icon="journal" color={C.accent}/>
            <KpiCard label="Debe" value={fmt(balance?.total_debe)} icon="dollar" color={C.success}/>
            <KpiCard label="Haber" value={fmt(balance?.total_haber)} icon="dollar" color={C.info}/>
            <KpiCard label="Diferencia" value={fmt(balance?.diferencia)} icon="check" color={balance?.balanceado?C.success:C.danger}/>
          </div>

          {!balance?.balanceado&&(
            <ErrBox msg="El balance no cuadra. Revisa transacciones con ITBMS, pagos o categorías incompletas."/>
          )}

          {resumenMensual&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Resumen 12 meses</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    {resumenMensual.meses_con_movimiento} mes(es) con movimiento, {resumenMensual.meses_pendientes} pendiente(s), {resumenMensual.meses_riesgo_alto} de alto riesgo, {resumenMensual.cierres_formales?.cerrados || 0} cerrado(s)
                  </div>
                </div>
                <div style={{display:"flex",gap:14,alignItems:"center",fontSize:12,color:C.textMuted,fontWeight:800,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <span>Ingresos {fmt(resumenMensual.totales?.ingresos)}</span>
                  <span>Gastos {fmt(resumenMensual.totales?.gastos)}</span>
                  <span>Utilidad {fmt(resumenMensual.totales?.utilidad)}</span>
                  <span>ITBMS neto {fmt(resumenMensual.totales?.itbms_neto)}</span>
                </div>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Mes</TH><TH right>Ingresos</TH><TH right>Gastos</TH><TH right>Utilidad</TH><TH right>ITBMS neto</TH><TH right>CxC</TH><TH right>CxP</TH><TH>Cierre formal</TH><TH>Estado</TH><TH>Pendiente principal</TH>
                </tr></thead>
                <tbody>
                  {(resumenMensual.data||[]).map((row,i)=>{
                    const riskStyle = row.riesgo==="critico"
                      ? [C.dangerBg,C.dangerText]
                      : row.riesgo==="alto"
                        ? [C.warningBg,C.warningText]
                        : row.riesgo==="medio"
                          ? [C.infoBg,C.infoText]
                          : [C.successBg,C.successText];
                    return (
                      <tr key={row.periodo} onClick={()=>{setModo("mensual"); setPeriodo(row.periodo);}} style={{background:row.periodo===periodo?C.infoBg:(i%2?C.surfaceAlt:C.surface),cursor:"pointer"}}>
                        <TD>
                          <div style={{fontWeight:900,textTransform:"capitalize"}}>{mesNombre(row.periodo)}</div>
                          <div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace",marginTop:2}}>{row.periodo}</div>
                        </TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.ingresos)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.gastos)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:900,color:row.utilidad<0?C.dangerText:C.text}}>{fmt(row.utilidad)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.itbms_neto<0?C.successText:C.text}}>{fmt(row.itbms_neto)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.cuentas_por_cobrar?C.warningText:C.textMuted}}>{fmt(row.cuentas_por_cobrar)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.cuentas_por_pagar?C.dangerText:C.textMuted}}>{fmt(row.cuentas_por_pagar)}</TD>
                        <TD>{cierreFormalBadge(row.cierre_estado)}</TD>
                        <TD>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{background:row.listo_para_cierre?C.successBg:C.warningBg,color:row.listo_para_cierre?C.successText:C.warningText,padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.listo_para_cierre?"Listo":"Pendiente"}</span>
                            <span style={{background:riskStyle[0],color:riskStyle[1],padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.riesgo}</span>
                          </div>
                        </TD>
                        <TD style={{fontSize:12,color:C.textMuted,maxWidth:220}}>{row.principal_pendiente}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {cierre&&(
            <Card style={{marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{fontSize:16,fontWeight:900,color:C.text}}>Revisión de cierre</div>
                  <div style={{fontSize:13,color:C.textMuted,marginTop:3}}>
                    {cierre.listo_para_cierre ? "Periodo listo para revisión final CPA." : "Hay puntos pendientes antes de cerrar el periodo."}
                  </div>
                </div>
                <span style={{padding:"5px 12px",borderRadius:99,fontSize:12,fontWeight:900,textTransform:"uppercase",background:cierre.listo_para_cierre?C.successBg:C.warningBg,color:cierre.listo_para_cierre?C.successText:C.warningText}}>
                  Riesgo {cierre.riesgo}
                </span>
              </div>
              <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:16,display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:C.textMuted,textTransform:"uppercase",marginBottom:6}}>Estado formal del periodo</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
                    <span style={{background:cierreEstado?.estado==="cerrado"?C.successBg:C.infoBg,color:cierreEstado?.estado==="cerrado"?C.successText:C.infoText,padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>
                      {cierreEstado?.estado==="cerrado"?"Cerrado":"En revisión"}
                    </span>
                    {cierreEstado?.cerrado_at&&<span style={{fontSize:11,color:C.textLight}}>Cerrado {fmtDate(cierreEstado.cerrado_at)}</span>}
                  </div>
                  <input value={cierreNota} onChange={e=>setCierreNota(e.target.value)} placeholder="Nota de revisión CPA del periodo" style={inpSt}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
                  <Btn variant="secondary" onClick={()=>guardarCierreEstado("en_revision")} disabled={!["admin","contador"].includes(user?.rol)}><Icon name="lock" size={15}/>En revisión</Btn>
                  <Btn variant="success" onClick={()=>guardarCierreEstado("cerrado")} disabled={!cierre.listo_para_cierre||!["admin","contador"].includes(user?.rol)}><Icon name="check" size={15} color="#fff"/>Cerrar</Btn>
                </div>
              </div>
              {cierre.control_bancario&&<div role="status" style={{padding:"10px 0",marginBottom:12,borderBottom:`1px solid ${C.border}`,fontSize:13,lineHeight:1.6,color:C.textMuted}}>
                <strong style={{color:C.text}}>Control bancario al {fmtDate(cierre.control_bancario.fecha_corte)}</strong>
                <div>{cierre.control_bancario.pagos_pendientes} pagos sin vínculo · {cierre.control_bancario.movimientos_pendientes} movimientos bancarios sin respaldo · {cierre.control_bancario.pendientes_anteriores} pendientes anteriores</div>
                <div>Saldos inicial y final del extracto: sin verificar.</div>
              </div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:16}}>
                <div style={{background:C.surfaceAlt,borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.textMuted,textTransform:"uppercase"}}>Por cobrar</div>
                  <div style={{fontSize:18,fontWeight:900,color:C.text,marginTop:4}}>{fmt(cierre.cuentas_por_cobrar)}</div>
                </div>
                <div style={{background:C.surfaceAlt,borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.textMuted,textTransform:"uppercase"}}>Por pagar</div>
                  <div style={{fontSize:18,fontWeight:900,color:C.text,marginTop:4}}>{fmt(cierre.cuentas_por_pagar)}</div>
                </div>
                <div style={{background:C.surfaceAlt,borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.textMuted,textTransform:"uppercase"}}>Sin conciliar</div>
                  <div style={{fontSize:18,fontWeight:900,color:cierre.pagados_sin_conciliar?C.dangerText:C.successText,marginTop:4}}>{cierre.pagados_sin_conciliar}</div>
                </div>
                <div style={{background:C.surfaceAlt,borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.textMuted,textTransform:"uppercase"}}>ITBMS neto</div>
                  <div style={{fontSize:18,fontWeight:900,color:C.text,marginTop:4}}>{fmt(cierre.itbms_neto)}</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:C.textMuted,textTransform:"uppercase",marginBottom:8}}>Checklist CPA</div>
                  <div style={{display:"grid",gap:7}}>
                    {cierre.checklist.map(item=>(
                      <div key={item.item} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:item.ok?C.successText:C.warningText}}>
                        <Icon name={item.ok?"check":"bell"} size={15} color={item.ok?C.success:C.warning}/>
                        <span>{item.item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:900,color:C.textMuted,textTransform:"uppercase",marginBottom:8}}>Hallazgos</div>
                  <div style={{display:"grid",gap:8}}>
                    {(cierre.issues||[]).map(issue=>(
                      <div key={issue.codigo} style={{border:`1px solid ${issue.severidad==="critica"?C.danger:C.warning}44`,borderLeft:`4px solid ${issue.severidad==="critica"?C.danger:C.warning}`,borderRadius:8,padding:"9px 10px",background:issue.severidad==="critica"?C.dangerBg:C.warningBg}}>
                        <div style={{fontSize:13,fontWeight:900,color:C.text}}>{issue.titulo}</div>
                        <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{issue.detalle}</div>
                      </div>
                    ))}
                    {(!cierre.issues||cierre.issues.length===0)&&<div style={{fontSize:13,color:C.successText,fontWeight:700}}>Sin hallazgos críticos del cierre.</div>}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {cierresPeriodo&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Registro formal de cierres</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    {cierresPeriodo.total} registro(s), {cierresPeriodo.cerrados} cerrado(s), {cierresPeriodo.en_revision} en revisión
                  </div>
                </div>
                <span style={{fontSize:12,color:C.textMuted,fontWeight:800}}>Año {anioResumen}</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Periodo</TH><TH>Cliente</TH><TH>Estado</TH><TH>Fecha cierre</TH><TH>Nota CPA</TH>
                </tr></thead>
                <tbody>
                  {(cierresPeriodo.data||[]).map((row,i)=>(
                    <tr key={row.id} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD>
                        <div style={{fontWeight:900}}>{row.alcance==="anual"?`Año ${row.anio}`:row.periodo}</div>
                        <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",marginTop:2}}>{row.alcance}</div>
                      </TD>
                      <TD>
                        <div style={{fontSize:13,fontWeight:800,color:C.text}}>{row.cliente_nombre||"Toda la cartera"}</div>
                        <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{row.cliente_ruc||"Cierre global"}</div>
                      </TD>
                      <TD>{cierreFormalBadge(row.estado)}</TD>
                      <TD style={{fontSize:12,color:C.textMuted}}>{row.cerrado_at?fmtDate(row.cerrado_at):"-"}</TD>
                      <TD style={{fontSize:12,color:C.textMuted,maxWidth:360}}>{row.nota||"-"}</TD>
                    </tr>
                  ))}
                  {(!cierresPeriodo.data||cierresPeriodo.data.length===0)&&(
                    <tr><td colSpan={5} style={{padding:"28px 12px",textAlign:"center",color:C.textMuted}}>Todavía no hay cierres formales registrados para este año.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {cartera&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Cartera contable mensual/anual</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    {cartera.clientes_con_movimiento} cliente(s) con movimiento, {cartera.pendientes} pendiente(s), {cartera.pagadas_sin_conciliar} pago(s) sin conciliar, {cartera.cierres_formales?.cerrados || 0} cerrado(s)
                  </div>
                </div>
                <div style={{display:"flex",gap:12,alignItems:"center",fontSize:12,color:C.textMuted,fontWeight:800,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <span>Ingresos {fmt(cartera.total_ingresos)}</span>
                  <span>Gastos {fmt(cartera.total_gastos)}</span>
                  <span>Utilidad {fmt(cartera.utilidad)}</span>
                  <span>ITBMS {fmt(cartera.itbms_neto)}</span>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:1180}}>
                  <thead><tr style={{background:C.surfaceAlt}}>
                    <TH>Cliente</TH><TH>Tipo</TH><TH right>Movs.</TH><TH right>Ingresos</TH><TH right>Gastos</TH><TH right>Utilidad</TH>
                    <TH right>ITBMS</TH><TH right>CxC</TH><TH right>CxP</TH><TH right>Conc.</TH><TH>Cierre formal</TH><TH>Riesgo</TH><TH>Pendiente</TH>
                  </tr></thead>
                  <tbody>
                    {(cartera.data||[]).map((row,i)=>{
                      const riskStyle = row.riesgo==="critico"
                        ? [C.dangerBg,C.dangerText]
                        : row.riesgo==="alto"
                          ? [C.warningBg,C.warningText]
                          : row.riesgo==="medio"
                            ? [C.infoBg,C.infoText]
                            : [C.successBg,C.successText];
                      const conciliarColor = row.pagadas_sin_conciliar ? C.dangerText : C.successText;
                      return (
                        <tr key={row.cliente_id||row.cliente_nombre} style={{background:i%2?C.surfaceAlt:C.surface}}>
                          <TD>
                            <div style={{fontWeight:900}}>{row.cliente_nombre}</div>
                            <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{row.ruc||"-"} - {row.actividad||"sin actividad"}</div>
                          </TD>
                          <TD>
                            <div style={{fontSize:12,color:C.textMuted}}>{row.tipo_persona||"sin tipo"}</div>
                            <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{row.estado_cliente||"sin estado"}</div>
                          </TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:800}}>{row.total_transacciones}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:C.successText}}>{fmt(row.total_ingresos)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:C.dangerText}}>{fmt(row.total_gastos)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:900,color:row.utilidad<0?C.dangerText:C.text}}>{fmt(row.utilidad)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.itbms_neto<0?C.successText:C.warningText}}>{fmt(row.itbms_neto)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.cuentas_por_cobrar?C.warningText:C.textMuted}}>{fmt(row.cuentas_por_cobrar)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.cuentas_por_pagar?C.dangerText:C.textMuted}}>{fmt(row.cuentas_por_pagar)}</TD>
                          <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:900,color:conciliarColor}}>{row.conciliadas_count}/{row.pagadas_count}</TD>
                          <TD>{cierreFormalBadge(row.cierre_estado)}</TD>
                          <TD>
                            <span style={{background:riskStyle[0],color:riskStyle[1],padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.riesgo}</span>
                          </TD>
                          <TD style={{fontSize:12,color:C.textMuted,maxWidth:190}}>{row.principal_pendiente}</TD>
                        </tr>
                      );
                    })}
                    {(!cartera.data||cartera.data.length===0)&&(
                      <tr><td colSpan={13} style={{padding:"28px 12px",textAlign:"center",color:C.textMuted}}>No hay clientes para este alcance.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {cierresClientes&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Cierre por cliente</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    {cierresClientes.listos} listo(s), {cierresClientes.pendientes} pendiente(s), {cierresClientes.riesgo_alto + cierresClientes.riesgo_critico} de alto riesgo, {cierresClientes.cierres_formales?.cerrados || 0} cerrado(s)
                  </div>
                </div>
                <span style={{fontSize:12,color:C.textMuted,fontWeight:800}}>{cierresClientes.total_clientes} clientes</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Cliente</TH><TH>RUC</TH><TH>Riesgo</TH><TH right>Ingresos</TH><TH right>Gastos</TH><TH right>Por pagar</TH><TH>Cierre formal</TH><TH>Estado</TH><TH>Principal pendiente</TH>
                </tr></thead>
                <tbody>
                  {(cierresClientes.data||[]).map((row,i)=>{
                    const riskStyle = row.riesgo==="critico"
                      ? [C.dangerBg,C.dangerText]
                      : row.riesgo==="alto"
                        ? [C.warningBg,C.warningText]
                        : row.riesgo==="medio"
                          ? [C.infoBg,C.infoText]
                          : [C.successBg,C.successText];
                    return (
                      <tr key={row.cliente_id||row.cliente_nombre} style={{background:i%2?C.surfaceAlt:C.surface}}>
                        <TD>
                          <div style={{fontWeight:800}}>{row.cliente_nombre}</div>
                          <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{row.tipo_persona||"sin tipo"} - {row.estado_cliente||"sin estado"}</div>
                        </TD>
                        <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:C.textMuted}}>{row.ruc||"-"}</TD>
                        <TD><span style={{background:riskStyle[0],color:riskStyle[1],padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.riesgo}</span></TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.total_ingresos)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.total_gastos)}</TD>
                        <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",color:row.cuentas_por_pagar?C.dangerText:C.text}}>{fmt(row.cuentas_por_pagar)}</TD>
                        <TD>{cierreFormalBadge(row.cierre_estado)}</TD>
                        <TD><span style={{background:row.listo_para_cierre?C.successBg:C.warningBg,color:row.listo_para_cierre?C.successText:C.warningText,padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.listo_para_cierre?"Listo":"Pendiente"}</span></TD>
                        <TD style={{fontSize:12,color:C.textMuted,maxWidth:220}}>{row.issues?.[0]?.titulo||"Sin hallazgos"}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {mayorGeneral&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Mayor general</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    {mayorGeneral.total_cuentas} cuenta(s), {mayorGeneral.total_movimientos} movimiento(s), diferencia {fmt(mayorGeneral.diferencia)}
                  </div>
                </div>
                <span style={{background:mayorGeneral.balanceado?C.successBg:C.dangerBg,color:mayorGeneral.balanceado?C.successText:C.dangerText,padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>
                  {mayorGeneral.balanceado?"Balanceado":"Diferencia"}
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Cuenta</TH><TH>Tipo</TH><TH right>Debe</TH><TH right>Haber</TH><TH right>Saldo</TH><TH right>Movs.</TH><TH>Últimos movimientos</TH>
                </tr></thead>
                <tbody>
                  {(mayorGeneral.data||[]).map((row,i)=>(
                    <tr key={row.cuenta_codigo} onClick={()=>cargarMayor(row.cuenta_codigo)} style={{background:cuenta===row.cuenta_codigo?C.infoBg:(i%2?C.surfaceAlt:C.surface),cursor:"pointer",verticalAlign:"top"}}>
                      <TD>
                        <div style={{fontWeight:900}}>{row.cuenta_codigo}</div>
                        <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{row.cuenta_nombre}</div>
                      </TD>
                      <TD style={{color:C.textMuted,textTransform:"capitalize"}}>{row.tipo_cuenta}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.debe)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(row.haber)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:900,color:row.saldo<0?C.dangerText:C.text}}>{fmt(row.saldo)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{row.total_movimientos}</TD>
                      <TD>
                        {(row.movimientos||[]).slice(-3).map(m=>(
                          <div key={`${row.cuenta_codigo}-${m.asiento_id}-${m.debe}-${m.haber}`} style={{fontSize:11,color:C.textMuted,marginBottom:3}}>
                            <span style={{fontFamily:"JetBrains Mono,monospace",color:C.textLight}}>{fmtDate(m.fecha)}</span> - {m.cliente_nombre||"Sin cliente"} - {m.descripcion_linea||m.descripcion_asiento}
                          </div>
                        ))}
                        {(row.movimientos||[]).length>3&&<div style={{fontSize:11,color:C.textLight}}>+{row.movimientos.length-3} más</div>}
                      </TD>
                    </tr>
                  ))}
                  {(!mayorGeneral.data||mayorGeneral.data.length===0)&&<tr><TD style={{color:C.textMuted}}>No hay movimientos en el mayor general para este alcance.</TD><TD/><TD/><TD/><TD/><TD/><TD/></tr>}
                </tbody>
              </table>
            </Card>
          )}

          {antiguedad&&(
            <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:900,color:C.text}}>Antigüedad de saldos</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
                    Al {fmtDate(antiguedad.fecha_corte)} · {antiguedad.total_documentos} documento(s) · Total {fmt(antiguedad.total_pendiente)}
                  </div>
                </div>
                <select value={tipoAntiguedad} onChange={e=>setTipoAntiguedad(e.target.value)} style={{...inpSt,width:180}}>
                  <option value="todos">CxC y CxP</option>
                  <option value="por_cobrar">Solo por cobrar</option>
                  <option value="por_pagar">Solo por pagar</option>
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                {Object.entries(antiguedad.buckets||{}).map(([key,bucket])=>(
                  <div key={key} style={{background:C.surfaceAlt,borderRadius:8,padding:10}}>
                    <div style={{fontSize:11,fontWeight:900,color:C.textMuted,textTransform:"uppercase"}}>{bucket.label}</div>
                    <div style={{fontSize:16,fontWeight:900,color:key==="mas_90"?C.dangerText:C.text,marginTop:3}}>{fmt(bucket.total)}</div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{bucket.count} doc.</div>
                  </div>
                ))}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}>
                  <TH>Vence</TH><TH>Cliente</TH><TH>Documento</TH><TH>Tipo</TH><TH right>Días</TH><TH right>Total</TH><TH>Banco / Ref.</TH>
                </tr></thead>
                <tbody>
                  {(antiguedad.data||[]).map((row,i)=>(
                    <tr key={row.transaccion_id||`${row.cliente_nombre}-${i}`} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:C.textMuted}}>{fmtDate(row.fecha_vencimiento)}</TD>
                      <TD>
                        <div style={{fontWeight:800}}>{row.cliente_nombre}</div>
                        <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{fmtDate(row.fecha)}</div>
                      </TD>
                      <TD style={{fontSize:12,color:C.textMuted,maxWidth:260}}>{row.descripcion}</TD>
                      <TD><span style={{background:row.tipo==="por_cobrar"?C.successBg:C.dangerBg,color:row.tipo==="por_cobrar"?C.successText:C.dangerText,padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:900,textTransform:"uppercase"}}>{row.tipo==="por_cobrar"?"CxC":"CxP"}</span></TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:800,color:row.dias_vencido>60?C.dangerText:row.dias_vencido>0?C.warningText:C.successText}}>{row.dias_vencido}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:900}}>{fmt(row.total)}</TD>
                      <TD style={{fontSize:12,color:C.textMuted}}>{row.banco||"-"}<div style={{fontSize:11,color:C.textLight,fontFamily:"JetBrains Mono,monospace"}}>{row.referencia||""}</div></TD>
                    </tr>
                  ))}
                  {(!antiguedad.data||antiguedad.data.length===0)&&<tr><TD style={{color:C.textMuted}}>No hay saldos pendientes para este filtro.</TD><TD/><TD/><TD/><TD/><TD/><TD/></tr>}
                </tbody>
              </table>
            </Card>
          )}

          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:20,alignItems:"start",marginBottom:20}}>
            <Card style={{padding:0,overflowX:"auto"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,fontWeight:800,color:C.text}}>Balance de comprobación</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}><TH>Cuenta</TH><TH right>Saldo inicial</TH><TH right>Debe</TH><TH right>Haber</TH><TH right>Saldo final</TH></tr></thead>
                <tbody>
                  {(balance?.cuentas||[]).map((r,i)=>(
                    <tr key={r.cuenta_codigo} onClick={()=>cargarMayor(r.cuenta_codigo)} style={{background:cuenta===r.cuenta_codigo?C.infoBg:(i%2?C.surfaceAlt:C.surface),cursor:"pointer"}}>
                      <TD><strong>{r.cuenta_codigo}</strong> - {r.cuenta_nombre}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(r.saldo_inicial)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(r.debe)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(r.haber)}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace",fontWeight:800,color:r.saldo<0?C.dangerText:C.text}}>{fmt(r.saldo)}</TD>
                    </tr>
                  ))}
                  {(!balance?.cuentas||balance.cuentas.length===0)&&<tr><TD style={{color:C.textMuted}}>No hay registros para el periodo seleccionado.</TD><TD/><TD/><TD/><TD/></tr>}
                </tbody>
              </table>
            </Card>

            <Card style={{padding:0,overflowX:"auto"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <div>
                  <div style={{fontWeight:800,color:C.text}}>Mayor de cuenta</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{mayor?.cuenta_codigo} - {mayor?.cuenta_nombre}</div>
                  <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>Saldo inicial {fmt(mayor?.saldo_inicial)} · Saldo final {fmt(mayor?.saldo)}</div>
                </div>
                <select value={cuenta} onChange={e=>cargarMayor(e.target.value)} style={{...inpSt,width:190}}>
                  {plan.map(c=><option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>)}
                </select>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:C.surfaceAlt}}><TH>Fecha</TH><TH>Detalle</TH><TH right>Debe</TH><TH right>Haber</TH><TH right>Saldo</TH></tr></thead>
                <tbody>
                  {(mayor?.data||[]).map((m,i)=>(
                    <tr key={`${m.asiento_id}-${i}`} style={{background:i%2?C.surfaceAlt:C.surface}}>
                      <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted}}>{fmtDate(m.fecha)}</TD>
                      <TD>
                        <div style={{fontWeight:700}}>{m.descripcion}</div>
                        <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{m.cliente_nombre||"Sin cliente"} - {m.tipo_asiento||"documento"}</div>
                      </TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{m.debe?fmt(m.debe):"-"}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{m.haber?fmt(m.haber):"-"}</TD>
                      <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{fmt(m.saldo)}</TD>
                    </tr>
                  ))}
                  {(!mayor?.data||mayor.data.length===0)&&<tr><TD style={{color:C.textMuted}}>Sin movimientos en esta cuenta.</TD><TD/><TD/><TD/><TD/></tr>}
                </tbody>
              </table>
            </Card>
          </div>

          <Card style={{padding:0,overflowX:"auto"}}>
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:800,color:C.text}}>Diario en partida doble</div>
              <div style={{fontSize:12,color:C.textMuted}}>{asientos.length} asientos</div>
            </div>
            <table aria-label="Diario publicado" style={{width:"100%",minWidth:860,borderCollapse:"collapse"}}>
              <thead><tr style={{background:C.surfaceAlt}}><TH>Fecha</TH><TH>Asiento</TH><TH>Cuenta</TH><TH right>Debe</TH><TH right>Haber</TH><TH>Tipo</TH></tr></thead>
              <tbody>
                {asientos.flatMap((a,asientoIndex)=>a.lineas.map((l,lineIndex)=>(
                  <tr id={lineIndex===0?`asiento-${a.id}`:undefined} key={`${a.id}-${lineIndex}`} style={{background:asientoIndex%2?C.surfaceAlt:C.surface}}>
                    <TD style={{fontFamily:"JetBrains Mono,monospace",color:C.textMuted}}>{lineIndex===0?fmtDate(a.fecha):""}</TD>
                    <TD>
                      {lineIndex===0&&(
                        <>
                          {a.numero&&<>
                            <div title={a.libro_entidad_id||a.id} style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:4}}>{a.numero_libro?`Folio #${numeroAsiento(a.numero_libro)}`:"Folio por cliente pendiente"} · Versión {a.revision}</div>
                            <div style={{fontSize:10,color:C.textMuted,marginBottom:4}}>Registro de cartera #{numeroAsiento(a.numero)}{a.libro_provisional?" · Serie provisional":""}</div>
                          </>}
                          <div style={{fontWeight:700}}>{a.descripcion}</div>
                          {(a.rectifica_id||a.revision>1)&&<div style={{fontSize:12,color:C.textMuted,marginTop:5,overflowWrap:"anywhere"}}>{a.motivo}</div>}
                          {a.rectifica_id&&<a href={`#asiento-${a.rectifica_id}`} style={{display:"inline-block",fontSize:11,color:C.accent,marginTop:4}}>
                            Reversa del #{numeroAsiento(a.rectifica_numero_libro||asientos.find(entry=>entry.id===a.rectifica_id)?.numero||"?")}
                          </a>}
                          <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{a.cliente_nombre||"Sin cliente"}</div>
                        </>
                      )}
                    </TD>
                    <TD><strong>{l.cuenta_codigo}</strong> - {l.cuenta_nombre}</TD>
                    <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{l.debe?fmt(l.debe):"-"}</TD>
                    <TD style={{textAlign:"right",fontFamily:"JetBrains Mono,monospace"}}>{l.haber?fmt(l.haber):"-"}</TD>
                    <TD>{lineIndex===0?tipoAsiento(a.tipo_asiento):""}</TD>
                  </tr>
                )))}
                {asientos.length===0&&<tr><TD style={{color:C.textMuted}}>No hay asientos para mostrar.</TD><TD/><TD/><TD/><TD/><TD/></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  FISCAL VIEW
// --------------------------------------------------------------------------
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
  const itbmsLabel = c => ({
    exento:"Exento / no gravado",
    general:"General",
    alcohol_hospedaje:"Alcohol u hospedaje",
    tabaco:"Cigarrillo / tabaco",
  }[c] || c || "General");

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Módulo Fiscal - Panamá</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Cálculos automáticos desde PostgreSQL - DGI - ITBMS - ISR</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>
        {itbms&&<Card>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:38,height:38,background:C.infoBg,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="tax" size={18} color={C.accent}/></div>
            <div><div style={{fontWeight:700,fontSize:15,color:C.text}}>ITBMS - Formulario 430</div>
            <div style={{fontSize:12,color:C.textMuted}}>Período: {itbms.periodo} - Tasas 0%, 7%, 10% y 15%</div></div>
          </div>
          {[["Base Imponible (Ventas)",fmt(itbms.base_imponible),C.text],
            ["ITBMS Débito (ventas)",fmt(itbms.debito),C.dangerText],
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
            Vencimiento: <strong>{itbms.vencimiento}</strong> - {itbms.validacion?.mensaje}
          </div>
          {itbms.desglose?.length>0&&(
            <div style={{marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              <div style={{fontSize:12,fontWeight:800,color:C.textMuted,textTransform:"uppercase",marginBottom:8}}>Desglose por tasa</div>
              {itbms.desglose.map((r,i)=>(
                <div key={`${r.categoria}-${i}`} style={{display:"grid",gridTemplateColumns:"1.4fr .7fr .8fr .8fr",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{itbmsLabel(r.categoria)} ({Math.round(Number(r.tasa||0)*100)}%)</div>
                    <div style={{fontSize:11,color:C.textLight}}>{r.transacciones} movimiento(s)</div>
                  </div>
                  <div style={{fontSize:12,color:C.textMuted,textAlign:"right"}}>{fmt(Number(r.base_ingresos||0)+Number(r.base_gastos||0))}</div>
                  <div style={{fontSize:12,color:C.dangerText,textAlign:"right"}}>{fmt(r.debito)}</div>
                  <div style={{fontSize:12,color:C.successText,textAlign:"right"}}>{fmt(r.credito)}</div>
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1.4fr .7fr .8fr .8fr",gap:8,marginTop:6,fontSize:10,fontWeight:800,color:C.textLight,textTransform:"uppercase"}}>
                <span>Tasa</span><span style={{textAlign:"right"}}>Base</span><span style={{textAlign:"right"}}>Débito</span><span style={{textAlign:"right"}}>Crédito</span>
              </div>
            </div>
          )}
        </Card>}
        {renta&&<Card>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:38,height:38,background:"#fdf4ff",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="dollar" size={18} color="#7c3aed"/></div>
            <div><div style={{fontWeight:700,fontSize:15,color:C.text}}>ISR - Formulario 101</div>
            <div style={{fontSize:12,color:C.textMuted}}>Año fiscal: {renta.anio} - Tasas panameñas</div></div>
          </div>
          {renta.detalle?.map((d,i)=>(
            <div key={i} style={{marginBottom:16,padding:14,background:C.surfaceAlt,borderRadius:8}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:10}}>
                Persona {d.tipo_persona||"General"}
              </div>
              {[["Ingresos Brutos",fmt(d.ingresos_brutos),C.text],
                ["Resultado contable",fmt(d.resultado_contable),C.textMuted],
                ["(-) Gastos Deducibles",fmt(d.gastos_deducibles),C.textMuted],
                ["Renta Neta Gravable",fmt(d.renta_neta),C.text],
                [`ISR (${(d.tasa*100).toFixed(0)}% - ${d.metodo})`,fmt(d.impuesto),"#7c3aed"],
              ].map(([l,v,c],j)=>(
                <div key={j} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.textMuted}}>{l}</span>
                  <span style={{fontSize:j===3?14:12,fontWeight:j===3?800:600,color:c}}>{v}</span>
                </div>
              ))}
              <div style={{fontSize:11,color:C.infoText,marginTop:8}}>Vencimiento aplicable: <strong>{d.vencimiento}</strong></div>
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

// --------------------------------------------------------------------------
//  CONCILIACION VIEW
// --------------------------------------------------------------------------
const ConciliacionView = () => {
  const {user}=useAuth();
  const [data,setData]=useState(null), [clients,setClients]=useState([]);
  const [accounts,setAccounts]=useState([]), [accountId,setAccountId]=useState("");
  const [accountModal,setAccountModal]=useState(false), [accountForm,setAccountForm]=useState({});
  const [accountState,setAccountState]=useState(null);
  const [busy,setBusy]=useState(true), [err,setErr]=useState(null), [formError,setFormError]=useState("");
  const [modo,setModo]=useState("mensual"), [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));
  const [anio,setAnio]=useState(new Date().getFullYear()), [clienteId,setClienteId]=useState("");
  const [modal,setModal]=useState(false), [importModal,setImportModal]=useState(false), [assignment,setAssignment]=useState(null);
  const [csvText,setCsvText]=useState(""), [importClient,setImportClient]=useState(""), [preview,setPreview]=useState(null);
  const [importAccount,setImportAccount]=useState("");
  const [saving,setSaving]=useState(false), [match,setMatch]=useState({}), [cierreEstado,setCierreEstado]=useState(null);
  const [view,setView]=useState("pendientes");
  const sequence=useRef(0), writeLock=useRef(false);
  const attempts=useRef({}), pendingStore=pendingBankRequests(sessionStorage,user?.id);
  const emptyMov=()=>({cliente_id:clienteId,cuenta_bancaria_id:accountId,fecha:new Date().toISOString().slice(0,10),descripcion:"",monto:"",tipo:"credito",banco:accounts.find(a=>a.id===accountId)?.banco||"",referencia:""});
  const [mov,setMov]=useState(emptyMov);
  const scopeQuery=(modo==="mensual" ? `periodo=${periodo}` : `anio=${anio}`)+(clienteId ? `&cliente_id=${clienteId}` : "");
  const query=scopeQuery+(accountId ? `&cuenta_bancaria_id=${accountId}` : "");
  const load=useCallback(async()=>{
    const seq=++sequence.current;
    setBusy(true);setErr(null);setData(null);setCierreEstado(null);setMatch({});
    try {
      const [report,closure,list,bankAccounts]=await Promise.all([api.get("/api/fiscal/conciliacion?"+query),
        api.get("/api/contabilidad/cierre-estado?"+scopeQuery),api.get("/api/clientes?limit=10000"),
        api.get("/api/cuentas-bancarias").catch(e=>{if(e.status===404)return {data:[]};throw e;})]);
      if(seq!==sequence.current)return;
      setData(report);setCierreEstado(closure.data||null);setClients(list.data||[]);
      setAccounts(bankAccounts.data||[]);
    }catch(e){if(seq===sequence.current)setErr(e.message);}
    finally{if(seq===sequence.current)setBusy(false);}
  },[query,scopeQuery]);
  useEffect(()=>{load();return()=>{sequence.current++;};},[load]);
  const canWrite=["admin","contador"].includes(user?.rol) && data?.alcance_conciliacion==="movimientos_por_cuenta";
  const closed=cierreEstado?.estado==="cerrado";
  const write=async(action)=>{
    if(writeLock.current)return;
    writeLock.current=true;setSaving(true);setFormError("");
    try { await action();await load(); }
    catch(e){setFormError(e.message);}
    finally{writeLock.current=false;setSaving(false);}
  };
  const sendOnce=async(kind,path,payload)=>{
    const request=bankAttempt(attempts.current[kind]||pendingStore.read(kind),payload);
    pendingStore.save(kind,request);attempts.current[kind]=request;
    try {
      const result=await api.post(path,request);
      pendingStore.clear(kind);attempts.current[kind]=null;
      return result;
    }catch(e){
      if(e.status>=400&&e.status<500&&e.status!==408&&e.status!==429&&!(e.status===409&&e.message.includes("identificador"))){
        pendingStore.clear(kind);attempts.current[kind]=null;
      }
      throw e;
    }
  };
  const openMovement=()=>{
    try{const pending=pendingStore.read("movement");attempts.current.movement=pending;setMov(pending||emptyMov());setModal(true);setFormError("");}
    catch(e){setFormError(e.message);}
  };
  const openImport=()=>{
    try{
      const pending=pendingStore.read("import");attempts.current.import=pending;
      setImportClient(pending?.movimientos?.[0]?.cliente_id||clienteId);
      setImportAccount(pending?.movimientos?.[0]?.cuenta_bancaria_id||accountId);
      setPreview(pending?.movimientos||null);setImportModal(true);setFormError("");
    }catch(e){setFormError(e.message);}
  };
  const openAccount=()=>{
    try{const pending=pendingStore.read("account");attempts.current.account=pending;
      setAccountForm(pending||{cliente_id:clienteId,nombre:"",banco:"Banco General",numero:"",tipo:"corriente",moneda:"USD"});
      setAccountModal(true);setFormError("");
    }catch(e){setFormError(e.message);}
  };
  const saveMovement=()=>write(async()=>{
    if(!mov.cliente_id)throw new Error("Seleccione el cliente propietario.");
    if(!mov.cuenta_bancaria_id)throw new Error("Seleccione la cuenta bancaria.");
    await sendOnce("movement","/api/movimientos-bancarios",mov);setModal(false);
  });
  const importRows=()=>write(async()=>{
    if(!preview?.length)throw new Error("Revise el lote antes de importar.");
    await sendOnce("import","/api/movimientos-bancarios/bulk",{movimientos:preview});
    setImportModal(false);setPreview(null);setCsvText("");
  });
  const assignClient=()=>write(async()=>{
    const path=assignment.kind==="payment"
      ? `/api/transacciones/${assignment.id}${assignment.pago_id?`/pagos/${assignment.pago_id}`:""}/cuenta`
      : `/api/movimientos-bancarios/${assignment.id}/cuenta`;
    await api.post(path,{cuenta_bancaria_id:assignment.cuenta_bancaria_id,motivo:assignment.motivo});
    setAssignment(null);
  });
  const txRows=[...(data?.transacciones_pendientes||[]),...(data?.documentos_sin_pago||[]).map(t=>({...t,registra_pago:true}))];
  const selectedTx=txRows.find(t=>t.id===match.transaccion_id&&(t.pago_id||null)===(match.pago_id||null));
  const selectedBank=data?.movimientos_pendientes?.find(m=>m.id===match.movimiento_id);
  const compatible=selectedTx?.cliente_id && selectedTx.cliente_id===selectedBank?.cliente_id &&
    selectedTx.cuenta_bancaria_id && selectedTx.cuenta_bancaria_id===selectedBank.cuenta_bancaria_id &&
    !selectedTx.requiere_revision && !selectedBank.requiere_revision && selectedTx.banco===selectedBank.banco &&
    Math.round(Number(selectedTx.total_documento)*100)===Math.round(Number(selectedBank.monto)*100) &&
    selectedBank.tipo===(selectedTx.tipo==="ingreso"?"credito":"debito");
  const reconcile=()=>write(async()=>{
    if(!compatible)throw new Error("Seleccione registros del mismo cliente, cuenta, importe y dirección.");
    await api.post(match.pago_id ? `/api/transacciones/${match.transaccion_id}/pagos/${match.pago_id}/conciliar` : "/api/conciliacion/match",match);
    setMatch({});
  });
  const clientPicker=(value,onChange,label)=>(
    <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} style={{...inpSt,maxWidth:"100%"}}>
      <option value="">Seleccione cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>);
  const accountPicker=(value,onChange,client,label,bank)=>(
    <>
    <select aria-label={label} required value={value} onChange={e=>onChange(e.target.value)} style={{...inpSt,minWidth:0,maxWidth:"100%"}}>
      <option value="">Seleccione cuenta</option>{accounts.filter(a=>(a.activa||a.id===value)&&a.cliente_id===client&&(!bank||a.banco===bank)).map(a=>
        <option key={a.id} value={a.id}>{bankAccountLabel(a)}</option>)}
    </select>
    {value&&<div style={{fontSize:12,marginTop:6,overflowWrap:"anywhere"}}>{bankAccountLabel(accounts.find(a=>a.id===value))}</div>}
    </>);
  const pendingItem=(t)=>(
    <div key={t.pago_id||t.id}>
    <label style={{display:"flex",gap:10,padding:"12px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
      <input type="radio" name="txmatch" disabled={!canWrite||closed||!t.cliente_id||!t.cuenta_bancaria_id||t.requiere_revision}
        checked={match.transaccion_id===t.id&&(match.pago_id||null)===(t.pago_id||null)}
        onChange={()=>setMatch({transaccion_id:t.id,pago_id:t.pago_id||null})}/>
      <div style={{flex:1,minWidth:0,overflowWrap:"anywhere"}}>
        <div style={{fontWeight:700,fontSize:13}}>{t.descripcion}</div>
        <div style={{fontSize:12,color:C.textMuted}}>{t.cliente_nombre} · {t.banco}</div>
        <div style={{fontSize:12,color:C.textMuted}}>{t.cuenta_nombre}</div>
        <div style={{fontSize:12,color:C.textMuted}}>{fmtDate(t.fecha)} · {t.referencia_pago||t.referencia||"Sin referencia"}</div>
        {t.requiere_revision&&<div style={{fontSize:12,color:C.danger}}>Vínculo anterior pendiente de revisión</div>}
      </div><strong style={{whiteSpace:"nowrap",fontSize:13}}>{fmt(t.total_documento)}</strong>
    </label>
    {!t.cuenta_bancaria_id&&<Btn variant="secondary" disabled={!canWrite||closed||!t.cliente_id||t.requiere_revision} onClick={()=>{setAssignment({...t,kind:"payment",cuenta_bancaria_id:"",motivo:""});setFormError("");}}>Asignar cuenta al pago</Btn>}
    </div>);
  const recordsTable=(rows,bank=false)=>(
    <div style={{overflowX:"auto"}}><table aria-label={bank?"Movimientos bancarios del periodo":"Pagos contables del periodo"} style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr><TH>Fecha</TH><TH>Cliente / Banco</TH><TH>Descripción / Referencia</TH><TH>Tipo</TH><TH right>Importe</TH><TH>Estado</TH></tr></thead>
      <tbody>{rows.map((r,i)=><tr key={r.id||`${r.pago_id||r.transaccion_id}-${i}`}>
        <TD>{fmtDate(r.fecha)}</TD><TD>{r.cliente_nombre}<br/>{r.banco}<br/>{r.cuenta_nombre}</TD>
        <TD style={{overflowWrap:"anywhere"}}>{r.descripcion}<br/>{r.referencia}</TD><TD>{r.tipo}</TD>
        <TD style={{textAlign:"right"}}>{fmt(bank?r.monto:r.importe)}</TD><TD>{r.estado_vinculo||r.estado}</TD>
      </tr>)}</tbody>
    </table>{!rows.length&&<p style={{color:C.textMuted}}>Sin movimientos en el período seleccionado.</p>}</div>);
  return <div>
    <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:16,marginBottom:20}}>
      <div><h1 style={{fontSize:22,margin:"0 0 8px"}}>Conciliación bancaria</h1>
        <div style={{fontSize:13,color:C.textMuted}}>Corte: {data?.fecha_corte||"Pendiente"} · Saldos de extracto pendientes de validar</div></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <div role="group" aria-label="Alcance bancario" style={{display:"flex"}}>
          {["mensual","anual"].map(m=><Btn key={m} variant={modo===m?"primary":"secondary"} onClick={()=>setModo(m)}>{m==="mensual"?"Mes":"12 meses"}</Btn>)}
        </div>
        {modo==="mensual"?<input aria-label="Periodo bancario" type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:150}}/>:
          <input aria-label="Año bancario" type="number" min="2000" max="2100" value={anio} onChange={e=>setAnio(e.target.value)} style={{...inpSt,width:100}}/>}
        <select aria-label="Cliente de conciliación" value={clienteId} onChange={e=>{setClienteId(e.target.value);setAccountId("");}} style={{...inpSt,width:220}}>
          <option value="">Toda la cartera</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select aria-label="Cuenta de conciliación" value={accountId} onChange={e=>setAccountId(e.target.value)} style={{...inpSt,width:290,maxWidth:"100%"}}>
          <option value="">Todas las cuentas</option>{accounts.filter(a=>!clienteId||a.cliente_id===clienteId).map(a=>
            <option key={a.id} value={a.id}>{!clienteId?(a.cliente_nombre+" · "):""}{bankAccountLabel(a)}</option>)}
        </select>
        <Btn variant="secondary" onClick={load} disabled={busy}><Icon name="refresh" size={16}/>Actualizar</Btn>
        <Btn variant="secondary" disabled={busy||!data?.alcance_conciliacion} onClick={()=>api.pdf("/api/reportes/conciliacion?"+query).catch(e=>setErr(e.message))}><Icon name="report" size={16}/>PDF conciliación</Btn>
        <Btn variant="secondary" disabled={busy||!data?.alcance_conciliacion} onClick={()=>downloadText(`conciliacion-${clienteId||"cartera"}-${periodo}-${anio}.csv`,reconciliationCsv(data))}><Icon name="download" size={16}/>Exportar CSV</Btn>
        <Btn variant="secondary" disabled={busy||!canWrite} onClick={openImport}><Icon name="journal" size={16}/>Importar banco</Btn>
        <Btn disabled={busy||!canWrite} onClick={openMovement}><Icon name="plus" size={16}/>Movimiento banco</Btn>
      </div>
    </div>
    {closed&&<p role="status">Período cerrado. Consulta únicamente.</p>}
    {err&&<ErrBox msg={err} onRetry={load}/>}
    {formError&&!modal&&!importModal&&!assignment&&!accountModal&&!accountState&&<div role="alert" style={{color:C.danger,marginBottom:16}}>{formError}</div>}
    {busy?<Spinner/>:data&&<>
      <div style={{overflowX:"auto"}}>
        <table aria-label="Resumen bancario por cliente" style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH>Cliente / Banco</TH><TH right>Neto contable</TH><TH right>Neto bancario</TH><TH right>Diferencia</TH><TH>Pendientes contables / banco</TH><TH>Estado de movimientos</TH></tr></thead>
          <tbody>{(data.resumen||[]).map((r,i)=><tr key={i}>
            <TD>{r.cliente_nombre}<br/><strong>{r.banco}</strong><br/>{r.cuenta_nombre}</TD>
            <TD style={{textAlign:"right"}}>{fmt(r.movimiento_neto_contable??r.saldo_contable)}</TD>
            <TD style={{textAlign:"right"}}>{fmt(r.movimiento_neto_bancario)}</TD>
            <TD style={{textAlign:"right"}}>{typeof r.diferencia==="number"?fmt(r.diferencia):"Sin extracto"}</TD>
            <TD>{r.num_pendientes} / {r.banco_pendientes??0}</TD>
            <TD style={{color:r.estado==="movimientos_vinculados"?C.success:C.warningText}}>{r.estado?.replaceAll("_"," ")}</TD>
          </tr>)}</tbody>
        </table>
      </div>
      <div role="tablist" aria-label="Registros de conciliación" style={{display:"flex",flexWrap:"wrap",gap:8,margin:"20px 0"}}>
        {[["pendientes","Pendientes al corte"],["contables","Pagos del período"],["bancarios","Banco del período"],["cuentas","Cuentas bancarias"],["extractos","Extractos"],["auxiliar","Auxiliar bancario"]].map(([id,label])=>
          <Btn role="tab" aria-selected={view===id} key={id} variant={view===id?"primary":"secondary"} onClick={()=>setView(id)}>{label}</Btn>)}
      </div>
      {view==="contables"&&recordsTable(data.registros_contables||[])}
      {view==="bancarios"&&recordsTable(data.movimientos_periodo||[],true)}
      {view==="auxiliar"&&<BankSubledger api={api} ui={{Btn,Icon,C,fmt}} query={query}/>}
      {view==="extractos"&&<BankStatements api={api} ui={{Btn,Modal,Icon,C,inpSt,fmt}} clients={clients} accounts={accounts}
        query={query} user={user} defaultClient={clienteId} defaultAccount={accountId}
        defaultMonth={modo==="mensual"?periodo:String(anio)+"-01"} canWrite={canWrite}/>}
      {view==="cuentas"&&<section>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:16}}>
          <h2 style={{fontSize:16}}>Cuentas bancarias</h2><Btn disabled={!canWrite} onClick={openAccount}><Icon name="plus" size={16}/>Registrar cuenta</Btn>
        </div>
        <div style={{overflowX:"auto"}}><table aria-label="Directorio de cuentas bancarias" style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH>Cliente</TH><TH>Cuenta</TH><TH>Estado</TH><TH>Acciones</TH></tr></thead>
          <tbody>{accounts.filter(a=>(!clienteId||a.cliente_id===clienteId)&&(!accountId||a.id===accountId)).map(a=><tr key={a.id}>
            <TD>{a.cliente_nombre}</TD><TD style={{overflowWrap:"anywhere"}}>{bankAccountLabel(a)}</TD><TD>{a.activa?"Activa":"Archivada"}</TD>
            <TD><Btn variant="secondary" disabled={!canWrite} onClick={()=>{setAccountState({...a,motivo:""});setFormError("");}}>{a.activa?"Archivar":"Reactivar"}</Btn></TD>
          </tr>)}</tbody></table></div>
        {!accounts.some(a=>!clienteId||a.cliente_id===clienteId)&&<p>Sin cuentas registradas.</p>}
      </section>}
      {view==="pendientes"&&<>
        {data.sugerencias?.length>0&&<details style={{marginBottom:20}}><summary style={{cursor:"pointer",fontWeight:700}}>Coincidencias propuestas ({data.sugerencias.length})</summary>
          {data.sugerencias.map(s=><div key={`${s.pago_id||s.transaccion_id}-${s.movimiento_id}`} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{flex:1,overflowWrap:"anywhere",minWidth:0}}>{s.cliente_nombre} · {s.banco}<br/>{s.descripcion_contable} / {s.descripcion_banco}<br/>{s.registra_pago?"Registra pago completo y vincula banco":"Vincula abono registrado"}</div>
            <strong>{fmt(s.monto)}</strong><Btn variant="secondary" disabled={closed||!canWrite} onClick={()=>setMatch(s)}>Seleccionar</Btn>
          </div>)}
        </details>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,360px),1fr))",gap:24}}>
          <section><h2 style={{fontSize:16}}>Pagos pendientes ({data.transacciones_pendientes?.length||0})</h2>
            {(data.transacciones_pendientes||[]).map(pendingItem)}
            {!data.transacciones_pendientes?.length&&<p>Sin pagos pendientes de vinculación.</p>}
            <h2 style={{fontSize:16,marginTop:24}}>Documentos sin pago ({data.documentos_sin_pago?.length||0})</h2>
            {(data.documentos_sin_pago||[]).map(t=>pendingItem({...t,registra_pago:true}))}
          </section>
          <section><h2 style={{fontSize:16}}>Banco pendiente ({data.movimientos_pendientes?.length||0})</h2>
            {(data.movimientos_pendientes||[]).map(m=><div key={m.id}>
              <label style={{display:"flex",gap:10,padding:"12px 0",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
                <input type="radio" name="movmatch" disabled={!canWrite||closed||!m.cliente_id||!m.cuenta_bancaria_id||m.requiere_revision||Boolean(selectedTx?.cliente_id&&selectedTx.cliente_id!==m.cliente_id)||Boolean(selectedTx?.cuenta_bancaria_id&&selectedTx.cuenta_bancaria_id!==m.cuenta_bancaria_id)}
                  checked={match.movimiento_id===m.id} onChange={()=>setMatch(x=>({...x,movimiento_id:m.id}))}/>
                <div style={{flex:1,minWidth:0,overflowWrap:"anywhere"}}><strong style={{fontSize:13}}>{m.descripcion}</strong>
                  <div style={{fontSize:12,color:C.textMuted}}>{m.cliente_nombre} · {m.banco}</div>
                  <div style={{fontSize:12,color:C.textMuted}}>{m.cuenta_nombre}</div>
                  <div style={{fontSize:12,color:C.textMuted}}>{fmtDate(m.fecha)} · {m.referencia||"Sin referencia"}{m.anterior_al_periodo?" · Período anterior":""}</div>
                  {m.requiere_revision&&<div style={{fontSize:12,color:C.danger}}>Vínculo anterior pendiente de revisión</div>}
                </div><strong style={{fontSize:13,whiteSpace:"nowrap"}}>{fmt(m.monto)}</strong>
              </label>
              {!m.cuenta_bancaria_id&&<Btn variant="secondary" disabled={!canWrite||m.requiere_revision} onClick={()=>{setAssignment({...m,kind:"bank",cliente_id:m.cliente_id||"",cuenta_bancaria_id:"",motivo:""});setFormError("");}}>Asignar cuenta al movimiento</Btn>}
            </div>)}
            {!data.movimientos_pendientes?.length&&<p>Sin movimientos bancarios pendientes.</p>}
          </section>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:16,alignItems:"center",marginTop:20}}>
          {selectedTx?.registra_pago&&<strong>Se registrará el pago completo de {fmt(selectedTx.total_documento)}.</strong>}
          <Btn variant="success" onClick={reconcile} loading={saving} disabled={!canWrite||closed||!compatible}><Icon name="check" size={16}/>Conciliar selección</Btn>
        </div>
      </>}
    </>}
    {modal&&<Modal title="Nuevo movimiento bancario" closeDisabled={saving} onClose={()=>setModal(false)} width={540}>
      {formError&&<div role="alert" style={{color:C.danger}}>{formError}</div>}
      {attempts.current.movement&&<p role="status">Envío pendiente de confirmación: {attempts.current.movement.idempotencia}</p>}
      <fieldset disabled={saving||Boolean(attempts.current.movement)} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <Fld label="Cliente propietario">{clientPicker(mov.cliente_id,value=>setMov({...mov,cliente_id:value,cuenta_bancaria_id:"",banco:""}),"Cliente del movimiento")}</Fld>
      <Fld label="Cuenta bancaria">{accountPicker(mov.cuenta_bancaria_id,value=>setMov({...mov,cuenta_bancaria_id:value,banco:accounts.find(a=>a.id===value)?.banco||""}),mov.cliente_id,"Cuenta del movimiento")}</Fld>
      <Fld label="Fecha"><input aria-label="Fecha bancaria" type="date" value={mov.fecha} onChange={e=>setMov({...mov,fecha:e.target.value})} style={inpSt}/></Fld>
      <Fld label="Tipo"><select aria-label="Tipo bancario" value={mov.tipo} onChange={e=>setMov({...mov,tipo:e.target.value})} style={inpSt}>
        <option value="credito">Crédito / depósito</option><option value="debito">Débito / pago</option></select></Fld>
      <Fld label="Descripción"><input aria-label="Descripción bancaria" maxLength={2000} value={mov.descripcion} onChange={e=>setMov({...mov,descripcion:e.target.value})} style={inpSt}/></Fld>
      <Fld label="Monto"><input aria-label="Monto bancario" type="number" min="0.01" step="0.01" value={mov.monto} onChange={e=>setMov({...mov,monto:e.target.value})} style={inpSt}/></Fld>
      <Fld label="Referencia"><input aria-label="Referencia bancaria" maxLength={100} value={mov.referencia} onChange={e=>setMov({...mov,referencia:e.target.value})} style={inpSt}/></Fld>
      </fieldset>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><Btn variant="secondary" disabled={saving} onClick={()=>setModal(false)}>Cerrar</Btn><Btn loading={saving} onClick={saveMovement}>{attempts.current.movement?"Reintentar envío":"Guardar movimiento"}</Btn></div>
    </Modal>}
    {importModal&&<Modal title="Importar movimientos bancarios" closeDisabled={saving} onClose={()=>setImportModal(false)} width={700}>
      {formError&&<div role="alert" style={{color:C.danger}}>{formError}</div>}
      {attempts.current.import&&<p role="status">Envío pendiente de confirmación: {attempts.current.import.idempotencia}</p>}
      <fieldset disabled={saving||Boolean(attempts.current.import)} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <Fld label="Cliente del extracto">{clientPicker(importClient,value=>{setImportClient(value);setImportAccount("");setPreview(null);},"Cliente del extracto")}</Fld>
      <Fld label="Cuenta del extracto">{accountPicker(importAccount,value=>{setImportAccount(value);setPreview(null);},importClient,"Cuenta del extracto")}</Fld>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
        <Btn variant="secondary" onClick={()=>downloadText("formato-banco.csv",bankColumns.join(",")+"\n")}><Icon name="download" size={16}/>Formato CSV</Btn>
        <input aria-label="Archivo bancario CSV" type="file" accept=".csv,text/csv" style={{width:"100%",minWidth:0,maxWidth:"100%"}} onChange={async e=>{
          const file=e.target.files?.[0];if(!file)return;
          if(file.size>2000000){setFormError("Archivo demasiado grande. Máximo 2 MB.");return;}
          try{setCsvText(await file.text());setPreview(null);}catch(error){setFormError(error.message);}
        }}/>
      </div>
      <textarea aria-label="Contenido CSV bancario" value={csvText} onChange={e=>{setCsvText(e.target.value);setPreview(null);}} rows={6} style={{...inpSt,resize:"vertical",fontFamily:"monospace"}}/>
      </fieldset>
      {preview&&<div role="status" style={{margin:"12px 0"}}>{preview.length} movimientos · Créditos {fmt(preview.filter(r=>r.tipo==="credito").reduce((s,r)=>s+Number(r.monto),0))} · Débitos {fmt(preview.filter(r=>r.tipo==="debito").reduce((s,r)=>s+Number(r.monto),0))}</div>}
      {preview&&<div style={{maxHeight:180,overflow:"auto"}}><table style={{width:"100%",fontSize:12}}><tbody>{preview.map((r,i)=><tr key={i}><td>{r.fecha}</td><td style={{overflowWrap:"anywhere"}}>{r.descripcion}</td><td>{r.tipo}</td><td>{r.monto}</td></tr>)}</tbody></table></div>}
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:16}}>
        <Btn variant="secondary" disabled={saving||Boolean(attempts.current.import)} onClick={()=>{try{setFormError("");setPreview(parseBankCsv(csvText,importClient,accounts.find(a=>a.id===importAccount)));}catch(e){setFormError(e.message);setPreview(null);}}}>Revisar lote</Btn>
        <Btn loading={saving} disabled={!preview} onClick={importRows}>{attempts.current.import?"Reintentar envío":"Importar"}</Btn>
      </div>
    </Modal>}
    {assignment&&<Modal title="Asignar cuenta bancaria" closeDisabled={saving} onClose={()=>setAssignment(null)}>
      {formError&&<div role="alert" style={{color:C.danger}}>{formError}</div>}
      <p>{assignment.descripcion} · {assignment.banco} · {fmt(assignment.total_documento??assignment.monto)}</p>
      {assignment.cliente_id?<p>{clients.find(c=>c.id===assignment.cliente_id)?.nombre}</p>:<Fld label="Cliente propietario">{clientPicker(assignment.cliente_id,value=>setAssignment({...assignment,cliente_id:value,cuenta_bancaria_id:""}),"Cliente propietario de movimiento anterior")}</Fld>}
      <Fld label="Cuenta bancaria">{accountPicker(assignment.cuenta_bancaria_id,value=>setAssignment({...assignment,cuenta_bancaria_id:value}),assignment.cliente_id,"Cuenta para asignación",assignment.banco)}</Fld>
      <Fld label="Motivo de la asignación"><textarea aria-label="Motivo de la asignación" minLength={10} maxLength={1000} value={assignment.motivo} onChange={e=>setAssignment({...assignment,motivo:e.target.value})} style={inpSt}/></Fld>
      <Btn loading={saving} onClick={assignClient}>Confirmar asignación</Btn>
    </Modal>}
    {accountModal&&<Modal title="Registrar cuenta bancaria" closeDisabled={saving} onClose={()=>setAccountModal(false)}>
      {formError&&<div role="alert" style={{color:C.danger}}>{formError}</div>}
      {attempts.current.account&&<p role="status">Envío pendiente de confirmación: {attempts.current.account.idempotencia}</p>}
      <fieldset disabled={saving||Boolean(attempts.current.account)} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <Fld label="Cliente propietario">{clientPicker(accountForm.cliente_id,value=>setAccountForm({...accountForm,cliente_id:value}),"Cliente de la cuenta")}</Fld>
        <Fld label="Nombre"><input aria-label="Nombre de la cuenta" maxLength={100} value={accountForm.nombre} onChange={e=>setAccountForm({...accountForm,nombre:e.target.value})} style={inpSt}/></Fld>
        <Fld label="Banco"><select aria-label="Banco de la cuenta" value={accountForm.banco} onChange={e=>setAccountForm({...accountForm,banco:e.target.value})} style={inpSt}>{BANCOS_PANAMA.map(b=><option key={b}>{b}</option>)}</select></Fld>
        <Fld label="Número de cuenta"><input aria-label="Número de cuenta" autoComplete="off" maxLength={60} value={accountForm.numero} onChange={e=>setAccountForm({...accountForm,numero:e.target.value})} style={inpSt}/></Fld>
        <Fld label="Tipo"><select aria-label="Tipo de cuenta" value={accountForm.tipo} onChange={e=>setAccountForm({...accountForm,tipo:e.target.value})} style={inpSt}><option value="corriente">Corriente</option><option value="ahorros">Ahorros</option></select></Fld>
        <Fld label="Moneda"><select aria-label="Moneda de la cuenta" value="USD" disabled style={inpSt}><option value="USD">USD</option></select></Fld>
      </fieldset>
      <Btn loading={saving} onClick={()=>write(async()=>{await sendOnce("account","/api/cuentas-bancarias",accountForm);setAccountModal(false);})}>{attempts.current.account?"Reintentar envío":"Guardar cuenta"}</Btn>
    </Modal>}
    {accountState&&<Modal title={accountState.activa?"Archivar cuenta":"Reactivar cuenta"} closeDisabled={saving} onClose={()=>setAccountState(null)}>
      {formError&&<div role="alert" style={{color:C.danger}}>{formError}</div>}
      <p style={{overflowWrap:"anywhere"}}>{bankAccountLabel(accountState)}</p>
      <Fld label="Motivo"><textarea aria-label="Motivo del estado de cuenta" maxLength={1000} rows={3} value={accountState.motivo} onChange={e=>setAccountState({...accountState,motivo:e.target.value})} style={inpSt}/></Fld>
      <Btn loading={saving} onClick={()=>write(async()=>{await api.post(`/api/cuentas-bancarias/${accountState.id}/estado`,{activa:!accountState.activa,motivo:accountState.motivo});setAccountState(null);})}>Confirmar estado</Btn>
    </Modal>}
  </div>;
};

// --------------------------------------------------------------------------
//  REPORTES VIEW - PDFs reales
// --------------------------------------------------------------------------
const ReportesView = () => {
  const [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));
  const [alcance,setAlcance]=useState("mensual");
  const [anio,setAnio]=useState(String(new Date().getFullYear()));
  const [clientes,setCli]  =useState([]);
  const [cliSel,setCliSel] =useState("");
  const [resumen,setRes]   =useState(null);
  const [txns,setTxns]     =useState([]);
  const [busy,setBusy]     =useState(true);
  const [genPDF,setGenPDF] =useState("");
  const queryBase = `${alcance==="anual"?`anio=${anio}`:`periodo=${periodo}`}${cliSel?`&cliente_id=${cliSel}`:""}`;
  const labelPeriodo = alcance==="anual" ? `${anio} completo` : periodo;

  useEffect(()=>{
    setBusy(true);
    Promise.all([
      api.get(`/api/transacciones/resumen?${queryBase}`),
      api.get(`/api/transacciones?${queryBase}`),
      api.get("/api/clientes"),
    ]).then(([r,t,c])=>{setRes(r);setTxns((t.data||[]).filter(isRegisteredTransaction));setCli(c.data||[]);}).finally(()=>setBusy(false));
  },[queryBase]);

  const generar = async(tipo) => {
    setGenPDF(tipo);
    try{
      let path="";
      if(tipo==="paquete") path=`/api/reportes/paquete-cierre?${queryBase}`;
      if(tipo==="diario")  path=alcance==="anual"?`/api/reportes/diario-anual?${queryBase}`:`/api/reportes/diario?${queryBase}`;
      if(tipo==="estado")  path=`/api/reportes/estado-resultados?${queryBase}`;
      if(tipo==="itbms")   path=`/api/reportes/itbms?periodo=${periodo}`;
      if(tipo==="conciliacion") path=`/api/reportes/conciliacion?${queryBase}`;
      if(tipo==="balance") path=`/api/reportes/balance-comprobacion?${queryBase}`;
      if(tipo==="mayorGeneral") path=`/api/reportes/mayor-general?${queryBase}`;
      if(tipo==="cierre") path=`/api/reportes/cierre?${queryBase}`;
      if(tipo==="cierresClientes") path=`/api/reportes/cierres-clientes?${alcance==="anual"?`anio=${anio}`:`periodo=${periodo}`}`;
      if(tipo==="antiguedad") path=`/api/reportes/antiguedad?${queryBase}&tipo=todos`;
      if(tipo==="cliente"&&cliSel) path=`/api/reportes/cliente/${cliSel}?${alcance==="anual"?`anio=${anio}`:`periodo=${periodo}`}`;
      if(!path){alert("Selecciona un cliente para el reporte individual");return;}
      await api.pdf(path);
    }catch(e){alert("Error generando PDF: "+e.message);}
    finally{setGenPDF("");}
  };

  if(busy) return <Spinner/>;

  const ing=txns.filter(t=>t.tipo==="ingreso").reduce((s,t)=>s+parseFloat(t.monto),0);
  const gst=txns.filter(t=>t.tipo==="gasto").reduce((s,t)=>s+parseFloat(t.monto),0);
  const util=ing-gst;
  const margen=ing>0?((util/ing)*100).toFixed(1):0;
  const resumenPorCategoria = tipo => Object.values(txns.filter(t=>t.tipo===tipo).reduce((acc,t)=>{
    const id = t.categoria_contable || categoriaDefault(tipo);
    if(!acc[id]) acc[id]={id,label:categoriaContableLabel(id),monto:0,count:0};
    acc[id].monto += parseFloat(t.monto||0);
    acc[id].count += 1;
    return acc;
  },{})).sort((a,b)=>b.monto-a.monto);
  const resultadoPorCliente = Object.values(txns.reduce((acc,t)=>{
    const id = t.cliente_id || "sin-cliente";
    if(!acc[id]) {
      const cliente = clientes.find(c=>c.id===t.cliente_id);
      acc[id] = {
        id,
        nombre: t.cliente_nombre || cliente?.nombre || "Sin cliente",
        ruc: t.cliente_ruc || cliente?.ruc || "-",
        ingresos: 0,
        gastos: 0,
        itbmsDebito: 0,
        itbmsCredito: 0,
        movimientos: 0,
      };
    }
    const monto = parseFloat(t.monto||0);
    const itbms = parseFloat(t.itbms||0);
    if(t.tipo==="ingreso") {
      acc[id].ingresos += monto;
      acc[id].itbmsDebito += itbms;
    }
    if(t.tipo==="gasto") {
      acc[id].gastos += monto;
      if(t.deducible !== false) acc[id].itbmsCredito += itbms;
    }
    acc[id].movimientos += 1;
    return acc;
  },{})).map(r=>({
    ...r,
    utilidad: r.ingresos - r.gastos,
    margen: r.ingresos > 0 ? ((r.ingresos - r.gastos) / r.ingresos) * 100 : null,
    itbmsNeto: r.itbmsDebito - r.itbmsCredito,
  })).sort((a,b)=>b.utilidad-a.utilidad);
  const exportarClientesCSV = () => {
    const header = ["cliente","ruc","ingresos","gastos","utilidad","margen_pct","itbms_neto","movimientos"];
    const rows = resultadoPorCliente.map(r => [
      r.nombre,
      r.ruc,
      r.ingresos.toFixed(2),
      r.gastos.toFixed(2),
      r.utilidad.toFixed(2),
      r.margen===null ? "" : r.margen.toFixed(1),
      r.itbmsNeto.toFixed(2),
      r.movimientos,
    ]);
    downloadText(`resultado-clientes-${alcance==="anual"?anio:periodo}.csv`, [header, ...rows].map(row=>row.map(csvCell).join(",")).join("\n"));
  };

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:22,fontWeight:700,color:C.text}}>Reportes PDF Profesionales</div>
        <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Generación real de PDFs para diario, impuestos, conciliación, mayor, saldos y cierre CPA</div>
      </div>

      {/* Selector de período */}
      <Card style={{marginBottom:24}}>
        <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Período</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setAlcance("mensual")} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${alcance==="mensual"?C.accent:C.border}`,background:alcance==="mensual"?C.infoBg:C.surface,color:alcance==="mensual"?C.infoText:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Mes</button>
              <button onClick={()=>setAlcance("anual")} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${alcance==="anual"?C.accent:C.border}`,background:alcance==="anual"?C.infoBg:C.surface,color:alcance==="anual"?C.infoText:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>12 meses</button>
              {alcance==="mensual"
                ? <input type="month" value={periodo} onChange={e=>{setPeriodo(e.target.value);setAnio(e.target.value.slice(0,4));}} style={{...inpSt,width:160}}/>
                : <input type="number" min="2000" max="2100" value={anio} onChange={e=>setAnio(e.target.value)} style={{...inpSt,width:110}}/>
              }
            </div>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>Cliente</div>
            <select aria-label="Cliente de reportes" value={cliSel} onChange={e=>setCliSel(e.target.value)} style={{...inpSt,width:260}}>
              <option value="">Toda la cartera</option>
              {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Estado de resultados inline */}
      <Card style={{marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:20}}>Vista Previa - Estado de Resultados {labelPeriodo}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2px 1fr",gap:24}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.success,textTransform:"uppercase",marginBottom:12}}>Ingresos</div>
            {resumenPorCategoria("ingreso").map(c=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                <span style={{color:C.textMuted}}>{c.label} <span style={{color:C.textLight}}>({c.count})</span></span>
                <span style={{fontWeight:700}}>{fmt(c.monto)}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",fontSize:14,fontWeight:800}}>
              <span>Total Ingresos</span><span style={{color:C.success}}>{fmt(ing)}</span>
            </div>
          </div>
          <div style={{background:C.border}}/>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.danger,textTransform:"uppercase",marginBottom:12}}>Gastos y Costos</div>
            {resumenPorCategoria("gasto").map(c=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                <span style={{color:C.textMuted}}>{c.label} <span style={{color:C.textLight}}>({c.count})</span></span>
                <span style={{fontWeight:700}}>{fmt(c.monto)}</span>
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

      {/* Resultado por cliente */}
      <Card style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:16,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>Resultado por cliente</div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>{labelPeriodo} - {cliSel ? "cliente seleccionado" : "toda la cartera"}</div>
          </div>
          <Btn onClick={exportarClientesCSV} variant="secondary" disabled={resultadoPorCliente.length===0}>
            <Icon name="report" size={15}/>
            Exportar CSV
          </Btn>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:820}}>
            <thead>
              <tr style={{background:C.surfaceAlt,color:C.textMuted,textTransform:"uppercase",fontSize:11}}>
                <th style={{padding:"10px 12px",textAlign:"left",fontWeight:700}}>Cliente</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontWeight:700}}>RUC</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>Ingresos</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>Gastos</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>Utilidad</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>Margen</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>ITBMS neto</th>
                <th style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>Movs.</th>
              </tr>
            </thead>
            <tbody>
              {resultadoPorCliente.length===0 && (
                <tr>
                  <td colSpan={8} style={{padding:"20px 12px",textAlign:"center",color:C.textMuted}}>No hay movimientos para este alcance.</td>
                </tr>
              )}
              {resultadoPorCliente.map(r=>(
                <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"11px 12px",fontWeight:700,color:C.text}}>{r.nombre}</td>
                  <td style={{padding:"11px 12px",color:C.textMuted}}>{r.ruc}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:C.success,fontWeight:700}}>{fmt(r.ingresos)}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:C.danger,fontWeight:700}}>{fmt(r.gastos)}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:r.utilidad>=0?C.success:C.danger,fontWeight:800}}>{fmt(r.utilidad)}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:C.textMuted}}>{r.margen===null ? "-" : `${r.margen.toFixed(1)}%`}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:r.itbmsNeto>=0?C.warningText:C.successText,fontWeight:700}}>{fmt(r.itbmsNeto)}</td>
                  <td style={{padding:"11px 12px",textAlign:"right",color:C.textMuted}}>{r.movimientos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Botones PDF */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
        {[
          {id:"paquete", icon:"check", title:"Paquete de Cierre CPA", desc:alcance==="anual"?"Informe consolidado con checklist, bancos, saldos, clientes y resumen de 12 meses.":"Informe consolidado con checklist, bancos, saldos y revisión por cliente del mes.", color:"#0f172a"},
          {id:"diario",  icon:"journal", title:"Diario Combinado",        desc:alcance==="anual"?`Todos los asientos de ${anio}, enero a diciembre, agrupados por fecha.`:"Todos los asientos del período, agrupados por fecha. Listo para auditoría DGI.",           color:C.accent},
          {id:"estado",  icon:"trending",title:"Estado de Resultados",   desc:alcance==="anual"?"Ingresos, gastos y utilidad del año completo, con filtro por cliente si aplica.":"Ingresos, gastos y utilidad neta del periodo seleccionado.",           color:C.success},
          {id:"itbms",   icon:"tax",     title:"Declaración ITBMS (430)",desc:"Débito, crédito fiscal y saldo a pagar del mes seleccionado. Referencia al Formulario 430 de la DGI.",         color:"#7c3aed"},
          {id:"conciliacion", icon:"bank", title:"Conciliación Bancaria", desc:alcance==="anual"?"Saldos contables vs banco, diferencias y pendientes del año completo.":"Saldos contables vs banco, diferencias y pendientes del mes seleccionado.", color:"#0891b2"},
          {id:"balance", icon:"check", title:"Balance de Comprobación", desc:alcance==="anual"?"Débitos, créditos y diferencia contable del año completo.":"Débitos, créditos y diferencia contable del mes seleccionado.", color:"#0f766e"},
          {id:"mayorGeneral", icon:"report", title:"Mayor General", desc:alcance==="anual"?"Movimiento por cuenta contable para los 12 meses.":"Movimiento por cuenta contable del período seleccionado.", color:"#334155"},
          {id:"cierre", icon:"alert", title:"Revisión de Cierre CPA", desc:"Checklist de cierre, riesgos, saldos pendientes, ITBMS y control de partida doble.", color:"#d97706"},
          {id:"cierresClientes", icon:"users", title:"Cierre por Cliente", desc:"Estado de revisión por cliente, riesgo principal e ingresos/gastos por cartera.", color:"#2563eb"},
          {id:"antiguedad", icon:"calendar", title:"Antigüedad de Saldos", desc:"Cuentas por cobrar y por pagar por vencimiento para seguimiento de cobros y pagos.", color:"#be123c"},
          {id:"cliente", icon:"users",   title:"Reporte por Cliente",    desc:"Historial completo de transacciones para el cliente seleccionado arriba.",                  color:"#ec4899"},
        ].map(r=>(
          <div key={r.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24}}>
            <div style={{width:44,height:44,borderRadius:10,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <Icon name={r.icon} size={20} color={r.color}/>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{r.title}</div>
            <div style={{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:18}}>{r.desc}</div>
            <Btn aria-label={`Descargar ${r.title}`} onClick={()=>generar(r.id)} loading={genPDF===r.id} style={{background:r.color,color:"#fff",border:"none"}}>
              <Icon name="pdf" size={15} color="#fff"/>
              {genPDF===r.id?"Generando...":"Descargar PDF"}
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------
//  PROPUESTAS IA VIEW - Revision desde Orlando CPA OS
// --------------------------------------------------------------------------
const PropuestasIAView = () => {
  const [rows,setRows]=useState([]);
  const [busy,setBusy]=useState(true);
  const [err,setErr]=useState(null);
  const [selected,setSelected]=useState(null);
  const [converting,setConverting]=useState("");
  const [linking,setLinking]=useState("");
  const [rejecting,setRejecting]=useState("");
  const [auditRows,setAuditRows]=useState([]);
  const [auditBusy,setAuditBusy]=useState(false);

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{const r=await api.get("/api/integracion/propuestas");setRows(r.data||[]);}
    catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    let active=true;
    if(!selected){
      setAuditRows([]);
      setAuditBusy(false);
      return;
    }
    setAuditBusy(true);
    api.get(`/api/integracion/propuestas/${selected.id}/auditoria`)
      .then(r=>{if(active)setAuditRows(r.data||[]);})
      .catch(()=>{if(active)setAuditRows([]);})
      .finally(()=>{if(active)setAuditBusy(false);});
    return ()=>{active=false;};
  },[selected?.id]);

  const vinculadas = rows.filter(r=>r.cliente_id).length;
  const sinCliente = rows.filter(r=>!r.cliente_id).length;
  const aprobadas = rows.filter(r=>String(r.estado||"").includes("aprobada")).length;
  const docsCount = p => Array.isArray(p.payload?.documents) ? p.payload.documents.length : 0;
  const signalCount = p => (p.payload?.documents||[]).reduce((sum,d)=>sum+(Array.isArray(d.signals)?d.signals.length:0),0);
  const draftItemsCount = p => Array.isArray(p.payload?.proposal?.draftItems) ? p.payload.proposal.draftItems.length : 0;
  const canConvert = p => p?.cliente_id && draftItemsCount(p)>0 && !["aplicada_borrador","rechazada"].includes(p.estado);
  const proposalClient = p => p?.payload?.client || {};
  const proposalRuc = p => String(proposalClient(p).ruc||"").trim();
  const proposalHasUsableRuc = p => {
    const ruc=proposalRuc(p).toLowerCase();
    return ruc && !ruc.includes("pendiente") && !ruc.includes("sin ruc");
  };

  const vincularCliente = async p => {
    if(!p || p.cliente_id) return;
    const client=proposalClient(p);
    const nombre=String(client.name||"").trim();
    const ruc=proposalRuc(p);
    if(!nombre || !proposalHasUsableRuc(p)){
      alert("La propuesta no trae RUC confirmado. Registre o corrija el cliente antes de vincularla.");
      return;
    }
    if(!confirm(`¿Crear o vincular el cliente ${nombre} con RUC ${ruc}?`)) return;
    setLinking(p.id);
    try{
      const clientesResp=await api.get("/api/clientes");
      const clientes=clientesResp.data||[];
      let cliente=clientes.find(c=>String(c.ruc||"").toLowerCase()===ruc.toLowerCase())
        || clientes.find(c=>String(c.nombre||"").toLowerCase()===nombre.toLowerCase());
      if(!cliente){
        const created=await api.post("/api/clientes",{
          nombre,
          ruc,
          tipo:String(client.type||"").toLowerCase().includes("natural")?"natural":"jurídica",
          contribuyente_itbms:true,
          regimen_fiscal:"general",
          periodo_fiscal:"calendario",
          cierre_fiscal_mes:12,
          actividad:client.activity||p.payload?.work_order?.service||"",
          estado:"activo",
          telefono:client.phone||"",
          email:client.email||"",
          direccion:"",
        });
        cliente=created;
      }
      await api.post(`/api/integracion/propuestas/${p.id}/vincular-cliente`,{cliente_id:cliente.id});
      alert("Propuesta vinculada al cliente en ContaPanamá.");
      setSelected(null);
      await load();
    }catch(e){alert(e.message);}
    finally{setLinking("");}
  };

  const convertirBorrador = async p => {
    if(!canConvert(p)) return;
    if(!confirm(`¿Crear ${draftItemsCount(p)} transacción(es) en borrador desde esta propuesta?`)) return;
    setConverting(p.id);
    try{
      const r=await api.post(`/api/integracion/propuestas/${p.id}/convertir-borrador`,{});
      alert(`Borrador creado: ${r.total||0} transacción(es).`);
      setSelected(null);
      await load();
    }catch(e){alert(e.message);}
    finally{setConverting("");}
  };

  const rechazarPropuesta = async p => {
    if(!p || ["aplicada_borrador","aplicada_libro"].includes(p.estado)) return;
    const motivo=prompt("Motivo del rechazo para dejar evidencia de auditoría:");
    if(!motivo || motivo.trim().length<5) return;
    if(!confirm("¿Rechazar esta propuesta IA? No creará borradores contables.")) return;
    setRejecting(p.id);
    try{
      await api.post(`/api/integracion/propuestas/${p.id}/rechazar`,{motivo:motivo.trim()});
      alert("Propuesta rechazada y auditada.");
      setSelected(null);
      await load();
    }catch(e){alert(e.message);}
    finally{setRejecting("");}
  };

  const exportarAuditoria = p => {
    const header = ["fecha","accion","objeto","usuario_id","cliente_id","source_work_id","detalle"];
    const lines = auditRows.map(event => [
      event.created_at,
      event.accion,
      event.objeto_tipo,
      event.usuario_id || "",
      event.cliente_id || "",
      event.source_work_id || p.source_work_id,
      JSON.stringify(event.despues_json || event.antes_json || {}),
    ].map(csvCell).join(","));
    downloadText(`auditoria-propuesta-${p.source_work_id||p.id}.csv`, [header.join(","), ...lines].join("\n"));
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,gap:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Propuestas IA / Revisión CPA</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Trabajos aprobados en Orlando CPA OS recibidos para control contable.</div>
        </div>
        <Btn variant="secondary" onClick={load}><Icon name="refresh" size={16}/>Actualizar</Btn>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <KpiCard label="Propuestas" value={rows.length} sub="recibidas" icon="check" color={C.accent}/>
        <KpiCard label="Aprobadas CPA" value={aprobadas} sub="desde Orlando CPA OS" icon="lock" color={C.success}/>
        <KpiCard label="Con cliente" value={vinculadas} sub="vinculadas en ContaPanamá" icon="users" color={C.info}/>
        <KpiCard label="Por vincular" value={sinCliente} sub="requieren revisión" icon="bell" color={sinCliente?C.warning:C.success}/>
      </div>

      {busy?<Spinner/>:(
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{background:C.surfaceAlt}}>
                <tr>
                  <TH>Trabajo</TH><TH>Cliente</TH><TH>Tipo</TH><TH>Estado</TH><TH right>Partidas</TH><TH right>Docs</TH><TH right>Señales</TH><TH>Recibida</TH><TH>Acción</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map(p=>(
                  <tr key={p.id}>
                    <TD>
                      <div style={{fontWeight:700,color:C.text}}>{p.payload?.work_order?.service||p.tipo}</div>
                      <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{p.source_work_id}</div>
                    </TD>
                    <TD>
                      <div style={{fontWeight:600}}>{p.cliente_nombre||p.payload?.client?.name||"Cliente por vincular"}</div>
                      <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{p.cliente_ruc||p.payload?.client?.ruc||"Sin RUC confirmado"}</div>
                    </TD>
                    <TD>{p.tipo}</TD>
                    <TD><span style={{padding:"4px 9px",borderRadius:999,background:p.estado==="rechazada"?C.dangerBg:C.successBg,color:p.estado==="rechazada"?C.dangerText:C.successText,fontSize:11,fontWeight:800}}>{p.estado}</span></TD>
                    <TD style={{textAlign:"right"}}>{draftItemsCount(p)}</TD>
                    <TD style={{textAlign:"right"}}>{docsCount(p)}</TD>
                    <TD style={{textAlign:"right"}}><span style={{color:signalCount(p)?C.warningText:C.successText,fontWeight:700}}>{signalCount(p)}</span></TD>
                    <TD>{fmtDate(p.updated_at||p.created_at)}</TD>
                    <TD>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {!p.cliente_id&&<Btn variant="secondary" onClick={()=>vincularCliente(p)} loading={linking===p.id} disabled={!proposalHasUsableRuc(p)} style={{padding:"7px 12px",fontSize:12}}>Vincular</Btn>}
                        <Btn variant="secondary" onClick={()=>setSelected(p)} style={{padding:"7px 12px",fontSize:12}}>Ver</Btn>
                      </div>
                    </TD>
                  </tr>
                ))}
                {rows.length===0&&(
                  <tr><td colSpan={9} style={{textAlign:"center",padding:"40px",color:C.textMuted,fontSize:14}}>Aún no hay propuestas recibidas desde Orlando CPA OS.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selected&&(
        <Modal title="Detalle de propuesta IA" onClose={()=>setSelected(null)} width={820}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:18}}>
            <Card style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:8}}>Cliente</div>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>{selected.cliente_nombre||selected.payload?.client?.name||"Cliente por vincular"}</div>
              <div style={{fontSize:13,color:C.textMuted,marginTop:5}}>RUC: {selected.cliente_ruc||selected.payload?.client?.ruc||"pendiente"}</div>
            </Card>
            <Card style={{padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:8}}>Decisión CPA</div>
              <div style={{fontSize:16,fontWeight:800,color:C.success}}>{selected.payload?.work_order?.status||selected.estado}</div>
              <div style={{fontSize:13,color:C.textMuted,marginTop:5}}>{selected.payload?.work_order?.decision||"Sin comentario adicional"}</div>
            </Card>
          </div>

          <Card style={{padding:16,marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:10}}>Trabajo recibido</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,fontSize:13}}>
              <div><strong>Servicio:</strong> {selected.payload?.work_order?.service||selected.tipo}</div>
              <div><strong>Origen:</strong> {selected.source_system}</div>
              <div><strong>Trabajo:</strong> {selected.source_work_id}</div>
              <div><strong>Prioridad:</strong> {selected.payload?.work_order?.priority||"-"}</div>
              <div><strong>Vence:</strong> {selected.payload?.work_order?.due||"-"}</div>
              <div><strong>Última acción:</strong> {selected.payload?.work_order?.lastAction||"-"}</div>
            </div>
          </Card>

          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:10}}>Partidas contables propuestas</div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:18}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{background:C.surfaceAlt}}>
                <tr><TH>Fecha</TH><TH>Tipo</TH><TH>Descripción</TH><TH>Categoría</TH><TH right>Monto</TH><TH right>ITBMS</TH></tr>
              </thead>
              <tbody>
                {(selected.payload?.proposal?.draftItems||[]).map((item,idx)=>(
                  <tr key={`${item.descripcion||"item"}-${idx}`}>
                    <TD>{fmtDate(item.fecha)}</TD>
                    <TD>{item.tipo||"-"}</TD>
                    <TD>{item.descripcion||"-"}</TD>
                    <TD>{categoriaContableLabel(item.categoria_contable)||item.categoria_contable||"-"}</TD>
                    <TD style={{textAlign:"right",fontWeight:700}}>{fmt(Number(item.monto||0))}</TD>
                    <TD style={{textAlign:"right"}}>{fmt(Number(item.itbms||0))}</TD>
                  </tr>
                ))}
                {draftItemsCount(selected)===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:"24px",fontSize:13,color:C.textMuted}}>Esta propuesta todavía no trae partidas estructuradas para convertir en borrador.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:10}}>Documentos y señales</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {(selected.payload?.documents||[]).map(d=>(
              <div key={d.id||d.sha256} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:C.surfaceAlt}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontWeight:800,color:C.text}}>{d.name}</div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:3}}>SHA-256: {d.sha256||"no disponible"}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:800,color:C.textMuted}}>{d.status||"pendiente"}</span>
                </div>
                {!!d.signals?.length&&<div style={{marginTop:10,fontSize:12,color:C.warningText}}>Señales: {d.signals.join(" | ")}</div>}
                {!!d.validations?.length&&<div style={{marginTop:6,fontSize:12,color:C.successText}}>Validaciones: {d.validations.join(" | ")}</div>}
              </div>
            ))}
            {docsCount(selected)===0&&<div style={{fontSize:13,color:C.textMuted}}>Esta propuesta no trajo documentos vinculados.</div>}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:18,marginBottom:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:C.text}}>Trazabilidad operativa</div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>Eventos recibidos, vinculaciones y conversiones asociadas a esta propuesta.</div>
            </div>
            <Btn variant="secondary" onClick={()=>exportarAuditoria(selected)} disabled={!auditRows.length} style={{whiteSpace:"nowrap",padding:"8px 12px",fontSize:12}}>
              Exportar CSV
            </Btn>
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:18}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{background:C.surfaceAlt}}>
                <tr><TH>Fecha</TH><TH>Acción</TH><TH>Objeto</TH><TH>Detalle</TH></tr>
              </thead>
              <tbody>
                {auditRows.map(event=>(
                  <tr key={event.id}>
                    <TD>{fmtDate(event.created_at)}</TD>
                    <TD><span style={{fontWeight:800,color:C.text}}>{event.accion}</span></TD>
                    <TD>{event.objeto_tipo||"-"}</TD>
                    <TD>
                      <div style={{fontSize:12,color:C.textMuted,maxWidth:360,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {JSON.stringify(event.despues_json||event.antes_json||{})}
                      </div>
                    </TD>
                  </tr>
                ))}
                {auditBusy&&<tr><td colSpan={4} style={{textAlign:"center",padding:"18px",fontSize:13,color:C.textMuted}}>Cargando trazabilidad...</td></tr>}
                {!auditBusy&&!auditRows.length&&<tr><td colSpan={4} style={{textAlign:"center",padding:"18px",fontSize:13,color:C.textMuted}}>Sin eventos de auditoría para esta propuesta.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginTop:18,padding:"12px 14px",borderRadius:10,background:C.infoBg,color:C.infoText,fontSize:13,lineHeight:1.6}}>
            <span>
              {selected.estado==="aplicada_borrador"
                ? "Esta propuesta ya fue convertida en transacciones marcadas como borrador IA."
                : canConvert(selected)
                  ? "La conversión crea transacciones en estado borrador IA; no publica el libro definitivo."
                  : !selected.cliente_id
                    ? "Para convertir, primero vincule esta propuesta a un cliente con RUC confirmado."
                    : "Para convertir, la propuesta debe tener partidas contables estructuradas."}
            </span>
            {!selected.cliente_id&&(
              <Btn
                variant="secondary"
                onClick={()=>vincularCliente(selected)}
                loading={linking===selected.id}
                disabled={!proposalHasUsableRuc(selected)}
                style={{whiteSpace:"nowrap"}}
              >
                Vincular cliente
              </Btn>
            )}
            <Btn
              onClick={()=>convertirBorrador(selected)}
              loading={converting===selected.id}
              disabled={!canConvert(selected)}
              style={{whiteSpace:"nowrap"}}
            >
              Crear borrador contable
            </Btn>
            <Btn
              variant="secondary"
              onClick={()=>rechazarPropuesta(selected)}
              loading={rejecting===selected.id}
              disabled={["aplicada_borrador","aplicada_libro","rechazada"].includes(selected.estado)}
              style={{whiteSpace:"nowrap",borderColor:C.danger,color:C.dangerText}}
            >
              Rechazar
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  AUDITORIA VIEW
// --------------------------------------------------------------------------
const AuditoriaView = () => {
  const [rows,setRows]=useState([]);
  const [total,setTotal]=useState(0);
  const [busy,setBusy]=useState(true);
  const [err,setErr]=useState(null);
  const [modo,setModo]=useState("mensual");
  const [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));
  const [anio,setAnio]=useState(String(new Date().getFullYear()));
  const [accion,setAccion]=useState("");

  const query = `${modo==="anual"?`anio=${anio}`:`periodo=${periodo}`}${accion?`&accion=${encodeURIComponent(accion)}`:""}&limit=150`;
  const alcanceLabel = modo==="anual" ? `${anio} completo` : periodo;

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{
      const r=await api.get(`/api/auditoria?${query}`);
      setRows(r.data||[]);
      setTotal(r.total||0);
    }catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[query]);

  useEffect(()=>{load();},[load]);

  const acciones=[...new Set(rows.map(r=>r.accion).filter(Boolean))].sort();
  const resumen=rows.reduce((acc,row)=>{
    const key=row.accion||"sin_accion";
    acc[key]=(acc[key]||0)+1;
    return acc;
  },{});
  const objetoStats=rows.reduce((acc,row)=>{
    const key=row.objeto_tipo||"sin objeto";
    acc[key]=(acc[key]||0)+1;
    return acc;
  },{});
  const detalleEvento = ev => {
    const d = ev.despues_json || {};
    const a = ev.antes_json || {};
    if(ev.accion==="cliente_creado") return `Alta de cliente: ${d.nombre || ev.cliente_nombre || ""}`.trim();
    if(ev.accion==="cliente_actualizado") return `Perfil actualizado: ${d.nombre || ev.cliente_nombre || ""}`.trim();
    if(ev.accion==="cliente_eliminado") return `Cliente eliminado sin historial: ${a.nombre || ev.cliente_nombre || ""}`.trim();
    if(ev.accion==="transaccion_creada") return `Registro creado: ${d.descripcion || ""} ${d.tipo ? `(${d.tipo})` : ""}`.trim();
    if(ev.accion==="transaccion_actualizada") return `Registro actualizado: ${d.descripcion || a.descripcion || ""}`.trim();
    if(ev.accion==="transaccion_eliminada") return `Registro eliminado: ${a.descripcion || ""}`.trim();
    if(ev.accion==="conciliacion_bancaria_confirmada") return `Conciliación confirmada: ${d.banco || ""} ${d.monto_documento ? fmt(d.monto_documento) : ""}`.trim();
    if(ev.accion==="conciliacion_bancaria_reversada") return `Conciliación reversada: ${d.descripcion || a.descripcion || ""}`.trim();
    if(ev.accion==="propuesta_ia_recibida") return `Propuesta recibida: ${ev.source_work_id || ""}`.trim();
    if(ev.accion==="propuesta_vinculada_a_cliente") return `Propuesta vinculada a cliente: ${d.cliente_nombre || ev.cliente_nombre || ""}`.trim();
    if(ev.accion==="propuesta_convertida_a_borrador") return `Borrador contable creado desde propuesta: ${ev.source_work_id || ""}`.trim();
    return `${ev.objeto_tipo || "Evento"} ${ev.objeto_id || ""}`.trim();
  };

  const exportarCSV=()=>{
    const header=["fecha","accion","objeto","cliente","ruc","origen","work_id","detalle"];
    const lines=rows.map(ev=>[
      fmtDate(ev.created_at),
      ev.accion,
      ev.objeto_tipo,
      ev.cliente_nombre || "",
      ev.cliente_ruc || "",
      ev.source_system || "",
      ev.source_work_id || "",
      detalleEvento(ev),
    ].map(csvCell).join(","));
    downloadText(`auditoria-${alcanceLabel.replace(/\s+/g,"-")}.csv`, [header.map(csvCell).join(","), ...lines].join("\n"));
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:18,marginBottom:28,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Libro de Auditoría</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>Trazabilidad operativa de cambios, conciliaciones y aprobaciones - {alcanceLabel}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
            {["mensual","anual"].map(m=>(
              <button key={m} onClick={()=>setModo(m)} style={{padding:"8px 13px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
                {m==="mensual"?"Mes":"12 meses"}
              </button>
            ))}
          </div>
          {modo==="mensual"
            ? <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:160}}/>
            : <input type="number" min="2000" max="2100" value={anio} onChange={e=>setAnio(e.target.value)} style={{...inpSt,width:110}}/>
          }
          <Btn variant="secondary" onClick={exportarCSV} disabled={!rows.length}><Icon name="download" size={16}/>Exportar CSV</Btn>
          <Btn variant="secondary" onClick={load}><Icon name="refresh" size={16}/>Actualizar</Btn>
        </div>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
            <KpiCard label="Eventos encontrados" value={total} sub={`Mostrando ${rows.length}`} icon="lock" color={C.accent}/>
            <KpiCard label="Acciones distintas" value={Object.keys(resumen).length} sub="Tipos de evento" icon="report" color="#334155"/>
            <KpiCard label="Clientes tocados" value={new Set(rows.map(r=>r.cliente_id).filter(Boolean)).size} sub="Con referencia directa" icon="users" color={C.success}/>
            <KpiCard label="Origen externo" value={rows.filter(r=>r.source_system||r.source_work_id).length} sub="Propuestas/integraciones" icon="check" color="#7c3aed"/>
          </div>

          <Card style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:C.text}}>Filtros de revisión</div>
                <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>Filtra por tipo de acción registrada en auditoría.</div>
              </div>
              <select value={accion} onChange={e=>setAccion(e.target.value)} style={{...inpSt,width:280}}>
                <option value="">Todas las acciones</option>
                {acciones.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
              {Object.entries(resumen).slice(0,8).map(([name,count])=>(
                <span key={name} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:99,padding:"5px 10px",fontSize:12,color:C.textMuted,fontWeight:800}}>
                  {name}: {count}
                </span>
              ))}
              {Object.entries(objetoStats).slice(0,4).map(([name,count])=>(
                <span key={name} style={{background:C.infoBg,color:C.infoText,borderRadius:99,padding:"5px 10px",fontSize:12,fontWeight:800}}>
                  {name}: {count}
                </span>
              ))}
            </div>
          </Card>

          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:980}}>
                <thead>
                  <tr style={{background:C.surfaceAlt,color:C.textMuted,textTransform:"uppercase",fontSize:11}}>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Fecha</th>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Acción</th>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Objeto</th>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Cliente</th>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Origen</th>
                    <th style={{padding:"11px 12px",textAlign:"left"}}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(ev=>(
                    <tr key={ev.id} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"11px 12px",color:C.textMuted,whiteSpace:"nowrap"}}>{fmtDate(ev.created_at)}</td>
                      <td style={{padding:"11px 12px",fontWeight:800,color:C.text}}>{ev.accion}</td>
                      <td style={{padding:"11px 12px",color:C.textMuted}}>{ev.objeto_tipo||"-"}</td>
                      <td style={{padding:"11px 12px"}}>
                        <div style={{fontWeight:700,color:C.text}}>{ev.cliente_nombre||"-"}</div>
                        <div style={{fontSize:11,color:C.textLight}}>{ev.cliente_ruc||""}</div>
                      </td>
                      <td style={{padding:"11px 12px",color:C.textMuted}}>
                        <div>{ev.source_system||"-"}</div>
                        <div style={{fontSize:11,color:C.textLight}}>{ev.source_work_id||""}</div>
                      </td>
                      <td style={{padding:"11px 12px",color:C.textMuted,lineHeight:1.45}}>{detalleEvento(ev)}</td>
                    </tr>
                  ))}
                  {!rows.length&&(
                    <tr><td colSpan={6} style={{padding:"34px 12px",textAlign:"center",color:C.textMuted}}>No hay eventos de auditoría para este alcance.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  ALERTAS VIEW
// --------------------------------------------------------------------------
const AlertasView = () => {
  const [rows,setRows]=useState([]);
  const [busy,setBusy]=useState(true);
  const [err,setErr]=useState(null);
  const [modo,setModo]=useState("mensual");
  const [periodo,setPeriodo]=useState(new Date().toISOString().slice(0,7));
  const [anio,setAnio]=useState(String(new Date().getFullYear()));
  const [estado,setEstado]=useState("pendiente");
  const [clienteId,setClienteId]=useState("");
  const [clientes,setClientes]=useState([]);
  const [modal,setModal]=useState(false);
  const [genModal,setGenModal]=useState(false);
  const [genResult,setGenResult]=useState(null);
  const [saving,setSaving]=useState(false);
  const EMPTY={descripcion:"",entidad:"DGI",fecha:"",urgencia:"media",cliente_id:"",cliente_nombre:"Todos"};
  const [form,setForm]=useState(EMPTY);
  const [genForm,setGenForm]=useState({anio:String(new Date().getFullYear()),cliente_id:""});
  const query = `estado=${estado}${modo==="anual"?`&anio=${anio}`:`&periodo=${periodo}`}${clienteId?`&cliente_id=${clienteId}`:""}`;
  const alcanceLabel = modo==="anual" ? `${anio} completo` : periodo;
  const clienteLabel = clienteId ? clientes.find(c=>c.id===clienteId)?.nombre || "cliente seleccionado" : "toda la cartera";

  const load=useCallback(async()=>{
    setBusy(true);setErr(null);
    try{
      const [r,cl]=await Promise.all([
        api.get(`/api/vencimientos?${query}`),
        api.get("/api/clientes"),
      ]);
      setRows(r.data||[]);
      setClientes(cl.data||[]);
    }
    catch(e){setErr(e.message);}
    finally{setBusy(false);}
  },[query]);

  useEffect(()=>{load();},[load]);

  const completar=async id=>{await api.patch(`/api/vencimientos/${id}/completar`,{});load();};
  const eliminar =async id=>{await api.delete(`/api/vencimientos/${id}`);load();};
  const save=async()=>{
    setSaving(true);
    try{
      const cliente = clientes.find(c=>c.id===form.cliente_id);
      await api.post("/api/vencimientos",{...form,cliente_nombre:cliente?.nombre||form.cliente_nombre||"Todos"});
      setModal(false);setForm(EMPTY);load();
    }
    catch(e){alert(e.message);}
    finally{setSaving(false);}
  };
  const generarFiscal=async()=>{
    setSaving(true); setGenResult(null);
    try{
      const r=await api.post("/api/vencimientos/generar-fiscal",genForm);
      setGenResult(r);
      load();
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };
  const exportarCSV=()=>{
    const headers=["fecha","estado","completed_at","entidad","urgencia","cliente","descripcion"];
    const lines=rows.map(v=>[
      v.fecha,
      v.completado ? "completado" : "pendiente",
      v.completed_at || "",
      v.entidad,
      v.urgencia,
      v.cliente_nombre_real || v.cliente_nombre || "Todos",
      v.descripcion,
    ].map(csvCell).join(","));
    downloadText(`vencimientos-${estado}-${alcanceLabel.replace(/\s+/g,"-")}.csv`, [headers.map(csvCell).join(","), ...lines].join("\n"));
  };
  const pendientes=rows.filter(v=>!v.completado).length;
  const completados=rows.filter(v=>v.completado).length;
  const criticos=rows.filter(v=>v.urgencia==="critica"||v.urgencia==="alta").length;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,gap:16,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:C.text}}>Centro de Alertas</div>
          <div style={{fontSize:14,color:C.textMuted,marginTop:3}}>{rows.length} vencimiento(s) - {alcanceLabel} - {clienteLabel}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",background:C.surface}}>
            {["mensual","anual"].map(m=>(
              <button key={m} onClick={()=>setModo(m)} style={{padding:"8px 13px",border:"none",background:modo===m?C.infoBg:"transparent",color:modo===m?C.accent:C.textMuted,fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
                {m==="mensual"?"Mes":"12 meses"}
              </button>
            ))}
          </div>
          {modo==="mensual"
            ? <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...inpSt,width:150}}/>
            : <input type="number" min="2000" max="2100" value={anio} onChange={e=>setAnio(e.target.value)} style={{...inpSt,width:105}}/>
          }
          <select value={estado} onChange={e=>setEstado(e.target.value)} style={{...inpSt,width:150}}>
            <option value="pendiente">Pendientes</option>
            <option value="completado">Completadas</option>
            <option value="todos">Todas</option>
          </select>
          <select value={clienteId} onChange={e=>setClienteId(e.target.value)} style={{...inpSt,width:220}}>
            <option value="">Toda la cartera</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Btn variant="secondary" onClick={exportarCSV} disabled={!rows.length}><Icon name="download" size={16}/>CSV</Btn>
          <Btn variant="secondary" onClick={()=>{setGenResult(null);setGenModal(true);}}><Icon name="calendar" size={16}/>Generar fiscal</Btn>
          <Btn onClick={()=>setModal(true)}><Icon name="plus" size={16} color="#fff"/>Nueva Alerta</Btn>
        </div>
      </div>

      {err&&<ErrBox msg={err} onRetry={load}/>}
      {busy?<Spinner/>:(
        <>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:18}}>
          <KpiCard label="Vencimientos" value={rows.length} sub={estado} icon="bell" color={C.accent}/>
          <KpiCard label="Pendientes" value={pendientes} sub="Por cumplir" icon="alert" color={pendientes?C.warning:C.success}/>
          <KpiCard label="Completados" value={completados} sub="Con historial" icon="check" color={C.success}/>
          <KpiCard label="Alta prioridad" value={criticos} sub="Crítica o alta" icon="alert" color={criticos?C.danger:C.textMuted}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {rows.map(v=>{
            const bc={critica:C.danger,alta:C.warning,media:C.accent,baja:C.border}[v.urgencia];
            const bg=v.completado?C.successBg:{critica:C.dangerBg,alta:C.warningBg,media:C.infoBg,baja:C.surfaceAlt}[v.urgencia];
            return(
              <div key={v.id} style={{background:bg,border:`1px solid ${bc}44`,borderLeft:`4px solid ${bc}`,borderRadius:10,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <Icon name="bell" size={20} color={bc}/>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:C.text}}>{v.descripcion}</div>
                    <div style={{fontSize:12,color:C.textMuted,marginTop:3}}>{v.cliente_nombre_real||v.cliente_nombre||"Todos"} - {v.entidad}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>{fmtDate(v.fecha)}</div>
                    <span style={urgBadge(v.urgencia)}>{v.urgencia}</span>
                    {v.completado&&<div style={{fontSize:11,color:C.successText,fontWeight:800,marginTop:4}}>Completado {fmtDate(v.completed_at)}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {!v.completado&&<button onClick={()=>completar(v.id)} style={{background:C.successBg,border:"none",padding:"7px 9px",borderRadius:7,cursor:"pointer"}}><Icon name="check" size={14} color={C.success}/></button>}
                    <button onClick={()=>eliminar(v.id)}  style={{background:C.dangerBg,border:"none",padding:"7px 9px",borderRadius:7,cursor:"pointer"}}><Icon name="trash" size={14} color={C.dangerText}/></button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length===0&&<Card style={{textAlign:"center",color:C.textMuted,padding:"40px"}}>Sin vencimientos para este filtro</Card>}
        </div>
        </>
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
          <Fld label="Cliente">
            <select value={form.cliente_id} onChange={e=>setForm({...form,cliente_id:e.target.value,cliente_nombre:e.target.value?"":"Todos"})} style={inpSt}>
              <option value="">Toda la cartera</option>
              {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Fld>
          {!form.cliente_id&&<Fld label="Observación"><input value={form.cliente_nombre} onChange={e=>setForm({...form,cliente_nombre:e.target.value})} placeholder="Todos" style={inpSt}/></Fld>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} loading={saving}>Guardar Alerta</Btn>
          </div>
        </Modal>
      )}
      {genModal&&(
        <Modal title="Generar calendario fiscal" onClose={()=>setGenModal(false)} width={500}>
          <div style={{fontSize:12,color:C.textMuted,lineHeight:1.6,marginBottom:12}}>
            Crea vencimientos base de DGI para el año seleccionado. El sistema omite duplicados y guarda auditoría por cliente.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:16}}>
            <Fld label="Año"><input type="number" min="2000" max="2100" value={genForm.anio} onChange={e=>setGenForm({...genForm,anio:e.target.value})} style={inpSt}/></Fld>
            <Fld label="Cliente">
              <select value={genForm.cliente_id} onChange={e=>setGenForm({...genForm,cliente_id:e.target.value})} style={inpSt}>
                <option value="">Toda la cartera</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Fld>
          </div>
          {genResult&&(
            <div style={{marginTop:12,background:C.infoBg,border:`1px solid ${C.accent}33`,borderRadius:8,padding:12,fontSize:12,color:C.infoText}}>
              Clientes procesados: <strong>{genResult.total_clientes}</strong> - creadas: <strong>{genResult.total_creadas}</strong> - omitidas por duplicado: <strong>{genResult.total_omitidas}</strong>
            </div>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
            <Btn variant="secondary" onClick={()=>setGenModal(false)}>Cerrar</Btn>
            <Btn onClick={generarFiscal} loading={saving}><Icon name="calendar" size={16} color="#fff"/>Generar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
//  ROOT APP
// --------------------------------------------------------------------------
const AppShell = () => {
  const { user, loading, connectionError, retrySession, logout } = useAuth();
  const [view, setView]   = useState("control");

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}>
      <div style={{textAlign:"center",color:C.textMuted}}>
        <Icon name="refresh" size={32} color={C.accent}/><div style={{marginTop:12,fontSize:14}}>Cargando ContaPanamá...</div>
      </div>
    </div>
  );

  if (connectionError) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:24}}>
      <div style={{width:"100%",maxWidth:440,color:C.text,fontFamily:"sans-serif"}}>
        <h1 style={{fontSize:24,marginBottom:20}}>ContaPanamá</h1>
        <ErrBox msg={connectionError} onRetry={retrySession}/>
        <Btn variant="secondary" onClick={logout}>Iniciar otra sesión</Btn>
      </div>
    </div>
  );

  if (!user) return <AuthScreen/>;

  const VIEWS = {
    control:       <ControlCenterView setView={setView}/>,
    dashboard:     <DashboardView/>,
    clientes:      <ClientesView/>,
    transacciones: <TransaccionesView onNavigate={setView}/>,
    contabilidad:  <ContabilidadView/>,
    fiscal:        <FiscalView/>,
    conciliacion:  <ConciliacionView/>,
    propuestas:    <PropuestasIAView/>,
    reportes:      <ReportesView/>,
    auditoria:     <AuditoriaView/>,
    alertas:       <AlertasView/>,
  };

  return (
    <>
      <div style={{display:"flex",minHeight:"100vh",background:C.bg}}>
        <Sidebar active={view} setActive={setView}/>
        <main className="app-main" style={{marginLeft:230,flex:1,minWidth:0,padding:"36px 40px",minHeight:"100vh"}}>
          {VIEWS[view]||null}
        </main>
      </div>
    </>
  );
};

export default function App() {
  return (
    <>
      <style>{FONTS}</style>
      <style>{`*{font-family:'Plus Jakarta Sans',sans-serif;box-sizing:border-box;margin:0;padding:0;}input,select,textarea,button{font-family:inherit;}`}</style>
      <style>{`@media(max-width:700px){
        .app-sidebar{width:60px!important}.sidebar-brand{padding:18px 13px!important}
        .sidebar-brand-text,.app-sidebar .nav-label,.sidebar-user{display:none!important}
        .sidebar-navigation{padding:0 7px!important}.sidebar-navigation button{justify-content:center;padding:12px!important}
        .sidebar-footer{padding:12px 7px!important}.sidebar-footer button{justify-content:center}
        .app-main{margin-left:60px!important;padding:24px 12px!important;max-width:calc(100% - 60px)}
        .app-main input,.app-main select{max-width:100%}
        .contabilidad-view [style*="grid-template-columns"]{grid-template-columns:minmax(0,1fr)!important}
      }`}</style>
      <AuthProvider>
        <AppShell/>
      </AuthProvider>
    </>
  );
}
