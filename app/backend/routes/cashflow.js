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

    const kiosk = await prisma.kiosk.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!kiosk) return res.json({ flows: [], totals: { income: 0, expense: 0, balance: 0 } });

    const flows = await prisma.cashFlow.findMany({
      where: { kioskId: kiosk.id, createdAt: { gte: from } },
      include: { kiosk: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
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
    const kiosk = await prisma.kiosk.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const descriptionParts = [];
    if (category) descriptionParts.push(category);
    if (concept) descriptionParts.push(concept);
    const description = descriptionParts.length ? descriptionParts.join(' — ') : null;

    const flow = await prisma.cashFlow.create({
      data: {
        kioskId: kiosk.id,
        type,
        amount: parseFloat(amount),
          description,
          category: category || null,
        createdAt: date ? new Date(date) : undefined,
      },
    });
    res.status(201).json(flow);
  } catch (err) { next(err); }
});

cashFlowRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.cashFlow.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

cashFlowRouter.put('/:id', async (req, res, next) => {
  try {
    const { amount, concept, category, date } = req.body;
    const flow = await prisma.cashFlow.update({
      where: { id: req.params.id },
      data: {
        amount: amount !== undefined ? parseFloat(amount) : undefined,
        description: (category || concept) ? [category, concept].filter(Boolean).join(' — ') : undefined,
        category: category !== undefined ? category : undefined,
        createdAt: date ? new Date(date) : undefined,
      },
    });
    res.json(flow);
  } catch (err) { next(err); }
});
