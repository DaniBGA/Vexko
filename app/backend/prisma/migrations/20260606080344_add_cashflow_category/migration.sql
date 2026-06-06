-- AlterTable
ALTER TABLE "CashFlow" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "CashFlow_category_idx" ON "CashFlow"("category");
