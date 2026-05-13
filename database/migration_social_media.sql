-- ============================================================
--  ContaPanamá — Migración: Auto-respuesta Redes Sociales
--  psql $DATABASE_URL -f database/migration_social_media.sql
-- ============================================================

-- Configuración de cuentas de redes sociales por usuario
CREATE TABLE IF NOT EXISTS social_media_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id          UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma          VARCHAR(20) NOT NULL CHECK (plataforma IN ('instagram','tiktok')),
  activo              BOOLEAN NOT NULL DEFAULT false,

  -- Tokens OAuth
  access_token        TEXT,
  token_expiry        TIMESTAMPTZ,
  page_id             VARCHAR(100),   -- Instagram: page/business account ID
  account_id          VARCHAR(100),   -- TikTok: open_id

  -- Mensaje de bienvenida/firma opcional
  nombre_negocio      VARCHAR(200),
  mensaje_bienvenida  TEXT,
  prompt_contexto     TEXT,           -- Contexto del negocio para Claude AI

  -- Control
  responder_comentarios BOOLEAN NOT NULL DEFAULT true,
  responder_dm          BOOLEAN NOT NULL DEFAULT true,
  solo_preguntas        BOOLEAN NOT NULL DEFAULT true,  -- Solo responde si detecta pregunta

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(usuario_id, plataforma)
);

-- Log de todas las interacciones y respuestas automáticas
CREATE TABLE IF NOT EXISTS social_media_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  config_id       UUID REFERENCES social_media_config(id) ON DELETE SET NULL,
  plataforma      VARCHAR(20) NOT NULL,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('comentario','dm')),
  remitente_id    VARCHAR(200),
  remitente_nombre VARCHAR(200),
  mensaje_entrada TEXT NOT NULL,
  mensaje_salida  TEXT,
  es_pregunta     BOOLEAN NOT NULL DEFAULT false,
  respondido      BOOLEAN NOT NULL DEFAULT false,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sml_usuario ON social_media_logs(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sml_plataforma ON social_media_logs(usuario_id, plataforma);

-- Trigger updated_at en config
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_social_config_updated ON social_media_config;
CREATE TRIGGER trg_social_config_updated
  BEFORE UPDATE ON social_media_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
