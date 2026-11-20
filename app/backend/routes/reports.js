// src/routes/reports.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// Gasto que genera un pedido a proveedor pagado en efectivo (suppliers.js).
const PURCHASES_CATEGORY = 'Compras';

// Costo de una línea vendida: el costo guardado al momento de la venta y, para
// ventas viejas sin ese dato, el costo actual de la sucursal o del producto.
// Antes se usaba solo Product.costPrice, que en el catálogo global es null:
// el costo de lo vendido daba 0 y la ganancia bruta, igual a la facturación.
function getItemCost(item) {
  const cost = item.unitCost ?? item.product?.kioskProducts?.[0]?.cost ?? item.product?.costPrice ?? 0;
  return (parseFloat(cost) || 0) * item.quantity;
}

// Las compras de mercadería no son un gasto del resultado del mes: lo que
// cuesta la mercadería ya entra como costo de lo vendido (al venderla). Antes
// se restaban las dos cosas y la ganancia neta quedaba contando dos veces el
// costo de todo lo comprado en efectivo.
function isOperatingExpense(flow) {
  return flow.category !== PURCHASES_CATEGORY;
}

// GET /api/reports/monthly?month=5&year=2026
reportsRouter.get('/monthly', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      const now = new Date();
      const month = req.query.month ? parseInt(req.query.month) - 1 : now.getMonth();
      const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();
      return res.json({
        period: { month: month + 1, year },
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        expenses: 0,
        netProfit: 0,
        salesCount: 0,
        avgTicket: 0,
        cashSales: 0,
        cardSales: 0,
        transferSales: 0,
        prevRevenue: 0,
        revenueGrowth: 0,
        topProducts: [],
        expenseBreakdown: [],
        threeMonthComparison: [],
      });
    }
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) - 1 : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();

    const kioskWhere = kiosk ? { kioskId: kiosk.id } : {};

    // Se trae de una la data de este mes y de los 2 anteriores (para el
    // comparativo de 3 meses) en un solo Promise.all: antes el mes actual se
    // calculaba acá arriba y DE NUEVO adentro del loop de comparación, que
    // además hacía los 3 meses uno por uno (secuencial) en vez de en
    // paralelo — eran hasta 13 round-trips a la base, la mitad redundantes.
    const monthWindows = [0, 1, 2].map((i) => {
      const m = month - i;
      const y = year + Math.floor(m / 12);
      const mm = ((m % 12) + 12) % 12;
      // `to` es el inicio del mes siguiente (con lt): antes era el último día a
      // las 23:59:59 con lte, y lo vendido en el último segundo del mes no
      // entraba en ningún mes.
      return { monthIndex: mm, year: y, from: new Date(y, mm, 1), to: new Date(y, mm + 1, 1) };
    });

    const monthsData = await Promise.all(monthWindows.map(({ from, to }) => Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true, cashAmount: true, cardAmount: true, transferAmount: true },
        _count: { id: true },
        where: { createdAt: { gte: from, lt: to }, ...kioskWhere },
      }),
      prisma.saleItem.findMany({
        where: { sale: { createdAt: { gte: from, lt: to }, ...kioskWhere } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              costPrice: true,
              kioskProducts: { where: { kioskId: kiosk.id }, select: { cost: true } },
            },
          },
        },
      }),
      prisma.cashFlow.findMany({
        where: { type: 'EXPENSE', createdAt: { gte: from, lt: to }, ...kioskWhere },
      }),
    ])));

    const [[salesAgg, saleItems, monthFlows], [prevSalesAgg]] = monthsData;

    const cashFlows = monthFlows.filter(isOperatingExpense);
    const inventoryPurchases = monthFlows
      .filter((f) => !isOperatingExpense(f))
      .reduce((s, f) => s + parseFloat(f.amount), 0);

    const revenue = parseFloat(salesAgg._sum.total || 0);
    const totalExpenses = cashFlows.reduce((s, f) => s + parseFloat(f.amount), 0);
    const cogs = saleItems.reduce((s, i) => s + getItemCost(i), 0);
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
      // Informativo: lo pagado en efectivo a proveedores en el mes (no se
      // resta del resultado, ver isOperatingExpense).
      inventoryPurchases,
      netProfit,
      salesCount: salesAgg._count.id,
      avgTicket: Math.round(avgTicket),
      cashSales: parseFloat(salesAgg._sum.cashAmount || 0),
      cardSales: parseFloat(salesAgg._sum.cardAmount || 0),
      transferSales: parseFloat(salesAgg._sum.transferAmount || 0),
      prevRevenue,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      topProducts,
      expenseBreakdown: cashFlows,
      // Last 3 months comparison (current, prev, prev2) — reusa la data que
      // ya se trajo arriba en vez de volver a consultarla.
      threeMonthComparison: monthWindows.map(({ monthIndex, year: y }, i) => {
        const [agg, items, flows] = monthsData[i];
        const rev = parseFloat(agg._sum.total || 0);
        const cogsMonth = items.reduce((s, it) => s + getItemCost(it), 0);
        const expensesMonth = flows.filter(isOperatingExpense).reduce((s, f) => s + parseFloat(f.amount), 0);
        const gross = rev - cogsMonth;
        const margin = rev > 0 ? Math.round(((gross / rev) * 100) * 10) / 10 : 0;
        return { month: monthIndex + 1, year: y, revenue: rev, grossProfit: gross, margin, expenses: expensesMonth };
      }),
    });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard  — KPIs rápidos para home
reportsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({
        today: { revenue: 0, salesCount: 0 },
        month: { revenue: 0 },
        lowStockCount: 0,
        cashRegisterOpen: false,
      });
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const kioskWhere = kiosk ? { kioskId: kiosk.id } : {};

    const [todaySales, monthSales, lowStockProducts, openRegister] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: { createdAt: { gte: todayStart }, ...kioskWhere },
      }),
      prisma.sale.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: monthStart }, ...kioskWhere },
      }),
      prisma.kioskProduct.findMany({
        where: { kioskId: kiosk.id },
        select: { stock: true, minStock: true },
      }),
      prisma.cashRegister.findFirst({ where: { status: 'OPEN', user: kiosk?.id ? { kioskId: kiosk.id } : undefined } }),
    ]);

    const lowStock = lowStockProducts.filter((product) => product.stock <= product.minStock).length;

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
