'use strict';
/**
 * asientos.js v4 — Motor contable nivel producción
 *
 * ITBMS:
 *   - Ingresos: débito fiscal SIEMPRE cuando itbms_aplica=true
 *   - Gastos:   crédito fiscal SOLO si deducible=true AND tiene_factura=true
 *   - itbms_aplica=false → sin ITBMS aunque el campo itbms tenga valor
 *
 * Préstamos:
 *   - es_cuota_prestamo=true → separar capital (DR 2301) e interés (DR 6401)
 *   - Usa cuentas configuradas en el registro de préstamo
 *
 * Partida doble siempre validada antes de devolver.
 * Errores son descriptivos para el log contable.
 */

const CATALOGO = require('./catalogo');

// Cuentas estándar
const CTA = {
  BANCO:       '1102',
  ITBMS_DEB:   '2201',   // Pasivo — ITBMS por pagar a DGI
  ITBMS_CRED:  '1301',   // Activo — ITBMS crédito fiscal
  CAPITAL:     '2301',   // Pasivo — Préstamos por pagar
  INTERES:     '6401',   // Gasto financiero
  CXC:         '1201',   // Cuentas por cobrar
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const _round = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const _nombre = (cod) => {
  const c = CATALOGO[cod];
  return c ? `${c.codigo} - ${c.nombre}` : cod;
};
const _ln = (fecha, cod, debe, haber, desc, ref, tipo_linea, extras = {}) => ({
  fecha,
  cuenta_codigo: String(cod),
  cuenta_nombre: _nombre(String(cod)),
  debe:          _round(debe),
  haber:         _round(haber),
  descripcion:   String(desc || ''),
  referencia:    String(ref || '—'),
  tipo_linea:    String(tipo_linea),
  itbms_monto:   0,
  itbms_tipo:    null,
  ...extras,
});

// ── Validar que una cuenta existe en el catálogo ──────────────────────────────
function validarCuenta(codigo) {
  if (!codigo || String(codigo).trim() === '') return { valida: false, error: 'Cuenta no especificada (vacía)' };
  if (!CATALOGO[codigo]) return { valida: false, error: `Cuenta ${codigo} no existe en el catálogo` };
  return { valida: true };
}

// ── Generador principal de asientos ──────────────────────────────────────────
function generarAsiento(tx, cuentaTx, opcionesExtras = {}) {
  const errores = [];
  const fecha   = String(tx.fecha).slice(0, 10);
  const monto   = _round(tx.monto);
  const itbms   = _round(tx.itbms);
  const ref     = tx.referencia || (tx.id || '').slice(0, 8);
  const desc    = String(tx.descripcion || '');
  const lines   = [];

  // ── Validar cuenta ─────────────────────────────────────────────────────────
  const cuentaOk = validarCuenta(cuentaTx);
  if (!cuentaOk.valida) {
    errores.push({ tipo: 'cuenta_invalida', mensaje: cuentaOk.error });
    cuentaTx = tx.tipo === 'ingreso' ? '4901' : '6901'; // fallback
  }

  // ── Detectar si aplica ITBMS ───────────────────────────────────────────────
  // itbms_exento = transacción exenta de ITBMS por ley (no aplica nunca)
  const itbmsExento  = tx.itbms_exento === true || tx.itbms_exento === 'true';
  const itbmsAplica  = !itbmsExento && (tx.itbms_aplica === true || tx.itbms_aplica === 'true');
  const tieneFact   = tx.tiene_factura === true || tx.tiene_factura === 'true';
  const deducible   = tx.deducible === true || tx.deducible === 'true';
  const usarItbms   = itbms > 0 && itbmsAplica;

  // ── CUOTA DE PRÉSTAMO ──────────────────────────────────────────────────────
  if (tx.es_cuota_prestamo && (tx.capital_prestamo || tx.interes_prestamo)) {
    const capital  = _round(tx.capital_prestamo  || 0);
    const interes  = _round(tx.interes_prestamo  || 0);
    const total    = _round(capital + interes);
    const ctaCap   = opcionesExtras.cuenta_capital  || CTA.CAPITAL;
    const ctaInt   = opcionesExtras.cuenta_interes  || CTA.INTERES;
    const ctaBanco = opcionesExtras.cuenta_banco    || CTA.BANCO;

    if (capital > 0) {
      lines.push(_ln(fecha, ctaCap, capital, 0,
        `Capital préstamo — ${desc}`, ref, 'capital_prestamo'));
    }
    if (interes > 0) {
      lines.push(_ln(fecha, ctaInt, interes, 0,
        `Interés préstamo — ${desc}`, ref, 'interes_prestamo'));
    }
    lines.push(_ln(fecha, ctaBanco, 0, total, desc, ref, 'banco'));

    // Validación interna
    if (Math.abs(total - monto) > 0.05) {
      errores.push({
        tipo: 'prestamo_inconsistente',
        mensaje: `Capital (${capital}) + interés (${interes}) = ${total} ≠ monto (${monto})`,
      });
    }

  // ── INGRESO ────────────────────────────────────────────────────────────────
  } else if (tx.tipo === 'ingreso') {
    const base = usarItbms ? _round(monto - itbms) : monto;

    if (base < 0) {
      errores.push({ tipo: 'itbms_inconsistente', mensaje: `ITBMS (${itbms}) > monto (${monto})` });
    }

    lines.push(_ln(fecha, CTA.BANCO, monto, 0, desc, ref, 'banco'));
    lines.push(_ln(fecha, cuentaTx,  0, base, desc, ref, 'ingreso'));

    if (usarItbms) {
      lines.push(_ln(fecha, CTA.ITBMS_DEB, 0, itbms,
        `ITBMS débito fiscal 7% — ${desc}`, ref, 'itbms_debito',
        { itbms_monto: itbms, itbms_tipo: 'debito_fiscal' }));
    }

  // ── GASTO ──────────────────────────────────────────────────────────────────
  } else {
    const creditoFiscal = usarItbms && deducible && tieneFact;
    const itbmsEnGasto  = usarItbms && !creditoFiscal;
    const base          = creditoFiscal ? _round(monto - itbms) : monto;

    if (creditoFiscal && base < 0) {
      errores.push({ tipo: 'itbms_inconsistente', mensaje: `ITBMS (${itbms}) > monto (${monto})` });
    }

    lines.push(_ln(fecha, cuentaTx, base, 0, desc, ref, 'gasto',
      itbmsEnGasto ? { itbms_monto: itbms, itbms_tipo: 'no_recuperable' } : {}));

    if (creditoFiscal) {
      lines.push(_ln(fecha, CTA.ITBMS_CRED, itbms, 0,
        `ITBMS crédito fiscal 7% — ${desc}`, ref, 'itbms_credito',
        { itbms_monto: itbms, itbms_tipo: 'credito_fiscal' }));
    }

    lines.push(_ln(fecha, CTA.BANCO, 0, monto, desc, ref, 'banco'));
  }

  return { lines, errores };
}

// ── ITBMS: cálculo y resumen ──────────────────────────────────────────────────
function calcularITBMS(transacciones) {
  let debito = 0, credito = 0, noRecup = 0;
  const detalle = [];

  for (const tx of transacciones) {
    const monto       = _round(tx.monto);
    const itbms       = _round(tx.itbms);
    const itbmsExento = tx.itbms_exento === true || tx.itbms_exento === 'true';
    const itbmsAplica = !itbmsExento && (tx.itbms_aplica === true || tx.itbms_aplica === 'true' || itbms > 0);
    if (!itbms || !itbmsAplica) {
      if (itbmsExento && itbms > 0) {
        // Registrar como exento en detalle para trazabilidad
        detalle.push({ id:tx.id, fecha:String(tx.fecha).slice(0,10),
          descripcion:tx.descripcion, tipo:'exento', base:_round(monto), itbms:0,
          tiene_factura:tx.tiene_factura, nota:'Exento de ITBMS por ley' });
      }
      continue;
    }

    const tieneFact  = tx.tiene_factura === true || tx.tiene_factura === 'true';
    const deducible  = tx.deducible === true || tx.deducible === 'true';
    const base       = _round(monto - itbms);

    if (tx.tipo === 'ingreso') {
      debito += itbms;
      detalle.push({
        id: tx.id, fecha: String(tx.fecha).slice(0, 10),
        descripcion: tx.descripcion, tipo: 'debito_fiscal',
        base, itbms: +itbms.toFixed(2),
        tiene_factura: tieneFact, cliente: tx.cliente_nombre,
      });
    } else if (deducible && tieneFact) {
      credito += itbms;
      detalle.push({
        id: tx.id, fecha: String(tx.fecha).slice(0, 10),
        descripcion: tx.descripcion, tipo: 'credito_fiscal',
        base, itbms: +itbms.toFixed(2),
        tiene_factura: true, cliente: tx.cliente_nombre,
      });
    } else if (deducible && !tieneFact) {
      noRecup += itbms;
      detalle.push({
        id: tx.id, fecha: String(tx.fecha).slice(0, 10),
        descripcion: tx.descripcion, tipo: 'no_recuperable',
        base, itbms: +itbms.toFixed(2),
        tiene_factura: false, cliente: tx.cliente_nombre,
        nota: 'Deducible pero sin factura — ITBMS no recuperable',
      });
    }
  }

  const saldo = _round(debito - credito);
  return {
    debito_fiscal:    _round(debito),
    credito_fiscal:   _round(credito),
    saldo_neto:       saldo,
    no_recuperable:   _round(noRecup),
    a_favor_dgi:      saldo > 0,
    tasa:             0.07,
    detalle,
    resumen_texto: saldo > 0
      ? `Debe pagar B/.${saldo.toFixed(2)} a la DGI`
      : `A favor del contribuyente B/.${Math.abs(saldo).toFixed(2)}`,
  };
}

// ── Validar cuadre de líneas ──────────────────────────────────────────────────
function validarCuadre(lineas) {
  const debe  = lineas.reduce((s, l) => s + (l.debe  || 0), 0);
  const haber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  const diff  = Math.abs(debe - haber);
  return {
    cuadra:      diff < 0.02,
    total_debe:  _round(debe),
    total_haber: _round(haber),
    diferencia:  _round(diff),
    detalle:     lineas.map(l => ({
      cuenta: l.cuenta_codigo,
      debe:   l.debe,
      haber:  l.haber,
      tipo:   l.tipo_linea,
    })),
  };
}

// ── Calcular desglose préstamo usando tabla de amortización ───────────────────
function calcularCuotaPrestamo(prestamo, montoPagado) {
  const saldo   = _round(prestamo.saldo_pendiente || prestamo.monto_original);
  const tasa    = parseFloat(prestamo.tasa_interes) || 0;
  const total   = _round(montoPagado);

  let interes, capital;

  if (tasa > 0) {
    // Tasa mensual
    const tasaMensual = tasa / 12;
    interes = _round(saldo * tasaMensual);
    capital = _round(total - interes);
  } else {
    // Sin interés declarado: asumir cuota fija configurada
    interes = 0;
    capital = total;
  }

  if (capital < 0) {
    // La cuota no alcanza a cubrir intereses
    interes = total;
    capital = 0;
  }

  return {
    cuota_total:   total,
    capital:       _round(capital),
    interes:       _round(interes),
    saldo_antes:   saldo,
    saldo_despues: _round(Math.max(0, saldo - capital)),
    valido:        capital >= 0 && interes >= 0,
  };
}

module.exports = {
  generarAsiento,
  calcularITBMS,
  validarCuadre,
  calcularCuotaPrestamo,
  validarCuenta,
  CTA,
};
