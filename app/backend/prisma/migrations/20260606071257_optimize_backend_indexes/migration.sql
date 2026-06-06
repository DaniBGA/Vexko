-- CreateIndex
CREATE INDEX "CashFlow_type_createdAt_idx" ON "CashFlow"("type", "createdAt");

-- CreateIndex
CREATE INDEX "CashFlow_kioskId_createdAt_idx" ON "CashFlow"("kioskId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_saleId_idx" ON "Invoice"("saleId");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Product_active_isCustom_idx" ON "Product"("active", "isCustom");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_createdAt_idx" ON "Purchase"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_kioskId_createdAt_idx" ON "Sale"("kioskId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_userId_createdAt_idx" ON "Sale"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_paymentMethod_createdAt_idx" ON "Sale"("paymentMethod", "createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_productId_idx" ON "SaleItem"("saleId", "productId");
