# 🏪 Kiosco App — Sistema de Gestión

Stack: **React + Vite + Tailwind CSS** (frontend) · **Node.js + Express + Prisma + PostgreSQL** (backend)  
Deploy target: **Hostinger KVM2 VPS** con Nginx + PM2

Sistema de gestión multi-negocio para kioscos (Vexko, de Grupo Vexus): ventas, stock,
caja, proveedores, facturación, reportes y clientes con puntos y fiado. Cada negocio
contrata un plan (BASE / INTERMEDIO / PREMIUM) que habilita distintos módulos.

---

## Estructura del proyecto

```
kiosco-app/
├── app/
│   ├── backend/                  → API REST (Node/Express/Prisma)
│   │   └── ecosystem.config.cjs  → Config de PM2 (producción)
│   └── frontend/                 → SPA React (Vite + Tailwind)
├── nginx.conf                    → Configuración Nginx para el VPS
├── deploy.sh                     → Script de despliegue (backup, build, PM2, health check)
├── .github/workflows/deploy.yml  → Auto-deploy al pushear a main
├── CLAUDE.md                     → Contexto de trabajo + registro de cambios de cada actualización
└── docs/                         → Documentación de la app (ver docs/README.md)
```

---

## Setup local (desarrollo)

### Requisitos previos
- Node.js **24 LTS** (≥ 24.22.1; también sirven 22.23.4+ o 26.12.1+). Node 20 está fuera de soporte. Versión en `.nvmrc`
- PostgreSQL 15+
- npm ≥ 10

### 1. Clonar y configurar variables

```bash
git clone https://github.com/DaniBGA/Vexko.git kiosco-app && cd kiosco-app

# Backend
cp app/backend/.env.example app/backend/.env
# Editar app/backend/.env con tu configuración local (necesita un Postgres corriendo)

# Frontend
cp app/frontend/.env.example app/frontend/.env
```

### 2. Instalar dependencias

```bash
cd app/backend && npm install
cd ../frontend && npm install
```

### 3. Base de datos

```bash
cd app/backend
npx prisma migrate dev
npx prisma db seed          # Carga datos de ejemplo + cuentas demo (ver abajo)
npm run db:seed:catalog     # Opcional: carga el catálogo global de productos (prisma/catalog-products.json)
```

Cuentas demo que crea el seed para entrar en `/login`, una por plan (cada una con su
propio cliente y sucursal, vacíos):

| Plan | Email | Password |
|---|---|---|
| BASE | `base@kiosco.com` | `base123` |
| INTERMEDIO | `intermedio@kiosco.com` | `intermedio123` |
| PREMIUM | `premium@kiosco.com` | `premium123` |

Los datos de ejemplo (productos, proveedores, clientes, regla de puntos) quedan en el
cliente "Kiosco Demo" / "Sucursal Centro", que **no** tiene cuenta de login: si querés
usarla, creale una desde `/admin`.

### 4. Correr en desarrollo

```bash
# Terminal 1 — Backend
cd app/backend && npm run dev    # :3001

# Terminal 2 — Frontend
cd app/frontend && npm run dev   # :5173
```

---

## Acceso admin (`/admin`)

Credencial de la cuenta OWNER que carga el seed (`app/backend/seed.js`), para
entrar en `/admin/login`:

```
Email:     admin@kiosco.com
Password:  kiosco123
```

⚠️ Es la credencial de **desarrollo**. En producción el seed de demo no corre
(se niega con `NODE_ENV=production`) y el admin se crea con una clave propia:
`ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create` (ver `docs/GUIA_DEPLOY.md`, paso 1.6).

---

## Deploy en Hostinger KVM2

Guía completa (setup inicial del VPS paso a paso + cómo queda armado el
auto-deploy con GitHub Actions + backups + rollback): **[docs/GUIA_DEPLOY.md](docs/GUIA_DEPLOY.md)**.

Resumen: una vez hecho el setup inicial, cada `git push origin main` deploya
solo — el workflow `.github/workflows/deploy.yml` se conecta por SSH al VPS
y corre `deploy.sh`, que hace backup de la base, instala dependencias, migra,
compila el frontend, reinicia el backend con PM2 (2 instancias en cluster,
aprovechando los 2 vCPU del KVM2) y verifica que haya quedado arriba antes de
darse por terminado.

---

## Documentación

Toda la documentación de la app (estructura de datos, multi-negocio, API,
features, deploy, pendientes para futuras releases) vive en **[docs/](docs/README.md)**.
El contexto de trabajo y el historial de cambios están en **[CLAUDE.md](CLAUDE.md)**.

---

## Módulos de la aplicación

| Pantalla | Ruta frontend | Plan mínimo | Endpoint API principal |
|---|---|---|---|
| Nueva venta | `/venta` | BASE | `POST /api/sales` |
| Stock | `/stock` | BASE | `GET /api/products` |
| Catálogo global | `/catalogo` | BASE | `GET /api/products`, `POST /api/products/:id/clone-to-kiosk` |
| Producto nuevo / ABM | `/stock/nuevo`, `/stock/producto/:id` | BASE | `POST /api/products`, `GET/PUT/DELETE /api/products/:id` |
| Lista de precios | `/precios` | BASE | `GET /api/products/prices` |
| Caja / Arqueo | `/caja` | BASE (fiado: PREMIUM) | `/api/cash-registers`, `/api/employees` |
| Historial | `/historial` | INTERMEDIO | `GET /api/sales` |
| Flujo de caja | `/caja-flujo` | INTERMEDIO | `/api/cashflow` |
| Proveedores | `/proveedores` | INTERMEDIO | `GET /api/suppliers` |
| Detalle proveedor / pedidos | `/proveedores/:id` | INTERMEDIO | `/api/suppliers/:id`, `/api/suppliers/:id/orders` |
| Facturación AFIP | `/afip` | INTERMEDIO | `GET/POST /api/invoices` |
| Resultados del mes | `/resultados` | INTERMEDIO | `GET /api/reports/monthly` |
| Clientes / puntos | `/clientes` | PREMIUM | `GET /api/clients`, `/api/clients/loyalty/rules` |
| Perfil cliente (cupones, fiado) | `/clientes/:id` | PREMIUM | `GET /api/clients/:id`, `/redeem`, `/debts` |
| Panel Grupo Vexus | `/admin` | rol OWNER | `/api/admin/*` |

Lista completa de endpoints: [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md).