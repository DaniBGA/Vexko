// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // ─── Usuario dueño ────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('kiosco123', 10);
  const owner = await prisma.user.upsert({
    where: { email: 'admin@kiosco.com' },
    update: {},
    create: { name: 'Dueño', email: 'admin@kiosco.com', passwordHash, role: 'OWNER' },
  });
  console.log('✓ Usuario:', owner.email);

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
  // customerId: null → categorías globales, las que arma el catálogo global
  // (compartidas entre todos los clientes, a diferencia de las que un cliente
  // crea para sí mismo).
  async function upsertGlobalCategory(name) {
    const existing = await prisma.category.findFirst({ where: { customerId: null, name } });
    if (existing) return existing;
    return prisma.category.create({ data: { name, customerId: null } });
  }
  const categories = await Promise.all([
    upsertGlobalCategory('Bebidas'),
    upsertGlobalCategory('Golosinas'),
    upsertGlobalCategory('Snacks'),
    upsertGlobalCategory('Lácteos'),
    upsertGlobalCategory('Librería'),
    upsertGlobalCategory('Cigarrillos'),
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
  // Con kioskId: antes quedaban sin sucursal asociada y no aparecían en
  // "Proveedores" de ningún kiosco.
  const gonzalez = await prisma.supplier.upsert({
    where: { name: 'Distribuidora González' }, update: { kioskId: kiosk.id },
    create: { name: 'Distribuidora González', phone: '249-555-1234', kioskId: kiosk.id },
  });
  const arcor = await prisma.supplier.upsert({
    where: { name: 'Arcor' }, update: { kioskId: kiosk.id },
    create: { name: 'Arcor', phone: '011-5555-1234', email: 'juan@arcor.com', kioskId: kiosk.id },
  });
  const serenisima = await prisma.supplier.upsert({
    where: { name: 'La Serenísima' }, update: { kioskId: kiosk.id },
    create: { name: 'La Serenísima', phone: '0800-333-5544', kioskId: kiosk.id },
  });
  console.log('✓ Proveedores creados');

  // ─── Productos ────────────────────────────────────────────────────────────
  // Son ejemplos con precio y proveedor propios de "Sucursal Centro", así que
  // se cargan como productos propios (isCustom) de ese cliente — no como
  // catálogo global, que es compartido por todos los clientes y no debe
  // llevar precio ni proveedor de nadie en particular.
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
    const { stock, minStock, ...productData } = p;
    const product = await prisma.product.upsert({
      where: { barcode: p.barcode },
      update: {
        isCustom: true,
        customerId: customer.id,
        subcategoryId: p.subcategoryId,
        supplierId: p.supplierId,
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        expiresAt: p.expiresAt || null,
      },
      create: { ...productData, isCustom: true, customerId: customer.id, stock: 0, minStock: 0 },
    });

    await prisma.kioskProduct.upsert({
      where: { kioskId_productId: { kioskId: kiosk.id, productId: product.id } },
      update: { stock, minStock, price: p.salePrice },
      create: { kioskId: kiosk.id, productId: product.id, stock, minStock, price: p.salePrice },
    });
  }
  console.log('✓ Productos creados');

  // ─── Regla de fidelización (por sucursal) ─────────────────────────────────
  const existingLoyaltyRule = await prisma.loyaltyRule.findFirst({ where: { kioskId: kiosk.id } });
  if (!existingLoyaltyRule) {
    await prisma.loyaltyRule.create({
      data: { kioskId: kiosk.id, amountPerPoint: 100, pointsForDiscount: 50, discountAmount: 500 },
    });
  }

  // ─── Clientes de ejemplo ──────────────────────────────────────────────────
  await prisma.client.upsert({
    where: { kioskId_phone: { kioskId: kiosk.id, phone: '2494001001' } }, update: {},
    create: { kioskId: kiosk.id, name: 'Juan García', phone: '2494001001', points: 332, totalSpent: 46800 },
  });
  await prisma.client.upsert({
    where: { kioskId_phone: { kioskId: kiosk.id, phone: '2494001002' } }, update: {},
    create: { kioskId: kiosk.id, name: 'María Rodríguez', phone: '2494001002', points: -20 + 50, totalSpent: 28500 },
  });

  // ─── Cuentas demo por plan (una por cada nivel de suscripción) ────────────
  const planAccounts = [
    { plan: 'BASE', customerName: 'Demo Plan Base', kioskName: 'Sucursal Base', email: 'base@kiosco.com', password: 'base123' },
    { plan: 'INTERMEDIO', customerName: 'Demo Plan Intermedio', kioskName: 'Sucursal Intermedio', email: 'intermedio@kiosco.com', password: 'intermedio123' },
    { plan: 'PREMIUM', customerName: 'Demo Plan Premium', kioskName: 'Sucursal Premium', email: 'premium@kiosco.com', password: 'premium123' },
  ];

  for (const acc of planAccounts) {
    const planCustomer = await prisma.customer.upsert({
      where: { name: acc.customerName },
      update: { plan: acc.plan },
      create: { name: acc.customerName, plan: acc.plan },
    });

    const planKiosk = await prisma.kiosk.upsert({
      where: { customerId_name: { customerId: planCustomer.id, name: acc.kioskName } },
      update: { active: true },
      create: { name: acc.kioskName, customerId: planCustomer.id, active: true },
    });

    const planPasswordHash = await bcrypt.hash(acc.password, 10);
    await prisma.user.upsert({
      where: { email: acc.email },
      update: { active: true, kioskId: planKiosk.id },
      create: {
        name: acc.kioskName,
        email: acc.email,
        passwordHash: planPasswordHash,
        role: 'KIOSK',
        kioskId: planKiosk.id,
      },
    });
  }
  console.log('✓ Cuentas demo por plan creadas (base@kiosco.com, intermedio@kiosco.com, premium@kiosco.com)');

  console.log('\n✅ Seed completado!');
  console.log('   Login admin: admin@kiosco.com / kiosco123');
  console.log('   Login plan Base:        base@kiosco.com / base123');
  console.log('   Login plan Intermedio:  intermedio@kiosco.com / intermedio123');
  console.log('   Login plan Premium:     premium@kiosco.com / premium123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
  