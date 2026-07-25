// ───────────────────────────────────────────────────────────────────
//  Service PAC — Proveedor Autorizado de Certificación (DGI Panamá)
// ───────────────────────────────────────────────────────────────────
//  En Panamá, las FE no se transmiten directo a DGI: pasan por un PAC
//  autorizado (FacturaPanamá, IntegrationPAC, Inforfin, etc.). El PAC
//  firma con su certificado, valida con DGI y devuelve el CUFE.
//
//  Modo MOCK (default): genera CUFE realista para demos sin integración.
//
//  Para producción, configurar PAC_PROVIDER + credenciales:
//    PAC_PROVIDER=facturapanama
//    PAC_API_URL=https://api.facturapanama.com.pa
//    PAC_API_KEY=...
//    PAC_RUC_EMISOR=...
//
//  Interfaz:
//    transmitir({ factura, lineas }) → { cufe, qr_data, xml_url, pdf_url, estado_dgi }
//    anular({ cufe, motivo })        → { estado_dgi, fecha_anulacion }
// ───────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const PROVIDER = process.env.PAC_PROVIDER || 'mock';

async function transmitir(args) {
  switch (PROVIDER) {
    case 'facturapanama': return transmitirFacturaPanama(args);
    case 'integrationpac': return transmitirIntegrationPAC(args);
    default:               return transmitirMock(args);
  }
}

async function anular(args) {
  switch (PROVIDER) {
    case 'facturapanama': return anularFacturaPanama(args);
    case 'integrationpac': return anularIntegrationPAC(args);
    default:               return anularMock(args);
  }
}

// ===================================================================
//  MOCK — genera CUFE creíble y devuelve URLs falsas.
// ===================================================================
async function transmitirMock({ factura, lineas }) {
  await new Promise(r => setTimeout(r, 1800));
  // CUFE realista: tipo(2) + ruc_emisor + año + número + dígito
  const ruc = (factura.receptor_ruc || '0').replace(/\D/g, '').padStart(11, '0').slice(0, 11);
  const fecha = new Date(factura.fecha_emision).toISOString().slice(0, 10).replace(/-/g, '');
  const numero = (factura.numero || crypto.randomBytes(4).toString('hex')).replace(/\D/g, '').padStart(8, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const cufe = `FE01${ruc}-${fecha}-${numero}-${random}`;
  return {
    cufe,
    qr_data: `https://dgi-fep.mef.gob.pa/Consultas/FacturasPorCUFE?CUFE=${cufe}`,
    xml_url: `/uploads/fe/${factura.id}/firmada.xml`,
    pdf_url: `/uploads/fe/${factura.id}/factura.pdf`,
    estado_dgi: 'AUTORIZADO',
  };
}

async function anularMock({ cufe, motivo }) {
  await new Promise(r => setTimeout(r, 800));
  return { estado_dgi: 'ANULADO', fecha_anulacion: new Date().toISOString(), motivo };
}

// ===================================================================
//  FacturaPanamá (proveedor común en el mercado panameño)
//  Docs: https://facturapanama.com.pa/documentacion
// ===================================================================
async function transmitirFacturaPanama({ factura, lineas }) {
  const url = process.env.PAC_API_URL;
  const key = process.env.PAC_API_KEY;
  if (!url || !key) throw new Error('Faltan PAC_API_URL / PAC_API_KEY');

  const payload = buildSFEPPayload(factura, lineas);

  const r = await fetch(`${url}/v1/facturas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || json.message || 'PAC rechazó la transmisión');

  return {
    cufe: json.cufe,
    qr_data: json.qr_url,
    xml_url: json.xml_url,
    pdf_url: json.pdf_url,
    estado_dgi: json.estado || 'AUTORIZADO',
  };
}

async function anularFacturaPanama({ cufe, motivo }) {
  const url = process.env.PAC_API_URL;
  const key = process.env.PAC_API_KEY;
  const r = await fetch(`${url}/v1/facturas/${cufe}/anular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ motivo }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'PAC rechazó la anulación');
  return { estado_dgi: json.estado || 'ANULADO', fecha_anulacion: json.fecha_anulacion, motivo };
}

async function transmitirIntegrationPAC(args) {
  throw new Error('IntegrationPAC: implementación pendiente');
}
async function anularIntegrationPAC(args) {
  throw new Error('IntegrationPAC: implementación pendiente');
}

// ===================================================================
//  Helpers
// ===================================================================
function buildSFEPPayload(factura, lineas) {
  // Estructura aproximada SFEP — adaptar según specs de tu PAC.
  return {
    documento: {
      tipo: factura.tipo_doc || '01',
      numero: factura.numero,
      fecha_emision: factura.fecha_emision,
      moneda: factura.moneda || 'USD',
      condicion_pago: factura.condicion_pago,
    },
    emisor: {
      ruc: process.env.PAC_RUC_EMISOR,
    },
    receptor: {
      tipo: factura.receptor_tipo,
      ruc: factura.receptor_ruc,
      dv: factura.receptor_dv,
      nombre: factura.receptor_nombre,
      email: factura.receptor_email,
    },
    items: lineas.map((l, i) => ({
      orden: i + 1,
      descripcion: l.descripcion,
      cantidad: parseFloat(l.cantidad),
      precio_unitario: parseFloat(l.precio_unitario),
      descuento: parseFloat(l.descuento || 0),
      itbms_tasa: parseFloat(l.itbms_tasa || 0.07),
    })),
    totales: {
      subtotal: parseFloat(factura.subtotal),
      descuento: parseFloat(factura.descuento || 0),
      itbms: parseFloat(factura.itbms),
      total: parseFloat(factura.total),
    },
  };
}

module.exports = { transmitir, anular };
