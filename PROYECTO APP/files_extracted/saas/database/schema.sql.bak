-- ============================================================
--  ContaPanamá SaaS — Schema PostgreSQL completo
--  Ejecutar: psql -U postgres -d contapanama -f schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────
--  USUARIOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  rol           VARCHAR(20)  NOT NULL DEFAULT 'contador'
                CHECK (rol IN ('admin','contador','cliente')),
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
--  CLIENTES
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre        VARCHAR(200) NOT NULL,
  ruc           VARCHAR(50)  NOT NULL,
  nit           VARCHAR(50),
  tipo          VARCHAR(20)  NOT NULL DEFAULT 'jurídica'
                CHECK (tipo IN ('jurídica','natural')),
  actividad     VARCHAR(150),
  estado        VARCHAR(20)  NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo','inactivo','omiso')),
  telefono      VARCHAR(30),
  email         VARCHAR(200),
  direccion     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, ruc)
);

-- ──────────────────────────────────────────────────────────
--  TRANSACCIONES
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transacciones (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  VARCHAR(200),
  fecha           DATE        NOT NULL,
  descripcion     TEXT        NOT NULL,
  tipo            VARCHAR(20)  NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  monto           NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
  itbms           NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducible       BOOLEAN     NOT NULL DEFAULT false,
  banco           VARCHAR(100),
  referencia      VARCHAR(100),
  periodo         CHAR(7),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_usuario  ON transacciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tx_cliente  ON transacciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tx_periodo  ON transacciones(periodo);
CREATE INDEX IF NOT EXISTS idx_tx_fecha    ON transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_tx_tipo     ON transacciones(tipo);

-- ──────────────────────────────────────────────────────────
--  MOVIMIENTOS BANCARIOS (conciliación)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha           DATE        NOT NULL,
  descripcion     TEXT        NOT NULL,
  monto           NUMERIC(14,2) NOT NULL,
  tipo            VARCHAR(20)  NOT NULL CHECK (tipo IN ('credito','debito')),
  banco           VARCHAR(100),
  referencia      VARCHAR(100),
  conciliado      BOOLEAN     NOT NULL DEFAULT false,
  transaccion_id  UUID        REFERENCES transacciones(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
--  VENCIMIENTOS / ALERTAS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vencimientos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nombre  VARCHAR(200) DEFAULT 'Todos',
  descripcion     TEXT        NOT NULL,
  entidad         VARCHAR(80)  NOT NULL,
  fecha           DATE        NOT NULL,
  urgencia        VARCHAR(20)  NOT NULL DEFAULT 'media'
                  CHECK (urgencia IN ('critica','alta','media','baja')),
  completado      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venc_usuario ON vencimientos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_venc_fecha   ON vencimientos(fecha);

-- ──────────────────────────────────────────────────────────
--  TRIGGER: updated_at automático
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_usuarios_upd    BEFORE UPDATE ON usuarios      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  CREATE TRIGGER trg_clientes_upd    BEFORE UPDATE ON clientes      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  CREATE TRIGGER trg_transacc_upd    BEFORE UPDATE ON transacciones FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
--  NOTA: El usuario admin y datos de prueba se crean con:
--    cd backend && node db/seed.js
--  No insertar usuarios aquí — el hash de bcrypt se genera
--  en tiempo de ejecución con la clave real.
-- ──────────────────────────────────────────────────────────
