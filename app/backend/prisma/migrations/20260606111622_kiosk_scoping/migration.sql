/*
  Warnings:

  - Added the required column `kioskId` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kioskId` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kioskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
  INSERT INTO "new_Client" ("createdAt", "id", "kioskId", "name", "phone", "points", "totalSpent", "updatedAt")
  SELECT
    "Client"."createdAt",
    "Client"."id",
    (SELECT "id" FROM "Kiosk" ORDER BY "createdAt" ASC LIMIT 1),
    "Client"."name",
    "Client"."phone",
    "Client"."points",
    "Client"."totalSpent",
    "Client"."updatedAt"
  FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE INDEX "Client_kioskId_idx" ON "Client"("kioskId");
CREATE UNIQUE INDEX "Client_kioskId_phone_key" ON "Client"("kioskId", "phone");
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kioskId" TEXT NOT NULL,
    "saleId" TEXT,
    "invoiceType" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
  INSERT INTO "new_Invoice" ("createdAt", "id", "kioskId", "invoiceNumber", "invoiceType", "saleId", "status", "total")
  SELECT
    "Invoice"."createdAt",
    "Invoice"."id",
    COALESCE((SELECT "kioskId" FROM "Sale" WHERE "Sale"."id" = "Invoice"."saleId" LIMIT 1), (SELECT "id" FROM "Kiosk" ORDER BY "createdAt" ASC LIMIT 1)),
    "Invoice"."invoiceNumber",
    "Invoice"."invoiceType",
    "Invoice"."saleId",
    "Invoice"."status",
    "Invoice"."total"
  FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_kioskId_idx" ON "Invoice"("kioskId");
CREATE INDEX "Invoice_kioskId_createdAt_idx" ON "Invoice"("kioskId", "createdAt");
CREATE INDEX "Invoice_saleId_idx" ON "Invoice"("saleId");
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
