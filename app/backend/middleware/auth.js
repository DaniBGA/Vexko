// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';

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
      include: { kiosk: { include: { customer: { select: { id: true, name: true, plan: true } } } } },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inválido o inactivo' });
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
