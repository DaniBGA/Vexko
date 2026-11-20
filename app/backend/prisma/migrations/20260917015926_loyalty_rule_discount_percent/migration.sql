-- Renombra discountAmount (un monto fijo en pesos) a discountPercent: la
-- regla de fidelización ahora define un porcentaje de descuento en vez de un
-- monto fijo. Es un rename, no un add-column, así que preserva los valores
-- existentes (en dev son solo datos de prueba).
ALTER TABLE "LoyaltyRule" RENAME COLUMN "discountAmount" TO "discountPercent";
