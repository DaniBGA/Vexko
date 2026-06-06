// src/routes/sales.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

const MAX_HISTORY_MONTHS = 2;
const DEFAULT_HISTORY_LIMIT = 10;

function getHistoryCutoff() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MAX_HISTORY_MONTHS);
  return cutoff;
}

function normalizeLimit(limit) {
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HISTORY_LIMIT;
  return Math.min(parsed, DEFAULT_HISTORY_LIMIT);
}

function normalizePage(page) {
  const parsed = parseInt(page, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadSaleDetail(tx, saleId) {
  return tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              salePrice: true,
              costPrice: true,
            },
          },
        },
      },
      client: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
}

async function adjustClientTotals(tx, clientId, pointsDelta, totalSpentDelta) {
  if (!clientId) return;
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { points: true, totalSpent: true },
  });
  if (!client) return;

  const nextPoints = Math.max(0, client.points + pointsDelta);
  const nextTotalSpent = Math.max(0, client.totalSpent + totalSpentDelta);

  await tx.client.update({
    where: { id: clientId },
    data: { points: nextPoints, totalSpent: nextTotalSpent },
  });
}

async function restoreSaleStock(tx, saleItems) {
  for (const item of saleItems) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }
}

async function applySaleStock(tx, items) {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    });
  }
}

function validateSaleItems(items, products) {
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return `Producto ${item.productId} no encontrado`;
    }
    if (product.stock < item.quantity) {
      return `Stock insuficiente para ${product.name}`;
    }
  }
  return null;
}

function calculateSaleTotal(items, products) {
  return items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    return sum + parseFloat(product.salePrice) * item.quantity;
  }, 0);
}

// GET /api/sales?page=1&limit=10
salesRouter.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = DEFAULT_HISTORY_LIMIT } = req.query;
    const safeLimit = normalizeLimit(limit);
    const requestedPage = normalizePage(page);
    const cutoff = getHistoryCutoff();

    await prisma.sale.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const where = { createdAt: { gte: cutoff } };
    const total = await prisma.sale.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const currentPage = Math.min(requestedPage, totalPages);
    const skip = (currentPage - 1) * safeLimit;

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: { include: { product: { select: { name: true } } } },
        client: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    });

    res.json({
      sales,
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages,
      maxHistoryMonths: MAX_HISTORY_MONTHS,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales  — crea una venta, descuenta stock y suma puntos
salesRouter.post('/', async (req, res, next) => {
  try {
    const { items, paymentMethod, cashAmount, transferAmount, cardAmount, cashReceived, clientId } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'La venta debe tener al menos un producto' });

    const normalizedPaymentMethod = String(paymentMethod || '').toUpperCase();
    const allowedPaymentMethods = new Set(['CASH', 'TRANSFER', 'CARD', 'MIXED']);
    if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'Medio de pago inválido' });
    }

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

    const cashValue = parseAmount(cashAmount);
    const transferValue = parseAmount(transferAmount);
    const cardValue = parseAmount(cardAmount);
    const receivedValue = parseAmount(cashReceived);

    if (normalizedPaymentMethod === 'MIXED') {
      const partialTotal = [cashValue, transferValue, cardValue].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
      if (Math.abs(partialTotal - total) > 0.01) {
        return res.status(400).json({ error: 'En pago mixto, la suma de los medios debe coincidir con el total' });
      }
    }

    if (normalizedPaymentMethod === 'CASH' && receivedValue !== null && receivedValue < total) {
      return res.status(400).json({ error: 'El efectivo recibido no cubre el total' });
    }

    const changeGiven = normalizedPaymentMethod === 'CASH' && receivedValue !== null ? receivedValue - total : null;
    const kiosk = await prisma.kiosk.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado para registrar la venta' });
    }

    // Transacción atómica
    const sale = await prisma.$transaction(async (tx) => {
      // Crear venta
      const newSale = await tx.sale.create({
        data: {
          kioskId: kiosk.id,
          userId: req.user.id,
          clientId: clientId || null,
          total,
          paymentMethod: normalizedPaymentMethod,
          cashAmount: cashValue,
          transferAmount: transferValue,
          cardAmount: cardValue,
          cashReceived: receivedValue,
          changeGiven,
          pointsEarned,
          items: {
            create: items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              const unitPrice = parseFloat(product.salePrice);
              const subtotal = unitPrice * item.quantity;
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice,
                subtotal,
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
          where: { id: clientId },
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
    const sale = await loadSaleDetail(prisma, req.params.id);
    res.json(sale);
  } catch (err) {
    next(err);
  }
});

// PUT /api/sales/:id
salesRouter.put('/:id', async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { items, paymentMethod, cashAmount, transferAmount, cardAmount, cashReceived, clientId } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'La venta debe tener al menos un producto' });

    const normalizedPaymentMethod = String(paymentMethod || '').toUpperCase();
    const allowedPaymentMethods = new Set(['CASH', 'TRANSFER', 'CARD', 'MIXED']);
    if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'Medio de pago inválido' });
    }

    const nextClientId = clientId || null;
    const cashValue = parseAmount(cashAmount);
    const transferValue = parseAmount(transferAmount);
    const cardValue = parseAmount(cardAmount);
    const receivedValue = parseAmount(cashReceived);

    const updatedSale = await prisma.$transaction(async (tx) => {
      const existingSale = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: { items: true },
      });

      await restoreSaleStock(tx, existingSale.items);
      await adjustClientTotals(tx, existingSale.clientId, -(existingSale.pointsEarned || 0), -existingSale.total);

      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, active: true },
      });

      const validationError = validateSaleItems(items, products);
      if (validationError) {
        throw new Error(validationError);
      }

      const total = calculateSaleTotal(items, products);

      if (normalizedPaymentMethod === 'MIXED') {
        const partialTotal = [cashValue, transferValue, cardValue].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
        if (Math.abs(partialTotal - total) > 0.01) {
          throw new Error('En pago mixto, la suma de los medios debe coincidir con el total');
        }
      }

      if (normalizedPaymentMethod === 'CASH' && receivedValue !== null && receivedValue < total) {
        throw new Error('El efectivo recibido no cubre el total');
      }

      const changeGiven = normalizedPaymentMethod === 'CASH' && receivedValue !== null ? receivedValue - total : null;

      let pointsEarned = 0;
      if (nextClientId) {
        const loyaltyRule = await tx.loyaltyRule.findFirst({ where: { active: true } });
        if (loyaltyRule) {
          pointsEarned = Math.floor(total / parseFloat(loyaltyRule.amountPerPoint));
        }
      }

      await tx.sale.update({
        where: { id: saleId },
        data: {
          clientId: nextClientId,
          total,
          paymentMethod: normalizedPaymentMethod,
          cashAmount: cashValue,
          transferAmount: transferValue,
          cardAmount: cardValue,
          cashReceived: receivedValue,
          changeGiven,
          pointsEarned,
        },
      });

      await tx.saleItem.deleteMany({ where: { saleId } });

      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        const unitPrice = parseFloat(product.salePrice);
        const subtotal = unitPrice * item.quantity;

        await tx.saleItem.create({
          data: {
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            subtotal,
          },
        });
      }

      await applySaleStock(tx, items);
      await adjustClientTotals(tx, nextClientId, pointsEarned, total);

      return loadSaleDetail(tx, saleId);
    });

    res.json(updatedSale);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sales/:id
salesRouter.delete('/:id', async (req, res, next) => {
  try {
    const saleId = req.params.id;

    const deletedSale = await prisma.$transaction(async (tx) => {
      const existingSale = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: { items: true },
      });

      await restoreSaleStock(tx, existingSale.items);
      await adjustClientTotals(tx, existingSale.clientId, -(existingSale.pointsEarned || 0), -existingSale.total);

      await tx.sale.delete({ where: { id: saleId } });
      return existingSale;
    });

    res.json({ ok: true, sale: deletedSale });
  } catch (err) {
    next(err);
  }
});
