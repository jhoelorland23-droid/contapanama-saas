// App root

const App = () => {
  const { view } = window.useApp();

  return (
    <>
      {view === "dashboard"     && <window.Dashboard />}
      {view === "ai"            && <window.AICenter />}
      {view === "inbox"         && <window.ScreenInbox />}
      {view === "empresas"      && <window.ScreenEmpresas />}
      {view === "industria"     && <window.ScreenIndustria />}
      {view === "colab"         && <window.ScreenColaboracion />}
      {view.startsWith("ops:")  && <window.ScreenOperaciones />}
      {view === "clientes"      && <window.ScreenClientes />}
      {view === "fiscal"        && <window.ScreenFiscal />}
      {view === "itbms"         && <window.ScreenITBMS />}
      {view === "declarations"  && <window.ScreenDeclarations />}
      {view === "dgi"           && <window.ScreenDGI />}
      {view === "municipios"    && <window.ScreenMunicipios />}
      {view === "analytics"     && <window.ScreenAnalytics />}
      {view === "documents"     && <window.ScreenDocuments />}
      {view === "automations"   && <window.ScreenAutomations />}
      {view === "mobile"        && <window.ScreenMobile />}
      {view === "settings"      && <window.ScreenSettings />}
      <window.CommandPalette />
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <window.AppProvider><App /></window.AppProvider>
);
