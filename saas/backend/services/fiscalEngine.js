const money = value => Math.round((Number(value) || 0) * 100) / 100;

const normalizeTipoPersona = tipo => {
  const value = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (value === 'juridica') return 'juridica';
  if (value === 'natural') return 'natural';
  return 'general';
};

const calcularISR = (rentaNeta, tipoPersona) => {
  const rn = Math.max(0, Number(rentaNeta) || 0);
  const tipo = normalizeTipoPersona(tipoPersona);

  if (tipo === 'juridica') {
    return { impuesto: money(rn * 0.25), tasa: 0.25, metodo: 'persona juridica 25%' };
  }

  if (rn <= 11000) return { impuesto: 0, tasa: 0, metodo: 'persona natural exenta' };
  if (rn <= 50000) {
    return { impuesto: money((rn - 11000) * 0.15), tasa: 0.15, metodo: 'persona natural tramo 15%' };
  }

  return {
    impuesto: money(5850 + (rn - 50000) * 0.25),
    tasa: 0.25,
    metodo: 'persona natural tramo 25%',
  };
};

const vencimientoRenta = (anioFiscal, tipoPersona, cierreFiscalMes = 12) => {
  const anio = Number(anioFiscal);
  const cierre = Number(cierreFiscalMes) || 12;
  const tipo = normalizeTipoPersona(tipoPersona);

  if (cierre !== 12) {
    const cierreFecha = new Date(Date.UTC(anio, cierre, 0));
    const vencimiento = new Date(Date.UTC(cierreFecha.getUTCFullYear(), cierreFecha.getUTCMonth() + 3, cierreFecha.getUTCDate()));
    return vencimiento.toISOString().slice(0, 10);
  }

  if (tipo === 'natural') return `${anio + 1}-03-15`;
  return `${anio + 1}-03-31`;
};

const vencimientoITBMS = periodo => {
  if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) return null;
  const [yr, mo] = periodo.split('-').map(Number);
  return new Date(Date.UTC(yr, mo, 15)).toISOString().slice(0, 10);
};

const fiscalClientName = cliente => cliente?.nombre || cliente?.cliente_nombre || 'Toda la cartera';

const generarObligacionesFiscales = ({ anio, cliente = null } = {}) => {
  const year = Number(anio) || new Date().getFullYear();
  const tipo = normalizeTipoPersona(cliente?.tipo);
  const regimen = String(cliente?.regimen_fiscal || 'general');
  const contribuyenteItbms = cliente ? cliente.contribuyente_itbms !== false : true;
  const cliente_id = cliente?.id || null;
  const cliente_nombre = fiscalClientName(cliente);
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const obligaciones = [];

  if (contribuyenteItbms && !['no_contribuyente_itbms', 'exento'].includes(regimen)) {
    for (let m = 1; m <= 12; m++) {
      const periodo = `${year}-${String(m).padStart(2, '0')}`;
      obligaciones.push({
        tipo: 'ITBMS',
        entidad: 'DGI',
        formulario: '430',
        descripcion: `Declaracion ITBMS - ${meses[m - 1]} ${year}`,
        periodicidad: 'mensual',
        periodo,
        fecha_vencimiento: vencimientoITBMS(periodo),
        urgencia: 'alta',
        cliente_id,
        cliente_nombre,
      });
    }
  }

  const tipoRenta = tipo === 'natural' ? 'natural' : 'juridica';
  obligaciones.push({
    tipo: 'RENTA',
    entidad: 'DGI',
    formulario: '101',
    descripcion: tipoRenta === 'natural'
      ? `Declaracion Renta Natural - ${year - 1}`
      : `Declaracion Renta Juridica - ${year - 1}`,
    periodicidad: 'anual',
    periodo: `${year - 1}`,
    fecha_vencimiento: vencimientoRenta(year - 1, tipoRenta, cliente?.cierre_fiscal_mes || 12),
    urgencia: 'critica',
    cliente_id,
    cliente_nombre,
  });

  return obligaciones;
};

module.exports = {
  calcularISR,
  vencimientoRenta,
  vencimientoITBMS,
  generarObligacionesFiscales,
  normalizeTipoPersona,
};
