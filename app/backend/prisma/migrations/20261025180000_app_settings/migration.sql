-- Configuración global editable desde el panel admin: WhatsApp de contacto y
-- precio mensual de cada plan. Tabla nueva y vacía: no toca datos existentes
-- (sin fila, la landing muestra "Próximamente" y el bloqueo, el texto genérico).

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "whatsappNumber" TEXT,
    "priceBase" DOUBLE PRECISION,
    "priceIntermedio" DOUBLE PRECISION,
    "pricePremium" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

