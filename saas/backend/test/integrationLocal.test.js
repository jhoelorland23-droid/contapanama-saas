const assert = require('assert');
const { spawn } = require('child_process');
const { randomUUID } = require('node:crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const INTEGRATION_TOKEN = process.env.CONTAPANAMA_INTEGRATION_TOKEN /* historical credential redacted */;
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'contapanama-integration-'));

const serverPath = path.join(__dirname, '..', 'server.local.js');
let PORT;
let BASE_URL;
let child;
let serverOutput = '';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = String(probe.address().port);
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: port,
      HOST: '127.0.0.1',
      CONTAPANAMA_INTEGRATION_TOKEN: INTEGRATION_TOKEN,
      JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
      CONTAPANAMA_LOCAL_DATA_DIR: TEST_DATA_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function requestRaw(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return response;
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await request('/health');
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Servidor local no inicio. ${lastError?.message || ''}\n${serverOutput}`);
}

async function run() {
  PORT = await getFreePort();
  BASE_URL = `http://127.0.0.1:${PORT}`;
  startServer(PORT);
  await waitForServer();

  const sourceWorkId = `TRB-INT-${Date.now()}`;
  const clientName = 'Cliente Integracion Operativa S.A.';
  const clientRuc = `RUC-INT-${Date.now()}`;
  const proposalPayload = {
    source: 'orlando-cpa-os',
    source_work_id: sourceWorkId,
    client: {
      name: clientName,
      ruc: clientRuc,
      type: 'Persona juridica',
      email: 'operaciones@example.com',
      phone: '6000-1000',
    },
    work_order: {
      id: sourceWorkId,
      service: 'Contabilidad mensual',
      source: 'Orlando CPA OS',
      status: 'Aprobado para entregar',
      priority: 'Media',
      due: 'Hoy',
      received: ['Factura de venta'],
      missing: [],
      lastAction: 'Aprobado por Orlando',
      decision: 'Autorizado para propuesta contable',
    },
    documents: [],
    proposal: {
      type: 'revision_cpa',
      approvalStatus: 'aprobado_cpa',
      recommendedAction: 'Crear borrador contable controlado',
      draftItems: [
        {
          fecha: '2026-08-27',
          descripcion: 'Ingreso prueba integracion local',
          tipo: 'ingreso',
          monto: 150,
          tasa_itbms: 0.07,
          categoria_itbms: 'gravado',
          categoria_contable: 'ventas_servicios',
          banco: 'Banco General',
          referencia: 'F-IA-001',
          deducible: true,
          estado_pago: 'pendiente',
        },
      ],
    },
  };

  const received = await request('/api/integracion/propuestas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Integration-Token': INTEGRATION_TOKEN },
    body: JSON.stringify(proposalPayload),
  });
  assert.strictEqual(received.status, 'received');
  assert.strictEqual(received.cliente_id, null);
  assert.ok(received.proposal_id);

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@contapanama.pa', password: process.env.CONTAPANAMA_QA_PASSWORD }),
  });
  assert.ok(login.token);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
  const bookPreview = await request('/api/contabilidad/libro', { headers: authHeaders });
  assert.strictEqual(bookPreview.estado, 'pendiente_revision');
  const incorporated = await request('/api/contabilidad/libro/incorporar', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ fingerprint: bookPreview.revision.fingerprint, confirmacion: 'INCORPORAR LIBRO' }),
  });
  assert.strictEqual(incorporated.estado, 'incorporado');

  await assert.rejects(
    request('/api/transacciones', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fecha: '2025-03-31',
        descripcion: 'Registro conciliado invalido',
        tipo: 'ingreso',
        monto: 100,
        conciliado: true,
      }),
    }),
    /409/
  );

  const annualJournal = await request('/api/transacciones?anio=2025', { headers: authHeaders });
  assert.strictEqual(annualJournal.total, 10);
  assert.ok(annualJournal.data.every(tx => tx.periodo.startsWith('2025-')));

  const constructora = annualJournal.data.find(tx => tx.cliente_nombre === 'Constructora Istmo S.A.');
  assert.ok(constructora?.cliente_id);
  const annualClientJournal = await request(`/api/transacciones?anio=2025&cliente_id=${constructora.cliente_id}`, { headers: authHeaders });
  assert.strictEqual(annualClientJournal.total, 3);
  assert.ok(annualClientJournal.data.every(tx => tx.cliente_id === constructora.cliente_id));

  // A double click or a retry after a lost response must not register the document twice.
  const attemptKey = require('node:crypto').randomUUID();
  const attempt = { cliente_id: constructora.cliente_id, fecha: '2027-03-15', tipo: 'gasto', descripcion: 'Reintento local con clave',
    monto: 50, itbms: 0, tasa_itbms: 0, categoria_itbms: 'exento', estado_pago: 'pendiente', idempotencia: attemptKey };
  const attempts = await Promise.all(Array.from({ length: 4 }, () => requestRaw('/api/transacciones',
    { method: 'POST', headers: authHeaders, body: JSON.stringify(attempt) })));
  const attemptBodies = await Promise.all(attempts.map(response => response.json()));
  assert.deepStrictEqual(attempts.map(response => response.status).sort(), [200, 200, 200, 201]);
  assert.strictEqual(new Set(attemptBodies.map(body => body.id)).size, 1);
  assert.strictEqual(attemptBodies.filter(body => body.repetido).length, 3);
  const retried = await requestRaw('/api/transacciones', { method: 'POST', headers: authHeaders, body: JSON.stringify(attempt) });
  assert.strictEqual(retried.status, 200);
  const localDocs = await request('/api/transacciones?periodo=2027-03&search=Reintento%20local', { headers: authHeaders });
  assert.strictEqual(localDocs.data.length, 1);
  await assert.rejects(request('/api/transacciones', { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...attempt, monto: 51 }) }), /409.*otro documento/);
  await assert.rejects(request('/api/transacciones', { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...attempt, idempotencia: 'corta' }) }), /422/);
  console.log('Local document creation with an idempotency key is replay-safe');


  await assert.rejects(
    request(`/api/clientes/${constructora.cliente_id}`, {
      method: 'DELETE',
      headers: authHeaders,
    }),
    /409/
  );

  const reconciledSeedTx = annualJournal.data.find(tx => tx.conciliado);
  assert.ok(reconciledSeedTx);
  await assert.rejects(
    request(`/api/transacciones/${reconciledSeedTx.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    }),
    /409/
  );
  await assert.rejects(
    request(`/api/transacciones/${reconciledSeedTx.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ monto: Number(reconciledSeedTx.monto) + 1 }),
    }),
    /409/
  );
  const pendingSeedTx = annualJournal.data.find(tx => !tx.conciliado);
  assert.ok(pendingSeedTx);
  await assert.rejects(
    request(`/api/transacciones/${pendingSeedTx.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ conciliado: true, fecha_conciliacion: '2025-03-31' }),
    }),
    /409/
  );

  const annualSummary = await request('/api/transacciones/resumen?anio=2025', { headers: authHeaders });
  assert.strictEqual(Number(annualSummary.total_ingresos), 17750);
  assert.strictEqual(Number(annualSummary.total_gastos), 8850);
  assert.strictEqual(Number(annualSummary.cuentas_por_pagar), 8025);

  const fiscalCalendar = await request('/api/vencimientos/generar-fiscal', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ anio: 2026, cliente_id: constructora.cliente_id }),
  });
  assert.strictEqual(fiscalCalendar.total_creadas, 13);
  assert.strictEqual(fiscalCalendar.total_omitidas, 0);
  assert.ok(fiscalCalendar.creadas.every(row => row.cliente_id === constructora.cliente_id));
  assert.ok(fiscalCalendar.creadas.some(row => row.descripcion === 'Declaracion ITBMS - Ene 2026' && row.fecha === '2026-02-15'));
  assert.ok(fiscalCalendar.creadas.some(row => row.descripcion === 'Declaracion Renta Juridica - 2025' && row.fecha === '2026-03-31'));

  const duplicateFiscalCalendar = await request('/api/vencimientos/generar-fiscal', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ anio: 2026, cliente_id: constructora.cliente_id }),
  });
  assert.strictEqual(duplicateFiscalCalendar.total_creadas, 0);
  assert.strictEqual(duplicateFiscalCalendar.total_omitidas, 13);

  const fullPortfolioFiscalCalendar = await request('/api/vencimientos/generar-fiscal', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ anio: 2027 }),
  });
  assert.strictEqual(fullPortfolioFiscalCalendar.total_clientes, 4);
  assert.strictEqual(fullPortfolioFiscalCalendar.total_creadas, 52);
  assert.ok(fullPortfolioFiscalCalendar.creadas.some(row => row.cliente_nombre === 'Maria Torres Vega' && row.descripcion === 'Declaracion Renta Natural - 2026'));
  assert.ok(!fullPortfolioFiscalCalendar.creadas.some(row => row.cliente_nombre === 'Grupo Logistico Atlantico'));

  const portfolio = await request('/api/contabilidad/cartera?anio=2025', { headers: authHeaders });
  assert.strictEqual(portfolio.total_clientes, 5);
  assert.strictEqual(portfolio.clientes_con_movimiento, 5);
  assert.strictEqual(Number(portfolio.total_ingresos), 17750);
  assert.strictEqual(Number(portfolio.total_gastos), 8850);
  assert.ok(portfolio.data.some(row => row.cliente_nombre === 'Constructora Istmo S.A.' && Number(row.cuentas_por_pagar) === 8025));

  // Since the bank-evidence closing rule (2026-09-14), a historical "conciliado" flag without a
  // unique matching bank movement is an invalid link: the seed's eight flags must block the close.
  const closeBody = JSON.stringify({ estado: 'cerrado', nota: 'Saldos por pagar revisados al cierre' });
  const blockedClose = await fetch(`${BASE_URL}/api/contabilidad/cierre-estado?anio=2025`, { method: 'PUT', headers: authHeaders, body: closeBody });
  assert.strictEqual(blockedClose.status, 409);
  const blockedIssues = (await blockedClose.json()).issues;
  assert.ok(blockedIssues.some(issue => issue.codigo === 'VINCULOS_BANCARIOS_INVALIDOS' && issue.severidad === 'critica' && /8 vinculo/.test(issue.detalle)));
  assert.ok(blockedIssues.some(issue => issue.codigo === 'BANCOS_SIN_CONCILIAR' && /8 pago/.test(issue.detalle)));
  assert.strictEqual((await request('/api/contabilidad/cierre-estado?anio=2025', { headers: authHeaders })).data, null);

  // Regularize each legacy flag the way a CPA would: undo the unsupported mark, assign the exact
  // account, register the bank movement and link it. Only then may the year close.
  const legacyFlags = (await request('/api/transacciones?anio=2025', { headers: authHeaders })).data.filter(tx => tx.conciliado);
  assert.strictEqual(legacyFlags.length, 8);
  const evidenceAccounts = new Map();
  const ensureAccount = async (clienteId, banco) => {
    const accountKey = `${clienteId}:${banco}`;
    if (!evidenceAccounts.has(accountKey)) {
      evidenceAccounts.set(accountKey, await request('/api/cuentas-bancarias', { method: 'POST', headers: authHeaders, body: JSON.stringify({
        cliente_id: clienteId, nombre: `Cuenta ${banco}`, banco, numero: randomUUID().replaceAll('-', '').slice(0, 20),
        tipo: 'corriente', moneda: 'USD', idempotencia: randomUUID() }) }));
    }
    return evidenceAccounts.get(accountKey);
  };
  // Bank movements require the exact client account and an idempotency key.
  const bankMovement = (tx, account, body) => request('/api/movimientos-bancarios', { method: 'POST', headers: authHeaders, body: JSON.stringify({
    cliente_id: tx.cliente_id, cuenta_bancaria_id: account.id, banco: account.banco, tipo: tx.tipo === 'ingreso' ? 'credito' : 'debito',
    monto: Number((Number(tx.monto) + Number(tx.itbms)).toFixed(2)), idempotencia: randomUUID(), ...body }) });
  const linkBankEvidence = async (tx, banco, body) => {
    const account = await ensureAccount(tx.cliente_id, banco);
    await request(`/api/transacciones/${tx.id}/cuenta`, { method: 'POST', headers: authHeaders,
      body: JSON.stringify({ cuenta_bancaria_id: account.id, motivo: 'Evidencia bancaria del historial revisada por CPA' }) });
    const movement = await bankMovement(tx, account, body);
    return request('/api/conciliacion/match', { method: 'POST', headers: authHeaders, body: JSON.stringify({ transaccion_id: tx.id, movimiento_id: movement.id }) });
  };
  for (const tx of legacyFlags) {
    await request(`/api/transacciones/${tx.id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ conciliado: false }) });
    await linkBankEvidence(tx, tx.banco, { fecha: tx.fecha_pago, referencia: tx.referencia_pago, descripcion: `Soporte bancario ${tx.referencia_pago}` });
  }
  const regularized = (await request('/api/transacciones?anio=2025', { headers: authHeaders })).data.filter(tx => tx.conciliado);
  assert.strictEqual(regularized.length, 8, 'every legacy flag is now backed by a linked bank movement');
  console.log('Seed legacy reconciliation flags block the 2025 close until each one has bank evidence');

  const accruedClose = await request('/api/contabilidad/cierre-estado?anio=2025', {
      method: 'PUT',
      headers: authHeaders,
      body: closeBody,
  });
  assert.strictEqual(accruedClose.data.estado, 'cerrado');
  assert.strictEqual(accruedClose.review.cuentas_por_pagar, 8025);
  assert.strictEqual(accruedClose.review.control_bancario.vinculos_invalidos, 0);

  const reviewStatus = await request('/api/contabilidad/cierre-estado?anio=2025', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ estado: 'en_revision', nota: 'Revision anual de prueba' }),
  });
  assert.strictEqual(reviewStatus.data.estado, 'en_revision');
  assert.strictEqual(reviewStatus.data.nota, 'Revision anual de prueba');

  const loadedReviewStatus = await request('/api/contabilidad/cierre-estado?anio=2025', { headers: authHeaders });
  assert.strictEqual(loadedReviewStatus.data.estado, 'en_revision');

  const closePeriodTx = await request('/api/transacciones', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fecha: '2026-10-01',
      descripcion: 'Ingreso pagado para cierre protegido',
      tipo: 'ingreso',
      monto: 100,
      itbms: 7,
      tasa_itbms: 0.07,
      categoria_contable: 'ventas_servicios',
      cliente_id: constructora.cliente_id,
      estado_pago: 'pagado',
      fecha_pago: '2026-10-01',
      metodo_pago: 'efectivo',
      banco: '',
      referencia_pago: 'EFE-CIERRE-001',
    }),
  });
  assert.strictEqual(closePeriodTx.periodo, '2026-10');

  const closedClientPeriod = await request(`/api/contabilidad/cierre-estado?periodo=2026-10&cliente_id=${constructora.cliente_id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ estado: 'cerrado', nota: 'Cierre protegido por prueba automatizada' }),
  });
  assert.strictEqual(closedClientPeriod.data.estado, 'cerrado');

  await assert.rejects(
    request('/api/transacciones', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fecha: '2026-10-02',
        descripcion: 'Registro no permitido despues de cierre',
        tipo: 'ingreso',
        monto: 50,
        cliente_id: constructora.cliente_id,
      }),
    }),
    /409/
  );

  await assert.rejects(
    request(`/api/transacciones/${closePeriodTx.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ monto: 101 }),
    }),
    /409/
  );

  await assert.rejects(
    request(`/api/transacciones/${closePeriodTx.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    }),
    /409/
  );

  // A closed client period refuses new bank activity before any link can be attempted.
  await assert.rejects(
    bankMovement(closePeriodTx, await ensureAccount(constructora.cliente_id, 'Banco General'),
      { fecha: '2026-10-01', descripcion: 'Deposito para conciliacion bloqueada', referencia: 'DEP-CIERRE-001' }),
    /409/
  );

  const globalCloseTx = await request('/api/transacciones', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fecha: '2026-11-01',
      descripcion: 'Ingreso pagado para cierre global',
      tipo: 'ingreso',
      monto: 120,
      itbms: 8.4,
      tasa_itbms: 0.07,
      categoria_contable: 'ventas_servicios',
      cliente_id: constructora.cliente_id,
      estado_pago: 'pagado',
      fecha_pago: '2026-11-01',
      metodo_pago: 'efectivo',
      referencia_pago: 'EFE-CIERRE-002',
    }),
  });
  assert.strictEqual(globalCloseTx.periodo, '2026-11');

  const closedGlobalPeriod = await request('/api/contabilidad/cierre-estado?periodo=2026-11', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ estado: 'cerrado', nota: 'Cierre global protegido por prueba automatizada' }),
  });
  assert.strictEqual(closedGlobalPeriod.data.estado, 'cerrado');

  await assert.rejects(
    bankMovement(globalCloseTx, await ensureAccount(constructora.cliente_id, 'Banco General'),
      { fecha: '2026-11-02', descripcion: 'Movimiento bancario no permitido despues de cierre global', referencia: 'DEP-CIERRE-002' }),
    /409/
  );

  const closedClientMonthlySummary = await request(`/api/contabilidad/resumen-mensual?anio=2026&cliente_id=${constructora.cliente_id}`, {
    headers: authHeaders,
  });
  const octoberSummary = closedClientMonthlySummary.data.find(row => row.periodo === '2026-10');
  assert.strictEqual(octoberSummary.cierre_estado, 'cerrado');
  assert.strictEqual(octoberSummary.cierre_alcance, 'mensual');
  assert.strictEqual(closedClientMonthlySummary.cierres_formales.cerrados, 2);

  const closedClientPortfolio = await request('/api/contabilidad/cartera?periodo=2026-10', {
    headers: authHeaders,
  });
  const closedConstructora = closedClientPortfolio.data.find(row => row.cliente_id === constructora.cliente_id);
  assert.strictEqual(closedConstructora.cierre_estado, 'cerrado');
  assert.strictEqual(closedConstructora.cierre_alcance, 'mensual');

  const closedGlobalPortfolio = await request('/api/contabilidad/cartera?periodo=2026-11', {
    headers: authHeaders,
  });
  assert.ok(closedGlobalPortfolio.data.every(row => row.cierre_estado === 'cerrado'));

  const closureRegistry = await request('/api/contabilidad/cierres-periodo?anio=2026', {
    headers: authHeaders,
  });
  assert.ok(closureRegistry.total >= 2);
  assert.ok(closureRegistry.cerrados >= 2);
  assert.ok(closureRegistry.data.some(row => row.periodo === '2026-10' && row.cliente_id === constructora.cliente_id && row.estado === 'cerrado'));
  assert.ok(closureRegistry.data.some(row => row.periodo === '2026-11' && !row.cliente_id && row.estado === 'cerrado'));

  const annualBankReconciliation = await request('/api/fiscal/conciliacion?anio=2025', { headers: authHeaders });
  assert.strictEqual(annualBankReconciliation.alcance, 'anual');
  // Since reconciliation by client, the summary has one row per client, bank and account.
  const bancoGeneralAnnual = annualBankReconciliation.resumen.filter(row => row.banco === 'Banco General');
  assert.strictEqual(bancoGeneralAnnual.length, 2);
  // The unpaid 8,025 document is a payable, not a bank outflow.
  assert.strictEqual(Number(bancoGeneralAnnual.reduce((sum, row) => sum + Number(row.saldo_contable), 0).toFixed(2)), 5082.5);
  assert.strictEqual(Number(bancoGeneralAnnual.find(row => row.cliente_id === constructora.cliente_id).saldo_contable), 5992);

  const annualBankReconciliationPdf = await requestRaw('/api/reportes/conciliacion?anio=2025', { headers: authHeaders });
  assert.strictEqual(annualBankReconciliationPdf.headers.get('content-type'), 'application/pdf');

  const monthlyBankReconciliationPdf = await requestRaw('/api/reportes/conciliacion?periodo=2025-03', { headers: authHeaders });
  assert.strictEqual(monthlyBankReconciliationPdf.headers.get('content-type'), 'application/pdf');

  const annualClosingPackagePdf = await requestRaw('/api/reportes/paquete-cierre?anio=2025', { headers: authHeaders });
  assert.strictEqual(annualClosingPackagePdf.headers.get('content-type'), 'application/pdf');

  const monthlyClosingPackagePdf = await requestRaw('/api/reportes/paquete-cierre?periodo=2025-03', { headers: authHeaders });
  assert.strictEqual(monthlyClosingPackagePdf.headers.get('content-type'), 'application/pdf');

  const annualClientPdf = await requestRaw(`/api/reportes/diario-anual?anio=2025&cliente_id=${constructora.cliente_id}`, { headers: authHeaders });
  assert.strictEqual(annualClientPdf.headers.get('content-type'), 'application/pdf');

  const annualClientIncomePdf = await requestRaw(`/api/reportes/estado-resultados?anio=2025&cliente_id=${constructora.cliente_id}`, { headers: authHeaders });
  assert.strictEqual(annualClientIncomePdf.headers.get('content-type'), 'application/pdf');

  const generalLedger = await request('/api/contabilidad/mayor-general?anio=2025', { headers: authHeaders });
  assert.strictEqual(generalLedger.balanceado, true);
  assert.ok(generalLedger.total_cuentas > 0);
  assert.ok(generalLedger.data.some(account => account.cuenta_codigo === '1020'));

  const generalLedgerPdf = await requestRaw('/api/reportes/mayor-general?anio=2025', { headers: authHeaders });
  assert.strictEqual(generalLedgerPdf.headers.get('content-type'), 'application/pdf');

  const annualClientDetailPdf = await requestRaw(`/api/reportes/cliente/${constructora.cliente_id}?anio=2025`, { headers: authHeaders });
  assert.strictEqual(annualClientDetailPdf.headers.get('content-type'), 'application/pdf');

  const monthlyClientDetailPdf = await requestRaw(`/api/reportes/cliente/${constructora.cliente_id}?periodo=2025-03`, { headers: authHeaders });
  assert.strictEqual(monthlyClientDetailPdf.headers.get('content-type'), 'application/pdf');

  const rejectedWorkId = `TRB-REJ-${Date.now()}`;
  const rejectedPayload = {
    ...proposalPayload,
    source_work_id: rejectedWorkId,
    client: {
      ...proposalPayload.client,
      name: 'Cliente Rechazo Operativo S.A.',
      ruc: `RUC-REJ-${Date.now()}`,
    },
    work_order: {
      ...proposalPayload.work_order,
      id: rejectedWorkId,
      service: 'Revision no aplicable',
    },
  };
  const receivedRejected = await request('/api/integracion/propuestas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Integration-Token': INTEGRATION_TOKEN },
    body: JSON.stringify(rejectedPayload),
  });
  assert.strictEqual(receivedRejected.status, 'received');

  const rejected = await request(`/api/integracion/propuestas/${receivedRejected.proposal_id}/rechazar`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ motivo: 'No aplica para registro contable de prueba.' }),
  });
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.data.estado, 'rechazada');

  const rejectedAudit = await request(`/api/integracion/propuestas/${receivedRejected.proposal_id}/auditoria`, {
    headers: authHeaders,
  });
  assert.ok(rejectedAudit.data.some(event => event.accion === 'propuesta_rechazada'));

  await assert.rejects(
    request(`/api/integracion/propuestas/${receivedRejected.proposal_id}/convertir-borrador`, {
      method: 'POST',
      headers: authHeaders,
      body: '{}',
    }),
    /409/
  );

  const createdClient = await request('/api/clientes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      nombre: clientName,
      ruc: clientRuc,
      tipo: 'jurídica',
      contribuyente_itbms: true,
      regimen_fiscal: 'general',
      periodo_fiscal: 'calendario',
      cierre_fiscal_mes: 12,
      actividad: 'Contabilidad mensual',
      estado: 'activo',
      telefono: '6000-1000',
      email: 'operaciones@example.com',
      direccion: '',
    }),
  });
  assert.strictEqual(createdClient.nombre, clientName);

  const updatedClient = await request(`/api/clientes/${createdClient.id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ actividad: 'Contabilidad mensual y cumplimiento fiscal' }),
  });
  assert.strictEqual(updatedClient.actividad, 'Contabilidad mensual y cumplimiento fiscal');

  const clientAudit = await request(`/api/clientes/${createdClient.id}/auditoria`, {
    headers: authHeaders,
  });
  assert.ok(clientAudit.data.some(event => event.accion === 'cliente_creado'));
  assert.ok(clientAudit.data.some(event => event.accion === 'cliente_actualizado'));

  const auditYear = new Date().getFullYear();
  const globalAudit = await request(`/api/auditoria?anio=${auditYear}`, {
    headers: authHeaders,
  });
  assert.ok(globalAudit.total >= 2);
  assert.ok(globalAudit.data.some(event => event.accion === 'cliente_creado'));
  assert.ok(globalAudit.data.some(event => event.accion === 'cliente_actualizado'));

  const linked = await request(`/api/integracion/propuestas/${received.proposal_id}/vincular-cliente`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ cliente_id: createdClient.id }),
  });
  assert.strictEqual(linked.status, 'linked');
  assert.strictEqual(linked.data.cliente_nombre, clientName);

  const draftScope = `periodo=2026-08&cliente_id=${createdClient.id}`;
  const draftYearScope = `anio=2026&cliente_id=${createdClient.id}`;
  const draftReadPaths = [
    `/api/transacciones/resumen?${draftScope}`,
    `/api/transacciones/resumen?${draftYearScope}`,
    `/api/transacciones/diario?${draftScope}`,
    '/api/transacciones/evolucion?anio=2026',
    '/api/dashboard?periodo=2026-08',
    '/api/clientes',
    `/api/fiscal/itbms?${draftScope}`,
    `/api/fiscal/renta?${draftYearScope}`,
    '/api/fiscal/conciliacion?periodo=2026-08',
    ...['asientos', 'balance-comprobacion', 'mayor-general', 'antiguedad'].flatMap(route => [
      `/api/contabilidad/${route}?${draftScope}`,
      `/api/contabilidad/${route}?${draftYearScope}`,
    ]),
  ];
  const draftBaseline = await Promise.all(draftReadPaths.map(url => request(url, { headers: authHeaders })));

  const converted = await request(`/api/integracion/propuestas/${received.proposal_id}/convertir-borrador`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  });
  assert.strictEqual(converted.status, 'draft_created');
  assert.strictEqual(converted.total, 1);
  assert.strictEqual(converted.data[0].estado_contable, 'borrador_ia');
  assert.strictEqual(converted.data[0].origen_propuesta_id, received.proposal_id);

  for (const [index, url] of draftReadPaths.entries()) {
    assert.deepStrictEqual(await request(url, { headers: authHeaders }), draftBaseline[index], `Unposted draft changed ${url}`);
  }
  const visibleDrafts = await request(`/api/transacciones?${draftScope}`, { headers: authHeaders });
  assert(visibleDrafts.data.some(tx => tx.id === converted.data[0].id));
  for (const scope of [draftScope, draftYearScope]) {
    const draftClosing = await request(`/api/contabilidad/cierre?${scope}`, { headers: authHeaders });
    assert.strictEqual(draftClosing.total_borradores, 1);
    assert.strictEqual(draftClosing.total_transacciones, 0);
    assert(draftClosing.issues.some(issue => issue.codigo === 'BORRADORES_PENDIENTES'));
    const rejectedClose = await fetch(`${BASE_URL}/api/contabilidad/cierre-estado?${scope}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ estado: 'cerrado' }),
    });
    assert.strictEqual(rejectedClose.status, 409);
    assert((await rejectedClose.json()).issues.some(issue => issue.codigo === 'BORRADORES_PENDIENTES'));
  }
  const draftMonthly = await request(`/api/contabilidad/resumen-mensual?${draftYearScope}`, { headers: authHeaders });
  assert.strictEqual(draftMonthly.totales.ingresos, 0);
  assert.strictEqual(draftMonthly.data[7].total_borradores, 1);
  const draftPortfolio = await request(`/api/contabilidad/cartera?${draftYearScope}`, { headers: authHeaders });
  assert.strictEqual(draftPortfolio.data.find(c => c.cliente_id === createdClient.id).total_ingresos, 0);

  for (const body of [{ estado_contable: 'registrado' }, { estado_contable: null }, { estado_pago: 'pagado', fecha_pago: '2026-08-27' }]) {
    const bypass = await fetch(`${BASE_URL}/api/transacciones/${converted.data[0].id}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify(body),
    });
    assert.strictEqual(bypass.status, 409);
  }
  const draftMatch = await fetch(`${BASE_URL}/api/conciliacion/match`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ transaccion_id: converted.data[0].id, movimiento_id: 'not-a-bank-movement' }),
  });
  assert.strictEqual(draftMatch.status, 409);

  const forgedIdentity = await request(`/api/transacciones/${converted.data[0].id}`, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ id: 'forged', usuario_id: 'forged', origen_propuesta_id: null, notas: 'Revision de borrador' }),
  });
  assert.strictEqual(forgedIdentity.id, converted.data[0].id);
  assert.strictEqual(forgedIdentity.usuario_id, converted.data[0].usuario_id);
  assert.strictEqual(forgedIdentity.origen_propuesta_id, received.proposal_id);

  async function saveDraftReportEvidence(stage) {
    if (!process.env.CONTAPANAMA_QA_OUTPUT) return;
    fs.mkdirSync(process.env.CONTAPANAMA_QA_OUTPUT, { recursive: true });
    for (const [name, reportPath] of [
      ['diario', `/api/reportes/diario?${draftScope}`],
      ['diario-anual', `/api/reportes/diario-anual?${draftYearScope}`],
      ['estado', `/api/reportes/estado-resultados?${draftYearScope}`],
      ['mayor', `/api/reportes/mayor-general?${draftYearScope}`],
      ['mensual', `/api/reportes/resumen-mensual?${draftYearScope}`],
      ['cliente', `/api/reportes/cliente/${createdClient.id}?anio=2026`],
    ]) {
      const report = await requestRaw(reportPath, { headers: authHeaders });
      fs.writeFileSync(path.join(process.env.CONTAPANAMA_QA_OUTPUT, `${stage}-${name}.pdf`), Buffer.from(await report.arrayBuffer()));
    }
  }
  await saveDraftReportEvidence('borrador');

  const audit = await request(`/api/integracion/propuestas/${received.proposal_id}/auditoria`, {
    headers: authHeaders,
  });
  assert.ok(audit.total >= 3);
  assert.ok(audit.data.some(event => event.accion === 'propuesta_ia_recibida'));
  assert.ok(audit.data.some(event => event.accion === 'propuesta_vinculada_a_cliente'));
  assert.ok(audit.data.some(event => event.accion === 'propuesta_convertida_a_borrador'));

  const confirmed = await request(`/api/transacciones/${converted.data[0].id}/confirmar-borrador`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  });
  assert.strictEqual(confirmed.estado_contable, 'registrado');
  assert.ok(confirmed.notas.includes('Confirmado por'));

  for (const scope of [draftScope, draftYearScope]) {
    const registeredSummary = await request(`/api/transacciones/resumen?${scope}`, { headers: authHeaders });
    assert.strictEqual(registeredSummary.total_ingresos, 150);
    assert.strictEqual(registeredSummary.itbms_debito, 10.5);
    assert.strictEqual(registeredSummary.cuentas_por_cobrar, 160.5);
    const registeredJournal = await request(`/api/contabilidad/asientos?${scope}`, { headers: authHeaders });
    assert(registeredJournal.data.some(entry => entry.transaccion_id === converted.data[0].id));
  }
  await saveDraftReportEvidence('registrado');
  const duplicateConfirmation = await fetch(`${BASE_URL}/api/transacciones/${converted.data[0].id}/confirmar-borrador`, {
    method: 'POST', headers: authHeaders, body: '{}',
  });
  assert.strictEqual(duplicateConfirmation.status, 409);
  assert.strictEqual((await request(`/api/transacciones/resumen?${draftScope}`, { headers: authHeaders })).total_ingresos, 150);

  const finalAudit = await request(`/api/integracion/propuestas/${received.proposal_id}/auditoria`, {
    headers: authHeaders,
  });
  assert.ok(finalAudit.total >= 4);
  assert.ok(finalAudit.data.some(event => event.accion === 'borrador_ia_confirmado'));

  const conciliado = await linkBankEvidence(await request(`/api/transacciones/${converted.data[0].id}`, { headers: authHeaders }), 'Banco General',
    { fecha: '2026-08-27', descripcion: 'Deposito prueba integracion local', referencia: 'DEP-IA-001' });
  assert.strictEqual(conciliado.transaccion.conciliado, true);
  assert.strictEqual(conciliado.movimiento.conciliado, true);
  assert.strictEqual(conciliado.movimiento.transaccion_id, converted.data[0].id);

  const txAudit = await request(`/api/transacciones/${converted.data[0].id}/auditoria`, {
    headers: authHeaders,
  });
  assert.ok(txAudit.data.some(event => event.accion === 'borrador_ia_confirmado'));
  assert.ok(txAudit.data.some(event => event.accion === 'conciliacion_bancaria_confirmada'));

  const fiscalAlert = await request('/api/vencimientos', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      descripcion: 'Revision de cierre mensual prueba',
      entidad: 'DGI',
      fecha: '2026-09-15',
      urgencia: 'alta',
      cliente_id: constructora.cliente_id,
    }),
  });
  assert.strictEqual(fiscalAlert.completado, false);
  assert.strictEqual(fiscalAlert.cliente_id, constructora.cliente_id);
  assert.strictEqual(fiscalAlert.cliente_nombre, 'Constructora Istmo S.A.');

  await assert.rejects(
    request('/api/vencimientos', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        descripcion: 'Revision de cierre mensual prueba',
        entidad: 'DGI',
        fecha: '2026-09-15',
        urgencia: 'alta',
        cliente_id: constructora.cliente_id,
      }),
    }),
    /409/
  );

  const septemberAlerts = await request(`/api/vencimientos?periodo=2026-09&estado=todos&cliente_id=${constructora.cliente_id}`, {
    headers: authHeaders,
  });
  assert.ok(septemberAlerts.data.some(row => row.id === fiscalAlert.id));

  const completedAlert = await request(`/api/vencimientos/${fiscalAlert.id}/completar`, {
    method: 'PATCH',
    headers: authHeaders,
    body: '{}',
  });
  assert.strictEqual(completedAlert.completado, true);
  assert.ok(completedAlert.completed_at);

  const completedAlerts = await request('/api/vencimientos?periodo=2026-09&estado=completado', {
    headers: authHeaders,
  });
  assert.ok(completedAlerts.data.some(row => row.id === fiscalAlert.id));

  const alertAudit = await request('/api/auditoria?anio=2026&accion=vencimiento_completado', {
    headers: authHeaders,
  });
  assert.ok(alertAudit.data.some(event => event.objeto_id === fiscalAlert.id && event.cliente_id === constructora.cliente_id));

  console.log('Local integration flow tests passed');
  await require('./accountingPeriods.scenario')({ request, requestRaw, authHeaders });
  const payments = await require('./paymentLedger.scenario')({ request, requestRaw, authHeaders });
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await stopped;
  startServer(PORT);
  await waitForServer();
  assert.deepStrictEqual(await request(payments.endpoint, { headers: payments.authHeaders }), payments.expected);
  console.log('Payment ledger persistence verified after isolated backend restart');
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (child) child.kill();
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });
