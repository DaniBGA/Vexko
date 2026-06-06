// src/routes/suppliers.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) where.name = { contains: search };
    const suppliers = await prisma.supplier.findMany({
      where,
      include: {
        _count: { select: { products: true, purchases: true } },
        purchases: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch (err) { next(err); }
});

suppliersRouter.get('/:id', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        products: { where: { active: true }, orderBy: { name: 'asc' } },
        purchases: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.post('/', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.create({ data: req.body });
    res.status(201).json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.put('/:id', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});
