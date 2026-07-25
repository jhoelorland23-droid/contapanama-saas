// Intelligence layer — features that emerged from competitive benchmarking.
// Inbox de alertas, Multi-empresa, Industria adaptive, Colaboración CPA+dueño.

// ─────────────────────────────────────────────────────────────────────
// INBOX · alertas inteligentes (inspired: Ramp + Mercury)
// ─────────────────────────────────────────────────────────────────────

const ScreenInbox = () => {
  const { navigate, showToast } = window.useApp();
  const [filter, setFilter] = React.useState("all");
  const [resolved, setResolved] = React.useState(new Set());

  const filtered = INBOX_ITEMS.filter(i => {
    if (resolved.has(i.id)) return filter === "resolved";
    if (filter === "all") return true;
    if (filter === "resolved") return false;
    return i.kind === filter;
  });

  return (
    <window.Shell active="inbox" topbar={
      <window.Topbar
        crumbs={["Inteligencia", "Inbox"]}
        hint={<>{INBOX_ITEMS.length - resolved.size} sin resolver · la IA filtró 47 ruidos</>}
        action={<>
          <button className="btn ghost"><window.Ico name="filter" size={13} />Reglas</button>
          <button className="btn ghost" onClick={() => setResolved(new Set(INBOX_ITEMS.map(i => i.id)))}>Marcar todo</button>
        </>}
      />
    }>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 40px 64px" }}>
        <div className="anim-in d1" style={{ marginBottom: 32 }}>
          <div className="eyebrow">· Inbox · curated por tu copiloto</div>
          <h1 style={{ fontSize: 44, lineHeight: 1.1, letterSpacing: "-0.025em", fontWeight: 600, marginTop: 12 }}>
            <span style={{ color: "var(--gold)" }}>{INBOX_ITEMS.length - resolved.size}</span> cosas que necesitan tus ojos.
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--text-3)", marginTop: 12, maxWidth: 600 }}>
            La IA revisó 247 movimientos esta semana. Solo {INBOX_ITEMS.length} merecen tu atención. El resto se archivó solo.
          </p>
        </div>

        {/* Filter chips */}
        <div className="anim-in d2" style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            ["all", "Todo", INBOX_ITEMS.length - resolved.size, null],
            ["critical", "Crítico", INBOX_ITEMS.filter(i => i.kind === "critical" && !resolved.has(i.id)).length, "var(--red)"],
            ["opportunity", "Oportunidad", INBOX_ITEMS.filter(i => i.kind === "opportunity" && !resolved.has(i.id)).length, "var(--gold)"],
            ["fiscal", "Fiscal", INBOX_ITEMS.filter(i => i.kind === "fiscal" && !resolved.has(i.id)).length, "var(--orange)"],
            ["pattern", "Patrones", INBOX_ITEMS.filter(i => i.kind === "pattern" && !resolved.has(i.id)).length, "var(--violet)"],
            ["resolved", "Resueltos", resolved.size, "var(--green)"],
          ].map(([id, label, count, color]) => (
            <div key={id} onClick={() => setFilter(id)} style={{
              padding: "6px 12px", borderRadius: 999,
              background: filter === id ? "var(--surface-3)" : "transparent",
              border: "1px solid " + (filter === id ? "var(--hairline-strong)" : "var(--hairline)"),
              fontSize: 12, fontWeight: filter === id ? 500 : 400,
              color: filter === id ? "var(--text)" : "var(--text-3)",
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6
            }}>
              {color && <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />}
              {label}
              <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{count}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="anim-in d3" style={{ display: "flex", flexDirection: "column" }}>
          {filtered.map(i => <InboxRow key={i.id} item={i} resolved={resolved.has(i.id)} onResolve={() => {
            setResolved(s => new Set(s).add(i.id));
            showToast(`Resuelto · ${i.t}`, { icon: "check" });
          }} />)}
          {filtered.length === 0 && (
            <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
              No hay nada que ver acá. Todo está resuelto.
            </div>
          )}
        </div>
      </div>
    </window.Shell>
  );
};

const INBOX_ITEMS = [
  { id: 1, kind: "critical", icon: "shield", t: "Constructora Istmo no presentó ITBMS de febrero", sub: "Riesgo: $1,200 de multa si no se regulariza esta semana.", action: "Generar atraso", money: 1200, time: "hace 2h" },
  { id: 2, kind: "opportunity", icon: "trendingUp", t: "Detecté 3 suscripciones duplicadas en Café del Casco", sub: "Adobe Creative Cloud, Spotify Business, y Slack Pro. $189/mes de gasto innecesario.", action: "Cancelar duplicados", money: 2268, time: "hace 4h" },
  { id: 3, kind: "fiscal", icon: "fiscal", t: "Maersk emitió FE-2452 sin tu RUC", sub: "El cliente la registró bien, pero no podés deducir el ITBMS. Solicitar corrección.", action: "Pedir corrección", money: 209, time: "hace 6h" },
  { id: 4, kind: "pattern", icon: "sparkles", t: "Gasto en 'Atención a clientes' subió 2.1× este mes", sub: "Felipe Motta $312 promedio histórico era $145. Vale validar.", action: "Investigar", money: null, time: "hace 1d" },
  { id: 5, kind: "opportunity", icon: "zap", t: "$840 de crédito fiscal sin reclamar en Marina del Pacífico", sub: "3 gastos sin factura del proveedor. Redacté el correo.", action: "Enviar correo", money: 840, time: "hace 1d" },
  { id: 6, kind: "pattern", icon: "trendingUp", t: "Tech Solutions PA cierra esta semana", sub: "Onboarding al 80%. Necesita firmar el contrato.", action: "Enviar recordatorio", money: 2200, time: "hace 1d" },
  { id: 7, kind: "fiscal", icon: "calendar", t: "Aviso de Operación de Boutique Centro vence en 60 días", sub: "Trámite en línea con el MICI. Tiempo estimado: 15 minutos.", action: "Programar trámite", money: null, time: "hace 2d" },
  { id: 8, kind: "critical", icon: "alert", t: "Factura potencialmente duplicada · Office Depot", sub: "Mismo monto ($420.50), mismo día, FE consecutivas. Cobro doble o descuido.", action: "Validar con proveedor", money: 420.50, time: "hace 2d" },
];

const InboxRow = ({ item, resolved, onResolve }) => {
  const tones = {
    critical: { color: "var(--red)", bg: "var(--red-soft)" },
    opportunity: { color: "var(--gold)", bg: "var(--gold-soft)" },
    fiscal: { color: "var(--orange)", bg: "var(--orange-soft)" },
    pattern: { color: "var(--violet)", bg: "var(--violet-soft)" },
  };
  const t = tones[item.kind] || tones.pattern;

  return (
    <div style={{
      display: "flex", gap: 18, padding: "22px 8px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      opacity: resolved ? 0.4 : 1,
      transition: "opacity .3s"
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: t.bg, color: t.color,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <window.Ico name={item.icon} size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 14.5, color: "var(--text)", fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{item.t}</div>
          {item.money && <span className="mono" style={{ fontSize: 12, color: t.color, fontWeight: 600 }}>${item.money.toLocaleString()}</span>}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 5, lineHeight: 1.5, maxWidth: 580 }}>{item.sub}</div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onResolve} disabled={resolved} style={{
            padding: "5px 12px", borderRadius: 7,
            background: t.color, color: "#0A0A0B", border: 0,
            fontSize: 11.5, fontWeight: 600, cursor: resolved ? "default" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 5
          }}>
            <window.Ico name="check" size={10} stroke={2.4} />
            {resolved ? "Resuelto" : item.action}
          </button>
          <button style={{ padding: "5px 10px", borderRadius: 7, background: "transparent", color: "var(--text-3)", border: 0, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>Posponer</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--text-5)" }}>{item.time}</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// MULTI-EMPRESA (inspired: NetSuite, but usable)
// ─────────────────────────────────────────────────────────────────────

const ScreenEmpresas = () => {
  const { showToast } = window.useApp();
  const [search, setSearch] = React.useState("");

  return (
    <window.Shell active="empresas" topbar={
      <window.Topbar
        crumbs={["Inteligencia", "Empresas"]}
        hint="Gestión multi-empresa · 8 entidades activas"
        action={<button className="btn gold"><window.Ico name="plus" size={13} />Nueva empresa</button>}
      />
    }>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 64px" }}>
        <div className="anim-in d1" style={{ marginBottom: 32 }}>
          <div className="eyebrow">· Multi-empresa · consolidación</div>
          <h1 style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.025em", fontWeight: 600, marginTop: 12 }}>
            <span style={{ color: "var(--gold)" }}>8 empresas</span> · una vista.
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--text-3)", marginTop: 12, maxWidth: 580 }}>
            Cada negocio con su propio libro contable, su propia DGI, su propio equipo. Consolidación automática.
          </p>
        </div>

        {/* Aggregated metrics */}
        <div className="anim-in d2" style={{
          padding: "28px 32px", borderRadius: 18,
          background: "var(--glass-2)", backdropFilter: "blur(20px)",
          border: "1px solid var(--hairline)", marginBottom: 22
        }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>· Consolidado · marzo 2026</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            <Agg k="Facturación total" v="$842k" tone="var(--gold)" sub="+18% vs feb" />
            <Agg k="Empresas activas" v="8" sub="2 en crecimiento" />
            <Agg k="ITBMS consolidado" v="$58,940" sub="próximo vencimiento sáb" />
            <Agg k="Salud fiscal" v="100%" tone="var(--green)" sub="todas al día" />
          </div>
        </div>

        {/* Companies */}
        <div className="anim-in d3" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {EMPRESAS.map(e => (
            <div key={e.id} style={{
              padding: "20px 22px", borderRadius: 14,
              background: "var(--surface)", border: "1px solid var(--hairline)",
              cursor: "pointer", transition: "all .15s"
            }} onMouseEnter={el => { el.currentTarget.style.borderColor = "var(--hairline-strong)"; el.currentTarget.style.transform = "translateY(-1px)"; }}
               onMouseLeave={el => { el.currentTarget.style.borderColor = "var(--hairline)"; el.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9,
                  background: e.gradient, color: "#0A0A0B",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700
                }}>{e.abbr}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{e.ruc} · {e.industry}</div>
                </div>
                <window.Pill tone={e.health === "ok" ? "green" : e.health === "warn" ? "orange" : "red"} dot>
                  {e.health === "ok" ? "Al día" : e.health === "warn" ? "Revisar" : "Atención"}
                </window.Pill>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                <Mini k="MRR" v={`$${(e.mrr/1000).toFixed(0)}k`} />
                <Mini k="Empleados" v={e.staff} />
                <Mini k="ITBMS mar" v={`$${e.itbms.toLocaleString()}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </window.Shell>
  );
};

const EMPRESAS = [
  { id: 1, name: "Méndez & Asociados", abbr: "M",  ruc: "155-987-1-2026", industry: "Firma contable",     mrr: 284, staff: 8, itbms: 12480, health: "ok",   gradient: "linear-gradient(135deg, #D4A86A, #B98C4D)" },
  { id: 2, name: "Roastería del Casco", abbr: "RC", ruc: "155-321-4-2024", industry: "Restaurante / café", mrr: 64,  staff: 5, itbms: 2840,  health: "ok",   gradient: "linear-gradient(135deg, #FF7849, #E25C2D)" },
  { id: 3, name: "Marina del Pacífico", abbr: "MP", ruc: "155-654-2-2023", industry: "Turismo",            mrr: 84,  staff: 4, itbms: 5860,  health: "warn", gradient: "linear-gradient(135deg, #4ADE80, #2A9D5C)" },
  { id: 4, name: "Inversiones del Sur", abbr: "IS", ruc: "155-998-3-2022", industry: "Holding",            mrr: 142, staff: 2, itbms: 9920,  health: "ok",   gradient: "linear-gradient(135deg, #60A5FA, #3B82F6)" },
  { id: 5, name: "Tech Solutions PA",   abbr: "TS", ruc: "155-445-1-2025", industry: "Agencia software",  mrr: 92,  staff: 6, itbms: 6440,  health: "ok",   gradient: "linear-gradient(135deg, #A78BFA, #8B5CF6)" },
  { id: 6, name: "Café del Casco",      abbr: "CC", ruc: "155-112-5-2024", industry: "Cafetería",          mrr: 48,  staff: 3, itbms: 2880,  health: "ok",   gradient: "linear-gradient(135deg, #F87171, #DC2626)" },
  { id: 7, name: "Boutique Centro",     abbr: "BC", ruc: "155-883-2-2025", industry: "Retail moda",        mrr: 32,  staff: 2, itbms: 1920,  health: "warn", gradient: "linear-gradient(135deg, #D4A86A, #B98C4D)" },
  { id: 8, name: "Logística Atlántico", abbr: "LA", ruc: "155-771-9-2023", industry: "Logística",          mrr: 96,  staff: 12, itbms: 16800, health: "ok",  gradient: "linear-gradient(135deg, #60A5FA, #3B82F6)" },
];

const Agg = ({ k, v, sub, tone }) => (
  <div>
    <div className="eyebrow">{k}</div>
    <div className="num" style={{ fontSize: 32, fontWeight: 600, marginTop: 6, color: tone || "var(--text)", letterSpacing: "-0.02em" }}>{v}</div>
    <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>{sub}</div>
  </div>
);

const Mini = ({ k, v }) => (
  <div>
    <div style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{k}</div>
    <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{v}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// INDUSTRIA · adaptive UX (inspired: Mercury "modes")
// ─────────────────────────────────────────────────────────────────────

const ScreenIndustria = () => {
  const { showToast } = window.useApp();
  const [active, setActive] = React.useState("restaurante");

  const config = INDUSTRIAS[active];

  return (
    <window.Shell active="industria" topbar={
      <window.Topbar
        crumbs={["Inteligencia", "Industria"]}
        hint="Adapta el OS a cómo trabajás · 9 perfiles"
      />
    }>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 64px" }}>
        <div className="anim-in d1" style={{ marginBottom: 36 }}>
          <div className="eyebrow">· Modo industria · "esto fue diseñado para mí"</div>
          <h1 style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.025em", fontWeight: 600, marginTop: 12 }}>
            El OS <span style={{ background: "linear-gradient(135deg, #D4A86A, #FF7849)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>se moldea</span> a tu negocio.
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--text-3)", marginTop: 12, maxWidth: 620 }}>
            Cada industria tiene su propio dashboard, sus propios reportes, su propio lenguaje. La IA aprende cómo opera tu industria.
          </p>
        </div>

        {/* Industry picker */}
        <div className="anim-in d2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 32 }}>
          {Object.entries(INDUSTRIAS).map(([id, ind]) => (
            <div key={id} onClick={() => setActive(id)} style={{
              padding: "16px 18px", borderRadius: 12,
              background: active === id ? `${ind.color}12` : "var(--surface)",
              border: "1px solid " + (active === id ? `${ind.color}40` : "var(--hairline)"),
              cursor: "pointer", transition: "all .15s",
              display: "flex", alignItems: "center", gap: 12
            }}>
              <div style={{ fontSize: 22 }}>{ind.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: active === id ? ind.color : "var(--text)" }}>{ind.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{ind.users} usando</div>
              </div>
              {active === id && <window.Ico name="check" size={13} color={ind.color} />}
            </div>
          ))}
        </div>

        {/* Preview of how industry adapts the OS */}
        <div className="anim-in" key={active} style={{
          padding: "32px 36px", borderRadius: 18,
          background: `linear-gradient(180deg, ${config.color}08 0%, var(--surface) 80%)`,
          border: `1px solid ${config.color}20`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
            <div style={{ fontSize: 32 }}>{config.emoji}</div>
            <div>
              <div style={{ fontSize: 11, color: config.color, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Modo activo</div>
              <div className="h1" style={{ marginTop: 2 }}>{config.label}</div>
            </div>
          </div>

          <p style={{ fontSize: 14.5, color: "var(--text-2)", lineHeight: 1.6, maxWidth: 620 }}>
            {config.pitch}
          </p>

          <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 22 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>· Pantallas adaptadas</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {config.screens.map((s, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 4, height: 4, borderRadius: 999, background: config.color }} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>· KPIs específicos</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {config.kpis.map((k, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 4, height: 4, borderRadius: 999, background: config.color }} />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ marginTop: 28, padding: "14px 18px", borderRadius: 10, background: "var(--glass)", border: "1px solid var(--hairline)", display: "flex", gap: 12, alignItems: "center" }}>
            <window.Ico name="sparkles" size={13} color={config.color} />
            <div style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>
              <b style={{ color: "var(--text)" }}>IA específica:</b> {config.aiHook}
            </div>
          </div>
        </div>
      </div>
    </window.Shell>
  );
};

const INDUSTRIAS = {
  restaurante: {
    label: "Restaurante / Café",
    emoji: "🍽️", color: "#FF7849", users: "142 empresas",
    pitch: "Tu OS sabe que el lunes vendés menos que el viernes y que la inflación de carne te aprieta el margen. Te muestra ventas por hora, costo de mercaderías, propinas separadas del income.",
    screens: ["Cuenta diaria de caja", "Cierre de turno", "POS integrado", "Costos por plato", "Mermas e inventario perecedero"],
    kpis: ["Ticket promedio", "Costo de mercaderías", "Margen por plato", "Propinas separadas", "Ocupación por turno"],
    aiHook: "Detecto cuando un proveedor sube precio, sugiero alternativas, alerto si el food cost pasa del 32%.",
  },
  retail: {
    label: "Retail / Tienda",
    emoji: "🛍️", color: "#D4A86A", users: "98 empresas",
    pitch: "Inventario por SKU, kardex automático, ventas por categoría, comparativos de stock. La IA detecta cuándo reordenar antes de que te quedés sin stock.",
    screens: ["Stock multi-bodega", "POS retail", "Ventas por categoría", "Reorder points", "Devoluciones"],
    kpis: ["Stock turnover", "Margen por SKU", "Días de inventario", "Top sellers", "Stockouts"],
    aiHook: "Te aviso 7 días antes de que un SKU caiga bajo el mínimo. Aprendo de la estacionalidad.",
  },
  agencia: {
    label: "Agencia / Servicios",
    emoji: "💼", color: "#A78BFA", users: "187 empresas",
    pitch: "Tu negocio son proyectos y horas. El OS rastrea utilización del equipo, rentabilidad por proyecto, retainer fees, y te avisa cuando un proyecto se está pasando del presupuesto.",
    screens: ["Pipeline proyectos", "Time tracking", "Rentabilidad por cliente", "Retainers", "Capacidad equipo"],
    kpis: ["Utilización del equipo", "Rentabilidad proyecto", "MRR retainers", "Days outstanding", "Pipeline value"],
    aiHook: "Aviso cuando un proyecto se está sobrepasando del presupuesto antes de que duela.",
  },
  freelance: {
    label: "Freelance / Independiente",
    emoji: "✨", color: "#4ADE80", users: "64 empresas",
    pitch: "Vos cobrás, vos pagás impuestos, vos no querés pensar. El OS calcula tu renta natural en tiempo real, separa el ITBMS, te dice cuánto guardar para impuestos.",
    screens: ["Cobros por proyecto", "Renta proyectada", "Apartado fiscal", "Facturas rápidas"],
    kpis: ["Ingresos del mes", "Impuestos apartados", "Días sin pago", "Top clientes"],
    aiHook: "Te muestro cuánto plata es 'tuya' después de impuestos. Apartado fiscal automático.",
  },
  construccion: {
    label: "Construcción",
    emoji: "🏗️", color: "#60A5FA", users: "47 empresas",
    pitch: "Cada obra es un centro de costo. Subcontratistas, materiales, retenciones de garantía. El OS sigue cada peso por obra.",
    screens: ["Obras activas", "Costos por obra", "Retenciones", "Subcontratistas", "Avance vs presupuesto"],
    kpis: ["Margen por obra", "Subcontratistas vigentes", "Avance vs plan", "Retenciones acumuladas"],
    aiHook: "Detecto cuando una obra está perdiendo plata vs el presupuesto inicial.",
  },
  ecommerce: {
    label: "E-commerce",
    emoji: "📦", color: "#F87171", users: "84 empresas",
    pitch: "Conexión directa con Shopify, MercadoLibre, Amazon. Cada venta se contabiliza sola, cada devolución cuadra automática.",
    screens: ["Multi-canal", "Conciliación gateways", "Devoluciones", "Costos de envío", "ROAS por canal"],
    kpis: ["CAC por canal", "Margen neto por SKU", "Tasa devolución", "Tiempo de envío"],
    aiHook: "Cruzo tu Shopify/ML con tu banco. Sé cuándo un pago de marketplace no llegó.",
  },
  profesional: {
    label: "Profesional · Médico / Legal",
    emoji: "⚖️", color: "#D4A86A", users: "92 empresas",
    pitch: "Facturación por hora, retención profesional 7%, gastos deducibles según especialidad. Reportes que necesita tu colegio profesional.",
    screens: ["Honorarios por consulta", "Retenciones profesionales", "Gastos deducibles", "Pacientes/clientes"],
    kpis: ["Honorarios del mes", "Retenciones DGI", "Pacientes nuevos vs recurrentes"],
    aiHook: "Identifico todos los gastos deducibles que se te pasan: cursos, suscripciones, equipos.",
  },
  cpa: {
    label: "Firma contable / Auditoría",
    emoji: "📊", color: "#A78BFA", users: "23 firmas",
    pitch: "Vista multi-cliente, batch de declaraciones, control de calidad por cliente, equipo de senior/junior CPAs.",
    screens: ["Multi-cliente", "Batch F.430", "Control de calidad", "Equipo CPA", "Pipeline de clientes"],
    kpis: ["Clientes activos", "F.430 al día", "Errores detectados", "Tiempo por cierre"],
    aiHook: "Sé cuál cliente necesita más tu atención esta semana antes de que vos lo notes.",
  },
  importadora: {
    label: "Importadora / Mayorista",
    emoji: "🚢", color: "#FF7849", users: "38 empresas",
    pitch: "Pólizas de importación, costo en aduana, tipo de cambio, márgenes mayoristas. Multi-bodega.",
    screens: ["Pólizas de importación", "Costos en aduana", "Multi-bodega", "Conversión de monedas"],
    kpis: ["Margen mayorista", "Costo aduanal por SKU", "Días en aduana"],
    aiHook: "Calculo el costo real en aduana incluyendo aranceles y ITBMS de importación.",
  },
};

// ─────────────────────────────────────────────────────────────────────
// COLABORACIÓN · CPA + dueño en vivo
// ─────────────────────────────────────────────────────────────────────

const ScreenColaboracion = () => {
  return (
    <window.Shell active="colab" topbar={
      <window.Topbar
        crumbs={["Inteligencia", "Colaboración"]}
        hint="Tu equipo conectado · dueño + CPA + asistentes"
      />
    }>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 64px" }}>
        <div className="anim-in d1" style={{ marginBottom: 32 }}>
          <div className="eyebrow">· Colaboración · dueño + CPA + equipo</div>
          <h1 style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.025em", fontWeight: 600, marginTop: 12 }}>
            Tu negocio y tu contador,<br/>
            <span style={{ background: "linear-gradient(135deg, #D4A86A, #FF7849)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>en la misma pantalla</span>.
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--text-3)", marginTop: 12, maxWidth: 600 }}>
            Sin Excel, sin idas y vueltas. Ambos ven los mismos números, chatean, firman, cierran el mes juntos.
          </p>
        </div>

        {/* Team */}
        <div className="anim-in d2" style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>· Tu equipo · 5 personas conectadas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {TEAM.map(p => (
              <div key={p.id} style={{
                padding: "20px 16px", borderRadius: 14,
                background: "var(--surface)", border: "1px solid var(--hairline)",
                textAlign: "center"
              }}>
                <div style={{
                  width: 56, height: 56, margin: "0 auto 12px", borderRadius: "50%",
                  background: p.gradient, color: "#0A0A0B",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, position: "relative"
                }}>
                  {p.initials}
                  {p.live && (
                    <span className="breathe" style={{
                      position: "absolute", bottom: 0, right: 4,
                      width: 12, height: 12, borderRadius: 999,
                      background: "var(--green)",
                      border: "3px solid var(--surface)"
                    }} />
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 3 }}>{p.role}</div>
                <window.Pill tone={p.access === "owner" ? "gold" : p.access === "cpa" ? "violet" : "ghost"} style={{ marginTop: 10 }}>{p.label}</window.Pill>
              </div>
            ))}
          </div>
        </div>

        {/* Live activity */}
        <div className="anim-in d3" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          <div style={{
            padding: "24px 28px", borderRadius: 16,
            background: "var(--surface)", border: "1px solid var(--hairline)"
          }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>· Conversación viva · Carlos ↔ Roberto</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Msg who="cpa" name="Carlos" t="Roberto, revisé marzo. ITBMS listo en $1,032. Apruébalo y firma." time="11:14" />
              <Msg who="me" name="Tú" t="Le doy. Una pregunta — ¿la cuenta Yappy va como ingreso o caja chica?" time="11:18" />
              <Msg who="cpa" name="Carlos" t="Como caja menor. La separé en el catálogo como 1102. Ya queda contabilizada automático." time="11:22" />
              <Msg who="ai" name="IA" t="Ajusté la clasificación retroactiva. 12 transacciones de Yappy ahora aparecen como caja menor. 0 movimientos perdidos." time="11:23" />
              <Msg who="me" name="Tú" t="Perfecto. Procedo con el ITBMS." time="11:30" />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              padding: "22px 24px", borderRadius: 14,
              background: "var(--surface)", border: "1px solid var(--hairline)"
            }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>· Próximas firmas</div>
              {[
                ["ITBMS marzo · F.430", "espera tu firma", "amber"],
                ["Cierre mensual marzo", "tras ITBMS", "ghost"],
                ["Renta natural 2025", "firmado ✓", "green"],
              ].map(([t, sub, tone], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i === 2 ? 0 : "1px solid var(--hairline)" }}>
                  <window.Pill tone={tone} dot>·</window.Pill>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              padding: "22px 24px", borderRadius: 14,
              background: "linear-gradient(135deg, rgba(212,168,106,0.06), transparent)",
              border: "1px solid rgba(212,168,106,0.2)"
            }}>
              <div className="eyebrow" style={{ color: "var(--gold)" }}>· Loop sin fricción</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8, lineHeight: 1.4 }}>
                Carlos te cobra $200/mes.
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8, lineHeight: 1.5 }}>
                Sin Excel, sin idas y vueltas. Cierre continuo. Ambos ganan tiempo, ambos están más tranquilos.
              </div>
            </div>
          </div>
        </div>
      </div>
    </window.Shell>
  );
};

const TEAM = [
  { id: 1, name: "Roberto V.",  initials: "RV", role: "Dueño",         label: "Owner",  access: "owner", gradient: "linear-gradient(135deg, #D4A86A, #B98C4D)", live: true },
  { id: 2, name: "Carlos M.",   initials: "CM", role: "CPA · firma externa", label: "CPA", access: "cpa", gradient: "linear-gradient(135deg, #A78BFA, #8B5CF6)", live: true },
  { id: 3, name: "Ana R.",      initials: "AR", role: "Jr. Accountant",      label: "Team", access: "team", gradient: "linear-gradient(135deg, #60A5FA, #3B82F6)", live: false },
  { id: 4, name: "Diego F.",    initials: "DF", role: "Bookkeeper",          label: "Team", access: "team", gradient: "linear-gradient(135deg, #4ADE80, #2A9D5C)", live: true },
  { id: 5, name: "IA",          initials: "₵",  role: "Copiloto",            label: "AI",   access: "ai",   gradient: "linear-gradient(135deg, #D4A86A, #FF7849)", live: true },
];

const Msg = ({ who, name, t, time }) => {
  const colors = {
    me: { bg: "var(--text)", color: "var(--bg)" },
    cpa: { bg: "linear-gradient(135deg, #A78BFA, #8B5CF6)", color: "var(--bg)" },
    ai: { bg: "linear-gradient(135deg, #D4A86A, #FF7849)", color: "#0A0A0B" },
  };
  const avatarBg = who === "cpa" ? "linear-gradient(135deg, #A78BFA, #8B5CF6)" :
                   who === "ai" ? "linear-gradient(135deg, #D4A86A, #FF7849)" :
                   "linear-gradient(135deg, #D4A86A, #B98C4D)";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: who === "me" ? "flex-end" : "flex-start" }}>
      {who !== "me" && (
        <div style={{ width: 26, height: 26, borderRadius: 999, background: avatarBg, color: who === "ai" ? "#0A0A0B" : "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: who === "ai" ? 14 : 10, fontWeight: 700, flexShrink: 0, fontFamily: who === "ai" ? "Instrument Serif, serif" : "inherit" }}>
          {who === "cpa" ? "CM" : "₵"}
        </div>
      )}
      <div style={{ maxWidth: "78%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, justifyContent: who === "me" ? "flex-end" : "flex-start" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: who === "ai" ? "var(--gold)" : "var(--text-2)" }}>{name}</span>
          <span style={{ fontSize: 10, color: "var(--text-5)" }}>{time}</span>
        </div>
        <div style={{
          padding: "10px 14px", borderRadius: 12,
          background: who === "me" ? "var(--text)" : "var(--glass-2)",
          color: who === "me" ? "var(--bg)" : "var(--text)",
          fontSize: 13, lineHeight: 1.5,
          border: who === "me" ? "0" : "1px solid var(--hairline)"
        }}>{t}</div>
      </div>
    </div>
  );
};

Object.assign(window, { ScreenInbox, ScreenEmpresas, ScreenIndustria, ScreenColaboracion });
