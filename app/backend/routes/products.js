// src/routes/products.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

function buildProductInclude(kioskId) {
  const include = {
    subcategory: { include: { category: true } },
    supplier: { select: { id: true, name: true } },
  };

  if (kioskId) {
    include.kioskProducts = {
      where: { kioskId },
      select: { id: true, stock: true, minStock: true, price: true },
    };
  }

  return include;
}

function getKioskInventory(product) {
  return product?.kioskProducts?.[0] || null;
}

function mergeProductInventory(product) {
  const inventory = getKioskInventory(product);
  if (!inventory) {
    return {
      ...product,
      stock: product.stock ?? 0,
      minStock: product.minStock ?? 0,
      kioskInventoryId: null,
    };
  }

  return {
    ...product,
    stock: inventory.stock,
    minStock: inventory.minStock,
    salePrice: inventory.price ?? product.salePrice,
    kioskInventoryId: inventory.id,
  };
}

async function upsertKioskInventory(tx, kioskId, productId, data) {
  return tx.kioskProduct.upsert({
    where: { kioskId_productId: { kioskId, productId } },
    create: {
      kioskId,
      productId,
      stock: data.stock ?? 0,
      minStock: data.minStock ?? 0,
      price: data.price ?? null,
    },
    update: {
      ...(data.stock !== undefined ? { stock: data.stock } : {}),
      ...(data.minStock !== undefined ? { minStock: data.minStock } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
    },
  });
}

const productInclude = {
  subcategory: { include: { category: true } },
  supplier: { select: { id: true, name: true } },
};

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInt(value) {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseDateOnly(value) {
  if (!value) return undefined;
  const [year, month, day] = String(value).split('-').map((part) => Number(part));
  if (!year || !month || !day) return undefined;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function normalizeSearchTerm(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeLimit(value, fallback = 10) {
  const parsed = toInt(value);
  if (!parsed || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

function normalizePage(value) {
  const parsed = toInt(value);
  return !parsed || parsed < 1 ? 1 : parsed;
}

function buildSearchWhere(search) {
  const term = normalizeSearchTerm(search);
  if (!term) return undefined;

  const numericLike = /^[0-9\-\s.]+$/.test(term);
  return {
    OR: [
      { name: { contains: term } },
      { id: { startsWith: term } },
      { barcode: numericLike ? { startsWith: term } : { contains: term } },
      { sku: numericLike ? { startsWith: term } : { contains: term } },
    ],
  };
}

function normalizeProductKey(product) {
  return [
    String(product?.name || '').trim().toLowerCase(),
    product?.categoryId || '',
    product?.subcategoryId || '',
    product?.barcode || '',
    product?.sku || '',
    product?.supplierId || '',
    product?.loadMode || '',
    product?.customerId || '',
    product?.isCustom ? '1' : '0',
  ].join('::');
}

function dedupeProductsByName(products) {
  const seen = new Map();
  for (const product of products) {
    const key = normalizeProductKey(product);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, product);
    }
  }
  return Array.from(seen.values());
}

function buildCatalogAccessWhere(customerId) {
  return {
    active: true,
    OR: [{ customerId }, { customerId: null }],
  };
}

function computeProductValues(body) {
  const loadMode = body.loadMode === 'unit' ? 'unit' : 'pack';
  const packPrice = toNumber(body.packPrice);
  const packUnits = toInt(body.packUnits);
  const packCount = toInt(body.packCount);
  const unitCost = toNumber(body.costPrice);
  const stock = toInt(body.stock);
  const salePrice = toNumber(body.salePrice);

  if (loadMode === 'unit') {
    return { loadMode, packPrice: undefined, packUnits: undefined, packCount: undefined, unitCost, stock, salePrice };
  }

  const resolvedPackPrice = packPrice !== undefined ? packPrice : unitCost;
  const resolvedPackUnits = packUnits;
  const derivedUnitCost = resolvedPackPrice !== undefined && resolvedPackUnits ? resolvedPackPrice / resolvedPackUnits : unitCost;
  const resolvedStock = packUnits !== undefined && packCount !== undefined ? packUnits * packCount : stock;

  return { loadMode, packPrice: resolvedPackPrice, packUnits: resolvedPackUnits, packCount, unitCost: derivedUnitCost, stock: resolvedStock, salePrice };
}

// GET /api/products
productsRouter.get('/', async (req, res, next) => {
  try {
    const { search, status, subcategoryId, supplierId, isCustom, page, limit } = req.query;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ products: [], total: 0, page: 1, limit: normalizeLimit(limit), totalPages: 0 });
    }

    const stockView = req.query.stockView === '1' || req.query.stockView === 'true';
    const available = req.query.available === '1' || req.query.available === 'true';
    const addedOnly = req.query.added === '1' || req.query.added === 'true' || req.query.agregados === '1' || req.query.agregados === 'true';
    const includeGlobal = req.query.global === '1' || req.query.includeGlobal === 'true';
    const dedupeGlobal = req.query.dedupe !== 'false';
    const searchWhere = buildSearchWhere(search);
    const usePagination = page !== undefined || limit !== undefined;

    if (stockView) {
      const where = buildCatalogAccessWhere(kiosk.customerId);
      if (searchWhere) Object.assign(where, searchWhere);
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (supplierId) where.supplierId = supplierId;
      if (isCustom === 'true') where.isCustom = true;
      if (isCustom === 'false') where.isCustom = false;

      const allProducts = await prisma.product.findMany({
        where,
        include: buildProductInclude(kiosk.id),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });

      const merged = allProducts.map((product) => {
        const inventory = getKioskInventory(product);
        return {
          ...product,
          stock: inventory?.stock ?? 0,
          minStock: inventory?.minStock ?? 0,
          salePrice: inventory?.price ?? product.salePrice,
          stockStatus:
            (inventory?.stock ?? 0) === 0 ? 'OUT'
            : (inventory?.stock ?? 0) <= (inventory?.minStock ?? 0) ? 'CRITICAL'
            : (inventory?.stock ?? 0) <= (inventory?.minStock ?? 0) * 1.5 ? 'ALERT'
            : 'OK',
          kioskInventoryId: inventory?.id ?? null,
        };
      });

      const dedupedMerged = dedupeProductsByName(merged);
      let filtered = addedOnly
        ? dedupedMerged.filter((product) => Boolean(product.customerId) || Boolean(product.kioskInventoryId))
        : dedupedMerged;

      if (available) {
        filtered = filtered.filter((p) => (p.stock || 0) > 0);
      }

      if (usePagination) {
        const pageNumber = normalizePage(page);
        const pageSize = normalizeLimit(limit);
        const total = filtered.length;
        const products = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
        res.json({
          products,
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        });
        return;
      }

      res.json(filtered);
      return;
    }

    if (includeGlobal) {
      const where = buildCatalogAccessWhere(kiosk.customerId);
      if (searchWhere) Object.assign(where, searchWhere);
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (supplierId) where.supplierId = supplierId;
      if (isCustom === 'true') where.isCustom = true;
      if (isCustom === 'false') where.isCustom = false;

      const allProducts = await prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const listProducts = dedupeGlobal ? dedupeProductsByName(allProducts) : allProducts;

      if (usePagination) {
        const pageNumber = normalizePage(page);
        const pageSize = normalizeLimit(limit);
        const total = listProducts.length;
        const products = listProducts.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

        const enriched = products.map((p) => ({
          ...p,
          stockStatus:
            p.stock === 0 ? 'OUT'
            : p.stock <= p.minStock ? 'CRITICAL'
            : p.stock <= p.minStock * 1.5 ? 'ALERT'
            : 'OK',
        }));

        const finalEnriched = available ? enriched.filter((p) => (p.stock || 0) > 0) : enriched;

        res.json({
          products: enriched,
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        });
        return;
      }

      const enriched = listProducts.map((p) => ({
        ...p,
        stockStatus:
          p.stock === 0 ? 'OUT'
          : p.stock <= p.minStock ? 'CRITICAL'
          : p.stock <= p.minStock * 1.5 ? 'ALERT'
          : 'OK',
      }));

      const finalEnriched = available ? enriched.filter((p) => (p.stock || 0) > 0) : enriched;

      res.json(finalEnriched);
      return;
    }

    const where = {
      active: true,
      OR: [
        { kioskProducts: { some: { kioskId: kiosk.id } } },
        { customerId: kiosk.customerId, kioskProducts: { none: {} } },
      ],
    };
    if (searchWhere) Object.assign(where, searchWhere);
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (supplierId) where.supplierId = supplierId;
    if (isCustom === 'true') where.isCustom = true;
    if (isCustom === 'false') where.isCustom = false;

    if (usePagination) {
      const pageNumber = normalizePage(page);
      const pageSize = normalizeLimit(limit);
      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: buildProductInclude(kiosk.id),
          orderBy: { name: 'asc' },
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      let enriched = products.map((p) => {
        const inventory = getKioskInventory(p);
        return {
          ...mergeProductInventory(p),
          stockStatus:
            inventory?.stock === 0 ? 'OUT'
            : inventory?.stock <= inventory?.minStock ? 'CRITICAL'
            : inventory?.stock <= inventory?.minStock * 1.5 ? 'ALERT'
            : 'OK',
        };
      });
      if (available) {
        enriched = enriched.filter((p) => (p.stock || 0) > 0);
      }

      res.json({
        products: enriched,
        total: enriched.length,
        page: pageNumber,
        limit: pageSize,
        totalPages: enriched.length === 0 ? 0 : Math.ceil(enriched.length / pageSize),
      });
      return;
    }

    const products = await prisma.product.findMany({
      where,
      include: buildProductInclude(kiosk.id),
      orderBy: { name: 'asc' },
    });

    let enriched = products.map((p) => {
      const inventory = getKioskInventory(p);
      return {
        ...mergeProductInventory(p),
        stockStatus:
          inventory?.stock === 0 ? 'OUT'
          : inventory?.stock <= inventory?.minStock ? 'CRITICAL'
          : inventory?.stock <= inventory?.minStock * 1.5 ? 'ALERT'
          : 'OK',
      };
    });
    if (available) {
      enriched = enriched.filter((p) => (p.stock || 0) > 0);
    }

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/prices  — lista de precios simplificada
productsRouter.get('/prices', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json([]);
    const includeGlobal = req.query.global === '1' || req.query.includeGlobal === 'true';
    const where = includeGlobal ? buildCatalogAccessWhere(kiosk.customerId) : { active: true, kioskProducts: { some: { kioskId: kiosk.id } } };
    if (!includeGlobal) {
      where.OR = [
        { kioskProducts: { some: { kioskId: kiosk.id } } },
        { customerId: kiosk.customerId, kioskProducts: { none: {} } },
      ];
      delete where.kioskProducts;
    }

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        barcode: true,
        packPrice: true,
        packUnits: true,
        packCount: true,
        costPrice: true,
        salePrice: true,
        subcategory: { select: { name: true, category: { select: { name: true } } } },
        kioskProducts: {
          where: { kioskId: kiosk.id },
          select: { id: true, stock: true, minStock: true, price: true },
        },
      },
      orderBy: [
        { subcategory: { category: { name: 'asc' } } },
        { name: 'asc' },
      ],
    });
    res.json(products.map((product) => mergeProductInventory(product)));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
productsRouter.get('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });

    const product = await prisma.product.findFirstOrThrow({
      where: {
        id: req.params.id,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: buildProductInclude(kiosk.id),
    });
      res.json(mergeProductInventory(product));
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/clone-to-kiosk
productsRouter.post('/:id/clone-to-kiosk', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Kiosco no encontrado' });
    }

    const source = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: productInclude,
    });

    if (!source) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const resolvedStock = toInt(req.body.stock);
    const resolvedMinStock = req.body.minStock !== undefined ? toInt(req.body.minStock) : undefined;
    const resolvedSalePrice = req.body.salePrice !== undefined ? toNumber(req.body.salePrice) : (req.body.price !== undefined ? toNumber(req.body.price) : undefined);
    const resolvedPackPrice = req.body.packPrice !== undefined ? toNumber(req.body.packPrice) : undefined;
    const resolvedPackUnits = req.body.packUnits !== undefined ? toInt(req.body.packUnits) : undefined;
    const resolvedPackCount = req.body.packCount !== undefined ? toInt(req.body.packCount) : undefined;
    const resolvedUnitCost = req.body.costPrice !== undefined ? toNumber(req.body.costPrice) : undefined;
    const resolvedLoadMode = req.body.loadMode === 'unit' ? 'unit' : 'pack';
    const resolvedExpiresAt = parseDateOnly(req.body.expiresAt);

    await prisma.product.update({
      where: { id: source.id },
      data: {
        loadMode: resolvedLoadMode,
        basePrice: resolvedPackPrice ?? resolvedSalePrice ?? null,
        baseCost: resolvedUnitCost ?? null,
        packPrice: resolvedPackPrice ?? null,
        packUnits: resolvedPackUnits ?? null,
        packCount: resolvedPackCount ?? null,
        costPrice: resolvedUnitCost ?? null,
        salePrice: resolvedSalePrice ?? null,
        expiresAt: resolvedExpiresAt ?? null,
        description: req.body.description !== undefined ? req.body.description : undefined,
        sku: req.body.sku !== undefined ? (req.body.sku || null) : undefined,
      },
    });

    await upsertKioskInventory(prisma, kiosk.id, source.id, {
      stock: resolvedStock,
      minStock: resolvedMinStock,
      price: resolvedSalePrice,
    });

    const linkedProduct = await prisma.product.findUnique({
      where: { id: source.id },
      include: buildProductInclude(kiosk.id),
    });

    res.status(200).json(mergeProductInventory(linkedProduct));
  } catch (err) {
    next(err);
  }
});

// POST /api/products
productsRouter.post('/', async (req, res, next) => {
  try {
    const { name, barcode, sku, subcategoryId, supplierId, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    const wantsCustom = isCustom === true || isCustom === 'true';
    const resolvedCustomerId = customerId !== undefined
      ? customerId || null
      : (wantsCustom ? kiosk?.customerId || null : null);
    const values = computeProductValues(req.body);

    if (wantsCustom && resolvedCustomerId) {
      const existingCustomProduct = await prisma.product.findFirst({
        where: {
          active: true,
          isCustom: true,
          customerId: resolvedCustomerId,
          OR: [
            ...(barcode ? [{ barcode }] : []),
            ...(sku ? [{ sku }] : []),
            {
              name,
              subcategoryId: subcategoryId || null,
              supplierId: supplierId || null,
              loadMode: values.loadMode,
              packPrice: values.packPrice ?? null,
              packUnits: values.packUnits ?? null,
              packCount: values.packCount ?? null,
            },
          ],
        },
        include: buildProductInclude(kiosk?.id),
      });

      if (existingCustomProduct) {
        const updatedProduct = await prisma.product.update({
          where: { id: existingCustomProduct.id },
          data: {
            name,
            barcode: barcode || null,
            sku: sku || null,
            loadMode: values.loadMode,
            subcategoryId: subcategoryId || null,
            supplierId: supplierId || null,
            basePrice: values.packPrice ?? null,
            baseCost: values.unitCost,
            packPrice: values.packPrice ?? null,
            packUnits: values.packUnits ?? null,
            packCount: values.packCount ?? null,
            costPrice: values.unitCost,
            salePrice: values.salePrice,
            stock: values.stock ?? 0,
            minStock: toInt(minStock) || 0,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            description,
            isCustom: true,
            customerId: resolvedCustomerId,
            active: true,
          },
          include: buildProductInclude(kiosk?.id),
        });

        if (kiosk) {
          await upsertKioskInventory(prisma, kiosk.id, updatedProduct.id, {
            stock: values.stock ?? 0,
            minStock: toInt(minStock) || 0,
            price: values.salePrice ?? null,
          });
        }

        const reloadedProduct = await prisma.product.findUnique({
          where: { id: updatedProduct.id },
          include: buildProductInclude(kiosk?.id),
        });

        res.status(200).json(mergeProductInventory(reloadedProduct));
        return;
      }
    }

    const product = await prisma.product.create({
      data: {
        name,
        barcode: barcode || null,
        sku: sku || null,
        loadMode: values.loadMode,
        subcategoryId: subcategoryId || null,
        supplierId: supplierId || null,
        basePrice: values.packPrice ?? null,
        baseCost: values.unitCost,
        packPrice: values.packPrice ?? null,
        packUnits: values.packUnits ?? null,
        packCount: values.packCount ?? null,
        costPrice: values.unitCost,
        salePrice: values.salePrice,
        stock: values.stock ?? 0,
        minStock: toInt(minStock) || 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        description,
        isCustom: wantsCustom,
        customerId: resolvedCustomerId,
      },
      include: buildProductInclude(kiosk?.id),
    });

    if (kiosk && wantsCustom) {
      await upsertKioskInventory(prisma, kiosk.id, product.id, {
        stock: values.stock ?? 0,
        minStock: toInt(minStock) || 0,
        price: values.salePrice ?? null,
      });

      const createdProduct = await prisma.product.findUnique({
        where: { id: product.id },
        include: buildProductInclude(kiosk.id),
      });

      res.status(201).json(mergeProductInventory(createdProduct));
      return;
    }

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id
productsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, barcode, sku, subcategoryId, supplierId, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { customerId: kiosk.customerId },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
    const wantsCustom = isCustom === true || isCustom === 'true';
    const resolvedCustomerId = customerId !== undefined
      ? customerId || null
      : (wantsCustom ? kiosk.customerId : null);
    const values = computeProductValues(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        barcode: barcode || null,
        sku: sku !== undefined ? sku || null : undefined,
        loadMode: values.loadMode,
        subcategoryId: subcategoryId !== undefined ? subcategoryId || null : undefined,
        supplierId: supplierId !== undefined ? supplierId || null : undefined,
        basePrice: values.packPrice ?? null,
        baseCost: values.unitCost,
        packPrice: values.packPrice ?? null,
        packUnits: values.packUnits ?? null,
        packCount: values.packCount ?? null,
        costPrice: values.unitCost,
        salePrice: values.salePrice,
        stock: values.stock,
        minStock: minStock !== undefined ? toInt(minStock) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        description,
        isCustom: typeof isCustom === 'boolean' || typeof isCustom === 'string' ? wantsCustom : undefined,
        customerId: resolvedCustomerId,
      },
      include: buildProductInclude(kiosk.id),
    });

    if (wantsCustom) {
      await upsertKioskInventory(prisma, kiosk.id, product.id, {
        stock: values.stock,
        minStock: minStock !== undefined ? toInt(minStock) : undefined,
        price: values.salePrice,
      });
    }

    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: buildProductInclude(kiosk.id),
    });

    res.json(mergeProductInventory(updatedProduct));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        OR: [{ customerId: null }, { kioskProducts: { some: { kioskId: kiosk.id } } }],
      },
      select: {
        isCustom: true,
        customerId: true,
        kioskProducts: { where: { kioskId: kiosk.id }, select: { id: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.kioskProducts?.length) {
      await prisma.kioskProduct.deleteMany({ where: { kioskId: kiosk.id, productId: req.params.id } });
    }

    if (product.isCustom && product.customerId === kiosk.customerId) {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { active: false },
      });
      return res.status(204).end();
    }

    if (product.kioskProducts?.length) {
      return res.status(204).end();
    }

    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/products/barcode/:code
productsRouter.get('/barcode/:code', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });

    const product = await prisma.product.findFirst({
      where: {
        barcode: req.params.code,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: buildProductInclude(kiosk.id),
    });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});
