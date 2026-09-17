require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { createLoginRateLimit } = require('./middleware/loginRateLimit');
const { isRegisteredTransaction } = require('./services/transactionStatus');
const { generarDiarioCombinado, generarEstadoResultados, generarReporteITBMS, generarBalanceComprobacion, generarMayorCuenta, generarMayorGeneral, generarRevisionCierre, generarCierresClientes, generarAntiguedadSaldos, generarConciliacionBancaria, generarPaqueteCierreCPA, generarResumenMensualAnual } = require('./services/pdfService');
const { calcularISR, vencimientoRenta, vencimientoITBMS, normalizeTipoPersona, generarObligacionesFiscales } = require('./services/fiscalEngine');
const { CHART_OF_ACCOUNTS, trialBalance, generalLedger, accountLedger, filterTransactionsByPeriod, closingReview, closingReviewByClient, portfolioReview, agingReport, monthlyAccountingSummary } = require('./services/accountingEngine');
const { historyParams, dateKey, cutoffDate, validatePeriodQuery, formalClosingScope } = require('./services/accountingPeriod');
const { validatePayment, isSettlementOnlyUpdate, isReconciliationReversal } = require('./services/paymentValidation');
const { paymentSummary, outstandingAt, hasPaymentLedger } = require('./services/paymentLedger');
const { localPayments, createLocalPaymentRepository } = require('./services/localPaymentRepository');
const { createPaymentRouter } = require('./routes/pagos');
const { reconciliationReport, reconciliationScope } = require('./services/reconciliationReport');
const { createBankMovementRouter } = require('./routes/bankMovements');
const { createBankAccountRouter } = require('./routes/bankAccounts');
const { createBankStatementRouter } = require('./routes/bankStatements');
const { createBankSubledgerRouter } = require('./routes/bankSubledger');
const { createLocalBankMovementRepository } = require('./services/bankMovementRepository');
const { assertBankClient } = require('./services/bankMovement');
const { assertAccountMatch, assertAccountOwner, documentAccountId } = require('./services/bankAccount');
const { assertLocalBankIntegrity } = require('./services/localBankIntegrity');
const { createLocalStateStore } = require('./services/localStateStore');
const localJournal = require('./services/localJournalRepository');
const { journalReport, validateJournalScope } = require('./services/journalReport');
const { generarLibroDiario } = require('./services/journalPdf');
const { changesFrom, documentRevision, authorizeCorrection, correctionAudit, isCorrectionReplay } = require('./services/documentCorrection');
const { validIdempotencyKey, sameDocument } = require('./services/documentIdempotency');

const app = express();
const asyncRoute = action => (req, res, next) => Promise.resolve().then(() => action(req, res)).catch(next);
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET;
const LOCAL_DATA_DIR = process.env.CONTAPANAMA_LOCAL_DATA_DIR || path.join(__dirname, '.local-data');
const LOCAL_STATE_FILE = path.join(LOCAL_DATA_DIR, 'contapanama-state.json');

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const now = () => new Date().toISOString();
const money = n => Number(Number(n || 0).toFixed(2));
const montoDocumento = tx => money(Number(tx?.monto || 0) + Number(tx?.itbms || 0));
const isJuridica = tipo => normalizeTipoPersona(tipo) === 'juridica';
const periodOf = fecha => String(fecha).slice(0, 7);
const normalizeCategoriaItbms = value => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'gravado') return 'general';
  if (normalized === 'no_sujeto' || normalized === 'no sujeto') return 'exento';
  if (['general', 'exento', 'alcohol_hospedaje', 'tabaco'].includes(normalized)) return normalized;
  return 'general';
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const localStore = createLocalStateStore({
  usuarios: [],
  clientes: [],
  transacciones: [],
  pagos_transacciones: [],
  movimientos_bancarios: [],
  cuentas_bancarias: [],
  extractos_bancarios: [],
  dimensiones_bancarias: [],
  operaciones_bancarias: [],
  vencimientos: [],
  cierres_periodo: [],
  work_orders: [],
  ai_proposals: [],
  audit_events: [],
  libros_contables: [],
  asientos_contables: [],
  libros_entidad: [],
  folios_libro: [],
});
const state = localStore.state;

const loadLocalState = () => {
  if (process.env.CONTAPANAMA_LOCAL_PERSISTENCE === 'off') return false;
  if (!fs.existsSync(LOCAL_STATE_FILE)) return false;
  const parsed = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, 'utf8'));
  for (const key of Object.keys(state)) {
    if (Array.isArray(parsed[key])) state[key] = parsed[key];
  }
  return true;
};

const persistLocalState = (throwOnError = false, snapshot = state) => {
  if (process.env.CONTAPANAMA_LOCAL_PERSISTENCE === 'off') return;
  try {
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    const tempFile = `${LOCAL_STATE_FILE}.tmp`;
    const fd = fs.openSync(tempFile, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(snapshot, null, 2));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tempFile, LOCAL_STATE_FILE);
  } catch (error) {
    console.error('No se pudo guardar el estado local:', error.message);
    if (throwOnError) throw error;
  }
};

loadLocalState();

app.use(localStore.middleware({
  beforeCommit: (before, req) => {
    assertLocalBankIntegrity(state, before);
    localJournal.syncWrite(state, before, cierreBloqueante, req.accountingCorrection);
  },
  persist: snapshot => persistLocalState(true, snapshot),
}));

const seed = async () => {
  if (state.usuarios.length) return;
  const adminId = randomUUID();
  state.usuarios.push({
    id: adminId,
    nombre: 'Administrador CPA',
    email: 'admin@contapanama.pa',
    password_hash: await bcrypt.hash(process.env.CONTAPANAMA_QA_PASSWORD, 8),
    rol: 'admin',
    activo: true,
    created_at: now(),
  });

  const clientes = [
    ['Constructora Istmo S.A.', '155-789-1', 'NT-00234', 'jurídica', 'Construccion', 'activo'],
    ['Carlos Mendez Palacios', '8-123-456', 'NT-00892', 'natural', 'Consultoria', 'activo'],
    ['Tech Pacific Corp', '345-101-2', 'NT-01101', 'jurídica', 'Tecnologia', 'omiso'],
    ['Maria Torres Vega', '4-234-789', 'NT-00456', 'natural', 'Comercio', 'activo'],
    ['Grupo Logistico Atlantico', '210-567-3', 'NT-00789', 'jurídica', 'Logistica', 'inactivo'],
  ];

  for (const [nombre, ruc, nit, tipo, actividad, estado] of clientes) {
    state.clientes.push({
      id: randomUUID(), usuario_id: adminId, nombre, ruc, nit, tipo, actividad, estado,
      contribuyente_itbms: true, regimen_fiscal: 'general', periodo_fiscal: 'calendario', cierre_fiscal_mes: 12,
      telefono: '', email: '', direccion: '', created_at: now(), updated_at: now(),
    });
  }

  const byName = Object.fromEntries(state.clientes.map(c => [c.nombre, c]));
  const txs = [
    ['Constructora Istmo S.A.', '2025-03-01', 'Factura servicios consultoria', 'ingreso', 3500, 245, false, 'Banco General', 'CHQ-001234'],
    ['Carlos Mendez Palacios', '2025-03-05', 'Honorarios profesionales', 'ingreso', 1800, 126, false, 'Banistmo', 'TRF-0045'],
    ['Tech Pacific Corp', '2025-03-08', 'Alquiler de oficina', 'gasto', 850, 59.5, true, 'Banco General', 'CHQ-001235'],
    ['Maria Torres Vega', '2025-03-12', 'Venta mercancia - Lote #14', 'ingreso', 5200, 364, false, 'BAC', 'TRF-0089'],
    ['Constructora Istmo S.A.', '2025-03-15', 'Servicios contabilidad mensual', 'ingreso', 2100, 147, false, 'Banco General', 'TRF-0102'],
    ['Grupo Logistico Atlantico', '2025-03-18', 'Papeleria y utiles', 'gasto', 320, 22.4, true, 'Banistmo', 'EFE-0023'],
    ['Carlos Mendez Palacios', '2025-03-22', 'Internet y telefonia', 'gasto', 180, 12.6, true, 'BAC', 'DEB-0011'],
    ['Maria Torres Vega', '2025-03-25', 'Venta servicio digital', 'ingreso', 950, 66.5, false, 'BAC', 'TRF-0110'],
    ['Tech Pacific Corp', '2025-03-28', 'Servicios de mantenimiento IT', 'ingreso', 4200, 294, false, 'Banistmo', 'TRF-0098'],
    ['Constructora Istmo S.A.', '2025-03-30', 'Compra materiales construccion', 'gasto', 7500, 525, true, 'Banco General', 'CHQ-001240'],
  ];

  for (const [cliente_nombre, fecha, descripcion, tipo, monto, itbms, deducible, banco, referencia] of txs) {
    const c = byName[cliente_nombre];
    const pagado = referencia && !referencia.startsWith('CHQ-001240');
    const categoria_contable = tipo === 'gasto'
      ? descripcion.toLowerCase().includes('alquiler') ? 'alquiler'
        : descripcion.toLowerCase().includes('internet') ? 'servicios_publicos'
        : descripcion.toLowerCase().includes('material') ? 'compras_inventario'
        : 'gastos_operativos'
      : descripcion.toLowerCase().includes('honorario') ? 'honorarios' : 'ventas_servicios';
    state.transacciones.push({
      id: randomUUID(), usuario_id: adminId, cliente_id: c.id, cliente_nombre, fecha, descripcion, tipo,
      categoria_contable,
      monto: money(monto), itbms: money(itbms), deducible, banco, referencia, periodo: periodOf(fecha),
      tipo_documento: tipo === 'gasto' ? 'cuenta_por_pagar' : 'factura',
      estado_pago: pagado ? 'pagado' : 'pendiente',
      fecha_vencimiento: addDays(fecha, 30),
      fecha_pago: pagado ? fecha : null,
      metodo_pago: referencia?.startsWith('CHQ') ? 'cheque' : referencia?.startsWith('EFE') ? 'efectivo' : 'transferencia',
      referencia_pago: pagado ? referencia : '',
      conciliado: pagado && !referencia?.startsWith('EFE'),
      fecha_conciliacion: pagado && !referencia?.startsWith('EFE') ? fecha : null,
      notas: '', created_at: now(), updated_at: now(),
    });
  }

  const vencimientos = [
    ['Declaracion ITBMS - Marzo 2025', 'DGI', '2025-04-15', 'alta'],
    ['Declaracion Renta - 2024', 'DGI', '2025-03-31', 'critica'],
    ['Aviso de Operacion - Municipio', 'Municipio', '2025-04-30', 'media'],
    ['Planilla CSS - Marzo 2025', 'CSS', '2025-04-15', 'alta'],
    ['Declaracion Renta Estimada 2025', 'DGI', '2025-06-30', 'baja'],
  ];
  for (const [descripcion, entidad, fecha, urgencia] of vencimientos) {
    state.vencimientos.push({
      id: randomUUID(), usuario_id: adminId, cliente_id: null, cliente_nombre: 'Todos',
      descripcion, entidad, fecha, urgencia, completado: false, created_at: now(),
    });
  }
  persistLocalState();
};

const publicUser = user => ({ id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, created_at: user.created_at });
const signToken = user => jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });

const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token de acceso requerido' });
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    const user = state.usuarios.find(u => u.id === decoded.id && u.activo);
    if (!user) return res.status(401).json({ error: 'Usuario no valido o desactivado' });
    req.user = publicUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
};

const own = (rows, uid) => rows.filter(r => r.usuario_id === uid);
const bankEvidenceFor = uid => ({ movements: own(state.movimientos_bancarios, uid), accounts: own(state.cuentas_bancarias, uid) });
const txFor = (uid, q = {}, { includeDrafts = false } = {}) => localPayments(own(state.transacciones, uid).filter(t => {
  if (!includeDrafts && !isRegisteredTransaction(t)) return false;
  if (q.periodo && t.periodo !== q.periodo) return false;
  if (q.anio && !String(t.periodo || t.fecha).startsWith(`${q.anio}-`)) return false;
  if (q.tipo && t.tipo !== q.tipo) return false;
  if (q.cliente_id && t.cliente_id !== q.cliente_id) return false;
  if (q.desde && t.fecha < q.desde) return false;
  if (q.hasta && t.fecha > q.hasta) return false;
  if (q.search && !t.descripcion.toLowerCase().includes(String(q.search).toLowerCase())) return false;
  return true;
}), state, uid);

const resumenTx = rows => {
  const ingresos = rows.filter(t => t.tipo === 'ingreso');
  const gastos = rows.filter(t => t.tipo === 'gasto');
  const itbmsDebito = ingresos.reduce((s, t) => s + Number(t.itbms), 0);
  const itbmsCredito = gastos.filter(t => t.deducible).reduce((s, t) => s + Number(t.itbms), 0);
  const totalIngresos = ingresos.reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = gastos.reduce((s, t) => s + Number(t.monto), 0);
  const totalPorCobrar = ingresos.reduce((s, t) => s + outstandingAt(t), 0);
  const totalPorPagar = gastos.reduce((s, t) => s + outstandingAt(t), 0);
  return {
    total_ingresos: money(totalIngresos),
    total_gastos: money(totalGastos),
    utilidad_neta: money(totalIngresos - totalGastos),
    ingresos: money(totalIngresos),
    gastos: money(totalGastos),
    utilidad: money(totalIngresos - totalGastos),
    itbms_debito: money(itbmsDebito),
    itbms_credito: money(itbmsCredito),
    itbms_neto: money(itbmsDebito - itbmsCredito),
    cuentas_por_cobrar: money(totalPorCobrar),
    cuentas_por_pagar: money(totalPorPagar),
    num_por_cobrar: ingresos.filter(t => outstandingAt(t) > 0).length,
    num_por_pagar: gastos.filter(t => outstandingAt(t) > 0).length,
    num_ingresos: ingresos.length,
    num_gastos: gastos.length,
    num_clientes: new Set(rows.map(t => t.cliente_id).filter(Boolean)).size,
  };
};

const diarioData = (uid, q) => {
  const rows = txFor(uid, q).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  const periodo = q.periodo || (q.anio ? `${q.anio} - 12 meses` : 'Todos');
  return diarioDataFromRows(rows, periodo);
};

const diarioDataFromRows = (rows, periodo) => {
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.fecha]) byDate[r.fecha] = { fecha: r.fecha, asientos: [], debe: 0, haber: 0 };
    byDate[r.fecha].asientos.push(r);
    if (r.tipo === 'ingreso') byDate[r.fecha].haber += Number(r.monto);
    else byDate[r.fecha].debe += Number(r.monto);
  }
  const totalIngresos = rows.filter(r => r.tipo === 'ingreso').reduce((s, r) => s + Number(r.monto), 0);
  const totalGastos = rows.filter(r => r.tipo === 'gasto').reduce((s, r) => s + Number(r.monto), 0);
  return {
    periodo,
    total_asientos: rows.length,
    total_ingresos: money(totalIngresos),
    total_gastos: money(totalGastos),
    resultado: money(totalIngresos - totalGastos),
    entradas: Object.values(byDate),
  };
};

const diarioDataAnual = (uid, anio, q = {}) => diarioData(uid, { ...q, anio, periodo: null });

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', db: 'local-memory', time: now(), env: 'local-review' });
});

app.post('/api/auth/login', createLoginRateLimit(), asyncRoute(async (req, res) => {
  const user = state.usuarios.find(u => u.email === String(req.body.email || '').toLowerCase());
  if (!user || !await bcrypt.compare(req.body.password || '', user.password_hash)) {
    req.loginRateLimit?.fail();
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  req.loginRateLimit?.success();
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  if (state.usuarios.some(u => u.email === email)) return res.status(409).json({ error: 'El email ya esta registrado' });
  const user = {
    id: randomUUID(), nombre: req.body.nombre, email,
    password_hash: await bcrypt.hash(req.body.password, 8), rol: 'contador', activo: true, created_at: now(),
  };
  state.usuarios.push(user);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

app.put('/api/auth/password', auth, asyncRoute(async (req, res) => {
  const user = state.usuarios.find(u => u.id === req.user.id);
  if (!await bcrypt.compare(req.body.currentPassword || '', user.password_hash)) {
    return res.status(400).json({ error: 'Contrasena actual incorrecta' });
  }
  user.password_hash = await bcrypt.hash(req.body.newPassword, 8);
  res.json({ message: 'Contrasena actualizada correctamente' });
}));

app.get('/api/auditoria', auth, (req, res) => {
  const anio = req.query.anio ? String(req.query.anio) : null;
  if (anio && !/^\d{4}$/.test(anio)) return res.status(422).json({ error: 'Anio requerido en formato YYYY' });
  const periodo = anio ? null : (req.query.periodo || today().slice(0, 7));
  if (!anio && !/^\d{4}-\d{2}$/.test(periodo)) return res.status(422).json({ error: 'Periodo requerido en formato YYYY-MM' });
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 250);
  const inScope = event => {
    const created = String(event.created_at || '');
    if (anio && !created.startsWith(`${anio}-`)) return false;
    if (!anio && !created.startsWith(periodo)) return false;
    if (req.query.cliente_id && event.cliente_id !== req.query.cliente_id) return false;
    if (req.query.accion && event.accion !== req.query.accion) return false;
    return true;
  };
  const rows = state.audit_events
    .filter(event => event.usuario_id === req.user.id && inScope(event))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(event => {
      const cliente = event.cliente_id ? state.clientes.find(c => c.id === event.cliente_id) : null;
      return {
        ...event,
        cliente_nombre: cliente?.nombre || event.despues_json?.cliente_nombre || event.antes_json?.cliente_nombre || '',
        cliente_ruc: cliente?.ruc || '',
      };
    });
  res.json({
    alcance: anio ? 'anual' : 'mensual',
    periodo,
    anio: anio ? Number(anio) : null,
    data: rows.slice(0, limit),
    total: rows.length,
  });
});

app.get('/api/dashboard', auth, (req, res) => {
  const periodo = req.query.periodo || today().slice(0, 7);
  const clientes = own(state.clientes, req.user.id);
  const rows = txFor(req.user.id, { periodo });
  const evolucionMap = {};
  for (const t of own(state.transacciones, req.user.id).filter(isRegisteredTransaction)) {
    if (!evolucionMap[t.periodo]) evolucionMap[t.periodo] = { periodo: t.periodo, ingresos: 0, gastos: 0 };
    evolucionMap[t.periodo][t.tipo === 'ingreso' ? 'ingresos' : 'gastos'] += Number(t.monto);
  }
  res.json({
    periodo,
    clientes: {
      total: clientes.length,
      activos: clientes.filter(c => c.estado === 'activo').length,
      omisos: clientes.filter(c => c.estado === 'omiso').length,
      inactivos: clientes.filter(c => c.estado === 'inactivo').length,
    },
    financiero: resumenTx(rows),
    vencimientos: own(state.vencimientos, req.user.id).filter(v => !v.completado).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5),
    evolucion: Object.values(evolucionMap).sort((a, b) => a.periodo.localeCompare(b.periodo)).map(r => ({ ...r, ingresos: money(r.ingresos), gastos: money(r.gastos) })),
  });
});

app.get('/api/clientes', auth, (req, res) => {
  let rows = own(state.clientes, req.user.id);
  if (req.query.search) rows = rows.filter(c => `${c.nombre} ${c.ruc}`.toLowerCase().includes(String(req.query.search).toLowerCase()));
  if (req.query.estado) rows = rows.filter(c => c.estado === req.query.estado);
  if (req.query.tipo) rows = rows.filter(c => c.tipo === req.query.tipo);
  rows = rows.map(c => {
    const tx = txFor(req.user.id, { cliente_id: c.id });
    return {
      ...c,
      total_transacciones: tx.length,
      total_ingresos: money(tx.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)),
      total_gastos: money(tx.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ data: rows, total: rows.length });
});

app.get('/api/clientes/stats', auth, (req, res) => {
  const rows = own(state.clientes, req.user.id);
  res.json({
    total: rows.length,
    activos: rows.filter(c => c.estado === 'activo').length,
    inactivos: rows.filter(c => c.estado === 'inactivo').length,
    omisos: rows.filter(c => c.estado === 'omiso').length,
    juridicas: rows.filter(c => isJuridica(c.tipo)).length,
    naturales: rows.filter(c => c.tipo === 'natural').length,
  });
});

app.get('/api/clientes/:id/auditoria', auth, (req, res) => {
  const row = own(state.clientes, req.user.id).find(c => c.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
  const rows = state.audit_events
    .filter(event =>
      event.cliente_id === row.id ||
      (event.objeto_tipo === 'cliente' && event.objeto_id === row.id)
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ data: rows.slice(0, 80), total: rows.length });
});

app.get('/api/clientes/:id', auth, (req, res) => {
  const row = own(state.clientes, req.user.id).find(c => c.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(row);
});

app.post('/api/clientes', auth, (req, res) => {
  if (own(state.clientes, req.user.id).some(c => c.ruc === req.body.ruc)) return res.status(409).json({ error: 'Ya existe un cliente con ese RUC' });
  const row = {
    id: randomUUID(), usuario_id: req.user.id, nombre: req.body.nombre, ruc: req.body.ruc, nit: req.body.nit || '',
    tipo: req.body.tipo || 'jurídica',
    contribuyente_itbms: req.body.contribuyente_itbms ?? true,
    regimen_fiscal: req.body.regimen_fiscal || 'general',
    periodo_fiscal: req.body.periodo_fiscal || 'calendario',
    cierre_fiscal_mes: Number(req.body.cierre_fiscal_mes || 12),
    actividad: req.body.actividad || '', estado: req.body.estado || 'activo',
    telefono: req.body.telefono || '', email: req.body.email || '', direccion: req.body.direccion || '',
    created_at: now(), updated_at: now(),
  };
  state.clientes.push(row);
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.id,
    source_system: null,
    source_work_id: null,
    accion: 'cliente_creado',
    objeto_tipo: 'cliente',
    objeto_id: row.id,
    antes_json: null,
    despues_json: row,
    created_at: now(),
  });
  res.status(201).json(row);
});

app.put('/api/clientes/:id', auth, (req, res) => {
  const row = own(state.clientes, req.user.id).find(c => c.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
  const before = { ...row };
  Object.assign(row, req.body, { updated_at: now() });
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.id,
    source_system: null,
    source_work_id: null,
    accion: 'cliente_actualizado',
    objeto_tipo: 'cliente',
    objeto_id: row.id,
    antes_json: before,
    despues_json: { ...row },
    created_at: now(),
  });
  res.json(row);
});

app.delete('/api/clientes/:id', auth, (req, res) => {
  const idx = state.clientes.findIndex(c => c.id === req.params.id && c.usuario_id === req.user.id);
  if (idx < 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  const cliente = state.clientes[idx];
  const totalTransacciones = state.transacciones.filter(t => t.cliente_id === req.params.id && t.usuario_id === req.user.id).length;
  if (totalTransacciones > 0) {
    return res.status(409).json({ error: `No se puede eliminar un cliente con ${totalTransacciones} registro(s) contable(s). Cambie el estado a inactivo para conservar el historial.` });
  }
  state.clientes.splice(idx, 1);
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: cliente.id,
    source_system: null,
    source_work_id: null,
    accion: 'cliente_eliminado',
    objeto_tipo: 'cliente',
    objeto_id: cliente.id,
    antes_json: cliente,
    despues_json: { eliminada: true },
    created_at: now(),
  });
  res.json({ message: 'Cliente eliminado correctamente' });
});

app.get('/api/transacciones', auth, (req, res) => {
  const rows = txFor(req.user.id, req.query, { includeDrafts: true }).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  res.json({ data: rows.map(t => ({ ...t, ...paymentSummary(t) })), total: rows.length });
});

app.get('/api/transacciones/resumen', auth, (req, res) => res.json(resumenTx(txFor(req.user.id, req.query))));
app.get('/api/transacciones/diario', auth, (req, res) => res.json(diarioData(req.user.id, req.query)));

app.get('/api/transacciones/evolucion', auth, (req, res) => {
  const anio = String(req.query.anio || new Date().getFullYear());
  const map = {};
  for (const t of txFor(req.user.id, { anio })) {
    if (!map[t.periodo]) map[t.periodo] = { periodo: t.periodo, ingresos: 0, gastos: 0, utilidad: 0 };
    map[t.periodo][t.tipo === 'ingreso' ? 'ingresos' : 'gastos'] += Number(t.monto);
    map[t.periodo].utilidad += t.tipo === 'ingreso' ? Number(t.monto) : -Number(t.monto);
  }
  res.json({ anio, meses: Object.values(map).map(r => ({ ...r, ingresos: money(r.ingresos), gastos: money(r.gastos), utilidad: money(r.utilidad) })) });
});

app.get('/api/transacciones/:id/auditoria', auth, (req, res) => {
  const row = own(state.transacciones, req.user.id).find(t => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaccion no encontrada' });
  const rows = state.audit_events
    .filter(event => event.usuario_id === req.user.id && (
      event.objeto_id === row.id ||
      event.despues_json?.transaccion_id === row.id
    ))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, 200);
  res.json({ data: rows, total: rows.length });
});

app.get('/api/transacciones/:id/revision', auth, (req, res) => {
  if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo un contador o administrador puede corregir documentos.' });
  const row = own(state.transacciones, req.user.id).find(t => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaccion no encontrada.' });
  if (hasPaymentLedger(localPayments([row], state, req.user.id)[0])) return res.status(409).json({ error: 'El documento tiene un historial de pagos. Gestione cada abono desde Pagos.' });
  if (row.conciliado) return res.status(409).json({ error: 'Primero debe reversarse la conciliacion.' });
  const closed = cierreBloqueante(req.user.id, row.periodo, row.cliente_id);
  if (closed) return rejectClosedPeriod(res, closed);
  res.json({ documento: row, revision: documentRevision(row) });
});

app.get('/api/transacciones/:id', auth, (req, res) => {
  const row = txFor(req.user.id, {}, { includeDrafts: true }).find(t => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaccion no encontrada' });
  res.json({ ...row, ...paymentSummary(row) });
});

app.post('/api/transacciones', auth, (req, res) => {
  if (req.body.idempotencia != null && !validIdempotencyKey(req.body.idempotencia)) return res.status(422).json({ error: 'Identificador del documento invalido.' });
  if (req.body.idempotencia) {
    // Same key: return the document already saved instead of registering it twice.
    const previous = own(state.transacciones, req.user.id).find(t => t.idempotencia === req.body.idempotencia);
    if (previous && !sameDocument(previous, req.body)) return res.status(409).json({ error: 'Ese identificador ya corresponde a otro documento.' });
    if (previous) return res.json({ ...previous, repetido: true });
  }
  const paymentError = validatePayment(req.body);
  if (paymentError) return res.status(422).json({ error: paymentError });
  if (req.body.fecha_pago) {
    const paymentClosure = cierreBloqueante(req.user.id, periodOf(req.body.fecha_pago), req.body.cliente_id || null);
    if (paymentClosure) return rejectClosedPeriod(res, paymentClosure);
  }
  if (req.body.conciliado === true) {
    return res.status(409).json({ error: 'No se puede crear una transaccion conciliada sin movimiento bancario vinculado.' });
  }
  const cliente = req.body.cliente_id ? own(state.clientes, req.user.id).find(c => c.id === req.body.cliente_id) : null;
  if (req.body.cliente_id && !cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const accountId = documentAccountId(req.body);
  if (accountId) assertAccountOwner(own(state.cuentas_bancarias,req.user.id).find(a=>a.id===accountId),req.body);
  const monto = money(req.body.monto);
  const tasaItbms = Number(req.body.tasa_itbms ?? 0.07);
  const periodo = periodOf(req.body.fecha);
  const cierre = cierreBloqueante(req.user.id, periodo, req.body.cliente_id || null);
  if (cierre) return rejectClosedPeriod(res, cierre);
  const row = {
    id: randomUUID(), usuario_id: req.user.id, cliente_id: req.body.cliente_id || null,
    cliente_nombre: req.body.cliente_nombre || cliente?.nombre || null, cuenta_bancaria_id: accountId,
    fecha: req.body.fecha, descripcion: req.body.descripcion, tipo: req.body.tipo, monto,
    categoria_contable: req.body.categoria_contable || (req.body.tipo === 'gasto' ? 'gastos_operativos' : 'ventas_servicios'),
    tasa_itbms: money(tasaItbms),
    categoria_itbms: req.body.categoria_itbms || 'general',
    itbms: req.body.itbms !== undefined && req.body.itbms !== '' ? money(req.body.itbms) : money(monto * tasaItbms),
    deducible: Boolean(req.body.deducible), banco: req.body.banco || '', referencia: req.body.referencia || '',
    tipo_documento: req.body.tipo_documento || (req.body.tipo === 'gasto' ? 'cuenta_por_pagar' : 'factura'),
    estado_pago: req.body.estado_pago || 'pendiente',
    fecha_vencimiento: req.body.fecha_vencimiento || addDays(req.body.fecha, 30),
    fecha_pago: req.body.fecha_pago || null,
    metodo_pago: req.body.metodo_pago || '',
    referencia_pago: req.body.referencia_pago || '',
    conciliado: Boolean(req.body.conciliado),
    fecha_conciliacion: req.body.conciliado ? (req.body.fecha_conciliacion || req.body.fecha_pago || req.body.fecha) : null,
    periodo, notas: req.body.notas || '', idempotencia: req.body.idempotencia || null, created_at: now(), updated_at: now(),
  };
  state.transacciones.push(row);
  res.status(201).json(row);
});

app.put('/api/transacciones/:id', auth, (req, res) => {
  const row = own(state.transacciones, req.user.id).find(t => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaccion no encontrada' });
  if (req.body.cliente_id !== undefined) {
    const client = req.body.cliente_id ? own(state.clientes, req.user.id).find(item => item.id === req.body.cliente_id) : null;
    if (req.body.cliente_id && !client) return res.status(404).json({ error: 'Cliente no encontrado.' });
    req.body = { ...req.body, cliente_nombre: client?.nombre || req.body.cliente_nombre || null };
  }
  if (req.body.revision_esperada) {
    const event = own(state.audit_events, req.user.id).findLast(e => e.objeto_id === row.id && e.accion === 'documento_corregido' &&
      e.despues_json?.ajuste?.revision_anterior === req.body.revision_esperada);
    if (isCorrectionReplay(row, req.body, event, req.user)) return res.json(row);
  }
  if (hasPaymentLedger(localPayments([row], state, req.user.id)[0])) {
    return res.status(409).json({ error: 'El documento tiene un historial de pagos. Gestione cada abono desde Pagos; no se permite sobrescribir el documento.' });
  }
  if (req.body.estado_contable !== undefined) {
    return res.status(409).json({ error: 'Use Registrar para confirmar un borrador en libros.' });
  }
  if (!isRegisteredTransaction(row) && ((req.body.estado_pago && req.body.estado_pago !== 'pendiente') || req.body.fecha_pago)) {
    return res.status(409).json({ error: 'Registre el borrador antes de ingresar un pago o cobro.' });
  }
  const protectedFields = ['cliente_id','cliente_nombre','fecha','descripcion','tipo','categoria_contable','monto','tasa_itbms','categoria_itbms','itbms','deducible','banco','referencia','tipo_documento','estado_pago','fecha_pago','metodo_pago','referencia_pago'];
  const lockedFields = protectedFields.filter(field => req.body[field] !== undefined);
  const reversaConciliacion = row.conciliado && req.body.conciliado === false;
  if (!row.conciliado && req.body.conciliado === true) {
    return res.status(409).json({ error: 'Use el modulo de conciliacion bancaria para vincular la transaccion con un movimiento del banco.' });
  }
  if (row.conciliado && lockedFields.length && !reversaConciliacion) {
    return res.status(409).json({ error: `No se puede modificar una transaccion conciliada. Primero debe reversarse la conciliacion. Campos bloqueados: ${lockedFields.join(', ')}` });
  }
  const paymentOnly = isSettlementOnlyUpdate(row, changesFrom(req.body)) || isReconciliationReversal(row, changesFrom(req.body));
  const cierreActual = !paymentOnly && cierreBloqueante(req.user.id, row.periodo || periodOf(row.fecha), row.cliente_id || null);
  if (cierreActual) return rejectClosedPeriod(res, cierreActual);
  const nextPeriod = req.body.fecha ? periodOf(req.body.fecha) : (row.periodo || periodOf(row.fecha));
  const nextClientId = req.body.cliente_id !== undefined ? (req.body.cliente_id || null) : (row.cliente_id || null);
  if (nextClientId && !own(state.clientes, req.user.id).some(c => c.id === nextClientId)) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }
  if (nextPeriod !== (row.periodo || periodOf(row.fecha)) || nextClientId !== (row.cliente_id || null)) {
    const cierreDestino = cierreBloqueante(req.user.id, nextPeriod, nextClientId);
    if (cierreDestino) return rejectClosedPeriod(res, cierreDestino);
  }
  const before = { ...row };
  const next = { ...row, ...req.body };
  if (row.estado_pago !== 'pagado' && next.estado_pago === 'pagado') {
    const accountId=documentAccountId({...next,cuenta_bancaria_id:row.cuenta_bancaria_id});
    if(accountId) assertAccountOwner(own(state.cuentas_bancarias,req.user.id).find(a=>a.id===accountId),next);
  }
  if (lockedFields.length) {
    const paymentError = validatePayment(next);
    if (paymentError) return res.status(422).json({ error: paymentError });
  }
  for (const tx of [row, next]) {
    if (!tx.fecha_pago) continue;
    const closure = cierreBloqueante(req.user.id, periodOf(tx.fecha_pago), tx.cliente_id || null);
    if (closure) return rejectClosedPeriod(res, closure);
  }
  req.accountingCorrection = authorizeCorrection(row, req.body, req.user);
  const updatable = [...protectedFields, 'fecha_vencimiento', 'conciliado', 'fecha_conciliacion', 'notas'];
  for (const field of updatable) {
    if (req.body[field] !== undefined) row[field] = req.body[field];
  }
  row.updated_at = now();
  if (req.body.fecha) row.periodo = periodOf(req.body.fecha);
  if (reversaConciliacion) {
    for (const mov of own(state.movimientos_bancarios, req.user.id).filter(m => m.transaccion_id === row.id)) {
      mov.conciliado = false;
      mov.transaccion_id = null;
    }
    row.fecha_conciliacion = null;
  }
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: req.accountingCorrection ? 'documento_corregido' : reversaConciliacion ? 'conciliacion_bancaria_reversada' : 'transaccion_actualizada',
    objeto_tipo: 'transaccion',
    objeto_id: row.id,
    antes_json: before,
    despues_json: correctionAudit(req.accountingCorrection, { ...row }),
    created_at: now(),
  });
  res.json(row);
});

app.post('/api/transacciones/:id/confirmar-borrador', auth, (req, res) => {
  const row = own(state.transacciones, req.user.id).find(t => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Transaccion no encontrada' });
  if (row.estado_contable !== 'borrador_ia') return res.status(409).json({ error: 'La transaccion no esta en estado borrador IA' });
  const cierre = cierreBloqueante(req.user.id, row.periodo || periodOf(row.fecha), row.cliente_id || null);
  if (cierre) return rejectClosedPeriod(res, cierre);
  const before = { estado_contable: row.estado_contable, notas: row.notas };
  row.estado_contable = 'registrado';
  row.notas = [row.notas || '', `Confirmado por ${req.user.nombre || req.user.email} el ${today()}.`].filter(Boolean).join(' ');
  row.updated_at = now();
  const proposal = row.origen_propuesta_id ? state.ai_proposals.find(p => p.id === row.origen_propuesta_id) : null;
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id,
    source_system: proposal?.source_system || null,
    source_work_id: proposal?.source_work_id || null,
    accion: 'borrador_ia_confirmado',
    objeto_tipo: 'transaccion',
    objeto_id: row.id,
    antes_json: before,
    despues_json: { estado_contable: row.estado_contable, notas: row.notas, origen_propuesta_id: row.origen_propuesta_id || null },
    created_at: now(),
  });
  res.json(row);
});

app.delete('/api/transacciones/:id', auth, (req, res) => {
  const idx = state.transacciones.findIndex(t => t.id === req.params.id && t.usuario_id === req.user.id);
  if (idx < 0) return res.status(404).json({ error: 'Transaccion no encontrada' });
  if (hasPaymentLedger(localPayments([state.transacciones[idx]], state, req.user.id)[0])) {
    return res.status(409).json({ error: 'No se puede eliminar un documento con historial de pagos, incluso si fueron anulados.' });
  }
  if (state.transacciones[idx].conciliado) {
    return res.status(409).json({ error: 'No se puede eliminar una transaccion conciliada. Primero debe reversarse la conciliacion.' });
  }
  const cierre = cierreBloqueante(req.user.id, state.transacciones[idx].periodo || periodOf(state.transacciones[idx].fecha), state.transacciones[idx].cliente_id || null);
  if (cierre) return rejectClosedPeriod(res, cierre);
  const deleted = state.transacciones[idx];
  if (deleted.fecha_pago) {
    const paymentClosure = cierreBloqueante(req.user.id, periodOf(deleted.fecha_pago), deleted.cliente_id || null);
    if (paymentClosure) return rejectClosedPeriod(res, paymentClosure);
  }
  state.transacciones.splice(idx, 1);
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: deleted.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: 'transaccion_eliminada',
    objeto_tipo: 'transaccion',
    objeto_id: deleted.id,
    antes_json: deleted,
    despues_json: { eliminada: true },
    created_at: now(),
  });
  res.json({ message: 'Transaccion eliminada' });
});

const contabilidadTx = (uid, q = {}) => {
  return localPayments(filterTransactionsByPeriod(own(state.transacciones, uid), historyParams(q)), state, uid);
};
const contabilidadJournal = (uid, q = {}, history = true) => localJournal.read(state, uid, q, history);

app.use(['/api/contabilidad', '/api/reportes'], validatePeriodQuery);

app.get('/api/contabilidad/plan-cuentas', auth, (_req, res) => {
  res.json({ data: CHART_OF_ACCOUNTS, total: CHART_OF_ACCOUNTS.length });
});

app.get('/api/contabilidad/libro', auth, (req, res) => res.json(localJournal.preview(state, req.user.id)));
app.get('/api/contabilidad/libros-entidad', auth, (req, res) => res.json(localJournal.entityPreview(state, req.user.id)));
app.post('/api/contabilidad/libros-entidad/incorporar', auth, (req, res) => {
  if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'La asignacion requiere revision de un contador.' });
  if (!/^[a-f0-9]{64}$/i.test(req.body.fingerprint || '') || req.body.confirmacion !== 'ASIGNAR LIBROS POR CLIENTE') {
    return res.status(422).json({ error: 'Revise y confirme la asignacion de libros por cliente.' });
  }
  res.json(localJournal.incorporateEntities(state, req.user.id, req.body.fingerprint));
});
app.post('/api/contabilidad/libro/incorporar', auth, (req, res) => {
  if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'La incorporacion requiere revision de un contador.' });
  if (!/^[a-f0-9]{64}$/i.test(req.body.fingerprint || '') || req.body.confirmacion !== 'INCORPORAR LIBRO') {
    return res.status(422).json({ error: 'Revise los saldos y confirme la incorporacion del libro.' });
  }
  res.json(localJournal.incorporate(state, req.user.id, req.body.fingerprint));
});

app.get('/api/contabilidad/asientos', auth, (req, res) => {
  const asientos = contabilidadJournal(req.user.id, req.query, false);
  const balance = trialBalance(asientos);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    total_asientos: asientos.length,
    total_lineas: asientos.reduce((sum, asiento) => sum + asiento.lineas.length, 0),
    balanceado: balance.balanceado,
    diferencia: balance.diferencia,
    data: asientos,
  });
});

app.get('/api/contabilidad/balance-comprobacion', auth, (req, res) => {
  const asientos = contabilidadJournal(req.user.id, req.query);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    total_asientos: contabilidadJournal(req.user.id, req.query, false).length,
    ...trialBalance(asientos, req.query),
  });
});

app.get('/api/contabilidad/cierre', auth, (req, res) => {
  const transacciones = contabilidadTx(req.user.id, req.query);
  const asientos = contabilidadJournal(req.user.id, req.query);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...closingReview(transacciones, asientos, req.query, bankEvidenceFor(req.user.id)),
  });
});

const cierreScope = params => {
  if (params.anio) return { alcance: 'anual', periodo: null, anio: Number(params.anio) };
  return { alcance: 'mensual', periodo: params.periodo || today().slice(0, 7), anio: null };
};

const findCierrePeriodo = (uid, params) => {
  const scope = cierreScope(params);
  return own(state.cierres_periodo, uid).find(row =>
    row.alcance === scope.alcance &&
    (row.periodo || null) === (scope.periodo || null) &&
    (Number(row.anio) || null) === (scope.anio || null) &&
    (row.cliente_id || null) === (params.cliente_id || null)
  ) || null;
};

const cierreBloqueante = (uid, periodo, clienteId = null) => {
  const anio = Number(String(periodo || '').slice(0, 4));
  return own(state.cierres_periodo, uid).find(row =>
    row.estado === 'cerrado' &&
    (
      (row.alcance === 'mensual' && row.periodo === periodo) ||
      (row.alcance === 'anual' && Number(row.anio) === anio)
    ) &&
    (
      !row.cliente_id ||
      (clienteId && row.cliente_id === clienteId)
    )
  ) || null;
};

app.use('/api/transacciones', auth, createPaymentRouter(createLocalPaymentRepository(state, cierreBloqueante)));

const rejectClosedPeriod = (res, cierre, target = 'registros contables') => res.status(409).json({
  error: cierre.alcance === 'anual'
    ? `El anio ${cierre.anio} esta cerrado. Reabra el periodo antes de modificar ${target}.`
    : `El periodo ${cierre.periodo} esta cerrado. Reabra el periodo antes de modificar ${target}.`,
  cierre,
});

const closureRowsFor = (uid, params = {}) => {
  const anio = Number(params.anio || params.periodo?.slice(0, 4) || new Date().getFullYear());
  return own(state.cierres_periodo, uid).filter(row => {
    const inYear = (row.alcance === 'mensual' && String(row.periodo || '').startsWith(`${anio}-`)) ||
      (row.alcance === 'anual' && Number(row.anio) === anio);
    const clientScope = params.includeClientClosures
      ? true
      : params.cliente_id
      ? (!row.cliente_id || row.cliente_id === params.cliente_id)
      : !row.cliente_id;
    return inYear && clientScope;
  });
};

const pickClosureStatus = (closures, params = {}) => {
  const periodo = params.periodo || null;
  const anio = Number(params.anio || periodo?.slice(0, 4));
  const clienteId = params.cliente_id || null;
  const candidates = closures
    .filter(row => {
      const sameScope = (row.alcance === 'mensual' && row.periodo === periodo) ||
        (row.alcance === 'anual' && Number(row.anio) === anio);
      const sameClient = !row.cliente_id || (clienteId && row.cliente_id === clienteId);
      return sameScope && sameClient;
    })
    .sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'cerrado' ? -1 : 1;
      if (Boolean(a.cliente_id) !== Boolean(b.cliente_id)) return a.cliente_id ? -1 : 1;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
  const row = candidates[0];
  return row ? {
    cierre_estado: row.estado,
    cierre_alcance: row.alcance,
    cierre_id: row.id,
    cierre_nota: row.nota || '',
    cerrado_at: row.cerrado_at || null,
  } : {
    cierre_estado: 'abierto',
    cierre_alcance: null,
    cierre_id: null,
    cierre_nota: '',
    cerrado_at: null,
  };
};

const withClosureStatus = (summary, closures, params = {}) => {
  const data = (summary.data || []).map(row => ({
    ...row,
    ...pickClosureStatus(closures, {
      periodo: row.periodo || params.periodo,
      anio: params.anio,
      cliente_id: row.cliente_id || params.cliente_id,
    }),
  }));
  return {
    ...summary,
    data,
    cierres_formales: {
      cerrados: data.filter(row => row.cierre_estado === 'cerrado').length,
      en_revision: data.filter(row => row.cierre_estado === 'en_revision').length,
      abiertos: data.filter(row => row.cierre_estado === 'abierto').length,
    },
  };
};

app.get('/api/contabilidad/cierre-estado', auth, (req, res) => {
  const scope = cierreScope(req.query);
  const row = findCierrePeriodo(req.user.id, req.query);
  const cliente = row?.cliente_id ? state.clientes.find(c => c.id === row.cliente_id) : null;
  res.json({
    ...scope,
    cliente_id: req.query.cliente_id || null,
    data: row ? { ...row, cliente_nombre: cliente?.nombre || '', cliente_ruc: cliente?.ruc || '' } : null,
  });
});

app.get('/api/contabilidad/cierres-periodo', auth, (req, res) => {
  let rows = own(state.cierres_periodo, req.user.id);
  if (req.query.periodo) rows = rows.filter(row => row.alcance === 'mensual' && row.periodo === req.query.periodo);
  if (req.query.anio) {
    const anio = Number(req.query.anio);
    rows = rows.filter(row =>
      (row.alcance === 'mensual' && String(row.periodo || '').startsWith(`${anio}-`)) ||
      (row.alcance === 'anual' && Number(row.anio) === anio)
    );
  }
  if (req.query.cliente_id) rows = rows.filter(row => row.cliente_id === req.query.cliente_id);
  if (req.query.estado) rows = rows.filter(row => row.estado === req.query.estado);
  rows = rows
    .map(row => {
      const cliente = row.cliente_id ? state.clientes.find(c => c.id === row.cliente_id) : null;
      return { ...row, cliente_nombre: cliente?.nombre || '', cliente_ruc: cliente?.ruc || '' };
    })
    .sort((a, b) =>
      String(b.periodo || b.anio || '').localeCompare(String(a.periodo || a.anio || '')) ||
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    )
    .slice(0, 300);
  res.json({
    data: rows,
    total: rows.length,
    cerrados: rows.filter(row => row.estado === 'cerrado').length,
    en_revision: rows.filter(row => row.estado === 'en_revision').length,
  });
});

app.put('/api/contabilidad/cierre-estado', auth, (req, res) => {
  if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo un contador o administrador puede cerrar o reabrir periodos.' });
  let reviewScope;
  try { reviewScope = formalClosingScope(req.query); }
  catch (error) { return res.status(error.status || 422).json({ error: error.message }); }
  const scope = cierreScope(reviewScope);
  const estado = req.body.estado;
  if (!['en_revision', 'cerrado'].includes(estado)) return res.status(422).json({ error: 'Estado de cierre invalido' });
  if (estado === 'cerrado' && !localJournal.status(state, req.user.id)) {
    return res.status(409).json({ error: 'Revise e incorpore el libro contable antes de cerrar el periodo.' });
  }
  if (req.query.cliente_id && !own(state.clientes, req.user.id).some(c => c.id === req.query.cliente_id)) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }
  const transacciones = contabilidadTx(req.user.id, reviewScope);
  const review = closingReview(transacciones, contabilidadJournal(req.user.id, reviewScope), reviewScope, bankEvidenceFor(req.user.id));
  if (estado === 'cerrado' && !review.listo_para_cierre) {
    return res.status(409).json({ error: 'No se puede cerrar el periodo con hallazgos pendientes', issues: review.issues });
  }
  const before = findCierrePeriodo(req.user.id, req.query);
  const beforeSnapshot = before ? { ...before } : null;
  let row = before;
  if (!row) {
    row = {
      id: randomUUID(),
      usuario_id: req.user.id,
      cliente_id: req.query.cliente_id || null,
      periodo: scope.periodo,
      anio: scope.anio,
      alcance: scope.alcance,
      estado,
      nota: req.body.nota || null,
      cerrado_at: estado === 'cerrado' ? now() : null,
      created_at: now(),
      updated_at: now(),
    };
    state.cierres_periodo.push(row);
  } else {
    row.estado = estado;
    row.nota = req.body.nota || null;
    row.cerrado_at = estado === 'cerrado' ? row.cerrado_at || now() : null;
    row.updated_at = now();
  }
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id,
    source_system: null,
    source_work_id: null,
    accion: estado === 'cerrado' ? 'periodo_contable_cerrado' : 'periodo_contable_en_revision',
    objeto_tipo: 'cierre_periodo',
    objeto_id: row.id,
    antes_json: beforeSnapshot,
    despues_json: { ...row, review },
    created_at: now(),
  });
  res.json({ ...scope, data: row, review });
});

app.get('/api/contabilidad/resumen-mensual', auth, (req, res) => {
  const anio = req.query.anio || req.query.periodo?.slice(0, 4) || String(new Date().getFullYear());
  const transacciones = contabilidadTx(req.user.id, { ...req.query, periodo: null, anio });
  const closures = closureRowsFor(req.user.id, { ...req.query, anio });
  res.json({
    cliente_id: req.query.cliente_id || null,
    ...withClosureStatus(monthlyAccountingSummary(transacciones, { anio, cliente_id: req.query.cliente_id, bankEvidence: bankEvidenceFor(req.user.id),
      journal: contabilidadJournal(req.user.id, { ...req.query, periodo: null, anio }) }), closures, {
      anio,
      cliente_id: req.query.cliente_id || null,
    }),
  });
});

app.get('/api/contabilidad/cierres-clientes', auth, (req, res) => {
  const transacciones = contabilidadTx(req.user.id, req.query);
  const clientes = own(state.clientes, req.user.id);
  const closures = closureRowsFor(req.user.id, { ...req.query, includeClientClosures: true });
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...withClosureStatus(closingReviewByClient(transacciones, clientes, req.query,
      contabilidadJournal(req.user.id, req.query), bankEvidenceFor(req.user.id)), closures, req.query),
  });
});

app.get('/api/contabilidad/cartera', auth, (req, res) => {
  const transacciones = contabilidadTx(req.user.id, req.query);
  const clientes = own(state.clientes, req.user.id);
  const closures = closureRowsFor(req.user.id, { ...req.query, includeClientClosures: true });
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...withClosureStatus(portfolioReview(transacciones, clientes, req.query,
      contabilidadJournal(req.user.id, req.query), bankEvidenceFor(req.user.id)), closures, req.query),
  });
});

app.get('/api/contabilidad/antiguedad', auth, (req, res) => {
  const transacciones = contabilidadTx(req.user.id, req.query);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...agingReport(transacciones, {
      ...req.query,
      tipo: req.query.tipo || 'todos',
      fechaCorte: req.query.fecha_corte,
    }),
  });
});

app.get('/api/contabilidad/mayor/:cuenta_codigo', auth, (req, res) => {
  const asientos = contabilidadJournal(req.user.id, req.query);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...accountLedger(asientos, req.params.cuenta_codigo, req.query),
  });
});

app.get('/api/contabilidad/mayor-general', auth, (req, res) => {
  const asientos = contabilidadJournal(req.user.id, req.query);
  res.json({
    periodo: req.query.periodo || null,
    anio: req.query.anio || null,
    ...generalLedger(asientos, req.query),
  });
});

app.use('/api/movimientos-bancarios', auth, createBankMovementRouter(createLocalBankMovementRepository(state, cierreBloqueante)));
app.use('/api/cuentas-bancarias', auth, createBankAccountRouter(createLocalBankMovementRepository(state, cierreBloqueante)));
app.use('/api/extractos-bancarios', auth, createBankStatementRouter(createLocalBankMovementRepository(state, cierreBloqueante)));
app.use('/api/auxiliar-bancario', auth, createBankSubledgerRouter(createLocalBankMovementRepository(state, cierreBloqueante)));

app.post('/api/conciliacion/match', auth, (req, res) => {
  if (!['admin', 'contador'].includes(req.user.rol)) return res.status(403).json({ error: 'La conciliacion requiere un contador.' });
  const tx = own(state.transacciones, req.user.id).find(t => t.id === req.body.transaccion_id);
  if (tx && hasPaymentLedger(localPayments([tx], state, req.user.id)[0])) {
    return res.status(409).json({ error: 'Seleccione el abono individual para conciliar este documento.' });
  }
  if (tx && !isRegisteredTransaction(tx)) return res.status(409).json({ error: 'Registre el borrador antes de conciliarlo.' });
  const mov = own(state.movimientos_bancarios, req.user.id).find(m => m.id === req.body.movimiento_id);
  if (!tx || !mov) return res.status(404).json({ error: 'Movimiento o transaccion no encontrado' });
  assertBankClient(tx, mov);
  assertAccountMatch(tx, mov);
  assertAccountOwner(own(state.cuentas_bancarias, req.user.id).find(a => a.id === tx.cuenta_bancaria_id), tx, tx.estado_pago !== 'pagado');
  const payment = { ...tx, estado_pago: 'pagado', fecha_pago: tx.fecha_pago || mov.fecha, metodo_pago: tx.metodo_pago || 'transferencia', banco: tx.banco || mov.banco };
  const paymentError = tx.estado_pago === 'parcial' || tx.metodo_pago === 'efectivo' ? 'Revise el pago antes de vincularlo con banco.' : validatePayment(payment);
  const cierreTx = cierreBloqueante(req.user.id, periodOf(payment.fecha_pago), tx.cliente_id || null);
  if (cierreTx) return rejectClosedPeriod(res, cierreTx, 'conciliacion');
  const cierreBanco = cierreBloqueante(req.user.id, periodOf(mov.fecha), mov.cliente_id);
  if (cierreBanco) return rejectClosedPeriod(res, cierreBanco, 'conciliacion');
  if (paymentError) return res.status(422).json({ error: paymentError });
  if (tx.conciliado || mov.conciliado) return res.status(409).json({ error: 'Uno de los registros ya esta conciliado' });
  if (tx.banco && mov.banco && tx.banco !== mov.banco) return res.status(400).json({ error: 'El banco no coincide' });
  const totalTx = montoDocumento(tx);
  if (Math.abs(totalTx - Number(mov.monto)) >= 0.01) return res.status(400).json({ error: 'El monto no coincide con el total del documento' });
  const direccionValida = (tx.tipo === 'ingreso' && mov.tipo === 'credito') || (tx.tipo === 'gasto' && mov.tipo === 'debito');
  if (!direccionValida) return res.status(400).json({ error: 'El tipo de movimiento bancario no corresponde al ingreso/gasto' });
  const beforeAudit = {
    transaccion: {
      conciliado: Boolean(tx.conciliado),
      estado_pago: tx.estado_pago,
      fecha_pago: tx.fecha_pago || null,
      referencia_pago: tx.referencia_pago || null,
      banco: tx.banco || null,
    },
    movimiento: {
      id: mov.id,
      conciliado: Boolean(mov.conciliado),
      transaccion_id: mov.transaccion_id || null,
    },
  };
  tx.conciliado = true;
  tx.estado_pago = 'pagado';
  tx.fecha_conciliacion = today();
  if (!tx.fecha_pago) tx.fecha_pago = mov.fecha;
  if (!tx.metodo_pago) tx.metodo_pago = 'transferencia';
  if (!tx.referencia_pago) tx.referencia_pago = mov.referencia;
  if (!tx.banco) tx.banco = mov.banco;
  mov.conciliado = true;
  mov.transaccion_id = tx.id;
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: tx.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: 'conciliacion_bancaria_confirmada',
    objeto_tipo: 'transaccion',
    objeto_id: tx.id,
    antes_json: beforeAudit,
    despues_json: {
      transaccion_id: tx.id,
      movimiento_id: mov.id,
      banco: mov.banco,
      monto: mov.monto,
      monto_documento: totalTx,
      referencia: mov.referencia,
      fecha: mov.fecha,
    },
    created_at: now(),
  });
  res.json({ transaccion: tx, movimiento: mov });
});

app.get('/api/fiscal/itbms', auth, (req, res) => {
  const rows = txFor(req.user.id, req.query);
  const sum = resumenTx(rows);
  const periodo = req.query.periodo || 'Todos';
  const vencimiento = req.query.periodo ? new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 15).toISOString().slice(0, 10) : null;
  const desgloseMap = {};
  for (const t of rows) {
    const key = t.categoria_itbms || 'general';
    if (!desgloseMap[key]) {
      desgloseMap[key] = { categoria: key, tasa: Number(t.tasa_itbms ?? 0.07), base_ingresos: 0, base_gastos: 0, debito: 0, credito: 0, transacciones: 0 };
    }
    desgloseMap[key].transacciones += 1;
    if (t.tipo === 'ingreso') {
      desgloseMap[key].base_ingresos += Number(t.monto || 0);
      desgloseMap[key].debito += Number(t.itbms || 0);
    } else {
      desgloseMap[key].base_gastos += Number(t.monto || 0);
      if (t.deducible) desgloseMap[key].credito += Number(t.itbms || 0);
    }
  }
  const desglose = Object.values(desgloseMap)
    .sort((a, b) => a.tasa - b.tasa)
    .map(r => ({ ...r, base_ingresos: money(r.base_ingresos), base_gastos: money(r.base_gastos), debito: money(r.debito), credito: money(r.credito) }));
  res.json({
    base_imponible: sum.total_ingresos,
    debito: sum.itbms_debito,
    credito: sum.itbms_credito,
    saldo_pagar: sum.itbms_neto,
    num_ventas: sum.num_ingresos,
    num_compras_ded: rows.filter(t => t.tipo === 'gasto' && t.deducible).length,
    periodo,
    tasa: null,
    desglose,
    formulario: '430-DGI',
    vencimiento,
    validacion: { ok: sum.itbms_neto >= 0, mensaje: sum.itbms_neto < 0 ? 'Crédito fiscal mayor al débito' : 'Cálculo correcto' },
  });
});

app.get('/api/fiscal/renta', auth, (req, res) => {
  const anio = String(req.query.anio || new Date().getFullYear());
  const selectedClient = req.query.cliente_id ? own(state.clientes, req.user.id).find(c => c.id === req.query.cliente_id) : null;
  if (req.query.cliente_id && !selectedClient) return res.status(404).json({ error: 'Cliente no encontrado' });
  const rows = txFor(req.user.id, { anio, cliente_id: req.query.cliente_id });
  const byType = {};
  for (const t of rows) {
    const c = state.clientes.find(x => x.id === t.cliente_id);
    const tipo = c?.tipo || 'general';
    if (!byType[tipo]) byType[tipo] = [];
    byType[tipo].push(t);
  }
  if (!Object.keys(byType).length) byType[selectedClient?.tipo || 'general'] = [];
  const detalle = Object.entries(byType).map(([tipo_persona, tx]) => {
    const clientePerfil = selectedClient || tx.map(t => state.clientes.find(c => c.id === t.cliente_id)).find(Boolean) || {};
    const ingresos_brutos = money(tx.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0));
    const total_gastos = money(tx.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0));
    const gastos_deducibles = money(tx.filter(t => t.tipo === 'gasto' && t.deducible).reduce((s, t) => s + Number(t.monto), 0));
    const renta_neta = money(ingresos_brutos - gastos_deducibles);
    const resultado_contable = money(ingresos_brutos - total_gastos);
    return {
      tipo_persona,
      contribuyente_itbms: clientePerfil.contribuyente_itbms ?? true,
      regimen_fiscal: clientePerfil.regimen_fiscal || 'general',
      periodo_fiscal: clientePerfil.periodo_fiscal || 'calendario',
      cierre_fiscal_mes: clientePerfil.cierre_fiscal_mes || 12,
      ingresos_brutos, total_gastos, gastos_deducibles, renta_neta, resultado_contable,
      vencimiento: vencimientoRenta(Number(anio), tipo_persona, clientePerfil.cierre_fiscal_mes || 12),
      ...calcularISR(renta_neta, tipo_persona),
    };
  });
  res.json({ anio: Number(anio), detalle, total_impuesto: money(detalle.reduce((s, r) => s + Number(r.impuesto), 0)), vencimiento: vencimientoRenta(Number(anio), 'juridica'), formulario: '101-DGI' });
});

const conciliacionData = (uid, query = {}) => {
  const scope = reconciliationScope(query);
  const clients = own(state.clientes, uid);
  if (scope.cliente_id && !clients.some(c => c.id === scope.cliente_id)) {
    const error = new Error('Cliente no encontrado.'); error.status = 404; throw error;
  }
  return reconciliationReport(txFor(uid, {}), own(state.movimientos_bancarios, uid), scope, clients, own(state.cuentas_bancarias, uid));
};

app.get('/api/fiscal/conciliacion', auth, (req, res) => {
  const anio = req.query.anio ? String(req.query.anio) : null;
  if (anio && !/^\d{4}$/.test(anio)) return res.status(422).json({ error: 'Anio requerido en formato YYYY' });
  const periodo = req.query.periodo || today().slice(0, 7);
  if (!anio && !/^\d{4}-\d{2}$/.test(periodo)) return res.status(422).json({ error: 'Periodo requerido en formato YYYY-MM' });
  res.json(conciliacionData(req.user.id, req.query));
});

app.get('/api/fiscal/calendario', auth, (req, res) => {
  const anio = Number(req.query.anio || new Date().getFullYear());
  const hoy = today();
  const en30 = addDays(hoy, 30);
  const obligaciones = generarObligacionesFiscales({ anio }).map(o => ({
    ...o,
    estado: o.fecha_vencimiento < hoy ? 'vencido' : o.fecha_vencimiento <= en30 ? 'proximo' : 'pendiente',
  }));
  res.json({ anio, obligaciones });
});

const sendPDF = (res, buffer, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
};

app.get('/api/reportes/libro-diario', auth, asyncRoute(async (req, res) => {
  validateJournalScope(req.query);
  const report = journalReport({ book: localJournal.status(state, req.user.id),
    entries: localJournal.entityEntries(state, req.user.id), clients: own(state.clientes, req.user.id), scope: req.query,
    entityBooks: own(state.libros_entidad, req.user.id), requireEntityBooks: true });
  sendPDF(res, await generarLibroDiario(report), `libro-diario-${report.periodo}-${report.alcance}.pdf`);
}));

app.get('/api/reportes/diario', auth, asyncRoute(async (req, res) => sendPDF(
  res,
  await generarDiarioCombinado(diarioData(req.user.id, req.query)),
  `diario-combinado-${req.query.periodo}${req.query.cliente_id ? '-cliente' : ''}.pdf`
)));

app.get('/api/reportes/diario-anual', auth, asyncRoute(async (req, res) => {
  const anio = String(req.query.anio || new Date().getFullYear());
  sendPDF(
    res,
    await generarDiarioCombinado(diarioDataAnual(req.user.id, anio, req.query)),
    `diario-combinado-${anio}-12-meses${req.query.cliente_id ? '-cliente' : ''}.pdf`
  );
}));

app.get('/api/reportes/estado-resultados', auth, asyncRoute(async (req, res) => {
  const rows = txFor(req.user.id, req.query);
  const label = req.query.periodo || `${req.query.anio || new Date().getFullYear()} - 12 meses`;
  sendPDF(res, await generarEstadoResultados({
    periodo: label,
    ingresos: rows.filter(r => r.tipo === 'ingreso'),
    gastos: rows.filter(r => r.tipo === 'gasto'),
  }), `estado-resultados-${req.query.periodo || `${req.query.anio || new Date().getFullYear()}-12-meses`}${req.query.cliente_id ? '-cliente' : ''}.pdf`);
}));

app.get('/api/reportes/itbms', auth, asyncRoute(async (req, res) => {
  const sum = resumenTx(txFor(req.user.id, { periodo: req.query.periodo }));
  sendPDF(res, await generarReporteITBMS({
    periodo: req.query.periodo,
    base_imponible: sum.total_ingresos,
    debito: sum.itbms_debito,
    credito: sum.itbms_credito,
    saldo_pagar: sum.itbms_neto,
    vencimiento: new Date(Number(req.query.periodo.slice(0, 4)), Number(req.query.periodo.slice(5, 7)), 15).toISOString().slice(0, 10),
  }), `itbms-430-${req.query.periodo}.pdf`);
}));

app.get('/api/reportes/resumen-mensual', auth, asyncRoute(async (req, res) => {
  const anio = req.query.anio || req.query.periodo?.slice(0, 4) || String(new Date().getFullYear());
  const transacciones = contabilidadTx(req.user.id, { ...req.query, periodo: null, anio });
  const cliente = req.query.cliente_id
    ? own(state.clientes, req.user.id).find(c => c.id === req.query.cliente_id)
    : null;
  sendPDF(res, await generarResumenMensualAnual({
    ...monthlyAccountingSummary(transacciones, { anio, cliente_id: req.query.cliente_id, bankEvidence: bankEvidenceFor(req.user.id), journal: contabilidadJournal(req.user.id, { ...req.query, periodo: null, anio }) }),
    cliente_nombre: cliente?.nombre || '',
  }), `resumen-contable-${anio}-12-meses.pdf`);
}));

app.get('/api/reportes/balance-comprobacion', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const transacciones = contabilidadTx(req.user.id, req.query);
  const asientos = contabilidadJournal(req.user.id, req.query);
  const balance = trialBalance(asientos, req.query);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  sendPDF(res, await generarBalanceComprobacion({ ...balance,
    total_asientos: contabilidadJournal(req.user.id, req.query, false).length, periodo: label }), `balance-comprobacion-${label}.pdf`);
}));

app.get('/api/reportes/mayor/:cuenta_codigo', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const asientos = contabilidadJournal(req.user.id, req.query);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  sendPDF(res, await generarMayorCuenta({
    ...accountLedger(asientos, req.params.cuenta_codigo, req.query),
    periodo: label,
  }), `mayor-${req.params.cuenta_codigo}-${label}.pdf`);
}));

app.get('/api/reportes/mayor-general', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const asientos = contabilidadJournal(req.user.id, req.query);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  sendPDF(res, await generarMayorGeneral({ ...generalLedger(asientos, req.query), periodo: label }), `mayor-general-${label}${req.query.cliente_id ? '-cliente' : ''}.pdf`);
}));

app.get('/api/reportes/cierre', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const scope = { ...req.query, periodo, anio };
  const transacciones = contabilidadTx(req.user.id, scope);
  const asientos = contabilidadJournal(req.user.id, scope);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  sendPDF(res, await generarRevisionCierre({ ...closingReview(transacciones, asientos, scope, bankEvidenceFor(req.user.id)), periodo: label, cierre_formal: findCierrePeriodo(req.user.id, scope) || { estado: 'abierto', alcance: anio ? 'anual' : 'mensual', periodo, anio: anio ? Number(anio) : null } }), `revision-cierre-${label}.pdf`);
}));

app.get('/api/reportes/cierres-clientes', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const transacciones = contabilidadTx(req.user.id, req.query);
  const clientes = own(state.clientes, req.user.id);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  sendPDF(res, await generarCierresClientes({ ...closingReviewByClient(transacciones, clientes, req.query,
    contabilidadJournal(req.user.id, req.query), bankEvidenceFor(req.user.id)), periodo: label }), `cierres-clientes-${label}.pdf`);
}));

app.get('/api/reportes/antiguedad', auth, asyncRoute(async (req, res) => {
  const periodo = req.query.periodo || null;
  const anio = req.query.anio || null;
  const transacciones = contabilidadTx(req.user.id, req.query);
  const label = periodo || `${anio || new Date().getFullYear()}-12-meses`;
  const report = agingReport(transacciones, req.query);
  sendPDF(res, await generarAntiguedadSaldos({ ...report, periodo: label }), `antiguedad-saldos-${label}.pdf`);
}));

app.get('/api/reportes/conciliacion', auth, asyncRoute(async (req, res) => {
  const anio = req.query.anio ? String(req.query.anio) : null;
  if (anio && !/^\d{4}$/.test(anio)) return res.status(422).json({ error: 'Anio requerido en formato YYYY' });
  const periodo = req.query.periodo || today().slice(0, 7);
  if (!anio && !/^\d{4}-\d{2}$/.test(periodo)) return res.status(422).json({ error: 'Periodo requerido en formato YYYY-MM' });
  const label = anio ? `${anio}-12-meses` : periodo;
  sendPDF(
    res,
    await generarConciliacionBancaria({ ...conciliacionData(req.user.id, req.query), periodo: label }),
    `conciliacion-bancaria-${label}.pdf`
  );
}));

app.get('/api/reportes/paquete-cierre', auth, asyncRoute(async (req, res) => {
  const anio = req.query.anio ? String(req.query.anio) : null;
  if (anio && !/^\d{4}$/.test(anio)) return res.status(422).json({ error: 'Anio requerido en formato YYYY' });
  const periodo = req.query.periodo || today().slice(0, 7);
  if (!anio && !/^\d{4}-\d{2}$/.test(periodo)) return res.status(422).json({ error: 'Periodo requerido en formato YYYY-MM' });
  const scope = { ...(anio ? { anio } : { periodo }), cliente_id: req.query.cliente_id };
  const label = anio ? `${anio}-12-meses` : periodo;
  const transacciones = contabilidadTx(req.user.id, scope);
  const asientos = contabilidadJournal(req.user.id, scope);
  const clientes = own(state.clientes, req.user.id);
  const cierreFormal = findCierrePeriodo(req.user.id, scope) || { estado: 'abierto', alcance: anio ? 'anual' : 'mensual', periodo: anio ? null : periodo, anio: anio ? Number(anio) : null };
  sendPDF(res, await generarPaqueteCierreCPA({
    periodo: label,
    anio: anio ? Number(anio) : null,
    alcance: anio ? 'anual' : 'mensual',
    cierre: { ...closingReview(transacciones, asientos, scope, bankEvidenceFor(req.user.id)), cierre_formal: cierreFormal },
    conciliacion: conciliacionData(req.user.id, scope),
    antiguedad: agingReport(transacciones, { ...scope, tipo: 'todos' }),
    cierres_clientes: closingReviewByClient(transacciones, clientes, scope, asientos, bankEvidenceFor(req.user.id)),
    resumen_mensual: anio ? monthlyAccountingSummary(transacciones, { anio, cliente_id: scope.cliente_id, journal: asientos, bankEvidence: bankEvidenceFor(req.user.id) }) : null,
  }), `paquete-cierre-cpa-${label}.pdf`);
}));

app.get('/api/reportes/cliente/:id', auth, asyncRoute(async (req, res) => {
  const cliente = own(state.clientes, req.user.id).find(c => c.id === req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const label = req.query.periodo || `${req.query.anio || 'todos'}${req.query.anio ? '-12-meses' : ''}`;
  const rows = txFor(req.user.id, { cliente_id: cliente.id, periodo: req.query.periodo, anio: req.query.anio });
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
    doc.fontSize(18).text('ContaPanama - Reporte por Cliente');
    doc.moveDown().fontSize(12).text(`Cliente: ${cliente.nombre}`);
    doc.text(`RUC: ${cliente.ruc}`);
    doc.text(`Periodo: ${label}`);
    doc.moveDown();
    for (const t of rows) doc.text(`${t.fecha} | ${t.tipo} | ${t.descripcion} | ${t.categoria_contable || '-'} | ${t.estado_pago || 'pendiente'} | ${t.banco || '-'} | ${money(t.monto)} | ITBMS ${money(t.itbms)}`);
    doc.end();
  });
  sendPDF(res, Buffer.concat(chunks), `cliente-${cliente.ruc}-${label}.pdf`);
}));

app.get('/api/vencimientos', auth, (req, res) => {
  const estado = req.query.estado || 'pendiente';
  const anio = req.query.anio ? String(req.query.anio) : null;
  if (anio && !/^\d{4}$/.test(anio)) return res.status(422).json({ error: 'Anio requerido en formato YYYY' });
  const periodo = req.query.periodo || null;
  if (periodo && !/^\d{4}-\d{2}$/.test(periodo)) return res.status(422).json({ error: 'Periodo requerido en formato YYYY-MM' });
  const clienteId = req.query.cliente_id || null;
  let rows = own(state.vencimientos, req.user.id);
  if (estado === 'pendiente') rows = rows.filter(v => !v.completado);
  else if (estado === 'completado') rows = rows.filter(v => v.completado);
  else if (estado !== 'todos') return res.status(422).json({ error: 'Estado invalido' });
  if (anio) rows = rows.filter(v => String(v.fecha).startsWith(`${anio}-`));
  else if (periodo) rows = rows.filter(v => String(v.fecha).startsWith(periodo));
  if (clienteId) rows = rows.filter(v => v.cliente_id === clienteId);
  rows = rows.sort((a, b) => Number(Boolean(a.completado)) - Number(Boolean(b.completado)) || a.fecha.localeCompare(b.fecha));
  res.json({ data: rows, total: rows.length, estado });
});

app.post('/api/vencimientos', auth, (req, res) => {
  const cliente = req.body.cliente_id
    ? own(state.clientes, req.user.id).find(c => c.id === req.body.cliente_id)
    : null;
  if (req.body.cliente_id && !cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const descripcionNormalizada = String(req.body.descripcion || '').trim().toLowerCase();
  const duplicated = own(state.vencimientos, req.user.id).find(v =>
    String(v.fecha) === String(req.body.fecha) &&
    String(v.entidad || '') === String(req.body.entidad || '') &&
    String(v.descripcion || '').trim().toLowerCase() === descripcionNormalizada &&
    (v.cliente_id || null) === (cliente?.id || null)
  );
  if (duplicated) return res.status(409).json({ error: 'Ya existe un vencimiento igual para ese cliente y fecha' });
  const row = {
    id: randomUUID(), usuario_id: req.user.id, descripcion: req.body.descripcion, entidad: req.body.entidad,
    cliente_id: cliente?.id || null, cliente_nombre: cliente?.nombre || req.body.cliente_nombre || 'Todos',
    fecha: req.body.fecha, urgencia: req.body.urgencia || 'media', completado: false, completed_at: null, created_at: now(),
  };
  state.vencimientos.push(row);
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: 'vencimiento_creado',
    objeto_tipo: 'vencimiento',
    objeto_id: row.id,
    antes_json: null,
    despues_json: row,
    created_at: now(),
  });
  res.status(201).json(row);
});

app.post('/api/vencimientos/generar-fiscal', auth, (req, res) => {
  const anio = Number(req.body.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return res.status(422).json({ error: 'Anio invalido' });
  let clientes = [];
  if (req.body.cliente_id) {
    const cliente = own(state.clientes, req.user.id).find(c => c.id === req.body.cliente_id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    clientes = [cliente];
  } else {
    clientes = own(state.clientes, req.user.id).filter(c => (c.estado || 'activo') !== 'inactivo');
  }
  const obligaciones = clientes.flatMap(cliente => generarObligacionesFiscales({ anio, cliente }));
  const creadas = [];
  const omitidas = [];

  for (const obligacion of obligaciones) {
    const duplicated = own(state.vencimientos, req.user.id).find(v =>
      String(v.fecha) === String(obligacion.fecha_vencimiento) &&
      String(v.entidad || '') === String(obligacion.entidad || '') &&
      String(v.descripcion || '').trim().toLowerCase() === String(obligacion.descripcion || '').trim().toLowerCase() &&
      (v.cliente_id || null) === (obligacion.cliente_id || null)
    );
    if (duplicated) {
      omitidas.push({ ...obligacion, motivo: 'duplicado', vencimiento_id: duplicated.id });
      continue;
    }
    const row = {
      id: randomUUID(),
      usuario_id: req.user.id,
      descripcion: obligacion.descripcion,
      entidad: obligacion.entidad,
      cliente_id: obligacion.cliente_id || null,
      cliente_nombre: obligacion.cliente_nombre,
      fecha: obligacion.fecha_vencimiento,
      urgencia: obligacion.urgencia,
      completado: false,
      completed_at: null,
      created_at: now(),
    };
    state.vencimientos.push(row);
    state.audit_events.push({
      id: randomUUID(),
      usuario_id: req.user.id,
      cliente_id: row.cliente_id,
      source_system: null,
      source_work_id: null,
      accion: 'vencimiento_fiscal_generado',
      objeto_tipo: 'vencimiento',
      objeto_id: row.id,
      antes_json: null,
      despues_json: row,
      created_at: now(),
    });
    creadas.push(row);
  }
  res.status(201).json({
    anio,
    cliente_id: req.body.cliente_id || null,
    total_clientes: clientes.length,
    creadas,
    omitidas,
    total_creadas: creadas.length,
    total_omitidas: omitidas.length,
  });
});

app.patch('/api/vencimientos/:id/completar', auth, (req, res) => {
  const row = own(state.vencimientos, req.user.id).find(v => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  const before = { ...row };
  row.completado = true;
  row.completed_at = now();
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: 'vencimiento_completado',
    objeto_tipo: 'vencimiento',
    objeto_id: row.id,
    antes_json: before,
    despues_json: { ...row },
    created_at: now(),
  });
  res.json(row);
});

app.delete('/api/vencimientos/:id', auth, (req, res) => {
  const row = own(state.vencimientos, req.user.id).find(v => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  state.vencimientos = state.vencimientos.filter(v => !(v.id === req.params.id && v.usuario_id === req.user.id));
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: row.cliente_id || null,
    source_system: null,
    source_work_id: null,
    accion: 'vencimiento_eliminado',
    objeto_tipo: 'vencimiento',
    objeto_id: row.id,
    antes_json: row,
    despues_json: { eliminado: true },
    created_at: now(),
  });
  res.json({ message: 'Eliminado' });
});

app.get('/api/integracion/propuestas', auth, (req, res) => {
  const rows = state.ai_proposals
    .filter(p => {
      const cliente = state.clientes.find(c => c.id === p.cliente_id);
      return cliente?.usuario_id === req.user.id || (!p.cliente_id && req.user.rol === 'admin');
    })
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
    .slice(0, 100)
    .map(p => {
      const cliente = state.clientes.find(c => c.id === p.cliente_id);
      return {
        ...p,
        cliente_id: cliente?.id || null,
        cliente_nombre: cliente?.nombre || null,
        cliente_ruc: cliente?.ruc || null,
      };
    });
  res.json({ data: rows, total: rows.length });
});

app.post('/api/integracion/propuestas/:id/vincular-cliente', auth, (req, res) => {
  const proposal = state.ai_proposals.find(p => p.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
  if (proposal.cliente_id && req.user.rol !== 'admin') return res.status(409).json({ error: 'La propuesta ya esta vinculada a un cliente.' });

  const cliente = state.clientes.find(c => c.id === req.body.cliente_id && c.usuario_id === req.user.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado para este usuario.' });

  proposal.cliente_id = cliente.id;
  proposal.updated_at = now();
  for (const work of state.work_orders) {
    if (work.source_system === proposal.source_system && work.source_work_id === proposal.source_work_id) {
      work.cliente_id = cliente.id;
      work.updated_at = now();
    }
  }
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: cliente.id,
    source_system: proposal.source_system,
    source_work_id: proposal.source_work_id,
    accion: 'propuesta_vinculada_a_cliente',
    objeto_tipo: 'ai_proposal',
    objeto_id: proposal.id,
    despues_json: { cliente_id: cliente.id, cliente_nombre: cliente.nombre, cliente_ruc: cliente.ruc },
    created_at: now(),
  });

  res.json({ status: 'linked', data: { ...proposal, cliente_nombre: cliente.nombre, cliente_ruc: cliente.ruc } });
});

app.post('/api/integracion/propuestas/:id/rechazar', auth, (req, res) => {
  const proposal = state.ai_proposals.find(p => p.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });

  const cliente = state.clientes.find(c => c.id === proposal.cliente_id);
  if (cliente?.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
    return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
  }
  if (proposal.estado === 'aplicada_borrador' || proposal.estado === 'aplicada_libro') {
    return res.status(409).json({ error: 'No se puede rechazar una propuesta ya aplicada.' });
  }
  if (proposal.estado === 'rechazada') {
    return res.json({ status: 'already_rejected', data: proposal });
  }

  const motivo = String(req.body.motivo || '').trim();
  if (motivo.length < 5) return res.status(422).json({ error: 'motivo requerido.' });

  const before = { estado: proposal.estado };
  proposal.estado = 'rechazada';
  proposal.updated_at = now();
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: proposal.cliente_id || null,
    source_system: proposal.source_system,
    source_work_id: proposal.source_work_id,
    accion: 'propuesta_rechazada',
    objeto_tipo: 'ai_proposal',
    objeto_id: proposal.id,
    antes_json: before,
    despues_json: { estado: proposal.estado, motivo },
    created_at: now(),
  });

  res.json({ status: 'rejected', data: proposal });
});

app.post('/api/integracion/propuestas/:id/convertir-borrador', auth, (req, res) => {
  const proposal = state.ai_proposals.find(p => p.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
  const cliente = state.clientes.find(c => c.id === proposal.cliente_id);
  if (cliente?.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
    return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
  }
  if (proposal.estado === 'rechazada') return res.status(409).json({ error: 'No se puede convertir una propuesta rechazada.' });
  if (!cliente) return res.status(409).json({ error: 'Vincule la propuesta a un cliente antes de crear borradores.' });
  if (proposal.estado === 'aplicada_borrador') {
    const existing = state.transacciones.filter(t => t.origen_propuesta_id === proposal.id);
    return res.json({ status: 'already_applied', data: existing, total: existing.length });
  }

  const draftItems = proposal.payload?.proposal?.draftItems;
  if (!Array.isArray(draftItems) || !draftItems.length) {
    return res.status(422).json({ error: 'La propuesta no contiene partidas contables estructuradas para convertir.' });
  }

  const created = [];
  for (const [index, item] of draftItems.entries()) {
    const tipo = String(item.tipo || '').toLowerCase();
    const monto = Number(item.monto);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.fecha || ''))) return res.status(422).json({ error: `Partida ${index + 1}: fecha invalida.` });
    if (!['ingreso', 'gasto'].includes(tipo)) return res.status(422).json({ error: `Partida ${index + 1}: tipo debe ser ingreso o gasto.` });
    if (!Number.isFinite(monto) || monto <= 0) return res.status(422).json({ error: `Partida ${index + 1}: monto debe ser mayor a 0.` });
    if (!String(item.descripcion || '').trim()) return res.status(422).json({ error: `Partida ${index + 1}: descripcion requerida.` });

    const tasaItbms = Number(item.tasa_itbms ?? 0.07);
    const row = {
      id: randomUUID(),
      usuario_id: req.user.id,
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      fecha: item.fecha,
      descripcion: String(item.descripcion).trim(),
      tipo,
      monto: money(monto),
      categoria_contable: item.categoria_contable || (tipo === 'gasto' ? 'gastos_operativos' : 'ventas_servicios'),
      tasa_itbms: Number.isFinite(tasaItbms) ? tasaItbms : 0.07,
      categoria_itbms: normalizeCategoriaItbms(item.categoria_itbms),
      itbms: item.itbms !== undefined ? money(item.itbms) : money(monto * (Number.isFinite(tasaItbms) ? tasaItbms : 0.07)),
      deducible: Boolean(item.deducible),
      banco: item.banco || '',
      referencia: item.referencia || '',
      tipo_documento: item.tipo_documento || (tipo === 'gasto' ? 'cuenta_por_pagar' : 'factura'),
      estado_pago: item.estado_pago || 'pendiente',
      fecha_vencimiento: item.fecha_vencimiento || null,
      fecha_pago: item.fecha_pago || null,
      metodo_pago: item.metodo_pago || '',
      referencia_pago: item.referencia_pago || '',
      conciliado: false,
      fecha_conciliacion: null,
      periodo: periodOf(item.fecha),
      notas: [`BORRADOR IA desde propuesta ${proposal.source_work_id}.`, item.notas || ''].filter(Boolean).join(' '),
      origen_propuesta_id: proposal.id,
      estado_contable: 'borrador_ia',
      created_at: now(),
      updated_at: now(),
    };
    state.transacciones.push(row);
    created.push(row);
  }

  proposal.estado = 'aplicada_borrador';
  proposal.updated_at = now();
  state.audit_events.push({
    id: randomUUID(),
    usuario_id: req.user.id,
    cliente_id: cliente.id,
    source_system: proposal.source_system,
    source_work_id: proposal.source_work_id,
    accion: 'propuesta_convertida_a_borrador',
    objeto_tipo: 'ai_proposal',
    objeto_id: proposal.id,
    despues_json: { transacciones_creadas: created.map(t => t.id), total: created.length },
    created_at: now(),
  });

  res.status(201).json({ status: 'draft_created', data: created, total: created.length });
});

app.get('/api/integracion/propuestas/:id/auditoria', auth, (req, res) => {
  const proposal = state.ai_proposals.find(p => p.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });

  const cliente = state.clientes.find(c => c.id === proposal.cliente_id);
  if (cliente?.usuario_id !== req.user.id && !(proposal.cliente_id === null && req.user.rol === 'admin')) {
    return res.status(403).json({ error: 'No tiene acceso a esta propuesta.' });
  }

  const rows = state.audit_events
    .filter(event =>
      (event.source_system === proposal.source_system && event.source_work_id === proposal.source_work_id) ||
      event.objeto_id === proposal.id
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, 200);

  res.json({ data: rows, total: rows.length });
});

app.post('/api/integracion/propuestas', (req, res) => {
  const configuredToken = process.env.CONTAPANAMA_INTEGRATION_TOKEN;
  if (req.get('X-Integration-Token') !== configuredToken) {
    return res.status(401).json({ error: 'Token de integracion invalido.' });
  }

  const payload = req.body || {};
  if (payload.source !== 'orlando-cpa-os' || !payload.source_work_id || !payload.client?.name || !payload.work_order?.service) {
    return res.status(422).json({ error: 'Propuesta incompleta.' });
  }
  if (payload.work_order.status !== 'Aprobado para entregar') {
    return res.status(409).json({ error: 'Solo se reciben trabajos aprobados por el CPA.' });
  }

  const existingClient = state.clientes.find(c =>
    (payload.client.ruc && c.ruc === payload.client.ruc) ||
    c.nombre.toLowerCase() === String(payload.client.name).toLowerCase()
  );
  const proposalId = randomUUID();
  const existingWorkIndex = state.work_orders.findIndex(w => w.source_system === payload.source && w.source_work_id === payload.source_work_id);
  const workOrder = {
    id: existingWorkIndex >= 0 ? state.work_orders[existingWorkIndex].id : randomUUID(),
    cliente_id: existingClient?.id || null,
    source_system: payload.source,
    source_work_id: payload.source_work_id,
    tipo_servicio: payload.work_order.service,
    estado: 'aprobado_cpa',
    decision_actual: payload.work_order.decision || 'Propuesta aprobada por Orlando CPA OS',
    payload,
    created_at: existingWorkIndex >= 0 ? state.work_orders[existingWorkIndex].created_at : now(),
    updated_at: now(),
  };
  if (existingWorkIndex >= 0) state.work_orders[existingWorkIndex] = workOrder;
  else state.work_orders.push(workOrder);

  const existingProposalIndex = state.ai_proposals.findIndex(p => p.source_system === payload.source && p.source_work_id === payload.source_work_id);
  const proposal = {
    id: existingProposalIndex >= 0 ? state.ai_proposals[existingProposalIndex].id : proposalId,
    cliente_id: existingClient?.id || null,
    source_system: payload.source,
    source_work_id: payload.source_work_id,
    tipo: payload.proposal?.type || 'revision_cpa',
    estado: 'recibida_aprobada_cpa',
    payload,
    created_at: existingProposalIndex >= 0 ? state.ai_proposals[existingProposalIndex].created_at : now(),
    updated_at: now(),
  };
  if (existingProposalIndex >= 0) state.ai_proposals[existingProposalIndex] = proposal;
  else state.ai_proposals.push(proposal);

  state.audit_events.push({
    id: randomUUID(),
    cliente_id: existingClient?.id || null,
    source_system: payload.source,
    source_work_id: payload.source_work_id,
    accion: 'propuesta_ia_recibida',
    objeto_tipo: 'ai_proposal',
    objeto_id: proposal.id,
    despues_json: payload,
    created_at: now(),
  });

  res.status(201).json({
    status: 'received',
    proposal_id: proposal.id,
    cliente_id: existingClient?.id || null,
    message: existingClient
      ? 'Propuesta aprobada recibida y vinculada a cliente existente.'
      : 'Propuesta aprobada recibida; requiere vincular cliente en ContaPanama.',
  });
});

app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  if (!res.headersSent) res.status(error.status || 500).json({ error: error.message });
});

seed().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`\nContaPanama API local lista en http://${HOST}:${PORT}`);
    console.log('Login de revision: admin@contapanama.pa / [REDACTED_QA_PASSWORD]\n');
  });
});

module.exports = app;
