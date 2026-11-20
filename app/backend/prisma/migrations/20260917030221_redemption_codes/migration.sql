-- PointRedemption pasa de "descuento aplicado al toque" a un cupón con
-- código (numérico + código de barra) que hay que canjear en una venta
-- futura. La tabla está vacía en este punto, así que "code" se agrega
-- NOT NULL directo sin necesitar backfill.

-- AlterTable
ALTER TABLE "PointRedemption" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountAmount" DOUBLE PRECISION,
ADD COLUMN     "redemptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PointRedemption_code_key" ON "PointRedemption"("code");

-- CreateIndex
CREATE INDEX "PointRedemption_clientId_idx" ON "PointRedemption"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_redemptionId_key" ON "Sale"("redemptionId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "PointRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
