# Sistema de Distribuidora

Gestión de stock, compras, ventas y remitos.

## Estructura

- `backend/` — API REST en Node.js + Express, usa Postgres (Supabase) como base de datos.
- `frontend/` — SPA estática (`index.html`) que consume la API.
- `sistema-distribuidora.html` — versión original standalone (usaba `window.storage`, solo funciona dentro del entorno artifact de claude.ai). Reemplazada por `frontend/` + `backend/`.

## Cómo correrlo

```bash
cd backend
cp .env.example .env   # ya viene con las credenciales del proyecto Supabase "distribuidora"
npm install
npm start
```

Abrí `http://localhost:3001` — el backend sirve el frontend y expone la API en `/api/*`.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/productos` | Listar / crear producto |
| PUT/DELETE | `/api/productos/:id` | Editar / eliminar producto |
| POST | `/api/productos/:id/ajuste` | Ajuste manual de stock (alta/baja) |
| GET/POST | `/api/compras` | Listar / registrar ingreso de mercadería (suma stock) |
| DELETE | `/api/compras/:id` | Eliminar ingreso (revierte el stock sumado) |
| GET/POST | `/api/ventas` | Listar / registrar venta (descuenta stock, valida disponibilidad, genera remito opcional) |
| DELETE | `/api/ventas/:id` | Eliminar venta (revierte stock y borra su remito) |
| GET | `/api/remitos`, `/api/remitos/:id` | Listar / obtener remito |
| GET | `/api/dashboard` | KPIs del panel general |
| GET | `/api/reportes` | Totales, márgenes, top productos, ventas por mes |

La consistencia de stock en compras/ventas se garantiza con funciones `plpgsql` (`registrar_compra`, `registrar_venta`, `eliminar_compra`, `eliminar_venta`) que corren de forma atómica en la base.
