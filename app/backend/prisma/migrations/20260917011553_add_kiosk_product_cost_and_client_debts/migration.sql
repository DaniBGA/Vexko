-- AlterTable
ALTER TABLE "KioskProduct" ADD COLUMN     "cost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ClientDebt" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientDebt_clientId_idx" ON "ClientDebt"("clientId");

-- CreateIndex
CREATE INDEX "ClientDebt_kioskId_idx" ON "ClientDebt"("kioskId");

-- CreateIndex
CREATE INDEX "ClientDebt_kioskId_status_idx" ON "ClientDebt"("kioskId", "status");

-- CreateIndex
CREATE INDEX "ClientDebtPayment_debtId_idx" ON "ClientDebtPayment"("debtId");

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebtPayment" ADD CONSTRAINT "ClientDebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "ClientDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
