# 🏪 Kiosco App — Sistema de Gestión

Stack: **React + Vite + Tailwind CSS** (frontend) · **Node.js + Express + Prisma + PostgreSQL** (backend)  
Deploy target: **Hostinger KVN2 VPS** con Nginx + PM2

---

## Estructura del proyecto

```
kiosco-app/
├── backend/          → API REST (Node/Express/Prisma)
├── frontend/         → SPA React (Vite + Tailwind)
├── nginx.conf        → Configuración Nginx para VPS
└── deploy.sh         → Script de despliegue automático
```

---

## Setup local (desarrollo)

### Requisitos previos
- Node.js ≥ 20
- PostgreSQL 15+
- npm ≥ 10

### 1. Clonar y configurar variables

```bash
git clone <repo> kiosco-app && cd kiosco-app

# Backend
cp backend/.env.example backend/.env
# Editar backend/.env con tu configuración local

# Frontend
cp frontend/.env.example frontend/.env
```

### 2. Instalar dependencias

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Base de datos

```bash
cd backend
npx prisma migrate dev --name init
npx prisma db seed          # Carga datos de ejemplo
```

### 4. Correr en desarrollo

```bash
# Terminal 1 — Backend
cd backend && npm run dev    # :3001

# Terminal 2 — Frontend
cd frontend && npm run dev   # :5173
```

---

## Deploy en Hostinger KVN2

### 1. Servidor inicial (una sola vez)

```bash
# Conectarse por SSH
ssh root@<TU_IP_VPS>

# Instalar Node, PM2, Nginx, PostgreSQL
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx postgresql postgresql-contrib
npm install -g pm2

# Crear usuario y base de datos Postgres
sudo -u postgres psql -c "CREATE USER kiosco WITH PASSWORD 'CAMBIA_ESTO';"
sudo -u postgres psql -c "CREATE DATABASE kiosco_db OWNER kiosco;"
```

### 2. Subir el proyecto

```bash
# Desde tu máquina local
scp -r kiosco-app root@<TU_IP_VPS>:/var/www/

# O usar git en el servidor
cd /var/www && git clone <repo> kiosco-app
```

### 3. Configurar variables de entorno en el servidor

```bash
nano /var/www/kiosco-app/backend/.env
# Completar con los datos reales de producción
```

### 4. Build y migraciones

```bash
cd /var/www/kiosco-app/backend
npm install --production
npx prisma migrate deploy
npx prisma db seed          # Solo primera vez

cd /var/www/kiosco-app/frontend
npm install
npm run build               # Genera dist/
```

### 5. PM2 para el backend

```bash
cd /var/www/kiosco-app/backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup                  # Seguir instrucciones que imprime
```

### 6. Nginx

```bash
cp /var/www/kiosco-app/nginx.conf /etc/nginx/sites-available/kiosco
ln -s /etc/nginx/sites-available/kiosco /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7. SSL con Certbot (opcional pero recomendado)

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d tu-dominio.com
```

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