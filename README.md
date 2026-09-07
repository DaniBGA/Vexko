# 🏪 Kiosco App — Sistema de Gestión

Stack: **React + Vite + Tailwind CSS** (frontend) · **Node.js + Express + Prisma + PostgreSQL** (backend)  
Deploy target: **Hostinger KVN2 VPS** con Nginx + PM2

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
└── docs/                         → Documentación de la app (ver docs/README.md)
```

---

## Setup local (desarrollo)

### Requisitos previos
- Node.js ≥ 20
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
npx prisma db seed          # Carga datos de ejemplo
```

### 4. Correr en desarrollo

```bash
# Terminal 1 — Backend
cd app/backend && npm run dev    # :3001

# Terminal 2 — Frontend
cd app/frontend && npm run dev   # :5173
```

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

Toda la documentación de la app (estructura de datos, multi-negocio, deploy,
pendientes para futuras releases) vive en **[docs/](docs/README.md)**.

---

## Módulos de la aplicación

| Pantalla | Ruta frontend | Endpoint API |
|---|---|---|
| Nueva venta | `/venta` | `POST /api/sales` |
| Historial | `/historial` | `GET /api/sales` |
| Stock | `/stock` | `GET /api/products` |
| Producto ABM | `/stock/producto/:id` | `GET/PUT/DELETE /api/products/:id` |
| Lista de precios | `/precios` | `GET /api/products/prices` |
| Flujo de caja | `/caja-flujo` | `GET /api/cashflow` |
| Proveedores | `/proveedores` | `GET /api/suppliers` |
| Detalle proveedor | `/proveedores/:id` | `GET /api/suppliers/:id` |
| Facturación AFIP | `/afip` | `GET/POST /api/invoices` |
| Resultados del mes | `/resultados` | `GET /api/reports/monthly` |
| Caja / Arqueo | `/caja` | `GET/POST /api/cash-registers` |
| Clientes | `/clientes` | `GET /api/clients` |
| Perfil cliente | `/clientes/:id` | `GET /api/clients/:id` |