-- Gastos pagados por fuera de la caja (transferencia, débito...): no se restan del
-- efectivo esperado del arqueo. Los existentes quedan en true (comportamiento anterior).
-- AlterTable
ALTER TABLE "CashFlow" ADD COLUMN     "paidFromCash" BOOLEAN NOT NULL DEFAULT true;
