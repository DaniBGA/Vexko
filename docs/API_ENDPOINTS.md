# API REST — endpoints

**Última revisión:** 25 de octubre de 2026.
Base: `/api` (en dev `http://localhost:3001/api`; en prod Nginx hace de proxy de `/api` al backend).
Routers montados en [`app/backend/index.js`](../app/backend/index.js), uno por archivo en
[`app/backend/routes/`](../app/backend/routes/).

**Convenciones**

- Autenticación con `Authorization: Bearer <JWT>`. Salvo los logins, **todas** las rutas
  pasan por `requireAuth`.
- El kiosco se deduce del usuario logueado (`resolveRequestKiosk`), nunca del body. Ver
  [MULTIBUSINESS.md](MULTIBUSINESS.md#2-cómo-se-aíslan-los-datos).
- Errores: `{ "error": "mensaje en español para mostrar al usuario" }` con status 400/401/403/404/409.
  Los errores de Prisma se traducen en `errorHandler.js`: único repetido (P2002) → 409 que dice qué
  campo; clave foránea (P2003) → 409; conflicto de transacción serializable (P2034) → 409; no
  encontrado (P2025) → 404.
- Una sesión de una sucursal desactivada responde 401 en cualquier ruta (el front cierra la sesión).
- Con la **suscripción vencida** (ver [SUSCRIPCIONES.md](SUSCRIPCIONES.md)), toda ruta de una
  sucursal salvo `/api/auth/*` responde **402** `{ code: 'SUBSCRIPTION_BLOCKED', error, subscription }`.
  La sesión no se cierra: el front muestra la pantalla de suscripción vencida.
- Rate limit general en `/api` y uno más estricto en `/api/auth/login` y `/api/admin/login`.
- La columna **Plan** indica el plan mínimo con que la pantalla lo usa. "(solo UI)" quiere
  decir que el backend no lo valida.

---

## Público (sin login) — `routes/public.js`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/public/settings` | `{ whatsappNumber, planPrices: { BASE, INTERMEDIO, PREMIUM } }`. Lo usan la landing (precios) y la pantalla de suscripción vencida (WhatsApp). No pasa por `requireAuth`, así que una sucursal bloqueada también lo puede leer. No exponer acá nada que no sea público |

## Auth — `routes/auth.js`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Login de una sucursal. Devuelve token + usuario con `kiosk.customer.plan` y `kiosk.customer.subscription` (estado calculado). Funciona aunque la suscripción esté vencida |
| GET | `/auth/me` | Usuario actual, con `kiosk.customer.subscription`: `{ status: ACTIVE\|WARNING\|BLOCKED\|EXEMPT, dueDate, lastDay, blockDate, daysLeft, daysUntilDue, lastPaymentAt, ... }` |
| POST | `/auth/register` | Crear cuenta (solo `OWNER`) — uso legado |

## Admin Grupo Vexus — `routes/admin.js` (requiere rol `OWNER`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/admin/login` | Login del panel `/admin` (email sin distinguir mayúsculas). La cuenta se crea con `npm run admin:create`, no desde la API |
| GET | `/admin/me` | Admin actual |
| GET | `/admin/kiosks` | Clientes con sus sucursales y cuentas, `subscription` (estado calculado) y los últimos 12 `subscriptionPayments` |
| POST | `/admin/customers` | Crear cliente (con `plan`: `BASE`/`INTERMEDIO`/`PREMIUM`) |
| PATCH | `/admin/customers/:id` | Marcar/desmarcar `subscriptionExempt` |
| DELETE | `/admin/customers/:id` | Borrar cliente y todo lo suyo (transacción) |
| POST | `/admin/customers/:id/payments` | Registrar un pago de la suscripción: `paidAt` (`YYYY-MM-DD`, hoy si no viene, no puede ser futura), `amount?` (≥ 0), `note?`. Recalcula `lastPaymentAt` y devuelve el cliente con su nuevo estado |
| DELETE | `/admin/customers/:id/payments/:paymentId` | Borrar un pago cargado por error (recalcula `lastPaymentAt`) |
| GET | `/admin/settings` | Configuración global: `{ whatsappNumber, planPrices: { BASE, INTERMEDIO, PREMIUM }, updatedAt }` |
| PUT | `/admin/settings` | Guardar (parcial): `whatsappNumber` (se normaliza a dígitos; 400 si es formato local o no tiene 10–15 dígitos; vacío = sin WhatsApp) y/o `planPrices` (≥ 0; `null`/vacío = "Próximamente") |
| POST | `/admin/kiosks` | Crear sucursal |
| PATCH | `/admin/kiosks/:id` | Editar sucursal (nombre, dirección, teléfono, `active`) |
| DELETE | `/admin/kiosks/:id` | Borrar sucursal y todo lo suyo (transacción) |
| POST | `/admin/kiosks/:id/account` | Crear la cuenta `KIOSK` de la sucursal |
| PATCH | `/admin/kiosks/:id/account` | Editar la cuenta (nombre, email, contraseña) |

## Productos — `routes/products.js`

| Método | Ruta | Plan | Descripción |
|---|---|---|---|
| GET | `/products` | BASE | Listado. Query: `search`, `status`, `subcategoryId`, `supplierId`, `isCustom`, `page`, `limit`, `stockView=1` (agrega `stockStatus`), `added=1` (solo lo que está en el stock de la sucursal), `global=1`, `dedupe` |
| GET | `/products/prices` | BASE | Lista de precios simplificada (incluye `cost` por sucursal) |
| GET | `/products/barcode/:code` | BASE | Buscar por código de barras (escáner). Devuelve stock, precio y costo de la sucursal |
| GET | `/products/:id` | BASE | Detalle con inventario de la sucursal |
| POST | `/products` | BASE | Crear producto **propio** del cliente con su `KioskProduct` (stock, precio, costo). Ignora `isCustom`/`customerId` del body: el catálogo global no se crea desde la app. En modo pack, si no viene `stock`, se usa `packUnits × packCount`. Rechaza valores negativos |
| POST | `/products/:id/clone-to-kiosk` | BASE | **Agregar al stock** de la sucursal (crea/actualiza `KioskProduct` con `stock`, `minStock`, `price`, `cost`). No clona el producto |
| PUT | `/products/:id` | BASE | Editar. El stock se actualiza **solo si viene `stock`** (nunca se deriva de los packs). En un producto global, si cambian campos compartidos se clona como propio: la copia hereda el inventario de la sucursal y no repite barcode/SKU del global. Un campo que no viene en el body no cuenta como cambio (un PUT con solo `stock` o `salePrice` no clona) |
| DELETE | `/products/:id` | BASE | Quita el producto del stock de la sucursal (borra su `KioskProduct`); si además es propio del cliente lo desactiva (`active: false`). Un global nunca se toca |
| POST | `/products/barcode-labels` | PREMIUM (validado) | Datos para la hoja de etiquetas; genera códigos internos (prefijo `20`) si faltan |
| PATCH | `/products/:id/barcode-printed` | PREMIUM (validado) | Marcar etiqueta impresa |

## Categorías — `routes/categories.js`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/categories` | Globales + propias del cliente, con subcategorías |
| POST | `/categories` | Crear categoría propia del cliente |
| POST | `/categories/:id/subcategories` | Crear subcategoría |

## Ventas — `routes/sales.js`

| Método | Ruta | Plan | Descripción |
|---|---|---|---|
| GET | `/sales` | INTERMEDIO (solo UI) | Historial paginado y **completo** (`page`, `limit`; `all=1` trae las 500 más recientes para el PDF). Devuelve `total` y `totalRevenue` (suma de todas las ventas, no de la página). Hasta el 25-oct-2026 mostraba solo los últimos 2 meses |
| POST | `/sales` | BASE | Crear venta: valida stock y precio, descuenta `KioskProduct` de forma atómica, suma puntos y total gastado al cliente. Body: `items[]` (`quantity` entero > 0; líneas del mismo producto se suman), `paymentMethod` (`CASH`/`TRANSFER`/`CARD`/`MIXED`), montos (solo se usan en `MIXED`), `cashReceived`, `clientId?`, `redemptionCode?` |
| GET | `/sales/:id` | INTERMEDIO (solo UI) | Detalle |
| PUT | `/sales/:id` | INTERMEDIO (solo UI) | Editar: repone stock, recalcula y **mantiene el % del cupón** si tenía uno |
| DELETE | `/sales/:id` | INTERMEDIO (solo UI) | Borrar: repone stock, descuenta puntos/total del cliente y **libera el cupón** (vuelve a `PENDING`) |

Reglas del `redemptionCode` en `POST /sales`: requiere `clientId`; el código tiene que
existir, pertenecer a ese cliente y estar `PENDING`. Dentro de la transacción se marca
`USED` con `updateMany({ where: { id, status: 'PENDING' } })` para evitar el doble uso
concurrente. Descuento = `round(subtotal × % / 100, 2)` con el % acotado a 0–100; los puntos se
calculan sobre el total ya descontado. Una venta con cupón no se puede pasar a otro cliente.

Reglas de stock y montos (`POST` y `PUT /sales`):

- El stock se descuenta con `updateMany({ where: { stock: { gte: cantidad } } })`: si dos ventas
  simultáneas se llevan las últimas unidades, solo una pasa y la otra recibe 400 "Stock insuficiente".
- En `CASH`, `TRANSFER` y `CARD` el monto del medio es **siempre** el total. Solo `MIXED` usa
  `cashAmount`/`transferAmount`/`cardAmount`, que tienen que ser ≥ 0 y sumar el total.
- Cada línea guarda `unitPrice` y `unitCost` (costo de la sucursal en ese momento).
- Un producto sin precio de venta en la sucursal da 400.

## Caja (turnos / arqueo) — `routes/cashRegister.js`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/cash-registers/current` | Turno abierto + resumen (ventas por medio de pago, gastos, efectivo esperado). `expensesTotal` y el esperado cuentan **solo** los gastos con `paidFromCash: true` |
| GET | `/cash-registers` | Historial de turnos (`page`, `limit`, `all=1`) |
| POST | `/cash-registers/open` | Abrir turno con `openingAmount` (≥ 0, obligatorio). Si la sucursal tiene empleados activos, exige `employeeId` + PIN. 409 si ya hay uno abierto (también con dos aperturas simultáneas: transacción serializable) |
| POST | `/cash-registers/:id/close` | Cerrar con `actualAmount` (≥ 0, obligatorio). Guarda esperado y diferencia. En el historial (`GET /cash-registers`) la diferencia se recalcula con el esperado en vivo |
| PATCH | `/cash-registers/:id` | Corregir montos, notas o empleado de un turno |
| DELETE | `/cash-registers/:id` | Borrar un turno abierto por error |

## Empleados — `routes/employees.js`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/employees` | Lista (sin PIN), para elegir al abrir caja |
| POST | `/employees/verify-password` | Confirma la contraseña de la cuenta antes de gestionar empleados |
| POST | `/employees` | Crear empleado con PIN de 4 dígitos (pide contraseña de la cuenta) |
| PATCH | `/employees/:id` | Editar / desactivar / cambiar PIN (pide contraseña de la cuenta) |

## Flujo de caja (gastos / ingresos) — `routes/cashflow.js` — INTERMEDIO (solo UI)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/cashflow` | Movimientos (`period`, `page`, `limit`, `all=1`). `totals`: `income`, `expense`, `balance`, `expenseFromCash` y `expenseOutsideCash` |
| POST | `/cashflow` | Registrar movimiento. `type` `INCOME`/`EXPENSE` (default `EXPENSE`), `amount` > 0. `date` (`YYYY-MM-DD`) se guarda con la hora actual. `paidFromCash` (default `true`): en `false` el gasto no se resta del efectivo esperado de la caja |
| PUT | `/cashflow/:id` | Editar. Si `date` es el mismo día, conserva la hora original (no cambia de turno). `paidFromCash` solo cambia si viene en el body |
| DELETE | `/cashflow/:id` | Borrar |

## Proveedores — `routes/suppliers.js` — INTERMEDIO (solo UI)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/suppliers` | Lista (`search`, case-insensitive) |
| GET | `/suppliers/:id` | Detalle + todos sus pedidos, paginados (`page`, `limit`). Hasta el 25-oct-2026 solo los últimos 2 meses |
| POST | `/suppliers` | Crear |
| PUT | `/suppliers/:id` | Editar |
| DELETE | `/suppliers/:id` | Borrar (botón "Borrar proveedor" en el detalle, con confirmación). Borra también sus pedidos; el stock recibido y los gastos "Compras" quedan, y sus productos pasan a "sin proveedor" (`SET NULL`) |
| POST | `/suppliers/:id/orders` | Crear pedido (`Purchase` + items). `quantity` en **unidades**, entero > 0. Costo unitario: el del body o `KioskProduct.cost ?? Product.costPrice ?? costo por pack ?? 0`. Si es en efectivo, registra un gasto "Compras" en el flujo de caja (descuenta del esperado del turno) |
| POST | `/suppliers/:supplierId/orders/:purchaseId/receive` | Recibir pedido (atómico, una sola vez): marca `RECEIVED`, suma las cantidades al `KioskProduct` de la sucursal y actualiza su `cost` al costo del pedido. Si el producto no estaba en stock lo crea con el precio de venta del producto. 400 si ya estaba recibido |

## Clientes, puntos y fiado — `routes/clients.js` — PREMIUM (solo UI)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/clients` | Lista (`search` por nombre/teléfono). Cada cliente trae `pointsToNextRedemption` y `debtBalance`; también devuelve la `loyaltyRule` activa |
| GET | `/clients/loyalty/rules` | Regla de puntos activa |
| PUT | `/clients/loyalty/rules` | Nueva regla: `amountPerPoint` (>0), `pointsForDiscount` (>0), `discountPercent` (1–100). Desactiva la anterior |
| GET | `/clients/:id` | Detalle: últimas 20 ventas, últimos 10 canjes, todos los fiados con pagos, `debtBalance` |
| POST | `/clients` | Crear (`name` y `phone` obligatorios; 409 si el teléfono ya existe en la sucursal) |
| PUT | `/clients/:id` | Editar **solo** `name` y `phone` (puntos y total gastado no se editan a mano) |
| POST | `/clients/:id/redeem` | Canjear puntos → genera un **cupón** `PENDING` con código de 8 dígitos y descuenta los puntos (condicionado: con doble clic sale un solo cupón). 400 si no hay regla de puntos |
| POST | `/clients/:id/debts` | Registrar fiado (`amount`, `note?`) |
| POST | `/clients/:id/debts/:debtId/payments` | Pago (total o parcial) contra una deuda puntual. No puede superar lo pendiente |

Detalle funcional: [CLIENTES_FIADO_PUNTOS.md](CLIENTES_FIADO_PUNTOS.md).

## Facturación AFIP — `routes/invoices.js` — INTERMEDIO (solo UI)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/invoices` | Facturas (`month`, `year`) |
| POST | `/invoices` | Registrar factura (`invoiceType` A/B/C, `total` > 0). Numeración correlativa por tipo. Hoy ninguna pantalla lo usa |

## Reportes — `routes/reports.js`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/reports/monthly` | Resultados del mes (`month` 1–12, `year`) — INTERMEDIO (solo UI). Costo de lo vendido = Σ `SaleItem.unitCost × cantidad`. `expenses` excluye la categoría "Compras" (la mercadería ya está en el costo de lo vendido); lo pagado a proveedores en efectivo viene aparte en `inventoryPurchases` |
| GET | `/reports/dashboard` | KPIs rápidos (ventas de hoy, etc.) |
