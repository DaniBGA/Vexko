// src/routes/sales.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

// GET /api/sales?period=today|week|month&page=1&limit=50
salesRouter.get('/', async (req, res, next) => {
  try {
    const { period = 'today', page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const now = new Date();
    let from;
    if (period === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const where = from ? { createdAt: { gte: from } } : {};
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          items: { include: { product: { select: { name: true } } } },
          client: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({ sales, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales  — crea una venta, descuenta stock y suma puntos
salesRouter.post('/', async (req, res, next) => {
  try {
    const { items, paymentMethod, cashAmount, cardAmount, cashReceived, clientId } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'La venta debe tener al menos un producto' });

    // Validar stock y obtener productos
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return res.status(400).json({ error: `Producto ${item.productId} no encontrado` });
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Stock insuficiente para ${product.name}` });
      }
    }

    // Calcular totales
    const total = items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + parseFloat(product.salePrice) * item.quantity;
    }, 0);

    // Puntos a sumar (regla activa)
    let pointsEarned = 0;
    let loyaltyRule = null;
    if (clientId) {
      loyaltyRule = await prisma.loyaltyRule.findFirst({ where: { active: true } });
      if (loyaltyRule) {
        pointsEarned = Math.floor(total / parseFloat(loyaltyRule.amountPerPoint));
      }
    }

    const changeGiven = paymentMethod === 'CASH' && cashReceived ? parseFloat(cashReceived) - total : null;

    // Transacción atómica
    const sale = await prisma.$transaction(async (tx) => {
      // Crear venta
      const newSale = await tx.sale.create({
        data: {
          userId: req.user.id,
          clientId: clientId ? parseInt(clientId) : null,
          total,
          paymentMethod,
          cashAmount: cashAmount ? parseFloat(cashAmount) : null,
          cardAmount: cardAmount ? parseFloat(cardAmount) : null,
          cashReceived: cashReceived ? parseFloat(cashReceived) : null,
          changeGiven,
          pointsEarned,
          items: {
            create: items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: product.salePrice,
                costPrice: product.costPrice,
              };
            }),
          },
        },
        include: {
          items: { include: { product: true } },
          client: true,
        },
      });

      // Descontar stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // Actualizar puntos y gasto del cliente
      if (clientId && pointsEarned > 0) {
        await tx.client.update({
          where: { id: parseInt(clientId) },
          data: {
            points: { increment: pointsEarned },
            totalSpent: { increment: total },
          },
        });
      }

      return newSale;
    });

    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id
salesRouter.get('/:id', async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: parseInt(req.params.id) },
      include: {
        items: { include: { product: true } },
        client: true,
        user: { select: { id: true, name: true } },
        invoice: true,
      },
    });
    res.json(sale);
  } catch (err) {
    next(err);
  }
});
