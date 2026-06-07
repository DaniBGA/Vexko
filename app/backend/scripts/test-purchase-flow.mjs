import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting purchase flow test...');

  // find or create a customer and kiosk
  let customer = await prisma.customer.findFirst();
  if (!customer) {
    customer = await prisma.customer.create({ data: { name: 'Test Customer' } });
    console.log('Created customer', customer.id);
  }

  let kiosk = await prisma.kiosk.findFirst({ where: { customerId: customer.id } });
  if (!kiosk) {
    kiosk = await prisma.kiosk.create({ data: { name: 'Test Kiosk', customerId: customer.id, active: true } });
    console.log('Created kiosk', kiosk.id);
  }

  // find or create supplier (name is unique)
  let supplier = await prisma.supplier.findFirst({ where: { name: 'Test Supplier' } });
  if (!supplier) {
    supplier = await prisma.supplier.create({ data: { name: 'Test Supplier', kioskId: kiosk.id } });
    console.log('Created supplier', supplier.id);
  } else {
    console.log('Using existing supplier', supplier.id);
  }

  // create product
  const product = await prisma.product.create({ data: { name: 'Test Product 1', loadMode: 'pack', packUnits: 6, packPrice: 600, salePrice: 120 } });
  console.log('Created product', product.id);

  // create purchase with 3 packs -> quantity should be 18 units
  const packCount = 3;
  const packUnits = product.packUnits || 1;
  const totalUnits = packCount * packUnits;

  const unitCost = (product.packPrice && packUnits) ? Number(product.packPrice) / Number(packUnits) : (product.costPrice ?? product.salePrice ?? 0);

  const purchase = await prisma.purchase.create({
    data: {
      supplierId: supplier.id,
      status: 'PENDING',
      paymentMethod: 'CASH',
      deliveryDate: new Date(),
      totalAmount: unitCost * totalUnits,
      items: { create: [{ productId: product.id, quantity: totalUnits, unitCost, lineTotal: unitCost * totalUnits }] },
    },
    include: { items: true },
  });

  console.log('Created purchase', purchase.id, 'items:', purchase.items.length);

  // simulate receive logic (similar to suppliers.js)
  const receivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of purchase.items) {
      const unitCostItem = item.unitCost ?? 0;
      const existingSupplierProduct = await tx.supplierProduct.findFirst({ where: { supplierId: supplier.id, productId: item.productId } });
      if (existingSupplierProduct) {
        await tx.supplierProduct.update({ where: { id: existingSupplierProduct.id }, data: { cost: unitCostItem } });
      } else {
        await tx.supplierProduct.create({ data: { supplierId: supplier.id, productId: item.productId, cost: unitCostItem } });
      }

      const kp = await tx.kioskProduct.findFirst({ where: { kioskId: kiosk.id, productId: item.productId } });
      if (kp) {
        await tx.kioskProduct.update({ where: { id: kp.id }, data: { stock: { increment: item.quantity } } });
      } else {
        const prod = await tx.product.findUnique({ where: { id: item.productId }, select: { salePrice: true } });
        await tx.kioskProduct.create({ data: { kioskId: kiosk.id, productId: item.productId, stock: item.quantity, minStock: 0, price: prod?.salePrice || null } });
      }
    }

    await tx.purchase.update({ where: { id: purchase.id }, data: { status: 'RECEIVED', receivedAt } });
  });

  console.log('Purchase received and inventory updated. Verifying...');

  const sp = await prisma.supplierProduct.findFirst({ where: { supplierId: supplier.id, productId: product.id } });
  const kpFinal = await prisma.kioskProduct.findFirst({ where: { kioskId: kiosk.id, productId: product.id } });
  const purchaseFinal = await prisma.purchase.findUnique({ where: { id: purchase.id }, include: { items: true } });

  console.log('supplierProduct:', sp);
  console.log('kioskProduct:', kpFinal);
  console.log('purchase:', { id: purchaseFinal.id, status: purchaseFinal.status, receivedAt: purchaseFinal.receivedAt });

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
