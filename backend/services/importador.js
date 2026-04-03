'use strict';
/**
 * importador.js — Parser de archivos de banco para importación masiva
 *
 * Soporta:
 *   CSV  — Formatos de Banco Nacional, Banistmo, BAC, Banesco (Panamá)
 *   Excel — .xlsx con columnas: fecha, descripcion, monto, tipo
 *   JSON  — Array de transacciones (para integración API)
 *
 * Preparado para PDF (requiere pdfparse externo — stub aquí).
 *
 * Uso:
 *   const { parsearCSV, parsearExcel, normalizar } = require('./importador');
 *   const filas = parsearCSV(buffer, { banco: 'banco_nacional' });
 *   const txns  = filas.map(f => normalizar(f, clienteId, usuarioId));
 */

const MESES = {
  ene:0,feb:1,mar:2,abr:3,may:4,jun:5,
  jul:6,ago:7,sep:8,oct:9,nov:10,dic:11,
  jan:0,apr:3,aug:7,sep2:8,oct2:9,nov2:10,dec:11,
};

// ── Normalizar fecha a YYYY-MM-DD ────────────────────────────────────────────
function parseFecha(s) {
  if (!s) return null;
  s = String(s).trim();

  // DD/MM/YYYY o DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [,d,mo,y] = m;
    const yr = y.length===2 ? '20'+y : y;
    return `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YYYY-MM-DD (ya correcto)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // "15 Mar 2025" o "15-Mar-25"
  m = s.match(/^(\d{1,2})[\s\-]([a-zA-Z]{3})[\s\-](\d{2,4})$/);
  if (m) {
    const [,d,mes,y] = m;
    const mo = MESES[mes.toLowerCase()] + 1;
    const yr = y.length===2 ? '20'+y : y;
    return `${yr}-${String(mo).padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

// ── Parsear monto desde string ────────────────────────────────────────────────
function parseMonto(s) {
  if (typeof s === 'number') return Math.abs(s);
  if (!s) return 0;
  // Remover $, comas, espacios
  const clean = String(s).replace(/[$,\s]/g, '').replace(',', '.');
  return Math.abs(parseFloat(clean) || 0);
}

// ── Detectar tipo (ingreso/gasto) desde columnas separadas o signos ──────────
function detectarTipo(row, colDebito, colCredito, colSigno) {
  if (colDebito && colCredito) {
    const deb = parseMonto(row[colDebito]);
    const cre = parseMonto(row[colCredito]);
    if (cre > 0) return 'ingreso';
    if (deb > 0) return 'gasto';
  }
  if (colSigno) {
    const val = String(row[colSigno] || '');
    if (/cr[eé]dito|ingreso|entrada|dep[oó]sito/i.test(val)) return 'ingreso';
    if (/d[eé]bito|gasto|salida|pago/i.test(val)) return 'gasto';
    if (val.startsWith('-')) return 'gasto';
    if (val.startsWith('+')) return 'ingreso';
  }
  return null; // indeterminado
}

// ── Perfiles de banco (mapeo de columnas) ─────────────────────────────────────
const PERFILES_BANCO = {
  banco_nacional: {
    col_fecha:       'Fecha',
    col_descripcion: 'Descripción',
    col_debito:      'Débito',
    col_credito:     'Crédito',
    col_referencia:  'Referencia',
    col_balance:     'Balance',
    encoding:        'latin1',
    skip_rows:       5,
  },
  banistmo: {
    col_fecha:       'Date',
    col_descripcion: 'Description',
    col_debito:      'Debit',
    col_credito:     'Credit',
    col_referencia:  'Reference',
    encoding:        'utf8',
    skip_rows:       3,
  },
  bac: {
    col_fecha:       'Fecha',
    col_descripcion: 'Concepto',
    col_monto:       'Monto',
    col_tipo:        'Tipo',
    col_referencia:  'No. Referencia',
    encoding:        'utf8',
    skip_rows:       1,
  },
  banesco: {
    col_fecha:       'FECHA',
    col_descripcion: 'DESCRIPCION',
    col_debito:      'DEBITO',
    col_credito:     'CREDITO',
    col_referencia:  'REFERENCIA',
    encoding:        'utf8',
    skip_rows:       2,
  },
  generico: {
    col_fecha:       'fecha',
    col_descripcion: 'descripcion',
    col_monto:       'monto',
    col_tipo:        'tipo',
    col_referencia:  'referencia',
    encoding:        'utf8',
    skip_rows:       0,
  },
};

// ── Parser CSV ────────────────────────────────────────────────────────────────
function parsearCSV(contenido, { banco = 'generico' } = {}) {
  const perfil = PERFILES_BANCO[banco] || PERFILES_BANCO.generico;
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim());

  if (lineas.length < 2) return { filas: [], errores: ['Archivo vacío o sin datos'] };

  // Detectar separador
  const separador = lineas[0].includes(';') ? ';' : ',';

  // Headers en la primera fila válida (después de skip_rows)
  const headerLine = lineas[Math.min(perfil.skip_rows || 0, lineas.length - 1)];
  const headers = headerLine.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));

  const filas = [];
  const errores = [];
  const start = (perfil.skip_rows || 0) + 1;

  for (let i = start; i < lineas.length; i++) {
    const cols = lineas[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.every(c => !c)) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

    const fecha = parseFecha(row[perfil.col_fecha]);
    if (!fecha) { errores.push(`Fila ${i+1}: fecha inválida "${row[perfil.col_fecha]}"`); continue; }

    const desc = row[perfil.col_descripcion] || '';
    if (!desc) { errores.push(`Fila ${i+1}: descripción vacía`); continue; }

    let monto = 0, tipo = null;

    if (perfil.col_debito && perfil.col_credito) {
      const deb = parseMonto(row[perfil.col_debito]);
      const cre = parseMonto(row[perfil.col_credito]);
      monto = cre > 0 ? cre : deb;
      tipo  = cre > 0 ? 'ingreso' : 'gasto';
    } else if (perfil.col_monto) {
      monto = parseMonto(row[perfil.col_monto]);
      tipo  = detectarTipo(row, null, null, perfil.col_tipo) ||
              (monto < 0 ? 'gasto' : 'ingreso');
    }

    if (!monto) { errores.push(`Fila ${i+1}: monto inválido`); continue; }

    filas.push({
      fecha,
      descripcion: desc,
      monto:       +monto.toFixed(2),
      tipo,
      referencia:  row[perfil.col_referencia] || '',
      banco,
      fila_origen: i + 1,
      raw:         row,
    });
  }

  return { filas, errores, total: filas.length };
}

// ── Parser JSON simple (array de objetos) ─────────────────────────────────────
function parsearJSON(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    const arr  = Array.isArray(data) ? data : data.transacciones || data.data || [];
    const filas = arr.map((r, i) => ({
      fecha:       parseFecha(r.fecha || r.date),
      descripcion: r.descripcion || r.description || r.concepto || '',
      monto:       parseMonto(r.monto || r.amount || r.importe),
      tipo:        r.tipo || r.type || null,
      referencia:  r.referencia || r.reference || '',
      banco:       r.banco || 'api',
      fila_origen: i + 1,
    })).filter(r => r.fecha && r.descripcion && r.monto > 0);

    return { filas, errores: [], total: filas.length };
  } catch(e) {
    return { filas: [], errores: ['JSON inválido: ' + e.message], total: 0 };
  }
}

// ── Normalizar fila → objeto transacción listo para DB ───────────────────────
function normalizarFila(fila, { usuarioId, clienteId, periodoDefault } = {}) {
  const periodo = fila.fecha ? fila.fecha.slice(0, 7) : periodoDefault;
  return {
    usuario_id:     usuarioId,
    cliente_id:     clienteId || null,
    fecha:          fila.fecha,
    descripcion:    fila.descripcion.trim(),
    tipo:           fila.tipo || 'gasto',
    monto:          fila.monto,
    itbms:          0,   // se calculará si el clasificador lo indica
    deducible:      false,
    banco:          fila.banco || '',
    referencia:     fila.referencia || '',
    periodo,
    fuente_origen:  fila.banco === 'api' ? 'api' : 'csv',
    datos_origen:   JSON.stringify({ banco: fila.banco, fila: fila.fila_origen }),
    tiene_factura:  false,
    asiento_generado: false,
  };
}

// ── Detectar duplicados ───────────────────────────────────────────────────────
function detectarDuplicados(filas, txnsExistentes) {
  const existMap = new Set(
    txnsExistentes.map(t => `${t.fecha}|${t.monto}|${t.banco}`)
  );
  return filas.map(f => ({
    ...f,
    duplicado: existMap.has(`${f.fecha}|${f.monto}|${f.banco}`),
  }));
}

// ── Stub para PDF (requiere integración con pdf-parse en producción) ──────────
function parsearPDF(buffer, banco = 'generico') {
  return {
    filas:   [],
    errores: ['La importación de PDF requiere instalación de pdf-parse. Use CSV por ahora.'],
    total:   0,
    nota:    'Integración PDF pendiente. Exporte el extracto bancario como CSV.',
  };
}

// ── Detectar banco por nombre de archivo ──────────────────────────────────────
function detectarBanco(nombreArchivo) {
  const n = (nombreArchivo || '').toLowerCase();
  if (/banco.nacional|bncr/.test(n))     return 'banco_nacional';
  if (/banistmo/.test(n))                return 'banistmo';
  if (/\bbac\b/.test(n))                 return 'bac';
  if (/banesco/.test(n))                 return 'banesco';
  return 'generico';
}

module.exports = {
  parsearCSV,
  parsearJSON,
  parsearPDF,
  normalizarFila,
  detectarDuplicados,
  detectarBanco,
  PERFILES_BANCO,
};
