import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function productSignature(product) {
  return [
    normalizeText(product?.name),
    product?.categoryId || '',
    product?.subcategoryId || '',
    product?.barcode || '',
    product?.sku || '',
    product?.supplierId || '',
    product?.loadMode || '',
    product?.customerId || '',
    product?.isCustom ? '1' : '0',
  ].join('::');
}

function toSafeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

async function mergeDuplicateProduct(tx, keeper, duplicate) {
  const keeperKioskProducts = new Map(keeper.kioskProducts.map((item) => [item.kioskId, item]));

  for (const kioskProduct of duplicate.kioskProducts) {
    const existing = keeperKioskProducts.get(kioskProduct.kioskId);
    if (!existing) {
      await tx.kioskProduct.update({
        where: { id: kioskProduct.id },
        data: { productId: keeper.id },
      });
      keeperKioskProducts.set(kioskProduct.kioskId, { ...kioskProduct, productId: keeper.id });
      continue;
    }

    await tx.kioskProduct.update({
      where: { id: existing.id },
      data: {
        stock: toSafeNumber(existing.stock) + toSafeNumber(kioskProduct.stock),
        minStock: Math.max(toSafeNumber(existing.minStock), toSafeNumber(kioskProduct.minStock)),
        price: existing.price ?? kioskProduct.price ?? null,
      },
    });
    await tx.kioskProduct.delete({ where: { id: kioskProduct.id } });
  }

  for (const saleItem of duplicate.saleItems) {
    await tx.saleItem.update({
      where: { id: saleItem.id },
      data: { productId: keeper.id },
    });
  }

  for (const purchaseItem of duplicate.purchaseItems) {
    await tx.purchaseItem.update({
      where: { id: purchaseItem.id },
      data: { productId: keeper.id },
    });
  }

  for (const supplierProduct of duplicate.supplierProducts) {
    const conflicting = await tx.supplierProduct.findFirst({
      where: { supplierId: supplierProduct.supplierId, productId: keeper.id },
      select: { id: true },
    });

    if (conflicting) {
      await tx.supplierProduct.delete({ where: { id: supplierProduct.id } });
      continue;
    }

    await tx.supplierProduct.update({
      where: { id: supplierProduct.id },
      data: { productId: keeper.id },
    });
  }

  if (!keeper.supplierId && duplicate.supplierId) {
    await tx.product.update({
      where: { id: keeper.id },
      data: { supplierId: duplicate.supplierId },
    });
  }

  const refreshed = await tx.product.findUnique({
    where: { id: keeper.id },
    select: {
      id: true,
      supplierId: true,
      description: true,
      barcode: true,
      sku: true,
      basePrice: true,
      baseCost: true,
      packPrice: true,
      packUnits: true,
      packCount: true,
      stock: true,
      minStock: true,
      salePrice: true,
      costPrice: true,
      expiresAt: true,
      active: true,
    },
  });

  const updateData = {};
  if (!refreshed.description && duplicate.description) updateData.description = duplicate.description;
  if (!refreshed.barcode && duplicate.barcode) updateData.barcode = duplicate.barcode;
  if (!refreshed.sku && duplicate.sku) updateData.sku = duplicate.sku;
  if (refreshed.basePrice == null && duplicate.basePrice != null) updateData.basePrice = duplicate.basePrice;
  if (refreshed.baseCost == null && duplicate.baseCost != null) updateData.baseCost = duplicate.baseCost;
  if (refreshed.packPrice == null && duplicate.packPrice != null) updateData.packPrice = duplicate.packPrice;
  if (refreshed.packUnits == null && duplicate.packUnits != null) updateData.packUnits = duplicate.packUnits;
  if (refreshed.packCount == null && duplicate.packCount != null) updateData.packCount = duplicate.packCount;
  if (refreshed.stock == null && duplicate.stock != null) updateData.stock = duplicate.stock;
  if (refreshed.minStock == null && duplicate.minStock != null) updateData.minStock = duplicate.minStock;
  if (refreshed.salePrice == null && duplicate.salePrice != null) updateData.salePrice = duplicate.salePrice;
  if (refreshed.costPrice == null && duplicate.costPrice != null) updateData.costPrice = duplicate.costPrice;
  if (refreshed.expiresAt == null && duplicate.expiresAt != null) updateData.expiresAt = duplicate.expiresAt;
  if (Object.keys(updateData).length > 0) {
    await tx.product.update({
      where: { id: keeper.id },
      data: updateData,
    });
  }
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      barcode: true,
      sku: true,
      loadMode: true,
      basePrice: true,
      baseCost: true,
      packPrice: true,
      packUnits: true,
      packCount: true,
      categoryId: true,
      subcategoryId: true,
      isCustom: true,
      customerId: true,
      stock: true,
      minStock: true,
      salePrice: true,
      costPrice: true,
      expiresAt: true,
      supplierId: true,
      active: true,
      createdAt: true,
      kioskProducts: {
        select: { id: true, kioskId: true, stock: true, minStock: true, price: true },
      },
      saleItems: {
        select: { id: true },
      },
      supplierProducts: {
        select: { id: true, supplierId: true },
      },
      purchaseItems: {
        select: { id: true },
      },
    },
  });

  const groups = new Map();
  for (const product of products) {
    const key = productSignature(product);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(product);
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  let removed = 0;
  let deactivated = 0;
  let mergedRelations = 0;

  for (const group of duplicateGroups) {
    const [keeper, ...duplicates] = group.sort((a, b) => {
      const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return createdAtDiff !== 0 ? createdAtDiff : a.id.localeCompare(b.id);
    });

    for (const duplicate of duplicates) {
      const hasRelations =
        duplicate.kioskProducts.length > 0 ||
        duplicate.saleItems.length > 0 ||
        duplicate.supplierProducts.length > 0 ||
        duplicate.purchaseItems.length > 0;

      if (hasRelations) {
        await prisma.$transaction(async (tx) => {
          await mergeDuplicateProduct(tx, keeper, duplicate);
          const remaining = await tx.product.findUnique({
            where: { id: duplicate.id },
            select: {
              kioskProducts: { select: { id: true } },
              saleItems: { select: { id: true } },
              supplierProducts: { select: { id: true } },
              purchaseItems: { select: { id: true } },
            },
          });

          if (
            remaining.kioskProducts.length === 0 &&
            remaining.saleItems.length === 0 &&
            remaining.supplierProducts.length === 0 &&
            remaining.purchaseItems.length === 0
          ) {
            await tx.product.delete({ where: { id: duplicate.id } });
            removed += 1;
          } else {
            await tx.product.update({ where: { id: duplicate.id }, data: { active: false } });
            deactivated += 1;
          }
        });
        mergedRelations += 1;
        continue;
      }

      await prisma.product.delete({ where: { id: duplicate.id } });
      removed += 1;
    }
  }

  console.log(JSON.stringify({ duplicateGroups: duplicateGroups.length, mergedRelations, removed, deactivated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
