# CLAUDE.md — Vexko (Kiosco App)

Contexto de trabajo del proyecto y **registro de cambios** de cada actualización.
Se lee al empezar cada sesión. Mantenerlo al día es parte de cada cambio (ver
"Cómo mantener este archivo" al final).

---

## Qué es

Sistema de gestión **multi-negocio** para kioscos, de Grupo Vexus. Cada negocio
(`Customer`) contrata un **plan** y tiene una o más sucursales (`Kiosk`). Cada
sucursal tiene **una** cuenta de login y opera ventas, stock, caja, proveedores,
facturación, reportes y clientes con puntos y fiado.

- Repo: `github.com/DaniBGA/Vexko` — rama de trabajo `develop`, producción `main`
  (cada push a `main` deploya solo al VPS).
- Idioma: **todo en español rioplatense** (UI, mensajes de error de la API, comentarios,
  docs, commits). Montos en pesos argentinos, zona horaria UTC-3.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3, React Router 6, TanStack Query 5, Zustand, axios, react-hot-toast, lucide-react, recharts, jsPDF, JsBarcode |
| Backend | Node 24 LTS (≥ 24.22.1, ver `.nvmrc`), Express 4 (ESM, `"type": "module"`), Prisma 5, JWT + bcryptjs, helmet, express-rate-limit |
| Base | PostgreSQL 15+ (migrado desde SQLite en ago-2026) |
| Deploy | Hostinger KVM2 + Nginx + PM2 (cluster x2) + GitHub Actions → `deploy.sh` |

## Comandos

```bash
# Backend (app/backend) — :3001
npm run dev                 # nodemon
npm run db:migrate          # prisma migrate dev (crea migración nueva)
npm run db:seed             # datos demo + cuentas por plan
npm run db:seed:catalog     # catálogo global (prisma/catalog-products.json)
npm run db:studio

# Frontend (app/frontend) — :5173
npm run dev
npm run build
```

No hay tests automatizados. Verificar a mano en el navegador.

Cuentas de desarrollo (seed): admin `admin@kiosco.com` / `kiosco123` (en `/admin/login`);
sucursales `base@` / `intermedio@` / `premium@kiosco.com` con password `base123` /
`intermedio123` / `premium123` (en `/login`).

## Mapa del código

```
app/backend/
  index.js                 → monta middlewares y routers en /api/*
  middleware/auth.js       → requireAuth (incluye el bloqueo por suscripción), requireOwner, resolveRequestKiosk
  lib/subscription.js      → reglas y fechas de la suscripción mensual (estado ACTIVE/WARNING/BLOCKED/EXEMPT)
  lib/settings.js          → configuración global (AppSettings): WhatsApp de contacto y precios de planes
  routes/<dominio>.js      → un router por dominio (products, sales, clients, cashRegister, ...)
  routes/public.js         → rutas SIN login (/api/public/settings)
  prisma/schema.prisma     → 24 modelos
  prisma/migrations/       → migraciones SQL (revisarlas antes de deployar)
  seed.js, prisma/seed-global-catalog.js (solo desarrollo / catálogo)
  scripts/create-admin.js  → crea el admin de producción (npm run admin:create)
app/frontend/src/
  App.jsx                  → rutas + PlanRoute (gating por plan)
  components/layout/AppLayout.jsx → sidebar (también filtra por plan) + topbar
  components/screens/*Page.jsx    → una pantalla por ruta
  components/ui/Logo.jsx   → logo de la marca (cambiar el logo = cambiar este import)
  components/ui/index.jsx  → PageHeader, Spinner, Badge, EmptyState, Input, fmt()
  components/admin/SubscriptionPanel.jsx        → gestión de pagos en el panel admin
  components/admin/SettingsPanel.jsx            → pestaña "Configuración" (WhatsApp y precios)
  components/subscription/SubscriptionNotices.jsx → pop-up de vencimiento + pantalla de bloqueo (con WhatsApp)
  lib/api.js (axios), lib/hooks.js (useDebouncedValue), lib/pdf.js, lib/barcodeLabels.js, lib/subscription.js,
  lib/publicSettings.js (usePublicSettings: precios y WhatsApp, con fetch sin toasts)
  store/authStore.js, store/adminAuthStore.js (zustand)
  styles/*.css             → theme / base / layout / components / auth / landing / dark (modo oscuro)
  lib/theme.js             → useAppTheme(): modo claro/oscuro (clase `dark` en <html> mientras AppLayout está montado)
docs/                      → documentación (índice en docs/README.md)
```

## Documentación (leer según la tarea)

| Doc | Cuándo |
|---|---|
| [docs/DATABASE_STRUCTURE.md](docs/DATABASE_STRUCTURE.md) | Cualquier cambio de schema o de datos |
| [docs/MULTIBUSINESS.md](docs/MULTIBUSINESS.md) | Aislamiento por tenant, catálogo global/propio, planes, roles |
| [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) | Agregar o modificar endpoints |
| [docs/CLIENTES_FIADO_PUNTOS.md](docs/CLIENTES_FIADO_PUNTOS.md) | Clientes, puntos, cupones, fiado |
| [docs/SUSCRIPCIONES.md](docs/SUSCRIPCIONES.md) | Suscripción mensual a VEXKO: vencimiento, gracia, bloqueo, pagos en el panel admin |
| [docs/GUIA_DEPLOY.md](docs/GUIA_DEPLOY.md) | Deploy, migraciones en prod, rollback |
| [docs/MODO_OSCURO.md](docs/MODO_OSCURO.md) | Cualquier pantalla o color nuevo (para que se vea bien en oscuro) |

## Reglas y convenciones (no romper)

**Multi-tenant**
- El kiosco **siempre** sale de `resolveRequestKiosk(req)` (usuario logueado), nunca del body/URL.
- Para leer un registro puntual: `findFirst({ where: { id, kioskId } })`, no `findUnique({ where: { id } })`.
- El catálogo global (`customerId: null`) es compartido: **nunca** modificarlo desde la acción de una sucursal.
  Editar campos compartidos de un global → se clona como propio (`PUT /products/:id`).
  Lo que es por sucursal (stock, precio, costo) va en `KioskProduct`.
- Precio/costo efectivo: `KioskProduct.price ?? Product.salePrice`, `KioskProduct.cost ?? Product.costPrice`.
- Si agregás un modelo colgado de `Kiosk` sin `onDelete: Cascade`, sumalo al borrado manual de
  `DELETE /api/admin/kiosks/:id` y `DELETE /api/admin/customers/:id`.

**Planes** — `BASE (0) < INTERMEDIO (1) < PREMIUM (2)`, en `Customer.plan`.
- Rutas: `<PlanRoute minPlan={n}>` en `App.jsx`. Sidebar: `AppLayout.jsx`. Bloques dentro de una
  pantalla: `user.kiosk.customer.plan === 'PREMIUM'`. Mantener los tres en sincronía.
- El backend **solo** valida plan en etiquetas de código de barras (`requirePremiumKiosk`).

**Suscripción** — reglas en `backend/lib/subscription.js`, nunca duplicarlas en el front.
- El front solo lee `user.kiosk.customer.subscription` (calculado en login y `/auth/me`).
- El bloqueo lo hace `requireAuth`: 402 `SUBSCRIPTION_BLOCKED` en todo salvo `/api/auth/*`. Una
  ruta nueva de sucursal queda bloqueada sola si usa `requireAuth`.
- Si agregás un `select` de `customer` usado por `requireAuth`/login, incluí `...SUBSCRIPTION_SELECT`.
- Fechas de suscripción por día de Argentina (UTC-3): usar `parseArDate` / `formatArDate`, no `new Date('YYYY-MM-DD')`.
- Precios de planes y WhatsApp viven en `AppSettings` (panel admin → Configuración). **No** hardcodear
  precios en la landing ni el número en las pantallas: leerlos con `usePublicSettings()`.
- `/api/public/*` no tiene login: no exponer ahí nada que no se pueda mostrar a cualquiera.

**Backend**
- Errores para el usuario: `res.status(4xx).json({ error: 'mensaje en español' })`; lo inesperado va a `next(err)`.
- Operaciones con varias escrituras (venta, stock, pagos) → `prisma.$transaction`.
- **Cambios de estado/saldo condicionados** con `updateMany` + condición en el `where`, verificando
  `count`: stock (`stock: { gte: qty }`), pedido recibido (`status: { not: 'RECEIVED' }`), cupón
  (`status: 'PENDING'`), puntos (`points: { gte }`), pagos de fiado (`paidAmount` actual). Un chequeo
  previo afuera de la transacción no alcanza: con doble clic o ventas simultáneas pasan los dos.
- Errores de validación tirados desde adentro de una transacción: `Object.assign(new Error(msg), { statusCode: 400 })`.
- Venta: en `CASH`/`TRANSFER`/`CARD` el monto del medio es **siempre** el total (solo `MIXED` usa
  los parciales). Cada `SaleItem` guarda `unitPrice` y `unitCost` del momento; los reportes usan
  `unitCost`, nunca el costo actual del producto.
- El stock de un producto solo se deriva de `packUnits × packCount` en el **alta**; al editar se
  manda (y se pisa) solo si el usuario lo cambió.
- Búsquedas de texto: `contains` + `mode: 'insensitive'` (Postgres distingue mayúsculas).
- Evitar N+1: traer en una query y agrupar en memoria (patrón ya usado en clientes y caja).
- Montos `Float`; redondear con `Math.round(x * 100) / 100`.
- Arqueo de caja: solo restan los gastos con `paidFromCash: true` (`getRegisterSummary` y
  `getRegisterSummariesBatch` en `routes/cashRegister.js`). Un gasto que crea la API (p. ej. un
  pedido en efectivo) tiene que decidir explícitamente si sale de la caja.
- No hay borrado automático de datos: no volver a agregar "limpiezas" sin una decisión de producto.
- Fechas `YYYY-MM-DD` del input → no usar `new Date(str)` (cae en UTC y corre un día); ver `resolveExpenseDate` en `routes/cashflow.js`.
- Comentarios: explican el **por qué** y suelen contar qué estaba mal antes ("Antes esto...").
  Mantener ese estilo.

**Frontend**
- Datos con TanStack Query (`useQuery`/`useMutation` + `invalidateQueries` de las keys afectadas:
  `sales`, `cash-register-current`, `cash-register-history`, `reports`, `clients`, ...).
  Todo lo que mueve stock invalida también `products`, `products-search` y `product` (si no, el
  stock se ve viejo hasta 30 s por el `staleTime`).
- Modo pack "efectivo" = `loadMode === 'pack'` **y** `packPrice`/`packUnits` cargados (gran parte del
  catálogo global tiene `loadMode: 'pack'` sin datos de pack).
- Llamadas con `api` de `lib/api.js`. Feedback con `toast.success/error`.
- Búsquedas con `useDebouncedValue(term, 300)`.
- UI con `PageHeader`, `EmptyState`, `Spinner`, `fmt()` y las clases `card`, `field-label`,
  `field-input`, `btn-primary`, `btn-outline`.
- Los PDFs y las etiquetas (`lib/pdf.js`, `lib/barcodeLabels.js`) son siempre blanco y negro.
- **Modo oscuro**: una clase de color de Tailwind nueva en la app → sumar su versión oscura en
  `styles/dark.css`. Colores inline → variables de `theme.css` (`var(--navy-text)`...), nunca hex
  fijos. Ver [docs/MODO_OSCURO.md](docs/MODO_OSCURO.md).
- Logo sobre fondo oscuro → `<Logo onDark />`.
- **Celular** (≤ 768 px la sidebar pasa a menú ☰): layouts de dos columnas con `flex-col lg:flex-row`
  (ver `SalePage`), y nunca anchos fijos sin breakpoint. `PageHeader` ya baja de línea. Ojo:
  `.field-input` (auth.css) trae `w-full` y le gana a `w-40`: usar `sm:!w-40`.

**Producción**
- Nunca `prisma db seed` en el VPS (crea admin y sucursales con contraseñas del README; se niega
  con `NODE_ENV=production`). Admin: `npm run admin:create`. Catálogo: `npm run db:seed:catalog`.
- **Node con parches**: producción usa Node 24 LTS. `deploy.sh` corta si el Node no tiene los
  parches (`scripts/check-node.js`). Con cada security release de Node, actualizar
  `PATCHED_MINIMUM` en ese script, `engines` en los dos `package.json` y `.nvmrc`.
- El backend escucha en `127.0.0.1` en producción y tiene `trust proxy` = 1 (Nginx adelante):
  no cambiar uno sin el otro, o el rate limit vuelve a ser un cupo global o se puede esquivar.

**Migraciones**
- Toda migración que agregue `NOT NULL` sin default o renombre columnas con datos tiene que
  documentar en [GUIA_DEPLOY.md](docs/GUIA_DEPLOY.md) qué revisar en producción.

## Estado actual (25-oct-2026)

- Rama `develop`. Todo el trabajo hasta el 25-oct quedó commiteado ("Cambios importantes",
  2026-11-20). El 20-nov se unió con el `develop` de GitHub (merge `-s ours`, ver registro).
- **GitHub está desactualizado**: `origin/develop` y `origin/main` tienen la versión de junio-2026
  (SQLite). Falta `git push origin develop` desde una máquina con credenciales.
- **No hay constancia de que las 7 migraciones posteriores a `init_postgres` estén en producción.**
  La de suscripciones requiere una acción manual después del deploy, y hay que cargar el WhatsApp
  y los precios en Configuración (ver GUIA_DEPLOY).
- `kiosco_dev` local tiene todas las migraciones aplicadas.
- Verificación del 25-oct: 103 pruebas de punta a punta contra la API (16 de configuración + 24 de
  suscripción + 63 de regresión), todas OK. Además, recorrido en Chromium headless con datos
  (base temporal, ya borrada) de todas las pantallas y modales de la sucursal en claro, oscuro y
  celular (390 px), del panel admin (configuración, suscripción, registrar pago), la landing con
  precios, el aviso de vencimiento y la pantalla de bloqueo con "Ya pagué". Los scripts quedaron
  fuera del repo (no hay tests automatizados).

### Pendientes / deuda técnica conocida

- [ ] **Fiado sin impacto en caja**: cobrar un fiado no suma al efectivo esperado del arqueo ni
      genera `CashFlow`; dejar un fiado no descuenta stock ni crea venta. Definir el comportamiento.
- [x] ~~Borrado automático a los 2 meses~~ → sacado 2026-10-25: el historial es completo (vigilar el disco).
- [x] ~~Gastos sin medio de pago → arqueo mal~~ → resuelto 2026-10-25 (`CashFlow.paidFromCash`).
- [ ] **Plan no validado en backend** para clientes, fiado, proveedores, reportes, AFIP, historial.
- [x] ~~`Supplier.name` único global~~ → resuelto 2026-10-24 (`@@unique([kioskId, name])`).
- [ ] Migraciones de sep-2026: revisar `LoyaltyRule` y `PointRedemption` en prod antes de deployar
      (ver GUIA_DEPLOY). Desde el 24-oct el descuento se acota a 100 %, pero una regla vieja de
      "$500" igual quedaría como cupón del 100 %.
- [ ] Un producto global clonado como propio pierde su código de barras/SKU (son únicos en toda la
      base y la copia no puede repetirlos): si ya se habían impreso etiquetas, el escáner encuentra
      el global y no el propio.
- [ ] Campos legados en `Product` (`stock`, `minStock`, `salePrice`, `costPrice`) todavía se usan como fallback.
- [ ] `POST /products/:id/clone-to-kiosk` ya no clona: el nombre confunde.
- [x] ~~Modo oscuro~~ → implementado y recorrido completo 2026-10-25.
- [ ] Celular: todas las pantallas entran en 390 px y hay menú ☰, pero solo Venta se rearmó para
      pantalla angosta; el resto (tablas de Stock/Historial/pedidos) se usa deslizando la tabla.
- [x] ~~Bloqueo sin contacto ni precio por plan~~ → resuelto 2026-10-25 (WhatsApp y precios en Configuración).
- [ ] **Actualizar Node en el VPS a 24.22.1** (si se armó con la guía vieja tiene Node 20, sin
      parches del 21-oct-2026). No se pudo verificar desde acá: `ssh` + `node -v`. Ver GUIA_DEPLOY,
      "Actualizar Node en el VPS". Hasta que se actualice, `deploy.sh` no va a deployar.
- [ ] **Repo público con secretos en la historia**: los commits de junio (en `origin/main` y
      la historia de `develop`) versionan `app/backend/.env` (JWT_SECRET de desarrollo, ya cambiado
      el 20-nov) y `dev.db`. Hacer el repo privado o purgar la historia, y confirmar que el
      `JWT_SECRET` del VPS no sea el publicado.
- [ ] `main` (lo que se deploya) sigue en la versión de junio: pasar `develop` a `main` cuando se
      decida deployar (dispara el deploy, ver GUIA_DEPLOY y los pasos post-deploy).
- [ ] Suscripción: no hay pagos de varios meses por adelantado.
- [x] ~~Botones de la landing al mail~~ → van al WhatsApp de Configuración (2026-10-25). Queda:
      los mockups de la landing dicen `kioscoapp.com/app` / "KioscoApp", y sin WhatsApp cargado el
      botón vuelve a `hola@kioscoapp.com`.

---

## Registro de cambios

Más reciente arriba. Cada entrada: fecha, título, qué cambió (backend / frontend / DB),
por qué si no es obvio, y docs tocados.

### 2026-11-20 — Unión con el develop de GitHub (pull trabado)
- **Problema**: `git pull` fallaba. `origin/develop` tenía 7 commits de junio-2026 (otra máquina,
  época SQLite) que esta copia nunca bajó, y esta copia siguió desde el commit anterior (ago–nov:
  PostgreSQL y todo lo demás). Las dos historias divergían, y la de junio todavía versionaba
  `node_modules`, `dist`, `.env` y `dev.db` (18.538 archivos).
- **Solución**: `git merge -s ours origin/develop`. El código local queda idéntico (verificado: mismo
  árbol) y los commits de junio quedan en la historia sin aplicarse. Decisión: lo de junio es
  viejo y no se rescata nada (sin rama de respaldo; igual sigue accesible en la historia del merge).
- **Seguridad**: el repo es público y el `.env` de junio expone el mismo `JWT_SECRET` que se usaba en
  desarrollo. Se generó uno nuevo en `app/backend/.env` local. Los tokens de sesión viejos de
  desarrollo dejan de valer.
- Pendiente (necesita credenciales de GitHub): `git push origin develop`.

### 2026-10-25 — Node 24 LTS con parches (security release del 21-oct-2026)
- **Contexto**: el 21-oct-2026 Node publicó parches para 10 CVE (4 High), entre ellos un
  out-of-bounds write en el decoder Brotli con posible RCE (CVE-2026-111497) y bypasses de hostname
  en TLS. Versiones corregidas: 22.23.4, 24.22.1 y 26.12.1. Node 20 está fuera de soporte y no
  recibe el arreglo.
- **Estado del proyecto**
  - La guía de deploy instalaba Node 20 (`setup_20.x`) y el proyecto pedía "Node ≥ 20": un VPS
    armado con la guía queda vulnerable.
  - El entorno local usa 26.12.1, que ya está parcheado.
  - Exposición directa a la falla de Brotli: baja, porque el backend no usa `fetch`/`zlib` y
    Express 4 / body-parser 1.20 no descomprimen Brotli. Igual hay que salir de Node 20.
- **Cambios**
  - `.nvmrc` = 24.22.1 y `engines` en los dos `package.json`
    (`>=22.23.4 <23 || >=24.22.1 <25 || >=26.12.1`).
  - Nuevo `scripts/check-node.js` (`npm run check:node`): `deploy.sh` lo corre antes de tocar
    nada y corta si el Node no tiene los parches.
  - GUIA_DEPLOY: instala Node 24 y tiene una sección nueva para actualizar Node en el VPS (incluye
    `pm2 update`). README con la versión nueva.
- **Pendiente**: actualizar el VPS. No hay acceso desde acá para confirmar qué versión corre.

### 2026-10-25 — Gastos dentro/fuera de caja, historial completo, landing a WhatsApp, borrar proveedores
- **Gastos "¿Salió de la caja?"** (migración `20261025200000_cashflow_paid_from_cash`):
  `CashFlow.paidFromCash` (default `true`). En `false` (transferencia, débito…) cuenta en
  Resultados del mes, pero no se resta del efectivo esperado. Antes un alquiler pagado por
  transferencia dejaba el esperado en negativo y un sobrante falso al cerrar.
  - API: alta y edición (en la edición solo cambia si viene en el body). `GET /cashflow` suma
    `expenseFromCash` y `expenseOutsideCash` a los totales.
  - Pantalla Gastos: selector "Sí, de la caja" / "No, por fuera", columna "Salió de", totales del
    mes y columna en el PDF. Caja: "Gastos en efectivo".
  - Fixes de la misma pantalla: la categoría salía como "EXPENSE" en gastos sin descripción y en
    las compras a proveedor. "Limpiar" ponía una categoría inexistente. El botón no se
    deshabilitaba al guardar (`isLoading` no existe en mutations de TanStack 5).
- **Sin tope de 2 meses**: se sacaron `cleanupOldSales` / `cleanupOldPurchases` (borraban cada
  24 h ventas, pedidos y gastos "Compras" viejos de todas las sucursales) y el filtro de los
  listados de ventas y pedidos.
  - Historial sin el aviso. `totalRevenue` viene de la API: antes se sumaba solo la página.
  - Fecha con año si la venta es de otro año. El PDF aclara si trae solo las 500 más recientes.
- **Landing**: "Sumarme a la beta" y "Quiero sumarme" abren el WhatsApp de Configuración con el
  plan en el mensaje (si no hay número, queda el mail). El título dice "Vexko".
- **Borrar proveedores**: botón "Borrar proveedor" en el detalle, con confirmación que avisa
  cuántos pedidos se pierden. El endpoint ya existía.
- Verificado: 19 pruebas de API (arqueo con gastos dentro y fuera, edición, cierre con diferencia
  0, reportes, venta de hace 6 meses, pedido de hace 5 meses) y recorrido en el navegador (Gastos
  en claro, oscuro y celular, Historial, borrar proveedor, links de la landing). Base temporal
  borrada.
- Docs: DATABASE_STRUCTURE, API_ENDPOINTS, SUSCRIPCIONES, GUIA_DEPLOY.

### 2026-10-25 — Revisión para lanzar la beta: celular, seguridad del deploy y fixes
- **Seguridad / deploy**
  - `trust proxy`: detrás de Nginx todas las sucursales compartían UN cupo de rate limit
    (300 req / 5 min y 20 logins / 15 min en total). Ahora es por IP real.
  - El backend escucha solo en `127.0.0.1` en producción (`HOST` en el ecosystem).
    `deploy.sh` hace `pm2 reload --update-env`.
  - `prisma` pasó a `dependencies`: `deploy.sh` instala con `--omit=dev` y `npx prisma` bajaba la
    última versión de npm en cada deploy.
  - Nuevo `scripts/create-admin.js` (`npm run admin:create`): crea el admin o le cambia la clave
    desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`. El seed de demo se niega a correr en producción (la guía
    decía correrlo y dejaba `admin@kiosco.com` / `kiosco123`). Login admin sin distinguir mayúsculas.
  - GUIA_DEPLOY: paso 1.6 sin seed. El backup diario pasa a ser obligatorio, en una subcarpeta (la
    limpieza de `deploy.sh` borraba los de antes de cada deploy) y con copia fuera del VPS.
- **Celular**: menú ☰ (antes la sidebar desaparecía y solo se llegaba a "Registrar venta").
  `PageHeader` baja de línea, Venta en una columna, `.main-content` con `min-width: 0` y las
  tablas se deslizan dentro de su tarjeta. Ninguna pantalla desborda a 390 px. En escritorio, la
  cabecera de Stock ya no aplasta el buscador.
- **Productos**: un `PUT` parcial (solo `stock` o `salePrice`) clonaba el producto global como
  propio. Desde la pantalla no pasaba (manda el form completo).
- **UI**: los badges no se parten en dos líneas. Títulos de sección de la sidebar con más contraste.
- Recorrido completo en el navegador (ver "Estado actual"). Encontrado y **no** corregido (es de
  producto): gastos pagados por transferencia descuadran el arqueo (ver Pendientes).
- Docs: GUIA_DEPLOY, API_ENDPOINTS, MODO_OSCURO, README.

### 2026-10-25 — Modo oscuro, logo claro para fondos oscuros y fix de recarga en pantallas por plan
- **Logo**: `images/logo-vexko-claro.png` (texto en blanco, generado del logo nuevo) y `<Logo onDark />`.
  Lo usan el sidebar, los logins y el topbar cuando está en oscuro. Antes "Vexko" casi negro no se
  leía sobre el navy del sidebar.
- **Modo oscuro** (estaba pendiente desde sep-2026): botón sol/luna en el topbar, claro por defecto,
  se guarda en `localStorage` (`vexko-theme`).
  - `lib/theme.js` (`useAppTheme`) pone `dark` en `<html>` solo dentro de `AppLayout`.
  - `styles/dark.css` remapea las ~80 clases de color de Tailwind que usa la app, las tablas, los
    inputs, `.btn-outline`, los badges y los toasts.
  - En `theme.css` hay variables nuevas para estilos inline; `CashRegisterPage` las usa en vez de hex fijos.
  - `tailwind.config.js`: `darkMode: 'class'`.
  - Verificado con capturas en Chromium headless (ver `docs/MODO_OSCURO.md` §4).
- **Fix** (`App.jsx` → `PlanRoute`): al recargar (F5) en Historial, Clientes, Resultados, Proveedores,
  etc., el usuario todavía no había llegado de `/auth/me`. Se lo tomaba como BASE y se lo mandaba a
  `/venta`. Ahora muestra "Cargando..." hasta tener el usuario.
- Docs: `MODO_OSCURO_PENDIENTE.md` → `MODO_OSCURO.md` (reescrito), docs/README.

### 2026-10-25 — Logo nuevo, pestaña "Vexko" y crédito a Grupo Vexus
- `components/ui/Logo.jsx` usa `images/logo vexko2.png` (el único lugar que importa el logo; lo
  usan landing, logins, sidebar, topbar y la pantalla de bloqueo). `images/logo.png` quedó sin uso.
- `index.html`: título "Vexko" y favicon con el ícono del logo nuevo (`public/favicon.ico`,
  `favicon.png`, `apple-touch-icon.png` con fondo blanco), recortado del PNG.
- Pie del sidebar de la app: "Desarrollado por Grupo Vexus" con link a grupovexus.com (la landing
  ya lo tenía).

### 2026-10-25 — WhatsApp de contacto y precios de planes configurables
- **DB** (migración `20261025180000_app_settings`): modelo `AppSettings` (fila única `global`) con
  `whatsappNumber` y `priceBase`, `priceIntermedio`, `pricePremium`.
- **Backend**
  - `lib/settings.js`: lee/guarda la configuración y normaliza el WhatsApp a dígitos (rechaza el
    formato local con 0 y 15).
  - `GET/PUT /api/admin/settings`.
  - `GET /api/public/settings`, sin login, en el nuevo `routes/public.js`.
- **Frontend**
  - Pestaña "Configuración" en el panel admin (`SettingsPanel`).
  - La pantalla de bloqueo dice "Contactate por WhatsApp" con un botón a `wa.me` y un mensaje ya
    escrito con el nombre del kiosco. El aviso de vencimiento suma un botón "Pagar por WhatsApp".
  - La landing muestra el precio de cada plan ("$ X / mes por kiosco") o "Próximamente" si no
    está cargado.
  - "Registrar pago" completa el monto con el precio del plan del cliente.
- Docs: SUSCRIPCIONES, DATABASE_STRUCTURE, API_ENDPOINTS, GUIA_DEPLOY, README.

### 2026-10-25 — Suscripción mensual a VEXKO (aviso y bloqueo por falta de pago)
- **Regla**: vence un mes después del último pago. Siguen 10 días de gracia con un pop-up cada vez
  que se abre la app, y desde el día 11 la app queda inhabilitada hasta que se registre un pago.
  Es por cliente (`Customer`) y alcanza a todas sus sucursales. Las fechas se cuentan por día de
  Argentina.
- **DB** (migración `20261025120000_customer_subscriptions`): `Customer.subscriptionStartedAt`,
  `lastPaymentAt` (denormalizado) y `subscriptionExempt`, más el modelo `SubscriptionPayment`. A
  los clientes existentes el ciclo les arranca en el deploy, así nadie se bloquea de golpe.
- **Backend**
  - `lib/subscription.js` (reglas y estado).
  - `requireAuth` responde 402 `SUBSCRIPTION_BLOCKED` en todo salvo `/api/auth/*`.
  - Login y `/auth/me` devuelven `kiosk.customer.subscription`.
  - Admin: `GET /admin/kiosks` con estado y pagos, `POST/DELETE /admin/customers/:id/payments` y
    `PATCH /admin/customers/:id` (exento).
- **Frontend**
  - Pop-up `SubscriptionWarningModal` en `AppLayout` y pantalla `SubscriptionBlockedPage`
    (desde `PrivateRoute`).
  - El interceptor convierte el 402 en un evento: no hay toast y la sesión no se cierra.
  - Panel admin: badge por cliente, resumen de vencidos y panel "Suscripción" (registrar o borrar
    pagos, historial, exento).
- Docs: nuevo `SUSCRIPCIONES.md`; DATABASE_STRUCTURE, API_ENDPOINTS, MULTIBUSINESS, GUIA_DEPLOY, README.

### 2026-10-24 — Auditoría de bugs: stock, caja, compras, reportes, clientes
- **DB** (migración `20261024120000_sale_item_cost_and_supplier_unique_per_kiosk`):
  `SaleItem.unitCost` (costo al momento de la venta, con backfill aproximado) y
  `Supplier.name` único por sucursal (antes global). Seed adaptado.
- **Stock**
  - Editar un producto "por pack" pisaba el stock real con `packUnits × packCount` de la carga
    inicial → ahora el stock solo se deriva de packs en el alta. En la edición es un campo propio,
    y se manda solo si se cambió.
  - Clonar un global como propio (al cambiarle un campo compartido) perdía el stock → la copia
    hereda el `KioskProduct`. Tampoco falla más con 409 por SKU/código repetido.
  - Venta: el descuento de stock es atómico (`updateMany` con `stock >= qty`). Antes quedaba
    negativo con ventas simultáneas. Además se validan las cantidades (una negativa sumaba stock;
    una decimal o string tiraba 500) y se suman los productos repetidos en varias líneas.
- **Caja**
  - En pago de un solo medio, el monto es siempre el total. Antes se guardaba un parcial viejo
    (de "Mixto" → "Efectivo", o al editar una venta desde el historial) y el esperado quedaba mal.
  - Validaciones al abrir y cerrar (monto vacío → antes NaN/500). No se pueden abrir dos cajas a
    la vez (transacción serializable). El cierre usa el mismo instante para el resumen y para `closedAt`.
  - Historial: la diferencia se recalcula con el mismo esperado en vivo que se muestra.
  - Flujo de caja: se valida tipo y monto (> 0). Editar sin cambiar el día no mueve la hora (antes
    pasaba el gasto a otro turno).
- **Compras a proveedor**
  - El costo sale del costo de la sucursal. Antes podía usar el **precio de venta** como costo.
  - Cantidades 0 o negativas → 400 (antes pasaban como 1).
  - Recibir un pedido: atómico (con doble clic sumaba el stock dos veces), actualiza
    `KioskProduct.cost` al costo del pedido, y si el producto no estaba en stock lo crea con precio.
  - Borrar un proveedor con pedidos ya no da 500.
- **Productos**
  - `POST /products` solo crea productos propios del cliente. Antes el body podía crear un
    **global** (visible para todos) o uno a nombre de otro `customerId`.
  - Se validan los valores negativos.
  - `GET /products/barcode/:code` devuelve el precio y el stock de la sucursal.
  - `stockStatus` usa `<= 0`.
- **Ventas**: un producto sin precio da 400 claro (antes NaN/500). El total gastado del cliente
  se suma aunque la venta no dé puntos. El cupón se acota a 100 %. No se puede cambiar el cliente
  de una venta con cupón.
- **Reportes**
  - El costo de lo vendido usa `SaleItem.unitCost`. Antes usaba el `costPrice` del global (null):
    la ganancia bruta daba igual a la facturación.
  - Las compras "Compras" ya no se restan como gasto, porque se contaban dos veces con el costo de
    lo vendido. Se informan aparte en `inventoryPurchases`.
  - Ventana de mes con `lt` del mes siguiente.
- **Clientes**: `PUT` solo nombre y teléfono (antes se podían reescribir `points` y
  `totalSpent`). Validación al crear. Canje y pagos de fiado sin carreras (doble clic generaba dos
  cupones o pagaba de más).
- **Auth / errores**
  - Una sucursal desactivada corta las sesiones abiertas (antes el token seguía hasta 7 días).
  - Login sin distinguir mayúsculas y con un mensaje único.
  - `errorHandler` maneja P2003/P2034 y explica qué campo está repetido en los P2002.
- **Facturas**: validación de tipo y total; numeración por tipo de comprobante.
- **Frontend**
  - Invalidación de `products`, `products-search` y `product` después de vender, editar o borrar
    una venta, recibir un pedido o guardar un producto (antes el stock se veía viejo hasta 30 s).
  - El carrito no deja pasar del stock ni agregar productos sin precio.
  - Historial: el total de la edición considera el cupón.
  - Pedidos: se usa el modo pack "efectivo" (los globales sin datos de pack ya no se piden "por pack").
- Docs: DATABASE_STRUCTURE, MULTIBUSINESS, API_ENDPOINTS, CLIENTES_FIADO_PUNTOS, GUIA_DEPLOY.

### 2026-10-21 — Actualización completa de la documentación + CLAUDE.md
- Se creó este `CLAUDE.md` (contexto + convenciones + registro).
- `docs/DATABASE_STRUCTURE.md`: reescrito con los 22 modelos reales (antes documentaba 10 y le
  faltaban User, Client, Employee, CashRegister, Invoice, Purchase, Subcategory, puntos y fiado),
  reglas de borrado, historial de migraciones y observaciones.
- `docs/MULTIBUSINESS.md`: reescrito. Documentaba endpoints en español (`/api/kioscos`,
  `/api/ventas`) que no existen; ahora cubre roles, aislamiento, catálogo y planes.
- Nuevos: `docs/API_ENDPOINTS.md` (todos los endpoints) y `docs/CLIENTES_FIADO_PUNTOS.md`.
- `docs/GUIA_DEPLOY.md`: aviso sobre las migraciones de sep-2026.
- `docs/MODO_OSCURO_PENDIENTE.md`: conteos actualizados (Clients* pasan a la Capa 3) y links
  relativos corregidos (apuntaban a `app/...` desde `docs/`, estaban todos rotos).
- `README.md` y `docs/README.md`: tabla de módulos con plan, cuentas demo, catálogo, índice nuevo.

### 2026-09-17 — Clientes: fiado, puntos en %, cupones con código; costo por sucursal; fixes
*(Fecha de las migraciones. Al 21-oct-2026 sigue sin commitear en `develop`.)*
- **DB** (3 migraciones): `KioskProduct.cost`; tablas `ClientDebt` + `ClientDebtPayment`;
  `LoyaltyRule.discountAmount` → `discountPercent`; `PointRedemption.code/status/usedAt`;
  `Sale.discountAmount/redemptionId`.
- **Fiado**: `POST /clients/:id/debts` y `/debts/:debtId/payments` (pagos parciales,
  PENDING → PARTIAL → PAID). `debtBalance` en el listado y el detalle de clientes. UI en
  `ClientDetailPage` y tarjeta "Fiado de clientes" en `CashRegisterPage` (dejar / cobrar).
- **Puntos**: regla con % de descuento (validada 1–100) y modal de configuración en `ClientsPage`.
  Canjear genera un cupón `PENDING` con código de 8 dígitos (prefijo `9`) + código de barras,
  en lugar de descontar al momento.
- **Venta**: selector de cliente y campo de código de descuento en `SalePage` (solo PREMIUM).
  `POST /sales` valida el cupón (del cliente, `PENDING`) y lo marca `USED` en la transacción;
  los puntos se calculan sobre el total con descuento. `PUT /sales/:id` mantiene el %;
  `DELETE /sales/:id` libera el cupón.
- **Costo por sucursal**: `cost` en `KioskProduct` (alta, edición, agregar al stock, precios).
- **Stock**: filtro por defecto "Mi stock" (antes "Todos"); "Catálogo global" para buscar nuevos.
- **Pedidos a proveedor**: sin búsqueda muestra el stock propio (hasta 200) y ordena primero los
  productos de ese proveedor con poco stock, con alerta en rojo. Modal más ancho.
- **Fixes**: búsquedas case-insensitive (Postgres) en productos, clientes y proveedores; fecha de
  gasto en `CashFlow` con la hora actual (antes caía el día anterior por UTC y no entraba en el
  turno); categoría por defecto `Alquiler` en `CashFlowPage`; `renderBarcodeDataUrl` exportado.
- README: sección de acceso admin.

### 2026-09-07 — Commit `83c328d1`
PDF exports, etiquetas con código de barras (premium), aislamiento multi-tenant (categorías y
catálogo por cliente, regla de puntos por sucursal), migración SQLite → PostgreSQL,
infraestructura de deploy (deploy.sh, PM2, Nginx, GitHub Actions).

---

## Cómo mantener este archivo

Al terminar **cada** cambio en el código:
1. Agregar una entrada arriba en "Registro de cambios" (fecha absoluta `AAAA-MM-DD`).
2. Actualizar "Estado actual" y tildar/agregar ítems en "Pendientes".
3. Si cambió el schema, endpoints, planes o un flujo: actualizar el doc correspondiente en
   `docs/` (y su "Última revisión"). Si la regla es nueva y general, sumarla a "Reglas y convenciones".
4. Mantenerlo conciso: el detalle va en `docs/`, acá solo el resumen y los enlaces.
