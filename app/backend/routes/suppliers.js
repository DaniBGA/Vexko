// src/routes/suppliers.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

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

// `stock`/`minStock` acá son del Product global (legacy); el stock real de
// esta sucursal vive en KioskProduct. Sin `kioskId` para filtrar esa relación,
// el front terminaba mostrando el stock global en vez del de la sucursal en
// la vista previa de "pedido recibido".
function buildPurchaseItemSelect(kioskId) {
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
          active: true,
          subcategory: { select: { name: true, category: { select: { name: true } } } },
          ...(kioskId
            ? { kioskProducts: { where: { kioskId }, select: { stock: true, minStock: true, price: true } } }
            : {}),
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

function buildPurchaseInclude(kioskId) {
  return {
    items: buildPurchaseItemSelect(kioskId),
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

function buildSupplierInclude(kioskId) {
  return {
    _count: { select: { products: true, purchases: true } },
    purchases: {
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: { items: buildPurchaseItemSelect(kioskId) },
    },
  };
}

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json([]);

    const { search } = req.query;
    const where = { kioskId: kiosk.id };
    if (search) where.name = { contains: String(search).trim(), mode: 'insensitive' };

    const suppliers = await prisma.supplier.findMany({
      where,
      include: buildSupplierInclude(kiosk.id),
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
    // Antes solo se listaban (y se guardaban) los pedidos de los últimos 2 meses:
    // un borrado diario eliminaba los más viejos. Ahora el historial es completo.
    const where = { supplierId: supplier.id };

    const [totalPurchases, purchases, detail] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: buildPurchaseInclude(kiosk.id),
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
    if (req.body.name !== undefined && !String(req.body.name).trim()) {
      return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
    }
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
    // Purchase → Supplier no tiene cascade: borrar un proveedor con pedidos
    // fallaba con un error de clave foránea (500). Se borran sus pedidos en la
    // misma transacción, igual que hace el panel admin al borrar una sucursal.
    // Los gastos "Compras" ya registrados en el flujo de caja se conservan.
    await prisma.$transaction([
      prisma.purchase.deleteMany({ where: { supplierId: supplier.id } }),
      prisma.supplier.delete({ where: { id: supplier.id } }),
    ]);
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

    // Antes `Math.max(1, ...)` convertía una cantidad 0, negativa o inválida
    // en 1 sin avisar. Ahora se rechaza, y el mismo producto repetido en dos
    // líneas se suma en una sola (si no, products.length !== items.length
    // daba "no existen o no están activos" aunque el producto existiera).
    const itemsByProduct = new Map();
    for (const raw of rawItems) {
      const productId = String(raw?.productId || '').trim();
      const quantity = Number(raw?.quantity);
      const unitCost = toNumber(raw?.unitCost);
      if (!productId) continue;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Las cantidades del pedido tienen que ser números enteros mayores a cero' });
      }
      if (unitCost !== undefined && unitCost < 0) {
        return res.status(400).json({ error: 'El costo de un producto no puede ser negativo' });
      }
      const current = itemsByProduct.get(productId);
      itemsByProduct.set(productId, {
        productId,
        quantity: (current?.quantity || 0) + quantity,
        unitCost: unitCost ?? current?.unitCost,
      });
    }
    const items = Array.from(itemsByProduct.values());

    if (!items.length) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        active: true,
        // Antes exigía customerId === kiosk.customerId, lo que descartaba
        // cualquier producto del catálogo global (customerId null): un pedido
        // con un producto global fallaba siempre con "no existen o no están
        // activos", aunque el producto se pudiera buscar y agregar sin problema.
        OR: [{ customerId: kiosk.customerId }, { customerId: null }],
      },
      include: {
        subcategory: { include: { category: true } },
        kioskProducts: { where: { kioskId: kiosk.id }, select: { cost: true } },
      },
    });

    if (products.length !== items.length) {
      return res.status(400).json({ error: 'Hay productos del pedido que no existen o no están activos' });
    }

    // Costo unitario: el que manda el front, o el costo de ESTA sucursal. Antes
    // caía al costPrice del Product (null en el catálogo global) y, si tampoco
    // había, al PRECIO DE VENTA: el pedido (y el gasto en caja si se pagaba en
    // efectivo) quedaba valuado a precio de venta en vez de a costo.
    const purchaseItems = items.map((item) => {
      const product = products.find((current) => current.id === item.productId);
      const packCost = product.loadMode === 'pack' && product.packPrice && product.packUnits
        ? Number(product.packPrice) / Number(product.packUnits)
        : null;
      const unitCost = item.unitCost ?? product.kioskProducts[0]?.cost ?? product.costPrice ?? packCost ?? 0;
      return {
        productId: product.id,
        quantity: item.quantity,
        unitCost,
        lineTotal: Math.round(unitCost * item.quantity * 100) / 100,
      };
    });

    const totalAmount = Math.round(purchaseItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;

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
          items: buildPurchaseItemSelect(kiosk.id),
        },
      });

      if (paymentMethod === 'CASH' && totalAmount > 0) {
        await tx.cashFlow.create({
          data: {
            kioskId: kiosk.id,
            type: 'EXPENSE',
            amount: totalAmount,
            category: 'Compras',
            paidFromCash: true,
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
      // Se marca recibido PRIMERO y solo si seguía pendiente: con un doble
      // clic (o dos pestañas) las dos requests pasaban el chequeo de arriba
      // y el stock del pedido se sumaba dos veces.
      const { count } = await tx.purchase.updateMany({
        where: { id: purchase.id, status: { not: 'RECEIVED' } },
        data: { status: 'RECEIVED', receivedAt },
      });
      if (count === 0) {
        throw Object.assign(new Error('El pedido ya fue recibido'), { statusCode: 400 });
      }

      for (const item of purchase.items) {
        // El costo del pedido pasa a ser el costo actual del producto en la
        // sucursal (último costo de compra). Si el producto todavía no estaba
        // en el stock, se crea con el precio de venta que tenga el producto —
        // antes quedaba con precio null y después no se podía vender.
        const hasCost = Number.isFinite(item.unitCost) && item.unitCost > 0;
        await tx.kioskProduct.upsert({
          where: { kioskId_productId: { kioskId: kiosk.id, productId: item.productId } },
          create: {
            kioskId: kiosk.id,
            productId: item.productId,
            stock: item.quantity,
            minStock: item.product.minStock ?? 0,
            price: item.product.salePrice ?? null,
            cost: hasCost ? item.unitCost : (item.product.costPrice ?? null),
          },
          update: {
            stock: { increment: item.quantity },
            ...(hasCost ? { cost: item.unitCost } : {}),
          },
        });
      }

      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: {
          supplier: true,
          items: buildPurchaseItemSelect(kiosk.id),
        },
      });
    });

    res.json(updatedPurchase);
  } catch (err) {
    next(err);
  }
});
