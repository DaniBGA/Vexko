// src/routes/products.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

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
    const where = { active: true };

    const searchWhere = buildSearchWhere(search);
    if (searchWhere) {
      Object.assign(where, searchWhere);
    }
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (supplierId) where.supplierId = supplierId;
    if (isCustom === 'true') where.isCustom = true;
    if (isCustom === 'false') where.isCustom = false;

    const usePagination = page !== undefined || limit !== undefined;

    if (usePagination) {
      const pageNumber = normalizePage(page);
      const pageSize = normalizeLimit(limit);
      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: productInclude,
          orderBy: { name: 'asc' },
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const enriched = products.map((p) => ({
        ...p,
        stockStatus:
          p.stock === 0 ? 'OUT'
          : p.stock <= p.minStock ? 'CRITICAL'
          : p.stock <= p.minStock * 1.5 ? 'ALERT'
          : 'OK',
      }));

      res.json({
        products: enriched,
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      });
      return;
    }

    const products = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: 'asc' },
    });

    // Enriquecer con estado de stock
    const enriched = products.map((p) => ({
      ...p,
      stockStatus:
        p.stock === 0 ? 'OUT'
        : p.stock <= p.minStock ? 'CRITICAL'
        : p.stock <= p.minStock * 1.5 ? 'ALERT'
        : 'OK',
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/prices  — lista de precios simplificada
productsRouter.get('/prices', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
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
      },
      orderBy: [
        { subcategory: { category: { name: 'asc' } } },
        { name: 'asc' },
      ],
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
productsRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: req.params.id },
      include: productInclude,
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/products
productsRouter.post('/', async (req, res, next) => {
  try {
    const { name, barcode, sku, subcategoryId, supplierId, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const values = computeProductValues(req.body);
    const product = await prisma.product.create({
      data: {
        name,
        barcode: barcode || null,
        sku: sku || null,
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
        isCustom: Boolean(isCustom),
        customerId: customerId || null,
      },
      include: productInclude,
    });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id
productsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, barcode, sku, subcategoryId, supplierId, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const values = computeProductValues(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        barcode: barcode || null,
        sku: sku !== undefined ? sku || null : undefined,
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
        isCustom: typeof isCustom === 'boolean' ? isCustom : undefined,
        customerId: customerId !== undefined ? customerId || null : undefined,
      },
      include: productInclude,
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { isCustom: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.isCustom) {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { isCustom: false, customerId: null },
      });
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
    const product = await prisma.product.findFirst({
      where: { barcode: req.params.code, active: true },
      include: productInclude,
    });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});
