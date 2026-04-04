import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const PLANS_FALLBACK = {
  gratis:       { name: 'Gratis',       price: 0,  maxClientes: 3,      features: ['Dashboard', 'Hasta 3 clientes', 'Flujo básico'] },
  basico:       { name: 'Básico',       price: 19, maxClientes: 15,     features: ['Todo lo de Gratis', 'Hasta 15 clientes', 'Alertas', 'Conciliación'] },
  profesional:  { name: 'Profesional',  price: 39, maxClientes: 50,     features: ['Todo lo de Básico', 'Hasta 50 clientes', 'Motor Contable', 'Reportes PDF'] },
  empresa:      { name: 'Empresa',      price: 79, maxClientes: 999999, features: ['Todo lo de Profesional', 'Clientes ilimitados', 'Soporte prioritario'] },
};

const COLORS = {
  gratis:      '#6b7280',
  basico:      '#3b82f6',
  profesional: '#8b5cf6',
  empresa:     '#f59e0b',
};

export default function PricingView({ token, currentPlan = 'gratis', onClose }) {
  const [plans, setPlans]       = useState(PLANS_FALLBACK);
  const [loading, setLoading]   = useState(null);
  const [status, setStatus]     = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/billing/plans`)
      .then(r => r.json())
      .then(d => { if (d.plans) setPlans(d.plans); })
      .catch(() => {});

    if (token) {
      fetch(`${API_URL}/api/billing/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setStatus(d))
        .catch(() => {});
    }
  }, [token]);

  const handleSubscribe = async (planKey) => {
    if (planKey === 'gratis') return;
    setLoading(planKey);
    try {
      const res = await fetch(`${API_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Error al iniciar pago');
      }
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading('portal');
    try {
      const res = await fetch(`${API_URL}/api/billing/portal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Error');
    } finally {
      setLoading(null);
    }
  };

  const planKeys = ['gratis', 'basico', 'profesional', 'empresa'];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {onClose && (
            <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>✕</button>
          )}
          <h1 style={{ color: '#f1f5f9', fontSize: 36, fontWeight: 700, margin: '0 0 12px' }}>
            Planes de ContaPanamá
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 16 }}>
            Elige el plan que mejor se adapta a tu práctica contable
          </p>
          {status?.plan && status.plan !== 'gratis' && (
            <div style={{ marginTop: 16 }}>
              <span style={{ background: '#1e3a5f', color: '#60a5fa', padding: '6px 16px', borderRadius: 20, fontSize: 13 }}>
                Plan actual: <strong>{status.planName}</strong>
              </span>
              <button
                onClick={handlePortal}
                disabled={loading === 'portal'}
                style={{ marginLeft: 12, background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                {loading === 'portal' ? 'Cargando...' : 'Gestionar suscripción'}
              </button>
            </div>
          )}
        </div>

        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {planKeys.map(key => {
            const plan    = plans[key] || PLANS_FALLBACK[key];
            const color   = COLORS[key];
            const isCurrent = (status?.plan || currentPlan) === key;
            const isPro   = key === 'profesional';

            return (
              <div key={key} style={{
                background: isPro ? '#1e1b4b' : '#1e293b',
                border: `2px solid ${isCurrent ? color : isPro ? '#6d28d9' : '#334155'}`,
                borderRadius: 16,
                padding: 28,
                position: 'relative',
                transform: isPro ? 'scale(1.03)' : 'scale(1)',
                transition: 'transform 0.2s',
              }}>
                {isPro && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20 }}>
                    MÁS POPULAR
                  </div>
                )}
                {isCurrent && (
                  <div style={{ position: 'absolute', top: -12, right: 16, background: color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                    TU PLAN
                  </div>
                )}

                <div style={{ color, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  {plan.name}
                </div>
                <div style={{ color: '#f1f5f9', fontSize: 40, fontWeight: 800, marginBottom: 4 }}>
                  ${plan.price}
                  <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 400 }}>/mes</span>
                </div>
                <div style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
                  {plan.maxClientes >= 999999 ? 'Clientes ilimitados' : `Hasta ${plan.maxClientes} clientes`}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(plan.features || []).map((f, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(key)}
                  disabled={isCurrent || loading === key || key === 'gratis'}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 10,
                    border: 'none',
                    background: isCurrent ? '#334155' : key === 'gratis' ? '#334155' : color,
                    color: isCurrent || key === 'gratis' ? '#64748b' : '#fff',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: isCurrent || key === 'gratis' ? 'default' : 'pointer',
                    opacity: loading === key ? 0.7 : 1,
                  }}
                >
                  {loading === key ? 'Redirigiendo...' :
                   isCurrent ? 'Plan actual' :
                   key === 'gratis' ? 'Gratis siempre' :
                   'Suscribirse'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginTop: 36 }}>
          💳 Pagos seguros con Stripe · Cancela cuando quieras · Sin contratos
        </p>
      </div>
    </div>
  );
}
