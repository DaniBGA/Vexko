# Estructura de la base de datos

**Motor:** PostgreSQL (vía Prisma 5). Fuente de verdad: [`app/backend/prisma/schema.prisma`](../app/backend/prisma/schema.prisma).
**Última revisión:** 25 de octubre de 2026 — refleja el schema con las migraciones
hasta `20261025200000_cashflow_paid_from_cash` (24 modelos).

> Si cambiás el schema, actualizá este documento en el mismo cambio y anotalo en
> el registro de [`CLAUDE.md`](../CLAUDE.md).

Todos los `id` son `String @default(cuid())`. Los montos son `Float` (no `Decimal`).
Los campos "enum" son `String` con valores convencionales (el schema no usa
`enum` de Prisma) — los valores válidos se listan en cada tabla.

---

## Mapa general

```
Customer (cliente de Vexus / negocio, tiene el PLAN)
 ├── Category (propias del cliente)            ── Category global (customerId null)
 ├── Product (isCustom, propios del cliente)   ── Product global (customerId null)
 └── Kiosk (sucursal)
      ├── User  (1:1, rol KIOSK — la cuenta con la que se loguea la sucursal)
      │    ├── Sale
      │    └── CashRegister ── Employee (quién abrió el turno)
      ├── Employee (PIN para abrir caja)
      ├── KioskProduct (stock / precio / costo de un Product en esta sucursal)
      ├── Sale ── SaleItem ── Product
      │    └── PointRedemption (cupón de descuento usado, opcional)
      ├── CashFlow (gastos / ingresos manuales)
      ├── Supplier ── SupplierProduct ── Product
      │    └── Purchase ── PurchaseItem ── Product
      ├── Client (cliente final del kiosco: puntos + fiado)
      │    ├── PointRedemption (cupones generados al canjear puntos)
      │    └── ClientDebt ── ClientDebtPayment
      ├── LoyaltyRule (regla de puntos de la sucursal)
      └── Invoice (facturación AFIP)
```

Agrupación por dominio:

| Dominio | Modelos |
|---|---|
| Multi-tenant | `Customer`, `Kiosk`, `User`, `Employee` |
| Suscripción a VEXKO | `SubscriptionPayment` (+ campos de suscripción en `Customer`), `AppSettings` |
| Catálogo e inventario | `Category`, `Subcategory`, `Product`, `KioskProduct` |
| Ventas | `Sale`, `SaleItem`, `Invoice` |
| Caja | `CashRegister`, `CashFlow` |
| Proveedores y compras | `Supplier`, `SupplierProduct`, `Purchase`, `PurchaseItem` |
| Clientes finales | `Client`, `ClientDebt`, `ClientDebtPayment`, `LoyaltyRule`, `PointRedemption` |

---

## 1. Multi-tenant

### Customer
Raíz del tenant: el negocio que contrata Vexko. Tiene el **plan**, que define qué
pantallas ve cada una de sus sucursales.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | String | `@unique` |
| `plan` | String | `BASE` (default) \| `INTERMEDIO` \| `PREMIUM` |
| `email` | String? | `@unique` |
| `phone`, `address` | String? | |
| `subscriptionStartedAt` | DateTime | **nuevo (oct-2026)**, default `now()`. Base del ciclo de suscripción mientras no haya pagos |
| `lastPaymentAt` | DateTime? | **nuevo** — `paidAt` del pago más reciente (denormalizado para no consultar los pagos en cada request) |
| `subscriptionExempt` | Boolean | **nuevo**, default `false` — no se cobra: nunca se avisa ni se bloquea |

Relaciones: `kiosks[]`, `products[]` (propios), `categories[]` (propias), `subscriptionPayments[]`.

### SubscriptionPayment
Pago de la cuota mensual a VEXKO, registrado a mano desde el panel admin. Reglas en
[SUSCRIPCIONES.md](SUSCRIPCIONES.md).

| Campo | Tipo | Notas |
|---|---|---|
| `customerId` | FK → Customer | Cascade |
| `paidAt` | DateTime | fecha del pago (mediodía de ese día en hora de Argentina) |
| `amount` | Float? | opcional |
| `note` | String? | ej. "transferencia" |

Índice: `[customerId, paidAt]`.

### AppSettings
Configuración global de VEXKO, en **una sola fila** (`id = "global"`). Se edita en el panel admin
(pestaña "Configuración") y se lee públicamente (`GET /api/public/settings`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String | PK, default `"global"` |
| `whatsappNumber` | String? | solo dígitos con código de país (ej. `5492494000000`), para `wa.me` |
| `priceBase`, `priceIntermedio`, `pricePremium` | Float? | precio mensual de cada plan; null = "Próximamente" en la landing |
| `updatedAt` | DateTime | |

### Kiosk
Sucursal / punto de venta. Casi todos los datos operativos cuelgan de acá.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | String | único por cliente: `@@unique([customerId, name])` |
| `address`, `phone` | String? | |
| `active` | Boolean | default `false` — se activa desde el panel `/admin` |
| `customerId` | FK → Customer | `onDelete: Cascade` |

Relaciones: `user` (1:1), `clients`, `invoices`, `kioskProducts`, `sales`, `suppliers`,
`cashFlows`, `employees`, `loyaltyRules`, `clientDebts`.

### User
Cuenta de login.

| Campo | Tipo | Notas |
|---|---|---|
| `email` | String | `@unique` |
| `passwordHash` | String | bcrypt |
| `role` | String | `OWNER` (admin de Grupo Vexus, entra a `/admin`) \| `KIOSK` (cuenta de una sucursal, la crea el panel admin) \| `EMPLOYEE` (default de `/api/auth/register`, uso legado) |
| `active` | Boolean | default `true` |
| `kioskId` | String? | `@unique` → **una cuenta por sucursal**. `onDelete: SetNull` |

### Employee
Empleado de una sucursal **sin cuenta propia**: solo tiene un PIN (hasheado) que el
dueño genera para abrir la caja y dejar registrado quién hizo el turno.

| Campo | Tipo | Notas |
|---|---|---|
| `kioskId` | FK → Kiosk | Cascade |
| `name` | String | |
| `pinHash` | String | |
| `active` | Boolean | default `true` |

---

## 2. Catálogo e inventario

### Category
`customerId = null` → categoría **global** (la del catálogo compartido).
`customerId` con valor → categoría **propia** de ese cliente, invisible para el resto.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | String | `@@unique([customerId, name])` |
| `description` | String? | |
| `customerId` | FK? → Customer | Cascade |

### Subcategory
| Campo | Tipo | Notas |
|---|---|---|
| `name` | String | `@@unique([name, categoryId])` |
| `categoryId` | FK → Category | |

### Product
Catálogo global + productos propios (`isCustom = true`, `customerId` del dueño).
Un producto existe **una sola vez**; lo que varía por sucursal vive en `KioskProduct`.

| Campo | Tipo | Notas |
|---|---|---|
| `name`, `description` | String / String? | |
| `barcode`, `sku` | String? | ambos `@unique` **a nivel global** |
| `loadMode` | String | `pack` (default) \| `unit` — cómo se carga el producto |
| `basePrice`, `baseCost` | Float? | precio/costo base de referencia |
| `packPrice`, `packUnits`, `packCount` | Float? / Int? | datos de carga por pack |
| `categoryId`, `subcategoryId` | FK? | |
| `isCustom` | Boolean | default `false` |
| `customerId` | FK? → Customer | Cascade — dueño de un producto propio |
| `stock`, `minStock`, `salePrice`, `costPrice` | Int? / Float? | **campos legados** de compatibilidad (la app vieja los esperaba en `Product`). El backend los usa como fallback cuando el `KioskProduct` no tiene valor |
| `expiresAt` | DateTime? | vencimiento |
| `supplierId` | FK? → Supplier | proveedor principal |
| `active` | Boolean | default `true` (borrado lógico) |

Índices: `categoryId`, `customerId`, `isCustom`, `[active, isCustom]`, `name`.

### KioskProduct
**El corazón del multi-tenant**: stock, precio y costo de un producto en una sucursal.

| Campo | Tipo | Notas |
|---|---|---|
| `kioskId`, `productId` | FK | `@@unique([kioskId, productId])`, ambos Cascade |
| `stock`, `minStock` | Int | default `0` |
| `price` | Float? | precio de venta en esta sucursal (si es null se usa `Product.salePrice`) |
| `cost` | Float? | **nuevo (sep-2026)** — costo en esta sucursal (si es null se usa `Product.costPrice`). Al recibir un pedido de proveedor se actualiza al costo unitario del pedido (último costo de compra) |
| `barcodePrinted` | Boolean | si ya se imprimió la etiqueta (función premium) |

Estado de stock que calcula el backend (`stockStatus`): `OUT` (stock 0),
`CRITICAL` (≤ minStock), `ALERT`, `OK`.

---

## 3. Ventas

### Sale
| Campo | Tipo | Notas |
|---|---|---|
| `date` | DateTime | default `now()` |
| `total` | Float | **ya con el descuento aplicado** |
| `paymentMethod` | String | `CASH` \| `TRANSFER` \| `CARD` \| `MIXED` |
| `cashAmount`, `transferAmount`, `cardAmount` | Float? | desglose (obligatorio en `MIXED`) |
| `cashReceived`, `changeGiven` | Float? | vuelto |
| `pointsEarned` | Int | default `0` — puntos sumados al cliente (sobre el total pagado) |
| `discountAmount` | Float? | **nuevo** — monto descontado por cupón de puntos |
| `redemptionId` | FK? → PointRedemption | **nuevo**, `@unique` — cupón usado en la venta |
| `kioskId` | FK → Kiosk | |
| `userId` | FK → User | |
| `clientId` | FK? → Client | relación `"ClientSales"` |

Índices: `kioskId`, `userId`, `date`, `createdAt`, `[kioskId, createdAt]`,
`[userId, createdAt]`, `[paymentMethod, createdAt]`.

### SaleItem
| Campo | Tipo | Notas |
|---|---|---|
| `quantity` | Int | |
| `unitPrice` | Float | precio al momento de la venta |
| `unitCost` | Float? | **nuevo (oct-2026)** — costo al momento de la venta (`KioskProduct.cost ?? Product.costPrice`). Es lo que usan los reportes para el costo de lo vendido |
| `subtotal` | Float | `quantity × unitPrice` |
| `saleId` | FK → Sale | Cascade |
| `productId` | FK → Product | |

### Invoice (AFIP)
| Campo | Tipo | Notas |
|---|---|---|
| `kioskId` | FK → Kiosk | Cascade |
| `saleId` | String? | referencia suelta (sin FK) |
| `invoiceType`, `invoiceNumber`, `status` | String | |
| `total` | Float | |

---

## 4. Caja

### CashRegister (turno / arqueo)
| Campo | Tipo | Notas |
|---|---|---|
| `userId` | FK → User | la cuenta de la sucursal (por eso no tiene `kioskId` propio) |
| `employeeId` | FK? → Employee | quién abrió el turno |
| `status` | String | `OPEN` (default) \| `CLOSED` |
| `openingAmount` | Float | efectivo inicial |
| `expectedAmount`, `actualAmount`, `difference` | Float? | se completan al cerrar |
| `notes` | String? | |
| `openedAt`, `closedAt` | DateTime | |

Efectivo esperado = `openingAmount + ventas en efectivo del turno − gastos del turno`.
**Los cobros de fiado no entran en este cálculo** (ver [CLIENTES_FIADO_PUNTOS.md](CLIENTES_FIADO_PUNTOS.md)).

### CashFlow
| Campo | Tipo | Notas |
|---|---|---|
| `type` | String | `INCOME` \| `EXPENSE` |
| `amount` | Float | |
| `description` | String? | |
| `category` | String? | ej. `Alquiler`, `Servicios`, `Compras` (pedido a proveedor en efectivo)… |
| `paidFromCash` | Boolean | default `true`. "¿Salió de la caja?": en `false` (transferencia, débito…) cuenta como gasto en los reportes pero **no** se resta del efectivo esperado del arqueo. Los pedidos a proveedor en efectivo lo crean en `true` |
| `kioskId` | FK → Kiosk | |
| `createdAt` | DateTime | si el usuario elige una fecha (`YYYY-MM-DD`), se guarda esa fecha **con la hora actual** para que caiga dentro del turno abierto (evita el corrimiento por UTC-3) |

---

## 5. Proveedores y compras

### Supplier
| Campo | Tipo | Notas |
|---|---|---|
| `name` | String | único **por sucursal**: `@@unique([kioskId, name])` (hasta oct-2026 era único global) |
| `phone`, `email`, `address` | String? | |
| `kioskId` | FK? → Kiosk | |

### SupplierProduct
`cost`, `leadDays` (días de entrega). `@@unique([supplierId, productId])`.

### Purchase (pedido a proveedor)
| Campo | Tipo | Notas |
|---|---|---|
| `supplierId` | FK → Supplier | el kiosco se resuelve a través del proveedor |
| `status` | String | `PENDING` (default) \| `RECEIVED` |
| `paymentMethod` | String | default `CASH` |
| `deliveryDate`, `receivedAt` | DateTime? | |
| `totalAmount` | Float | |
| `notes` | String? | |

### PurchaseItem
`quantity`, `unitCost`, `lineTotal`, FK a `Purchase` (Cascade) y `Product`.

---

## 6. Clientes finales (puntos y fiado) — plan PREMIUM

Detalle funcional en [CLIENTES_FIADO_PUNTOS.md](CLIENTES_FIADO_PUNTOS.md).

### Client
| Campo | Tipo | Notas |
|---|---|---|
| `kioskId` | FK → Kiosk | Cascade — los clientes son **por sucursal** |
| `name` | String | |
| `phone` | String | `@@unique([kioskId, phone])` |
| `points` | Int | saldo de puntos |
| `totalSpent` | Float | acumulado |

### LoyaltyRule
Regla de puntos **por sucursal**. Al editarla se desactiva la anterior y se crea
una nueva (queda historial).

| Campo | Tipo | Notas |
|---|---|---|
| `kioskId` | FK → Kiosk | |
| `amountPerPoint` | Float | pesos gastados por cada punto |
| `pointsForDiscount` | Int | puntos necesarios para canjear |
| `discountPercent` | Float | **% de descuento** (1–100). Antes era `discountAmount` (monto fijo) — renombrado en sep-2026 |
| `active` | Boolean | una sola activa por sucursal |

### PointRedemption (cupón de descuento)
| Campo | Tipo | Notas |
|---|---|---|
| `clientId` | FK → Client | Cascade |
| `pointsUsed` | Int | |
| `discount` | Float | **porcentaje** copiado de la regla al canjear (el nombre del campo no lo dice) |
| `code` | String | `@unique` — 8 dígitos empezando en `9`, también se imprime como código de barras CODE128 |
| `status` | String | `PENDING` \| `USED` |
| `usedAt` | DateTime? | |
| `sale` | Sale? | venta donde se usó (1:1 vía `Sale.redemptionId`) |

### ClientDebt (fiado)
Cada fiado es su propia fila (no un saldo único) para tener historial y pagos
parciales contra una deuda puntual.

| Campo | Tipo | Notas |
|---|---|---|
| `clientId`, `kioskId` | FK | ambos Cascade |
| `amount` | Float | monto adeudado |
| `paidAmount` | Float | default `0` |
| `status` | String | `PENDING` \| `PARTIAL` \| `PAID` |
| `note` | String? | |

Índices: `clientId`, `kioskId`, `[kioskId, status]`.

### ClientDebtPayment
`amount`, `createdAt`, FK a `ClientDebt` (Cascade).

---

## Reglas de borrado (onDelete)

- Borrar un `Customer` borra en cascada sus kioscos, productos propios, categorías propias y pagos de suscripción.
- Borrar un `Kiosk` borra en cascada: inventario, clientes (y con ellos fiados y cupones), empleados, reglas de puntos, facturas.
  `Sale` y `CashFlow` **no** tienen cascade desde Kiosk (bloquearían el borrado), por eso
  `DELETE /api/admin/kiosks/:id` y `DELETE /api/admin/customers/:id` borran a mano, dentro de una
  transacción y en orden: proveedores + pedidos, ventas, facturas, flujo de caja, turnos de caja,
  cuenta `User`, clientes y recién ahí el kiosco. Si agregás un modelo nuevo colgado de `Kiosk`
  sin cascade, sumalo a esas dos rutas.
- Borrar una `Sale` borra sus `SaleItem`. Si tenía cupón, la API lo vuelve a `PENDING` antes de borrar.
- Borrar el `User` de una sucursal deja `kioskId` en null (`SetNull`).

---

## Historial de migraciones

| Migración | Qué hace |
|---|---|
| `20260824060417_init_postgres` | Schema inicial en PostgreSQL (migración desde SQLite). |
| `20260917011553_add_kiosk_product_cost_and_client_debts` | `KioskProduct.cost` + tablas `ClientDebt` y `ClientDebtPayment`. |
| `20260917015926_loyalty_rule_discount_percent` | Rename `LoyaltyRule.discountAmount` → `discountPercent`. Preserva los valores: **revisar en prod**, un valor viejo en pesos (ej. 500) pasaría a leerse como 500 %. |
| `20260917030221_redemption_codes` | `PointRedemption.code/status/usedAt`, `Sale.discountAmount/redemptionId`. Agrega `code NOT NULL` **sin backfill**: asume la tabla `PointRedemption` vacía. |
| `20261024120000_sale_item_cost_and_supplier_unique_per_kiosk` | `Supplier.name` pasa de único global a `@@unique([kioskId, name])` (siempre aplicable: con la restricción vieja no puede haber duplicados por sucursal). Agrega `SaleItem.unitCost` y lo completa en las ventas existentes con el costo actual de la sucursal o del producto (aproximado). |
| `20261025120000_customer_subscriptions` | `Customer.subscriptionStartedAt/lastPaymentAt/subscriptionExempt` + tabla `SubscriptionPayment`. A los clientes existentes `subscriptionStartedAt` les queda en el momento del deploy: nadie se bloquea al deployar, pero **hay que registrar los pagos reales después** (ver GUIA_DEPLOY). |
| `20261025180000_app_settings` | Tabla `AppSettings` (WhatsApp y precios de planes), vacía. No toca datos existentes. |
| `20261025200000_cashflow_paid_from_cash` | `CashFlow.paidFromCash BOOLEAN NOT NULL DEFAULT true`. Los gastos existentes quedan como "de la caja" (el comportamiento de antes). Segura con datos. |

---

## Observaciones conocidas del schema

- **Los datos no se borran solos** (desde el 25-oct-2026). Antes, `cleanupOldSales` y
  `cleanupOldPurchases` borraban cada 24 h las ventas, los pedidos y los gastos "Compras" de más de
  2 meses de todas las sucursales. Ahora todo se conserva: la base crece con el uso (≈ 2 KB por
  venta con sus ítems) y conviene vigilar el disco del VPS.

- `Product.barcode`/`sku` son únicos globales: un producto propio no puede reutilizar el código de
  barras de otro cliente, y un global que se clona como propio pierde su código en la copia.
- `KioskProduct.stock` no tiene `CHECK >= 0` en la base: lo garantiza la API, que descuenta stock
  con `updateMany` condicionado (`stock >= cantidad`).
- `Purchase` y `CashRegister` no tienen `kioskId` directo; se aíslan vía `Supplier.kioskId` y `User.kioskId`.
- Montos en `Float`: aceptable para un kiosco, pero los redondeos se hacen a mano (`Math.round(x * 100) / 100`).
