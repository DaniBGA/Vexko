// src/routes/public.js
// Rutas SIN autenticación. Solo datos que se pueden mostrar a cualquiera.
import { Router } from 'express';
import { getAppSettings } from '../lib/settings.js';

export const publicRouter = Router();

// GET /api/public/settings — precios de los planes (landing) y WhatsApp de
// contacto (landing y pantalla de suscripción vencida). Está fuera de
// requireAuth a propósito: la sucursal bloqueada recibe 402 en todo lo demás
// y la landing la ve cualquiera sin login.
publicRouter.get('/settings', async (_req, res, next) => {
  try {
    const { whatsappNumber, planPrices } = await getAppSettings();
    res.json({ whatsappNumber, planPrices });
  } catch (err) {
    next(err);
  }
});
