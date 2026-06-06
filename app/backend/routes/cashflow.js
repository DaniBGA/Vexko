// src/routes/cashflow.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const cashFlowRouter = Router();
cashFlowRouter.use(requireAuth);

cashFlowRouter.get('/', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || '10', 10) || 10));
    const now = new Date();
    let from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') from = new Date(now.getTime() - 7 * 86400000);

    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ flows: [], totals: { income: 0, expense: 0, balance: 0 }, page, limit, total: 0, totalPages: 0 });
    }

    const where = { kioskId: kiosk.id, createdAt: { gte: from } };
    const [flows, total, totalsByType] = await Promise.all([
      prisma.cashFlow.findMany({
        where,
        include: { kiosk: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cashFlow.count({ where }),
      prisma.cashFlow.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
      }),
    ]);

    const totals = totalsByType.reduce(
      (acc, f) => {
        const amount = f._sum.amount ? parseFloat(f._sum.amount) : 0;
        if (f.type === 'INCOME') acc.income += amount;
        else acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.json({
      flows,
      totals: { ...totals, balance: totals.income - totals.expense },
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) { next(err); }
});

cashFlowRouter.post('/', async (req, res, next) => {
  try {
    const { type, amount, concept, category, date } = req.body;
    const kiosk = await resolveRequestKiosk(req);
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
