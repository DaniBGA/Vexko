// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { salesRouter } from './routes/sales.js';
import { suppliersRouter } from './routes/suppliers.js';
import { cashFlowRouter } from './routes/cashflow.js';
import { cashRegisterRouter } from './routes/cashRegister.js';
import { clientsRouter } from './routes/clients.js';
import { invoicesRouter } from './routes/invoices.js';
import { reportsRouter } from './routes/reports.js';
import { categoriesRouter } from './routes/categories.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware de seguridad ───────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV, ts: new Date().toISOString() });
});

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api/auth',           authRouter);
app.use('/api/products',       productsRouter);
app.use('/api/sales',          salesRouter);
app.use('/api/suppliers',      suppliersRouter);
app.use('/api/cashflow',       cashFlowRouter);
app.use('/api/cash-registers', cashRegisterRouter);
app.use('/api/clients',        clientsRouter);
app.use('/api/invoices',       invoicesRouter);
app.use('/api/reports',        reportsRouter);
app.use('/api/categories',     categoriesRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🏪 Kiosco API corriendo en http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}\n`);
});