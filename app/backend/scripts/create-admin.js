// scripts/create-admin.js
// Crea la cuenta del panel admin (/admin) o le cambia la contraseña si ya existe.
//
//   ADMIN_EMAIL=vos@grupovexus.com ADMIN_PASSWORD='...' npm run admin:create
//
// Es la forma de crear el admin en producción. El seed de demo crea
// admin@kiosco.com / kiosco123, que está publicado en el README: con esa cuenta
// en producción cualquiera entraba al panel (borrar clientes, marcar pagos...).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const MIN_PASSWORD_LENGTH = 12;
const DEMO_ADMIN_EMAIL = 'admin@kiosco.com';

const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Grupo Vexus').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Falta ADMIN_EMAIL o no es un email válido.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (process.env.NODE_ENV === 'production' && email === DEMO_ADMIN_EMAIL) {
    throw new Error(`No uses ${DEMO_ADMIN_EMAIL} en producción: es la cuenta de demo publicada en el README.`);
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true, kioskId: true },
  });
  if (existing && existing.role !== 'OWNER') {
    throw new Error(`${email} ya es la cuenta de una sucursal: usá otro email para el admin.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, active: true } });
    console.log(`✓ Contraseña actualizada para ${email}`);
  } else {
    await prisma.user.create({ data: { name, email, passwordHash, role: 'OWNER', active: true } });
    console.log(`✓ Admin creado: ${email}`);
  }

  const demoAdmin = await prisma.user.findFirst({
    where: { email: DEMO_ADMIN_EMAIL, role: 'OWNER', active: true },
    select: { id: true },
  });
  if (demoAdmin && email !== DEMO_ADMIN_EMAIL) {
    console.warn(`⚠ Sigue activa la cuenta de demo ${DEMO_ADMIN_EMAIL} (contraseña pública). Desactivala:`);
    console.warn(`  psql "$DATABASE_URL" -c "UPDATE \\"User\\" SET active = false WHERE email = '${DEMO_ADMIN_EMAIL}'"`);
  }
}

main()
  .catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
