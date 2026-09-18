const failed = data => data?.estado === 'integridad_fallida' || data?.estado === 'error' ||
  data?.integridad === 'fallida' || !!data?.errores?.length;
const count = value => Array.isArray(value) ? value.length : Number(value) || 0;
const divergent = data => data?.estado === 'divergente' || count(data?.pendientes) > 0 || count(data?.cuentas_divergentes) > 0;

export function consistencyStatus(data, error, loading, summary) {
  if (error || failed(data) || failed(summary)) return { label: 'ERROR / INTEGRIDAD FALLIDA', tone: 'danger' };
  if (loading) return { label: 'PENDIENTE / NO VERIFICADO', tone: 'warning' };
  if (divergent(data)) return { label: 'DIVERGENTE', tone: 'danger' };
  if (data?.estado === 'consistente_en_filtro' ||
    (data?.estado === 'consistente' && count(data.pendientes_fuera_del_filtro) > 0)) {
    return { label: 'CONSISTENTE EN EL FILTRO / EXISTEN DIFERENCIAS FUERA DEL FILTRO', tone: 'warning' };
  }
  // A global summary cannot locate differences inside or outside the current filter.
  if (divergent(summary) || summary?.estado === 'consistente_en_filtro' || count(summary?.pendientes_fuera_del_filtro) > 0) {
    return { label: 'DIVERGENTE', tone: 'danger' };
  }
  if (data?.estado === 'consistente') return { label: 'CONSISTENTE', tone: 'success' };
  return { label: 'PENDIENTE / NO VERIFICADO', tone: 'warning' };
}
