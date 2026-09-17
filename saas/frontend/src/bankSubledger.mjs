import Papa from 'papaparse';

export function bankSubledgerCsv(result) {
  const fields=['seccion','periodo','cliente_id','cliente','cuenta_bancaria_id','cuenta','saldo_anterior','debe','haber','saldo_acumulado',
    'fecha','asiento_id','numero','libro_entidad_id','folio','transaccion_id','pago_id','tipo_asiento','rectifica_id','descripcion','motivo',
    'asiento_hash','dimension_hash','origen_cuenta','extracto_id','extracto_version','diferencia_saldo','apertura_verificada','saldo_verificado'];
  const data=result.data.flatMap(row=>{
    const identity={periodo:row.periodo,cliente_id:row.cliente_id,cliente:row.cliente_nombre,cuenta_bancaria_id:row.cuenta_bancaria_id,
      cuenta:row.cuenta_nombre,apertura_verificada:'no',saldo_verificado:'no'};
    return [{...identity,seccion:'resumen_cuenta_mes',saldo_anterior:row.saldo_acumulado_anterior,debe:row.debe,haber:row.haber,
      saldo_acumulado:row.saldo_acumulado,extracto_id:row.extracto?.id||'',extracto_version:row.extracto?.revision||'',
      diferencia_saldo:row.diferencias?.saldo_final??''},
    ...row.movimientos.map(m=>({...identity,...m,seccion:'linea_publicada',folio:m.numero_libro}))];
  });
  return Papa.unparse({fields,data},{escapeFormulae:true});
}
