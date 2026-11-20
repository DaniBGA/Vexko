// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { SUBSCRIPTION_SELECT, withSubscription } from '../lib/subscription.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    // El panel admin guarda los emails en minúsculas: sin normalizar acá,
    // "Sucursal@..." no entraba aunque la contraseña fuera correcta.
    const user = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: 'insensitive' } },
      include: { kiosk: { include: { customer: { select: { id: true, name: true, plan: true, ...SUBSCRIPTION_SELECT } } } } },
    });
    // Mismo mensaje para email inexistente y contraseña incorrecta: antes se
    // distinguían y eso permitía averiguar qué emails tienen cuenta.
    const valid = user ? await bcrypt.compare(String(password), user.passwordHash) : false;
    if (!user || !valid) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }
    // Si es usuario de kiosco, verificar estado de la sucursal
    if (user.kioskId) {
      const kiosk = await prisma.kiosk.findUnique({ where: { id: user.kioskId }, select: { active: true } });
      if (kiosk && !kiosk.active) {
        return res.status(403).json({ error: 'La sucursal está desactivada' });
      }
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    // Con la suscripción vencida el login igual funciona: el front recibe
    // `kiosk.customer.subscription.status === 'BLOCKED'` y muestra la pantalla
    // de suscripción vencida (el resto de la API responde 402).
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kioskId: user.kioskId, kiosk: withSubscription(user.kiosk) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res) => {
  const { id, name, email, role, kioskId, kiosk } = req.user;
  res.json({ id, name, email, role, kioskId, kiosk: withSubscription(kiosk) });
});

// POST /api/auth/register  (solo el dueño puede crear cuentas nuevas)
authRouter.post('/register', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Solo el dueño puede crear cuentas' });
    }
    const { name, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email ya registrado' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: role || 'EMPLOYEE' },
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});