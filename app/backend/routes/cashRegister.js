// src/routes/cashRegister.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const cashRegisterRouter = Router();
cashRegisterRouter.use(requireAuth);

function parsePage(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return Math.min(parsed, 20);
}

async function getRegisterSummary(register) {
  if (!register) return null;

  const endDate = register.closedAt || new Date();
  const kioskId = register.user?.kioskId || null;
  const kioskWhere = kioskId ? { kioskId } : undefined;
  const [cashSales, transferSales, cardSales, expenses] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { cashAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['CASH', 'MIXED'] },
      },
    }),
    prisma.sale.aggregate({
      _sum: { transferAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['TRANSFER', 'MIXED'] },
      },
    }),
    prisma.sale.aggregate({
      _sum: { cardAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['CARD', 'MIXED'] },
      },
    }),
    prisma.cashFlow.aggregate({
      _sum: { amount: true },
      where: { type: 'EXPENSE', createdAt: { gte: register.openedAt, lte: endDate }, ...kioskWhere },
    }),
  ]);

  const cashSalesTotal = parseFloat(cashSales._sum.cashAmount || 0);
  const transferSalesTotal = parseFloat(transferSales._sum.transferAmount || 0);
  const cardSalesTotal = parseFloat(cardSales._sum.cardAmount || 0);
  const expensesTotal = parseFloat(expenses._sum.amount || 0);
  const expectedCashBeforeClose = parseFloat(register.openingAmount || 0) + cashSalesTotal - expensesTotal;
  const movementTotal = cashSalesTotal + transferSalesTotal + cardSalesTotal;

  return {
    cashSales: cashSalesTotal,
    transferSales: transferSalesTotal,
    cardSales: cardSalesTotal,
    expensesTotal,
    expectedCashBeforeClose,
    movementTotal,
  };
}

// Obtener caja activa o historial
cashRegisterRouter.get('/current', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json(null);

    const register = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN', user: { kioskId: kiosk.id } },
      include: { user: { select: { name: true, kioskId: true } } },
      orderBy: { openedAt: 'desc' },
    });

    if (!register) {
      return res.json(null);
    }

    const summary = await getRegisterSummary(register);
    res.json({
      ...register,
      ...summary,
    });
  } catch (err) { next(err); }
});

cashRegisterRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ registers: [], total: 0, page: 1, limit: 8, totalPages: 0 });
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const where = { user: { kioskId: kiosk.id } };

    const [total, registers] = await Promise.all([
      prisma.cashRegister.count({ where }),
      prisma.cashRegister.findMany({
      where,
      include: { user: { select: { name: true, kioskId: true } } },
      orderBy: { openedAt: 'desc' },
      skip,
      take: limit,
    }),
    ]);

    const enriched = await Promise.all(registers.map(async (register) => ({
      ...register,
      ...(await getRegisterSummary(register)),
    })));

    res.json({
      registers: enriched,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// Abrir caja
cashRegisterRouter.post('/open', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado' });
    }

    const existing = await prisma.cashRegister.findFirst({ where: { status: 'OPEN', user: { kioskId: kiosk.id } } });
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
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Caja no encontrada' });
    }

    const register = await prisma.cashRegister.findFirstOrThrow({ where: { id: req.params.id, user: { kioskId: kiosk.id } }, include: { user: { select: { kioskId: true } } } });
    if (register.status === 'CLOSED') return res.status(400).json({ error: 'Caja ya cerrada' });

    const now = new Date();
    const summary = await getRegisterSummary(register);
    const expectedAmount = summary.expectedCashBeforeClose;
    const actual = parseFloat(actualAmount);
    const difference = actual - expectedAmount;

    const updated = await prisma.cashRegister.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED', closedAt: now, expectedAmount, actualAmount: actual, difference, notes },
    });
    res.json({
      ...updated,
      ...summary,
    });
  } catch (err) { next(err); }
});
