export function consistencyStatus(data, error, loading) {
  if (loading) return { label: 'PENDIENTE / NO VERIFICADO', tone: 'warning' };
  if (error || data?.estado === 'integridad_fallida') return { label: 'ERROR DE VERIFICACIÓN', tone: 'danger' };
  if (data?.estado === 'consistente') return { label: 'CONSISTENTE', tone: 'success' };
  if (data?.estado === 'divergente') return { label: 'DIVERGENTE', tone: 'danger' };
  return { label: 'PENDIENTE / NO VERIFICADO', tone: 'warning' };
}
