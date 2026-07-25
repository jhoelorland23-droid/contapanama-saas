require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const { query, testConnection } = require('./db');

const authRoutes         = require('./routes/auth');
const clientesRoutes     = require('./routes/clientes');
const transaccionesRoutes= require('./routes/transacciones');
const fiscalRoutes       = require('./routes/fiscal');
const reportesRoutes     = require('./routes/reportes');
const vencimientosRoutes = require('./routes/vencimientos');
const motorRoutes        = require('./routes/motor');
const contabilidadRoutes = require('./routes/contabilidad');
const prestamosRoutes    = require('./routes/prestamos');
const erroresRoutes      = require('./routes/errores');
const aiRoutes           = require('./routes/ai');
const ocrRoutes          = require('./routes/ocr');
const feRoutes           = require('./routes/fe');
const portalRoutes       = require('./routes/portal');
const path               = require('path');
const { authMiddleware } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

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
    const cli     = req.query.cliente_id || null;
    const cliCond = cli ? ` AND cliente_id = $3` : '';
    const evoParams = cli ? [uid, `${new Date().getFullYear()}-01`, cli] : [uid, `${new Date().getFullYear()}-01`];
    const evoCliCond = cli ? ` AND cliente_id = $3` : '';

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
        FROM transacciones WHERE usuario_id = $1 AND periodo = $2${cliCond}
      `, cli ? [uid, periodo, cli] : [uid, periodo]),

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
        WHERE usuario_id=$1 AND periodo >= $2${evoCliCond}
        GROUP BY periodo ORDER BY periodo
      `, evoParams),
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
app.use('/api/motor',         motorRoutes);
app.use('/api/contabilidad',  contabilidadRoutes);
app.use('/api/prestamos',     prestamosRoutes);
app.use('/api/errores',       erroresRoutes);
app.use('/api/ai',            aiRoutes);
app.use('/api/ocr',           ocrRoutes);
app.use('/api/fe',            feRoutes);
app.use('/api/portal',        portalRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── 404 + ERROR HANDLER ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((err, req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ContaPanamá API v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   DB: ${process.env.DATABASE_URL ? '✓ configurada' : '✗ DATABASE_URL faltante'}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
