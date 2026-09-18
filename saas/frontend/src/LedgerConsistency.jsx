import { useEffect, useState } from 'react';
import { consistencyStatus } from './ledgerConsistency.mjs';

export default function LedgerConsistency({ api, query, refresh, book, clientName, period, C, Icon }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    api.get(`/api/contabilidad/consistencia?${query}`, { signal: controller.signal }).then(value => { if (active) setData(value); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [api, query, refresh, attempt]);
  const status = consistencyStatus(data, error, loading, book?.consistencia);
  const color = status.tone === 'success' ? C.successText : status.tone === 'danger' ? C.dangerText || '#b42318' : C.warningText;
  const cell = { padding: '8px 10px', borderTop: `1px solid ${C.border}`, textAlign: 'left', overflowWrap: 'anywhere' };
  return <section aria-label="Consistencia del libro" style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 16, minWidth: 0 }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
      <div><strong>Consistencia del libro</strong><div role="status" style={{ color, fontWeight: 700, fontSize: 13, marginTop: 5 }}>{status.label}</div></div>
      <button type="button" aria-label="Verificar consistencia" title="Verificar consistencia" disabled={loading} onClick={() => setAttempt(n => n + 1)} style={{ width: 36, height: 36, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}><Icon name="refresh" size={16}/></button>
    </div>
    <p style={{ fontSize: 12, color: C.textMuted }}>{clientName || 'Toda la cartera'} · {period}</p>
    {error && <p role="alert" style={{ color }}>{error}</p>}
    {(data?.errores || []).map((message, i) => <p role="alert" key={i} style={{ color }}>{message}</p>)}
    {!!data?.pendientes_fuera_del_filtro && <p style={{ color: C.warningText }}>Cartera: {data.pendientes_fuera_del_filtro} diferencias fuera del filtro seleccionado.</p>}
    {book?.consistencia?.estado === 'divergente' && data?.estado === 'consistente' && <p style={{ color: C.warningText }}>El resumen de la cartera reporta divergencias. Revise también los demás clientes y períodos.</p>}
    {!!data?.pendientes?.length && <div style={{ overflowX: 'auto' }}><table aria-label="Documentos con diferencias" style={{ width: '100%', minWidth: 650, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr>{['Cliente / período', 'Documento', 'Diferencia', 'Asiento original'].map(label => <th style={cell} key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.pendientes.map((row, i) => <tr key={`${row.origen_clave}-${i}`}>
        <td style={cell}>{row.cliente_nombre || row.cliente_id || 'Sin cliente'}<br/>{row.periodo || row.fecha?.slice(0, 7)}</td>
        <td style={cell}>{row.transaccion_id}</td><td style={cell}>{row.tipo_asiento}<br/>B/. {Number(row.total).toFixed(2)}</td><td style={cell}>{row.rectifica_id || 'Sin asiento publicado'}</td>
      </tr>)}</tbody></table></div>}
    {!!data?.cuentas_divergentes?.length && <div style={{ overflowX: 'auto' }}><table aria-label="Diferencias por cuenta" style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr>{['Cuenta', 'Documentos', 'Libro', 'Diferencia'].map(label => <th key={label} style={cell}>{label}</th>)}</tr></thead>
      <tbody>{data.cuentas_divergentes.map(row => <tr key={row.cuenta_codigo}>{[row.cuenta_codigo, row.saldo_documentos, row.saldo_libro, row.diferencia].map((value, i) => <td key={i} style={cell}>{i ? Number(value).toFixed(2) : value}</td>)}</tr>)}</tbody>
    </table></div>}
    {!!data?.totales?.reportes_vs_libro?.gastos && <p style={{ fontSize: 12, color: C.textMuted, marginTop: 10 }}>
      Gastos en documentos: B/. {Number(data.totales.documentos.gastos).toFixed(2)}. Gastos en libro: B/. {Number(data.totales.libro.gastos).toFixed(2)}.
      {data.totales.reportes_vs_libro.gastos_explicados_por_itbms_no_deducible
        ? ` ITBMS no deducible incorporado al gasto: B/. ${Number(data.totales.documentos.itbms_no_deducible).toFixed(2)}.`
        : ' Diferencia documental pendiente de analizar.'}
    </p>}
    {data?.estado === 'divergente' && <p style={{ fontSize: 12, color }}>Pendiente de revisión CPA. No se han aplicado correcciones.</p>}
  </section>;
}
