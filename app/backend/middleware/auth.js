// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { getSubscriptionStatus, SUBSCRIPTION_SELECT } from '../lib/subscription.js';

// Con la suscripción vencida solo se permite /api/auth/* (login y /me): el
// front necesita /me para saber POR QUÉ está bloqueado y mostrar la pantalla
// de suscripción vencida en vez de un error.
const SUBSCRIPTION_ALLOWED_PREFIX = '/api/auth/';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { kiosk: { include: { customer: { select: { id: true, name: true, plan: true, ...SUBSCRIPTION_SELECT } } } } },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inválido o inactivo' });
    }
    // El login ya rechaza una sucursal desactivada, pero un token emitido
    // antes de desactivarla seguía sirviendo hasta que venciera (7 días): la
    // sucursal podía seguir vendiendo. 401 para que el front cierre la sesión.
    if (user.kioskId && user.kiosk && !user.kiosk.active) {
      return res.status(401).json({ error: 'La sucursal está desactivada' });
    }
    // Suscripción vencida (pasaron los 10 días de gracia): se bloquea en el
    // backend, no solo en la pantalla, así no se puede seguir operando
    // llamando a la API directo. 402 (y no 401) para que el front NO cierre la
    // sesión sino que muestre la pantalla de "suscripción vencida".
    if (user.kiosk?.customer) {
      const subscription = getSubscriptionStatus(user.kiosk.customer);
      if (subscription.status === 'BLOCKED' && !req.originalUrl.startsWith(SUBSCRIPTION_ALLOWED_PREFIX)) {
        return res.status(402).json({
          error: 'La suscripción a VEXKO está vencida. Regularizá el pago para volver a usar el sistema.',
          code: 'SUBSCRIPTION_BLOCKED',
          subscription,
        });
      }
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Solo el dueño puede realizar esta acción' });
  }
  next();
}

export async function resolveRequestKiosk(req) {
  if (req.user?.kioskId) {
    return prisma.kiosk.findUnique({
      where: { id: req.user.kioskId },
      include: { customer: { select: { id: true, name: true, plan: true } } },
    });
  }

  return null;
}
