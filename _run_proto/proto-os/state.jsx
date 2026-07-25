// Global app state — router, palette, notifications.

const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

const NAV_ITEMS = [
  { id: "dashboard",       label: "Hoy",             icon: "home",        section: "PRINCIPAL" },
  { id: "ai",              label: "ContaPanamá AI",  icon: "sparkles",    section: "PRINCIPAL", new: true },
  { id: "inbox",           label: "Inbox",           icon: "inbox",       section: "PRINCIPAL", alert: 8 },

  { id: "ops:finanzas:fin-cash",      label: "Finanzas",     icon: "wallet",       section: "OPERACIONES" },
  { id: "ops:ventas:ven-facturas",    label: "Ventas",       icon: "trendingUp",   section: "OPERACIONES" },
  { id: "ops:compras:com-prov",       label: "Compras",      icon: "send",         section: "OPERACIONES" },
  { id: "ops:inventario:inv-stock",   label: "Inventario",   icon: "layers",       section: "OPERACIONES" },
  { id: "ops:servicios:srv-contratos",label: "Servicios",    icon: "workflow",     section: "OPERACIONES" },
  { id: "ops:documentos:doc-ocr",     label: "Documentos",   icon: "documents",    section: "OPERACIONES" },

  { id: "empresas",        label: "Empresas",        icon: "building",    section: "INTELIGENCIA", count: 8 },
  { id: "industria",       label: "Industria",       icon: "layers",      section: "INTELIGENCIA", new: true },
  { id: "colab",           label: "Colaboración",    icon: "users",       section: "INTELIGENCIA" },
  { id: "automations",     label: "Automatizaciones",icon: "workflow",    section: "INTELIGENCIA", count: 12 },

  { id: "clientes",        label: "Clientes",        icon: "users",       section: "GESTIÓN", count: 47 },

  { id: "fiscal",          label: "Fiscal",          icon: "fiscal",      section: "CUMPLIMIENTO" },
  { id: "ops:itbms:it-f430",label: "ITBMS",          icon: "itbms",       section: "CUMPLIMIENTO", alert: 4 },
  { id: "declarations",    label: "Declaraciones",   icon: "declarations",section: "CUMPLIMIENTO" },
  { id: "dgi",             label: "DGI",             icon: "dgi",         section: "CUMPLIMIENTO" },
  { id: "municipios",      label: "Municipios",      icon: "municipios",  section: "CUMPLIMIENTO" },

  { id: "analytics",       label: "Analytics",       icon: "analytics",   section: "INSIGHTS" },
  { id: "mobile",          label: "App móvil",       icon: "zap",         section: "SISTEMA", new: true },
  { id: "settings",        label: "Configuración",   icon: "settings",    section: "SISTEMA" },
];

const AppProvider = ({ children }) => {
  const [view, setView] = React.useState("dashboard");
  const [palette, setPalette] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [aiQuery, setAiQuery] = React.useState(null);

  const showToast = (msg, opts = {}) => {
    const id = Date.now();
    setToast({ msg, id, ...opts });
    setTimeout(() => setToast(t => t && t.id === id ? null : t), opts.duration || 2400);
  };

  const navigate = (v, opts = {}) => {
    setView(v);
    setPalette(false);
    if (opts.aiQuery) setAiQuery(opts.aiQuery);
  };

  // Cmd+K / Ctrl+K opens command palette
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(p => !p);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AppCtx.Provider value={{
      view, navigate,
      palette, setPalette,
      showToast, toast,
      aiQuery, setAiQuery,
      navItems: NAV_ITEMS,
    }}>
      {children}
      {toast && (
        <div className="toast">
          {toast.icon && <window.Ico name={toast.icon} size={13} color="var(--gold)" />}
          {toast.msg}
        </div>
      )}
    </AppCtx.Provider>
  );
};

Object.assign(window, { AppProvider, useApp, NAV_ITEMS });
