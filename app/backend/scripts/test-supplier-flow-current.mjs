import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureTestContext() {
  const suffix = randomUUID().slice(0, 8);
  const customer = await prisma.customer.create({
    data: {
      name: `Test Customer ${suffix}`,
      plan: 'BASE',
    },
  });

  const kiosk = await prisma.kiosk.create({
    data: {
      name: `Test Kiosk ${suffix}`,
      active: true,
      customerId: customer.id,
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      name: `Test Supplier ${suffix}`,
      kioskId: kiosk.id,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `Test Product ${suffix}`,
      active: true,
      customerId: null,
      salePrice: 120,
      costPrice: 100,
      loadMode: 'pack',
      packUnits: 6,
      packPrice: 600,
    },
  });

  return { suffix, customer, kiosk, supplier, product };
}

async function createPurchase(supplierId, productId) {
  const purchase = await prisma.purchase.create({
    data: {
      supplierId,
      status: 'PENDING',
      paymentMethod: 'CASH',
      notes: 'smoke test',
      totalAmount: 100,
      items: {
        create: [
          {
            productId,
            quantity: 3,
            packPrice: 600,
            packUnits: 6,
            unitCost: 100,
            lineTotal: 300,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  return purchase;
}

async function applyCurrentReceiveFlow({ kioskId, supplierId, purchaseId }) {
  const purchase = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      supplierId,
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  assert(purchase, 'Purchase not found');
  assert(purchase.status !== 'RECEIVED', 'Purchase was already received');

  const receivedAt = new Date();

  const updatedPurchase = await prisma.$transaction(async (tx) => {
    for (const item of purchase.items) {
      const receivedUnitCost = Number(item.unitCost || 0);
      const receivedPackUnits = Number(item.product.packUnits || 0);
      const receivedPackPrice = item.product.loadMode === 'pack' && receivedPackUnits > 0
        ? receivedUnitCost * receivedPackUnits
        : null;

      await tx.product.update({
        where: { id: item.productId },
        data: {
          supplierId,
          costPrice: receivedUnitCost,
          baseCost: receivedUnitCost,
          ...(receivedPackPrice !== null ? { packPrice: receivedPackPrice } : {}),
        },
      });

      await tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId, productId: item.productId } },
        create: {
          supplierId,
          productId: item.productId,
          cost: receivedUnitCost,
        },
        update: {
          cost: receivedUnitCost,
        },
      });

      await tx.kioskProduct.upsert({
        where: { kioskId_productId: { kioskId, productId: item.productId } },
        create: {
          kioskId,
          productId: item.productId,
          stock: item.quantity,
          minStock: 0,
          price: item.product.salePrice ?? null,
        },
        update: { stock: { increment: item.quantity } },
      });
    }

    return tx.purchase.update({
      where: { id: purchase.id },
      data: {
        status: 'RECEIVED',
        receivedAt,
      },
    });
  });

  return updatedPurchase;
}

async function main() {
  console.log('Starting current supplier flow smoke test...');
  const created = await ensureTestContext();
  const cleanupIds = {
    customerId: created.customer.id,
    kioskId: created.kiosk.id,
    supplierId: created.supplier.id,
    productId: created.product.id,
    purchaseId: null,
  };

  try {
    const purchase = await createPurchase(created.supplier.id, created.product.id);
    cleanupIds.purchaseId = purchase.id;

    const storedItem = await prisma.purchaseItem.findFirst({
      where: { purchaseId: purchase.id, productId: created.product.id },
    });

    const beforeSupplierProductCount = await prisma.supplierProduct.count({
      where: {
        supplierId: created.supplier.id,
        productId: created.product.id,
      },
    });

    const beforeKioskProductCount = await prisma.kioskProduct.count({
      where: {
        kioskId: created.kiosk.id,
        productId: created.product.id,
      },
    });

    const updatedPurchase = await applyCurrentReceiveFlow({
      kioskId: created.kiosk.id,
      supplierId: created.supplier.id,
      purchaseId: purchase.id,
    });

    const kioskProduct = await prisma.kioskProduct.findUnique({
      where: {
        kioskId_productId: {
          kioskId: created.kiosk.id,
          productId: created.product.id,
        },
      },
    });

    const supplierProduct = await prisma.supplierProduct.findFirst({
      where: {
        supplierId: created.supplier.id,
        productId: created.product.id,
      },
    });

    const updatedProduct = await prisma.product.findUnique({
      where: { id: created.product.id },
    });

    assert(beforeSupplierProductCount === 0, 'SupplierProduct should not exist before receive in current flow');
    assert(beforeKioskProductCount === 0, 'KioskProduct should not exist before receive');
    assert(storedItem?.packPrice === 600, `Expected stored packPrice 600, got ${storedItem?.packPrice}`);
    assert(storedItem?.packUnits === 6, `Expected stored packUnits 6, got ${storedItem?.packUnits}`);
    assert(storedItem?.unitCost === 100, `Expected stored unitCost 100, got ${storedItem?.unitCost}`);
    assert(updatedPurchase.status === 'RECEIVED', 'Purchase should be marked as RECEIVED');
    assert(kioskProduct, 'KioskProduct should exist after receive');
    assert(kioskProduct.stock === 3, `Expected kiosk stock 3, got ${kioskProduct.stock}`);
    assert(kioskProduct.price === created.product.salePrice, `Expected kiosk price ${created.product.salePrice}, got ${kioskProduct.price}`);
    assert(supplierProduct, 'SupplierProduct should exist after receive');
    assert(supplierProduct.cost === 100, `Expected supplier cost 100, got ${supplierProduct?.cost}`);
    assert(updatedProduct?.supplierId === created.supplier.id, 'Product should be assigned to the supplier');
    assert(updatedProduct?.costPrice === 100, `Expected product costPrice 100, got ${updatedProduct?.costPrice}`);
    assert(updatedProduct?.baseCost === 100, `Expected product baseCost 100, got ${updatedProduct?.baseCost}`);

    console.log('Smoke test passed.');
    console.log({
      purchaseId: updatedPurchase.id,
      purchaseStatus: updatedPurchase.status,
      kioskProductStock: kioskProduct.stock,
      kioskProductPrice: kioskProduct.price,
      supplierProductCost: supplierProduct.cost,
      productCostPrice: updatedProduct?.costPrice,
    });
  } finally {
    await prisma.$transaction(async (tx) => {
      if (cleanupIds.purchaseId) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: cleanupIds.purchaseId } });
        await tx.purchase.deleteMany({ where: { id: cleanupIds.purchaseId } });
      }

      await tx.kioskProduct.deleteMany({
        where: {
          kioskId: cleanupIds.kioskId,
          productId: cleanupIds.productId,
        },
      });

      await tx.supplierProduct.deleteMany({
        where: {
          supplierId: cleanupIds.supplierId,
          productId: cleanupIds.productId,
        },
      });

      await tx.product.deleteMany({ where: { id: cleanupIds.productId } });
      await tx.supplier.deleteMany({ where: { id: cleanupIds.supplierId } });
      await tx.kiosk.deleteMany({ where: { id: cleanupIds.kioskId } });
      await tx.customer.deleteMany({ where: { id: cleanupIds.customerId } });
    });

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('Smoke test failed:');
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});