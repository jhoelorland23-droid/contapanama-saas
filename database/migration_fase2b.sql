-- ============================================================
--  ContaPanamá — Migración Fase 2B: Motor Contable Mejorado
--  psql $DATABASE_URL -f database/migration_fase2b.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────
--  REGLAS DE CLASIFICACIÓN DINÁMICAS
--  Permite agregar/editar reglas sin tocar código.
--  Prioridad: reglas del usuario > reglas globales (usuario_id IS NULL)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reglas_clasificacion (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  -- NULL = regla global (disponible para todos)
  nombre          VARCHAR(150) NOT NULL,
  patron          TEXT         NOT NULL,      -- regex string, ej: 'supermercado|el.?rey'
  tipo            VARCHAR(20)  NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  cuenta_codigo   VARCHAR(10)  NOT NULL,
  deducible       BOOLEAN      NOT NULL DEFAULT false,
  etiqueta        VARCHAR(100) NOT NULL,
  confianza       VARCHAR(10)  NOT NULL DEFAULT 'alta' CHECK (confianza IN ('alta','media','baja')),
  activo          BOOLEAN      NOT NULL DEFAULT true,
  prioridad       INTEGER      NOT NULL DEFAULT 100,  -- menor = mayor prioridad
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reglas_usuario   ON reglas_clasificacion(usuario_id);
CREATE INDEX IF NOT EXISTS idx_reglas_activo    ON reglas_clasificacion(activo);
CREATE INDEX IF NOT EXISTS idx_reglas_prioridad ON reglas_clasificacion(prioridad);

DO $$ BEGIN
  CREATE TRIGGER trg_reglas_upd BEFORE UPDATE ON reglas_clasificacion
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────
--  CATÁLOGO DE CUENTAS POR CLIENTE
--  Cada cliente puede tener cuentas específicas que sobreescriben
--  al catálogo del usuario.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_cliente (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   UUID        REFERENCES usuarios(id)  ON DELETE CASCADE,
  cliente_id   UUID        REFERENCES clientes(id)  ON DELETE CASCADE,
  codigo       VARCHAR(10) NOT NULL,
  nombre       VARCHAR(200) NOT NULL,
  tipo         VARCHAR(20)  NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO')),
  naturaleza   VARCHAR(15)  NOT NULL CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
  categoria    VARCHAR(100),
  activo       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_cli_cliente ON catalogo_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_cli_usuario ON catalogo_cliente(usuario_id);

-- ──────────────────────────────────────────────────────────
--  AMPLIAR asientos_contables: agregar cliente_id + itbms_monto
-- ──────────────────────────────────────────────────────────
ALTER TABLE asientos_contables
  ADD COLUMN IF NOT EXISTS cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS itbms_monto   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbms_tipo    VARCHAR(15),  -- 'debito_fiscal' | 'credito_fiscal' | NULL
  ADD COLUMN IF NOT EXISTS numero_asiento INTEGER;     -- secuencia dentro del período

CREATE INDEX IF NOT EXISTS idx_asientos_cliente ON asientos_contables(cliente_id);

-- ──────────────────────────────────────────────────────────
--  SEED DE REGLAS GLOBALES (Panamá)
--  Insertar reglas base disponibles para todos los usuarios.
--  Patrón es regex case-insensitive.
-- ──────────────────────────────────────────────────────────
INSERT INTO reglas_clasificacion
  (usuario_id, nombre, patron, tipo, cuenta_codigo, deducible, etiqueta, confianza, prioridad)
VALUES
  -- ── SUPERMERCADOS ─────────────────────────────────────────────────────
  (NULL,'Supermercados Panamá',
   'supermercado|el\s?rey|riba\s?smith|machetazo|xtra|walmart|99\s?cents|price\s?smart',
   'gasto','6207',false,'Supermercado','alta',10),

  -- ── YAPPY / TRANSFERENCIAS ────────────────────────────────────────────
  (NULL,'Yappy recibido',
   'yappy|transferencia\s+recibida|pago\s+recibido\s+yappy',
   'ingreso','4901',false,'Yappy / Cobro digital','alta',5),

  (NULL,'Transferencia recibida ACH',
   'transferencia\s+recibida|deposito\s+recibido|abono\s+en\s+cuenta|credito\s+ach',
   'ingreso','4901',false,'Transferencia Recibida','alta',6),

  -- ── PAGOS ACH / PROVEEDORES ───────────────────────────────────────────
  (NULL,'Pago ACH / Proveedor',
   'pago\s+proveedor|pago\s+ach|ach\s+debit|debito\s+ach|pago\s+a\s+proveedor',
   'gasto','6208',true,'Pago a Proveedor (ACH)','alta',8),

  -- ── RESTAURANTES ──────────────────────────────────────────────────────
  (NULL,'Restaurantes y alimentación',
   'restaurante|almuerzo|cena|desayuno|cafeter[ií]a|comida|mc\s?donald|burger|pizza|sushi|subway|wendy',
   'gasto','6207',false,'Alimentación','alta',15),

  -- ── ALQUILER ──────────────────────────────────────────────────────────
  (NULL,'Alquiler de local/oficina',
   'alquiler|arrendamiento|renta\s+(local|oficina|inmueble)',
   'gasto','6201',true,'Alquiler','alta',20),

  -- ── TELECOMUNICACIONES ────────────────────────────────────────────────
  (NULL,'Telefonía e Internet',
   'internet|telefon[ií]a|celular|m[oó]vil|cable|claro|movistar|tigo|cwpanama|c\&w',
   'gasto','6202',true,'Telefonía e Internet','alta',25),

  -- ── SERVICIOS PÚBLICOS ────────────────────────────────────────────────
  (NULL,'Electricidad y agua',
   'electricidad|luz\s+electrica|agua\s+potable|enel|idaan|naturgy|gas\s+natural',
   'gasto','6203',true,'Servicios Públicos','alta',30),

  -- ── PAPELERÍA ─────────────────────────────────────────────────────────
  (NULL,'Papelería y útiles',
   'papeler[ií]a|[uú]tiles\s+de\s+oficina|suministros|tinta|t[oó]ner|resma',
   'gasto','6204',true,'Papelería y Útiles','alta',35),

  -- ── CSS / PLANILLA ────────────────────────────────────────────────────
  (NULL,'Cuotas CSS',
   'css|caja\s+de\s+seguro\s+social|seguro\s+social|cuota\s+patronal|planilla\s+css',
   'gasto','6102',false,'Cuotas CSS','alta',40),

  -- ── SUELDOS ───────────────────────────────────────────────────────────
  (NULL,'Sueldos y salarios',
   'sueldo|salario|n[oó]mina|planilla\s+pago|pago\s+empleado|quincena',
   'gasto','6101',false,'Sueldos y Salarios','alta',42),

  -- ── COMBUSTIBLE / TRANSPORTE ──────────────────────────────────────────
  (NULL,'Combustible y transporte',
   'gasolina|combustible|diesel|uber|taxi|transporte|vi[aá]ticos|peaje|estacionamiento',
   'gasto','6206',false,'Transporte y Viáticos','alta',50),

  -- ── MANTENIMIENTO ─────────────────────────────────────────────────────
  (NULL,'Mantenimiento y reparaciones',
   'mantenimiento|reparaci[oó]n|t[eé]cnico|plomero|electricista\s+servicio',
   'gasto','6205',true,'Mantenimiento','media',55),

  -- ── PUBLICIDAD ────────────────────────────────────────────────────────
  (NULL,'Publicidad y mercadeo',
   'publicidad|mercadeo|marketing|facebook\s+ads|google\s+ads|instagram\s+ads',
   'gasto','6301',true,'Publicidad','alta',60),

  -- ── COMISIONES BANCARIAS ──────────────────────────────────────────────
  (NULL,'Comisiones bancarias',
   'comisi[oó]n\s+banco|cargo\s+banco|mantenimiento\s+cuenta|comisi[oó]n\s+transferencia',
   'gasto','6402',false,'Comisiones Bancarias','alta',65),

  -- ── HONORARIOS RECIBIDOS ──────────────────────────────────────────────
  (NULL,'Honorarios profesionales recibidos',
   'honor[ae]rios|pago\s+por\s+servicios|retenci[oó]n\s+honorarios',
   'ingreso','4103',false,'Honorarios','alta',70),

  -- ── CONSULTORÍA ───────────────────────────────────────────────────────
  (NULL,'Consultoría y asesoría',
   'consultor[ií]a|asesor[ií]a|consultor\s+externo',
   'ingreso','4104',false,'Consultoría','alta',72),

  -- ── SERVICIOS CONTABLES ───────────────────────────────────────────────
  (NULL,'Servicios contables',
   'contabilidad|servicios\s+contables|auditor[ií]a|declaraci[oó]n',
   'ingreso','4105',false,'Servicios Contables','alta',74),

  -- ── VENTAS ────────────────────────────────────────────────────────────
  (NULL,'Venta de productos',
   'venta|factura\s+venta|mercancía|lote\s+#?\d|productos\s+vendidos',
   'ingreso','4102',false,'Ventas','alta',80),

  -- ── INTERESES RECIBIDOS ───────────────────────────────────────────────
  (NULL,'Intereses recibidos',
   'inter[eé]s\s+(recibido|ganado|bancario)|rendimiento\s+cuenta',
   'ingreso','4201',false,'Ingresos Financieros','alta',85),

  -- ── SERVICIOS PROFESIONALES GENÉRICO ─────────────────────────────────
  (NULL,'Servicios profesionales (genérico)',
   'factura\s+servicio|prestaci[oó]n\s+servicio|servicio\s+profesional',
   'ingreso','4101',false,'Servicios Profesionales','media',90),

  -- ── COMPRA MATERIALES ─────────────────────────────────────────────────
  (NULL,'Compra de materiales',
   'compra\s+material|material\s+construcci[oó]n|insumos|materia\s+prima',
   'gasto','6208',true,'Compra de Materiales','alta',95),

  -- ── SERVICIOS CONTRATADOS ─────────────────────────────────────────────
  (NULL,'Servicios profesionales contratados',
   'servicios\s+contratados|honorarios\s+pagados|consultor\s+pago',
   'gasto','6209',true,'Servicios Contratados','media',100)

ON CONFLICT DO NOTHING;
