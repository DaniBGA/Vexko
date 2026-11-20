// src/routes/clients.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

// Código numérico de 8 dígitos (también sirve como código de barra vía
// JsBarcode en el frontend, formato CODE128 acepta cualquier largo). Mismo
// patrón que generateUniqueBarcode() en products.js para los productos.
function generateRedemptionCodeCandidate() {
  let code = '9';
  for (let i = 0; i < 7; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function generateUniqueRedemptionCode() {
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = generateRedemptionCodeCandidate();
    const exists = await prisma.pointRedemption.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un código único');
}

async function getScopedKiosk(req, res) {
  const kiosk = await resolveRequestKiosk(req);
  if (!kiosk) {
    res.status(400).json({ error: 'No hay kiosko configurado' });
    return null;
  }
  return kiosk;
}

clientsRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const { search } = req.query;
    const where = { kioskId: kiosk.id };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    const rule = await prisma.loyaltyRule.findFirst({ where: { kioskId: kiosk.id, active: true } });
    const clients = await prisma.client.findMany({
      where,
      orderBy: [{ points: 'desc' }],
      include: {
        _count: { select: { sales: true } },
        sales: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    // Saldo de fiado de todos los clientes de este kiosco en una sola consulta
    // (no una por cliente) — se trae toda deuda pendiente/parcial del kiosco y
    // se suma por cliente acá, mismo patrón que el resto de la app para evitar
    // N+1 contra la base.
    const openDebts = await prisma.clientDebt.findMany({
      where: { kioskId: kiosk.id, status: { not: 'PAID' } },
      select: { clientId: true, amount: true, paidAmount: true },
    });
    const debtByClient = new Map();
    for (const debt of openDebts) {
      const pending = debt.amount - debt.paidAmount;
      debtByClient.set(debt.clientId, (debtByClient.get(debt.clientId) || 0) + pending);
    }

    const enriched = clients.map((c) => ({
      ...c,
      pointsToNextRedemption: rule
        ? Math.max(0, parseInt(rule.pointsForDiscount) - c.points)
        : null,
      debtBalance: debtByClient.get(c.id) || 0,
    }));

    res.json({ clients: enriched, loyaltyRule: rule });
  } catch (err) { next(err); }
});

// Reglas de fidelización (por sucursal)
clientsRouter.get('/loyalty/rules', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const rule = await prisma.loyaltyRule.findFirst({ where: { kioskId: kiosk.id, active: true } });
    res.json(rule);
  } catch (err) { next(err); }
});

clientsRouter.put('/loyalty/rules', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const amountPerPoint = parseFloat(req.body.amountPerPoint);
    const pointsForDiscount = parseInt(req.body.pointsForDiscount, 10);
    const discountPercent = parseFloat(req.body.discountPercent);

    if (!amountPerPoint || amountPerPoint <= 0) {
      return res.status(400).json({ error: 'Ingresá cuántos pesos gastados equivalen a 1 punto' });
    }
    if (!pointsForDiscount || pointsForDiscount <= 0) {
      return res.status(400).json({ error: 'Ingresá cuántos puntos hacen falta para el descuento' });
    }
    if (!discountPercent || discountPercent <= 0 || discountPercent > 100) {
      return res.status(400).json({ error: 'El porcentaje de descuento tiene que estar entre 1 y 100' });
    }

    await prisma.loyaltyRule.updateMany({ where: { kioskId: kiosk.id, active: true }, data: { active: false } });
    const rule = await prisma.loyaltyRule.create({
      data: { kioskId: kiosk.id, amountPerPoint, pointsForDiscount, discountPercent },
    });
    res.json(rule);
  } catch (err) { next(err); }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const [client, rule] = await Promise.all([
      prisma.client.findFirstOrThrow({
        where: { id: req.params.id, kioskId: kiosk.id },
        include: {
          sales: {
            include: { items: { include: { product: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          redemptions: { orderBy: { createdAt: 'desc' }, take: 10 },
          debts: {
            include: { payments: { orderBy: { createdAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      prisma.loyaltyRule.findFirst({ where: { kioskId: kiosk.id, active: true } }),
    ]);
    const debtBalance = client.debts
      .filter((d) => d.status !== 'PAID')
      .reduce((sum, d) => sum + (d.amount - d.paidAmount), 0);
    res.json({
      ...client,
      pointsToNextRedemption: rule ? Math.max(0, rule.pointsForDiscount - client.points) : null,
      loyaltyRule: rule,
      debtBalance,
    });
  } catch (err) { next(err); }
});

clientsRouter.post('/', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!name) return res.status(400).json({ error: 'Completá el nombre' });
    if (!phone) return res.status(400).json({ error: 'Completá el teléfono' });

    const duplicate = await prisma.client.findFirst({ where: { kioskId: kiosk.id, phone }, select: { id: true } });
    if (duplicate) return res.status(409).json({ error: 'Ya hay un cliente con ese teléfono' });

    const client = await prisma.client.create({ data: { name, phone, kioskId: kiosk.id } });
    res.status(201).json(client);
  } catch (err) { next(err); }
});

clientsRouter.put('/:id', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const client = await prisma.client.findFirstOrThrow({ where: { id: req.params.id, kioskId: kiosk.id } });
    // Solo nombre y teléfono. Antes se pasaba el body entero a Prisma: se
    // podían reescribir `points` o `totalSpent` a mano (puntos regalados), y
    // cualquier campo de más (los que vienen en el GET, como debtBalance)
    // hacía fallar la request con un 500.
    const data = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Completá el nombre' });
      data.name = name;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ error: 'Completá el teléfono' });
      data.phone = phone;
    }
    const updated = await prisma.client.update({
      where: { id: client.id },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Canjear puntos: genera un código (PENDING) en vez de aplicar el descuento
// al toque. El código se consume recién cuando se carga en una venta futura
// de ese mismo cliente (ver POST /sales).
clientsRouter.post('/:id/redeem', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const clientId = req.params.id;
    const rule = await prisma.loyaltyRule.findFirst({ where: { kioskId: kiosk.id, active: true } });
    if (!rule) return res.status(400).json({ error: 'Configurá primero el sistema de puntos' });
    const client = await prisma.client.findFirstOrThrow({ where: { id: clientId, kioskId: kiosk.id } });

    if (client.points < rule.pointsForDiscount) {
      return res.status(400).json({ error: `Faltan ${rule.pointsForDiscount - client.points} puntos para canjear` });
    }

    const code = await generateUniqueRedemptionCode();
    const { redemption, updated } = await prisma.$transaction(async (tx) => {
      // Descuento condicionado a que sigan alcanzando los puntos: con un doble
      // clic en "Canjear" se generaban dos cupones y el saldo quedaba negativo.
      const { count } = await tx.client.updateMany({
        where: { id: clientId, points: { gte: rule.pointsForDiscount } },
        data: { points: { decrement: rule.pointsForDiscount } },
      });
      if (count === 0) {
        throw Object.assign(new Error('El cliente ya no tiene puntos suficientes para canjear'), { statusCode: 400 });
      }
      return {
        redemption: await tx.pointRedemption.create({
          data: { clientId, pointsUsed: rule.pointsForDiscount, discount: Math.min(100, rule.discountPercent), code },
        }),
        updated: await tx.client.findUnique({ where: { id: clientId } }),
      };
    });

    res.json({ redemption, client: updated });
  } catch (err) { next(err); }
});

// Fiado: dejar una deuda nueva a nombre de un cliente (desde Caja o desde el
// detalle del cliente).
clientsRouter.post('/:id/debts', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Ingresá un monto válido' });
    }

    const client = await prisma.client.findFirstOrThrow({ where: { id: req.params.id, kioskId: kiosk.id } });
    const debt = await prisma.clientDebt.create({
      data: {
        clientId: client.id,
        kioskId: kiosk.id,
        amount,
        note: req.body.note || null,
      },
    });
    res.status(201).json(debt);
  } catch (err) { next(err); }
});

// Registrar un pago contra una deuda puntual (permite pagos parciales). Se
// elige la deuda del "registro" del cliente en vez de descontar de un pozo
// común, así queda historial de qué fiado se saldó y cuándo.
clientsRouter.post('/:id/debts/:debtId/payments', async (req, res, next) => {
  try {
    const kiosk = await getScopedKiosk(req, res);
    if (!kiosk) return;

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Ingresá un monto válido' });
    }

    const debt = await prisma.clientDebt.findFirstOrThrow({
      where: { id: req.params.debtId, clientId: req.params.id, kioskId: kiosk.id },
    });
    const pending = debt.amount - debt.paidAmount;
    if (amount > pending + 0.01) {
      return res.status(400).json({ error: `El pago no puede superar lo pendiente (${pending.toFixed(2)})` });
    }

    const newPaidAmount = Math.round((debt.paidAmount + amount) * 100) / 100;
    const status = newPaidAmount >= debt.amount - 0.01 ? 'PAID' : 'PARTIAL';

    const { payment, updatedDebt } = await prisma.$transaction(async (tx) => {
      // Bloqueo optimista sobre paidAmount: si entraban dos pagos a la vez,
      // los dos validaban contra el mismo "pendiente" y se podía pagar de más.
      const { count } = await tx.clientDebt.updateMany({
        where: { id: debt.id, paidAmount: debt.paidAmount },
        data: { paidAmount: newPaidAmount, status },
      });
      if (count === 0) {
        throw Object.assign(new Error('La deuda cambió mientras se registraba el pago, revisá el saldo y probá de nuevo'), { statusCode: 409 });
      }
      return {
        payment: await tx.clientDebtPayment.create({ data: { debtId: debt.id, amount } }),
        updatedDebt: await tx.clientDebt.findUnique({ where: { id: debt.id } }),
      };
    });

    res.json({ payment, debt: updatedDebt });
  } catch (err) { next(err); }
});
