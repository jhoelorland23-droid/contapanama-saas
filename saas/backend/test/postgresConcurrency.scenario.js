const qaCredentials = require('./helpers/qaCredentials');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));

module.exports = async function concurrencyScenario({ request, authHeaders, db, connect, check }) {
  const read = url => request(url, { headers: authHeaders });
  const send = (method, url, body) => request(url, { method, headers: authHeaders, body: JSON.stringify(body) });
  const client = await send('POST', '/api/clientes', { nombre: 'QA concurrencia SQL', tipo: 'natural', ruc: 'QA-SQL-RACES' });
  const account = await require('./bankAccountFixture').createAccount(request, authHeaders, client.id);
  const invoice = (description, fecha = '2033-01-02') => send('POST', '/api/transacciones', {
    cliente_id: client.id, fecha, descripcion: description, tipo: 'ingreso', monto: 100,
    tasa_itbms: 0, itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente',
  });
  const payBody = (importe, extra = {}) => ({ importe, fecha: '2033-01-10', metodo_pago: 'efectivo', idempotencia: randomUUID(), ...extra });

  const replayDoc = await invoice('QA reintentos simultaneos');
  const replayUrl = `/api/transacciones/${replayDoc.id}/pagos`;
  const payload = payBody('60.00');
  const replayResults = await Promise.all(Array.from({ length: 8 }, () => send('POST', replayUrl, payload)));
  assert.equal(replayResults.filter(r => !r.repetido).length, 1);
  assert.equal((await read(replayUrl)).pagos.length, 1);
  assert.equal((await read(`/api/transacciones/${replayDoc.id}/auditoria`)).data.filter(r => r.accion === 'pago_registrado').length, 1);
  check('8 simultaneous retries create exactly one payment and one audit event');

  const competing = await invoice('QA sobrepago simultaneo');
  const competingUrl = `/api/transacciones/${competing.id}/pagos`;
  const overpay = await Promise.all([settle(send('POST', competingUrl, payBody(60))), settle(send('POST', competingUrl, payBody(60)))]);
  assert.equal(overpay.filter(r => r.ok).length, 1);
  assert.match(overpay.find(r => !r.ok).error.message, /409/);
  assert.equal((await read(competingUrl)).saldo_pendiente, 40);
  check('concurrent overpayment rejected without duplicate balance or audit');

  const bank = await send('POST', '/api/movimientos-bancarios', { cliente_id: client.id, cuenta_bancaria_id: account.id, idempotencia: randomUUID(), fecha: '2033-01-10', descripcion: 'QA banco compartido',
    tipo: 'credito', banco: 'Banco General', monto: 100 });
  const matchUrls = [];
  for (let i = 0; i < 2; i++) {
    const doc = await invoice(`QA banco competencia ${i}`);
    const url = `/api/transacciones/${doc.id}/pagos`;
    const payment = await send('POST', url, payBody(100, { metodo_pago: 'transferencia', banco: 'Banco General', cuenta_bancaria_id: account.id }));
    matchUrls.push(`${url}/${payment.pagos[0].id}/conciliar`);
  }
  const matches = await Promise.all(matchUrls.map(url => settle(send('POST', url, { movimiento_id: bank.id }))));
  assert.equal(matches.filter(r => r.ok).length, 1);
  assert.match(matches.find(r => !r.ok).error.message, /409/);
  assert.equal(Number((await db.query('SELECT count(*) FROM pagos_transacciones WHERE movimiento_bancario_id=$1', [bank.id])).rows[0].count), 1);
  check('one bank movement cannot settle two concurrent payments');

  // Hold a payment immediately before INSERT, after the period check has run.
  // A closure must wait, then see the new unreconciled bank payment and refuse.
  const raceDoc = await invoice('QA pago contra cierre', '2034-01-02');
  const raceUrl = `/api/transacciones/${raceDoc.id}/pagos`;
  const closeUrl = `/api/contabilidad/cierre-estado?periodo=2034-01&cliente_id=${client.id}`;
  await db.query(`CREATE FUNCTION qa_hold_payment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.referencia='QA-RACE-CLOSE' THEN PERFORM pg_advisory_xact_lock(847525, 1); END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_hold_payment BEFORE INSERT ON pagos_transacciones FOR EACH ROW EXECUTE FUNCTION qa_hold_payment()`);
  const blocker = await connect();
  await blocker.query('SELECT pg_advisory_lock(847525, 1)');
  let paymentPending, closurePending;
  try {
    paymentPending = settle(send('POST', raceUrl, payBody(100, { fecha: '2034-01-10', metodo_pago: 'transferencia',
      banco: 'Banco General', cuenta_bancaria_id: account.id, referencia: 'QA-RACE-CLOSE' })));
    const deadline = Date.now() + 8000;
    let waiting = false;
    while (Date.now() < deadline) {
      waiting = (await db.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=847525 AND objid=1 AND NOT granted")).rowCount > 0;
      if (waiting) break;
      await delay(30);
    }
    assert(waiting, 'Payment did not reach the controlled INSERT barrier');
    let closureFinished = false;
    closurePending = settle(send('PUT', closeUrl, { estado: 'cerrado', nota: 'QA cierre concurrente' })).then(result => { closureFinished = true; return result; });
    const closureDeadline = Date.now() + 4000;
    while (!closureFinished && Date.now() < closureDeadline) {
      const locks = await db.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid<>847525 AND NOT granted");
      if (locks.rowCount) break;
      await delay(30);
    }
    await blocker.query('SELECT pg_advisory_unlock(847525, 1)');
    const paymentResult = await paymentPending;
    const closureResult = await closurePending;
    assert(paymentResult.ok, paymentResult.error?.message);
    assert(!closureResult.ok, 'Closed period while a previously validated payment was still being committed');
    assert.match(closureResult.error.message, /409/);
    assert.equal((await read(closeUrl)).data, null);
  } finally {
    await blocker.query('SELECT pg_advisory_unlock(847525, 1)');
    if (paymentPending) await paymentPending;
    if (closurePending) await closurePending;
    await db.query('DROP TRIGGER qa_hold_payment ON pagos_transacciones; DROP FUNCTION qa_hold_payment()');
  }
  check('closure and in-flight bank payment serialize; unreviewed payment cannot enter a closed period');

  const closeDoc = await invoice('QA cierre unico', '2035-01-02');
  assert(closeDoc.id);
  const concurrentCloseUrl = `/api/contabilidad/cierre-estado?periodo=2035-01&cliente_id=${client.id}`;
  await assert.rejects(send('PUT', concurrentCloseUrl, { estado: 'cerrado' }), /409/);
  const carried = await read(`/api/fiscal/conciliacion?anio=2034&cliente_id=${client.id}`);
  assert.equal(carried.transacciones_pendientes.length, 2);
  for (const payment of carried.transacciones_pendientes) {
    const evidence = await send('POST', '/api/movimientos-bancarios', {
      cliente_id: client.id, cuenta_bancaria_id: account.id, banco: account.banco,
      fecha: payment.fecha, monto: payment.importe_abono, tipo: 'credito',
      descripcion: 'QA soporte de cobro pendiente anterior', idempotencia: randomUUID(),
    });
    await send('POST', `/api/transacciones/${payment.id}/pagos/${payment.pago_id}/conciliar`, { movimiento_id: evidence.id });
  }
  assert.equal((await read(`/api/contabilidad/cierre?periodo=2035-01&cliente_id=${client.id}`)).control_bancario.pagos_pendientes, 0);
  check('a later-year close remains blocked until both earlier bank payments have their own valid evidence');
  const closures = await Promise.all(Array.from({ length: 8 }, () => send('PUT', concurrentCloseUrl, { estado: 'cerrado', nota: 'QA cierre unico' })));
  assert.equal(new Set(closures.map(c => c.data.id)).size, 1);
  const closedRows = await db.query("SELECT count(*) FROM cierres_periodo WHERE cliente_id=$1 AND periodo='2035-01'", [client.id]);
  assert.equal(Number(closedRows.rows[0].count), 1);
  await assert.rejects(db.query(`INSERT INTO cierres_periodo(usuario_id,cliente_id,periodo,anio,alcance,estado)
    SELECT usuario_id,cliente_id,periodo,anio,alcance,estado FROM cierres_periodo WHERE id=$1`, [closures[0].data.id]),
  error => error.code === '23505', 'The database itself must reject duplicate closure scopes with NULL year');
  check('8 simultaneous closures yield one closure record');

  for (const query of ['periodo=2040-01', `anio=2041&cliente_id=${client.id}`, 'anio=2042']) {
    const url = `/api/contabilidad/cierre-estado?${query}`;
    const review = await send('PUT', url, { estado: 'en_revision', nota: 'QA alcance anual/global' });
    assert.equal((await read(url)).data.id, review.data.id);
    await assert.rejects(db.query(`INSERT INTO cierres_periodo(usuario_id,cliente_id,periodo,anio,alcance,estado)
      SELECT usuario_id,cliente_id,periodo,anio,alcance,estado FROM cierres_periodo WHERE id=$1`, [review.data.id]), error => error.code === '23505');
  }
  check('monthly/annual closure uniqueness enforced for individual clients and the whole portfolio');

  const foreign = await send('POST', '/api/auth/register', { nombre: 'QA otro propietario', email: 'qa-other-owner@example.com', password: qaCredentials.randomPassword() });
  const otherHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${foreign.token}` };
  const otherClient = await request('/api/clientes', { method: 'POST', headers: otherHeaders,
    body: JSON.stringify({ nombre: 'QA cliente ajeno', tipo: 'natural', ruc: 'QA-FOREIGN' }) });
  await assert.rejects(send('POST', '/api/transacciones', { cliente_id: otherClient.id, cliente_nombre: 'Nombre forzado',
    fecha: '2033-02-01', descripcion: 'QA referencia ajena', tipo: 'ingreso', monto: 100 }), /404/);
  const own = await invoice('QA cambio de cliente');
  await assert.rejects(send('PUT', `/api/transacciones/${own.id}`, { cliente_id: otherClient.id }), /404/);
  assert.equal((await read(`/api/transacciones/${own.id}`)).cliente_id, client.id);
  check('foreign client references rejected on document creation and update');

  const draft = await db.query(`INSERT INTO ai_proposals(cliente_id,source_system,source_work_id,tipo,estado,payload)
    VALUES($1,'qa-test','QA-CLOSED-DRAFT','revision_cpa','recibida_aprobada_cpa',$2) RETURNING id`, [client.id,
    { proposal: { draftItems: [{ fecha: '2035-01-10', tipo: 'ingreso', descripcion: 'QA borrador en mes cerrado', monto: 10, tasa_itbms: 0, categoria_itbms: 'exento' }] } }]);
  await assert.rejects(send('POST', `/api/integracion/propuestas/${draft.rows[0].id}/convertir-borrador`, {}), /409/);
  assert.equal((await db.query('SELECT 1 FROM transacciones WHERE origen_propuesta_id=$1', [draft.rows[0].id])).rowCount, 0);
  check('existing proposal conversion cannot insert drafts into a closed period');

  await db.query(`CREATE FUNCTION qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.accion IN ('pago_registrado','periodo_contable_cerrado') THEN RAISE EXCEPTION 'QA audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION qa_fail_audit()`);
  try {
    const beforePayment = await read(`/api/transacciones/${own.id}/pagos`);
    await assert.rejects(send('POST', `/api/transacciones/${own.id}/pagos`, payBody(10)), /500/);
    assert.deepEqual(await read(`/api/transacciones/${own.id}/pagos`), beforePayment);
    await invoice('QA cierre atomico', '2036-01-02');
    const atomicUrl = `/api/contabilidad/cierre-estado?periodo=2036-01&cliente_id=${client.id}`;
    await assert.rejects(send('PUT', atomicUrl, { estado: 'cerrado', nota: 'QA fallo bitacora' }), /500/);
    assert.equal((await read(atomicUrl)).data, null);
  } finally {
    await db.query('DROP TRIGGER qa_fail_audit ON audit_events; DROP FUNCTION qa_fail_audit()');
  }
  check('audit failure rolls back payment and closure, with no partially committed financial state');
};
