import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';

async function main() {
  const password = 'Prueba123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const customer = await prisma.customer.upsert({
    where: { name: 'Kiosco Pruebas Local' },
    update: {},
    create: {
      name: 'Kiosco Pruebas Local',
      plan: 'INTERMEDIO',
      email: 'pruebas@vexko.local',
      phone: '0000000000',
      address: 'Sucursal de prueba local',
    },
  });

  const kiosk = await prisma.kiosk.upsert({
    where: {
      customerId_name: {
        customerId: customer.id,
        name: 'Sucursal Prueba Local',
      },
    },
    update: {
      active: true,
    },
    create: {
      name: 'Sucursal Prueba Local',
      address: 'Sucursal de prueba local',
      phone: '0000000000',
      active: true,
      customerId: customer.id,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'pruebas@vexko.local' },
    update: {
      name: 'Usuario de Prueba',
      passwordHash,
      role: 'OWNER',
      active: true,
      kioskId: kiosk.id,
    },
    create: {
      name: 'Usuario de Prueba',
      email: 'pruebas@vexko.local',
      passwordHash,
      role: 'OWNER',
      active: true,
      kioskId: kiosk.id,
    },
  });

  console.log('Usuario local listo');
  console.log({
    email: user.email,
    password,
    role: user.role,
    kiosk: kiosk.name,
    customer: customer.name,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });