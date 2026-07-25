-- ============================================================
--  ContaPanamá — Migración Fase 4: Nivel Producción
--  psql $DATABASE_URL -f database/migration_fase4.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  PRÉSTAMOS — estructura para separar capital e intereses
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prestamos (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID         REFERENCES usuarios(id)  ON DELETE CASCADE,
  cliente_id        UUID         REFERENCES clientes(id)  ON DELETE SET NULL,
  descripcion       VARCHAR(200) NOT NULL,
  banco_acreedor    VARCHAR(100),
  monto_original    NUMERIC(14,2) NOT NULL CHECK (monto_original > 0),
  saldo_pendiente   NUMERIC(14,2) NOT NULL,
  tasa_interes      NUMERIC(6,4)  NOT NULL DEFAULT 0,   -- ej: 0.0650 = 6.50%
  cuota_mensual     NUMERIC(14,2),
  fecha_inicio      DATE         NOT NULL,
  fecha_fin         DATE,
  cuenta_capital    VARCHAR(10)  NOT NULL DEFAULT '2301',  -- Pasivo: préstamos
  cuenta_interes    VARCHAR(10)  NOT NULL DEFAULT '6401',  -- Gasto financiero
  cuenta_banco      VARCHAR(10)  NOT NULL DEFAULT '1102',  -- Banco
  activo            BOOLEAN      NOT NULL DEFAULT true,
  notas             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prestamos_usuario ON prestamos(usuario_id);

DO $$ BEGIN
  CREATE TRIGGER trg_prestamos_upd BEFORE UPDATE ON prestamos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────
--  PAGOS DE PRÉSTAMO — cada cuota registrada
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_prestamo (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prestamo_id      UUID         REFERENCES prestamos(id)      ON DELETE CASCADE,
  transaccion_id   UUID         REFERENCES transacciones(id)  ON DELETE SET NULL,
  usuario_id       UUID         REFERENCES usuarios(id)       ON DELETE CASCADE,
  fecha            DATE         NOT NULL,
  cuota_total      NUMERIC(14,2) NOT NULL,
  capital          NUMERIC(14,2) NOT NULL CHECK (capital >= 0),
  interes          NUMERIC(14,2) NOT NULL CHECK (interes >= 0),
  saldo_antes      NUMERIC(14,2),
  saldo_despues    NUMERIC(14,2),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cuota CHECK (ABS(cuota_total - capital - interes) < 0.02)
);

CREATE INDEX IF NOT EXISTS idx_pagos_prestamo    ON pagos_prestamo(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_transaccion ON pagos_prestamo(transaccion_id);

-- ──────────────────────────────────────────────────────────
--  LOG DE ERRORES CONTABLES
--  Registra inconsistencias, asientos que no cuadran,
--  y cualquier anomalía detectada por el motor.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errores_contables (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id   UUID         REFERENCES transacciones(id) ON DELETE SET NULL,
  periodo          CHAR(7),
  tipo_error       VARCHAR(50)  NOT NULL,
  -- asiento_no_cuadra | cuenta_invalida | itbms_inconsistente
  -- duplicado | prestamo_sin_config | validacion_fallida
  severidad        VARCHAR(10)  NOT NULL DEFAULT 'error'
                   CHECK (severidad IN ('info','warning','error','critico')),
  descripcion      TEXT         NOT NULL,
  detalle          JSONB,
  resuelto         BOOLEAN      NOT NULL DEFAULT false,
  resuelto_en      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_errores_usuario ON errores_contables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_errores_periodo ON errores_contables(periodo);
CREATE INDEX IF NOT EXISTS idx_errores_resuelto ON errores_contables(resuelto);

-- ──────────────────────────────────────────────────────────
--  ÍNDICE ANTI-DUPLICADOS en transacciones
--  Evita insertar la misma transacción dos veces
--  (mismo usuario, fecha, monto, banco y referencia)
-- ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_unique_dedup
  ON transacciones (usuario_id, fecha, monto, banco, referencia)
  WHERE referencia IS NOT NULL AND referencia <> '';

-- ──────────────────────────────────────────────────────────
--  COLUMNA en transacciones: prestamo_id
-- ──────────────────────────────────────────────────────────
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS prestamo_id     UUID REFERENCES prestamos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_cuota_prestamo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capital_prestamo  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS interes_prestamo  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS itbms_aplica      BOOLEAN NOT NULL DEFAULT false;
  -- itbms_aplica: indica si esta transacción realmente genera ITBMS
  -- Se distingue de itbms (monto) para el caso itbms=0 pero aplica=false explícitamente

-- ──────────────────────────────────────────────────────────
--  VISTA: diario_combinado — formato libro diario para auditores
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_diario_combinado AS
SELECT
  a.numero_asiento                            AS asiento,
  a.fecha,
  a.periodo,
  a.cuenta_codigo,
  a.cuenta_nombre,
  a.debe,
  a.haber,
  a.descripcion,
  a.referencia,
  a.tipo_linea,
  a.itbms_monto,
  a.itbms_tipo,
  t.tipo                                      AS tipo_transaccion,
  t.monto                                     AS monto_transaccion,
  t.tiene_factura,
  t.numero_factura,
  t.categoria,
  t.etiqueta_auto,
  t.confianza_clasif,
  t.fuente_origen,
  c.nombre                                    AS cliente_nombre,
  c.ruc                                       AS cliente_ruc,
  u.nombre                                    AS usuario_nombre,
  a.usuario_id,
  a.transaccion_id,
  a.cliente_id
FROM asientos_contables a
JOIN transacciones t ON t.id = a.transaccion_id
JOIN usuarios     u ON u.id = a.usuario_id
LEFT JOIN clientes c ON c.id = a.cliente_id;

-- ──────────────────────────────────────────────────────────
--  FUNCIÓN: validar_asiento_cuadre()
--  Verifica partida doble en tiempo real desde SQL
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_validar_cuadre_periodo(p_usuario_id UUID, p_periodo CHAR(7))
RETURNS TABLE (
  transaccion_id  UUID,
  descripcion     TEXT,
  total_debe      NUMERIC,
  total_haber     NUMERIC,
  diferencia      NUMERIC,
  cuadra          BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      a.transaccion_id,
      MIN(t.descripcion)           AS descripcion,
      SUM(a.debe)::NUMERIC         AS total_debe,
      SUM(a.haber)::NUMERIC        AS total_haber,
      ABS(SUM(a.debe) - SUM(a.haber))::NUMERIC AS diferencia,
      ABS(SUM(a.debe) - SUM(a.haber)) < 0.02   AS cuadra
    FROM asientos_contables a
    JOIN transacciones t ON t.id = a.transaccion_id
    WHERE a.usuario_id = p_usuario_id
      AND a.periodo    = p_periodo
    GROUP BY a.transaccion_id
    HAVING ABS(SUM(a.debe) - SUM(a.haber)) >= 0.02
    ORDER BY MIN(t.fecha);
END;
$$ LANGUAGE plpgsql;
