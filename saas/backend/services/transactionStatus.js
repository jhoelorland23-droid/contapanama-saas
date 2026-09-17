// Older local records predate estado_contable and are already posted.
const isRegisteredTransaction = tx => (tx.estado_contable ?? 'registrado') === 'registrado';

function registeredTransactionSql(alias = '') {
  if (alias && !/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  return `COALESCE(${alias ? `${alias}.` : ''}estado_contable, 'registrado') = 'registrado'`;
}

module.exports = { isRegisteredTransaction, registeredTransactionSql };
