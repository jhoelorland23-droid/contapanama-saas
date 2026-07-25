// Root app: handles auth gate, layout, screen routing, command palette, tweaks panel.

const Layout = () => {
  const { view, user, onboarding, palette } = window.useApp();

  if (!user) return <window.AuthScreen />;
  if (onboarding) return <window.Onboarding />;

  const SCREENS = {
    panel: window.ScreenPanel,
    dashboard: window.ScreenDashboard,
    diario: window.ScreenDiario,
    fiscal: window.ScreenFiscal,
    ocr: window.ScreenOCR,
    fe: window.ScreenFE,
    ai: window.ScreenAI,
    clientes: window.ScreenClientes,
    reportes: window.ScreenReportes,
  };
  const Screen = SCREENS[view] || window.ScreenPanel;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <window.Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>
        <Screen />
      </div>
      <window.CommandPalette />
    </div>
  );
};

// Tweaks UI — uses tweaks-panel.jsx controls
const TweaksUI = () => {
  const { tweaks, setTweak } = window.useApp();
  const { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakText, TweakSelect, TweakColor } = window;

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Backend" />
      <TweakRadio label="Modo" value={tweaks.apiMode}
        options={['demo', 'live']}
        onChange={v => setTweak('apiMode', v)} />
      <TweakText label="API base" value={tweaks.apiBase}
        onChange={v => setTweak('apiBase', v)} />

      <TweakSection label="Marca y despacho" />
      <TweakText label="Nombre del despacho" value={tweaks.firmName}
        onChange={v => setTweak('firmName', v)} />

      <TweakSection label="Apariencia" />
      <TweakRadio label="Tema" value={tweaks.theme}
        options={['teal', 'indigo', 'graphite']}
        onChange={v => setTweak('theme', v)} />
      <TweakRadio label="Modo" value={tweaks.mode}
        options={['light', 'dark']}
        onChange={v => setTweak('mode', v)} />
      <TweakRadio label="Densidad" value={tweaks.density}
        options={['compact', 'comfortable']}
        onChange={v => setTweak('density', v)} />

      <TweakSection label="Configuración" />
      <TweakSelect label="Moneda" value={tweaks.currency}
        options={['USD', 'PAB', 'EUR']}
        onChange={v => setTweak('currency', v)} />
      <TweakSelect label="Idioma" value={tweaks.language}
        options={[{ value: 'es', label: 'Español (Panamá)' }, { value: 'en', label: 'English' }]}
        onChange={v => setTweak('language', v)} />

      <TweakSection label="Flujo demo" />
      <TweakToggle label="Mostrar onboarding al login" value={tweaks.showOnboarding}
        onChange={v => setTweak('showOnboarding', v)} />
    </TweaksPanel>
  );
};

const Root = () => (
  <window.AppProvider>
    <Layout />
    <TweaksUI />
  </window.AppProvider>
);

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
