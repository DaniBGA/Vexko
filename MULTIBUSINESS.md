# 🏪 Modelo Multi-Negocio - Documentación

**Fecha:** 26 de mayo de 2026  
**Versión:** 0.2.0 (Multi-Business Edition)

---

## 📋 Resumen

El sistema ha sido rediseñado para soportar:
- ✅ **Múltiples clientes** con múltiples kioscos/negocios
- ✅ **Catálogo global de productos** (sin duplicación)
- ✅ **Inventario por kiosco** (cada negocio tiene sus propios stocks)
- ✅ **Productos personalizados** (clientes pueden agregar sus propios productos)
- ✅ **Precios ajustables por kiosco** (mismo producto, precios diferentes por sucursal)

---

## 🏗️ Arquitectura del Modelo

### Antes (Monolítico)
```
Kiosk (1)
  ├── Products (locales)
  ├── Categories (locales)
  ├── Sales
  └── Suppliers
```

### Ahora (Multi-Negocio)
```
Customer (múltiples negocios)
  ├── Kiosk 1 (Sucursal A)
  │   ├── KioskProduct (inventario local)
  │   ├── Sales
  │   └── Suppliers
  ├── Kiosk 2 (Sucursal B)
  │   ├── KioskProduct (inventario local)
  │   ├── Sales
  │   └── Suppliers
  └── Kiosk N...

Products (Catálogo Global)
  ├── Productos estándar (compartidos)
  └── Productos personalizados (por cliente)

Categories (Global)
```

---

## 🗄️ Esquema de Base de Datos

### Nuevas Tablas

#### `Customer`
Representa un cliente que puede tener múltiples kioscos.

```sql
id           STRING (PK)
name         STRING (UNIQUE)     -- Nombre del negocio principal
email        STRING (UNIQUE)
phone        STRING
address      STRING
createdAt    TIMESTAMP
updatedAt    TIMESTAMP
```

#### `Kiosk`
Un negocio/sucursal del cliente. Un customer puede tener múltiples kioscos.

```sql
id           STRING (PK)
name         STRING
address      STRING
phone        STRING
customerId   STRING (FK) → Customer
createdAt    TIMESTAMP
updatedAt    TIMESTAMP

UNIQUE(customerId, name)  -- Nombre único por cliente
```

#### `KioskProduct` (NUEVA - Relación)
Mapea productos al inventario específico de cada kiosco.

```sql
id           STRING (PK)
kioskId      STRING (FK) → Kiosk
productId    STRING (FK) → Product
stock        INT              -- Inventario del kiosco
minStock     INT              -- Stock mínimo
price        FLOAT            -- Precio específico del kiosco
createdAt    TIMESTAMP
updatedAt    TIMESTAMP

UNIQUE(kioskId, productId)
```

### Tablas Modificadas

#### `Product` (Ahora Global)
Catálogo global de productos. Un producto existe una sola vez y se reutiliza en múltiples kioscos.

```sql
id           STRING (PK)
name         STRING
description  STRING
barcode      STRING (UNIQUE)
sku          STRING (UNIQUE)
basePrice    FLOAT      -- Precio base (puede variar por kiosco)
baseCost     FLOAT      -- Costo base
categoryId   STRING (FK) → Category
isCustom     BOOLEAN             -- ¿Es personalizado?
customerId   STRING (FK)?        -- Si es personalizado, del cliente
createdAt    TIMESTAMP
updatedAt    TIMESTAMP
```

**Cambios:**
- ❌ Removido: `kioskId` (ya no está vinculado a un kiosco)
- ❌ Removido: `stock` (ahora en KioskProduct)
- ❌ Removido: `minStock` (ahora en KioskProduct)
- ✨ Nuevo: `basePrice` (antes era `price`)
- ✨ Nuevo: `baseCost` (antes era `cost`)
- ✨ Nuevo: `isCustom` (para productos del cliente)
- ✨ Nuevo: `customerId` (cliente propietario de productos custom)

#### `Category` (Ahora Global)
```sql
id           STRING (PK)
name         STRING (UNIQUE)
description  STRING
createdAt    TIMESTAMP
updatedAt    TIMESTAMP
```

**Cambios:**
- ❌ Removido: `kioskId` (ahora es global)

#### `Sale` (Sin cambios en estructura)
```sql
id            STRING (PK)
date          TIMESTAMP
total         FLOAT
paymentMethod STRING
kioskId       STRING (FK) → Kiosk  -- Enlazado al kiosco específico
createdAt     TIMESTAMP
updatedAt     TIMESTAMP
```

### Relaciones de Integridad

```
Customer (1) ---> (M) Kiosk
Kiosk (1) ---> (M) KioskProduct
Product (1) ---> (M) KioskProduct
Product (M) ---> (1) Category
Kiosk (1) ---> (M) Sale
Sale (1) ---> (M) SaleItem
SaleItem (M) ---> (1) Product
```

---

## 📊 Ejemplos de Casos de Uso

### Caso 1: Cliente con múltiples sucursales

```
Customer: "Don Roberto"
├── Kiosk: "Centro"
│   ├── Producto: "Coca Cola" → Stock: 50, Precio: $2.50
│   └── Producto: "Chicles" → Stock: 200, Precio: $0.50
└── Kiosk: "Zona Norte"
    ├── Producto: "Coca Cola" → Stock: 30, Precio: $3.00  (precio diferente!)
    └── Producto: "Chicles" → Stock: 150, Precio: $0.50
```

**Beneficios:**
- Un único "Coca Cola" en la base de datos
- Stock diferente por sucursal
- Precios pueden variar por sucursal

---

### Caso 2: Producto personalizado del cliente

```
Product:
├── id: "prod_xyz"
├── name: "Papas Fritas Caseras"
├── isCustom: true
├── customerId: "cust_123"  (Solo disponible para Don Roberto)
└── categoryId: "cat_snacks"

KioskProduct:
├── kioskId: "kiosk_centro"
├── productId: "prod_xyz"
├── stock: 50
└── price: $1.20
```

**Ventajas:**
- El cliente puede cargar sus propios productos
- No aparecen en el catálogo global
- Cada cliente tiene su catálogo privado

---

### Caso 3: Compartir productos entre clientes

```
Product: "Red Bull" (global)
├── isCustom: false
├── customerId: null

KioskProduct: Distribuido en múltiples kioscos de múltiples clientes
├── Kiosk Centro (Don Roberto) → Stock 20
├── Kiosk Zona Norte (Don Roberto) → Stock 15
├── Kiosk Sucursal 1 (María) → Stock 25
└── Kiosk Sucursal 2 (María) → Stock 30
```

---

## 🔌 API Endpoints

### Clientes

```
GET    /api/clientes                  # Listar todos
GET    /api/clientes/:id              # Obtener uno
POST   /api/clientes                  # Crear
PUT    /api/clientes/:id              # Actualizar
DELETE /api/clientes/:id              # Eliminar (si no tiene ventas)
```

### Kioscos

```
GET    /api/kioscos                   # Listar todos
GET    /api/kioscos/:id               # Obtener uno
GET    /api/clientes/:customerId/kioscos  # Kioscos de un cliente
POST   /api/kioscos                   # Crear
PUT    /api/kioscos/:id               # Actualizar
DELETE /api/kioscos/:id               # Eliminar (si no tiene ventas)
```

### Productos (Global)

```
GET    /api/productos                 # Catálogo global (+ custom del cliente)
GET    /api/productos?custom=true     # Solo personalizados
GET    /api/productos/:id             # Obtener uno
POST   /api/productos                 # Crear nuevo
PUT    /api/productos/:id             # Actualizar
DELETE /api/productos/:id             # Eliminar
```

### Inventario por Kiosco

```
GET    /api/kioscos/:kioskId/productos              # Stock del kiosco
POST   /api/kioscos/:kioskId/productos              # Agregar producto al kiosco
PUT    /api/kioscos/:kioskId/productos/:productId   # Actualizar stock/precio
DELETE /api/kioscos/:kioskId/productos/:productId   # Remover del kiosco
```

### Ventas por Kiosco

```
GET    /api/ventas                    # Todas las ventas
GET    /api/kioscos/:kioskId/ventas   # Ventas del kiosco
GET    /api/ventas/stats              # Estadísticas globales
GET    /api/kioscos/:kioskId/ventas/stats  # Estadísticas del kiosco
POST   /api/ventas                    # Registrar venta
```

### Proveedores

```
GET    /api/proveedores               # Todos
GET    /api/kioscos/:kioskId/proveedores  # Por kiosco
GET    /api/proveedores/:id           # Obtener uno
POST   /api/proveedores               # Crear
PUT    /api/proveedores/:id           # Actualizar
DELETE /api/proveedores/:id           # Eliminar
```

---

## 🔄 Flujos de Transacciones

### Flujo 1: Registrar Venta (actualiza stock correcto)

```
1. Cliente selecciona kiosco: "Centro"
2. Agrega producto "Coca Cola" x 10
3. POST /api/ventas
   {
     kioskId: "kiosk_centro",
     items: [
       { productId: "prod_coca", quantity: 10, unitPrice: 2.50, subtotal: 25 }
     ]
   }
4. Sistema:
   ✓ Crea Sale con kioskId
   ✓ Actualiza KioskProduct (Centro) stock: 50 - 10 = 40
   ✓ No afecta KioskProduct (Zona Norte)
```

---

### Flujo 2: Agregar Producto Personalizado

```
1. Cliente "Don Roberto" quiere vender "Papas Fritas Caseras"
2. POST /api/productos
   {
     name: "Papas Fritas Caseras",
     basePrice: 1.20,
     baseCost: 0.50,
     categoryId: "cat_snacks",
     isCustom: true,
     customerId: "cust_donroberto"
   }
3. Producto creado con customerId
4. Sistema:
   ✓ Aparece en catálogo de Don Roberto
   ✓ No aparece en catálogo de otros clientes
5. Agregar a kiosco:
   POST /api/kioscos/kiosk_centro/productos
   { productId: "prod_papas", stock: 50, price: 1.20 }
```

---

### Flujo 3: Cambiar Precio por Sucursal

```
1. Producto "Coca Cola" tiene basePrice: $2.50
2. Centro vende a $2.50, Zona Norte a $3.00
3. PUT /api/kioscos/kiosk_centro/productos/prod_coca
   { price: 2.50 }
   PUT /api/kioscos/kiosk_norte/productos/prod_coca
   { price: 3.00 }
4. Sistema:
   ✓ Cada sucursal tiene su precio
   ✓ Cuando se vende, usa el price de KioskProduct
```

---

## 📈 Ventajas del Nuevo Modelo

| Ventaja | Implementación |
|---------|----------------|
| **Sin duplicación** | Un producto = una fila en BD |
| **Escalable** | Soporta 1000+ kioscos fácilmente |
| **Flexible** | Precios y stocks variables por kiosco |
| **Privacidad** | Productos personalizados por cliente |
| **Reporting** | Estadísticas por kiosco, cliente o global |
| **Eficiencia** | Menos datos, más performance |

---

## ⚠️ Consideraciones de Migración

Si tienes datos existentes:

1. **Crear clientes** a partir de kioscos actuales
2. **Migrar productos** quitando kioskId
3. **Crear KioskProducts** con stock/price de productos antiguos
4. **Vincular relaciones** (Sales, Suppliers)

```sql
-- Ejemplo pseudocódigo
INSERT INTO Customer (id, name) VALUES ('cust_1', 'Don Roberto');
UPDATE Kiosk SET customerId = 'cust_1' WHERE id = 'kiosk_centro';
INSERT INTO KioskProduct (kioskId, productId, stock, minStock, price)
  SELECT kioskId, id, stock, minStock, price FROM Product WHERE kioskId = 'kiosk_centro';
```

---

## 🔐 Validaciones Importantes

- ✅ No puedes eliminar cliente si tiene ventas
- ✅ No puedes eliminar kiosco si tiene ventas
- ✅ No puedes agregar producto inexistente a kiosco
- ✅ Barcodes deben ser únicos globalmente
- ✅ Nombre de kiosco único por cliente (no por sistema)
- ✅ Nombre de cliente único globalmente

---

## 📚 Tipos TypeScript

```typescript
// Customer con kioscos
type CustomerWithKiosks = {
  id: string
  name: string
  kiosks: Kiosk[]
}

// Producto con disponibilidad en kioscos
type ProductAvailability = {
  id: string
  name: string
  basePrice: number
  kioskProducts: KioskProduct[]  // Stock y precio en cada kiosco
}

// Kiosco con inventario
type KioskInventory = {
  id: string
  name: string
  kioskProducts: KioskProduct[]  // Todos los productos disponibles
}
```

---

## 🎯 Próximos Pasos

1. Ejecutar migración de Prisma:
   ```bash
   npm run prisma:migrate -- --name multi_business
   ```

2. Crear datos de ejemplo:
   ```bash
   npm run prisma:seed  # (crear seed.ts)
   ```

3. Probar endpoints en Postman/Insomnia

4. Actualizar documentación de API

---

*Documentación actualizada: 26 de mayo de 2026*
