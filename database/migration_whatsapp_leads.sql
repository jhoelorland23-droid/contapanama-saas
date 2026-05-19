-- ============================================================
--  ContaPanamá — Módulo WhatsApp & Leads
--  Ejecutar: psql $DATABASE_URL -f migration_whatsapp_leads.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  LEADS (prospectos desde redes sociales, web, WhatsApp)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre           VARCHAR(200) NOT NULL,
  telefono         VARCHAR(30),
  email            VARCHAR(200),
  empresa          VARCHAR(200),
  servicio         VARCHAR(100),
  mensaje          TEXT,
  fuente           VARCHAR(50)  NOT NULL DEFAULT 'web'
                   CHECK (fuente IN ('web','instagram','tiktok','whatsapp','referido','google','llamada','otro')),
  estado           VARCHAR(20)  NOT NULL DEFAULT 'nuevo'
                   CHECK (estado IN ('nuevo','contactado','calificado','propuesta','convertido','perdido')),
  prioridad        VARCHAR(10)  NOT NULL DEFAULT 'media'
                   CHECK (prioridad IN ('alta','media','baja')),
  notas            TEXT,
  whatsapp_enviado BOOLEAN      NOT NULL DEFAULT false,
  primer_contacto  TIMESTAMPTZ,
  ultimo_contacto  TIMESTAMPTZ,
  valor_estimado   NUMERIC(10,2),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_usuario  ON leads(usuario_id);
CREATE INDEX IF NOT EXISTS idx_leads_estado   ON leads(estado);
CREATE INDEX IF NOT EXISTS idx_leads_fuente   ON leads(fuente);
CREATE INDEX IF NOT EXISTS idx_leads_created  ON leads(created_at DESC);

-- ──────────────────────────────────────────────────────────
--  WHATSAPP MENSAJES (log de conversaciones)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  lead_id       UUID        REFERENCES leads(id) ON DELETE SET NULL,
  telefono      VARCHAR(30) NOT NULL,
  nombre        VARCHAR(200),
  direccion     VARCHAR(10) NOT NULL CHECK (direccion IN ('entrante','saliente')),
  mensaje       TEXT        NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'text'
                CHECK (tipo IN ('text','template','image','doc','audio')),
  estado        VARCHAR(20) NOT NULL DEFAULT 'enviado'
                CHECK (estado IN ('enviado','entregado','leido','fallido')),
  wa_message_id VARCHAR(150),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_usuario  ON whatsapp_mensajes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_lead     ON whatsapp_mensajes(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_telefono ON whatsapp_mensajes(telefono);

-- ──────────────────────────────────────────────────────────
--  WHATSAPP TEMPLATES (mensajes rápidos predefinidos)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID        REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre      VARCHAR(100) NOT NULL,
  categoria   VARCHAR(50) NOT NULL DEFAULT 'general'
              CHECK (categoria IN ('bienvenida','cotizacion','recordatorio','seguimiento','cierre','general')),
  mensaje     TEXT        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  usos        INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_tpl_usuario ON whatsapp_templates(usuario_id);

-- ──────────────────────────────────────────────────────────
--  SEEDS — Templates predeterminados para Orlando CPA
--  (se insertan para el primer usuario con rol admin)
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM usuarios WHERE rol='admin' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO whatsapp_templates (usuario_id, nombre, categoria, mensaje) VALUES
      (v_uid, 'Bienvenida inicial', 'bienvenida',
       'Hola {{nombre}}, soy Orlando, CPA certificado en Panamá 🇵🇦. Gracias por contactarme. Cuéntame, ¿en qué puedo ayudarte? Ofrezco servicios de contabilidad, declaraciones de renta, ITBMS, nóminas y asesoría empresarial.'),
      (v_uid, 'Respuesta rápida servicios', 'bienvenida',
       'Hola 👋 Aquí Orlando Panamá CPA. Mis servicios incluyen:\n✅ Declaración de renta\n✅ Contabilidad mensual\n✅ ITBMS y paz y salvo\n✅ Nóminas\n✅ Constitución de empresas\n\n¿Qué necesitas?'),
      (v_uid, 'Solicitud de cotización', 'cotizacion',
       'Gracias por tu interés {{nombre}} 🙏. Para prepararte una cotización personalizada, necesito saber:\n\n1️⃣ ¿Tienes empresa o es persona natural?\n2️⃣ ¿Cuántos empleados?\n3️⃣ ¿Actividad económica?\n\nCon eso te tengo lista la propuesta en 24 horas.'),
      (v_uid, 'Propuesta enviada - seguimiento', 'seguimiento',
       'Hola {{nombre}}, te escribo de seguimiento a la propuesta que te envié. ¿Tuviste oportunidad de revisarla? Recuerda que "rendirse no es una opción" y yo estoy aquí para ayudarte a tener tus finanzas en orden 💪'),
      (v_uid, 'Recordatorio vencimiento', 'recordatorio',
       '⚠️ Hola {{nombre}}, recordatorio importante: tienes una obligación fiscal próxima a vencer. Contáctame HOY para evitar multas y recargos. Llámame o escríbeme.'),
      (v_uid, 'Cierre - bienvenido cliente', 'cierre',
       'Bienvenido al equipo {{nombre}} 🎉. Ya eres parte de Orlando Panamá CPA. Comenzamos a trabajar de inmediato. Te enviaré los próximos pasos por aquí. Cualquier duda, escríbeme sin pena.')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
