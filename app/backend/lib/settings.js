// src/lib/settings.js
// Configuración global de VEXKO (modelo AppSettings, fila única "global"):
// WhatsApp de contacto y precio mensual de cada plan.
import { prisma } from '../config/prisma.js';

const SETTINGS_ID = 'global';

// Plan → columna de AppSettings.
export const PLAN_PRICE_FIELDS = {
  BASE: 'priceBase',
  INTERMEDIO: 'priceIntermedio',
  PREMIUM: 'pricePremium',
};

// Se aceptan los formatos que se copian de cualquier lado ("+54 9 249 400-0000",
// "(0249) 15 400 0000"...): se dejan solo los dígitos. wa.me exige el número
// internacional sin "+", ceros ni espacios.
export function normalizeWhatsappNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return { value: null };
  // Formato local ("0249 15 ..."): wa.me no lo entiende y el link no abre el chat.
  if (digits.startsWith('0')) {
    return { error: 'Cargá el WhatsApp con código de país, sin el 0 ni el 15 (ej. +54 9 249 400 0000)' };
  }
  if (digits.length < 10 || digits.length > 15) {
    return { error: 'El WhatsApp tiene que tener el código de país y el número completo (ej. +54 9 249 400 0000)' };
  }
  return { value: digits };
}

export function buildWhatsappUrl(number, text) {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export async function getAppSettings(db = prisma) {
  const row = await db.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    whatsappNumber: row?.whatsappNumber ?? null,
    planPrices: Object.fromEntries(
      Object.entries(PLAN_PRICE_FIELDS).map(([plan, field]) => [plan, row?.[field] ?? null]),
    ),
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function saveAppSettings(data, db = prisma) {
  await db.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  return getAppSettings(db);
}
