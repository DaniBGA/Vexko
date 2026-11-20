// src/routes/sales.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_EXPORT_LIMIT = 500;

function normalizeLimit(limit, { unbounded } = {}) {
  const cap = unbounded ? MAX_EXPORT_LIMIT : DEFAULT_HISTORY_LIMIT;
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return unbounded ? cap : DEFAULT_HISTORY_LIMIT;
  return Math.min(parsed, cap);
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

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// Error de validación que se tira desde adentro de una transacción: con
// statusCode el errorHandler responde 400 con el mensaje, en vez de un 500.
function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Valida y normaliza los items que manda el front. Antes no se validaba nada:
// una cantidad negativa SUMABA stock al vender, una cantidad "2" (string) o
// 1.5 rompía con un 500, y el mismo producto repetido en dos líneas pasaba el
// control de stock línea por línea aunque entre las dos superaran el stock.
function normalizeSaleItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return { error: 'La venta debe tener al menos un producto' };
  }
  const byProduct = new Map();
  for (const raw of rawItems) {
    const productId = typeof raw?.productId === 'string' ? raw.productId.trim() : '';
    const quantity = Number(raw?.quantity);
    if (!productId) return { error: 'Hay un producto sin identificar en la venta' };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: 'Las cantidades tienen que ser números enteros mayores a cero' };
    }
    byProduct.set(productId, (byProduct.get(productId) || 0) + quantity);
  }
  return { items: Array.from(byProduct, ([productId, quantity]) => ({ productId, quantity })) };
}

// Precio y costo efectivos de la sucursal (mismo criterio que products.js).
function getUnitPrice(product) {
  const price = product.kioskProducts?.[0]?.price ?? product.salePrice;
  return price === null || price === undefined ? null : parseFloat(price);
}

function getUnitCost(product) {
  const cost = product.kioskProducts?.[0]?.cost ?? product.costPrice;
  return cost === null || cost === undefined ? null : parseFloat(cost);
}

function validatePrices(items, products) {
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    const price = getUnitPrice(product);
    if (price === null || !Number.isFinite(price) || price < 0) {
      return `${product.name} no tiene precio de venta cargado en esta sucursal`;
    }
  }
  return null;
}

// Porcentaje del cupón acotado a 0–100: una regla vieja migrada de monto fijo
// a porcentaje (ej. "$500" → 500 %) dejaba el total de la venta negativo.
function getDiscountAmount(subtotal, redemption) {
  if (!redemption) return 0;
  const percent = Math.min(100, Math.max(0, parseFloat(redemption.discount) || 0));
  return roundMoney(subtotal * (percent / 100));
}

function buildSaleItemsData(items, products) {
  return items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const unitPrice = getUnitPrice(product);
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      unitCost: getUnitCost(product),
      subtotal: roundMoney(unitPrice * item.quantity),
    };
  });
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

async function restoreSaleStock(tx, saleItems, kioskId) {
  for (const item of saleItems) {
    await tx.kioskProduct.upsert({
      where: { kioskId_productId: { kioskId, productId: item.productId } },
      create: {
        kioskId,
        productId: item.productId,
        stock: item.quantity,
        minStock: 0,
        price: null,
      },
      update: { stock: { increment: item.quantity } },
    });
  }
}

// Descuenta el stock de forma atómica: el `stock: { gte }` en el where hace
// que si dos ventas simultáneas se llevan las últimas unidades, solo una
// pase. Antes el control de stock se hacía afuera de la transacción y el
// decrement era incondicional, así que el stock podía quedar negativo.
async function applySaleStock(tx, items, products, kioskId) {
  for (const item of items) {
    const { count } = await tx.kioskProduct.updateMany({
      where: { kioskId, productId: item.productId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    if (count === 0) {
      const product = products.find((p) => p.id === item.productId);
      throw badRequest(`Stock insuficiente para ${product?.name || 'un producto'}`);
    }
  }
}

// Un producto propio que todavía no tiene inventario en esta sucursal se
// vende con su stock legado (Product.stock): se le crea el KioskProduct con
// ese stock antes de descontar, así el descuento siempre pasa por
// applySaleStock y queda validado igual que el resto.
async function ensureKioskInventory(tx, products, kioskId) {
  for (const product of products) {
    if (product.kioskProducts?.length) continue;
    const created = await tx.kioskProduct.create({
      data: {
        kioskId,
        productId: product.id,
        stock: Math.max(0, product.stock ?? 0),
        minStock: product.minStock ?? 0,
        price: product.salePrice ?? null,
        cost: product.costPrice ?? null,
      },
      select: { stock: true, price: true, cost: true },
    });
    product.kioskProducts = [created];
  }
}

function validateSaleItems(items, products) {
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return 'Hay productos de la venta que no existen o no están en el stock de esta sucursal';
    }
    const stock = product.kioskProducts?.[0]?.stock ?? product.stock ?? 0;
    if (stock < item.quantity) {
      return `Stock insuficiente para ${product.name}`;
    }
  }
  return null;
}

function calculateSaleTotal(items, products) {
  return roundMoney(items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    return sum + getUnitPrice(product) * item.quantity;
  }, 0));
}

// En un pago de un solo medio, el monto de ese medio es siempre el total.
// Antes se usaba el monto que mandaba el front si venía: al pasar de "Mixto"
// a "Efectivo" (con un parcial ya tipeado), o al editar desde el historial una
// venta en efectivo cambiándole cantidades, se guardaba el monto viejo como
// cashAmount y el efectivo esperado de la caja quedaba mal.
function buildPaymentAmounts(paymentMethod, total, cashAmount, transferAmount, cardAmount) {
  if (paymentMethod === 'CASH') return { cashAmount: total, transferAmount: 0, cardAmount: 0 };
  if (paymentMethod === 'TRANSFER') return { cashAmount: 0, transferAmount: total, cardAmount: 0 };
  if (paymentMethod === 'CARD') return { cashAmount: 0, transferAmount: 0, cardAmount: total };

  return {
    cashAmount: parseAmount(cashAmount) ?? 0,
    transferAmount: parseAmount(transferAmount) ?? 0,
    cardAmount: parseAmount(cardAmount) ?? 0,
  };
}

function validatePaymentAmounts(paymentMethod, total, amounts) {
  if (paymentMethod !== 'MIXED') return null;
  const values = [amounts.cashAmount, amounts.transferAmount, amounts.cardAmount];
  if (values.some((value) => value < 0)) {
    return 'Los montos del pago mixto no pueden ser negativos';
  }
  const partialTotal = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(partialTotal - total) > 0.01) {
    return 'En pago mixto, la suma de los medios debe coincidir con el total';
  }
  return null;
}

function buildProductWhere(productIds, kiosk) {
  return {
    id: { in: productIds },
    active: true,
    OR: [
      { kioskProducts: { some: { kioskId: kiosk.id } } },
      { customerId: kiosk.customerId, kioskProducts: { none: {} } },
    ],
  };
}

function buildProductInclude(kioskId) {
  return { kioskProducts: { where: { kioskId }, select: { stock: true, price: true, cost: true } } };
}

async function getPointsEarned(db, kioskId, clientId, total) {
  if (!clientId) return 0;
  const loyaltyRule = await db.loyaltyRule.findFirst({ where: { kioskId, active: true } });
  if (!loyaltyRule) return 0;
  const amountPerPoint = parseFloat(loyaltyRule.amountPerPoint);
  return amountPerPoint > 0 ? Math.floor(total / amountPerPoint) : 0;
}

// GET /api/sales?page=1&limit=10
salesRouter.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit, all } = req.query;
    const unbounded = all === '1';
    const safeLimit = normalizeLimit(limit, { unbounded });
    const requestedPage = unbounded ? 1 : normalizePage(page);
    const kiosk = await resolveRequestKiosk(req);

    if (!kiosk) {
      return res.json({ sales: [], total: 0, totalRevenue: 0, page: 1, limit: safeLimit, totalPages: 0 });
    }

    // Antes se mostraban solo los últimos 2 meses y un borrado diario eliminaba
    // las ventas más viejas de todas las sucursales. Ahora el historial es completo.
    const where = { kioskId: kiosk.id };
    // totalRevenue es de TODAS las ventas: antes el encabezado mostraba el total
    // de ventas al lado de la suma de la página actual (10 ventas).
    const [total, revenue] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true } }),
    ]);
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
      totalRevenue: Math.round(parseFloat(revenue._sum.total || 0) * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sales  — crea una venta, descuenta stock y suma puntos
salesRouter.post('/', async (req, res, next) => {
  try {
    const { paymentMethod, cashAmount, transferAmount, cardAmount, cashReceived, clientId, redemptionCode } = req.body;

    const { items, error: itemsError } = normalizeSaleItems(req.body.items);
    if (itemsError) return res.status(400).json({ error: itemsError });

    const normalizedPaymentMethod = String(paymentMethod || '').toUpperCase();
    const allowedPaymentMethods = new Set(['CASH', 'TRANSFER', 'CARD', 'MIXED']);
    if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'Medio de pago inválido' });
    }

    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado para registrar la venta' });
    }

    let nextClientId = clientId || null;
    if (nextClientId) {
      const client = await prisma.client.findFirst({ where: { id: nextClientId, kioskId: kiosk.id } });
      if (!client) {
        return res.status(400).json({ error: 'El cliente no pertenece a este kiosco' });
      }
      nextClientId = client.id;
    }

    // Código de descuento por puntos: tiene que existir, estar pendiente y
    // pertenecer justo al cliente seleccionado — así no lo puede usar
    // cualquiera que lo vea, solo el cliente al que se le generó.
    let redemption = null;
    const trimmedCode = typeof redemptionCode === 'string' ? redemptionCode.trim() : '';
    if (trimmedCode) {
      if (!nextClientId) {
        return res.status(400).json({ error: 'Elegí el cliente para poder aplicar el código de descuento' });
      }
      redemption = await prisma.pointRedemption.findUnique({ where: { code: trimmedCode } });
      if (!redemption || redemption.clientId !== nextClientId) {
        return res.status(400).json({ error: 'El código de descuento no es válido para este cliente' });
      }
      if (redemption.status !== 'PENDING') {
        return res.status(400).json({ error: 'Ese código de descuento ya fue usado' });
      }
    }

    // Validar stock y precios (chequeo previo para dar el error claro; el
    // descuento real de stock se vuelve a validar adentro de la transacción)
    const products = await prisma.product.findMany({
      where: buildProductWhere(items.map((i) => i.productId), kiosk),
      include: buildProductInclude(kiosk.id),
    });

    const validationError = validateSaleItems(items, products) || validatePrices(items, products);
    if (validationError) return res.status(400).json({ error: validationError });

    // Calcular totales (respeta el precio propio del kiosco si existe)
    const subtotal = calculateSaleTotal(items, products);
    const discountAmount = getDiscountAmount(subtotal, redemption);
    const total = roundMoney(subtotal - discountAmount);

    // Puntos a sumar (regla activa) — se calculan sobre lo que el cliente
    // realmente pagó, no sobre el subtotal sin descuento.
    const pointsEarned = await getPointsEarned(prisma, kiosk.id, nextClientId, total);

    const paymentAmounts = buildPaymentAmounts(normalizedPaymentMethod, total, cashAmount, transferAmount, cardAmount);
    const receivedValue = parseAmount(cashReceived);

    const paymentError = validatePaymentAmounts(normalizedPaymentMethod, total, paymentAmounts);
    if (paymentError) return res.status(400).json({ error: paymentError });

    if (normalizedPaymentMethod === 'CASH' && receivedValue !== null && receivedValue < total) {
      return res.status(400).json({ error: 'El efectivo recibido no cubre el total' });
    }

    const changeGiven = normalizedPaymentMethod === 'CASH' && receivedValue !== null ? roundMoney(receivedValue - total) : null;

    // Transacción atómica
    const sale = await prisma.$transaction(async (tx) => {
      await ensureKioskInventory(tx, products, kiosk.id);
      await applySaleStock(tx, items, products, kiosk.id);

      const newSale = await tx.sale.create({
        data: {
          kioskId: kiosk.id,
          userId: req.user.id,
          clientId: nextClientId,
          total,
          paymentMethod: normalizedPaymentMethod,
          ...paymentAmounts,
          cashReceived: receivedValue,
          changeGiven,
          pointsEarned,
          discountAmount: redemption ? discountAmount : null,
          redemptionId: redemption?.id ?? null,
          items: { create: buildSaleItemsData(items, products) },
        },
        include: {
          items: { include: { product: true } },
          client: true,
        },
      });

      // Puntos y gasto del cliente. Antes totalSpent solo se sumaba si la
      // venta daba puntos (sin regla activa, o en compras chicas, no sumaba),
      // pero borrar o editar la venta sí lo restaba: el total gastado del
      // cliente iba quedando por debajo de lo real.
      if (nextClientId) {
        await tx.client.update({
          where: { id: nextClientId },
          data: {
            points: { increment: pointsEarned },
            totalSpent: { increment: total },
          },
        });
      }

      // Marcar el código de descuento como usado — se re-chequea el estado
      // acá adentro de la transacción por si dos ventas lo intentaron usar
      // al mismo tiempo (el updateMany con status:'PENDING' en el where
      // hace que solo una de las dos gane la carrera).
      if (redemption) {
        const consumed = await tx.pointRedemption.updateMany({
          where: { id: redemption.id, status: 'PENDING' },
          data: { status: 'USED', usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw badRequest('Ese código de descuento ya fue usado');
        }
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
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Venta no encontrada' });

    const sale = await prisma.sale.findFirstOrThrow({
      where: { id: req.params.id, kioskId: kiosk.id },
      include: {
        items: { include: { product: { select: { id: true, name: true, salePrice: true, costPrice: true } } } },
        client: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        // El historial necesita el % del cupón para recalcular el total al
        // editar la venta (si no, validaba el pago mixto contra el total sin
        // descuento y nunca coincidía).
        redemption: { select: { code: true, discount: true } },
      },
    });
    res.json(sale);
  } catch (err) {
    next(err);
  }
});

// PUT /api/sales/:id
salesRouter.put('/:id', async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { paymentMethod, cashAmount, transferAmount, cardAmount, cashReceived, clientId } = req.body;

    const { items, error: itemsError } = normalizeSaleItems(req.body.items);
    if (itemsError) return res.status(400).json({ error: itemsError });

    const normalizedPaymentMethod = String(paymentMethod || '').toUpperCase();
    const allowedPaymentMethods = new Set(['CASH', 'TRANSFER', 'CARD', 'MIXED']);
    if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'Medio de pago inválido' });
    }

    let nextClientId = clientId || null;
    const receivedValue = parseAmount(cashReceived);
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    if (nextClientId) {
      const client = await prisma.client.findFirst({ where: { id: nextClientId, kioskId: kiosk.id } });
      if (!client) {
        return res.status(400).json({ error: 'El cliente no pertenece a este kiosco' });
      }
      nextClientId = client.id;
    }

    const updatedSale = await prisma.$transaction(async (tx) => {
      const existingSale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, kioskId: kiosk.id },
        include: { items: true, redemption: true },
      });

      // El cupón pertenece al cliente al que se le generó: no se puede pasar
      // la venta a otro cliente sin perder la coherencia del descuento.
      if (existingSale.redemption && nextClientId !== existingSale.clientId) {
        throw badRequest('Esta venta tiene un código de descuento del cliente original: no se puede cambiar de cliente');
      }

      await restoreSaleStock(tx, existingSale.items, kiosk.id);
      await adjustClientTotals(tx, existingSale.clientId, -(existingSale.pointsEarned || 0), -existingSale.total);

      const products = await tx.product.findMany({
        where: buildProductWhere(items.map((item) => item.productId), kiosk),
        include: buildProductInclude(kiosk.id),
      });

      const validationError = validateSaleItems(items, products) || validatePrices(items, products);
      if (validationError) {
        throw badRequest(validationError);
      }

      // Si la venta original tenía un código de descuento aplicado, se
      // mantiene el mismo porcentaje al recalcular — si no, al editar una
      // venta con descuento (por ejemplo corrigiendo una cantidad) el total
      // volvía silenciosamente al precio lleno mientras el registro seguía
      // marcando que tenía un cupón usado.
      const subtotal = calculateSaleTotal(items, products);
      const discountAmount = getDiscountAmount(subtotal, existingSale.redemption);
      const total = roundMoney(subtotal - discountAmount);
      const paymentAmounts = buildPaymentAmounts(normalizedPaymentMethod, total, cashAmount, transferAmount, cardAmount);

      const paymentError = validatePaymentAmounts(normalizedPaymentMethod, total, paymentAmounts);
      if (paymentError) throw badRequest(paymentError);

      if (normalizedPaymentMethod === 'CASH' && receivedValue !== null && receivedValue < total) {
        throw badRequest('El efectivo recibido no cubre el total');
      }

      const changeGiven = normalizedPaymentMethod === 'CASH' && receivedValue !== null ? roundMoney(receivedValue - total) : null;
      const pointsEarned = await getPointsEarned(tx, kiosk.id, nextClientId, total);

      await ensureKioskInventory(tx, products, kiosk.id);
      await applySaleStock(tx, items, products, kiosk.id);

      await tx.sale.update({
        where: { id: saleId },
        data: {
          clientId: nextClientId,
          total,
          paymentMethod: normalizedPaymentMethod,
          ...paymentAmounts,
          cashReceived: receivedValue,
          changeGiven,
          pointsEarned,
          discountAmount: existingSale.redemption ? discountAmount : null,
        },
      });
      await tx.saleItem.deleteMany({ where: { saleId } });
      await tx.saleItem.createMany({
        data: buildSaleItemsData(items, products).map((item) => ({ ...item, saleId })),
      });

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
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const deletedSale = await prisma.$transaction(async (tx) => {
      const existingSale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, kioskId: kiosk.id },
        include: { items: true },
      });

      await restoreSaleStock(tx, existingSale.items, kiosk.id);
      await adjustClientTotals(tx, existingSale.clientId, -(existingSale.pointsEarned || 0), -existingSale.total);

      // Si esta venta tenía un código de descuento aplicado, se libera de
      // vuelta a PENDING — al borrar la venta (una corrección) no debería
      // perderse el cupón del cliente.
      if (existingSale.redemptionId) {
        await tx.pointRedemption.update({
          where: { id: existingSale.redemptionId },
          data: { status: 'PENDING', usedAt: null },
        });
      }

      await tx.sale.delete({ where: { id: saleId } });
      return existingSale;
    });

    res.json({ ok: true, sale: deletedSale });
  } catch (err) {
    next(err);
  }
});
