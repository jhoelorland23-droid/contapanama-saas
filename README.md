# ContaPanamá SaaS v2.0
Sistema contable profesional para CPA en Panamá.
**Stack:** Node.js + Express · PostgreSQL · React + Vite · JWT · PDFKit

---

## Estructura
```
contapanama/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── db/
│   │   ├── index.js          # Pool PostgreSQL
│   │   └── seed.js           # Datos de prueba
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   ├── routes/
│   │   ├── auth.js           # Login / registro
│   │   ├── clientes.js       # CRUD clientes
│   │   ├── transacciones.js  # Diario contable
│   │   ├── fiscal.js         # ITBMS / ISR / conciliación
│   │   ├── reportes.js       # PDFs reales
│   │   └── vencimientos.js   # Alertas
│   └── services/
│       └── pdfService.js     # Generación PDFs con pdfkit
├── frontend/
│   ├── src/App.jsx           # Toda la UI (sin datos mock)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── database/
│   └── schema.sql            # Tablas + triggers + índices
├── docker-compose.yml
└── README.md
```

---

## Instalación paso a paso

### Requisito previo
- **Node.js** v18+ → https://nodejs.org
- **Docker Desktop** → https://docker.com (para PostgreSQL sin instalar nada)

---

### Paso 1 — Clonar / descomprimir el proyecto
```bash
unzip contapanama-saas.zip
cd contapanama
```

---

### Paso 2 — Levantar PostgreSQL con Docker
```bash
docker-compose up -d
```
Esto arranca PostgreSQL en `localhost:5432` y crea la base de datos `contapanama` con todas las tablas automáticamente.

Verifica que esté corriendo:
```bash
docker-compose ps
# postgres    healthy
```

pgAdmin disponible en http://localhost:5050
- Email: `admin@contapanama.pa`
- Password: `admin123`
- Servidor: host=`postgres`, puerto=`5432`, db=`contapanama`, user=`postgres`, pass=`postgres`

---

### Paso 3 — Configurar el backend
```bash
cd backend
cp .env.example .env
npm install
```

El `.env` por defecto ya apunta a Docker. Si usas PostgreSQL local, edita `DATABASE_URL`.

Generar JWT_SECRET seguro (opcional pero recomendado):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copia el resultado en JWT_SECRET del .env
```

---

### Paso 4 — Cargar datos de prueba
```bash
npm run db:seed
```
Crea: usuario admin + 5 clientes + 10 transacciones + vencimientos.

```
✓ Usuario admin: admin@contapanama.pa  password: Admin123!
✓ Cliente: Constructora Istmo S.A.
✓ Cliente: Carlos Méndez Palacios
...
✅ Seed completado!
```

---

### Paso 5 — Iniciar el backend
```bash
npm run dev
# 🚀 ContaPanamá API corriendo en http://localhost:4000
```

Prueba que funciona:
```bash
curl http://localhost:4000/health
# {"status":"ok","db":"contapanama"}
```

---

### Paso 6 — Iniciar el frontend
```bash
# En otra terminal
cd frontend
npm install
npm run dev
# http://localhost:5173
```

---

### Login
- URL: http://localhost:5173
- Email: `admin@contapanama.pa`
- Password: `Admin123!`

---

## API REST — Endpoints completos

### Autenticación
```
POST /api/auth/register     { nombre, email, password }
POST /api/auth/login        { email, password } → { token, user }
GET  /api/auth/me           Header: Authorization: Bearer <token>
PUT  /api/auth/password     { currentPassword, newPassword }
```

### Clientes
```
GET    /api/clientes              ?search=X&estado=activo&tipo=jurídica
GET    /api/clientes/stats
GET    /api/clientes/:id
POST   /api/clientes              { nombre, ruc, nit, tipo, actividad, estado }
PUT    /api/clientes/:id
DELETE /api/clientes/:id
```

### Transacciones
```
GET    /api/transacciones         ?periodo=2025-03&tipo=ingreso&desde=&hasta=&search=
GET    /api/transacciones/resumen ?periodo=2025-03
GET    /api/transacciones/diario  ?periodo=2025-03
GET    /api/transacciones/evolucion ?anio=2025
GET    /api/transacciones/:id
POST   /api/transacciones         { fecha, descripcion, tipo, monto, cliente_id, ... }
PUT    /api/transacciones/:id
DELETE /api/transacciones/:id
```

### Fiscal
```
GET /api/fiscal/itbms         ?periodo=2025-03&cliente_id=UUID
GET /api/fiscal/renta         ?anio=2025&cliente_id=UUID
GET /api/fiscal/conciliacion  ?periodo=2025-03
GET /api/fiscal/calendario    ?anio=2025
```

### Reportes PDF
```
GET /api/reportes/diario              ?periodo=2025-03  → descarga PDF
GET /api/reportes/estado-resultados   ?periodo=2025-03  → descarga PDF
GET /api/reportes/itbms               ?periodo=2025-03  → descarga PDF
GET /api/reportes/cliente/:id         ?periodo=2025-03  → descarga PDF
```

### Dashboard y Alertas
```
GET    /api/dashboard             ?periodo=2025-03
GET    /api/vencimientos
POST   /api/vencimientos          { descripcion, entidad, fecha, urgencia }
PATCH  /api/vencimientos/:id/completar
DELETE /api/vencimientos/:id
```

---

## Probar endpoints manualmente

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contapanama.pa","password":"Admin123!"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Listar clientes
curl http://localhost:4000/api/clientes \
  -H "Authorization: Bearer $TOKEN" | jq .

# 3. Crear transacción
curl -X POST http://localhost:4000/api/transacciones \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fecha":"2025-03-15","descripcion":"Honorarios","tipo":"ingreso","monto":1500}'

# 4. Calcular ITBMS del mes
curl "http://localhost:4000/api/fiscal/itbms?periodo=2025-03" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Descargar PDF diario
curl "http://localhost:4000/api/reportes/diario?periodo=2025-03" \
  -H "Authorization: Bearer $TOKEN" \
  -o diario-marzo-2025.pdf
```

---

## Sin Docker (PostgreSQL nativo)

```bash
# Crear base de datos
createdb contapanama

# Aplicar schema
psql -d contapanama -f database/schema.sql

# Ajustar .env
DATABASE_URL=postgresql://TU_USUARIO:TU_PASSWORD@localhost:5432/contapanama
```

---

## Deploy producción

### Backend → Railway
```bash
cd backend
railway login && railway init && railway up
# Agregar variable: DATABASE_URL (Railway crea PostgreSQL automático)
```

### Frontend → Vercel
```bash
cd frontend
vercel deploy
# Variable de entorno: VITE_API_URL=https://tu-backend.railway.app
```

---

## Variables de entorno

**backend/.env**
```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contapanama
JWT_SECRET=<64 bytes aleatorios>
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
BCRYPT_ROUNDS=10
```

**frontend/.env** (vacío en desarrollo, vite proxy maneja /api)
```
VITE_API_URL=
```

---

## Funcionalidades implementadas

| Módulo | Estado |
|--------|--------|
| Autenticación JWT + bcrypt | ✅ |
| Registro / Login / Roles | ✅ |
| CRUD Clientes (multiusuario) | ✅ |
| Diario Contable con filtros | ✅ |
| Cálculo ITBMS automático 7% | ✅ |
| ISR persona natural vs jurídica | ✅ |
| Calendario obligaciones DGI/CSS | ✅ |
| Conciliación bancaria básica | ✅ |
| PDF Diario Combinado | ✅ |
| PDF Estado de Resultados | ✅ |
| PDF Declaración ITBMS 430 | ✅ |
| PDF Reporte por Cliente | ✅ |
| Dashboard con gráfica mensual | ✅ |
| Alertas de vencimiento | ✅ |
| Búsqueda avanzada + filtros fecha | ✅ |
| PostgreSQL con triggers/índices | ✅ |
| Docker Compose | ✅ |
