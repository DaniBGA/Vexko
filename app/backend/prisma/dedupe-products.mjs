import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

async function main() {
  console.log('Scanning products for duplicates...');

  const products = await prisma.product.findMany({ select: { id: true, name: true, createdAt: true } });
  const map = new Map();

  for (const p of products) {
    const key = normalizeName(p.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }

  const duplicates = [];
  for (const [key, list] of map.entries()) {
    if (list.length > 1) duplicates.push({ key, list });
  }

  console.log(`Found ${duplicates.length} duplicate name groups`);

  let totalDeleted = 0;

  for (const group of duplicates) {
    // sort by createdAt (oldest first) and keep the first
    group.list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const keep = group.list[0];
    const toRemove = group.list.slice(1);

    console.log(`Processing name="${group.key}" -> keep=${keep.id} (${keep.name}) remove=${toRemove.length}`);

    // process each duplicate id in a transaction per duplicate to keep DB consistent
    for (const dup of toRemove) {
      await prisma.$transaction(async (tx) => {
        // 1) Move/merge KioskProduct: if a kiosk already has a row for keep, sum stocks
        const dupKioskProducts = await tx.kioskProduct.findMany({ where: { productId: dup.id } });
        for (const kp of dupKioskProducts) {
          const existing = await tx.kioskProduct.findFirst({ where: { kioskId: kp.kioskId, productId: keep.id } });
          if (existing) {
            await tx.kioskProduct.update({ where: { id: existing.id }, data: { stock: (existing.stock || 0) + (kp.stock || 0), minStock: Math.min(existing.minStock || 0, kp.minStock || 0) } });
            await tx.kioskProduct.delete({ where: { id: kp.id } });
          } else {
            await tx.kioskProduct.update({ where: { id: kp.id }, data: { productId: keep.id } });
          }
        }

        // 2) SupplierProduct: avoid unique conflict by deleting duplicate supplier-product if exists, else reassign
        const dupSupplierProducts = await tx.supplierProduct.findMany({ where: { productId: dup.id } });
        for (const sp of dupSupplierProducts) {
          const existing = await tx.supplierProduct.findFirst({ where: { supplierId: sp.supplierId, productId: keep.id } });
          if (existing) {
            await tx.supplierProduct.delete({ where: { id: sp.id } });
          } else {
            await tx.supplierProduct.update({ where: { id: sp.id }, data: { productId: keep.id } });
          }
        }

        // 3) SaleItem and PurchaseItem: reassign FK to keep product
        await tx.saleItem.updateMany({ where: { productId: dup.id }, data: { productId: keep.id } });
        await tx.purchaseItem.updateMany({ where: { productId: dup.id }, data: { productId: keep.id } });

        // 4) Other relations: if any other tables reference productId, add similar reassign steps here.

        // 5) Finally delete the duplicate product
        await tx.product.delete({ where: { id: dup.id } });
      });

      totalDeleted += 1;
      console.log(` - removed duplicate product ${dup.id}`);
    }
  }

  console.log(`Done. Total duplicate products removed: ${totalDeleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
