require('dotenv').config();

try {
  require('./config/validateEnv').requireJwtSecret();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const { query, testConnection, closePool } = require('./db');
const { assertProductionEnv } = require('./config/validateEnv');

const authRoutes         = require('./routes/auth');
const clientesRoutes     = require('./routes/clientes');
const transaccionesRoutes= require('./routes/transacciones');
const fiscalRoutes       = require('./routes/fiscal');
const reportesRoutes     = require('./routes/reportes');
const vencimientosRoutes = require('./routes/vencimientos');
const movimientosRoutes  = require('./routes/movimientosBancarios');
const { createBankAccountRouter } = require('./routes/bankAccounts');
const { createBankStatementRouter } = require('./routes/bankStatements');
const { createBankSubledgerRouter } = require('./routes/bankSubledger');
const { sqlBankMovementRepository } = require('./services/bankMovementRepository');
const integracionRoutes  = require('./routes/integracion');
const contabilidadRoutes = require('./routes/contabilidad');
const auditoriaRoutes    = require('./routes/auditoria');
const { authMiddleware } = require('./middleware/auth');
const { registeredTransactionSql } = require('./services/transactionStatus');

const app  = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

assertProductionEnv();

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// In production an internal failure is logged with a reference and answered generically;
// the raw driver/database message never reaches the client.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 500 && body && typeof body === 'object' && typeof body.error === 'string') {
        const referencia = require('node:crypto').randomUUID();
        console.error(`[server error ${referencia}] ${req.method} ${req.originalUrl}: ${body.error}`);
        return json({ error: 'Error interno del servidor.', referencia });
      }
      return json(body);
    };
    next();
  });
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const info = await testConnection();
    res.json({ status: 'ok', db: info.db, time: info.now, env: process.env.NODE_ENV });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ─── DASHBOARD (requiere auth) ────────────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const uid     = req.user.id;
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);

    const [clientes, financiero, vencimientos, evolucion] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                    AS total,
          COUNT(*) FILTER (WHERE estado='activo')     AS activos,
          COUNT(*) FILTER (WHERE estado='omiso')      AS omisos,
          COUNT(*) FILTER (WHERE estado='inactivo')   AS inactivos
        FROM clientes WHERE usuario_id = $1
      `, [uid]),

      query(`
        SELECT
          COALESCE(SUM(monto)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)              AS ingresos,
          COALESCE(SUM(monto)  FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)                AS gastos,
          (COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)
            -COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0))::NUMERIC(14,2)             AS utilidad,
          COALESCE(SUM(itbms)  FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2)              AS itbms_debito,
          COALESCE(SUM(itbms)  FILTER (WHERE tipo='gasto' AND deducible),0)::NUMERIC(14,2)  AS itbms_credito,
          (COALESCE(SUM(itbms) FILTER (WHERE tipo='ingreso'),0)
            -COALESCE(SUM(itbms) FILTER (WHERE tipo='gasto' AND deducible),0))::NUMERIC(14,2) AS itbms_neto
        FROM transacciones WHERE usuario_id = $1 AND periodo = $2 AND ${registeredTransactionSql()}
      `, [uid, periodo]),

      query(`
        SELECT * FROM vencimientos
        WHERE usuario_id=$1 AND completado=false
        ORDER BY fecha ASC LIMIT 5
      `, [uid]),

      query(`
        SELECT periodo,
          COALESCE(SUM(monto) FILTER (WHERE tipo='ingreso'),0)::NUMERIC(14,2) AS ingresos,
          COALESCE(SUM(monto) FILTER (WHERE tipo='gasto'),0)::NUMERIC(14,2)   AS gastos
        FROM transacciones
        WHERE usuario_id=$1 AND periodo >= $2 AND ${registeredTransactionSql()}
        GROUP BY periodo ORDER BY periodo
      `, [uid, `${new Date().getFullYear()}-01`]),
    ]);

    res.json({
      periodo,
      clientes:     clientes.rows[0],
      financiero:   financiero.rows[0],
      vencimientos: vencimientos.rows,
      evolucion:    evolucion.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/clientes',      clientesRoutes);
app.use('/api/transacciones', transaccionesRoutes);
app.use('/api/fiscal',        fiscalRoutes);
app.use('/api/reportes',      reportesRoutes);
app.use('/api/vencimientos',  vencimientosRoutes);
app.use('/api/movimientos-bancarios', movimientosRoutes);
app.use('/api/cuentas-bancarias', authMiddleware, createBankAccountRouter(sqlBankMovementRepository));
app.use('/api/extractos-bancarios', authMiddleware, createBankStatementRouter(sqlBankMovementRepository));
app.use('/api/auxiliar-bancario', authMiddleware, createBankSubledgerRouter(sqlBankMovementRepository));
app.use('/api/conciliacion', movimientosRoutes);
app.use('/api/integracion', integracionRoutes);
app.use('/api/contabilidad', contabilidadRoutes);
app.use('/api/auditoria',    auditoriaRoutes);

// ─── 404 + ERROR HANDLER ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((err, req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── START ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  console.log(`\n🚀 ContaPanamá API v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   DB: ${process.env.DATABASE_URL ? '✓ configurada' : '✗ DATABASE_URL faltante'}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});

// ─── CIERRE ORDENADO ──────────────────────────────────────────────────────────
// Stop accepting requests, let in-flight transactions commit or roll back, then close the pool.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal}: cerrando de forma ordenada`);
  const deadline = setTimeout(() => { console.error('[server] cierre forzado por tiempo de espera'); process.exit(1); }, 15_000);
  deadline.unref();
  server.close(async () => {
    try { await closePool(); process.exit(0); }
    catch (error) { console.error('[server] error al cerrar el pool:', error.message); process.exit(1); }
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(signal));

module.exports = app;
