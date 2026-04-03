-- ============================================================
--  ContaPanamá — Migración Fase 5: Ajustes Producción
--  psql $DATABASE_URL -f database/migration_fase5.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  CAMPO itbms_exento en transacciones
--  true  → transacción exenta de ITBMS por ley (educación,
--           salud, exportaciones, etc.)
--  El campo itbms_aplica ya existe (false = no gravado)
--  itbms_exento añade semántica explícita de exención
-- ──────────────────────────────────────────────────────────
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS itbms_exento BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_factura_proveedor VARCHAR(80);

-- Índice para reportes de calidad rápidos
CREATE INDEX IF NOT EXISTS idx_tx_clasif
  ON transacciones(usuario_id, periodo, cuenta_contable)
  WHERE cuenta_contable IS NULL;

CREATE INDEX IF NOT EXISTS idx_tx_itbms_aplica
  ON transacciones(usuario_id, periodo, itbms_aplica, tiene_factura)
  WHERE itbms > 0;

-- ──────────────────────────────────────────────────────────
--  VISTA: v_calidad_periodo — resumen de calidad por período
--  Usada por el endpoint /api/errores/calidad/:periodo
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_calidad_periodo AS
SELECT
  t.usuario_id,
  t.periodo,
  COUNT(*)                                                AS total_transacciones,
  COUNT(*) FILTER (WHERE t.cuenta_contable IS NULL)       AS sin_clasificar,
  COUNT(*) FILTER (WHERE t.itbms > 0
    AND NOT t.itbms_aplica AND NOT t.itbms_exento)        AS itbms_sin_flag,
  COUNT(*) FILTER (WHERE t.itbms > 0
    AND t.deducible AND NOT t.tiene_factura
    AND NOT t.itbms_exento)                               AS itbms_sin_factura,
  COUNT(*) FILTER (WHERE t.tipo='gasto'
    AND t.itbms > 0 AND t.itbms_aplica
    AND t.deducible AND t.tiene_factura)                  AS con_credito_fiscal,
  COUNT(*) FILTER (WHERE t.tipo='ingreso'
    AND t.itbms > 0 AND t.itbms_aplica)                   AS con_debito_fiscal,
  COUNT(*) FILTER (WHERE t.asiento_generado = false)      AS sin_asiento,
  COUNT(*) FILTER (WHERE t.itbms_exento = true)           AS exentos,
  ROUND(SUM(t.monto) FILTER (WHERE t.tipo='ingreso')::NUMERIC,2)  AS total_ingresos,
  ROUND(SUM(t.monto) FILTER (WHERE t.tipo='gasto')::NUMERIC,2)    AS total_gastos,
  ROUND(SUM(t.itbms) FILTER (WHERE t.tipo='ingreso' AND t.itbms_aplica)::NUMERIC,2) AS itbms_debito,
  ROUND(SUM(t.itbms) FILTER (WHERE t.tipo='gasto' AND t.deducible AND t.tiene_factura AND t.itbms_aplica)::NUMERIC,2) AS itbms_credito
FROM transacciones t
GROUP BY t.usuario_id, t.periodo;

-- ──────────────────────────────────────────────────────────
--  EXPORTACIONES — log de archivos generados
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exportaciones (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('pdf','excel','csv','json')),
  modulo        VARCHAR(50) NOT NULL,  -- 'diario','itbms','estado_resultados','cliente'
  periodo       CHAR(7),
  parametros    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exp_usuario ON exportaciones(usuario_id);
