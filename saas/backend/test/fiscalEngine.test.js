const assert = require('assert');
const { calcularISR, vencimientoRenta, vencimientoITBMS, normalizeTipoPersona, generarObligacionesFiscales } = require('../services/fiscalEngine');

assert.strictEqual(normalizeTipoPersona('jurídica'), 'juridica');
assert.strictEqual(normalizeTipoPersona('juridica'), 'juridica');
assert.strictEqual(normalizeTipoPersona('natural'), 'natural');

assert.deepStrictEqual(calcularISR(11000, 'natural'), {
  impuesto: 0,
  tasa: 0,
  metodo: 'persona natural exenta',
});

assert.strictEqual(calcularISR(50000, 'natural').impuesto, 5850);
assert.strictEqual(calcularISR(75000, 'natural').impuesto, 12100);
assert.strictEqual(calcularISR(100000, 'natural').impuesto, 18350);
assert.strictEqual(calcularISR(100000, 'jurídica').impuesto, 25000);

assert.strictEqual(vencimientoRenta(2025, 'natural'), '2026-03-15');
assert.strictEqual(vencimientoRenta(2025, 'jurídica'), '2026-03-31');
assert.strictEqual(vencimientoITBMS('2026-01'), '2026-02-15');

const juridica = generarObligacionesFiscales({
  anio: 2026,
  cliente: { id: 'cliente-j', nombre: 'Cliente Juridico', tipo: 'juridica', contribuyente_itbms: true, regimen_fiscal: 'general', cierre_fiscal_mes: 12 },
});
assert.strictEqual(juridica.length, 13);
assert.strictEqual(juridica.filter(o => o.tipo === 'ITBMS').length, 12);
assert.strictEqual(juridica.find(o => o.tipo === 'RENTA').fecha_vencimiento, '2026-03-31');
assert.ok(juridica.every(o => o.cliente_id === 'cliente-j'));

const naturalNoItbms = generarObligacionesFiscales({
  anio: 2026,
  cliente: { id: 'cliente-n', nombre: 'Cliente Natural', tipo: 'natural', contribuyente_itbms: false, regimen_fiscal: 'no_contribuyente_itbms', cierre_fiscal_mes: 12 },
});
assert.strictEqual(naturalNoItbms.length, 1);
assert.strictEqual(naturalNoItbms[0].tipo, 'RENTA');
assert.strictEqual(naturalNoItbms[0].fecha_vencimiento, '2026-03-15');

console.log('Fiscal engine tests passed');
