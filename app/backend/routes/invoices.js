// src/routes/invoices.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado' });
    }

    const { month, year } = req.query;
    const now = new Date();
    const m = month ? parseInt(month) - 1 : now.getMonth();
    const y = year ? parseInt(year) : now.getFullYear();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59);

    const invoices = await prisma.invoice.findMany({
      where: { kioskId: kiosk.id, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err) { next(err); }
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const { saleId, total: rawTotal } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(400).json({ error: 'No hay kiosko configurado' });
    }

    // Sin validar, un invoiceType faltante rompía en el .replace() con un 500
    // y un total vacío se guardaba como NaN.
    const invoiceType = String(req.body.invoiceType || '').trim().toUpperCase().replace(/^FC-/, '');
    if (!['A', 'B', 'C'].includes(invoiceType)) {
      return res.status(400).json({ error: 'Tipo de factura inválido (A, B o C)' });
    }
    const total = parseFloat(rawTotal);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'El total de la factura tiene que ser mayor a cero' });
    }

    if (saleId) {
      const sale = await prisma.sale.findFirst({ where: { id: saleId, kioskId: kiosk.id } });
      if (!sale) {
        return res.status(400).json({ error: 'La venta no pertenece a este kiosco' });
      }
    }

    // La numeración es correlativa POR TIPO de comprobante (como exige AFIP):
    // antes A, B y C compartían un solo contador.
    const last = await prisma.invoice.findFirst({ where: { kioskId: kiosk.id, invoiceType }, orderBy: { createdAt: 'desc' } });
    const lastNum = last ? parseInt(last.invoiceNumber.split('-')[2], 10) || 0 : 0;
    const invoiceNumber = `FC-${invoiceType}-${String(lastNum + 1).padStart(8, '0')}`;

    const invoice = await prisma.invoice.create({
      data: {
        kioskId: kiosk.id,
        saleId: saleId || null,
        invoiceType,
        invoiceNumber,
        total: parseFloat(total),
        status: 'PENDING',
      },
    });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});
