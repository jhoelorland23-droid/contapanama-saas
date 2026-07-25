-- ============================================================
--  ContaPanamá — Migración Fase 3: Motor Inteligente
--  psql $DATABASE_URL -f database/migration_fase3.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  NUEVAS COLUMNAS EN transacciones
-- ──────────────────────────────────────────────────────────
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS tiene_factura     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_factura    VARCHAR(80),
  ADD COLUMN IF NOT EXISTS categoria         VARCHAR(50),       -- alimentos|transporte|servicios|financiero|ingreso|personal|otro
  ADD COLUMN IF NOT EXISTS corregido_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corregido_en      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fuente_origen     VARCHAR(30) DEFAULT 'manual',  -- manual|csv|excel|pdf_banco|api
  ADD COLUMN IF NOT EXISTS datos_origen      JSONB;             -- metadata del archivo importado

-- ──────────────────────────────────────────────────────────
--  HISTORIAL DE CORRECCIONES (base de aprendizaje)
--  Cuando el usuario corrige una clasificación automática,
--  se guarda aquí. El sistema aprende y crea reglas nuevas
--  cuando hay 3+ correcciones iguales.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correcciones_clasificacion (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id        UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  transaccion_id    UUID         REFERENCES transacciones(id) ON DELETE CASCADE,
  descripcion_orig  TEXT         NOT NULL,
  -- Clasificación original (del motor)
  cuenta_original   VARCHAR(10),
  tipo_original     VARCHAR(20),
  etiqueta_original VARCHAR(100),
  -- Corrección del usuario
  cuenta_correcta   VARCHAR(10)  NOT NULL,
  tipo_correcto     VARCHAR(20)  NOT NULL,
  etiqueta_correcta VARCHAR(100),
  deducible_correcto BOOLEAN     NOT NULL DEFAULT false,
  categoria_correcta VARCHAR(50),
  -- Metadata
  regla_generada_id UUID         REFERENCES reglas_clasificacion(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correcciones_usuario ON correcciones_clasificacion(usuario_id);
CREATE INDEX IF NOT EXISTS idx_correcciones_desc    ON correcciones_clasificacion USING gin(to_tsvector('spanish', descripcion_orig));

-- ──────────────────────────────────────────────────────────
--  IMPORTACIONES (log de archivos importados)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS importaciones (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id       UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  nombre_archivo   VARCHAR(250) NOT NULL,
  tipo             VARCHAR(20)  NOT NULL CHECK (tipo IN ('csv','excel','pdf_banco','manual')),
  banco            VARCHAR(100),
  periodo          CHAR(7),
  total_filas      INTEGER      DEFAULT 0,
  importadas       INTEGER      DEFAULT 0,
  duplicadas       INTEGER      DEFAULT 0,
  errores          INTEGER      DEFAULT 0,
  estado           VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','procesando','completado','error')),
  detalle_errores  JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_importaciones_usuario ON importaciones(usuario_id);

-- ──────────────────────────────────────────────────────────
--  REGLAS DE CATEGORÍAS
--  Define qué cuentas pertenecen a cada categoría
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias_contables (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre        VARCHAR(80) NOT NULL,
  slug          VARCHAR(50) NOT NULL,   -- alimentos, transporte, etc.
  color         VARCHAR(20),            -- para UI
  icono         VARCHAR(30),
  cuentas       TEXT[],                 -- array de códigos de cuenta
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, slug)
);

-- Seed categorías base (usuario_id = NULL → globales)
INSERT INTO categorias_contables (usuario_id, nombre, slug, color, cuentas) VALUES
  (NULL, 'Alimentos',          'alimentos',    '#10b981', ARRAY['6207']),
  (NULL, 'Transporte',         'transporte',   '#f59e0b', ARRAY['6206']),
  (NULL, 'Servicios públicos', 'servicios_pub','#0ea5e9', ARRAY['6201','6202','6203']),
  (NULL, 'Personal',           'personal',     '#8b5cf6', ARRAY['6101','6102']),
  (NULL, 'Financiero',         'financiero',   '#ef4444', ARRAY['6401','6402']),
  (NULL, 'Oficina',            'oficina',      '#64748b', ARRAY['6204','6205','6209']),
  (NULL, 'Ingresos operativos','ing_operativo','#22c55e', ARRAY['4101','4102','4103','4104','4105']),
  (NULL, 'Otros ingresos',     'ing_otros',    '#84cc16', ARRAY['4201','4901']),
  (NULL, 'Proveedores',        'proveedores',  '#f97316', ARRAY['6208']),
  (NULL, 'Publicidad',         'publicidad',   '#ec4899', ARRAY['6301'])
ON CONFLICT (usuario_id, slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────
--  FUNCIÓN: contar correcciones y auto-generar regla
--  Se ejecuta después de 3+ correcciones iguales para
--  crear automáticamente una regla de clasificación.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_regla_desde_correcciones()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_patron TEXT;
BEGIN
  -- Contar correcciones del mismo usuario con misma cuenta de destino y descripción similar
  SELECT COUNT(*) INTO v_count
  FROM correcciones_clasificacion
  WHERE usuario_id     = NEW.usuario_id
    AND cuenta_correcta = NEW.cuenta_correcta
    AND tipo_correcto   = NEW.tipo_correcto
    AND LOWER(descripcion_orig) LIKE '%' || LOWER(SPLIT_PART(NEW.descripcion_orig,' ',1)) || '%';

  -- Si hay 3 o más, generar regla automática
  IF v_count >= 2 THEN  -- NEW es la 3era, aún no está en el COUNT
    v_patron := LOWER(SPLIT_PART(NEW.descripcion_orig, ' ', 1));
    IF LENGTH(v_patron) >= 4 THEN
      INSERT INTO reglas_clasificacion
        (usuario_id, nombre, patron, tipo, cuenta_codigo, deducible,
         etiqueta, confianza, prioridad)
      VALUES
        (NEW.usuario_id,
         'Auto: ' || INITCAP(v_patron),
         v_patron,
         NEW.tipo_correcto,
         NEW.cuenta_correcta,
         NEW.deducible_correcto,
         COALESCE(NEW.etiqueta_correcta, 'Auto-aprendido'),
         'media',
         50)
      ON CONFLICT DO NOTHING
      RETURNING id INTO NEW.regla_generada_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_auto_regla
    BEFORE INSERT ON correcciones_clasificacion
    FOR EACH ROW EXECUTE FUNCTION fn_auto_regla_desde_correcciones();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
