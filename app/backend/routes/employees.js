// src/routes/employees.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

function normalizePin(value) {
  const pin = String(value ?? '').trim();
  return /^\d{4}$/.test(pin) ? pin : null;
}

async function checkAccountPassword(req) {
  return bcrypt.compare(String(req.body.password ?? ''), req.user.passwordHash);
}

// Lista simple (sin la clave) para elegir empleado al abrir caja o para
// mostrar en la pantalla de gestión.
employeesRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json([]);
    const employees = await prisma.employee.findMany({
      where: { kioskId: kiosk.id, active: true },
      select: { id: true, name: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(employees);
  } catch (err) {
    next(err);
  }
});

// Confirma la contraseña de la cuenta antes de dejar entrar a gestionar
// empleados (paso previo pedido: "poner la contraseña" para ver/crear/editar).
employeesRouter.post('/verify-password', async (req, res, next) => {
  try {
    const valid = await checkAccountPassword(req);
    if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

employeesRouter.post('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const validPassword = await checkAccountPassword(req);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Ingresá el nombre del empleado' });

    const pin = normalizePin(req.body.pin);
    if (!pin) return res.status(400).json({ error: 'La clave tiene que ser de 4 números' });

    const pinHash = await bcrypt.hash(pin, 10);
    const employee = await prisma.employee.create({
      data: { kioskId: kiosk.id, name, pinHash },
      select: { id: true, name: true, createdAt: true },
    });

    res.status(201).json(employee);
  } catch (err) {
    next(err);
  }
});

employeesRouter.patch('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Empleado no encontrado' });

    const validPassword = await checkAccountPassword(req);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const employee = await prisma.employee.findFirst({ where: { id: req.params.id, kioskId: kiosk.id } });
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    const data = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Ingresá el nombre del empleado' });
      data.name = name;
    }
    if (req.body.pin !== undefined) {
      const pin = normalizePin(req.body.pin);
      if (!pin) return res.status(400).json({ error: 'La clave tiene que ser de 4 números' });
      data.pinHash = await bcrypt.hash(pin, 10);
    }
    if (req.body.active !== undefined) {
      data.active = req.body.active === true || req.body.active === 'true';
    }

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data,
      select: { id: true, name: true, active: true, createdAt: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
