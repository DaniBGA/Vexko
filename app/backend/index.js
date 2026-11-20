// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { salesRouter } from './routes/sales.js';
import { suppliersRouter } from './routes/suppliers.js';
import { cashFlowRouter } from './routes/cashflow.js';
import { cashRegisterRouter } from './routes/cashRegister.js';
import { clientsRouter } from './routes/clients.js';
import { adminRouter } from './routes/admin.js';
import { invoicesRouter } from './routes/invoices.js';
import { reportsRouter } from './routes/reports.js';
import { categoriesRouter } from './routes/categories.js';
import { employeesRouter } from './routes/employees.js';
import { publicRouter } from './routes/public.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

const app = express();
const PORT = process.env.PORT || 3001;
// En producción (ecosystem.config.cjs) escucha solo en 127.0.0.1: Nginx es la
// única entrada. Si 3001 quedara abierto, se podría saltear Nginx y mandar un
// X-Forwarded-For falso para esquivar el rate limit.
const HOST = process.env.HOST || undefined;

// Detrás de Nginx, req.ip era siempre 127.0.0.1: el rate limit por IP terminaba
// siendo UN cupo compartido por todas las sucursales (300 requests cada 5 min y
// 20 logins cada 15 min entre todos). Con esto se toma la IP real que agrega
// Nginx en X-Forwarded-For (un solo proxy adelante).
app.set('trust proxy', 1);

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

// ─── Rate limiting ──────────────────────────────────────────────────────────────
// Con varios kioscos usando la API en simultáneo en un VPS de recursos
// moderados, esto evita que un solo cliente (o un bot) degrade el servicio
// para el resto. El límite de login es más estricto para frenar fuerza bruta
// sobre contraseñas.
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/admin/login', loginLimiter);

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
app.use('/api/admin',          adminRouter);
app.use('/api/invoices',       invoicesRouter);
app.use('/api/reports',        reportsRouter);
app.use('/api/categories',     categoriesRouter);
app.use('/api/employees',      employeesRouter);
app.use('/api/public',         publicRouter);   // sin login (landing, pantalla de bloqueo)

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`\n🏪 Kiosco API corriendo en http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}\n`);
});
