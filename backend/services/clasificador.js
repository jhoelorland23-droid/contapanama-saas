'use strict';
/**
 * clasificador.js v3 — Motor de clasificación inteligente
 *
 * Prioridad de reglas:
 *   1. Reglas aprendidas del usuario (fuente=auto, alta prioridad)
 *   2. Reglas manuales del usuario
 *   3. Reglas globales (seed Panamá)
 *   4. Fallback semántico por palabras clave
 *
 * Categorías soportadas:
 *   alimentos | transporte | servicios_pub | personal | financiero
 *   oficina | ing_operativo | ing_otros | proveedores | publicidad | otro
 */

const { query } = require('../db');

// ── Cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();
const TTL    = 5 * 60 * 1000; // 5 min

async function _getReglas(uid) {
  const key = `reglas:${uid}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const { rows } = await query(`
    SELECT id, usuario_id, patron, tipo, cuenta_codigo, deducible,
           etiqueta, confianza, nombre, prioridad
    FROM reglas_clasificacion
    WHERE activo = true AND (usuario_id = $1 OR usuario_id IS NULL)
    ORDER BY
      CASE WHEN usuario_id = $1 THEN 0 ELSE 1 END,
      prioridad ASC
  `, [uid]);

  _cache.set(key, { data: rows, ts: Date.now() });
  return rows;
}

async function _getCategorias(uid) {
  const key = `cats:${uid}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const { rows } = await query(`
    SELECT slug, nombre, cuentas FROM categorias_contables
    WHERE activo = true AND (usuario_id = $1 OR usuario_id IS NULL)
  `, [uid]);

  const map = {};
  for (const r of rows) {
    for (const c of (r.cuentas || [])) map[c] = r.slug;
  }
  _cache.set(key, { data: map, ts: Date.now() });
  return map;
}

function invalidarCache(uid) {
  if (uid) {
    _cache.delete(`reglas:${uid}`);
    _cache.delete(`cats:${uid}`);
  } else {
    _cache.clear();
  }
}

// ── Core match ───────────────────────────────────────────────────────────────
function _match(texto, tipo, reglas, categoriasMap) {
  for (const r of reglas) {
    let re;
    try { re = new RegExp(r.patron, 'i'); } catch { continue; }
    if (!re.test(texto)) continue;

    const cuenta = r.cuenta_codigo;
    return {
      tipo:         tipo || r.tipo,
      cuenta,
      deducible:    r.deducible,
      etiqueta:     r.etiqueta,
      categoria:    categoriasMap[cuenta] || _inferCategoria(cuenta),
      confianza:    r.confianza,
      regla_id:     r.id,
      regla_nombre: r.nombre,
      fuente:       r.usuario_id ? 'usuario' : 'global',
    };
  }

  // Fallback semántico
  const isIng = tipo === 'ingreso' ||
    (!tipo && /recib|cobr|ingres|deposit|abono|yappy.*recib/i.test(texto));

  const cuenta = isIng ? '4901' : '6901';
  return {
    tipo:         tipo || (isIng ? 'ingreso' : 'gasto'),
    cuenta,
    deducible:    false,
    etiqueta:     isIng ? 'Otros Ingresos' : 'Otros Gastos',
    categoria:    isIng ? 'ing_otros' : 'otro',
    confianza:    'baja',
    regla_id:     null,
    regla_nombre: null,
    fuente:       'fallback',
  };
}

function _inferCategoria(cta) {
  const n = parseInt(cta);
  if (n >= 4100 && n <= 4199) return 'ing_operativo';
  if (n >= 4200 || n === 4901) return 'ing_otros';
  if (n === 6101 || n === 6102) return 'personal';
  if (n === 6201) return 'servicios_pub';
  if (n === 6202 || n === 6203) return 'servicios_pub';
  if (n === 6204 || n === 6205 || n === 6209) return 'oficina';
  if (n === 6206) return 'transporte';
  if (n === 6207) return 'alimentos';
  if (n === 6208) return 'proveedores';
  if (n === 6301) return 'publicidad';
  if (n >= 6400) return 'financiero';
  return 'otro';
}

// ── Public API ───────────────────────────────────────────────────────────────

async function clasificar(descripcion, tipo, uid) {
  const [reglas, cats] = await Promise.all([_getReglas(uid), _getCategorias(uid)]);
  return _match((descripcion || '').trim(), tipo || null, reglas, cats);
}

async function clasificarBatch(txns, uid) {
  const [reglas, cats] = await Promise.all([_getReglas(uid), _getCategorias(uid)]);
  return txns.map(tx => ({
    id:            tx.id,
    descripcion:   tx.descripcion,
    clasificacion: _match((tx.descripcion || '').trim(), tx.tipo || null, reglas, cats),
  }));
}

/**
 * Registra una corrección del usuario → alimenta aprendizaje automático.
 * Si hay 3+ correcciones del mismo patrón, el trigger de DB crea una regla.
 */
async function registrarCorreccion(uid, txId, correccion) {
  const {
    cuenta_correcta, tipo_correcto, etiqueta_correcta,
    deducible_correcto = false, categoria_correcta,
    cuenta_original, tipo_original, etiqueta_original,
  } = correccion;

  // Obtener descripción original
  const { rows } = await query(
    'SELECT descripcion, cliente_id FROM transacciones WHERE id=$1 AND usuario_id=$2',
    [txId, uid]);
  if (!rows.length) throw new Error('Transacción no encontrada');

  const { descripcion, cliente_id } = rows[0];

  // Guardar corrección (trigger verifica si genera regla automática)
  const { rows: cor } = await query(`
    INSERT INTO correcciones_clasificacion
      (usuario_id, cliente_id, transaccion_id, descripcion_orig,
       cuenta_original, tipo_original, etiqueta_original,
       cuenta_correcta, tipo_correcto, etiqueta_correcta,
       deducible_correcto, categoria_correcta)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id, regla_generada_id
  `, [uid, cliente_id, txId, descripcion,
      cuenta_original, tipo_original, etiqueta_original,
      cuenta_correcta, tipo_correcto, etiqueta_correcta,
      deducible_correcto, categoria_correcta]);

  // Actualizar la transacción con los valores corregidos
  await query(`
    UPDATE transacciones
    SET cuenta_contable   = $1,
        etiqueta_auto     = $2,
        confianza_clasif  = 'alta',
        deducible         = $3,
        categoria         = $4,
        corregido_por     = $5,
        corregido_en      = NOW()
    WHERE id = $6
  `, [cuenta_correcta, etiqueta_correcta, deducible_correcto,
      categoria_correcta, uid, txId]);

  // Si el trigger generó una regla, invalida cache
  if (cor[0]?.regla_generada_id) invalidarCache(uid);

  return {
    correccion_id:    cor[0].id,
    regla_generada:   !!cor[0].regla_generada_id,
    regla_id:         cor[0].regla_generada_id,
  };
}

module.exports = { clasificar, clasificarBatch, registrarCorreccion, invalidarCache };
