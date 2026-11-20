// src/routes/cashflow.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const cashFlowRouter = Router();
cashFlowRouter.use(requireAuth);

// El input <input type="date"> del frontend manda solo "YYYY-MM-DD". Un
// `new Date("YYYY-MM-DD")` lo interpreta como medianoche UTC — en Argentina
// (UTC-3) eso cae en las 21hs del día ANTERIOR, así que un gasto cargado con
// la fecha de "hoy" terminaba con un createdAt de ayer a la noche: quedaba
// antes de que se abriera la caja del día y no se reflejaba en "Gastos del
// turno". Se combina la fecha elegida con la hora actual (en vez de
// medianoche) para que "hoy" caiga siempre dentro del turno abierto.
function resolveExpenseDate(dateStr) {
  if (!dateStr) return undefined;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
}

function toLocalDateString(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FLOW_TYPES = ['INCOME', 'EXPENSE'];

// "¿Salió de la caja?": por defecto sí (era el único comportamiento antes de
// existir el campo). Acepta booleano o los strings que manda un form.
function parsePaidFromCash(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return undefined;
}

function parseFlowAmount(value) {
  const amount = parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

cashFlowRouter.get('/', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const unbounded = req.query.all === '1';
    const page = unbounded ? 1 : Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = unbounded
      ? 500
      : Math.min(20, Math.max(1, parseInt(req.query.limit || '10', 10) || 10));
    const now = new Date();
    let from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') from = new Date(now.getTime() - 7 * 86400000);

    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ flows: [], totals: { income: 0, expense: 0, balance: 0 }, page, limit, total: 0, totalPages: 0 });
    }

    const where = { kioskId: kiosk.id, createdAt: { gte: from } };
    const [flows, total, totalsByType, outsideCash] = await Promise.all([
      prisma.cashFlow.findMany({
        where,
        include: { kiosk: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cashFlow.count({ where }),
      prisma.cashFlow.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
      }),
      prisma.cashFlow.aggregate({
        where: { ...where, type: 'EXPENSE', paidFromCash: false },
        _sum: { amount: true },
      }),
    ]);

    const totals = totalsByType.reduce(
      (acc, f) => {
        const amount = f._sum.amount ? parseFloat(f._sum.amount) : 0;
        if (f.type === 'INCOME') acc.income += amount;
        else acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const expenseOutsideCash = parseFloat(outsideCash._sum.amount || 0);
    res.json({
      flows,
      totals: {
        ...totals,
        balance: totals.income - totals.expense,
        expenseFromCash: totals.expense - expenseOutsideCash,
        expenseOutsideCash,
      },
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) { next(err); }
});

cashFlowRouter.post('/', async (req, res, next) => {
  try {
    const { concept, category, date } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    // Antes no se validaba nada: un monto vacío o negativo se guardaba (o
    // rompía con un 500) y un gasto negativo SUMABA al efectivo esperado de
    // la caja.
    const type = String(req.body.type || 'EXPENSE').toUpperCase();
    if (!FLOW_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de movimiento inválido' });
    const amount = parseFlowAmount(req.body.amount);
    if (amount === null) return res.status(400).json({ error: 'Ingresá un monto mayor a cero' });

    const descriptionParts = [];
    if (category) descriptionParts.push(category);
    if (concept) descriptionParts.push(concept);
    const description = descriptionParts.length ? descriptionParts.join(' — ') : null;

    const flow = await prisma.cashFlow.create({
      data: {
        kioskId: kiosk.id,
        type,
        amount,
        description,
        category: category || null,
        paidFromCash: parsePaidFromCash(req.body.paidFromCash) ?? true,
        createdAt: resolveExpenseDate(date),
      },
    });
    res.status(201).json(flow);
  } catch (err) { next(err); }
});

cashFlowRouter.delete('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Gasto no encontrado' });
    const existing = await prisma.cashFlow.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!existing) return res.status(404).json({ error: 'Gasto no encontrado' });
    await prisma.cashFlow.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

cashFlowRouter.put('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Gasto no encontrado' });
    const existing = await prisma.cashFlow.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!existing) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { concept, category, date } = req.body;
    let amount;
    if (req.body.amount !== undefined) {
      amount = parseFlowAmount(req.body.amount);
      if (amount === null) return res.status(400).json({ error: 'Ingresá un monto mayor a cero' });
    }

    // Si el día no cambió, se respeta la hora original: antes cada edición le
    // ponía la hora actual, así que corregir el monto de un gasto de la mañana
    // (turno ya cerrado) lo movía al turno abierto y cambiaba los dos arqueos.
    const sameDay = date && String(date).slice(0, 10) === toLocalDateString(existing.createdAt);

    const flow = await prisma.cashFlow.update({
      where: { id: existing.id },
      data: {
        amount,
        description: (category || concept) ? [category, concept].filter(Boolean).join(' — ') : undefined,
        category: category !== undefined ? category : undefined,
        paidFromCash: parsePaidFromCash(req.body.paidFromCash),
        createdAt: sameDay ? undefined : resolveExpenseDate(date),
      },
    });
    res.json(flow);
  } catch (err) { next(err); }
});
