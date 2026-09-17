const owner = '30000000-0000-4000-8000-000000000001';
const client = '30000000-0000-4000-8000-000000000002';
const doc = '30000000-0000-4000-8000-000000000003';
const payment = '30000000-0000-4000-8000-000000000004';
function fixture() {
  return { metadata: { kind: 'contapanama-synthetic-v1' }, clientes: [{ id: client, usuario_id: owner, nombre: 'QA Importacion', ruc: 'QA-IMPORT', tipo: 'natural', contribuyente_itbms:true, regimen_fiscal:'general', periodo_fiscal:'calendario', cierre_fiscal_mes:12 }],
    transacciones: [{ id: doc, usuario_id: owner, cliente_id: client, cliente_nombre: 'QA Importacion', fecha: '2041-01-15', periodo: '2041-01',
      descripcion: 'QA Sintetico', tipo: 'ingreso', monto: 100, itbms: 7, estado_pago: 'parcial', estado_contable: 'registrado',
      pagos: [{ id: payment, usuario_id: owner, transaccion_id: doc, importe: 40, fecha: '2041-02-02', metodo_pago: 'efectivo', conciliado: false }] }] };
}
module.exports = { owner, fixture, bytes: () => Buffer.from(JSON.stringify(fixture())) };
