// Global app state — auth, current view, modal stack, toasts, command palette,
// API mode (demo / live) and API client.

const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

// Persisted UI tweaks
const APP_TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "teal",
  "mode": "light",
  "density": "comfortable",
  "firmName": "Mi Despacho",
  "showOnboarding": false,
  "currency": "USD",
  "language": "es",
  "apiMode": "demo",
  "apiBase": "/api"
}/*EDITMODE-END*/;

// LocalStorage keys
const LS_TOKEN = "cp3_token";
const LS_USER = "cp3_user";
const LS_TWEAKS = "cp3_tweaks";

const AppProvider = ({ children }) => {
  const [user, setUser] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_USER) || "null"); } catch { return null; }
  });
  const [view, setView] = React.useState("dashboard");
  const [periodo, setPeriodo] = React.useState("2025-03");
  const [clienteId, setClienteId] = React.useState(null); // null = todos los clientes
  const [clienteNombre, setClienteNombre] = React.useState(null);
  const seleccionarCliente = (id, nombre) => { setClienteId(id || null); setClienteNombre(nombre || null); };
  const [onboarding, setOnboarding] = React.useState(false);
  const [palette, setPalette] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [tweaks, setTweaksState] = React.useState(() => {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(LS_TWEAKS) || "{}"); } catch { stored = {}; }
    // apiMode/apiBase los define el build (demo vs live); no se sobreescriben desde localStorage.
    return { ...APP_TWEAKS, ...stored, apiMode: APP_TWEAKS.apiMode, apiBase: APP_TWEAKS.apiBase };
  });

  // API client memoized on apiBase
  const api = React.useMemo(
    () => window.makeApi({
      baseUrl: tweaks.apiBase,
      getToken: () => localStorage.getItem(LS_TOKEN),
    }),
    [tweaks.apiBase]
  );

  const setTweak = (k, v) => {
    const edits = typeof k === "object" ? k : { [k]: v };
    setTweaksState(prev => {
      const next = { ...prev, ...edits };
      try {
        const { apiMode, apiBase, ...persist } = next; // no persistir infraestructura
        localStorage.setItem(LS_TWEAKS, JSON.stringify(persist));
      } catch (e) { /* ignore */ }
      return next;
    });
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    } catch (e) { /* not in host */ }
  };

  React.useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", tweaks.theme);
    html.setAttribute("data-mode", tweaks.mode);
    html.setAttribute("data-density", tweaks.density);
  }, [tweaks.theme, tweaks.mode, tweaks.density]);

  // Command palette shortcut
  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(p => !p);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Toast helper — id-based so stacked calls don't get blown away
  const toastIdRef = React.useRef(0);
  const showToast = (msg, opts = {}) => {
    const id = ++toastIdRef.current;
    setToast({ msg, id, ...opts });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), opts.duration || 2400);
  };

  // Login: live mode hits real backend; demo mode fakes it.
  const login = async (email, password) => {
    if (tweaks.apiMode === "live") {
      const { token, user } = await api.post("/auth/login", { email, password });
      localStorage.setItem(LS_TOKEN, token);
      localStorage.setItem(LS_USER, JSON.stringify(user));
      const u = mapUser(user);
      setUser(u);
      return u;
    } else {
      const u = {
        email, nombre: "Carlos Méndez", iniciales: "CM",
        licencia: "CPA · Demo", despacho: tweaks.firmName,
      };
      setUser(u);
      if (tweaks.showOnboarding) setOnboarding(true);
      return u;
    }
  };

  const register = async (nombre, email, password) => {
    if (tweaks.apiMode === "live") {
      const { token, user } = await api.post("/auth/register", { nombre, email, password });
      localStorage.setItem(LS_TOKEN, token);
      localStorage.setItem(LS_USER, JSON.stringify(user));
      const u = mapUser(user);
      setUser(u);
      setTweak("showOnboarding", true);
      setOnboarding(true);
      return u;
    } else {
      return login(email, password);
    }
  };

  const logout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    setUser(null); setView("dashboard");
  };

  const navigate = (v) => { setView(v); setPalette(false); };

  const value = {
    user, login, register, logout,
    view, navigate,
    periodo, setPeriodo,
    clienteId, clienteNombre, seleccionarCliente,
    onboarding, setOnboarding,
    palette, setPalette,
    toast, showToast,
    tweaks, setTweak,
    api,
    isLive: tweaks.apiMode === "live",
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toast && (
        <div className="toast">
          {toast.icon && <window.Ico name={toast.icon} size={14} color="var(--gold)" />}
          {toast.msg}
        </div>
      )}
    </AppCtx.Provider>
  );
};

const mapUser = (u) => ({
  email: u.email,
  nombre: u.nombre || "Usuario",
  iniciales: (u.nombre || "U").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(),
  licencia: u.rol ? `${u.rol.toUpperCase()} · Lic. ${u.id?.slice(0, 4) || "—"}` : "CPA",
  despacho: u.despacho || "Mi Despacho",
  rol: u.rol,
});

Object.assign(window, { AppProvider, useApp, AppCtx });
