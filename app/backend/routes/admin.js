// src/routes/admin.js
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

export const adminRouter = Router();

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

    const user = await prisma.user.findUnique({
      where: { email },
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
      },
    });

    res.json({ customers });
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