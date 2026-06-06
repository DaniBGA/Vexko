// src/routes/clients.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

clientsRouter.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    const rule = await prisma.loyaltyRule.findFirst({ where: { active: true } });
    const clients = await prisma.client.findMany({
      where,
      orderBy: [{ points: 'desc' }],
      include: {
        _count: { select: { sales: true } },
        sales: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const enriched = clients.map((c) => ({
      ...c,
      pointsToNextRedemption: rule
        ? Math.max(0, parseInt(rule.pointsForDiscount) - c.points)
        : null,
    }));

    res.json({ clients: enriched, loyaltyRule: rule });
  } catch (err) { next(err); }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const [client, rule] = await Promise.all([
      prisma.client.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          sales: {
            include: { items: { include: { product: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          redemptions: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      }),
      prisma.loyaltyRule.findFirst({ where: { active: true } }),
    ]);
    res.json({
      ...client,
      pointsToNextRedemption: rule ? Math.max(0, rule.pointsForDiscount - client.points) : null,
      loyaltyRule: rule,
    });
  } catch (err) { next(err); }
});

clientsRouter.post('/', async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const client = await prisma.client.create({ data: { name, phone } });
    res.status(201).json(client);
  } catch (err) { next(err); }
});

clientsRouter.put('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(client);
  } catch (err) { next(err); }
});

// Canjear puntos
clientsRouter.post('/:id/redeem', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const rule = await prisma.loyaltyRule.findFirstOrThrow({ where: { active: true } });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    if (client.points < rule.pointsForDiscount) {
      return res.status(400).json({ error: `Faltan ${rule.pointsForDiscount - client.points} puntos para canjear` });
    }

    const [redemption, updated] = await prisma.$transaction([
      prisma.pointRedemption.create({
        data: { clientId, pointsUsed: rule.pointsForDiscount, discount: rule.discountAmount },
      }),
      prisma.client.update({
        where: { id: clientId },
        data: { points: { decrement: rule.pointsForDiscount } },
      }),
    ]);

    res.json({ redemption, client: updated });
  } catch (err) { next(err); }
});

// Reglas de fidelización
clientsRouter.get('/loyalty/rules', async (req, res, next) => {
  try {
    const rule = await prisma.loyaltyRule.findFirst({ where: { active: true } });
    res.json(rule);
  } catch (err) { next(err); }
});

clientsRouter.put('/loyalty/rules', async (req, res, next) => {
  try {
    const { amountPerPoint, pointsForDiscount, discountAmount } = req.body;
    // Desactivar la actual
    await prisma.loyaltyRule.updateMany({ where: { active: true }, data: { active: false } });
    const rule = await prisma.loyaltyRule.create({
      data: { amountPerPoint, pointsForDiscount: parseInt(pointsForDiscount), discountAmount },
    });
    res.json(rule);
  } catch (err) { next(err); }
});
