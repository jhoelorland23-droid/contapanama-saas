import Papa from 'papaparse';

export const bankColumns = ['fecha', 'descripcion', 'monto', 'tipo', 'banco', 'referencia'];
export function parseBankCsv(text, clienteId, account) {
  if (!clienteId) throw new Error('Seleccione el cliente propietario del extracto.');
  if (!account?.id || account.cliente_id !== clienteId || !account.activa) throw new Error('Seleccione una cuenta activa del cliente.');
  const parsed = Papa.parse(text, { skipEmptyLines: true, delimitersToGuess: [',', ';', '\t'] });
  if (parsed.errors.length) throw new Error('CSV invalido: ' + parsed.errors[0].message);
  const rows = parsed.data.map(row => row.map(value => value.trim()));
  const header = rows[0]?.map(value => value.toLowerCase());
  if (header?.join(',') === bankColumns.join(',')) rows.shift();
  if (!rows.length || rows.length > 2000) throw new Error('El archivo debe contener entre 1 y 2000 movimientos.');
  return rows.map((row, index) => {
    if (row.length !== bankColumns.length) throw new Error(`Fila ${index + 1}: se requieren las seis columnas del formato.`);
    const result = Object.fromEntries(bankColumns.map((key, col) => [key, row[col]]));
    if (!result.fecha || !result.descripcion || !result.banco || !/^\d+(\.\d{1,2})?$/.test(result.monto) ||
      Number(result.monto) <= 0 || !['credito', 'debito'].includes(result.tipo)) {
      throw new Error(`Fila ${index + 1}: revise fecha, descripcion, monto, tipo y banco. No se importo ninguna fila.`);
    }
    if (result.banco !== account.banco) throw new Error(`Fila ${index + 1}: el banco no corresponde a la cuenta seleccionada.`);
    const date = new Date(result.fecha + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.fecha) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== result.fecha) throw new Error(`Fila ${index + 1}: fecha bancaria invalida.`);
    return { ...result, cliente_id: clienteId, cuenta_bancaria_id: account.id };
  });
}

export function reconciliationCsv(data) {
  const common = row => ({ cliente_id: row.cliente_id || '', cliente: row.cliente_nombre || 'Sin cliente asignado', banco: row.banco || '',
    cuenta_bancaria_id: row.cuenta_bancaria_id || '', cuenta: row.cuenta_nombre || 'Sin cuenta asignada' });
  const rows = [
    ...data.resumen.map(r => ({ seccion: 'resumen_movimientos', ...common(r), neto_contable: r.movimiento_neto_contable,
      neto_bancario: r.movimiento_neto_bancario, diferencia: r.diferencia, estado: r.estado })),
    ...data.registros_contables.map(r => ({ seccion: 'pago_contable_periodo', ...common(r), fecha: r.fecha,
      descripcion: r.descripcion, referencia: r.referencia, tipo: r.tipo, importe: r.importe, estado: r.estado })),
    ...data.movimientos_periodo.map(r => ({ seccion: 'banco_periodo', ...common(r), fecha: r.fecha, descripcion: r.descripcion,
      referencia: r.referencia, tipo: r.tipo, importe: r.monto, estado: r.estado_vinculo })),
    ...data.transacciones_pendientes.map(r => ({ seccion: 'pago_pendiente_al_corte', ...common(r), fecha: r.fecha,
      descripcion: r.descripcion, referencia: r.referencia_pago, tipo: r.tipo, importe: r.total_documento, estado: 'pendiente' })),
    ...data.movimientos_pendientes.map(r => ({ seccion: 'banco_pendiente_al_corte', ...common(r), fecha: r.fecha,
      descripcion: r.descripcion, referencia: r.referencia, tipo: r.tipo, importe: r.monto, estado: 'pendiente' })),
    ...data.documentos_sin_pago.map(r => ({ seccion: 'documento_sin_pago', ...common(r), fecha: r.fecha,
      descripcion: r.descripcion, referencia: r.referencia, tipo: r.tipo, importe: r.total_documento, estado: 'sin_pago' })),
  ].map(row => ({ ...row, corte: data.fecha_corte, saldo_verificado: 'no' }));
  const fields = ['seccion','corte','cliente_id','cliente','banco','cuenta_bancaria_id','cuenta','fecha','descripcion','referencia','tipo','importe',
    'neto_contable','neto_bancario','diferencia','estado','saldo_verificado'];
  return Papa.unparse({ fields, data: rows }, { escapeFormulae: true });
}
