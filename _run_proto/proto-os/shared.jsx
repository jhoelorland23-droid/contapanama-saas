// Shared primitives — Lucide-style icons (premium, hairline, consistent stroke 1.5)

const ICONS = {
  // Nav
  home: <><path d="M3 12 12 4l9 8"/><path d="M5 10v10h4v-6h6v6h4V10"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a4.5 4.5 0 0 1 7 0"/></>,
  fiscal: <><path d="M5 3h11l3 3v15H5z"/><path d="M16 3v3h3"/><path d="M9 10h6M9 14h6M9 18h3"/></>,
  itbms: <><path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h3"/><circle cx="17" cy="16" r="2"/></>,
  declarations: <><path d="M9 3h9l3 3v15H9z"/><path d="M18 3v3h3"/><path d="M3 8v13h13"/></>,
  dgi: <><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7Z"/><path d="m9 12 2 2 4-4"/></>,
  municipios: <><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 12h2v9H9zM13 12h2v9h-2z"/></>,
  ai: <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/></>,
  analytics: <><path d="M3 21V8M9 21V3M15 21v-9M21 21V14"/></>,
  documents: <><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></>,
  automations: <><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.36.16.65.42.85.74.2.32.3.7.3 1.08V11a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></>,

  // Actions
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  arrowRight: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  arrowUp: <><path d="M12 19V5m-6 6 6-6 6 6"/></>,
  arrowDown: <><path d="M12 5v14m-6-6 6 6 6-6"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  x: <><path d="M6 6l12 12M6 18 18 6"/></>,
  chevronDown: <><path d="m6 9 6 6 6-6"/></>,
  chevronRight: <><path d="m9 6 6 6-6 6"/></>,
  sparkles: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M5.6 18.4l2.1-2.1"/><path d="m12 8 1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5z"/></>,
  zap: <><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></>,
  filter: <><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>,
  send: <><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></>,
  trendingUp: <><path d="m3 17 6-6 4 4 8-8M14 7h6v6"/></>,
  trendingDown: <><path d="m3 7 6 6 4-4 8 8M14 17h6v-6"/></>,
  flame: <><path d="M14 4c0 4-6 6-6 11a6 6 0 0 0 12 0c0-3-2-5-3-7-1 2-3 1-3-4Z"/></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/></>,
  command: <><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"/></>,
  inbox: <><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M3 13 6 4h12l3 9"/><path d="M3 13h5l1 3h6l1-3h5"/></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.6 4.5 8.4 8.4 0 0 1-4-1L3 21l2-5.5a8.4 8.4 0 0 1-1-4 8.5 8.5 0 0 1 4.5-7.6 8.4 8.4 0 0 1 4-1A8.5 8.5 0 0 1 21 11.5Z"/></>,
  building: <><path d="M5 21V5h14v16M9 9h2m4 0h2M9 13h2m4 0h2M9 17h2m4 0h2"/></>,
  bot: <><rect x="3" y="7" width="18" height="14" rx="3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><path d="M9 18h6M12 3v4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  link: <><path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-1.5 1.5M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l1.5-1.5"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M2 12h20"/><path d="M12 2a14 14 0 0 1 0 20 14 14 0 0 1 0-20Z"/></>,
  star: <><path d="m12 3 2.5 6 6.5.7-4.9 4.4 1.4 6.4L12 17.4 6.5 20.5l1.4-6.4L3 9.7 9.5 9z"/></>,
  refresh: <><path d="M3 12a9 9 0 1 0 3.5-7L3 8"/><path d="M3 3v5h5"/></>,
  upload: <><path d="M12 21V9m-5 5 5-5 5 5M3 3h18"/></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  layers: <><path d="m12 2 10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6M2 18l10 6 10-6"/></>,
  receipt: <><path d="M5 3v18l2-2 2 2 2-2 2 2 2-2 2 2 2-2V3z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  workflow: <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 6h6v3M15 18h-6v-3"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></>,
  arrowUpRight: <><path d="M7 17 17 7M7 7h10v10"/></>,
};

const Ico = ({ name, size = 16, stroke = 1.6, color = "currentColor", style = {}, className, onClick }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, display: "inline-block", ...style }} className={className} onClick={onClick}>
    {ICONS[name] || ICONS.sparkles}
  </svg>
);

// Premium logo — geometric monogram, gold
const Logo = ({ size = 28, glow = false }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.22,
    background: "linear-gradient(135deg, #D4A86A 0%, #B98C4D 100%)",
    color: "#0A0A0B",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Instrument Serif, serif", fontWeight: 400, fontSize: size * 0.6,
    flexShrink: 0,
    boxShadow: glow ? "0 0 20px rgba(212,168,106,0.4)" : "none",
  }}>₵</div>
);

const Pill = ({ tone = "ghost", children, dot = false, kbd, style = {}, onClick }) => (
  <span className={`pill ${tone}`} style={{ ...style, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
    {dot && <span className="dot" />}
    {children}
    {kbd && <span className="kbd">{kbd}</span>}
  </span>
);

const KBD = ({ children }) => <span className="kbd">{children}</span>;

const fmt$ = (n, { decimals = 2, abbreviate = false, sign = false } = {}) => {
  const v = Number(n) || 0;
  if (abbreviate && Math.abs(v) >= 1000) {
    const k = v / 1000;
    if (Math.abs(k) >= 1000) {
      const m = k / 1000;
      return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "$" + (Math.abs(m) >= 100 ? Math.round(m) : m.toFixed(1)) + "M";
    }
    return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "$" + (Math.abs(k) >= 100 ? Math.round(k) : k.toFixed(1)) + "k";
  }
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "$" + s;
};

// Number CountUp
const CountUp = ({ value, decimals = 0, prefix = "", suffix = "", duration = 900, className = "" }) => {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={`num ${className}`}>
      {prefix}{n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
};

// Sparkline
const Sparkline = ({ data, width = 80, height = 24, color = "var(--gold)", fill = true }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const lineStr = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1].toFixed(1)}`).join(" ");
  const fillStr = `${lineStr} L${width},${height} L0,${height} Z`;
  const gid = `grad-${Math.random().toString(36).slice(2,9)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={fillStr} fill={`url(#${gid})`} />}
      <path d={lineStr} stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

Object.assign(window, { Ico, Logo, Pill, KBD, fmt$, CountUp, Sparkline });
