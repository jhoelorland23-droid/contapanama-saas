// Global app state — router, user, toasts, drawer stack.

const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

const AppProvider = ({ children }) => {
  const [user, setUser] = React.useState(null);
  const [view, setViewState] = React.useState("hoy");
  const [onboarding, setOnboarding] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [drawer, setDrawer] = React.useState(null);
  const [achievement, setAchievement] = React.useState(null);
  const [sound, setSound] = React.useState(false); // sound off by default

  const showToast = (msg, opts = {}) => {
    const id = Date.now() + Math.random();
    setToast({ msg, id, ...opts });
    if (sound && opts.sound !== false) window.playPing(opts.kind || "ok");
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), opts.duration || 2600);
  };

  const celebrate = (title, sub) => {
    window.burstConfetti(28);
    if (sound) window.playPing("ok");
    setAchievement({ title, sub, icon: "shield" });
    setTimeout(() => setAchievement(null), 5400);
  };

  const navigate = (v) => {
    setViewState(v);
  };

  const login = (u, { skipOnboarding = false } = {}) => {
    setUser(u);
    if (!skipOnboarding) setOnboarding(true);
  };
  const logout = () => { setUser(null); setViewState("hoy"); };

  return (
    <AppCtx.Provider value={{
      user, login, logout,
      view, navigate,
      onboarding, setOnboarding,
      drawer, setDrawer,
      showToast, celebrate, sound, setSound,
    }}>
      {children}

      {toast && (
        <div className="toast">
          {toast.icon && <window.Ico name={toast.icon} size={13} color="var(--gold)" />}
          {toast.msg}
        </div>
      )}

      {achievement && (
        <window.Achievement {...achievement} onDismiss={() => setAchievement(null)} />
      )}
    </AppCtx.Provider>
  );
};

Object.assign(window, { AppProvider, useApp });
