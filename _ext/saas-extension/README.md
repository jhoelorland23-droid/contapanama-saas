# ContaPanamá — Extensión Fase 6
### Features nuevas para ir a producción: OCR · Factura Electrónica DGI · IA · Billing · Portal del cliente · Audit

Este paquete agrega las 5 features que separan tu app de un SaaS comercializable. Está diseñado para **pegar encima** de tu repo `saas/` sin tocar lo que ya tienes.

```
saas-extension/
├── database/
│   └── migration_fase6_features.sql      ← 17 tablas nuevas, idempotente
└── backend/
    ├── routes/
    │   ├── ocr.js                        ← /api/ocr   (bandeja recibos)
    │   ├── fe.js                         ← /api/fe    (Factura Electrónica DGI)
    │   ├── ai.js                         ← /api/ai    (asistente IA)
    │   ├── billing.js                    ← /api/billing
    │   └── portal.js                     ← /api/portal (cliente final)
    ├── services/
    │   ├── ocr.js                        ← adapter Mindee/Textract/Vision
    │   ├── pac.js                        ← adapter FacturaPanamá/IntegrationPAC
    │   ├── ai.js                         ← adapter Anthropic/OpenAI
    │   └── audit.js                      ← logger central
    └── server.patch.js                   ← 5 líneas para tu server.js
```

---

## Instalación rápida (10 minutos)

### 1. Copiar archivos a tu repo

```bash
# Desde la raíz de este canvas:
cp -r saas-extension/database/*       saas/database/
cp -r saas-extension/backend/routes/* saas/backend/routes/
cp -r saas-extension/backend/services/* saas/backend/services/
```

### 2. Aplicar la migración SQL

```bash
cd saas
docker-compose up -d                    # postgres corriendo
psql -h localhost -U postgres -d contapanama -f database/migration_fase6_features.sql
# o si usas Docker exec:
docker-compose exec postgres psql -U postgres -d contapanama -f /database/migration_fase6_features.sql
```

Verifica:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
AND table_name LIKE ANY (ARRAY['ocr_%','fe_%','ai_%','billing_%','portal_%','audit_%']);
-- Debe devolver 17 tablas
```

### 3. Instalar deps nuevas

```bash
cd saas/backend
npm install multer
# (opcional, según los providers que uses)
npm install form-data                 # para Mindee
npm install @aws-sdk/client-textract  # para AWS Textract
npm install @google-cloud/vision      # para Google Vision
```

### 4. Patchear `server.js`

Abre `saas/backend/server.js` y aplica los cambios indicados en `server.patch.js`:

```js
// Requires (junto a los otros):
const ocrRoutes     = require('./routes/ocr');
const feRoutes      = require('./routes/fe');
const aiRoutes      = require('./routes/ai');
const billingRoutes = require('./routes/billing');
const portalRoutes  = require('./routes/portal');

// Static para uploads (antes de las routes):
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes (junto a las otras):
app.use('/api/ocr',     ocrRoutes);
app.use('/api/fe',      feRoutes);
app.use('/api/ai',      aiRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/portal',  portalRoutes);
```

### 5. Variables de entorno

Añade a `saas/backend/.env`:

```env
# OCR — modo mock por defecto. Para producción:
OCR_PROVIDER=mock              # mock | mindee | textract | vision
MINDEE_API_KEY=

# Factura Electrónica DGI — modo mock por defecto:
PAC_PROVIDER=mock              # mock | facturapanama | integrationpac
PAC_API_URL=
PAC_API_KEY=
PAC_RUC_EMISOR=

# Asistente IA — modo mock por defecto:
AI_PROVIDER=mock               # mock | anthropic | openai
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

**Importante:** todo arranca en modo `mock` y funciona sin proveedor externo. Esto permite que el equipo de QA pruebe TODOS los flujos antes de contratar Mindee, FacturaPanamá, etc.

### 6. Reiniciar y probar

```bash
cd saas/backend
npm run dev
# Probar
curl http://localhost:4000/api/billing/planes
# Debe devolver los 3 planes seed (Solo/Estudio/Firma)
```

---

## Endpoints completos

### `/api/ocr` — Bandeja de recibos

```
POST   /api/ocr/recibos                 multipart: archivo, cliente_id?
GET    /api/ocr/recibos                 ?estado=revisar&cliente_id=…
GET    /api/ocr/recibos/:id
PATCH  /api/ocr/recibos/:id/aprobar     overrides → crea transacción
PATCH  /api/ocr/recibos/:id/rechazar
DELETE /api/ocr/recibos/:id
GET    /api/ocr/stats                   contadores por estado
```

### `/api/fe` — Factura Electrónica DGI

```
GET    /api/fe/puntos
POST   /api/fe/puntos                   { codigo: "001-002", nombre, direccion }
GET    /api/fe/certificados
POST   /api/fe/certificados             { alias, ruc_emisor, pkcs12_url, password_enc, vence_at }

GET    /api/fe/facturas                 ?estado=autorizada&cliente_id=…
POST   /api/fe/facturas                 { receptor_ruc, receptor_nombre, lineas[] }
GET    /api/fe/facturas/:id             devuelve cabecera + líneas + eventos
PUT    /api/fe/facturas/:id             editar borrador
POST   /api/fe/facturas/:id/transmitir  → firma + envía al PAC → CUFE
POST   /api/fe/facturas/:id/anular      { motivo }
GET    /api/fe/facturas/:id/pdf         redirect a pdf_url
GET    /api/fe/facturas/:id/xml         redirect a xml_url
```

### `/api/ai` — Asistente

```
POST  /api/ai/chat                     { mensaje, conversacion_id?, modelo? }
GET   /api/ai/conversaciones
GET   /api/ai/conversaciones/:id        + todos sus mensajes
PATCH /api/ai/conversaciones/:id        { titulo?, pinned? }
DELETE /api/ai/conversaciones/:id
GET   /api/ai/usage                     ?periodo=YYYY-MM
```

### `/api/billing` — Suscripciones

```
GET   /api/billing/planes               público
GET   /api/billing/suscripcion
POST  /api/billing/suscripcion          { plan_id, ciclo? }  → activa trial 14d
POST  /api/billing/suscripcion/cambiar  { plan_id }          upgrade/downgrade
POST  /api/billing/suscripcion/cancelar { al_final?: true }
GET   /api/billing/metodos
POST  /api/billing/metodos              { tipo: yappy|card|ach, token, ... }
DELETE /api/billing/metodos/:id
GET   /api/billing/pagos
POST  /api/billing/webhook/:proveedor   sin auth · callbacks PSP
```

### `/api/portal` — Portal del cliente (dos zonas)

**Zona CPA** (JWT contador):
```
POST   /api/portal/accesos              invitar cliente
GET    /api/portal/accesos
DELETE /api/portal/accesos/:id
```

**Zona cliente final** (JWT portal):
```
POST  /api/portal/auth/aceptar         { token, password }  ← canjear invite
POST  /api/portal/auth/login           { email, password }
GET   /api/portal/me
GET   /api/portal/dashboard
GET   /api/portal/reportes
GET   /api/portal/mensajes
POST  /api/portal/mensajes
POST  /api/portal/recibos              cliente sube recibo → cola OCR del CPA
```

---

## Conectar al prototipo

En `Prototipo ContaPanamá v3.html`, las screens **OCR**, **FE**, **IA**, **Portal** y **Billing** estaban marcadas como demo-only porque los endpoints no existían. Ahora sí existen.

Para conectarlas, edita el screen correspondiente en `proto/screen-*.jsx` y reemplaza la mock data por:

```js
const queue = window.useApiQuery(
  () => api.get(`/ocr/recibos?estado=revisar`),
  [isLive],
  { enabled: isLive, fallback: { data: MOCK_RECEIPTS } }
);
```

Es el mismo patrón que usaste para Dashboard / Diario / Clientes en la fase anterior — ya tienes plantilla.

---

## Producción: pasar de mock a real

| Servicio | Proveedor recomendado | Costo aprox | Tiempo de integración |
|---|---|---|---|
| **OCR** | **Mindee** Receipts API | ~$0.10/doc | 1 hora (ya está el adapter, solo agregar API key) |
| **FE Panamá** | **FacturaPanamá PAC** | $50-150/mes + $0.05-0.20/FE | 2-3 días (testing + cert digital) |
| **IA** | **Anthropic Claude Haiku** | ~$0.005/conversación | 5 min (API key + cambio de variable) |
| **Pagos** | **Stripe** internacional + **Yappy** local | 2.9-3.5% + fijo | 2 días Stripe, 1 semana Yappy |
| **Email** | **Resend** o **Postmark** | $20/mes | 30 min |
| **Storage** | **DigitalOcean Spaces** o **S3** | $5/mes hasta 250GB | 1 hora |

**Ruta crítica para vender:**
1. Mindee OCR (1h)
2. Anthropic AI (5m)
3. Stripe billing + webhook (2 días)
4. FE Panamá certificación con un PAC (2-4 semanas — el más largo, empezar ya)

---

## Seguridad: lo que falta agregar

Este paquete cubre el contrato de datos y la lógica. Para producción, todavía necesitas:

- [ ] **Encriptación de credenciales** — `fe_certificados.password_enc` debe estar cifrado at-rest (usa `pgcrypto` con `PGP_SYM_ENCRYPT(secret, key_from_env)`)
- [ ] **Validación de firma de webhooks** Stripe/Yappy en `/api/billing/webhook/:proveedor`
- [ ] **Rate limiting** por usuario en `/api/ai/chat` (recomendado: 60 req/hr en plan Solo, 600 en Firma)
- [ ] **2FA** — el campo `usuario_2fa` ya existe; solo falta crear `/api/auth/2fa/setup` y `/2fa/verify`
- [ ] **CSP headers** en respuestas que sirven contenido subido (recibos OCR)
- [ ] **Backup automático** — `pg_dump` diario a Spaces/S3 con `pg_dump --format=custom`
- [ ] **Rotación de logs** — los `audit_log` y `ai_mensajes` crecen rápido, particionar por mes

---

## Convenciones que respeté

- Mismo estilo de tu código actual: `express.Router`, `validate` middleware con `express-validator`, `query` desde `db/index.js`, `authMiddleware`, errores con `try/catch + 500`.
- IDs UUID con `uuid_generate_v4()` como el resto del schema.
- `usuario_id` con `ON DELETE CASCADE` igual que tus tablas existentes.
- Naming: snake_case para columnas, plural para tablas (`fe_facturas`, no `factura_electronica`).
- Fechas: `TIMESTAMPTZ` para timestamps, `DATE` para fechas calendar.
- Sin breaking changes: ninguna tabla existente se modifica.

## Si encuentras un bug

El paquete es nuevo. Cualquier ajuste sobre estos archivos no rompe lo que ya tenías corriendo — todo lo nuevo está en archivos separados.
