// src/routes/categories.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

// Cada cliente ve las categorías globales (customerId null, las del catálogo
// global) más las propias que haya creado — nunca las de otro cliente.
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    const where = kiosk
      ? { OR: [{ customerId: kiosk.customerId }, { customerId: null }] }
      : { customerId: null };

    const categories = await prisma.category.findMany({
      where,
      include: { subcategories: true },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (err) { next(err); }
});

categoriesRouter.post('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const category = await prisma.category.create({
      data: { name, customerId: kiosk.customerId },
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
});

// Solo se puede agregar una subcategoría a una categoría propia: una
// subcategoría no tiene dueño propio, hereda el de su categoría, así que
// agregarla a una categoría global la haría visible para todos los clientes.
categoriesRouter.post('/:id/subcategories', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const category = await prisma.category.findFirst({
      where: { id: req.params.id, customerId: kiosk.customerId },
    });
    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada (creá primero tu propia categoría)' });
    }

    const sub = await prisma.subcategory.create({
      data: { name, categoryId: category.id },
    });
    res.status(201).json(sub);
  } catch (err) { next(err); }
});
