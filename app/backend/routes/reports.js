// src/routes/reports.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// GET /api/reports/monthly?month=5&year=2026
reportsRouter.get('/monthly', async (req, res, next) => {
  try {
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) - 1 : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59);

    const [salesAgg, saleItems, cashFlows, prevSalesAgg] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true, cashAmount: true, cardAmount: true },
        _count: { id: true },
        where: { createdAt: { gte: from, lte: to } },
      }),
      prisma.saleItem.findMany({
        where: { sale: { createdAt: { gte: from, lte: to } } },
        include: { product: { select: { name: true, subcategory: { select: { name: true } } } } },
      }),
      prisma.cashFlow.findMany({
        where: { type: 'EXPENSE', createdAt: { gte: from, lte: to } },
      }),
      // Mes anterior
      prisma.sale.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: {
          createdAt: {
            gte: new Date(year, month - 1, 1),
            lte: new Date(year, month, 0, 23, 59, 59),
          },
        },
      }),
    ]);

    const revenue = parseFloat(salesAgg._sum.total || 0);
    const totalExpenses = cashFlows.reduce((s, f) => s + parseFloat(f.amount), 0);
    const cogs = saleItems.reduce((s, i) => s + parseFloat(i.costPrice) * i.quantity, 0);
    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netProfit = grossProfit - totalExpenses;
    const prevRevenue = parseFloat(prevSalesAgg._sum.total || 0);
    const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    const avgTicket = salesAgg._count.id > 0 ? revenue / salesAgg._count.id : 0;

    // Top productos
    const productMap = {};
    for (const item of saleItems) {
      const key = item.productId;
      if (!productMap[key]) productMap[key] = { name: item.product.name, qty: 0, revenue: 0 };
      productMap[key].qty += item.quantity;
      productMap[key].revenue += parseFloat(item.unitPrice) * item.quantity;
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    res.json({
      period: { month: month + 1, year },
      revenue,
      cogs,
      grossProfit,
      grossMargin: Math.round(grossMargin * 10) / 10,
      expenses: totalExpenses,
      netProfit,
      salesCount: salesAgg._count.id,
      avgTicket: Math.round(avgTicket),
      cashSales: parseFloat(salesAgg._sum.cashAmount || 0),
      cardSales: parseFloat(salesAgg._sum.cardAmount || 0),
      prevRevenue,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      topProducts,
      expenseBreakdown: cashFlows,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard  — KPIs rápidos para home
reportsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todaySales, monthSales, lowStock, openRegister] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.sale.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.product.count({
        where: { active: true, stock: { lte: prisma.product.fields.minStock } },
      }),
      prisma.cashRegister.findFirst({ where: { status: 'OPEN' } }),
    ]);

    res.json({
      today: {
        revenue: parseFloat(todaySales._sum.total || 0),
        salesCount: todaySales._count.id,
      },
      month: { revenue: parseFloat(monthSales._sum.total || 0) },
      lowStockCount: lowStock,
      cashRegisterOpen: !!openRegister,
    });
  } catch (err) { next(err); }
});
