-- ============================================================
--  ContaPanamá Fase 2 — Motor Contable
--  Ejecutar: psql $DATABASE_URL -f database/fase2_motor_contable.sql
-- ============================================================

-- ── CATÁLOGO DE CUENTAS (configurable por usuario) ───────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_cuentas (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo      VARCHAR(10)  NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  tipo        VARCHAR(20)  NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO')),
  naturaleza  VARCHAR(10)  NOT NULL CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
  categoria   VARCHAR(100),
  activa      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_usuario ON catalogo_cuentas(usuario_id);

-- ── REGLAS DE CLASIFICACIÓN AUTOMÁTICA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS reglas_clasificacion (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  patron          VARCHAR(200) NOT NULL,       -- regex o substring a buscar en descripcion
  tipo_match      VARCHAR(10)  NOT NULL DEFAULT 'CONTAINS' CHECK (tipo_match IN ('CONTAINS','STARTS','REGEX')),
  tipo_tx         VARCHAR(20)  NOT NULL CHECK (tipo_tx IN ('ingreso','gasto')),
  cuenta_cargo    VARCHAR(10)  NOT NULL,       -- código cuenta débito
  cuenta_abono    VARCHAR(10)  NOT NULL,       -- código cuenta crédito
  aplica_itbms    BOOLEAN      NOT NULL DEFAULT false,
  deducible       BOOLEAN      NOT NULL DEFAULT false,
  prioridad       INTEGER      NOT NULL DEFAULT 10,
  activa          BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reglas_usuario ON reglas_clasificacion(usuario_id, activa);

-- ── ASIENTOS CONTABLES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asientos (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id  UUID         REFERENCES transacciones(id) ON DELETE CASCADE,
  numero_asiento  VARCHAR(20)  NOT NULL,       -- ej. 2025-03-001
  fecha           DATE         NOT NULL,
  periodo         CHAR(7)      NOT NULL,
  descripcion     TEXT         NOT NULL,
  estado          VARCHAR(20)  NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','confirmado','anulado')),
  total_debe      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_haber     NUMERIC(14,2) NOT NULL DEFAULT 0,
  cuadrado        BOOLEAN      GENERATED ALWAYS AS (
                    ABS(total_debe - total_haber) < 0.01
                  ) STORED,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asientos_usuario  ON asientos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_asientos_periodo  ON asientos(periodo);
CREATE INDEX IF NOT EXISTS idx_asientos_tx       ON asientos(transaccion_id);

-- ── LÍNEAS DE ASIENTO (partidas) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asiento_lineas (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  asiento_id      UUID         REFERENCES asientos(id) ON DELETE CASCADE,
  orden           SMALLINT     NOT NULL,
  cuenta_codigo   VARCHAR(10)  NOT NULL,
  cuenta_nombre   VARCHAR(200),
  debe            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debe >= 0),
  haber           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (haber >= 0),
  descripcion     TEXT,
  es_itbms        BOOLEAN      NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_lineas_asiento ON asiento_lineas(asiento_id);

-- ── SEED: reglas por defecto (para usuario_id NULL = globales) ───────────────
-- Se insertan en la app via seed o desde la API; no hardcoded aquí.

-- ── FUNCIÓN: auto-número de asiento por período ──────────────────────────────
CREATE OR REPLACE FUNCTION fn_siguiente_numero_asiento(p_usuario UUID, p_periodo CHAR(7))
RETURNS VARCHAR(20) AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n
  FROM asientos
  WHERE usuario_id = p_usuario AND periodo = p_periodo;
  RETURN p_periodo || '-' || LPAD(n::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
