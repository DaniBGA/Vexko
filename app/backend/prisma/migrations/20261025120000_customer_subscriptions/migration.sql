-- Suscripción mensual por cliente (Customer). subscriptionStartedAt toma la
-- fecha del momento en que corre la migración para TODOS los clientes ya
-- existentes: así nadie queda bloqueado al deployar (si se tomara createdAt,
-- cualquier cliente cargado hace más de 1 mes y 10 días quedaría inhabilitado
-- en el acto). Después del deploy hay que registrar desde el panel admin el
-- último pago real de cada cliente, o marcarlo como exento.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastPaymentAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscriptionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPayment_customerId_paidAt_idx" ON "SubscriptionPayment"("customerId", "paidAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

