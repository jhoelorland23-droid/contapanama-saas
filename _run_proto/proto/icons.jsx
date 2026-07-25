// Icon set — line icons, currentColor. Same set used across the prototype.

const ICON_PATHS = {
  dash: <path d="M3 12l9-8 9 8M5 10v9h5v-5h4v5h5v-9" />,
  flow: <path d="M3 17l5-5 4 3 8-8M14 7h5v5" />,
  users: <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0" />,
  book: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 0 3 3" />,
  brain: <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 3 3v1m6-15a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-3 3v1M9 4v17m6-17v17" />,
  card: <path d="M3 8h18M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1Zm4 7h4" />,
  tax: <path d="M6 3h9l4 4v14H6V3Zm4 6h5m-5 4h5m-5 4h3" />,
  bank: <path d="M3 9l9-5 9 5v2H3V9Zm2 2v8m4-8v8m6-8v8m4-8v8M3 21h18" />,
  shield: <path d="M12 3l8 3v6a9 9 0 0 1-8 9 9 9 0 0 1-8-9V6l8-3Zm-3 9 2 2 4-4" />,
  pdf: <path d="M7 3h7l5 5v13H7V3Zm7 0v5h5" />,
  bell: <path d="M6 17V11a6 6 0 1 1 12 0v6h2v2H4v-2h2Zm4 4h4" />,
  spark: <path d="M5 12h4l2-6 3 12 2-6h3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m21 21-5-5m1-5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M19 12H5m6 6-6-6 6-6" />,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="M6 6l12 12M6 18 18 6" />,
  alert: <path d="M12 3 2 21h20L12 3Zm0 7v5m0 3h.01" />,
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 19h14" />,
  upload: <path d="M12 20V9m-5 5 5-5 5 5M5 4h14" />,
  cog: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-1.7-1 .7-1.9-2-2-1.9.7-1-1.7h-2.2l-1 1.7-1.9-.7-2 2 .7 1.9-1.7 1v2.2l1.7 1-.7 1.9 2 2 1.9-.7 1 1.7h2.2l1-1.7 1.9.7 2-2-.7-1.9 1.7-1V12Z" />,
  camera: <path d="M4 8h3l2-2h6l2 2h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  send: <path d="M3 12 21 3l-7 18-2-7-9-2Z" />,
  building: <path d="M5 21V5h14v16M5 21H3m2 0h14m2 0h-2M9 9h2m4 0h2M9 13h2m4 0h2M9 17h2m4 0h2" />,
  inbox: <path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6m-18 0 3-9h12l3 9m-18 0h6l1 2h4l1-2h6" />,
  link: <path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-1.5 1.5M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l1.5-1.5" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  zap: <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />,
  globe: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 3 4 6 4 9s-1.5 6-4 9m0-18C9.5 6 8 9 8 12s1.5 6 4 9M3 12h18" />,
  lock: <path d="M5 11h14v9H5v-9Zm2 0V8a5 5 0 0 1 10 0v3M12 15v2" />,
  mail: <path d="M3 6h18v12H3V6Zm0 0 9 7 9-7" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  copy: <path d="M8 7h11v13H8V7Zm0 0V4h11M5 10v10h11" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v6l4 2" />,
  pin: <path d="M12 2v6m0 0-4 4h8l-4-4Zm0 6v8m-4-4h8" />,
  doc: <path d="M7 3h8l4 4v14H7V3Zm8 0v4h4" />,
  star: <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
};

const Ico = ({ name, size = 16, stroke = 1.6, color = "currentColor", style = {}, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, ...style }} {...rest}>
    {ICON_PATHS[name] || ICON_PATHS.dash}
  </svg>
);

const Pill = ({ tone = "grey", children, dot = false, style = {}, ...rest }) => (
  <span className={`pill p-${tone}`} style={style} {...rest}>
    {dot && <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />}
    {children}
  </span>
);

const Logo = ({ size = 28 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.23,
    background: "linear-gradient(135deg, var(--gold) 0%, #B0843E 100%)",
    color: "#0A1311", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Instrument Serif, serif", fontWeight: 400, fontSize: size * 0.55,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)"
  }}>₵</div>
);

// helpers
const fmt$ = (n, opts = {}) => {
  const { decimals = 2 } = opts;
  const v = Number(n) || 0;
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return (v < 0 ? "−" : "") + "$" + s;
};
const fmtN = (n) => new Intl.NumberFormat("en-US").format(n);

const fmtPeriodo = (p) => {
  if (!p || p.length < 7) return "—";
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const m = parseInt(p.slice(5, 7), 10) - 1;
  return `${meses[m] || "—"} ${p.slice(0, 4)}`;
};

Object.assign(window, { Ico, Pill, Logo, fmt$, fmtN, fmtPeriodo, ICON_PATHS });
