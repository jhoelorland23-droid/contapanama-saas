export const bankAccountLabel = account => account
  ? `${account.banco} · ${account.nombre} · ${account.tipo} ***${account.numero.slice(-4)} (${account.moneda})${account.activa ? '' : ' · Archivada'}`
  : 'Sin cuenta asignada';

// Keep the exact request after an uncertain response; retries must not use edited fields.
export function bankAttempt(current, payload) {
  return current || { ...structuredClone(payload), idempotencia: crypto.randomUUID() };
}

export function pendingBankRequests(storage, userId) {
  const key = kind => `cp_bank_pending_${userId}_${kind}`;
  return {
    read(kind) {
      const value = storage.getItem(key(kind));
      if (!value) return null;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed.idempotencia !== 'string') throw new Error();
        return parsed;
      } catch { throw new Error('El envio bancario pendiente no se puede leer. No envie un nuevo lote hasta revisar el historial.'); }
    },
    save(kind, value) { storage.setItem(key(kind), JSON.stringify(value)); },
    clear(kind) { storage.removeItem(key(kind)); },
  };
}
