# Contexto de la aplicación

Este documento sirve como referencia rápida antes de hacer cambios en la app. La idea es que puedas pasarme este archivo junto con la tarea para que yo entienda mejor la estructura, las reglas de negocio y dónde tocar el código sin romper el resto.

## Stack y estructura general

- Frontend: React + Vite + Tailwind CSS.
- Backend: Node.js + Express + Prisma.
- La aplicación está organizada en dos carpetas principales:
  - `app/frontend`: interfaz web.
  - `app/backend`: API, lógica de negocio y base de datos.

## Modelo mental del negocio

La app trabaja con una arquitectura multi-negocio / multi-kiosco:

- `Customer`: representa el cliente o negocio principal.
- `Kiosk`: representa una sucursal o punto de venta dentro de ese cliente.
- `Product`: es el catálogo global de productos, reutilizable entre kioscos.
- `KioskProduct`: es el stock real por kiosco. Acá vive la relación entre producto, precio y cantidad.

Regla importante:

- No se deben duplicar productos globales para simular stock local.
- Si un producto entra al stock de un kiosco, debe representarse con `KioskProduct`.
- Los productos globales pueden existir sin stock en un kiosco.

## Reglas que conviene respetar al modificar

- Si un cambio afecta stock, primero revisar si corresponde a `Product` o a `KioskProduct`.
- Si un cambio afecta ventas, revisar que se use sólo stock del kiosco actual.
- Si un cambio afecta proveedores o pedidos, validar que no se arrastren productos inexistentes o inactivos.
- Si una pantalla muestra listas de productos, distinguir entre catálogo global y productos efectivamente en stock.

## Archivos importantes

- Backend principal: `app/backend/index.js`.
- Prisma schema: `app/backend/prisma/schema.prisma`.
- Seed de catálogo global: `app/backend/prisma/catalog-products.json` y scripts relacionados en `app/backend/prisma`.
- Rutas principales:
  - `app/backend/routes/products.js`
  - `app/backend/routes/sales.js`
  - `app/backend/routes/suppliers.js`
  - `app/backend/routes/clients.js`
  - `app/backend/routes/cashflow.js`
- Frontend principal: `app/frontend/src/App.jsx`.
- Pantallas y modales: `app/frontend/src/components/screens`.
- UI compartida: `app/frontend/src/components/ui`.

## Documentos de Deploy y Producción

- **DEPLOY.md**: Guía paso a paso para deploy en Hostinger KVN2 (setup servidor, Nginx, SSL, PM2, etc)
- **PRODUCTION.md**: Mejores prácticas de seguridad, performance, monitoreo, backups y troubleshooting
- **pre-deploy-check.sh**: Script para verificar que no hay archivos sensibles antes de hacer push
- **.gitignore**: Configurado para excluir `.env`, `node_modules`, bases de datos, etc

## Mapa rápido de módulos

### Backend

- `routes/products.js`: productos, stock, catálogo, altas y ajustes relacionados.
- `routes/sales.js`: registro de ventas y armado de items de venta.
- `routes/suppliers.js`: proveedores, relaciones con productos y pedidos.
- `routes/clients.js`: clientes y perfiles de cliente.
- `routes/cashflow.js`: ingresos, egresos y movimientos de caja.
- `routes/cashRegister.js`: arqueo y apertura/cierre de caja.
- `routes/invoices.js`: facturación y comprobantes.
- `routes/reports.js`: reportes y métricas.
- `routes/auth.js`: autenticación.
- `routes/admin.js`: funciones administrativas.

### Frontend

- `App.jsx`: ruteo principal de la aplicación.
- `StockPage.jsx`: pantalla de stock y catálogo operativo.
- `SalePage.jsx`: registrar venta.
- `CatalogPage.jsx`: catálogo general / administración de productos.
- `SuppliersPage.jsx`: listado de proveedores.
- `SupplierDetailPage.jsx`: detalle y gestión de proveedor/pedidos.
- `ClientsPage.jsx` y `ClientDetailPage.jsx`: clientes y puntos asociados.
- `HistoryPage.jsx`: historial de ventas.
- `PricesPage.jsx`: lista de precios.
- `CashFlowPage.jsx`: flujo de caja.
- `CashRegisterPage.jsx`: caja / arqueo.
- `ReportsPage.jsx`: reportes.
- `AfipPage.jsx`: facturación.
- `LoginPage.jsx` y `AdminLoginPage.jsx`: acceso.

## Flujos principales

### 1. Catálogo y stock

- El catálogo global vive en `Product`.
- El stock real por kiosco vive en `KioskProduct`.
- Si un producto aparece en una lista de stock, hay que verificar que venga del kiosco actual.
- Si se crea un producto para un kiosco, no debería duplicarse el catálogo global.

### 2. Ventas

- La venta se registra contra un kiosco y un usuario.
- Cada venta guarda sus items en `SaleItem`.
- Los items de venta deben tomar el producto correcto y el precio vigente al momento de vender.
- Si una pantalla de venta busca productos, normalmente debe mostrar solo lo disponible para ese kiosco.

### 3. Proveedores y pedidos

- `Supplier` está asociado al kiosco.
- `SupplierProduct` define qué productos puede entregar un proveedor y su costo de referencia.
- Si se arma un pedido, conviene validar que los productos existan, estén activos y sean coherentes con el kiosco.
- Si un pedido se marca como recibido, debería impactar en el stock del kiosco correspondiente.

### 4. Clientes y fidelización

- `Client` pertenece a un kiosco.
- Las ventas pueden estar asociadas a un cliente.
- El esquema incluye puntos y canjes, así que cualquier cambio de venta puede afectar acumulación o redención.

### 5. Caja y reportes

- Los movimientos de caja se guardan por kiosco.
- Los reportes suelen depender de ventas, caja y filtros por fecha.
- Si un cambio toca números, revisar si también impacta en reportes o arqueos.

## Qué revisar según el tipo de cambio

- Si el cambio es de stock: revisar `products.js`, `StockPage.jsx` y `StockProductModal.jsx`.
- Si el cambio es de venta: revisar `sales.js` y `SalePage.jsx`.
- Si el cambio es de proveedor/pedido: revisar `suppliers.js` y `SupplierDetailPage.jsx`.
- Si el cambio es de cliente: revisar `clients.js` y las pantallas de clientes.
- Si el cambio es de caja: revisar `cashflow.js` y `cashRegister.js`.
- Si el cambio es de estructura de datos: revisar `schema.prisma` antes de tocar lógica.

## Reglas por pantalla

### `venta` / `SalePage`

- Debe mostrar sólo productos disponibles para el kiosco activo.
- La búsqueda debería priorizar nombre, ID/SKU y disponibilidad real.
- Si un producto no tiene stock, no debería entrar al carrito.
- Si no existe en stock, la pantalla puede ofrecer crear un producto propio según la lógica de negocio vigente.

### `stock` / `StockPage`

- Debe representar el stock operativo del kiosco, no el catálogo global completo.
- La tabla tiene que mostrar claramente origen, precio, stock y estado.
- Si un producto pertenece al catálogo global pero todavía no está agregado al kiosco, debe mostrarse como disponible para agregar, no como duplicado.

### `stock/nuevo` y `stock/producto/:id` / `ProductFormPage`

- Sirven para crear o editar productos vinculados al contexto de stock.
- Cualquier ajuste de precio, pack o unidades debe respetar la separación entre producto maestro y stock local.
- Si el flujo viene desde stock, la pantalla debe volver a stock al guardar cuando corresponda.

### `catalogo` / `CatalogPage`

- Es la vista más cercana al catálogo general.
- No debería confundirse con la pantalla de stock operativo.
- Si se cambia algo acá, revisar si también impacta en ventas o en el alta de productos al kiosco.

### `proveedores` y `proveedores/:id`

- El listado de proveedores debe estar asociado al kiosco actual.
- El detalle del proveedor suele concentrar productos, pedidos y costos.
- Si se arma un pedido, no deberían quedar seleccionados productos inexistentes, inactivos o fuera del alcance del kiosco.

### `clientes` y `clientes/:id`

- Estas pantallas dependen del plan habilitado para el cliente.
- El detalle de cliente debe mantener coherencia con ventas, puntos y consumos.

### `caja`, `caja-flujo`, `resultados` y `historial`

- Estas vistas dependen de la consistencia de ventas y movimientos de caja.
- Si cambia la forma de registrar una venta, revisar el impacto en historial, caja y reportes.

### `afip`

- Es una vista sensible a datos fiscales y a la venta ya confirmada.
- Si cambia la estructura de venta, revisar compatibilidad con facturación.

## Convenciones útiles

- Cuando hay duda entre catálogo y stock, asumir que `Product` es la entidad maestra y `KioskProduct` es la operación local.
- Si una pantalla mezcla globales con locales, revisar el filtro de origen antes de cambiar el diseño.
- Si un total o precio no actualiza, revisar primero el cálculo en el componente y después la persistencia en backend.
- Si algo parece duplicado, revisar seed, alta de productos y cualquier flujo que pueda estar creando nuevos registros en vez de reutilizar uno existente.

## Estado esperado del proyecto

- La base está pensada para trabajar con un catálogo global reutilizable.
- Los kioscos manejan su propio stock, precios y operación diaria.
- Las pantallas deberían reflejar esa separación sin mezclar productos globales con stock local salvo que el flujo lo requiera explícitamente.

## Cómo pedir cambios

Si vas a pedirme una modificación, idealmente pasame:

1. Pantalla o flujo afectado.
2. Qué está pasando hoy.
3. Qué debería pasar.
4. Si lo sabés, el archivo o componente donde creés que está el problema.
5. Si el cambio toca backend, frontend o ambos.

Con eso puedo ubicar más rápido el punto exacto y hacer el cambio mínimo necesario.

## Cómo reportar bugs

Cuando algo esté roto o se vea raro, conviene incluir:

- Paso a paso para reproducirlo.
- Qué resultado esperabas.
- Qué resultado obtuviste.
- Si aparece un error visual, de consola o de red.
- Si el problema afecta stock, ventas, pedidos, caja o clientes.

## Cómo describir features

Si querés agregar o cambiar una funcionalidad, pasame:

- Objetivo de la funcionalidad.
- Dónde debería vivir en la app.
- Qué datos usa y qué datos guarda.
- Qué reglas de negocio tiene.
- Qué pantallas o rutas toca.

## Checklist para nuevas tareas

Copiá y completá este formato cuando quieras pedirme un cambio:

- [ ] Pantalla o flujo afectado.
- [ ] Qué está pasando hoy.
- [ ] Qué debería pasar.
- [ ] Si hay error, bug o comportamiento raro, describirlo.
- [ ] Archivo o componente donde creés que está el problema.
- [ ] Si el cambio toca backend, frontend o ambos.
- [ ] Si hay datos que no deberían duplicarse, eliminarse o mezclarse.
- [ ] Si el cambio afecta stock, ventas, pedidos, caja o clientes.

Si no sabés el archivo exacto, alcanza con describir bien la pantalla y el comportamiento; yo me encargo de ubicar el código.

## Plantilla corta

Si querés mandar algo rápido, podés usar esto:

- Pantalla/flujo:
- Qué pasa hoy:
- Qué debería pasar:
- Archivo si lo sabés:
- Alcance: backend / frontend / ambos

## Formulario listo para copiar

```text
Pantalla/flujo:
Qué pasa hoy:
Qué debería pasar:
Archivo si lo sabés:
Alcance: backend / frontend / ambos
Datos involucrados:
Si afecta stock / ventas / pedidos / caja / clientes:
```

## Criterio práctico para revisar antes de tocar algo

Antes de editar, suelo verificar:

- el modelo o ruta que decide el comportamiento,
- el componente de frontend que dispara la acción,
- y si hay reglas de negocio relacionadas con stock, ventas, catálogo o pedidos.

## Nota para futuras modificaciones

Si la estructura del proyecto cambia, conviene actualizar este archivo para que siga sirviendo como contexto rápido.