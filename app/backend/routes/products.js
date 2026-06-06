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

// GET /api/products
productsRouter.get('/', async (req, res, next) => {
  try {
    const { search, status, subcategoryId, supplierId, isCustom } = req.query;
    const where = { active: true };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { id: { contains: search } },
      ];
    }
    if (subcategoryId) where.subcategoryId = parseInt(subcategoryId);
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (isCustom === 'true') where.isCustom = true;
    if (isCustom === 'false') where.isCustom = false;
    if (status === 'critical') {
      where.stock = { lte: prisma.product.fields.minStock };
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
      where: { id: parseInt(req.params.id) },
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
    const { name, barcode, subcategoryId, supplierId, costPrice, salePrice, stock, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const product = await prisma.product.create({
      data: {
        name,
        barcode: barcode || null,
        subcategoryId: subcategoryId ? parseInt(subcategoryId) : null,
        supplierId: supplierId ? parseInt(supplierId) : null,
        costPrice,
        salePrice,
        stock: parseInt(stock) || 0,
        minStock: parseInt(minStock) || 0,
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
    const { name, barcode, subcategoryId, supplierId, costPrice, salePrice, stock, minStock, expiresAt, description, isCustom, customerId } = req.body;
    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        barcode: barcode || null,
        subcategoryId: subcategoryId ? parseInt(subcategoryId) : undefined,
        supplierId: supplierId ? parseInt(supplierId) : null,
        costPrice,
        salePrice,
        stock: stock !== undefined ? parseInt(stock) : undefined,
        minStock: minStock !== undefined ? parseInt(minStock) : undefined,
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

// DELETE /api/products/:id  (soft delete)
productsRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.product.update({
      where: { id: parseInt(req.params.id) },
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
