-- ============================================================
--  ContaPanamá — Migration FASE 6
--  Features nuevas: OCR · Factura Electrónica DGI · IA · Billing · Portal · Audit
--
--  Ejecutar:
--    psql -d contapanama -f saas-extension/database/migration_fase6_features.sql
--
--  Asume que las tablas base (usuarios, clientes, transacciones, etc.)
--  ya existen — solo agrega tablas nuevas, no toca las existentes.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_bytes para tokens

-- ============================================================
--  1. OCR · Bandeja de recibos
-- ============================================================
-- Un recibo entra a la cola cuando el usuario sube una foto/PDF.
-- El servicio OCR lo procesa async y rellena los campos *_extracted.
-- Cuando el usuario aprueba, se crea una transaccion vinculada.
-- ============================================================

CREATE TABLE IF NOT EXISTS ocr_recibos (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id          UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id          UUID         REFERENCES clientes(id) ON DELETE SET NULL,

  -- Archivo subido
  archivo_url         TEXT         NOT NULL,                    -- S3/Spaces/local path
  archivo_nombre      VARCHAR(255),
  archivo_mime        VARCHAR(80),
  archivo_size_bytes  INTEGER,

  -- Estado del procesamiento
  estado              VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','procesando','revisar','aprobado','rechazado','error')),
  estado_msg          TEXT,                                     -- mensaje si error/rechazo

  -- Datos extraídos por el OCR
  proveedor_extracted     VARCHAR(200),
  ruc_extracted           VARCHAR(50),
  fecha_extracted         DATE,
  subtotal_extracted      NUMERIC(14,2),
  itbms_extracted         NUMERIC(14,2),
  total_extracted         NUMERIC(14,2),
  documento_extracted     VARCHAR(100),     -- número de factura/recibo
  raw_text                TEXT,             -- texto OCR completo
  confianza               NUMERIC(5,2),     -- 0–100

  -- Sugerencia de clasificación
  cuenta_sugerida         VARCHAR(20),      -- código contable
  cuenta_sugerida_nombre  VARCHAR(120),
  cuenta_sugerida_conf    NUMERIC(5,2),

  -- Cuando se aprueba, se vincula a una transacción
  transaccion_id          UUID         REFERENCES transacciones(id) ON DELETE SET NULL,
  aprobado_at             TIMESTAMPTZ,
  aprobado_por            UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_usuario ON ocr_recibos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ocr_estado  ON ocr_recibos(estado);
CREATE INDEX IF NOT EXISTS idx_ocr_fecha   ON ocr_recibos(created_at DESC);


-- ============================================================
--  2. FACTURA ELECTRÓNICA DGI (Panamá)
-- ============================================================
-- Modelo basado en el SFEP (Sistema de Facturación Electrónica
-- de Panamá) usando un PAC (Proveedor Autorizado de Certificación).
-- ============================================================

-- Certificados digitales del usuario emisor
CREATE TABLE IF NOT EXISTS fe_certificados (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alias           VARCHAR(80),
  ruc_emisor      VARCHAR(50) NOT NULL,
  pkcs12_url      TEXT,                       -- ubicación encriptada del .p12
  password_enc    TEXT,                       -- password encriptado
  vence_at        DATE,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Puntos de facturación habilitados ante DGI
CREATE TABLE IF NOT EXISTS fe_puntos_facturacion (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo          VARCHAR(10) NOT NULL,        -- ej: "001-002"
  nombre          VARCHAR(120) NOT NULL,
  direccion       TEXT,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(usuario_id, codigo)
);

-- Secuencias por punto: número correlativo
CREATE TABLE IF NOT EXISTS fe_secuencias (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  punto_id        UUID        NOT NULL REFERENCES fe_puntos_facturacion(id) ON DELETE CASCADE,
  tipo_doc        VARCHAR(4)  NOT NULL,        -- "01"=factura, "04"=NC, "07"=ND, etc.
  ultimo_numero   BIGINT      NOT NULL DEFAULT 0,
  UNIQUE(punto_id, tipo_doc)
);

-- Encabezado factura electrónica
CREATE TABLE IF NOT EXISTS fe_facturas (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id        UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  punto_id          UUID        REFERENCES fe_puntos_facturacion(id) ON DELETE SET NULL,
  certificado_id    UUID        REFERENCES fe_certificados(id) ON DELETE SET NULL,

  -- Identificación DGI
  numero            VARCHAR(40),                  -- secuencial humano: FE-2025-002451
  tipo_doc          VARCHAR(4)  NOT NULL DEFAULT '01',
  cufe              VARCHAR(80),                  -- código único de FE devuelto por DGI
  qr_data           TEXT,                         -- contenido del QR

  -- Receptor
  receptor_ruc      VARCHAR(50) NOT NULL,
  receptor_dv       VARCHAR(5),
  receptor_nombre   VARCHAR(200) NOT NULL,
  receptor_email    VARCHAR(200),
  receptor_tipo     VARCHAR(20)  NOT NULL DEFAULT 'jurídica'
                    CHECK (receptor_tipo IN ('jurídica','natural','extranjero','consumidor_final')),

  -- Fechas y condiciones
  fecha_emision     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  condicion_pago    VARCHAR(30)  NOT NULL DEFAULT 'contado',
  dias_credito      INTEGER,
  moneda            VARCHAR(5)   NOT NULL DEFAULT 'USD',
  tasa_cambio       NUMERIC(10,4) DEFAULT 1.0,

  -- Totales (calculados desde fe_lineas)
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento         NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbms             NUMERIC(14,2) NOT NULL DEFAULT 0,
  total             NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Estado del documento
  estado            VARCHAR(20)  NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','transmitiendo','autorizada','rechazada','anulada')),
  estado_dgi        VARCHAR(80),                 -- texto literal devuelto por DGI/PAC
  transmitida_at    TIMESTAMPTZ,
  autorizada_at     TIMESTAMPTZ,
  anulada_at        TIMESTAMPTZ,
  motivo_anulacion  TEXT,

  -- Artefactos generados
  xml_url           TEXT,
  pdf_url           TEXT,

  -- Vinculación contable
  transaccion_id    UUID         REFERENCES transacciones(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fe_usuario ON fe_facturas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_fe_cliente ON fe_facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fe_estado  ON fe_facturas(estado);
CREATE INDEX IF NOT EXISTS idx_fe_cufe    ON fe_facturas(cufe);
CREATE INDEX IF NOT EXISTS idx_fe_fecha   ON fe_facturas(fecha_emision DESC);

-- Líneas de cada factura
CREATE TABLE IF NOT EXISTS fe_lineas (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  factura_id        UUID        NOT NULL REFERENCES fe_facturas(id) ON DELETE CASCADE,
  orden             INTEGER     NOT NULL DEFAULT 1,
  descripcion       TEXT        NOT NULL,
  cantidad          NUMERIC(14,3) NOT NULL DEFAULT 1,
  precio_unitario   NUMERIC(14,4) NOT NULL,
  descuento         NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbms_aplica      BOOLEAN     NOT NULL DEFAULT true,
  itbms_tasa        NUMERIC(5,4) NOT NULL DEFAULT 0.07,
  itbms_monto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_linea       NUMERIC(14,2) NOT NULL DEFAULT 0,
  cuenta_contable   VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_fe_lineas_factura ON fe_lineas(factura_id);

-- Eventos / audit del proceso de transmisión
CREATE TABLE IF NOT EXISTS fe_eventos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  factura_id      UUID        NOT NULL REFERENCES fe_facturas(id) ON DELETE CASCADE,
  evento          VARCHAR(40) NOT NULL,           -- creada, firmada, transmitida, autorizada, rechazada
  detalle         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
--  3. ASISTENTE IA · Conversaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_conversaciones (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        VARCHAR(200),
  modelo        VARCHAR(80) NOT NULL DEFAULT 'claude-haiku',
  pinned        BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_mensajes (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversacion_id   UUID        NOT NULL REFERENCES ai_conversaciones(id) ON DELETE CASCADE,
  rol               VARCHAR(20) NOT NULL CHECK (rol IN ('user','assistant','system','tool')),
  contenido         TEXT        NOT NULL,
  tokens_in         INTEGER,
  tokens_out        INTEGER,
  costo_usd         NUMERIC(10,6),
  contexto          JSONB,                       -- snapshot de los datos que pasamos al modelo
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_usuario ON ai_conversaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv     ON ai_mensajes(conversacion_id);

-- Tabla de usage agregada para tarifar / detectar abuso
CREATE TABLE IF NOT EXISTS ai_usage (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo       CHAR(7)     NOT NULL,            -- YYYY-MM
  llamadas      INTEGER     NOT NULL DEFAULT 0,
  tokens_in     BIGINT      NOT NULL DEFAULT 0,
  tokens_out    BIGINT      NOT NULL DEFAULT 0,
  costo_usd     NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE(usuario_id, periodo)
);


-- ============================================================
--  4. BILLING · Planes y suscripciones SaaS
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_planes (
  id              VARCHAR(40)  PRIMARY KEY,            -- 'solo', 'estudio', 'firma'
  nombre          VARCHAR(80)  NOT NULL,
  precio_mensual  NUMERIC(10,2) NOT NULL,
  precio_anual    NUMERIC(10,2) NOT NULL,
  moneda          VARCHAR(5)   NOT NULL DEFAULT 'USD',
  limite_clientes INTEGER,                              -- NULL = ilimitado
  limite_usuarios INTEGER,
  limite_fe       INTEGER,
  limite_ocr      INTEGER,
  features        JSONB,                                -- {ai: true, portal: true, ...}
  activo          BOOLEAN      NOT NULL DEFAULT true,
  orden           INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing_suscripciones (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_id         VARCHAR(40) NOT NULL REFERENCES billing_planes(id),
  estado          VARCHAR(20) NOT NULL DEFAULT 'trial'
                  CHECK (estado IN ('trial','active','past_due','canceled','expired')),
  ciclo           VARCHAR(10) NOT NULL DEFAULT 'mensual'
                  CHECK (ciclo IN ('mensual','anual')),

  trial_fin       DATE,
  periodo_inicio  DATE,
  periodo_fin     DATE,
  cancela_al_fin  BOOLEAN     NOT NULL DEFAULT false,

  -- Adapter externo (Stripe, etc.)
  proveedor       VARCHAR(40),                   -- 'stripe', 'yappy', 'manual'
  proveedor_id    VARCHAR(120),                  -- customer/subscription id externo

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_usuario ON billing_suscripciones(usuario_id);

CREATE TABLE IF NOT EXISTS billing_metodos_pago (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL CHECK (tipo IN ('yappy','ach','card','manual')),
  alias           VARCHAR(80),                   -- "Yappy 6789"
  token           TEXT,                          -- token del PSP (NUNCA PAN crudo)
  ultimos_4       VARCHAR(4),
  marca           VARCHAR(20),                   -- visa, mc, etc.
  default_method  BOOLEAN     NOT NULL DEFAULT false,
  vence_mm        SMALLINT,
  vence_yy        SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_pagos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  suscripcion_id  UUID        REFERENCES billing_suscripciones(id) ON DELETE SET NULL,
  metodo_id       UUID        REFERENCES billing_metodos_pago(id) ON DELETE SET NULL,
  monto           NUMERIC(10,2) NOT NULL,
  moneda          VARCHAR(5)   NOT NULL DEFAULT 'USD',
  estado          VARCHAR(20)  NOT NULL CHECK (estado IN ('pendiente','exitoso','fallido','reembolsado')),
  proveedor       VARCHAR(40),
  proveedor_id    VARCHAR(120),
  invoice_url     TEXT,
  pagado_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON billing_pagos(usuario_id);

-- Catálogo seed (los planes que mostramos en el prototipo)
INSERT INTO billing_planes (id, nombre, precio_mensual, precio_anual, limite_clientes, limite_usuarios, limite_fe, limite_ocr, features, orden) VALUES
  ('solo',    'Solo',     39,   390, 10,   1,    0,    0,    '{"ai":false,"portal":false,"ocr":false,"fe":false}'::jsonb, 1),
  ('estudio', 'Estudio',  99,   990, 50,   3,    200,  500,  '{"ai":true,"portal":true,"ocr":true,"fe":true}'::jsonb,    2),
  ('firma',   'Firma',    199, 1990, NULL, NULL, NULL, NULL, '{"ai":true,"portal":true,"ocr":true,"fe":true,"api":true}'::jsonb, 3)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  5. PORTAL DEL CLIENTE
-- ============================================================
-- El CPA invita a su cliente final. Le crea un acceso con
-- credenciales propias para que vea sus reportes y suba recibos.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_accesos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  email           VARCHAR(200) NOT NULL,
  nombre          VARCHAR(150),
  password_hash   TEXT,
  invite_token    TEXT,                              -- para activar la cuenta
  invite_envia_at TIMESTAMPTZ,
  acepta_at       TIMESTAMPTZ,                       -- cuando aceptó la invitación
  ultima_sesion   TIMESTAMPTZ,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, email)
);

CREATE TABLE IF NOT EXISTS portal_mensajes (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  remitente       VARCHAR(20) NOT NULL CHECK (remitente IN ('cpa','cliente')),
  contenido       TEXT        NOT NULL,
  leido           BOOLEAN     NOT NULL DEFAULT false,
  archivo_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_msg_cliente ON portal_mensajes(cliente_id);

CREATE TABLE IF NOT EXISTS portal_archivos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id      UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  titulo          VARCHAR(200) NOT NULL,
  tipo            VARCHAR(30) NOT NULL,            -- 'reporte','factura','otro'
  archivo_url     TEXT        NOT NULL,
  mime            VARCHAR(80),
  subido_por      VARCHAR(20) NOT NULL CHECK (subido_por IN ('cpa','cliente')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
--  6. AUDIT LOG
-- ============================================================
-- Crítico para certificación contable: quién hizo qué y cuándo.
-- Las rutas críticas (login, crear/editar/borrar tx, transmitir FE,
-- aprobar OCR, etc.) deben insertar aquí.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_portal_id UUID      REFERENCES portal_accesos(id) ON DELETE SET NULL,
  accion          VARCHAR(60) NOT NULL,           -- "transaccion.create", "fe.transmit", etc.
  entidad         VARCHAR(40) NOT NULL,           -- "transacciones", "fe_facturas"
  entidad_id      UUID,
  diff            JSONB,                          -- {antes, despues}
  ip              INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_audit_fecha   ON audit_log(created_at DESC);


-- ============================================================
--  7. 2FA · TOTP (Google Authenticator)
-- ============================================================

CREATE TABLE IF NOT EXISTS usuario_2fa (
  usuario_id      UUID        PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  secreto_enc     TEXT        NOT NULL,           -- TOTP secret encriptado
  habilitado      BOOLEAN     NOT NULL DEFAULT false,
  recovery_codes  TEXT[],
  activado_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
--  Trigger genérico para updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION fase6_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ocr_recibos','fe_facturas','ai_conversaciones','billing_suscripciones'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch ON %I; ' ||
      'CREATE TRIGGER trg_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fase6_touch_updated_at();',
      t, t
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================
--  Verificación rápida — ejecutar después:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--    AND table_name LIKE ANY (ARRAY['ocr_%','fe_%','ai_%','billing_%','portal_%','audit_%','usuario_2fa'])
--    ORDER BY table_name;
-- ============================================================
