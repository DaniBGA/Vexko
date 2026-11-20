-- Proveedor: el nombre pasa a ser único por sucursal en vez de global (antes
-- un cliente no podía crear "Arcor" si otro cliente ya lo tenía). No pierde
-- datos: con la restricción global vieja no puede haber duplicados dentro de
-- una misma sucursal, así que el índice nuevo siempre se puede crear.

-- DropIndex
DROP INDEX "Supplier_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_kioskId_name_key" ON "Supplier"("kioskId", "name");

-- Costo unitario guardado en cada línea de venta, para que los reportes usen
-- el costo del momento de la venta y no el costo actual del producto.

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "unitCost" DOUBLE PRECISION;

-- Backfill de las ventas ya registradas con el mejor dato disponible hoy: el
-- costo de la sucursal (KioskProduct.cost) o, si no hay, el del producto.
-- Es una aproximación (el costo puede haber cambiado desde la venta), pero es
-- el mismo valor que los reportes usaban hasta ahora para esas ventas.
UPDATE "SaleItem" AS si
SET "unitCost" = COALESCE(kp."cost", p."costPrice")
FROM "Sale" AS s, "Product" AS p
LEFT JOIN "KioskProduct" AS kp ON kp."productId" = p."id"
WHERE si."saleId" = s."id"
  AND si."productId" = p."id"
  AND (kp."kioskId" = s."kioskId" OR kp."id" IS NULL);
