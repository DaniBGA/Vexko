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

async function upsertCategory(name) {
  const existing = await prisma.category.findFirst({ where: { customerId: null, name } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, customerId: null } });
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

  // Sin esto, correr el script de nuevo insertaba una copia entera del
  // catálogo cada vez (createMany no revisa si el producto ya existe),
  // duplicando y hasta sextuplicando productos en el catálogo global.
  const existingNames = new Set(
    (await prisma.product.findMany({ where: { customerId: null }, select: { name: true } }))
      .map((p) => p.name)
  );

  const categoryCache = new Map();
  const subcategoryCache = new Map();
  const productRows = [];
  let skipped = 0;

  for (const entry of catalog) {
    const categoryName = normalizeText(entry?.categoria);
    const subcategoryName = normalizeText(entry?.subcategoria);
    const productName = normalizeText(entry?.producto);

    if (!categoryName || !subcategoryName || !productName) {
      continue;
    }

    if (existingNames.has(productName)) {
      skipped += 1;
      continue;
    }
    existingNames.add(productName); // también evita duplicados dentro del propio archivo

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
  }

  if (productRows.length > 0) {
    await prisma.product.createMany({ data: productRows });
  }

  console.log(`✓ Catálogo global importado: ${productRows.length} productos nuevos (${skipped} ya existían, sin duplicar)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
