// src/routes/cashRegister.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const cashRegisterRouter = Router();
cashRegisterRouter.use(requireAuth);

const EMPLOYEE_SELECT = { select: { id: true, name: true } };

function parsePage(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value, { unbounded } = {}) {
  const cap = unbounded ? 500 : 20;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return unbounded ? cap : 8;
  return Math.min(parsed, cap);
}

async function getRegisterSummary(register) {
  if (!register) return null;

  const endDate = register.closedAt || new Date();
  const kioskId = register.user?.kioskId || null;
  const kioskWhere = kioskId ? { kioskId } : undefined;
  const [cashSales, transferSales, cardSales, expenses] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { cashAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['CASH', 'MIXED'] },
      },
    }),
    prisma.sale.aggregate({
      _sum: { transferAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['TRANSFER', 'MIXED'] },
      },
    }),
    prisma.sale.aggregate({
      _sum: { cardAmount: true },
      where: {
        createdAt: { gte: register.openedAt, lte: endDate },
        ...kioskWhere,
        paymentMethod: { in: ['CARD', 'MIXED'] },
      },
    }),
    prisma.cashFlow.aggregate({
      _sum: { amount: true },
      where: { type: 'EXPENSE', createdAt: { gte: register.openedAt, lte: endDate }, ...kioskWhere },
    }),
  ]);

  const cashSalesTotal = parseFloat(cashSales._sum.cashAmount || 0);
  const transferSalesTotal = parseFloat(transferSales._sum.transferAmount || 0);
  const cardSalesTotal = parseFloat(cardSales._sum.cardAmount || 0);
  const expensesTotal = parseFloat(expenses._sum.amount || 0);
  const expectedCashBeforeClose = parseFloat(register.openingAmount || 0) + cashSalesTotal - expensesTotal;
  const movementTotal = cashSalesTotal + transferSalesTotal + cardSalesTotal;

  return {
    cashSales: cashSalesTotal,
    transferSales: transferSalesTotal,
    cardSales: cardSalesTotal,
    expensesTotal,
    expectedCashBeforeClose,
    movementTotal,
  };
}

// Igual que getRegisterSummary, pero para una LISTA de turnos: en vez de
// disparar 4 queries de agregación por turno (N+1 — una página de historial
// de 8 turnos hacía ~32 queries, y el export a PDF con hasta 500 turnos podía
// llegar a ~2000), trae las ventas y gastos de todo el rango una sola vez y
// los reparte por turno en memoria. Los turnos de un mismo kiosco nunca se
// superponen (no se puede abrir uno nuevo si ya hay otro abierto), así que
// cada venta/gasto cae en la ventana de un único turno.
async function getRegisterSummariesBatch(kioskId, registers) {
  const summaries = new Map();
  if (!registers.length) return summaries;

  const now = new Date();
  const windows = registers.map((register) => ({
    id: register.id,
    openingAmount: register.openingAmount,
    start: register.openedAt,
    end: register.closedAt || now,
  }));
  const rangeStart = new Date(Math.min(...windows.map((w) => w.start.getTime())));
  const rangeEnd = new Date(Math.max(...windows.map((w) => w.end.getTime())));

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { kioskId, createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { createdAt: true, paymentMethod: true, cashAmount: true, transferAmount: true, cardAmount: true },
    }),
    prisma.cashFlow.findMany({
      where: { kioskId, type: 'EXPENSE', createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { createdAt: true, amount: true },
    }),
  ]);

  for (const { id, openingAmount, start, end } of windows) {
    const startMs = start.getTime();
    const endMs = end.getTime();

    let cashSalesTotal = 0;
    let transferSalesTotal = 0;
    let cardSalesTotal = 0;
    for (const sale of sales) {
      const t = sale.createdAt.getTime();
      if (t < startMs || t > endMs) continue;
      if (sale.paymentMethod === 'CASH' || sale.paymentMethod === 'MIXED') cashSalesTotal += parseFloat(sale.cashAmount || 0);
      if (sale.paymentMethod === 'TRANSFER' || sale.paymentMethod === 'MIXED') transferSalesTotal += parseFloat(sale.transferAmount || 0);
      if (sale.paymentMethod === 'CARD' || sale.paymentMethod === 'MIXED') cardSalesTotal += parseFloat(sale.cardAmount || 0);
    }

    let expensesTotal = 0;
    for (const flow of expenses) {
      const t = flow.createdAt.getTime();
      if (t < startMs || t > endMs) continue;
      expensesTotal += parseFloat(flow.amount || 0);
    }

    const expectedCashBeforeClose = parseFloat(openingAmount || 0) + cashSalesTotal - expensesTotal;
    const movementTotal = cashSalesTotal + transferSalesTotal + cardSalesTotal;

    summaries.set(id, {
      cashSales: cashSalesTotal,
      transferSales: transferSalesTotal,
      cardSales: cardSalesTotal,
      expensesTotal,
      expectedCashBeforeClose,
      movementTotal,
    });
  }

  return summaries;
}

// Obtener caja activa o historial
cashRegisterRouter.get('/current', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json(null);

    const register = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN', user: { kioskId: kiosk.id } },
      include: { user: { select: { name: true, kioskId: true } }, employee: EMPLOYEE_SELECT },
      orderBy: { openedAt: 'desc' },
    });

    if (!register) {
      return res.json(null);
    }

    const summary = await getRegisterSummary(register);
    res.json({
      ...register,
      ...summary,
    });
  } catch (err) { next(err); }
});

cashRegisterRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ registers: [], total: 0, page: 1, limit: 8, totalPages: 0 });
    }

    const unbounded = req.query.all === '1';
    const page = unbounded ? 1 : parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, { unbounded });
    const skip = (page - 1) * limit;
    const where = { user: { kioskId: kiosk.id } };

    const [total, registers] = await Promise.all([
      prisma.cashRegister.count({ where }),
      prisma.cashRegister.findMany({
      where,
      include: { user: { select: { name: true, kioskId: true } }, employee: EMPLOYEE_SELECT },
      orderBy: { openedAt: 'desc' },
      skip,
      take: limit,
    }),
    ]);

    const summaries = await getRegisterSummariesBatch(kiosk.id, registers);
    const enriched = registers.map((register) => ({
      ...register,
      ...summaries.get(register.id),
    }));

    res.json({
      registers: enriched,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

// Abrir caja
cashRegisterRouter.post('/open', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado' });
    }

    const existing = await prisma.cashRegister.findFirst({ where: { status: 'OPEN', user: { kioskId: kiosk.id } } });
    if (existing) return res.status(409).json({ error: 'Ya hay una caja abierta' });

    // Si el kiosco ya tiene empleados cargados, abrir la caja exige elegir
    // quién la abre y su clave — así el turno queda identificado. Si todavía
    // no cargaron ningún empleado, se abre como antes (no bloquea el uso
    // normal de la caja mientras el dueño no configuró empleados).
    const employeeCount = await prisma.employee.count({ where: { kioskId: kiosk.id, active: true } });
    let employeeId = null;

    if (employeeCount > 0) {
      const { employeeId: bodyEmployeeId, pin } = req.body;
      if (!bodyEmployeeId) {
        return res.status(400).json({ error: 'Elegí qué empleado abre la caja' });
      }
      const employee = await prisma.employee.findFirst({ where: { id: bodyEmployeeId, kioskId: kiosk.id, active: true } });
      if (!employee) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      const validPin = await bcrypt.compare(String(pin ?? ''), employee.pinHash);
      if (!validPin) {
        return res.status(401).json({ error: 'La clave no es correcta' });
      }
      employeeId = employee.id;
    }

    const register = await prisma.cashRegister.create({
      data: {
        userId: req.user.id,
        employeeId,
        openingAmount: parseFloat(req.body.openingAmount),
        notes: req.body.notes,
      },
      include: { employee: EMPLOYEE_SELECT },
    });
    res.status(201).json(register);
  } catch (err) { next(err); }
});

// Cerrar caja
cashRegisterRouter.post('/:id/close', async (req, res, next) => {
  try {
    const { actualAmount, notes } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Caja no encontrada' });
    }

    const register = await prisma.cashRegister.findFirstOrThrow({ where: { id: req.params.id, user: { kioskId: kiosk.id } }, include: { user: { select: { kioskId: true } } } });
    if (register.status === 'CLOSED') return res.status(400).json({ error: 'Caja ya cerrada' });

    const now = new Date();
    const summary = await getRegisterSummary(register);
    const expectedAmount = summary.expectedCashBeforeClose;
    const actual = parseFloat(actualAmount);
    const difference = actual - expectedAmount;

    const updated = await prisma.cashRegister.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED', closedAt: now, expectedAmount, actualAmount: actual, difference, notes },
      include: { employee: EMPLOYEE_SELECT },
    });
    res.json({
      ...updated,
      ...summary,
    });
  } catch (err) { next(err); }
});

// Editar un turno de caja (para corregir un error de apertura/cierre, p. ej.
// un monto mal cargado o el empleado equivocado). No permite tocar las
// fechas ni el estado, solo los montos, las notas y el empleado.
cashRegisterRouter.patch('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Caja no encontrada' });

    const register = await prisma.cashRegister.findFirst({ where: { id: req.params.id, user: { kioskId: kiosk.id } } });
    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });

    const data = {};
    if (req.body.openingAmount !== undefined) {
      const openingAmount = parseFloat(req.body.openingAmount);
      if (!Number.isFinite(openingAmount) || openingAmount < 0) {
        return res.status(400).json({ error: 'El monto de apertura no es válido' });
      }
      data.openingAmount = openingAmount;
    }
    if (req.body.actualAmount !== undefined && register.status === 'CLOSED') {
      const actualAmount = parseFloat(req.body.actualAmount);
      if (!Number.isFinite(actualAmount) || actualAmount < 0) {
        return res.status(400).json({ error: 'El efectivo contado no es válido' });
      }
      data.actualAmount = actualAmount;
    }
    if (req.body.notes !== undefined) {
      data.notes = req.body.notes || null;
    }
    if (req.body.employeeId !== undefined) {
      if (req.body.employeeId) {
        const employee = await prisma.employee.findFirst({ where: { id: req.body.employeeId, kioskId: kiosk.id } });
        if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });
        data.employeeId = employee.id;
      } else {
        data.employeeId = null;
      }
    }

    await prisma.cashRegister.update({ where: { id: register.id }, data });

    const withEmployee = await prisma.cashRegister.findUnique({
      where: { id: register.id },
      include: { user: { select: { name: true, kioskId: true } }, employee: EMPLOYEE_SELECT },
    });

    const summary = await getRegisterSummary(withEmployee);
    let result = withEmployee;

    // Si está cerrada, el esperado/la diferencia dependen del monto de
    // apertura y de lo contado — hay que recalcularlos si alguno cambió.
    if (withEmployee.status === 'CLOSED') {
      const expectedAmount = summary.expectedCashBeforeClose;
      const difference = parseFloat(withEmployee.actualAmount || 0) - expectedAmount;
      result = await prisma.cashRegister.update({
        where: { id: register.id },
        data: { expectedAmount, difference },
        include: { user: { select: { name: true, kioskId: true } }, employee: EMPLOYEE_SELECT },
      });
    }

    res.json({ ...result, ...summary });
  } catch (err) { next(err); }
});

// Borrar un turno de caja (p. ej. se abrió por error y se cerró sin ningún
// movimiento real de dinero).
cashRegisterRouter.delete('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Caja no encontrada' });

    const register = await prisma.cashRegister.findFirst({ where: { id: req.params.id, user: { kioskId: kiosk.id } } });
    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });

    await prisma.cashRegister.delete({ where: { id: register.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});
