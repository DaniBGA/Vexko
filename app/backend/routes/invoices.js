// src/routes/invoices.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month ? parseInt(month) - 1 : now.getMonth();
    const y = year ? parseInt(year) : now.getFullYear();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59);

    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err) { next(err); }
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const { saleId, invoiceType, total, items } = req.body;
    // Número correlativo
    const last = await prisma.invoice.findFirst({ orderBy: { createdAt: 'desc' } });
    const lastNum = last ? parseInt(last.invoiceNumber.split('-')[2]) : 0;
    const invoiceNumber = `FC-${invoiceType.replace('FC-', '')}-${String(lastNum + 1).padStart(8, '0')}`;

    const invoice = await prisma.invoice.create({
      data: {
        saleId: saleId ? parseInt(saleId) : null,
        invoiceType,
        invoiceNumber,
        total: parseFloat(total),
        status: 'PENDING',
      },
    });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});
