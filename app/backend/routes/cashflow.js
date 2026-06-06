// src/routes/cashflow.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const cashFlowRouter = Router();
cashFlowRouter.use(requireAuth);

cashFlowRouter.get('/', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') from = new Date(now.getTime() - 7 * 86400000);

    const flows = await prisma.cashFlow.findMany({
      where: { date: { gte: from } },
      include: { user: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });

    const totals = flows.reduce(
      (acc, f) => {
        if (f.type === 'INCOME') acc.income += parseFloat(f.amount);
        else acc.expense += parseFloat(f.amount);
        return acc;
      },
      { income: 0, expense: 0 }
    );

    res.json({ flows, totals: { ...totals, balance: totals.income - totals.expense } });
  } catch (err) { next(err); }
});

cashFlowRouter.post('/', async (req, res, next) => {
  try {
    const { type, amount, concept, category, date } = req.body;
    const flow = await prisma.cashFlow.create({
      data: {
        userId: req.user.id,
        type,
        amount: parseFloat(amount),
        concept,
        category,
        date: date ? new Date(date) : undefined,
      },
    });
    res.status(201).json(flow);
  } catch (err) { next(err); }
});

cashFlowRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.cashFlow.delete({ where: { id: parseInt(req.params.id) } });
    res.status(204).end();
  } catch (err) { next(err); }
});
