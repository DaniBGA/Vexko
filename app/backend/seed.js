// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // ─── Usuario dueño ────────────────────────────────────────────────────────
  const ownerPassword = 'kiosco123';
  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
  const owner = await prisma.user.upsert({
    where: { email: 'admin@kiosco.com' },
    update: {},
    create: { name: 'Dueño', email: 'admin@kiosco.com', passwordHash: ownerPasswordHash, role: 'OWNER' },
  });
  console.log('✓ Usuario:', owner.email);

  const adminPassword = 'VexkoAdmin123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vexko.local' },
    update: {
      name: 'Admin Vexko',
      passwordHash: adminPasswordHash,
      role: 'OWNER',
      active: true,
    },
    create: {
      name: 'Admin Vexko',
      email: 'admin@vexko.local',
      passwordHash: adminPasswordHash,
      role: 'OWNER',
    },
  });
  console.log('✓ Admin:', admin.email);

  const customer = await prisma.customer.upsert({
    where: { name: 'Kiosco Demo' },
    update: {},
    create: {
      name: 'Kiosco Demo',
      email: 'demo@kiosco.com',
      phone: '2494000000',
      address: 'Sucursal principal',
    },
  });

  const kiosk = await prisma.kiosk.upsert({
    where: {
      customerId_name: {
        customerId: customer.id,
        name: 'Sucursal Centro',
      },
    },
    update: {},
    create: {
      name: 'Sucursal Centro',
      address: 'Centro',
      phone: '2494000001',
      customerId: customer.id,
    },
  });
  console.log('✓ Kiosko:', kiosk.name);

  // ─── Categorías ───────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({ where: { name: 'Bebidas' }, update: {}, create: { name: 'Bebidas' } }),
    prisma.category.upsert({ where: { name: 'Golosinas' }, update: {}, create: { name: 'Golosinas' } }),
    prisma.category.upsert({ where: { name: 'Snacks' }, update: {}, create: { name: 'Snacks' } }),
    prisma.category.upsert({ where: { name: 'Lácteos' }, update: {}, create: { name: 'Lácteos' } }),
    prisma.category.upsert({ where: { name: 'Librería' }, update: {}, create: { name: 'Librería' } }),
    prisma.category.upsert({ where: { name: 'Cigarrillos' }, update: {}, create: { name: 'Cigarrillos' } }),
  ]);
  console.log('✓ Categorías:', categories.map((c) => c.name).join(', '));

  const [bebidas, golosinas, snacks, lacteos, libreria, cigarrillos] = categories;

  // Subcategorías
  const subBebGas = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Gaseosas', categoryId: bebidas.id } },
    update: {}, create: { name: 'Gaseosas', categoryId: bebidas.id },
  });
  const subBebAgua = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Agua', categoryId: bebidas.id } },
    update: {}, create: { name: 'Agua', categoryId: bebidas.id },
  });
  const subChicles = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Chicles', categoryId: golosinas.id } },
    update: {}, create: { name: 'Chicles', categoryId: golosinas.id },
  });
  const subCaffe = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Galletitas', categoryId: snacks.id } },
    update: {}, create: { name: 'Galletitas', categoryId: snacks.id },
  });
  const subSnacks = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Papas fritas', categoryId: snacks.id } },
    update: {}, create: { name: 'Papas fritas', categoryId: snacks.id },
  });
  const subLacteos = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Leche', categoryId: lacteos.id } },
    update: {}, create: { name: 'Leche', categoryId: lacteos.id },
  });
  const subLib = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Papelería', categoryId: libreria.id } },
    update: {}, create: { name: 'Papelería', categoryId: libreria.id },
  });
  const subCig = await prisma.subcategory.upsert({
    where: { name_categoryId: { name: 'Cigarrillos', categoryId: cigarrillos.id } },
    update: {}, create: { name: 'Cigarrillos', categoryId: cigarrillos.id },
  });

  // ─── Proveedores ──────────────────────────────────────────────────────────
  const gonzalez = await prisma.supplier.upsert({
    where: { name: 'Distribuidora González' }, update: {},
    create: { name: 'Distribuidora González', phone: '249-555-1234' },
  });
  const arcor = await prisma.supplier.upsert({
    where: { name: 'Arcor' }, update: {},
    create: { name: 'Arcor', phone: '011-5555-1234', email: 'juan@arcor.com' },
  });
  const serenisima = await prisma.supplier.upsert({
    where: { name: 'La Serenísima' }, update: {},
    create: { name: 'La Serenísima', phone: '0800-333-5544' },
  });
  console.log('✓ Proveedores creados');

  // ─── Productos ────────────────────────────────────────────────────────────
  const products = [
    { name: 'Coca Cola 500ml',      barcode: '7790895001001', subcategoryId: subBebGas.id, supplierId: gonzalez.id, costPrice: 600,  salePrice: 900,  stock: 24, minStock: 10 },
    { name: 'Coca Cola 1.5L',       barcode: '7790895001023', subcategoryId: subBebGas.id, supplierId: gonzalez.id, costPrice: 900,  salePrice: 1700, stock: 3,  minStock: 10 },
    { name: 'Pepsi 500ml',          barcode: '7796585002001', subcategoryId: subBebGas.id, supplierId: gonzalez.id, costPrice: 600,  salePrice: 950,  stock: 28, minStock: 10 },
    { name: 'Fanta 500ml',          barcode: '7790895003001', subcategoryId: subBebGas.id, supplierId: gonzalez.id, costPrice: 580,  salePrice: 900,  stock: 22, minStock: 8  },
    { name: 'Agua Villavicencio 500ml', barcode: '7790391001234', subcategoryId: subBebAgua.id, supplierId: gonzalez.id, costPrice: 300, salePrice: 600, stock: 30, minStock: 12 },
    { name: 'Beldent × 1u',         barcode: '7798102001001', subcategoryId: subChicles.id, supplierId: arcor.id, costPrice: 280,  salePrice: 400,  stock: 1,  minStock: 5  },
    { name: 'Mentitas × 1u',        barcode: '7798102002001', subcategoryId: subChicles.id, supplierId: arcor.id, costPrice: 400,  salePrice: 600,  stock: 9,  minStock: 10 },
    { name: 'Doritos Clásico',       barcode: '7791137001001', subcategoryId: subSnacks.id, supplierId: gonzalez.id, costPrice: 900,  salePrice: 1400, stock: 15, minStock: 6  },
    { name: 'Oreo Original',         barcode: '7622210957849', subcategoryId: subCaffe.id, supplierId: arcor.id, costPrice: 800,  salePrice: 1200, stock: 12, minStock: 4  },
    { name: 'Leche La Serenísima 1L',barcode: '7798032002001', subcategoryId: subLacteos.id, supplierId: serenisima.id, costPrice: 1100, salePrice: 1650, stock: 8, minStock: 12, expiresAt: new Date(Date.now() + 90 * 86400000) },
    { name: 'Papel A4 resma',        barcode: '7791234000001', subcategoryId: subLib.id, costPrice: 2800, salePrice: 4200, stock: 5, minStock: 3 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { barcode: p.barcode },
      update: {},
      create: { ...p, costPrice: p.costPrice, salePrice: p.salePrice },
    });
  }
  console.log('✓ Productos creados');

  // ─── Regla de fidelización ────────────────────────────────────────────────
  await prisma.loyaltyRule.upsert({
    where: { id: 1 }, update: {},
    create: { id: 1, amountPerPoint: 100, pointsForDiscount: 50, discountAmount: 500 },
  });

  // ─── Clientes de ejemplo ──────────────────────────────────────────────────
  await prisma.client.upsert({
    where: { kioskId_phone: { kioskId: kiosk.id, phone: '2494001001' } }, update: {},
    create: { kioskId: kiosk.id, name: 'Juan García', phone: '2494001001', points: 332, totalSpent: 46800 },
  });
  await prisma.client.upsert({
    where: { kioskId_phone: { kioskId: kiosk.id, phone: '2494001002' } }, update: {},
    create: { kioskId: kiosk.id, name: 'María Rodríguez', phone: '2494001002', points: -20 + 50, totalSpent: 28500 },
  });

  console.log('\n✅ Seed completado!');
  console.log(`   Login dueño: ${owner.email} / ${ownerPassword}`);
  console.log(`   Login admin: ${admin.email} / ${adminPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
  