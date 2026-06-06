-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kiosk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Kiosk_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Kiosk" ("address", "createdAt", "customerId", "id", "name", "phone", "updatedAt") SELECT "address", "createdAt", "customerId", "id", "name", "phone", "updatedAt" FROM "Kiosk";
DROP TABLE "Kiosk";
ALTER TABLE "new_Kiosk" RENAME TO "Kiosk";
CREATE INDEX "Kiosk_customerId_idx" ON "Kiosk"("customerId");
CREATE UNIQUE INDEX "Kiosk_customerId_name_key" ON "Kiosk"("customerId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
