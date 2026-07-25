// "Plata" — live cash flow. Where it goes. What you have. What's coming.

const ScreenPlata = () => {
  const { showToast, celebrate, setDrawer, drawer } = window.useApp();
  const [tab, setTab] = React.useState("movimientos");

  return (
    <window.Shell active="plata" topbar={
      <window.Topbar
        left={<>
          <window.Pill tone="ghost">PLATA · MARZO</window.Pill>
          <span>Vives en este número.</span>
        </>}
        right={<>
          <button className="btn ghost"><window.Ico name="link" size={13} />Conectar otro banco</button>
          <button className="btn ink" onClick={() => {
            celebrate("Factura enviada", "Maersk recibe FE-2452 por $3,200");
          }}><window.Ico name="plus" size={13} />Cobrar factura</button>
        </>}
      />
    }>

      <div style={{ padding: "36px 48px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 36, alignItems: "flex-end", marginBottom: 32 }} className="anim-in">
          <div>
            <div className="eyebrow teal">· Tienes hoy</div>
            <div className="display-l" style={{ marginTop: 6, fontSize: 88 }}>
              <window.CountUp value={42810} prefix="$" decimals={0} />
            </div>
            <div className="body-l" style={{ marginTop: 6, color: "var(--muted)" }}>
              <b className="num" style={{ color: "var(--ink)" }}>$32,478</b> en Banco General · <b className="num" style={{ color: "var(--ink)" }}>$8,902</b> en Banesco · <b className="num" style={{ color: "var(--ink)" }}>$1,430</b> en Yappy
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <StatPad k="Te deben" v="$8,420" sub="6 facturas" tone="amber" />
            <StatPad k="Debes" v="$3,140" sub="2 vencidas" tone="red" />
            <StatPad k="Libre" v="$31,250" sub="después obligaciones" tone="green" />
          </div>
        </div>

        {/* Chart + breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, marginBottom: 18 }} className="anim-in d2">
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="eyebrow teal">· Entra y sale</div>
                <div className="h2" style={{ marginTop: 6 }}>Esta semana entró $7,200 más de lo que salió.</div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
                <span><span style={{ display: "inline-block", width: 10, height: 2.5, background: "var(--teal)", marginRight: 6, verticalAlign: "middle" }} />Entra</span>
                <span><span style={{ display: "inline-block", width: 10, height: 2.5, background: "var(--gold)", marginRight: 6, verticalAlign: "middle" }} />Sale</span>
              </div>
            </div>
            <FlowChart />
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <div className="eyebrow teal">· Para qué se va</div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Compras / inventario", 4280, 43, "var(--teal)"],
                ["Planilla", 2840, 29, "var(--gold)"],
                ["Alquiler", 1800, 18, "#5E6A73"],
                ["Servicios", 525, 5, "#B6B9BC"],
                ["Otros", 395, 4, "#E0DCD0"],
              ].map(([t, v, pct, c]) => (
                <div key={t}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{t}</span>
                    <span className="num" style={{ color: "var(--muted)", fontWeight: 700 }}>${v.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 4, background: "var(--line-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: c, transition: "width .8s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs + table */}
        <div className="card anim-in d3" style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                ["movimientos", "Movimientos", 142],
                ["porcobrar", "Por cobrar", 6],
                ["porpagar", "Por pagar", 2],
              ].map(([id, label, count]) => (
                <div key={id} onClick={() => setTab(id)} style={{
                  padding: "8px 14px", borderRadius: 7, cursor: "pointer",
                  background: tab === id ? "var(--surface)" : "transparent",
                  fontSize: 12.5, fontWeight: tab === id ? 700 : 500,
                  color: tab === id ? "var(--ink)" : "var(--muted)",
                  display: "flex", alignItems: "center", gap: 7
                }}>
                  {label}
                  <span style={{ fontSize: 10.5, color: "var(--muted-2)" }}>{count}</span>
                </div>
              ))}
            </div>
            <window.Pill tone="green" dot>96% AUTO-CLASIFICADO</window.Pill>
          </div>

          {tab === "movimientos" && <MovTable onRow={(r) => setDrawer({ kind: "txn", data: r })} />}
          {tab === "porcobrar" && <PorCobrarTable onPaid={() => celebrate("Cobranza marcada", "$1,500 entró a Banco General")} />}
          {tab === "porpagar" && <PorPagarTable />}
        </div>
      </div>

      {drawer && drawer.kind === "txn" && <TxnDrawer txn={drawer.data} onClose={() => setDrawer(null)} />}
    </window.Shell>
  );
};

const StatPad = ({ k, v, sub, tone = "muted" }) => {
  const c = {
    green: { bg: "var(--green-soft)", fg: "var(--green)" },
    red:   { bg: "var(--red-soft)",   fg: "var(--red)" },
    amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
    muted: { bg: "var(--surface)",    fg: "var(--ink)" },
  }[tone];
  return (
    <div style={{ padding: "14px 16px", borderRadius: 11, background: c.bg }}>
      <div style={{ fontSize: 10, color: c.fg, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k}</div>
      <div className="num serif" style={{ fontSize: 22, fontWeight: 400, marginTop: 4, color: c.fg, letterSpacing: "-0.02em" }}>{v}</div>
      <div style={{ fontSize: 10.5, color: c.fg, opacity: 0.7, marginTop: 1 }}>{sub}</div>
    </div>
  );
};

const FlowChart = () => {
  const data = [
    ["Lun", 1.8, 1.2], ["Mar", 2.4, 0.8], ["Mié", 3.1, 1.4], ["Jue", 2.1, 1.8],
    ["Vie", 4.2, 1.1], ["Sáb", 1.6, 0.4], ["Dom", 0.8, 0.2],
  ];
  const max = 4.5;
  const W = 700, H = 200, P = { l: 30, r: 18, t: 12, b: 26 };
  const cw = (W - P.l - P.r) / data.length;
  const ix = (i) => P.l + cw * i + cw / 2;
  const iy = (v) => P.t + (1 - v / max) * (H - P.t - P.b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200, marginTop: 10 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="tealflow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0D4A47" stopOpacity=".18" />
          <stop offset="100%" stopColor="#0D4A47" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, .25, .5, .75, 1].map(p => {
        const y = P.t + p * (H - P.t - P.b);
        return <line key={p} x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="#EBE7DC" strokeWidth="1" />;
      })}
      <path
        d={`${data.map((d, i) => `${i ? "L" : "M"}${ix(i)},${iy(d[1])}`).join(" ")} L${ix(data.length - 1)},${H - P.b} L${ix(0)},${H - P.b} Z`}
        fill="url(#tealflow)"
      />
      <path d={data.map((d, i) => `${i ? "L" : "M"}${ix(i)},${iy(d[1])}`).join(" ")} stroke="#0D4A47" strokeWidth="1.8" fill="none" />
      <path d={data.map((d, i) => `${i ? "L" : "M"}${ix(i)},${iy(d[2])}`).join(" ")} stroke="#C9A55A" strokeWidth="1.8" fill="none" />
      {data.map((d, i) => (
        <g key={d[0]}>
          <circle cx={ix(i)} cy={iy(d[1])} r="3" fill="#fff" stroke="#0D4A47" strokeWidth="1.6" />
          <circle cx={ix(i)} cy={iy(d[2])} r="3" fill="#fff" stroke="#C9A55A" strokeWidth="1.6" />
          <text x={ix(i)} y={H - 10} fontSize="10" fill="#8A8F94" textAnchor="middle">{d[0]}</text>
        </g>
      ))}
    </svg>
  );
};

const MOVS = [
  { id: 1, when: "Hoy 10:42", desc: "Pago de Maersk · FE-2451",      who: "Maersk Panamá",          bank: "BG", amt: 4800,  cat: "Cobranza ventas" },
  { id: 2, when: "Hoy 09:18", desc: "Café del Casco · ventas POS",   who: "Squarepay",              bank: "BG", amt: 1240,  cat: "Ventas mostrador" },
  { id: 3, when: "Ayer",       desc: "Planilla 1ra quincena",         who: "Empleados",              bank: "BG", amt: -2840, cat: "Planilla" },
  { id: 4, when: "Ayer",       desc: "Alquiler oficina marzo",        who: "Inmobiliaria Bella Vista", bank: "BG", amt: -1800, cat: "Alquiler" },
  { id: 5, when: "Ayer",       desc: "Compra de granos verdes",       who: "Café Volcán S.A.",       bank: "BG", amt: -1620, cat: "Compras" },
  { id: 6, when: "Sáb",        desc: "Transferencia Yappy entrada",   who: "Cliente XYZ",            bank: "YA", amt: 380,   cat: "Venta mostrador" },
  { id: 7, when: "Vie",        desc: "Office Depot · suministros",    who: "Office Depot",           bank: "BG", amt: -420.5, cat: "Suministros" },
  { id: 8, when: "Vie",        desc: "Honorarios — Distribuidora Sur", who: "Distribuidora Sur",     bank: "BG", amt: 6800,  cat: "Cobranza ventas" },
];

const MovTable = ({ onRow }) => (
  <table className="tbl">
    <thead>
      <tr>
        <th style={{ width: 90 }}>Cuando</th>
        <th>Qué fue</th>
        <th>Quién</th>
        <th>Cuenta</th>
        <th className="r">Monto</th>
        <th style={{ width: 96 }}></th>
      </tr>
    </thead>
    <tbody>
      {MOVS.map(r => (
        <tr key={r.id} className="hoverable" onClick={() => onRow(r)}>
          <td className="muted">{r.when}</td>
          <td><div style={{ fontWeight: 600 }}>{r.desc}</div></td>
          <td className="muted">{r.who}</td>
          <td><window.Pill tone={r.amt > 0 ? "teal" : "ghost"}>{r.cat}</window.Pill></td>
          <td className="r num" style={{ fontWeight: 800, color: r.amt > 0 ? "var(--green)" : "var(--ink)" }}>
            {r.amt > 0 ? "+" : "−"}{window.fmt$(Math.abs(r.amt), { decimals: 0 })}
          </td>
          <td>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
              <window.Ico name="check" size={12} color="var(--green)" />
              <span style={{ fontSize: 10, color: "var(--muted-2)" }}>Conciliado</span>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const PorCobrarTable = ({ onPaid }) => {
  const facts = [
    { id: 1, doc: "FE-2451", who: "Constructora Istmo S.A.", date: "12 mar", venc: "Vencida 5d", amt: 4200, tone: "red" },
    { id: 2, doc: "FE-2452", who: "Maersk Panamá",            date: "10 mar", venc: "Vence en 8d", amt: 3200, tone: "amber" },
    { id: 3, doc: "FE-2440", who: "C. Méndez Palacios",       date: "05 mar", venc: "Vencida 12d", amt: 1500, tone: "red" },
    { id: 4, doc: "FE-2435", who: "Distribuidora Sur S.A.",   date: "03 mar", venc: "Vence en 15d", amt: 6800, tone: "muted" },
    { id: 5, doc: "FE-2428", who: "Café del Centro",           date: "28 feb", venc: "Vence en 3d", amt: 920, tone: "amber" },
    { id: 6, doc: "FE-2422", who: "Restaurante Mar",           date: "25 feb", venc: "Vence en 5d", amt: 540, tone: "muted" },
  ];
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Factura</th>
          <th>Cliente</th>
          <th>Emitida</th>
          <th>Vence</th>
          <th className="r">Monto</th>
          <th style={{ width: 130 }}></th>
        </tr>
      </thead>
      <tbody>
        {facts.map(f => (
          <tr key={f.id} className="hoverable">
            <td className="mono" style={{ fontSize: 11.5 }}>{f.doc}</td>
            <td><b>{f.who}</b></td>
            <td className="muted">{f.date}</td>
            <td><window.Pill tone={f.tone === "red" ? "red" : f.tone === "amber" ? "amber" : "ghost"}>{f.venc}</window.Pill></td>
            <td className="r num" style={{ fontWeight: 800 }}>{window.fmt$(f.amt, { decimals: 0 })}</td>
            <td>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn s ghost"><window.Ico name="send" size={10} />Recordatorio</button>
                <button className="btn s ink" onClick={onPaid}>Cobrado</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const PorPagarTable = () => {
  const items = [
    { id: 1, doc: "FE-1188", who: "Office Depot",   date: "07 mar", venc: "Vencida 2d", amt: 420.5, tone: "red" },
    { id: 2, doc: "REF-8821", who: "Banco General · préstamo", date: "10 mar", venc: "Vence 10 abr", amt: 950, tone: "muted" },
  ];
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Documento</th>
          <th>A quién</th>
          <th>Recibida</th>
          <th>Vence</th>
          <th className="r">Monto</th>
          <th style={{ width: 100 }}></th>
        </tr>
      </thead>
      <tbody>
        {items.map(f => (
          <tr key={f.id} className="hoverable">
            <td className="mono" style={{ fontSize: 11.5 }}>{f.doc}</td>
            <td><b>{f.who}</b></td>
            <td className="muted">{f.date}</td>
            <td><window.Pill tone={f.tone === "red" ? "red" : "ghost"}>{f.venc}</window.Pill></td>
            <td className="r num" style={{ fontWeight: 800 }}>{window.fmt$(f.amt, { decimals: 0 })}</td>
            <td>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn s ink">Marcar pagado</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const TxnDrawer = ({ txn, onClose }) => (
  <>
    <div className="scrim" onClick={onClose} />
    <div className="drawer">
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow teal">· Movimiento</div>
          <div className="h2" style={{ marginTop: 4 }}>{txn.desc}</div>
        </div>
        <window.Ico name="x" size={16} color="var(--muted)" style={{ cursor: "pointer" }} onClick={onClose} />
      </div>
      <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
        <div className="display-m" style={{ color: txn.amt > 0 ? "var(--green)" : "var(--ink)" }}>
          {txn.amt > 0 ? "+" : "−"}{window.fmt$(Math.abs(txn.amt))}
        </div>
        <div className="body-s" style={{ color: "var(--muted)", marginTop: 4 }}>{txn.when} · Banco {txn.bank === "BG" ? "General" : "Yappy"}</div>

        <div style={{ marginTop: 28 }}>
          <div className="eyebrow teal">· Detalles</div>
          <Detail k="Contraparte" v={txn.who} />
          <Detail k="Categoría" v={txn.cat} />
          <Detail k="Cuenta" v="4101 Ingresos por servicios" />
          <Detail k="ITBMS aplicado" v={txn.amt > 0 ? "7% incluido" : "—"} />
          <Detail k="Conciliado" v="Sí · automático" />
          <Detail k="Documento" v="FE-2451 · adjunto" />
        </div>

        <div style={{ marginTop: 28, padding: "14px 16px", background: "var(--gold-50)", borderRadius: 10, display: "flex", gap: 12 }}>
          <window.Ico name="sparkle" size={14} color="var(--gold)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>La IA dice</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
              Cliente recurrente. Última factura cobrada en 9 días promedio. Histórico saludable.
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 22px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button className="btn ghost"><window.Ico name="doc" size={12} />Ver factura</button>
        <button className="btn ink" onClick={onClose}>Listo</button>
      </div>
    </div>
  </>
);

const Detail = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line-2)" }}>
    <span style={{ fontSize: 12, color: "var(--muted)" }}>{k}</span>
    <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{v}</span>
  </div>
);

Object.assign(window, { ScreenPlata });
