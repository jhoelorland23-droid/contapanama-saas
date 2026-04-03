-- ============================================================
--  ContaPanamá — Migración Fase 2: Motor Contable
--  Ejecutar: psql $DATABASE_URL -f database/migration_fase2.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  CATÁLOGO DE CUENTAS PERSONALIZABLE POR USUARIO
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_cuentas (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo       VARCHAR(10) NOT NULL,
  nombre       VARCHAR(200) NOT NULL,
  tipo         VARCHAR(20)  NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO')),
  naturaleza   VARCHAR(15)  NOT NULL CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
  categoria    VARCHAR(100),
  activo       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_usuario ON catalogo_cuentas(usuario_id);

-- ──────────────────────────────────────────────────────────
--  ASIENTOS CONTABLES (líneas de diario)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asientos_contables (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id   UUID        REFERENCES transacciones(id) ON DELETE CASCADE,
  fecha            DATE        NOT NULL,
  cuenta_codigo    VARCHAR(10) NOT NULL,
  cuenta_nombre    VARCHAR(200),
  debe             NUMERIC(14,2) NOT NULL DEFAULT 0,
  haber            NUMERIC(14,2) NOT NULL DEFAULT 0,
  descripcion      TEXT,
  referencia       VARCHAR(100),
  tipo_linea       VARCHAR(30),   -- principal | ingreso | gasto | itbms_debito | itbms_credito
  periodo          CHAR(7),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_debe_haber CHECK (
    (debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0) OR (debe = 0 AND haber = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_asientos_usuario     ON asientos_contables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_asientos_transaccion ON asientos_contables(transaccion_id);
CREATE INDEX IF NOT EXISTS idx_asientos_periodo     ON asientos_contables(periodo);
CREATE INDEX IF NOT EXISTS idx_asientos_cuenta      ON asientos_contables(cuenta_codigo);

-- ──────────────────────────────────────────────────────────
--  COLUMNA clasificacion_auto en transacciones
--  Almacena el resultado del clasificador (JSON)
-- ──────────────────────────────────────────────────────────
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS cuenta_contable   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS etiqueta_auto     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS confianza_clasif  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS asiento_generado  BOOLEAN NOT NULL DEFAULT false;
