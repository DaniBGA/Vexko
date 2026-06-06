// src/routes/cashRegister.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const cashRegisterRouter = Router();
cashRegisterRouter.use(requireAuth);

// Obtener caja activa o historial
cashRegisterRouter.get('/current', async (req, res, next) => {
  try {
    const register = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN' },
      include: { user: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
    });
    res.json(register);
  } catch (err) { next(err); }
});

cashRegisterRouter.get('/', async (req, res, next) => {
  try {
    const registers = await prisma.cashRegister.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });
    res.json(registers);
  } catch (err) { next(err); }
});

// Abrir caja
cashRegisterRouter.post('/open', async (req, res, next) => {
  try {
    const existing = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
    if (existing) return res.status(409).json({ error: 'Ya hay una caja abierta' });
    const register = await prisma.cashRegister.create({
      data: { userId: req.user.id, openingAmount: parseFloat(req.body.openingAmount), notes: req.body.notes },
    });
    res.status(201).json(register);
  } catch (err) { next(err); }
});

// Cerrar caja
cashRegisterRouter.post('/:id/close', async (req, res, next) => {
  try {
    const { actualAmount, notes } = req.body;
    const register = await prisma.cashRegister.findUniqueOrThrow({ where: { id: parseInt(req.params.id) } });
    if (register.status === 'CLOSED') return res.status(400).json({ error: 'Caja ya cerrada' });

    // Calcular esperado: apertura + ventas efectivo - egresos
    const now = new Date();
    const [salesCash, expenses] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { cashAmount: true },
        where: { createdAt: { gte: register.openedAt }, paymentMethod: { in: ['CASH', 'MIXED'] } },
      }),
      prisma.cashFlow.aggregate({
        _sum: { amount: true },
        where: { type: 'EXPENSE', date: { gte: register.openedAt } },
      }),
    ]);

    const cashSales = parseFloat(salesCash._sum.cashAmount || 0);
    const expTotal = parseFloat(expenses._sum.amount || 0);
    const expectedAmount = parseFloat(register.openingAmount) + cashSales - expTotal;
    const actual = parseFloat(actualAmount);
    const difference = actual - expectedAmount;

    const updated = await prisma.cashRegister.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'CLOSED', closedAt: now, expectedAmount, actualAmount: actual, difference, notes },
    });
    res.json(updated);
  } catch (err) { next(err); }
});
