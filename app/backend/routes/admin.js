// src/routes/admin.js
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { getSubscriptionStatus, isAfterTodayAr, parseArDate } from '../lib/subscription.js';
import { getAppSettings, normalizeWhatsappNumber, PLAN_PRICE_FIELDS, saveAppSettings } from '../lib/settings.js';

export const adminRouter = Router();

// Pagos que se muestran en el panel por cliente (el resto queda en la base).
const PAYMENTS_SHOWN = 12;

function withCustomerSubscription(customer) {
  return { ...customer, subscription: getSubscriptionStatus(customer) };
}

// lastPaymentAt es el paidAt más reciente: se recalcula (no solo se pisa con
// el pago nuevo) porque se puede cargar un pago con fecha anterior al último,
// o borrar el último por error.
async function refreshLastPayment(tx, customerId) {
  const latest = await tx.subscriptionPayment.findFirst({
    where: { customerId },
    orderBy: { paidAt: 'desc' },
    select: { paidAt: true },
  });
  return tx.customer.update({
    where: { id: customerId },
    data: { lastPaymentAt: latest?.paidAt ?? null },
    include: { subscriptionPayments: { orderBy: { paidAt: 'desc' }, take: PAYMENTS_SHOWN } },
  });
}

function normalizePlan(value) {
  const plan = String(value || 'BASE').toUpperCase();
  return ['BASE', 'INTERMEDIO', 'PREMIUM'].includes(plan) ? plan : 'BASE';
}

async function getCustomerDeletionScope(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      kiosks: {
        select: {
          id: true,
          user: { select: { id: true } },
          clients: { select: { id: true } },
          suppliers: { select: { id: true } },
        },
      },
      products: { select: { id: true } },
    },
  });

  if (!customer) {
    return null;
  }

  const kioskIds = customer.kiosks.map((kiosk) => kiosk.id);
  const userIds = customer.kiosks.map((kiosk) => kiosk.user?.id).filter(Boolean);
  const clientIds = customer.kiosks.flatMap((kiosk) => kiosk.clients.map((client) => client.id));
  const supplierIds = customer.kiosks.flatMap((kiosk) => kiosk.suppliers.map((supplier) => supplier.id));
  const productIds = customer.products.map((product) => product.id);

  return {
    customerId: customer.id,
    kioskIds,
    userIds,
    clientIds,
    supplierIds,
    productIds,
  };
}

async function getKioskDeletionScope(kioskId) {
  const kiosk = await prisma.kiosk.findUnique({
    where: { id: kioskId },
    select: {
      id: true,
      user: { select: { id: true } },
      clients: { select: { id: true } },
      suppliers: { select: { id: true } },
    },
  });

  if (!kiosk) {
    return null;
  }

  return {
    kioskId: kiosk.id,
    userId: kiosk.user?.id || null,
    clientIds: kiosk.clients.map((client) => client.id),
    supplierIds: kiosk.suppliers.map((supplier) => supplier.id),
  };
}

adminRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Sin distinguir mayúsculas, como el login de sucursales (routes/auth.js).
    const user = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: 'insensitive' } },
      include: { kiosk: { include: { customer: { select: { id: true, name: true, plan: true } } } } },
    });

    if (!user || !user.active || user.role !== 'OWNER') {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = await import('jsonwebtoken').then(({ default: jwt }) => jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }));
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kioskId: user.kioskId, kiosk: user.kiosk },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/me', requireAuth, (req, res) => {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ error: 'Solo el dueño puede realizar esta acción' });
  }
  const { id, name, email, role, kioskId, kiosk } = req.user;
  res.json({ id, name, email, role, kioskId, kiosk });
});

adminRouter.use(requireAuth, requireOwner);

adminRouter.get('/kiosks', async (_req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        kiosks: {
          orderBy: { name: 'asc' },
          include: {
            user: { select: { id: true, name: true, email: true, role: true, active: true, kioskId: true } },
          },
        },
        subscriptionPayments: { orderBy: { paidAt: 'desc' }, take: PAYMENTS_SHOWN },
      },
    });

    res.json({ customers: customers.map(withCustomerSubscription) });
  } catch (err) {
    next(err);
  }
});

// Registrar el pago de la cuota mensual. paidAt es "YYYY-MM-DD" (hoy si no
// viene); el ciclo siguiente se cuenta desde esa fecha.
adminRouter.post('/customers/:id/payments', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    const paidAt = req.body.paidAt ? parseArDate(req.body.paidAt) : new Date();
    if (!paidAt) return res.status(400).json({ error: 'La fecha de pago no es válida' });
    if (isAfterTodayAr(paidAt)) return res.status(400).json({ error: 'La fecha de pago no puede ser futura' });

    let amount = null;
    if (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
      amount = parseFloat(req.body.amount);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'El monto no es válido' });
      amount = Math.round(amount * 100) / 100;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.create({
        data: { customerId: customer.id, paidAt, amount, note: String(req.body.note || '').trim() || null },
      });
      return refreshLastPayment(tx, customer.id);
    });

    res.status(201).json({ customer: withCustomerSubscription(updated) });
  } catch (err) {
    next(err);
  }
});

// Borrar un pago cargado por error.
adminRouter.delete('/customers/:id/payments/:paymentId', async (req, res, next) => {
  try {
    const payment = await prisma.subscriptionPayment.findFirst({
      where: { id: req.params.paymentId, customerId: req.params.id },
      select: { id: true, customerId: true },
    });
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.delete({ where: { id: payment.id } });
      return refreshLastPayment(tx, payment.customerId);
    });

    res.json({ customer: withCustomerSubscription(updated) });
  } catch (err) {
    next(err);
  }
});

// Configuración global: WhatsApp de contacto y precio mensual de cada plan.
adminRouter.get('/settings', async (_req, res, next) => {
  try {
    res.json(await getAppSettings());
  } catch (err) {
    next(err);
  }
});

// Body: { whatsappNumber?, planPrices?: { BASE?, INTERMEDIO?, PREMIUM? } }.
// Un precio vacío/null lo deja en "Próximamente" en la landing.
adminRouter.put('/settings', async (req, res, next) => {
  try {
    const data = {};

    if (req.body.whatsappNumber !== undefined) {
      const { value, error } = normalizeWhatsappNumber(req.body.whatsappNumber);
      if (error) return res.status(400).json({ error });
      data.whatsappNumber = value;
    }

    const prices = req.body.planPrices || {};
    for (const [plan, field] of Object.entries(PLAN_PRICE_FIELDS)) {
      if (prices[plan] === undefined) continue;
      if (prices[plan] === null || prices[plan] === '') {
        data[field] = null;
        continue;
      }
      const price = parseFloat(prices[plan]);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: `El precio del plan ${plan.toLowerCase()} no es válido` });
      }
      data[field] = Math.round(price * 100) / 100;
    }

    res.json(await saveAppSettings(data));
  } catch (err) {
    next(err);
  }
});

// Por ahora solo marca/desmarca al cliente como exento de la suscripción.
adminRouter.patch('/customers/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    const data = {};
    if (req.body.subscriptionExempt !== undefined) {
      data.subscriptionExempt = req.body.subscriptionExempt === true || req.body.subscriptionExempt === 'true';
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data,
      include: { subscriptionPayments: { orderBy: { paidAt: 'desc' }, take: PAYMENTS_SHOWN } },
    });
    res.json({ customer: withCustomerSubscription(updated) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/customers', async (req, res, next) => {
  try {
    const { name, email, phone, address } = req.body;
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
    }

    const existingCustomer = await prisma.customer.findUnique({ where: { name: trimmedName } });
    if (existingCustomer) {
      return res.json({ customer: existingCustomer, existing: true });
    }

    if (email?.trim()) {
      const customerWithEmail = await prisma.customer.findUnique({ where: { email: email.trim() } });
      if (customerWithEmail) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese email' });
      }
    }

    const customer = await prisma.customer.create({
      data: {
        name: trimmedName,
        plan: normalizePlan(req.body.plan),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
      },
    });

    res.status(201).json({ customer, existing: false });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/customers/:id', async (req, res, next) => {
  try {
    const scope = await getCustomerDeletionScope(req.params.id);
    if (!scope) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await prisma.$transaction(async (tx) => {
      if (scope.supplierIds.length > 0) {
        await tx.product.updateMany({
          where: {
            supplierId: { in: scope.supplierIds },
            NOT: { customerId: scope.customerId },
          },
          data: { supplierId: null },
        });
      }

      if (scope.supplierIds.length > 0) {
        await tx.purchase.deleteMany({ where: { supplierId: { in: scope.supplierIds } } });
      }

      if (scope.kioskIds.length > 0) {
        await tx.sale.deleteMany({ where: { kioskId: { in: scope.kioskIds } } });
        await tx.invoice.deleteMany({ where: { kioskId: { in: scope.kioskIds } } });
        await tx.cashFlow.deleteMany({ where: { kioskId: { in: scope.kioskIds } } });
      }

      if (scope.userIds.length > 0) {
        await tx.cashRegister.deleteMany({ where: { userId: { in: scope.userIds } } });
        await tx.user.deleteMany({ where: { id: { in: scope.userIds } } });
      }

      if (scope.productIds.length > 0) {
        await tx.product.deleteMany({
          where: {
            id: { in: scope.productIds },
            customerId: scope.customerId,
          },
        });
      }

      if (scope.supplierIds.length > 0) {
        await tx.supplier.deleteMany({ where: { id: { in: scope.supplierIds } } });
      }

      if (scope.kioskIds.length > 0) {
        await tx.kiosk.deleteMany({ where: { id: { in: scope.kioskIds } } });
      }

      await tx.customer.delete({ where: { id: scope.customerId } });
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/kiosks', async (req, res, next) => {
  try {
    const { customerId, name, address, phone, active } = req.body;

    if (!customerId || !String(customerId).trim()) {
      return res.status(400).json({ error: 'El cliente es obligatorio' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre de la sucursal es obligatorio' });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const kiosk = await prisma.kiosk.create({
      data: {
        customerId: customer.id,
        name: String(name).trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        active: active === true || active === 'true',
      },
      include: {
        customer: true,
        user: { select: { id: true, name: true, email: true, role: true, active: true, kioskId: true } },
      },
    });

    res.status(201).json({ kiosk });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/kiosks/:id', async (req, res, next) => {
  try {
    const kiosk = await prisma.kiosk.findUnique({ where: { id: req.params.id } });
    if (!kiosk) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const data = {};
    if (req.body.active !== undefined) {
      data.active = req.body.active === true || req.body.active === 'true';
    }
    if (req.body.name !== undefined) {
      const trimmedName = String(req.body.name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'El nombre de la sucursal es obligatorio' });
      }
      data.name = trimmedName;
    }
    if (req.body.address !== undefined) {
      data.address = req.body.address?.trim() || null;
    }
    if (req.body.phone !== undefined) {
      data.phone = req.body.phone?.trim() || null;
    }

    const updated = await prisma.kiosk.update({
      where: { id: kiosk.id },
      data,
      include: {
        customer: true,
        user: { select: { id: true, name: true, email: true, role: true, active: true, kioskId: true } },
      },
    });

    res.json({ kiosk: updated });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/kiosks/:id', async (req, res, next) => {
  try {
    const scope = await getKioskDeletionScope(req.params.id);

    if (!scope) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    await prisma.$transaction(async (tx) => {
      if (scope.supplierIds.length > 0) {
        await tx.product.updateMany({
          where: { supplierId: { in: scope.supplierIds } },
          data: { supplierId: null },
        });

        await tx.purchase.deleteMany({ where: { supplierId: { in: scope.supplierIds } } });
        await tx.supplier.deleteMany({ where: { id: { in: scope.supplierIds } } });
      }

      await tx.sale.deleteMany({ where: { kioskId: scope.kioskId } });
      await tx.invoice.deleteMany({ where: { kioskId: scope.kioskId } });
      await tx.cashFlow.deleteMany({ where: { kioskId: scope.kioskId } });

      if (scope.userId) {
        await tx.cashRegister.deleteMany({ where: { userId: scope.userId } });
        await tx.user.deleteMany({ where: { id: scope.userId } });
      }

      if (scope.clientIds.length > 0) {
        await tx.client.deleteMany({ where: { id: { in: scope.clientIds } } });
      }

      await tx.kiosk.delete({ where: { id: scope.kioskId } });
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/kiosks/:id/account', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: 'La contraseña es obligatoria' });
    }

    const kiosk = await prisma.kiosk.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        user: true,
      },
    });

    if (!kiosk) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    if (kiosk.user) {
      return res.status(409).json({ error: 'Esta sucursal ya tiene una cuenta' });
    }

    const baseEmail = email?.trim() || `kiosco-${String(kiosk.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kiosk.id.slice(0, 6)}@vexus.local`;
    const normalizedEmail = baseEmail.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ error: 'Ese email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(String(password).trim(), 10);
    const user = await prisma.user.create({
      data: {
        name: name?.trim() || kiosk.name,
        email: normalizedEmail,
        passwordHash,
        role: 'KIOSK',
        kioskId: kiosk.id,
      },
      select: { id: true, name: true, email: true, role: true, active: true, kioskId: true },
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/kiosks/:id/account', async (req, res, next) => {
  try {
    const kiosk = await prisma.kiosk.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!kiosk) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    if (!kiosk.user) {
      return res.status(404).json({ error: 'Esta sucursal todavía no tiene una cuenta' });
    }

    const data = {};

    if (req.body.password !== undefined) {
      const password = String(req.body.password).trim();
      if (!password) {
        return res.status(400).json({ error: 'La contraseña no puede estar vacía' });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (req.body.name !== undefined) {
      const trimmedName = String(req.body.name).trim();
      if (trimmedName) {
        data.name = trimmedName;
      }
    }

    if (req.body.email !== undefined && String(req.body.email).trim()) {
      const normalizedEmail = String(req.body.email).trim().toLowerCase();
      if (normalizedEmail !== kiosk.user.email) {
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
          return res.status(409).json({ error: 'Ese email ya está registrado' });
        }
        data.email = normalizedEmail;
      }
    }

    const updated = await prisma.user.update({
      where: { id: kiosk.user.id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, kioskId: true },
    });

    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});