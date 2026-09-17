export async function statementFile(file) {
  if (!file || file.size > 4 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) throw new Error('Seleccione un PDF de hasta 4 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { soporte_nombre: file.name, soporte_hash: [...hash].map(b => b.toString(16).padStart(2, '0')).join(''),
    soporte_base64: btoa(binary) };
}
// Persist identity and key, not the potentially large private PDF. Reselect it after reload.
export function statementAttempt(pending, form, file) {
  if (!file) throw new Error('Seleccione el PDF original.');
  if (pending) {
    if (pending.soporte_hash !== file.soporte_hash) throw new Error('El PDF no coincide con el envio pendiente.');
    return { ...pending, soporte_base64: file.soporte_base64 };
  }
  return { ...form, ...file, cantidad_creditos: Number(form.cantidad_creditos), cantidad_debitos: Number(form.cantidad_debitos),
    idempotencia: crypto.randomUUID() };
}
export function pendingStatementMetadata(request) {
  const { soporte_base64, ...metadata } = request;
  return metadata;
}
