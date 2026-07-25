// WOW moments — the small reactions that make the product feel alive.

// 1. Confetti — gold flakes from top of screen
const burstConfetti = (count = 22) => {
  const colors = ["#C9A55A", "#0D4A47", "#E8D9AE", "#1F6E54"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = (10 + Math.random() * 80) + "vw";
    piece.style.setProperty("--dx", (Math.random() * 200 - 100) + "px");
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = (Math.random() * 0.4) + "s";
    piece.style.width = (5 + Math.random() * 6) + "px";
    piece.style.height = (10 + Math.random() * 8) + "px";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3500);
  }
};

// 2. Soft ping (Web Audio API — no asset needed)
const playPing = (kind = "ok") => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const f = kind === "ok" ? 880 : kind === "alert" ? 440 : 660;
    o.frequency.setValueAtTime(f, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f * 1.5, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch (e) { /* sound is optional */ }
};

// 3. Breathing dot — pure visual primitive
const BreathDot = ({ size = 8, color = "var(--gold)", style = {} }) => (
  <span className="breathe" style={{
    display: "inline-block",
    width: size, height: size, borderRadius: 999,
    background: color, ...style
  }} />
);

// 4. Number that pops in with shimmer
const PopNumber = ({ children, className = "", trigger = true }) => (
  <span className={`${className} ${trigger ? "shimmer-once" : ""}`}>{children}</span>
);

// 5. Achievement banner — for milestones like "Tu primer mes cerrado"
const Achievement = ({ icon = "shield", title, sub, onDismiss }) => (
  <div className="anim-in" style={{
    position: "fixed", top: 28, right: 28, zIndex: 1100,
    background: "var(--ink)", color: "var(--bg)",
    padding: "16px 22px", borderRadius: 14,
    display: "flex", alignItems: "center", gap: 14,
    boxShadow: "var(--shadow-deep)", maxWidth: 360
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 999,
      background: "var(--gold)", color: "var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <window.Ico name={icon} size={17} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>· Logro</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#A8B0B3", marginTop: 2 }}>{sub}</div>}
    </div>
    <window.Ico name="x" size={14} color="#7A8285" style={{ cursor: "pointer" }} onClick={onDismiss} />
  </div>
);

// 6. Tiny inline sparkline (for a row)
const Sparkline = ({ data, width = 60, height = 18, color = "var(--teal)" }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

Object.assign(window, { burstConfetti, playPing, BreathDot, PopNumber, Achievement, Sparkline });
