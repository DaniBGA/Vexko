# Modelo multi-negocio (multi-tenant)

**Última revisión:** 25 de octubre de 2026 (reemplaza la versión de mayo-2026, que
describía endpoints en español como `/api/kioscos` que nunca existieron con ese nombre).

Cómo se organiza Vexko para atender a muchos negocios a la vez sin que se mezclen
sus datos. Tablas y campos en detalle: [DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md).
Endpoints: [API_ENDPOINTS.md](API_ENDPOINTS.md).

---

## 1. Jerarquía

```
Grupo Vexus (cuenta OWNER, panel /admin)
 └── Customer  — el negocio que contrata Vexko. Tiene el PLAN.
      └── Kiosk — cada sucursal del negocio.
           ├── User (rol KIOSK) — UNA cuenta de login por sucursal
           └── Employee — empleados con PIN de 4 dígitos (sin login propio)
```

- **OWNER**: administrador de Grupo Vexus. Entra por `/admin/login`, crea clientes,
  sucursales y sus cuentas, cambia el plan y activa/desactiva sucursales.
  En desarrollo es `admin@kiosco.com` / `kiosco123` (seed).
  El seed también crea una cuenta `KIOSK` demo por plan (`base@`, `intermedio@`,
  `premium@kiosco.com`, ver el README raíz).
- **KIOSK**: la cuenta de una sucursal. Entra por `/login` y opera la app. Toda request
  autenticada trae al usuario con `kiosk` y `kiosk.customer` (incluido el `plan`).
  El login se rechaza si la cuenta está inactiva o si la sucursal tiene `active = false`
  (las sucursales se crean desactivadas y se activan desde `/admin`).
- **Employee**: no se loguea. El dueño de la sucursal lo crea desde la app (previa
  confirmación de la contraseña de la cuenta en `POST /api/employees/verify-password`)
  y el empleado usa su PIN para abrir la caja; así queda registrado quién hizo cada turno.

---

## 2. Cómo se aíslan los datos

Regla de oro del backend: **el kiosco nunca viene del body ni de la URL, se deduce del
usuario logueado.**

```js
// app/backend/middleware/auth.js
requireAuth           // valida el JWT y carga req.user (+ kiosk + customer.plan)
resolveRequestKiosk() // devuelve el kiosco de req.user.kioskId (o null)
```

Cada router hace `router.use(requireAuth)` y en cada handler resuelve el kiosco con
`resolveRequestKiosk(req)` (muchas rutas lo envuelven en un helper `getScopedKiosk`).
Todas las consultas filtran por ese `kioskId`, y para leer un registro puntual se usa
`findFirst({ where: { id, kioskId } })` en lugar de `findUnique({ where: { id } })`,
para que un id de otro tenant dé 404.

Qué se aísla y a qué nivel:

| Dato | Nivel de aislamiento | Cómo |
|---|---|---|
| Stock, precio y costo | Sucursal | `KioskProduct.kioskId` |
| Ventas, flujo de caja, facturas | Sucursal | `kioskId` directo |
| Turnos de caja | Sucursal | vía `CashRegister.userId` (1 user = 1 kiosco) |
| Proveedores y pedidos | Sucursal | `Supplier.kioskId`; `Purchase` vía su proveedor |
| Clientes finales, fiado, puntos | Sucursal | `Client.kioskId`, `ClientDebt.kioskId`, `LoyaltyRule.kioskId` |
| Empleados | Sucursal | `Employee.kioskId` |
| Productos propios | Cliente (todas sus sucursales) | `Product.customerId` |
| Categorías propias | Cliente | `Category.customerId` |
| Catálogo global y categorías globales | Compartido | `customerId = null` |

---

## 3. Catálogo global vs. productos propios

- **Catálogo global** (`Product.customerId = null`, `isCustom = false`): miles de
  productos compartidos por todos los clientes. Se carga con
  `npm run db:seed:catalog` desde `prisma/catalog-products.json`. **No se crea desde la app**:
  `POST /api/products` siempre crea un producto propio del cliente logueado (hasta oct-2026 el
  body podía pedir un global o un `customerId` ajeno).
- **Producto propio** (`isCustom = true`, `customerId` = el cliente): solo lo ven las
  sucursales de ese cliente.
- **"Agregar al stock"** (`POST /api/products/:id/clone-to-kiosk`): a pesar del nombre,
  **no clona** el producto; crea o actualiza el `KioskProduct` de la sucursal.
- **Editar un producto global** (`PUT /api/products/:id`):
  - si solo cambia precio, costo o stock (datos por sucursal) → se actualiza el `KioskProduct`;
  - si cambia algo compartido (nombre, código, proveedor, etc.) → se **clona como
    producto propio** del cliente y el global queda intacto para los demás.
- **Borrar** un producto global solo lo quita del stock de la sucursal; nunca lo
  desactiva para el resto.
- Precio y costo efectivos: `KioskProduct.price ?? Product.salePrice` y
  `KioskProduct.cost ?? Product.costPrice`.
- En la pantalla Stock, "Mi stock" (default) muestra lo que la sucursal tiene cargado y
  "Catálogo global" sirve para buscar productos nuevos. El badge "Propio"/"Global" de cada
  fila es otra cosa: indica si el producto es `isCustom`.

---

## 4. Planes

El plan vive en `Customer.plan` y aplica a todas las sucursales del cliente.

| Plan | Nivel | Pantallas / funciones |
|---|---|---|
| `BASE` | 0 | Venta, Stock, Catálogo, Producto ABM, Precios, Caja |
| `INTERMEDIO` | 1 | + Historial, Flujo de caja, Proveedores, Facturación AFIP, Resultados del mes |
| `PREMIUM` | 2 | + Clientes / puntos, **fiado**, cupones de descuento en la venta, impresión de etiquetas con código de barras |

Dónde se aplica:

- **Frontend**: `PLAN_LEVELS` + `<PlanRoute minPlan={n}>` en
  [`App.jsx`](../app/frontend/src/App.jsx) (rutas), y los mismos niveles en
  [`AppLayout.jsx`](../app/frontend/src/components/layout/AppLayout.jsx) (sidebar).
  Dentro de las pantallas compartidas (`SalePage`, `CashRegisterPage`) los bloques
  premium se ocultan con `plan === 'PREMIUM'`.
- **Backend**: solo las etiquetas de código de barras lo validan
  (`requirePremiumKiosk` en `routes/products.js`). **Las rutas de clientes, fiado,
  proveedores, reportes, etc. no validan el plan**: hoy el límite es solo visual.

### Suscripción

Además del plan, cada cliente paga una **suscripción mensual** a VEXKO. Si vence y pasan los 10
días de gracia, se inhabilitan todas sus sucursales: el backend responde 402 a todo salvo
`/api/auth/*`. A diferencia del plan, esto **sí se valida en el backend**. Detalle en
[SUSCRIPCIONES.md](SUSCRIPCIONES.md).

---

## 5. Validaciones y restricciones

- Nombre de sucursal único por cliente (`@@unique([customerId, name])`).
- Nombre de cliente (`Customer.name`) único global.
- `Product.barcode` y `Product.sku` únicos globales.
- Nombre de proveedor único **por sucursal** (`@@unique([kioskId, name])`, desde oct-2026; antes
  era global y dos negocios no podían tener el mismo proveedor).
- El proveedor que se asigna a un producto tiene que ser de la misma sucursal.
- Teléfono de cliente final único por sucursal (`@@unique([kioskId, phone])`).
- Las búsquedas por texto usan `mode: 'insensitive'` (Postgres distingue mayúsculas en
  `contains`, a diferencia del SQLite que se usaba antes).
- Borrar un cliente o una sucursal desde `/admin` limpia a mano, dentro de una
  transacción, todo lo que no tiene `onDelete: Cascade` (ventas, flujo, proveedores,
  turnos, cuenta). Ver [DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md#reglas-de-borrado-ondelete).
