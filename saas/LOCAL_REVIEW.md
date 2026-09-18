# LOCAL REVIEW - ContaPanama SaaS Beta 1.0

## App lista para revision

Frontend:

`http://localhost:5173/`

Backend:

`http://localhost:4000/health`

Login de revision:

- Email: `admin@contapanama.pa`
- Password: `[credencial configurada por el operador]`

## Modo usado

Como Docker y PostgreSQL no estan disponibles en esta maquina, se agrego un servidor local paralelo:

`backend/server.local.js`

Este servidor replica los endpoints principales que usa el frontend y carga datos de prueba en memoria para que la app pueda revisarse de punta a punta sin instalar base de datos.

La version PostgreSQL original queda intacta:

- `backend/server.js`
- `database/schema.sql`
- `docker-compose.yml`

## Comandos manuales

Backend local:

```powershell
cd backend
npm run start:local
```

Frontend:

```powershell
cd frontend
npm run dev
```

## Pruebas ya ejecutadas

- Health backend local: aprobado.
- Frontend Vite: responde `200 OK`.
- Login: aprobado.
- Dashboard periodo `2025-03`: aprobado.
- Clientes: aprobado.
- Crear cliente desde API: aprobado.
- Crear transaccion desde API: aprobado.
- Resumen transacciones: aprobado.
- ITBMS: aprobado.
- ISR/renta: aprobado.
- Vencimientos: aprobado.
- PDF diario: aprobado, archivo generado.
- Build frontend: aprobado.
- Sintaxis `backend/server.local.js`: aprobada.

## Alcance de esta revision

Este modo es para revision funcional del app y validacion de flujos. Para produccion o Beta con base de datos real todavia hace falta instalar/levantar PostgreSQL y ejecutar `database/schema.sql`.
