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
  contribuyente_itbms BOOLEAN NOT NULL DEFAULT true,
  regimen_fiscal VARCHAR(40) NOT NULL DEFAULT 'general'
                CHECK (regimen_fiscal IN ('general','ampyme','no_contribuyente_itbms','exento')),
  periodo_fiscal VARCHAR(20) NOT NULL DEFAULT 'calendario'
                CHECK (periodo_fiscal IN ('calendario','especial')),
  cierre_fiscal_mes INTEGER NOT NULL DEFAULT 12
                CHECK (cierre_fiscal_mes BETWEEN 1 AND 12),
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

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contribuyente_itbms BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS regimen_fiscal VARCHAR(40) NOT NULL DEFAULT 'general';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS periodo_fiscal VARCHAR(20) NOT NULL DEFAULT 'calendario';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cierre_fiscal_mes INTEGER NOT NULL DEFAULT 12;

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
  categoria_contable VARCHAR(80) NOT NULL DEFAULT 'otros',
  tipo            VARCHAR(20)  NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  monto           NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
  tasa_itbms      NUMERIC(5,4) NOT NULL DEFAULT 0.0700,
  categoria_itbms VARCHAR(40)  NOT NULL DEFAULT 'general'
                  CHECK (categoria_itbms IN ('exento','general','alcohol_hospedaje','tabaco')),
  itbms           NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducible       BOOLEAN     NOT NULL DEFAULT false,
  banco           VARCHAR(100),
  referencia      VARCHAR(100),
  tipo_documento  VARCHAR(30)  NOT NULL DEFAULT 'factura'
                  CHECK (tipo_documento IN ('factura','recibo','cuenta_por_pagar')),
  estado_pago     VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                  CHECK (estado_pago IN ('pendiente','parcial','pagado')),
  fecha_vencimiento DATE,
  fecha_pago      DATE,
  metodo_pago     VARCHAR(40),
  referencia_pago VARCHAR(100),
  conciliado      BOOLEAN     NOT NULL DEFAULT false,
  fecha_conciliacion DATE,
  periodo         CHAR(7),
  notas           TEXT,
  origen_propuesta_id UUID,
  estado_contable VARCHAR(30) NOT NULL DEFAULT 'registrado'
                  CHECK (estado_contable IN ('borrador_ia','registrado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS origen_propuesta_id UUID;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS estado_contable VARCHAR(30) NOT NULL DEFAULT 'registrado';
-- A retried or double-clicked creation must not publish the same document twice.
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS idempotencia VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotencia ON transacciones(usuario_id, idempotencia) WHERE idempotencia IS NOT NULL;
ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_estado_pago_check;
ALTER TABLE transacciones ADD CONSTRAINT transacciones_estado_pago_check CHECK (estado_pago IN ('pendiente','parcial','pagado'));
ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_estado_contable_check;
ALTER TABLE transacciones ADD CONSTRAINT transacciones_estado_contable_check CHECK (estado_contable IN ('borrador_ia','registrado'));

CREATE INDEX IF NOT EXISTS idx_tx_usuario  ON transacciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tx_cliente  ON transacciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tx_periodo  ON transacciones(periodo);
CREATE INDEX IF NOT EXISTS idx_tx_fecha    ON transacciones(fecha);
CREATE INDEX IF NOT EXISTS idx_tx_tipo     ON transacciones(tipo);
CREATE INDEX IF NOT EXISTS idx_tx_propuesta ON transacciones(origen_propuesta_id);

-- ──────────────────────────────────────────────────────────
--  MOVIMIENTOS BANCARIOS (conciliación)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  nombre VARCHAR(100) NOT NULL,
  banco VARCHAR(100) NOT NULL,
  numero VARCHAR(40) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('corriente','ahorros')),
  moneda CHAR(3) NOT NULL CHECK (moneda='USD'),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id,cliente_id,banco,numero),
  UNIQUE (id,usuario_id)
);
CREATE OR REPLACE FUNCTION fn_cuenta_bancaria_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'activa') IS DISTINCT FROM (to_jsonb(NEW)-'activa') THEN
    RAISE EXCEPTION 'La identidad de la cuenta bancaria es inmutable.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id=NEW.cliente_id AND usuario_id=NEW.usuario_id) THEN
    RAISE EXCEPTION 'La cuenta pertenece a otro cliente o usuario.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_cuenta_bancaria_guard BEFORE INSERT OR UPDATE ON cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION fn_cuenta_bancaria_guard();
CREATE UNIQUE INDEX IF NOT EXISTS idx_cuenta_identidad_normalizada ON cuentas_bancarias(usuario_id,cliente_id,lower(banco),numero);

CREATE TABLE IF NOT EXISTS operaciones_bancarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  idempotencia VARCHAR(100) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  contenido_hash CHAR(64) NOT NULL,
  resultado_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id,idempotencia)
);
CREATE OR REPLACE FUNCTION fn_reject_bank_record_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El registro bancario se conserva para trazabilidad; no se elimina ni sobrescribe.' USING ERRCODE='23514';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_operacion_bancaria_immutable BEFORE UPDATE OR DELETE ON operaciones_bancarias
  FOR EACH ROW EXECUTE FUNCTION fn_reject_bank_record_delete();
CREATE OR REPLACE TRIGGER trg_operacion_bancaria_truncate BEFORE TRUNCATE ON operaciones_bancarias
  FOR EACH STATEMENT EXECUTE FUNCTION fn_reject_bank_record_delete();
CREATE OR REPLACE TRIGGER trg_cuenta_bancaria_delete BEFORE DELETE ON cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION fn_reject_bank_record_delete();
CREATE OR REPLACE TRIGGER trg_cuenta_bancaria_truncate BEFORE TRUNCATE ON cuentas_bancarias
  FOR EACH STATEMENT EXECUTE FUNCTION fn_reject_bank_record_delete();

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS extractos_bancarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  cuenta_bancaria_id UUID NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  periodo CHAR(7) NOT NULL CHECK (periodo ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  anterior_id UUID UNIQUE REFERENCES extractos_bancarios(id) ON DELETE RESTRICT,
  saldo_inicial NUMERIC(14,2) NOT NULL,
  creditos NUMERIC(14,2) NOT NULL CHECK (creditos >= 0),
  debitos NUMERIC(14,2) NOT NULL CHECK (debitos >= 0),
  saldo_final NUMERIC(14,2) NOT NULL,
  cantidad_creditos INTEGER NOT NULL CHECK (cantidad_creditos BETWEEN 0 AND 1000000),
  cantidad_debitos INTEGER NOT NULL CHECK (cantidad_debitos BETWEEN 0 AND 1000000),
  soporte_nombre VARCHAR(180) NOT NULL,
  soporte_hash CHAR(64) NOT NULL,
  soporte_bytes INTEGER NOT NULL CHECK (soporte_bytes BETWEEN 10 AND 4194304),
  soporte_pdf BYTEA NOT NULL,
  motivo VARCHAR(1000) NOT NULL DEFAULT '',
  contenido_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id,cuenta_bancaria_id,periodo,revision),
  CHECK (saldo_inicial+creditos-debitos=saldo_final),
  CHECK ((creditos=0)=(cantidad_creditos=0) AND (debitos=0)=(cantidad_debitos=0)),
  CHECK ((revision=1 AND anterior_id IS NULL) OR (revision>1 AND anterior_id IS NOT NULL AND length(trim(motivo))>=10)),
  CHECK (octet_length(soporte_pdf)=soporte_bytes AND encode(sha256(soporte_pdf),'hex')=soporte_hash)
);
CREATE OR REPLACE FUNCTION fn_extracto_bancario_guard() RETURNS TRIGGER AS $$
DECLARE account_row cuentas_bancarias%ROWTYPE; previous_row extractos_bancarios%ROWTYPE;
BEGIN
  SELECT * INTO account_row FROM cuentas_bancarias WHERE id=NEW.cuenta_bancaria_id FOR UPDATE;
  IF account_row.id IS NULL OR account_row.usuario_id<>NEW.usuario_id OR account_row.cliente_id<>NEW.cliente_id THEN
    RAISE EXCEPTION 'El extracto pertenece a otra cuenta, cliente o usuario.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO previous_row FROM extractos_bancarios
    WHERE cuenta_bancaria_id=NEW.cuenta_bancaria_id AND periodo=NEW.periodo ORDER BY revision DESC LIMIT 1;
  IF NEW.revision<>COALESCE(previous_row.revision,0)+1 OR NEW.anterior_id IS DISTINCT FROM previous_row.id THEN
    RAISE EXCEPTION 'La version anterior del extracto no es la vigente.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_extracto_insert BEFORE INSERT ON extractos_bancarios
  FOR EACH ROW EXECUTE FUNCTION fn_extracto_bancario_guard();
CREATE OR REPLACE TRIGGER trg_extracto_immutable BEFORE UPDATE OR DELETE ON extractos_bancarios
  FOR EACH ROW EXECUTE FUNCTION fn_reject_bank_record_delete();
CREATE OR REPLACE TRIGGER trg_extracto_truncate BEFORE TRUNCATE ON extractos_bancarios
  FOR EACH STATEMENT EXECUTE FUNCTION fn_reject_bank_record_delete();

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

ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT;
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_movimiento_cliente_fecha ON movimientos_bancarios(usuario_id,cliente_id,fecha);
CREATE OR REPLACE FUNCTION fn_movimiento_cliente_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.cuenta_bancaria_id IS NOT NULL AND OLD.cuenta_bancaria_id IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
    RAISE EXCEPTION 'La cuenta de un movimiento asignado no se puede cambiar.' USING ERRCODE='23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas_bancarias
    WHERE id=NEW.cuenta_bancaria_id AND usuario_id=NEW.usuario_id AND cliente_id=NEW.cliente_id AND banco=NEW.banco) THEN
    RAISE EXCEPTION 'La cuenta del movimiento no coincide con cliente, banco y usuario.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.cliente_id IS NOT NULL AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'El propietario contable de un movimiento asignado no se puede cambiar.' USING ERRCODE='23514';
  END IF;
  IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id=NEW.cliente_id AND usuario_id=NEW.usuario_id) THEN
    RAISE EXCEPTION 'El cliente del banco pertenece a otro usuario.' USING ERRCODE='23514';
  END IF;
  IF NEW.transaccion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM transacciones
    WHERE id=NEW.transaccion_id AND usuario_id=NEW.usuario_id AND (NEW.cliente_id IS NULL OR cliente_id=NEW.cliente_id)) THEN
    RAISE EXCEPTION 'La transaccion bancaria pertenece a otro cliente o usuario.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_movimiento_cliente_guard BEFORE INSERT OR UPDATE ON movimientos_bancarios
  FOR EACH ROW EXECUTE FUNCTION fn_movimiento_cliente_guard();

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
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vencimientos ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_venc_usuario ON vencimientos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_venc_fecha   ON vencimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_venc_usuario_estado_fecha ON vencimientos(usuario_id, completado, fecha);

-- ──────────────────────────────────────────────────────────
--  CIERRES CONTABLES POR PERIODO
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cierres_periodo (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE CASCADE,
  periodo         CHAR(7),
  anio            INTEGER,
  alcance         VARCHAR(20) NOT NULL CHECK (alcance IN ('mensual','anual')),
  estado          VARCHAR(20) NOT NULL DEFAULT 'en_revision'
                  CHECK (estado IN ('en_revision','cerrado')),
  nota            TEXT,
  cerrado_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (alcance = 'mensual' AND periodo IS NOT NULL AND anio IS NULL)
    OR
    (alcance = 'anual' AND anio IS NOT NULL AND periodo IS NULL)
  ),
  UNIQUE(usuario_id, cliente_id, periodo, anio, alcance)
);

CREATE INDEX IF NOT EXISTS idx_cierres_usuario_alcance ON cierres_periodo(usuario_id, alcance, periodo, anio);
CREATE INDEX IF NOT EXISTS idx_cierres_cliente ON cierres_periodo(cliente_id);

-- NULL fields in the original composite UNIQUE do not prevent duplicate scopes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cierre_mes_cliente
  ON cierres_periodo(usuario_id, cliente_id, periodo) WHERE alcance='mensual' AND cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cierre_mes_global
  ON cierres_periodo(usuario_id, periodo) WHERE alcance='mensual' AND cliente_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cierre_anio_cliente
  ON cierres_periodo(usuario_id, cliente_id, anio) WHERE alcance='anual' AND cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cierre_anio_global
  ON cierres_periodo(usuario_id, anio) WHERE alcance='anual' AND cliente_id IS NULL;

-- ──────────────────────────────────────────────────────────
--  CONTABILIDAD FORMAL: PLAN DE CUENTAS Y ASIENTOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo          VARCHAR(20) NOT NULL,
  nombre          VARCHAR(160) NOT NULL,
  tipo            VARCHAR(30) NOT NULL
                  CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto','costo')),
  naturaleza      VARCHAR(20) NOT NULL
                  CHECK (naturaleza IN ('deudora','acreedora')),
  activo          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_usuario ON plan_cuentas(usuario_id);

CREATE TABLE IF NOT EXISTS asientos_contables (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id  UUID        REFERENCES transacciones(id) ON DELETE SET NULL,
  fecha           DATE        NOT NULL,
  periodo         CHAR(7)     NOT NULL,
  descripcion     TEXT        NOT NULL,
  origen          VARCHAR(40) NOT NULL DEFAULT 'transaccion',
  estado          VARCHAR(30) NOT NULL DEFAULT 'registrado'
                  CHECK (estado IN ('borrador','registrado','anulado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asientos_usuario_periodo ON asientos_contables(usuario_id, periodo);
CREATE INDEX IF NOT EXISTS idx_asientos_transaccion ON asientos_contables(transaccion_id);

CREATE TABLE IF NOT EXISTS asiento_lineas (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  asiento_id      UUID        NOT NULL REFERENCES asientos_contables(id) ON DELETE CASCADE,
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cuenta_codigo   VARCHAR(20) NOT NULL,
  cuenta_nombre   VARCHAR(160) NOT NULL,
  descripcion     TEXT,
  debe            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debe >= 0),
  haber           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (haber >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debe > 0 OR haber > 0),
  CHECK (NOT (debe > 0 AND haber > 0))
);

CREATE INDEX IF NOT EXISTS idx_asiento_lineas_asiento ON asiento_lineas(asiento_id);
CREATE INDEX IF NOT EXISTS idx_asiento_lineas_usuario_cuenta ON asiento_lineas(usuario_id, cuenta_codigo);

-- New books are append-only. Existing unmarked rows require explicit review.
CREATE TABLE IF NOT EXISTS libros_contables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
  metodo_incorporacion VARCHAR(30) NOT NULL CHECK (metodo_incorporacion IN ('libro_nuevo','revision_cpa')),
  fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS cliente_nombre TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS pago_id TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS origen_clave TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS revision INTEGER CHECK (revision > 0);
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS rectifica_id UUID REFERENCES asientos_contables(id) ON DELETE RESTRICT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS numero BIGINT CHECK (numero > 0);
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS contenido_hash CHAR(64);
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS tipo_asiento VARCHAR(40);
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS registro_txid BIGINT;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS requiere_folio BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE asientos_contables ADD COLUMN IF NOT EXISTS requiere_dimension_bancaria BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE asiento_lineas ADD COLUMN IF NOT EXISTS orden INTEGER CHECK (orden > 0);
ALTER TABLE asiento_lineas ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asiento_numero ON asientos_contables(usuario_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asiento_version ON asientos_contables(usuario_id, origen_clave, revision);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asiento_rectificado ON asientos_contables(rectifica_id) WHERE rectifica_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_asiento_linea_orden ON asiento_lineas(asiento_id, orden);

-- External SQL writes remain pending until verified by the accounting transaction.
DO $$ BEGIN
  IF to_regclass('public.journal_pending_sources') IS NULL THEN
    CREATE TABLE journal_pending_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      transaccion_id UUID NOT NULL,
      UNIQUE(usuario_id,transaccion_id)
    );
    INSERT INTO journal_pending_sources(usuario_id,transaccion_id) SELECT usuario_id,id FROM transacciones;
  END IF;
END $$;
ALTER TABLE journal_pending_sources ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION mark_journal_source_pending() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id UUID; document_id UUID;
BEGIN
  IF TG_OP='DELETE' THEN
    owner_id := OLD.usuario_id;
    IF TG_TABLE_NAME='transacciones' THEN document_id := OLD.id; ELSE document_id := OLD.transaccion_id; END IF;
  ELSE
    owner_id := NEW.usuario_id;
    IF TG_TABLE_NAME='transacciones' THEN document_id := NEW.id; ELSE document_id := NEW.transaccion_id; END IF;
  END IF;
  INSERT INTO journal_pending_sources(usuario_id,transaccion_id) VALUES(owner_id,document_id)
    ON CONFLICT(usuario_id,transaccion_id) DO UPDATE SET version=journal_pending_sources.version+1;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trg_journal_source_pending AFTER INSERT OR UPDATE OR DELETE ON transacciones
  FOR EACH ROW EXECUTE FUNCTION mark_journal_source_pending();

-- Separate immutable dimensions preserve existing financial hashes and historical folios.
CREATE TABLE IF NOT EXISTS dimensiones_bancarias (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT,
  asiento_id UUID NOT NULL REFERENCES asientos_contables(id) ON DELETE RESTRICT,
  orden INTEGER NOT NULL CHECK (orden > 0),
  cuenta_bancaria_id UUID REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  asiento_hash CHAR(64) NOT NULL,
  asiento_origen_id UUID REFERENCES asientos_contables(id) ON DELETE RESTRICT,
  fuente VARCHAR(20) NOT NULL CHECK (fuente IN ('publicacion','reversa','sin_cuenta','anulacion')),
  dimension_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asiento_id,orden),
  CHECK (fuente <> 'publicacion' OR cuenta_bancaria_id IS NOT NULL),
  CHECK (fuente <> 'sin_cuenta' OR cuenta_bancaria_id IS NULL)
);

-- Entity folios reference immutable entries without renumbering the historical owner-wide sequence.
CREATE TABLE IF NOT EXISTS libros_entidad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT,
  incorporacion_id UUID NOT NULL REFERENCES libros_contables(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_libro_entidad_cliente ON libros_entidad(usuario_id,cliente_id) WHERE cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_libro_entidad_provisional ON libros_entidad(usuario_id) WHERE cliente_id IS NULL;
CREATE TABLE IF NOT EXISTS folios_libro (
  asiento_id UUID PRIMARY KEY REFERENCES asientos_contables(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  libro_entidad_id UUID NOT NULL REFERENCES libros_entidad(id) ON DELETE RESTRICT,
  numero BIGINT NOT NULL CHECK (numero > 0 AND numero <= 9007199254740991),
  folio_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(libro_entidad_id,numero)
);

CREATE OR REPLACE FUNCTION fn_libro_inmutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El libro publicado no permite modificar ni eliminar registros.' USING ERRCODE='23514';
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_libro_entidad_guard() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM libros_contables WHERE id=NEW.incorporacion_id AND usuario_id=NEW.usuario_id)
     OR (NEW.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id=NEW.cliente_id AND usuario_id=NEW.usuario_id)) THEN
    RAISE EXCEPTION 'El libro por cliente no pertenece al propietario.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_folio_guard() RETURNS TRIGGER AS $$
DECLARE book libros_entidad%ROWTYPE; entry asientos_contables%ROWTYPE; next_number BIGINT;
BEGIN
  SELECT * INTO book FROM libros_entidad WHERE id=NEW.libro_entidad_id FOR UPDATE;
  SELECT * INTO entry FROM asientos_contables WHERE id=NEW.asiento_id;
  IF book.id IS NULL OR entry.id IS NULL OR entry.origen_clave IS NULL OR
     NEW.usuario_id<>book.usuario_id OR NEW.usuario_id<>entry.usuario_id OR
     book.cliente_id IS DISTINCT FROM entry.cliente_id OR NEW.folio_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'El folio no corresponde al asiento, cliente o propietario.' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(MAX(numero),0)+1 INTO next_number FROM folios_libro WHERE libro_entidad_id=book.id;
  IF NEW.numero<>next_number THEN
    RAISE EXCEPTION 'El folio debe continuar la secuencia del cliente.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_asiento_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.origen_clave IS NOT NULL THEN
      RAISE EXCEPTION 'El asiento publicado es inmutable. Registre una correccion.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;
  IF NEW.origen_clave IS NOT NULL THEN
    IF NEW.numero IS NULL OR NEW.revision IS NULL OR NEW.contenido_hash IS NULL
       OR NEW.tipo_asiento IS NULL OR NEW.motivo IS NULL OR NEW.estado <> 'registrado'
       OR NEW.periodo <> to_char(NEW.fecha, 'YYYY-MM') THEN
      RAISE EXCEPTION 'Metadatos del asiento incompletos.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM libros_contables WHERE usuario_id=NEW.usuario_id) THEN
      RAISE EXCEPTION 'El libro requiere incorporacion.' USING ERRCODE='23514';
    END IF;
    IF NEW.transaccion_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM transacciones WHERE id=NEW.transaccion_id AND usuario_id=NEW.usuario_id
    ) THEN
      RAISE EXCEPTION 'El documento pertenece a otro usuario.' USING ERRCODE='23514';
    END IF;
    IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM clientes WHERE id=NEW.cliente_id AND usuario_id=NEW.usuario_id
    ) THEN
      RAISE EXCEPTION 'El cliente pertenece a otro usuario.' USING ERRCODE='23514';
    END IF;
    IF NEW.rectifica_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM asientos_contables WHERE id=NEW.rectifica_id AND usuario_id=NEW.usuario_id AND rectifica_id IS NULL
    ) THEN
      RAISE EXCEPTION 'El asiento a rectificar no pertenece al libro.' USING ERRCODE='23514';
    END IF;
    NEW.registro_txid := txid_current();
    NEW.requiere_folio := true;
    NEW.requiere_dimension_bancaria := true;
  ELSIF EXISTS (SELECT 1 FROM libros_contables WHERE usuario_id=NEW.usuario_id) THEN
    RAISE EXCEPTION 'No se admiten asientos sin trazabilidad en un libro incorporado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_linea_guard() RETURNS TRIGGER AS $$
DECLARE header asientos_contables%ROWTYPE; creation_xid BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO header FROM asientos_contables WHERE id=OLD.asiento_id;
    IF header.origen_clave IS NOT NULL THEN
      RAISE EXCEPTION 'Las lineas publicadas son inmutables.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;
  SELECT * INTO header FROM asientos_contables WHERE id=NEW.asiento_id;
  -- The row's actual insertion transaction changes on restore; persisted txids do not.
  SELECT xmin::text::bigint INTO creation_xid FROM asientos_contables WHERE id=NEW.asiento_id;
  IF header.origen_clave IS NOT NULL AND (
    TG_OP <> 'INSERT' OR header.registro_txid IS DISTINCT FROM txid_current()
    OR creation_xid IS DISTINCT FROM (txid_current() % 4294967296)
    OR header.usuario_id <> NEW.usuario_id OR NEW.orden IS NULL OR NEW.tipo_cuenta IS NULL
  ) THEN
    RAISE EXCEPTION 'No se pueden agregar lineas a un asiento ya publicado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_asiento_balanceado() RETURNS TRIGGER AS $$
DECLARE header asientos_contables%ROWTYPE; total_lineas INTEGER; diferencia NUMERIC;
BEGIN
  SELECT * INTO header FROM asientos_contables WHERE id=NEW.id;
  IF header.origen_clave IS NULL THEN RETURN NULL; END IF;
  IF header.requiere_folio AND NOT EXISTS (SELECT 1 FROM folios_libro WHERE asiento_id=header.id AND usuario_id=header.usuario_id) THEN
    RAISE EXCEPTION 'El asiento requiere un folio de su cliente.' USING ERRCODE='23514';
  END IF;
  IF header.requiere_dimension_bancaria AND EXISTS (
    SELECT 1 FROM asiento_lineas l WHERE l.asiento_id=header.id AND l.cuenta_codigo IN ('1020','1021')
    AND NOT EXISTS (SELECT 1 FROM dimensiones_bancarias d WHERE d.asiento_id=l.asiento_id AND d.orden=l.orden)
  ) THEN
    RAISE EXCEPTION 'Falta la cuenta historica de una linea bancaria publicada.' USING ERRCODE='23514';
  END IF;
  SELECT count(*), COALESCE(sum(debe-haber),0) INTO total_lineas,diferencia FROM asiento_lineas WHERE asiento_id=header.id;
  IF total_lineas < 2 OR diferencia <> 0 THEN
    RAISE EXCEPTION 'No se puede publicar un asiento vacio o desbalanceado.' USING ERRCODE='23514';
  END IF;
  IF header.rectifica_id IS NOT NULL AND (
    EXISTS (
      (SELECT cuenta_codigo,debe,haber FROM asiento_lineas WHERE asiento_id=header.id)
      EXCEPT ALL (SELECT cuenta_codigo,haber,debe FROM asiento_lineas WHERE asiento_id=header.rectifica_id)
    ) OR EXISTS (
      (SELECT cuenta_codigo,haber,debe FROM asiento_lineas WHERE asiento_id=header.rectifica_id)
      EXCEPT ALL (SELECT cuenta_codigo,debe,haber FROM asiento_lineas WHERE asiento_id=header.id)
    )
  ) THEN
    RAISE EXCEPTION 'La correccion debe reversar exactamente el asiento original.' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_libro_inmutable BEFORE UPDATE OR DELETE ON libros_contables
  FOR EACH ROW EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_asiento_guard BEFORE INSERT OR UPDATE OR DELETE ON asientos_contables
  FOR EACH ROW EXECUTE FUNCTION fn_asiento_guard();
CREATE OR REPLACE TRIGGER trg_linea_guard BEFORE INSERT OR UPDATE OR DELETE ON asiento_lineas
  FOR EACH ROW EXECUTE FUNCTION fn_linea_guard();
CREATE OR REPLACE TRIGGER trg_asiento_no_truncate BEFORE TRUNCATE ON asientos_contables
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_linea_no_truncate BEFORE TRUNCATE ON asiento_lineas
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_libro_no_truncate BEFORE TRUNCATE ON libros_contables
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_libro_entidad_insert BEFORE INSERT ON libros_entidad
  FOR EACH ROW EXECUTE FUNCTION fn_libro_entidad_guard();
CREATE OR REPLACE TRIGGER trg_libro_entidad_inmutable BEFORE UPDATE OR DELETE ON libros_entidad
  FOR EACH ROW EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_libro_entidad_no_truncate BEFORE TRUNCATE ON libros_entidad
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_folio_insert BEFORE INSERT ON folios_libro
  FOR EACH ROW EXECUTE FUNCTION fn_folio_guard();
CREATE OR REPLACE TRIGGER trg_folio_inmutable BEFORE UPDATE OR DELETE ON folios_libro
  FOR EACH ROW EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_folio_no_truncate BEFORE TRUNCATE ON folios_libro
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();

CREATE OR REPLACE FUNCTION fn_dimension_bancaria_guard() RETURNS TRIGGER AS $$
DECLARE entry asientos_contables%ROWTYPE; line asiento_lineas%ROWTYPE; account_row cuentas_bancarias%ROWTYPE; original asientos_contables%ROWTYPE;
  creation_xid BIGINT; original_account UUID; source_account UUID; serialized TEXT;
BEGIN
  SELECT * INTO entry FROM asientos_contables WHERE id=NEW.asiento_id;
  SELECT xmin::text::bigint INTO creation_xid FROM asientos_contables WHERE id=NEW.asiento_id;
  SELECT * INTO line FROM asiento_lineas WHERE asiento_id=NEW.asiento_id AND orden=NEW.orden;
  IF entry.id IS NULL OR entry.origen_clave IS NULL OR line.id IS NULL OR line.cuenta_codigo NOT IN ('1020','1021')
    OR entry.registro_txid IS DISTINCT FROM txid_current() OR creation_xid IS DISTINCT FROM (txid_current() % 4294967296)
    OR NEW.usuario_id<>entry.usuario_id OR NEW.cliente_id IS DISTINCT FROM entry.cliente_id
    OR NEW.asiento_hash IS DISTINCT FROM entry.contenido_hash THEN
    RAISE EXCEPTION 'La cuenta solo puede vincularse al publicar su linea bancaria.' USING ERRCODE='23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT * INTO account_row FROM cuentas_bancarias WHERE id=NEW.cuenta_bancaria_id;
    IF account_row.id IS NULL OR account_row.usuario_id<>NEW.usuario_id OR account_row.cliente_id IS DISTINCT FROM NEW.cliente_id
      OR line.cuenta_codigo<>(CASE WHEN lower(account_row.banco) LIKE '%general%' THEN '1020' ELSE '1021' END) THEN
      RAISE EXCEPTION 'La cuenta del auxiliar pertenece a otro cliente o banco.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF entry.rectifica_id IS NOT NULL OR entry.tipo_asiento IN ('reversa_pago','reversa_cobro') THEN
    SELECT * INTO original FROM asientos_contables WHERE id=NEW.asiento_origen_id;
    SELECT cuenta_bancaria_id INTO original_account FROM dimensiones_bancarias WHERE asiento_id=NEW.asiento_origen_id AND orden=NEW.orden;
    IF original.id IS NULL OR original.usuario_id<>NEW.usuario_id OR original.cliente_id IS DISTINCT FROM entry.cliente_id
      OR original.numero>=entry.numero OR NEW.cuenta_bancaria_id IS DISTINCT FROM original_account
      OR NOT EXISTS (SELECT 1 FROM asiento_lineas WHERE asiento_id=original.id AND orden=NEW.orden AND cuenta_codigo=line.cuenta_codigo AND debe=line.haber AND haber=line.debe)
      OR (entry.rectifica_id IS NOT NULL AND (NEW.fuente<>'reversa' OR original.id<>entry.rectifica_id))
      OR (entry.rectifica_id IS NULL AND (NEW.fuente<>'anulacion' OR original.tipo_asiento NOT IN ('pago','cobro')
        OR original.transaccion_id IS DISTINCT FROM entry.transaccion_id OR original.pago_id IS DISTINCT FROM entry.pago_id)) THEN
      RAISE EXCEPTION 'La correccion debe conservar la cuenta original.' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.fuente IN ('reversa','anulacion') OR NEW.asiento_origen_id IS NOT NULL THEN
    RAISE EXCEPTION 'La dimension no corresponde a una correccion.' USING ERRCODE='23514';
  ELSE
    SELECT cuenta_bancaria_id INTO source_account FROM pagos_transacciones
      WHERE usuario_id=NEW.usuario_id AND transaccion_id=entry.transaccion_id AND id::text=entry.pago_id;
    IF NOT FOUND THEN
      SELECT cuenta_bancaria_id INTO source_account FROM transacciones
        WHERE id=entry.transaccion_id AND usuario_id=NEW.usuario_id AND id::text=entry.pago_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El asiento bancario requiere su pago de origen.' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.cuenta_bancaria_id IS DISTINCT FROM source_account THEN
      RAISE EXCEPTION 'La cuenta no coincide con el pago publicado.' USING ERRCODE='23514';
    END IF;
  END IF;
  serialized := format('["%s","%s",%s,%s,%s,"%s","%s",%s]',NEW.asiento_id,NEW.usuario_id,
    COALESCE(to_json(NEW.cliente_id)::text,'null'),NEW.orden,COALESCE(to_json(NEW.cuenta_bancaria_id)::text,'null'),NEW.asiento_hash,NEW.fuente,
    COALESCE(to_json(NEW.asiento_origen_id)::text,'null'));
  IF NEW.dimension_hash IS DISTINCT FROM encode(sha256(convert_to(serialized,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'La huella de la cuenta historica no coincide.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_dimension_bancaria_insert BEFORE INSERT ON dimensiones_bancarias
  FOR EACH ROW EXECUTE FUNCTION fn_dimension_bancaria_guard();
CREATE OR REPLACE TRIGGER trg_dimension_bancaria_inmutable BEFORE UPDATE OR DELETE ON dimensiones_bancarias
  FOR EACH ROW EXECUTE FUNCTION fn_libro_inmutable();
CREATE OR REPLACE TRIGGER trg_dimension_bancaria_no_truncate BEFORE TRUNCATE ON dimensiones_bancarias
  FOR EACH STATEMENT EXECUTE FUNCTION fn_libro_inmutable();
DO $$ BEGIN
  CREATE CONSTRAINT TRIGGER trg_asiento_balanceado AFTER INSERT OR UPDATE ON asientos_contables
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_asiento_balanceado();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
--  WORK ORDERS / PROPUESTAS IA (integracion Orlando CPA OS)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  source_system   VARCHAR(80) NOT NULL,
  source_work_id  VARCHAR(120) NOT NULL,
  tipo_servicio   VARCHAR(120) NOT NULL,
  estado          VARCHAR(40)  NOT NULL DEFAULT 'recibido'
                  CHECK (estado IN ('recibido','preparacion_ia','esperando_documentos','revision_cpa','aprobado_cpa','rechazado','cerrado','no_continuado')),
  decision_actual TEXT,
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_system, source_work_id)
);

CREATE INDEX IF NOT EXISTS idx_work_orders_cliente ON work_orders(cliente_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_source  ON work_orders(source_system, source_work_id);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  source_system   VARCHAR(80) NOT NULL,
  source_work_id  VARCHAR(120) NOT NULL,
  tipo            VARCHAR(80) NOT NULL,
  estado          VARCHAR(40) NOT NULL DEFAULT 'recibida'
                  CHECK (estado IN ('recibida','recibida_aprobada_cpa','aplicada_borrador','aplicada_libro','rechazada')),
  payload         JSONB      NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_system, source_work_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_proposals_cliente ON ai_proposals(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_source  ON ai_proposals(source_system, source_work_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  source_system   VARCHAR(80),
  source_work_id  VARCHAR(120),
  accion          VARCHAR(120) NOT NULL,
  objeto_tipo     VARCHAR(80),
  objeto_id       UUID,
  antes_json      JSONB,
  despues_json    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_cliente ON audit_events(cliente_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_source  ON audit_events(source_system, source_work_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_usuario_fecha ON audit_events(usuario_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
--  TRIGGER: updated_at automático
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  BEGIN CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_clientes_upd BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_transacc_upd BEFORE UPDATE ON transacciones FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_plan_cuentas_upd BEFORE UPDATE ON plan_cuentas FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_asientos_upd BEFORE UPDATE ON asientos_contables FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_work_orders_upd BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE TRIGGER trg_ai_proposals_upd BEFORE UPDATE ON ai_proposals FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ──────────────────────────────────────────────────────────
--  Pagos aplicados: un documento puede tener varios cobros o pagos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_id_owner ON transacciones(id, usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mov_id_owner ON movimientos_bancarios(id, usuario_id);
CREATE TABLE IF NOT EXISTS pagos_transacciones (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  transaccion_id UUID NOT NULL,
  importe NUMERIC(14,2) NOT NULL CHECK (importe > 0),
  fecha DATE NOT NULL,
  metodo_pago VARCHAR(30) NOT NULL,
  banco VARCHAR(100) NOT NULL DEFAULT '',
  referencia VARCHAR(200) NOT NULL DEFAULT '',
  idempotencia VARCHAR(100) NOT NULL,
  conciliado BOOLEAN NOT NULL DEFAULT FALSE,
  movimiento_bancario_id UUID,
  anulado_fecha DATE,
  anulado_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (transaccion_id, usuario_id) REFERENCES transacciones(id, usuario_id) ON DELETE RESTRICT,
  FOREIGN KEY (movimiento_bancario_id, usuario_id) REFERENCES movimientos_bancarios(id, usuario_id) ON DELETE RESTRICT,
  UNIQUE (transaccion_id, idempotencia),
  UNIQUE (movimiento_bancario_id),
  CHECK (metodo_pago IN ('efectivo','transferencia','cheque','tarjeta','otro')),
  CHECK (metodo_pago = 'efectivo' OR banco <> ''),
  CHECK ((anulado_fecha IS NULL AND anulado_motivo IS NULL) OR (anulado_fecha IS NOT NULL AND anulado_motivo IS NOT NULL AND anulado_fecha >= fecha AND length(anulado_motivo) >= 3)),
  CHECK (NOT conciliado OR (movimiento_bancario_id IS NOT NULL AND anulado_fecha IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pagos_usuario_fecha ON pagos_transacciones(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_transaccion ON pagos_transacciones(transaccion_id);
CREATE OR REPLACE TRIGGER trg_journal_payment_pending AFTER INSERT OR UPDATE OR DELETE ON pagos_transacciones
  FOR EACH ROW EXECUTE FUNCTION mark_journal_source_pending();

ALTER TABLE pagos_transacciones ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION fn_pago_cuenta_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.cuenta_bancaria_id IS NOT NULL AND OLD.cuenta_bancaria_id IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
    RAISE EXCEPTION 'La cuenta de un pago asignado no se puede cambiar.' USING ERRCODE='23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL AND (NEW.metodo_pago='efectivo' OR NOT EXISTS (
    SELECT 1 FROM cuentas_bancarias a JOIN transacciones t ON t.id=NEW.transaccion_id AND t.usuario_id=NEW.usuario_id
    WHERE a.id=NEW.cuenta_bancaria_id AND a.usuario_id=NEW.usuario_id AND a.cliente_id=t.cliente_id AND a.banco=NEW.banco
  )) THEN
    RAISE EXCEPTION 'La cuenta del pago no coincide con documento, banco y usuario.' USING ERRCODE='23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL AND NEW.movimiento_bancario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM movimientos_bancarios WHERE id=NEW.movimiento_bancario_id AND usuario_id=NEW.usuario_id AND cuenta_bancaria_id=NEW.cuenta_bancaria_id
  ) THEN
    RAISE EXCEPTION 'El movimiento corresponde a otra cuenta bancaria.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_pago_cuenta_guard BEFORE INSERT OR UPDATE ON pagos_transacciones
  FOR EACH ROW EXECUTE FUNCTION fn_pago_cuenta_guard();
CREATE OR REPLACE FUNCTION fn_documento_cuenta_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.cuenta_bancaria_id IS NOT NULL AND OLD.cuenta_bancaria_id IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
    RAISE EXCEPTION 'La cuenta de un documento asignado no se puede cambiar.' USING ERRCODE='23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL AND (NEW.metodo_pago='efectivo' OR NOT EXISTS (
    SELECT 1 FROM cuentas_bancarias WHERE id=NEW.cuenta_bancaria_id AND usuario_id=NEW.usuario_id AND cliente_id=NEW.cliente_id AND banco=NEW.banco
  )) THEN
    RAISE EXCEPTION 'La cuenta del documento no coincide con cliente, banco y usuario.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM pagos_transacciones p JOIN cuentas_bancarias a ON a.id=p.cuenta_bancaria_id
    WHERE p.transaccion_id=NEW.id AND (a.usuario_id IS DISTINCT FROM NEW.usuario_id OR a.cliente_id IS DISTINCT FROM NEW.cliente_id)) THEN
    RAISE EXCEPTION 'El cliente del documento no coincide con la cuenta de sus pagos.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER trg_documento_cuenta_guard BEFORE INSERT OR UPDATE ON transacciones
  FOR EACH ROW EXECUTE FUNCTION fn_documento_cuenta_guard();

--  NOTA: El usuario admin y datos de prueba se crean con:
--    cd backend && node db/seed.js
--  No insertar usuarios aquí — el hash de bcrypt se genera
--  en tiempo de ejecución con la clave real.
-- ──────────────────────────────────────────────────────────
