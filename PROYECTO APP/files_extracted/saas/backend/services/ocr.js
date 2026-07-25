// ───────────────────────────────────────────────────────────────────
//  Service OCR — extrae datos de recibos y facturas.
// ───────────────────────────────────────────────────────────────────
//  Modo MOCK (default): devuelve datos sintéticos para que el flujo
//  funcione sin proveedor externo. Útil para dev + demos.
//
//  Para producción, configurar OCR_PROVIDER en .env:
//    OCR_PROVIDER=mindee   + MINDEE_API_KEY=...
//    OCR_PROVIDER=textract + AWS_REGION + credenciales
//    OCR_PROVIDER=vision   + GOOGLE_APPLICATION_CREDENTIALS=...
//
//  Cada provider implementa la interfaz:
//    procesar(filePath, mimetype) → {
//      proveedor, ruc, fecha, subtotal, itbms, total, documento, raw_text, confianza
//    }
// ───────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { query } = require('../db');

const PROVIDER = process.env.OCR_PROVIDER || 'mock';

// ── Interfaz pública del servicio ─────────────────────────────────────
async function procesar(filePath, mimetype) {
  switch (PROVIDER) {
    case 'mindee':   return procesarMindee(filePath, mimetype);
    case 'textract': return procesarTextract(filePath, mimetype);
    case 'vision':   return procesarVision(filePath, mimetype);
    default:         return procesarMock(filePath, mimetype);
  }
}

// Sugerir cuenta contable basándose en proveedor histórico + heurísticas
async function sugerirCuenta(usuario_id, datos) {
  // 1) Histórico: ¿ya facturamos a este proveedor antes?
  if (datos.proveedor) {
    const { rows } = await query(`
      SELECT cuenta_sugerida, cuenta_sugerida_nombre, COUNT(*) AS n
      FROM ocr_recibos
      WHERE usuario_id=$1 AND proveedor_extracted ILIKE $2 AND estado='aprobado'
      GROUP BY cuenta_sugerida, cuenta_sugerida_nombre
      ORDER BY n DESC LIMIT 1
    `, [usuario_id, datos.proveedor]);
    if (rows.length && rows[0].cuenta_sugerida) {
      return {
        codigo: rows[0].cuenta_sugerida,
        nombre: rows[0].cuenta_sugerida_nombre,
        confianza: Math.min(98, 80 + parseInt(rows[0].n) * 3),
      };
    }
  }
  // 2) Heurísticas por keyword en el texto extraído
  const texto = (datos.raw_text || '').toLowerCase();
  const reglas = [
    { kws: ['alquiler', 'renta', 'inmobiliaria'], cta: '5210', nombre: 'Alquileres', conf: 88 },
    { kws: ['gasolina', 'combustible', 'texaco', 'puma', 'delta'], cta: '5240', nombre: 'Transporte', conf: 92 },
    { kws: ['internet', '+móvil', 'cable onda', 'tigo'], cta: '5310', nombre: 'Servicios públicos', conf: 90 },
    { kws: ['papel', 'oficina', 'office depot', 'pricesmart'], cta: '5260', nombre: 'Materiales oficina', conf: 86 },
    { kws: ['honorarios', 'asesoría', 'bufete', 'legal'], cta: '5340', nombre: 'Honorarios legales', conf: 85 },
    { kws: ['hotel', 'restaurante', 'felipe motta', 'riba smith'], cta: '5410', nombre: 'Atenciones a clientes', conf: 78 },
  ];
  for (const r of reglas) {
    if (r.kws.some(k => texto.includes(k) || (datos.proveedor || '').toLowerCase().includes(k))) {
      return { codigo: r.cta, nombre: r.nombre, confianza: r.conf };
    }
  }
  return { codigo: null, nombre: null, confianza: 0 };
}

// ===================================================================
//  MOCK provider
// ===================================================================
async function procesarMock(filePath, mimetype) {
  await new Promise(r => setTimeout(r, 800));    // simular latencia
  const base = path.basename(filePath).toLowerCase();
  // Variaciones para que demos se vean realistas
  const samples = [
    { proveedor: 'Office Depot Panamá', ruc: '8-NT-1-12345', subtotal: 391.06, itbms: 29.44, documento: 'FE-1188' },
    { proveedor: 'Estación Texaco', ruc: '8-NT-1-22310', subtotal: 45.20, itbms: 0, documento: 'TXT-9921' },
    { proveedor: '+Móvil S.A.', ruc: '8-NT-1-08000', subtotal: 135.59, itbms: 10.21, documento: 'FE-99821' },
    { proveedor: 'Riba Smith Multiplaza', ruc: '8-NT-1-11140', subtotal: 87.40, itbms: 0, documento: 'TKT-4451' },
  ];
  const pick = samples[Math.floor(Math.random() * samples.length)];
  return {
    proveedor: pick.proveedor,
    ruc: pick.ruc,
    fecha: new Date().toISOString().slice(0, 10),
    subtotal: pick.subtotal,
    itbms: pick.itbms,
    total: +(pick.subtotal + pick.itbms).toFixed(2),
    documento: pick.documento,
    raw_text: `MOCK · ${pick.proveedor} · RUC ${pick.ruc} · TOTAL ${pick.subtotal + pick.itbms}`,
    confianza: 92 + Math.random() * 6,
  };
}

// ===================================================================
//  Mindee (https://platform.mindee.com)
//  Receipts API es lo más simple y barato (~$0.10/doc).
// ===================================================================
async function procesarMindee(filePath, mimetype) {
  const key = process.env.MINDEE_API_KEY;
  if (!key) throw new Error('Falta MINDEE_API_KEY');
  const fd = new (require('form-data'))();
  fd.append('document', fs.createReadStream(filePath));

  const r = await fetch('https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict', {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, ...fd.getHeaders() },
    body: fd,
  });
  const json = await r.json();
  const pred = json.document?.inference?.prediction || {};
  return {
    proveedor: pred.supplier_name?.value || null,
    ruc:       pred.supplier_company_registrations?.[0]?.value || null,
    fecha:     pred.date?.value || null,
    subtotal:  parseFloat(pred.total_excl?.value || pred.total_net?.value || 0),
    itbms:     parseFloat(pred.total_tax?.value || (pred.taxes?.[0]?.value) || 0),
    total:     parseFloat(pred.total_amount?.value || pred.total_incl?.value || 0),
    documento: pred.receipt_number?.value || null,
    raw_text:  JSON.stringify(pred).slice(0, 4000),
    confianza: Math.round((pred.total_amount?.confidence || 0.5) * 100),
  };
}

// ===================================================================
//  AWS Textract — más caro pero excelente con PDFs multipágina.
//  Requiere @aws-sdk/client-textract instalado.
// ===================================================================
async function procesarTextract(filePath, mimetype) {
  // const { TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');
  // const client = new TextractClient({ region: process.env.AWS_REGION });
  // const Bytes = fs.readFileSync(filePath);
  // const out = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes } }));
  // ... mapear out.ExpenseDocuments[0].SummaryFields a la shape pedida
  throw new Error('Textract: implementación pendiente — descomenta y agrega @aws-sdk/client-textract');
}

// ===================================================================
//  Google Cloud Vision
// ===================================================================
async function procesarVision(filePath, mimetype) {
  throw new Error('Vision: implementación pendiente — agrega @google-cloud/vision');
}

module.exports = { procesar, sugerirCuenta };
