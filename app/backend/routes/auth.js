// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    const user = await prisma.user.findUnique({ where: { email }, include: { kiosk: { include: { customer: { select: { id: true, name: true, plan: true } } } } } });
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
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
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kioskId: user.kioskId, kiosk: user.kiosk },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res) => {
  const { id, name, email, role, kioskId, kiosk } = req.user;
  res.json({ id, name, email, role, kioskId, kiosk });
});

// POST /api/auth/register  (solo en setup inicial)
authRouter.post('/register', async (req, res, next) => {
  try {
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