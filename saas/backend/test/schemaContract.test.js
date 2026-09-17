const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

function assertContains(pattern, message) {
  assert.match(schema, pattern, message);
}

assertContains(/CREATE TABLE IF NOT EXISTS work_orders/i, 'work_orders table is required');
assertContains(/CREATE TABLE IF NOT EXISTS ai_proposals/i, 'ai_proposals table is required');
assertContains(/CREATE TABLE IF NOT EXISTS audit_events/i, 'audit_events table is required');
assertContains(/CREATE TABLE IF NOT EXISTS plan_cuentas/i, 'plan_cuentas table is required');
assertContains(/CREATE TABLE IF NOT EXISTS asientos_contables/i, 'asientos_contables table is required');
assertContains(/CREATE TABLE IF NOT EXISTS asiento_lineas/i, 'asiento_lineas table is required');
assertContains(/CREATE TABLE IF NOT EXISTS cierres_periodo/i, 'cierres_periodo table is required');

assertContains(/UNIQUE\s*\(\s*source_system\s*,\s*source_work_id\s*\)/i, 'source_system/source_work_id unique key is required for ON CONFLICT');
assertContains(/origen_propuesta_id\s+UUID/i, 'transacciones.origen_propuesta_id is required');
assertContains(/estado_contable\s+VARCHAR\(30\)\s+NOT NULL\s+DEFAULT 'registrado'/i, 'transacciones.estado_contable default is required');
assertContains(/CHECK\s*\(\s*estado_contable\s+IN\s*\('borrador_ia','registrado'\)\s*\)/i, 'estado_contable must allow borrador_ia and registrado');

for (const estado of ['recibida', 'recibida_aprobada_cpa', 'aplicada_borrador', 'aplicada_libro', 'rechazada']) {
  assertContains(new RegExp(`'${estado}'`, 'i'), `ai_proposals estado ${estado} is required`);
}

for (const categoria of ['general', 'exento', 'alcohol_hospedaje', 'tabaco']) {
  assertContains(new RegExp(`'${categoria}'`, 'i'), `categoria_itbms ${categoria} is required`);
}

assertContains(/CREATE INDEX IF NOT EXISTS idx_tx_propuesta ON transacciones\(origen_propuesta_id\)/i, 'idx_tx_propuesta is required');
assertContains(/CHECK\s*\(\s*estado\s+IN\s*\('en_revision','cerrado'\)\s*\)/i, 'cierres_periodo estado must allow review and closed states');
assertContains(/UNIQUE\s*\(\s*usuario_id\s*,\s*codigo\s*\)/i, 'plan_cuentas unique user/code key is required');
assertContains(/CHECK\s*\(\s*NOT\s*\(\s*debe\s*>\s*0\s*AND\s*haber\s*>\s*0\s*\)\s*\)/i, 'asiento_lineas must not allow debit and credit on the same line');
assertContains(/CREATE TRIGGER trg_work_orders_upd/i, 'work_orders updated_at trigger is required');
assertContains(/CREATE TRIGGER trg_ai_proposals_upd/i, 'ai_proposals updated_at trigger is required');

console.log('Schema contract tests passed');
assertContains(/CREATE TABLE IF NOT EXISTS pagos_transacciones/i, 'Payment ledger table is required');
assertContains(/UNIQUE \(transaccion_id, idempotencia\)/i, 'A replay cannot create another payment');
assertContains(/UNIQUE \(movimiento_bancario_id\)/i, 'A bank movement cannot settle two payments');
assertContains(/FOREIGN KEY \(transaccion_id, usuario_id\) REFERENCES transacciones\(id, usuario_id\) ON DELETE RESTRICT/i, 'Payment and invoice must share owner and preserve history');
assertContains(/FOREIGN KEY \(movimiento_bancario_id, usuario_id\) REFERENCES movimientos_bancarios\(id, usuario_id\) ON DELETE RESTRICT/i, 'Payment and bank movement must share owner');
assertContains(/CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotencia ON transacciones\(usuario_id, idempotencia\) WHERE idempotencia IS NOT NULL/i, 'A replayed document creation cannot publish a second document');
assertContains(/CREATE UNIQUE INDEX IF NOT EXISTS idx_asiento_rectificado ON asientos_contables\(rectifica_id\) WHERE rectifica_id IS NOT NULL/i, 'An original entry can be reversed only once');
