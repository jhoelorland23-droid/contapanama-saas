/**
 * catalogo.js — Catálogo de cuentas contables para Panamá
 * Basado en el Plan General de Contabilidad (NIIF / IFRS simplificado para PYMES)
 *
 * Estructura: { código, nombre, tipo, naturaleza, categoria }
 *   tipo        : ACTIVO | PASIVO | PATRIMONIO | INGRESO | GASTO | COSTO
 *   naturaleza  : DEUDORA | ACREEDORA
 *   categoria   : para agrupación en reportes
 */

const CUENTAS = {
  // ── ACTIVOS ────────────────────────────────────────────────────────────────
  "1101": { codigo:"1101", nombre:"Caja General",                        tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1102": { codigo:"1102", nombre:"Bancos - Cuenta Corriente",           tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1103": { codigo:"1103", nombre:"Bancos - Cuenta de Ahorros",          tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1201": { codigo:"1201", nombre:"Cuentas por Cobrar - Clientes",       tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1301": { codigo:"1301", nombre:"ITBMS Crédito Fiscal",                tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1401": { codigo:"1401", nombre:"Inventario de Mercancías",            tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo Corriente" },
  "1501": { codigo:"1501", nombre:"Equipos y Maquinaria",                tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo No Corriente" },
  "1502": { codigo:"1502", nombre:"Mobiliario y Equipo de Oficina",      tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Activo No Corriente" },

  // ── PASIVOS ────────────────────────────────────────────────────────────────
  "2101": { codigo:"2101", nombre:"Cuentas por Pagar - Proveedores",     tipo:"PASIVO",    naturaleza:"ACREEDORA", categoria:"Pasivo Corriente" },
  "2201": { codigo:"2201", nombre:"ITBMS por Pagar (Débito Fiscal)",     tipo:"PASIVO",    naturaleza:"ACREEDORA", categoria:"Pasivo Corriente" },
  "2202": { codigo:"2202", nombre:"ISR por Pagar",                       tipo:"PASIVO",    naturaleza:"ACREEDORA", categoria:"Pasivo Corriente" },
  "2203": { codigo:"2203", nombre:"CSS por Pagar",                       tipo:"PASIVO",    naturaleza:"ACREEDORA", categoria:"Pasivo Corriente" },
  "2301": { codigo:"2301", nombre:"Préstamos Bancarios a Corto Plazo",   tipo:"PASIVO",    naturaleza:"ACREEDORA", categoria:"Pasivo No Corriente" },

  // ── PATRIMONIO ─────────────────────────────────────────────────────────────
  "3101": { codigo:"3101", nombre:"Capital Social",                      tipo:"PATRIMONIO", naturaleza:"ACREEDORA", categoria:"Patrimonio" },
  "3201": { codigo:"3201", nombre:"Utilidades Retenidas",                tipo:"PATRIMONIO", naturaleza:"ACREEDORA", categoria:"Patrimonio" },

  // ── INGRESOS ───────────────────────────────────────────────────────────────
  "4101": { codigo:"4101", nombre:"Ingresos por Servicios Profesionales",tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos Operacionales" },
  "4102": { codigo:"4102", nombre:"Ingresos por Ventas",                 tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos Operacionales" },
  "4103": { codigo:"4103", nombre:"Honorarios Recibidos",                tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos Operacionales" },
  "4104": { codigo:"4104", nombre:"Ingresos por Consultoría",            tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos Operacionales" },
  "4105": { codigo:"4105", nombre:"Ingresos por Contabilidad",           tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos Operacionales" },
  "4201": { codigo:"4201", nombre:"Ingresos Financieros",                tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos No Operacionales" },
  "4901": { codigo:"4901", nombre:"Otros Ingresos",                      tipo:"INGRESO",   naturaleza:"ACREEDORA", categoria:"Ingresos No Operacionales" },

  // ── COSTOS ─────────────────────────────────────────────────────────────────
  "5101": { codigo:"5101", nombre:"Costo de Ventas",                     tipo:"COSTO",     naturaleza:"DEUDORA",   categoria:"Costos" },
  "5102": { codigo:"5102", nombre:"Costo de Servicios Prestados",        tipo:"COSTO",     naturaleza:"DEUDORA",   categoria:"Costos" },

  // ── GASTOS OPERATIVOS ──────────────────────────────────────────────────────
  "6101": { codigo:"6101", nombre:"Sueldos y Salarios",                  tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos de Personal" },
  "6102": { codigo:"6102", nombre:"Cuotas Patronales CSS",               tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos de Personal" },
  "6201": { codigo:"6201", nombre:"Alquiler de Oficina",                 tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6202": { codigo:"6202", nombre:"Servicios de Telefonía e Internet",   tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6203": { codigo:"6203", nombre:"Electricidad y Agua",                 tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6204": { codigo:"6204", nombre:"Papelería y Útiles de Oficina",       tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6205": { codigo:"6205", nombre:"Mantenimiento y Reparaciones",        tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6206": { codigo:"6206", nombre:"Transporte y Viáticos",               tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6207": { codigo:"6207", nombre:"Gastos de Alimentación",              tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6208": { codigo:"6208", nombre:"Compras a Proveedores",               tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6209": { codigo:"6209", nombre:"Servicios Profesionales Contratados", tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Generales" },
  "6301": { codigo:"6301", nombre:"Publicidad y Mercadeo",               tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos de Ventas" },
  "6401": { codigo:"6401", nombre:"Gastos Financieros e Intereses",      tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Financieros" },
  "6402": { codigo:"6402", nombre:"Comisiones Bancarias",                tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Gastos Financieros" },
  "6901": { codigo:"6901", nombre:"Otros Gastos Generales",              tipo:"GASTO",     naturaleza:"DEUDORA",   categoria:"Otros Gastos" },

  // ── CUENTA PUENTE (para asientos con diferencia) ───────────────────────────
  "9999": { codigo:"9999", nombre:"Cuenta Transitoria / Puente",         tipo:"ACTIVO",    naturaleza:"DEUDORA",   categoria:"Control" },
};

module.exports = CUENTAS;
