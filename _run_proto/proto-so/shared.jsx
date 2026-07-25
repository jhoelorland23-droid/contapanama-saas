// Shared primitives — icons, logo, pills, money formatter, etc.

const ICONS = {
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="M6 6l12 12M6 18 18 6" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />,
  bell: <path d="M6 17V11a6 6 0 1 1 12 0v6h2v2H4v-2h2Zm4 4h4" />,
  send: <path d="M3 12 21 3l-7 18-2-7-9-2Z" />,
  inbox: <path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6m-18 0 3-9h12l3 9m-18 0h6l1 2h4l1-2h6" />,
  camera: <path d="M4 8h3l2-2h6l2 2h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  alert: <path d="M12 3 2 21h20L12 3Zm0 7v5m0 3h.01" />,
  zap: <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />,
  users: <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0" />,
  building: <path d="M5 21V5h14v16M9 9h2m4 0h2M9 13h2m4 0h2M9 17h2m4 0h2" />,
  pdf: <path d="M7 3h7l5 5v13H7V3Zm7 0v5h5" />,
  doc: <path d="M7 3h8l4 4v14H7V3Zm8 0v4h4" />,
  folder: <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-8l-2-3H5a2 2 0 0 0-2 2v1Z" />,
  clock: <path d="M12 6v6l3.5 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />,
  search: <path d="m21 21-5-5m1-5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  shield: <path d="M12 3l8 3v6a9 9 0 0 1-8 9 9 9 0 0 1-8-9V6l8-3Zm-3 9 2 2 4-4" />,
  link: <path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-1.5 1.5M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l1.5-1.5" />,
  home: <path d="M3 12l9-8 9 8M5 10v9h5v-5h4v5h5v-9" />,
  tax: <path d="M6 3h9l4 4v14H6V3Zm4 6h5m-5 4h5m-5 4h3" />,
  wallet: <path d="M3 7a2 2 0 0 1 2-2h13l2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm12 6h3" />,
  whatsapp: <path d="M12 3a9 9 0 0 0-7.5 13.7L3 21l4.4-1.4A9 9 0 1 0 12 3Zm-2 5.5c.1-.3.3-.3.5-.3h.5c.2 0 .4 0 .5.3l.7 1.6c.1.3 0 .5-.1.7l-.4.5c.4.7 1.1 1.4 1.9 1.8l.5-.4c.2-.2.4-.2.7-.1l1.6.7c.3.1.3.3.3.5v.5c0 1-.7 1.7-1.7 1.7-3 0-5.4-2.4-5.4-5.4 0-1 .7-1.7 1.7-1.7Z" />,
  card: <path d="M3 8h18M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1Z" />,
  globe: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 3 4 6 4 9s-1.5 6-4 9m0-18C9.5 6 8 9 8 12s1.5 6 4 9M3 12h18" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  eye: <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  brain: <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3v1a3 3 0 0 0 3 3v-16Zm6 0a3 3 0 0 1 3 3v1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3v1a3 3 0 0 1-3 3v-16Z" />,
};

const Ico = ({ name, size = 16, stroke = 1.6, color = "currentColor", style = {}, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, ...style }} {...rest}>
    {ICONS[name] || ICONS.sparkle}
  </svg>
);

const Logo = ({ size = 28, light = false }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.22,
    background: light ? "var(--bg)" : "var(--ink)",
    color: light ? "var(--ink)" : "var(--gold)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Instrument Serif, serif", fontWeight: 400, fontSize: size * 0.58,
    flexShrink: 0
  }}>₵</div>
);

const Pill = ({ tone = "ghost", children, dot = false, style = {} }) => (
  <span className={`pill ${tone}`} style={style}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

const fmt$ = (n, { decimals = 2, abbreviate = false, sign = false } = {}) => {
  const v = Number(n) || 0;
  if (abbreviate && Math.abs(v) >= 1000) {
    const k = v / 1000;
    return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "$" + (Math.abs(k) >= 100 ? Math.round(k) : k.toFixed(1)) + "k";
  }
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "$" + s;
};

// Animated number: counts from 0 to target on mount
const CountUp = ({ value, decimals = 0, prefix = "", suffix = "", duration = 900, className = "" }) => {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
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

Object.assign(window, { Ico, Logo, Pill, fmt$, CountUp });
