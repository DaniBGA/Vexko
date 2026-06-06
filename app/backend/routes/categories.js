// src/routes/categories.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: { subcategories: true },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (err) { next(err); }
});

categoriesRouter.post('/', async (req, res, next) => {
  try {
    const category = await prisma.category.create({ data: { name: req.body.name } });
    res.status(201).json(category);
  } catch (err) { next(err); }
});

categoriesRouter.post('/:id/subcategories', async (req, res, next) => {
  try {
    const sub = await prisma.subcategory.create({
      data: { name: req.body.name, categoryId: parseInt(req.params.id) },
    });
    res.status(201).json(sub);
  } catch (err) { next(err); }
});
