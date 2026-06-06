import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogFilePath = path.join(__dirname, 'catalog-products.json');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildProductSignature(product) {
  return [
    normalizeText(product?.name).toLowerCase(),
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

async function upsertCategory(name) {
  return prisma.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertSubcategory(name, categoryId) {
  return prisma.subcategory.upsert({
    where: { name_categoryId: { name, categoryId } },
    update: {},
    create: { name, categoryId },
  });
}

async function main() {
  const raw = await fs.readFile(catalogFilePath, 'utf8');
  const catalog = JSON.parse(raw);

  if (!Array.isArray(catalog)) {
    throw new Error('catalog-products.json must contain a JSON array');
  }

  const categoryCache = new Map();
  const subcategoryCache = new Map();
  const productRows = [];
  const existingProducts = await prisma.product.findMany({
    select: {
      name: true,
      categoryId: true,
      subcategoryId: true,
      barcode: true,
      sku: true,
      supplierId: true,
      loadMode: true,
      customerId: true,
      isCustom: true,
    },
  });
  const existingSignatures = new Set(existingProducts.map(buildProductSignature));

  for (const entry of catalog) {
    const categoryName = normalizeText(entry?.categoria);
    const subcategoryName = normalizeText(entry?.subcategoria);
    const productName = normalizeText(entry?.producto);

    if (!categoryName || !subcategoryName || !productName) {
      continue;
    }

    let category = categoryCache.get(categoryName);
    if (!category) {
      category = await upsertCategory(categoryName);
      categoryCache.set(categoryName, category);
    }

    const subcategoryKey = `${category.id}::${subcategoryName}`;
    let subcategory = subcategoryCache.get(subcategoryKey);
    if (!subcategory) {
      subcategory = await upsertSubcategory(subcategoryName, category.id);
      subcategoryCache.set(subcategoryKey, subcategory);
    }

    productRows.push({
      name: productName,
      active: true,
      isCustom: false,
      customerId: null,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      loadMode: 'pack',
      stock: 0,
      minStock: 0,
    });

    existingSignatures.add(buildProductSignature({
      name: productName,
      active: true,
      isCustom: false,
      customerId: null,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      loadMode: 'pack',
    }));
  }

  const uniqueRows = productRows.filter((product) => {
    const signature = buildProductSignature(product);
    if (existingSignatures.has(signature)) {
      return false;
    }
    existingSignatures.add(signature);
    return true;
  });

  if (uniqueRows.length > 0) {
    await prisma.product.createMany({ data: uniqueRows });
  }

  console.log(`✓ Catálogo global importado: ${uniqueRows.length} productos nuevos`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
