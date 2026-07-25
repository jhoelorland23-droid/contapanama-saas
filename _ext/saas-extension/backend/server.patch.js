// ───────────────────────────────────────────────────────────────────
//  PATCH: agregar estas líneas a saas/backend/server.js
//  (no es un archivo ejecutable — es la guía de qué pegar)
// ───────────────────────────────────────────────────────────────────

// 1) Después de las otras requires de routes:
const ocrRoutes     = require('./routes/ocr');
const feRoutes      = require('./routes/fe');
const aiRoutes      = require('./routes/ai');
const billingRoutes = require('./routes/billing');
const portalRoutes  = require('./routes/portal');

// 2) Antes de los app.use('/api/*'), exponer la carpeta uploads como static
//    (para que los recibos OCR y PDFs FE sean descargables):
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3) Con el resto de app.use('/api/...'), agregar:
app.use('/api/ocr',     ocrRoutes);
app.use('/api/fe',      feRoutes);
app.use('/api/ai',      aiRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/portal',  portalRoutes);

// 4) Agregar audit_log al header genérico de errores (opcional pero útil):
app.use((err, req, res, _next) => {
  console.error(err);
  // Si tienes acceso a logAction, regístralo:
  // require('./services/audit').logAction(req, 'error.500', 'global', null, { msg: err.message });
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});
