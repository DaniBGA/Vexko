// src/routes/suppliers.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

const MAX_HISTORY_MONTHS = 2;

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInt(value) {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function isToday(date) {
  if (!date) return false;
  const current = new Date();
  const compare = new Date(date);
  return compare.toDateString() === current.toDateString();
}

function parsePage(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return Math.min(parsed, 20);
}

function getHistoryCutoff() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MAX_HISTORY_MONTHS);
  return cutoff;
}

function buildPurchaseItemSelect() {
  return {
    select: {
      id: true,
      quantity: true,
      unitCost: true,
      lineTotal: true,
      product: {
        select: {
          id: true,
          name: true,
          barcode: true,
          sku: true,
          loadMode: true,
          packPrice: true,
          packUnits: true,
          packCount: true,
          costPrice: true,
          salePrice: true,
          stock: true,
          minStock: true,
          expiresAt: true,
          isCustom: true,
          subcategory: { select: { name: true, category: { select: { name: true } } } },
        },
      },
    },
  };
}

function normalizePaymentMethod(value) {
  const method = String(value || 'CASH').trim().toUpperCase();
  if (['CASH', 'TRANSFER', 'CARD'].includes(method)) return method;
  return 'CASH';
}

function parseDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildPurchaseInclude() {
  return {
    items: buildPurchaseItemSelect(),
  };
}

function buildSupplierPaginationResponse(supplier, purchases, total, page, limit) {
  return {
    ...supplier,
    purchases,
    totalPurchases: total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    lastOrderAt: purchases[0]?.createdAt || null,
    lastOrderToday: isToday(purchases[0]?.createdAt),
  };
}

function buildSupplierInclude() {
  return {
    _count: { select: { products: true, purchases: true } },
    purchases: {
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: { items: buildPurchaseItemSelect() },
    },
  };
}

export async function cleanupOldPurchases(force = false) {
  const cutoff = getHistoryCutoff();
  const removedPurchases = await prisma.purchase.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  await prisma.cashFlow.deleteMany({
    where: {
      type: 'EXPENSE',
      category: 'Compras',
      createdAt: { lt: cutoff },
    },
  });

  return removedPurchases;
}

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json([]);

    const { search } = req.query;
    const where = { kioskId: kiosk.id };
    if (search) where.name = { contains: String(search).trim() };

    const suppliers = await prisma.supplier.findMany({
      where,
      include: buildSupplierInclude(),
      orderBy: { name: 'asc' },
    });

    res.json(
      suppliers.map((supplier) => ({
        ...supplier,
        lastOrderAt: supplier.purchases[0]?.createdAt || null,
        lastOrderToday: isToday(supplier.purchases[0]?.createdAt),
      }))
    );
  } catch (err) {
    next(err);
  }
});

suppliersRouter.get('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) throw Object.assign(new Error('No hay kiosko configurado'), { statusCode: 400 });
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!supplier) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const cutoff = getHistoryCutoff();

    const where = {
      supplierId: supplier.id,
      createdAt: { gte: cutoff },
    };

    const [totalPurchases, purchases, detail] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: buildPurchaseInclude(),
      }),
      prisma.supplier.findFirst({
        where: { id: supplier.id, kioskId: kiosk.id },
        include: {
          _count: { select: { products: true, purchases: true } },
        },
      }),
    ]);

    res.json(buildSupplierPaginationResponse(detail, purchases, totalPurchases, page, limit));
  } catch (err) {
    next(err);
  }
});

suppliersRouter.post('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });

    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
        kioskId: kiosk.id,
      },
    });

    res.status(201).json(supplier);
  } catch (err) {
    next(err);
  }
});

suppliersRouter.put('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) throw Object.assign(new Error('No hay kiosko configurado'), { statusCode: 400 });
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!supplier) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    const updated = await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        name: req.body.name !== undefined ? String(req.body.name).trim() : undefined,
        phone: req.body.phone !== undefined ? req.body.phone || null : undefined,
        email: req.body.email !== undefined ? req.body.email || null : undefined,
        address: req.body.address !== undefined ? req.body.address || null : undefined,
        kioskId: kiosk.id,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

suppliersRouter.delete('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) throw Object.assign(new Error('No hay kiosko configurado'), { statusCode: 400 });
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!supplier) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    await prisma.supplier.delete({ where: { id: supplier.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

suppliersRouter.post('/:id/orders', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) throw Object.assign(new Error('No hay kiosko configurado'), { statusCode: 400 });
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!supplier) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const items = rawItems
      .map((item) => ({
        productId: String(item.productId || '').trim(),
        quantity: Math.max(1, toInt(item.quantity) || 0),
        unitCost: toNumber(item.unitCost),
      }))
      .filter((item) => item.productId && item.quantity > 0);

    if (!items.length) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        active: true,
        customerId: kiosk.customerId,
      },
      include: {
        subcategory: { include: { category: true } },
      },
    });

    if (products.length !== items.length) {
      return res.status(400).json({ error: 'Hay productos del pedido que no existen o no están activos' });
    }

    const purchaseItems = items.map((item) => {
      const product = products.find((current) => current.id === item.productId);
      const packCost = product.loadMode === 'pack' && product.packPrice && product.packUnits
        ? Number(product.packPrice) / Number(product.packUnits)
        : null;
      const unitCost = item.unitCost ?? product.costPrice ?? packCost ?? product.salePrice ?? 0;
      return {
        productId: product.id,
        quantity: item.quantity,
        unitCost,
        lineTotal: unitCost * item.quantity,
      };
    });

    const totalAmount = purchaseItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const purchase = await prisma.$transaction(async (tx) => {
      const createdPurchase = await tx.purchase.create({
        data: {
          supplierId: supplier.id,
          status: 'PENDING',
          paymentMethod,
          deliveryDate: parseDateValue(req.body.deliveryDate),
          notes: req.body.notes || null,
          totalAmount,
          items: {
            create: purchaseItems,
          },
        },
        include: {
          supplier: true,
          items: buildPurchaseItemSelect(),
        },
      });

      if (paymentMethod === 'CASH' && totalAmount > 0) {
        await tx.cashFlow.create({
          data: {
            kioskId: kiosk.id,
            type: 'EXPENSE',
            amount: totalAmount,
            category: 'Compras',
            description: `Compra a proveedor: ${supplier.name}${req.body.notes ? ` — ${String(req.body.notes).trim()}` : ''}`,
          },
        });
      }

      return createdPurchase;
    });

    res.status(201).json({
      ...purchase,
      kioskId: kiosk.id,
    });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.post('/:supplierId/orders/:purchaseId/receive', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) throw Object.assign(new Error('No hay kiosko configurado'), { statusCode: 400 });
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.supplierId, kioskId: kiosk.id } });
    if (!supplier) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    const purchase = await prisma.purchase.findFirst({
      where: {
        id: req.params.purchaseId,
        supplierId: supplier.id,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                sku: true,
                loadMode: true,
                packPrice: true,
                packUnits: true,
                packCount: true,
                costPrice: true,
                salePrice: true,
                stock: true,
                minStock: true,
                expiresAt: true,
                isCustom: true,
                subcategory: { select: { name: true, category: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (purchase.status === 'RECEIVED') {
      return res.status(400).json({ error: 'El pedido ya fue recibido' });
    }

    const receivedAt = new Date();
    const updatedPurchase = await prisma.$transaction(async (tx) => {
      for (const item of purchase.items) {
        await tx.kioskProduct.upsert({
          where: { kioskId_productId: { kioskId: kiosk.id, productId: item.productId } },
          create: {
            kioskId: kiosk.id,
            productId: item.productId,
            stock: item.quantity,
            minStock: 0,
            price: null,
          },
          update: { stock: { increment: item.quantity } },
        });
      }

      return tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: 'RECEIVED',
          receivedAt,
        },
        include: {
          supplier: true,
          items: buildPurchaseItemSelect(),
        },
      });
    });

    res.json(updatedPurchase);
  } catch (err) {
    next(err);
  }
});
