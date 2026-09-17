const { randomUUID } = require('node:crypto');
const { paymentSummary, fail } = require('./paymentLedger');

function localPayments(rows, state, uid) {
  return rows.map(tx => {
    const pagos = (state.pagos_transacciones || []).filter(p => p.usuario_id === uid && p.transaccion_id === tx.id);
    return pagos.length ? { ...tx, pagos } : tx;
  });
}

function createLocalPaymentRepository(state, closureFor, persist = () => {}) {
  let queue = Promise.resolve();
  const read = (uid, id) => localPayments(state.transacciones.filter(t => t.usuario_id === uid && t.id === id), state, uid)[0];
  return {
    read,
    transaction(uid, work) {
      const result = queue.then(async () => {
        const originals = new Map();
        let pendingSave;
        const bankUpdates = new Map();
        const bankOriginals = new Map();
        const checkedPeriods = [];
        const context = {
          get(id) {
            const tx = read(uid, id);
            if (tx) originals.set(id, JSON.stringify(tx));
            return tx ? structuredClone(tx) : null;
          },
          getAccount(id) { return structuredClone((state.cuentas_bancarias || []).find(a => a.id === id && a.usuario_id === uid)); },
          assignAccount(tx, accountId, motivo, banco) {
            const next = { ...tx, cuenta_bancaria_id: accountId, banco };
            const summary = paymentSummary(next);
            pendingSave = { tx, pagos: null, summary, accountId, banco, accion: 'documento_cuenta_asignada', before: tx, extra: { motivo, cuenta_bancaria_id: accountId, banco } };
            return { ...next, ...summary };
          },
          assertOpen(fecha, clienteId) {
            if (closureFor(uid, fecha.slice(0, 7), clienteId)) fail(`El periodo ${fecha.slice(0, 7)} esta cerrado.`, 409);
            checkedPeriods.push({ fecha, clienteId });
          },
          getBank(id) {
            const bank = state.movimientos_bancarios.find(m => m.usuario_id === uid && m.id === id);
            if (bank) bankOriginals.set(id, JSON.stringify(bank));
            return bank ? structuredClone(bank) : null;
          },
          setBank(id, txId) { bankUpdates.set(id, txId); },
          save(tx, pagos, accion, before, extra) {
            const canonical = pagos.map(({ legacy, ...p }) => ({ ...p, idempotencia: p.idempotencia || `legacy_${p.id}` }));
            const summary = paymentSummary({ ...tx, pagos: canonical });
            pendingSave = { tx, pagos: canonical, summary, accion, before, extra };
            return { ...tx, ...summary };
          },
        };
        const value = await work(context);
        if (!pendingSave) return value;
        const { tx, pagos, summary, accion, before, extra } = pendingSave;
        for (const { fecha, clienteId } of checkedPeriods) {
          if (closureFor(uid, fecha.slice(0, 7), clienteId)) fail('El periodo se cerro durante la operacion. No se aplicaron cambios.', 409);
        }
        if (JSON.stringify(read(uid, tx.id)) !== originals.get(tx.id)) fail('El documento cambio durante el pago. Actualice e intente nuevamente.', 409);
        for (const [id, original] of bankOriginals) {
          if (JSON.stringify(state.movimientos_bancarios.find(m => m.id === id && m.usuario_id === uid)) !== original) {
            fail('El movimiento bancario cambio durante la conciliacion.', 409);
          }
        }
        const row = state.transacciones.find(t => t.id === tx.id && t.usuario_id === uid);
        const previousRow = { ...row };
        const previousPayments = state.pagos_transacciones;
        const auditLength = state.audit_events.length;
        const updatedAt = new Date().toISOString();
        if (pagos) state.pagos_transacciones = [...(state.pagos_transacciones || []).filter(p => p.usuario_id !== uid || p.transaccion_id !== tx.id), ...pagos];
        Object.assign(row, pagos ? { estado_pago: summary.estado_pago, fecha_pago: summary.fecha_pago, conciliado: summary.conciliado } :
          { cuenta_bancaria_id: pendingSave.accountId, banco: pendingSave.banco }, { updated_at: updatedAt });
        for (const [id, txId] of bankUpdates) {
          const bank = state.movimientos_bancarios.find(m => m.id === id && m.usuario_id === uid);
          Object.assign(bank, { conciliado: Boolean(txId), transaccion_id: txId });
        }
        state.audit_events.push({ id: randomUUID(), usuario_id: uid, cliente_id: tx.cliente_id || null, accion,
          objeto_tipo: 'transaccion', objeto_id: tx.id, antes_json: before,
          despues_json: { ...row, ...summary, detalle_pago: extra }, created_at: updatedAt });
        try { persist(); }
        catch (error) {
          state.pagos_transacciones = previousPayments;
          for (const key of Object.keys(row)) delete row[key];
          Object.assign(row, previousRow);
          for (const [id, original] of bankOriginals) {
            Object.assign(state.movimientos_bancarios.find(m => m.id === id && m.usuario_id === uid), JSON.parse(original));
          }
          state.audit_events.length = auditLength;
          fail('No se pudo guardar el pago. No se aplicaron cambios. Intente nuevamente.', 503);
        }
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}
module.exports = { localPayments, createLocalPaymentRepository };
