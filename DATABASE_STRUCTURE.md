# 📊 Estructura de la Base de Datos - Indexación Detallada

## 🗂️ Modelos y Relaciones

### 1. **CUSTOMER** (Clientes / Inquilinos)
- **Tabla**: `customer`
- **Propósito**: Raíz de la arquitectura multi-tenant. Cada cliente puede tener múltiples kioscos.
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único del cliente |
  | `name` | String | UNIQUE | Nombre único del cliente |
  | `email` | String | UNIQUE, nullable | Email del cliente |
  | `phone` | String | nullable | Teléfono |
  | `address` | String | nullable | Dirección |
  | `createdAt` | DateTime | @default(now()) | Fecha de creación |
  | `updatedAt` | DateTime | @updatedAt | Última actualización |

- **Índices**:
  - ✅ `@@index([email])` - Búsqueda rápida por email

- **Relaciones**:
  - → `Kiosk[]` - Un cliente tiene múltiples kioscos
  - → `Product[]` - Productos personalizados del cliente

---

### 2. **KIOSK** (Sucursales / Puntos de Venta)
- **Tabla**: `kiosk`
- **Propósito**: Punto de venta individual. Cada cliente puede tener múltiples kioscos con inventario independiente.
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único del kiosko |
  | `name` | String | - | Nombre del kiosko (ej: "Sucursal Centro") |
  | `address` | String | nullable | Dirección |
  | `phone` | String | nullable | Teléfono |
  | `customerId` | String | FK → Customer | Relación con cliente |
  | `createdAt` | DateTime | @default(now()) | Fecha de creación |
  | `updatedAt` | DateTime | @updatedAt | Última actualización |

- **Índices**:
  - ✅ `@@unique([customerId, name])` - Un kiosko por nombre por cliente
  - ✅ `@@index([customerId])` - Búsqueda rápida de kioscos por cliente

- **Relaciones**:
  - ← Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  - → `KioskProduct[]` - Inventario del kiosko
  - → `Sale[]` - Ventas del kiosko
  - → `Supplier[]` - Proveedores del kiosko
  - → `CashFlow[]` - Movimientos de caja

---

### 3. **CATEGORY** (Categorías de Productos - Global)
- **Tabla**: `category`
- **Propósito**: Categorías globales compartidas por todos los productos.
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `name` | String | UNIQUE | Nombre único de categoría |
  | `description` | String | nullable | Descripción |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@index([name])` - Búsqueda rápida por nombre

- **Relaciones**:
  - → `Product[]` - Productos en esta categoría

---

### 4. **PRODUCT** (Catálogo Global + Productos Personalizados)
- **Tabla**: `product`
- **Propósito**: Catálogo global de productos + productos personalizados por cliente
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `name` | String | - | Nombre del producto |
  | `description` | String | nullable | Descripción |
  | `barcode` | String | UNIQUE, nullable | Código de barras |
  | `sku` | String | UNIQUE, nullable | SKU del producto |
  | `basePrice` | Float | - | Precio base (puede variar por kiosko) |
  | `baseCost` | Float | - | Costo base |
  | `categoryId` | String | FK → Category | Relación con categoría |
  | `isCustom` | Boolean | @default(false) | ¿Es un producto personalizado? |
  | `customerId` | String | FK → Customer, nullable | Si es personalizado, de qué cliente |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@index([categoryId])` - Búsqueda rápida por categoría
  - ✅ `@@index([customerId])` - Búsqueda rápida de productos del cliente
  - ✅ `@@index([isCustom])` - Filtrar globales vs personalizados
  - ✅ `@@unique(barcode)` - Un código de barras único
  - ✅ `@@unique(sku)` - Un SKU único

- **Relaciones**:
  - ← Category @relation(fields: [categoryId], references: [id])
  - ← Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  - → `KioskProduct[]` - Inventario en kioscos
  - → `SaleItem[]` - Items vendidos
  - → `SupplierProduct[]` - Relaciones con proveedores

---

### 5. **KIOSK_PRODUCT** (JOIN TABLE - Inventario por Kiosko)
- **Tabla**: `kiosk_product`
- **Propósito**: Mapea productos a kioscos con inventario y precio específico por kiosko
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `kioskId` | String | FK → Kiosk | Relación con kiosko |
  | `productId` | String | FK → Product | Relación con producto |
  | `stock` | Int | @default(0) | Stock actual en este kiosko |
  | `minStock` | Int | @default(0) | Stock mínimo para alertas |
  | `price` | Float | - | Precio en este kiosko (puede diferir) |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@unique([kioskId, productId])` - Un producto por kiosko (CRÍTICO)
  - ✅ `@@index([kioskId])` - Búsqueda rápida de productos por kiosko
  - ✅ `@@index([productId])` - Búsqueda rápida de kioscos para un producto

- **Relaciones**:
  - ← Kiosk @relation(fields: [kioskId], references: [id], onDelete: Cascade)
  - ← Product @relation(fields: [productId], references: [id], onDelete: Cascade)

- **Notas**: 
  - **CRÍTICA**: Este es el corazón de la arquitectura multi-tenant
  - Permite que el mismo producto tenga diferente stock y precio en cada kiosko
  - Elimina duplicación de productos

---

### 6. **SALE** (Ventas)
- **Tabla**: `sale`
- **Propósito**: Registro de ventas por kiosko con fecha
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `date` | DateTime | @default(now()) | Fecha/hora de venta |
  | `total` | Float | - | Total de la venta |
  | `paymentMethod` | String | - | 'CASH', 'CARD', 'BOTH' |
  | `kioskId` | String | FK → Kiosk | Relación con kiosko |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@index([kioskId])` - Ventas por kiosko
  - ✅ `@@index([date])` - Búsqueda por rango de fechas

- **Relaciones**:
  - ← Kiosk @relation(fields: [kioskId], references: [id])
  - → `SaleItem[]` - Items de esta venta

---

### 7. **SALE_ITEM** (Líneas de Venta)
- **Tabla**: `sale_item`
- **Propósito**: Detalle de cada producto vendido en una venta
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `quantity` | Int | - | Cantidad vendida |
  | `unitPrice` | Float | - | Precio unitario en el momento |
  | `subtotal` | Float | - | quantity × unitPrice |
  | `saleId` | String | FK → Sale | Relación con venta |
  | `productId` | String | FK → Product | Relación con producto |
  | `createdAt` | DateTime | @default(now()) | - |

- **Índices**:
  - ✅ `@@index([saleId])` - Items por venta
  - ✅ `@@index([productId])` - Búsqueda rápida de qué productos se vendieron

- **Relaciones**:
  - ← Sale @relation(fields: [saleId], references: [id], onDelete: Cascade)
  - ← Product @relation(fields: [productId], references: [id])

---

### 8. **SUPPLIER** (Proveedores por Kiosko)
- **Tabla**: `supplier`
- **Propósito**: Proveedores específicos de cada kiosko
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `name` | String | - | Nombre del proveedor |
  | `phone` | String | nullable | Teléfono |
  | `email` | String | nullable | Email |
  | `address` | String | nullable | Dirección |
  | `kioskId` | String | FK → Kiosk | Relación con kiosko |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@index([kioskId])` - Proveedores por kiosko

- **Relaciones**:
  - ← Kiosk @relation(fields: [kioskId], references: [id])
  - → `SupplierProduct[]` - Productos de este proveedor

---

### 9. **SUPPLIER_PRODUCT** (Relación Proveedor-Producto)
- **Tabla**: `supplier_product`
- **Propósito**: Mapea qué proveedores suministran qué productos
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `cost` | Float | - | Costo de compra al proveedor |
  | `leadDays` | Int | nullable | Días de entrega |
  | `supplierId` | String | FK → Supplier | Relación con proveedor |
  | `productId` | String | FK → Product | Relación con producto |
  | `createdAt` | DateTime | @default(now()) | - |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@unique([supplierId, productId])` - Un proveedor por producto
  - ✅ `@@index([supplierId])` - Búsqueda rápida de proveedores
  - ✅ `@@index([productId])` - Búsqueda rápida de quién lo provee

- **Relaciones**:
  - ← Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  - ← Product @relation(fields: [productId], references: [id], onDelete: Cascade)

---

### 10. **CASH_FLOW** (Movimientos de Caja)
- **Tabla**: `cash_flow`
- **Propósito**: Registro de ingresos y egresos por kiosko
- **Campos**:
  | Campo | Tipo | Propiedades | Descripción |
  |-------|------|-------------|-------------|
  | `id` | String | PK, @default(cuid()) | ID único |
  | `type` | String | - | 'INCOME' o 'EXPENSE' |
  | `amount` | Float | - | Monto del movimiento |
  | `description` | String | nullable | Descripción (ej: "Venta 2 Coca") |
  | `kioskId` | String | FK → Kiosk | Relación con kiosko |
  | `createdAt` | DateTime | @default(now()) | Fecha del movimiento |
  | `updatedAt` | DateTime | @updatedAt | - |

- **Índices**:
  - ✅ `@@index([kioskId])` - Movimientos por kiosko
  - ✅ `@@index([type])` - Filtrar ingresos vs egresos
  - ✅ `@@index([createdAt])` - Búsqueda por rango de fechas

- **Relaciones**:
  - ← Kiosk @relation(fields: [kioskId], references: [id])

---

## 📈 Resumen de Índices

| Tabla | Campo(s) | Tipo | Razón |
|-------|----------|------|-------|
| **customer** | email | INDEX | Búsqueda por email |
| **kiosk** | customerId | INDEX | Listar kioscos de un cliente |
| **kiosk** | customerId, name | UNIQUE | Garantizar nombres únicos por cliente |
| **category** | name | INDEX | Búsqueda por nombre |
| **product** | categoryId | INDEX | Productos por categoría |
| **product** | customerId | INDEX | Productos personalizados |
| **product** | isCustom | INDEX | Filtrar globales vs personalizados |
| **product** | barcode | UNIQUE | Código de barras único |
| **product** | sku | UNIQUE | SKU único |
| **kiosk_product** | kioskId, productId | UNIQUE | ⚡ CRÍTICO - Un producto por kiosko |
| **kiosk_product** | kioskId | INDEX | Productos de un kiosko |
| **kiosk_product** | productId | INDEX | Kioscos con un producto |
| **sale** | kioskId | INDEX | Ventas por kiosko |
| **sale** | date | INDEX | Búsqueda por fecha |
| **sale_item** | saleId | INDEX | Items de una venta |
| **sale_item** | productId | INDEX | Qué se vendió |
| **supplier** | kioskId | INDEX | Proveedores del kiosko |
| **supplier_product** | supplierId, productId | UNIQUE | Un proveedor por producto |
| **supplier_product** | supplierId | INDEX | Productos de un proveedor |
| **supplier_product** | productId | INDEX | Proveedores del producto |
| **cash_flow** | kioskId | INDEX | Movimientos del kiosko |
| **cash_flow** | type | INDEX | Ingresos vs Egresos |
| **cash_flow** | createdAt | INDEX | Búsqueda por fecha |

---

## 🎯 Flujo de Datos Clave

### Venta Típica:
```
Customer (Kiosko Don Roberto)
    ↓
Kiosk (Sucursal Centro)
    ↓
KioskProduct (Coca Cola en Sucursal Centro - stock: 45, price: $6.60)
    ↓
Sale (Venta realizada)
    ↓
SaleItem (2x Coca Cola a $6.60 = $13.20)
    ↓
CashFlow (INCOME +$13.20 - Venta 2 Coca)
```

### Búsqueda de Productos:
```
Customer: "Kiosko Don Roberto"
    ↓ customerId
Kiosk: "Sucursal Centro"
    ↓ kioskId
KioskProduct[]: [Coca Cola, Fanta, Papas, ...]
    ↓ productId
Product[]: Datos globales (nombre, barcode, basePrice)
    ↓ categoryId
Category: "Bebidas"
```

---

## 🔒 Integridad Referencial

- ✅ **ON DELETE CASCADE**: Al eliminar un cliente, se eliminan todos sus kioscos, productos, ventas, etc.
- ✅ **ON DELETE CASCADE**: Al eliminar un kiosko, se eliminan sus productos, ventas, proveedores, etc.
- ✅ **ON DELETE CASCADE**: Al eliminar una venta, se eliminan sus items
- ✅ **UNIQUE CONSTRAINTS**: Garantizan datos únicos donde es necesario

---

## 📊 Cardinalidad de Relaciones

```
Customer (1) ──── (Many) Kiosk
Customer (1) ──── (Many) Product (personalizados)

Kiosk (1) ──── (Many) KioskProduct
Kiosk (1) ──── (Many) Sale
Kiosk (1) ──── (Many) Supplier
Kiosk (1) ──── (Many) CashFlow

Category (1) ──── (Many) Product

Product (1) ──── (Many) KioskProduct
Product (1) ──── (Many) SaleItem
Product (1) ──── (Many) SupplierProduct

Sale (1) ──── (Many) SaleItem
Supplier (1) ──── (Many) SupplierProduct
```

---

## 💡 Ventajas de esta Estructura

1. ✅ **Multi-tenant** - Cada cliente aislado
2. ✅ **Sin duplicación** - Un producto existe una sola vez
3. ✅ **Flexibilidad de precios** - Cada kiosko tiene su precio
4. ✅ **Inventario independiente** - Stock diferente por kiosko
5. ✅ **Productos personalizados** - Los clientes pueden crear sus propios
6. ✅ **Auditoría completa** - Toda venta registrada
7. ✅ **Proveedores por kiosko** - Cada sucursal con sus proveedores
