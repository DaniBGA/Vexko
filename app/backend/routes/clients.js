// src/routes/clients.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

async function getScopedKiosk(req, res) {
  const kiosk = await resolveRequestKiosk(req);
  if (!kiosk) {
    res.status(400).json({ error: 'No hay kiosko configurado' });
    return null;
  }
  return kiosk;
}

clientsRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const { search } = req.query;
    const where = { kioskId: kiosk.id };
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
    await prisma.loyaltyRule.updateMany({ where: { active: true }, data: { active: false } });
    const rule = await prisma.loyaltyRule.create({
      data: { amountPerPoint, pointsForDiscount: parseInt(pointsForDiscount), discountAmount },
    });
    res.json(rule);
  } catch (err) { next(err); }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const [client, rule] = await Promise.all([
      prisma.client.findFirstOrThrow({
        where: { id: req.params.id, kioskId: kiosk.id },
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
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const { name, phone } = req.body;
    const client = await prisma.client.create({ data: { name, phone, kioskId: kiosk.id } });
    res.status(201).json(client);
  } catch (err) { next(err); }
});

clientsRouter.put('/:id', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const client = await prisma.client.findFirstOrThrow({ where: { id: req.params.id, kioskId: kiosk.id } });
    const { kioskId, id, createdAt, updatedAt, ...data } = req.body;
    const updated = await prisma.client.update({
      where: { id: client.id },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Canjear puntos
clientsRouter.post('/:id/redeem', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const clientId = req.params.id;
    const rule = await prisma.loyaltyRule.findFirstOrThrow({ where: { active: true } });
    const client = await prisma.client.findFirstOrThrow({ where: { id: clientId, kioskId: kiosk.id } });

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
