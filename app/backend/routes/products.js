// src/routes/products.js
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, resolveRequestKiosk } from '../middleware/auth.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

function buildProductInclude(kioskId) {
  const include = {
    subcategory: { include: { category: true } },
    supplier: { select: { id: true, name: true } },
  };

  if (kioskId) {
    include.kioskProducts = {
      where: { kioskId },
      select: { id: true, stock: true, minStock: true, price: true, cost: true, barcodePrinted: true },
    };
  }

  return include;
}

function getKioskInventory(product) {
  return product?.kioskProducts?.[0] || null;
}

function mergeProductInventory(product) {
  const inventory = getKioskInventory(product);
  if (!inventory) {
    return {
      ...product,
      stock: product.stock ?? 0,
      minStock: product.minStock ?? 0,
      kioskInventoryId: null,
      barcodePrinted: false,
    };
  }

  return {
    ...product,
    stock: inventory.stock,
    minStock: inventory.minStock,
    salePrice: inventory.price ?? product.salePrice,
    costPrice: inventory.cost ?? product.costPrice,
    kioskInventoryId: inventory.id,
    barcodePrinted: inventory.barcodePrinted ?? false,
  };
}

// `<= 0` y no `=== 0`: un stock negativo (datos viejos, de antes de que la
// venta validara el stock de forma atómica) se mostraba como "Crítico" en vez
// de "Sin stock".
function getStockStatus(stock, minStock) {
  const current = stock ?? 0;
  const min = minStock ?? 0;
  if (current <= 0) return 'OUT';
  if (current <= min) return 'CRITICAL';
  if (current <= min * 1.5) return 'ALERT';
  return 'OK';
}

// Mismo cálculo por-fila que usa la vista de stock (GET /products?stockView=1)
function mapStockViewProduct(product) {
  const inventory = getKioskInventory(product);
  return {
    ...product,
    stock: inventory?.stock ?? 0,
    minStock: inventory?.minStock ?? 0,
    salePrice: inventory?.price ?? product.salePrice,
    costPrice: inventory?.cost ?? product.costPrice,
    stockStatus: getStockStatus(inventory?.stock, inventory?.minStock),
    kioskInventoryId: inventory?.id ?? null,
    barcodePrinted: inventory?.barcodePrinted ?? false,
  };
}

async function upsertKioskInventory(tx, kioskId, productId, data) {
  return tx.kioskProduct.upsert({
    where: { kioskId_productId: { kioskId, productId } },
    create: {
      kioskId,
      productId,
      stock: data.stock ?? 0,
      minStock: data.minStock ?? 0,
      price: data.price ?? null,
      cost: data.cost ?? null,
    },
    update: {
      ...(data.stock !== undefined ? { stock: data.stock } : {}),
      ...(data.minStock !== undefined ? { minStock: data.minStock } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.cost !== undefined ? { cost: data.cost } : {}),
    },
  });
}

// La impresión de etiquetas con código de barra es una función exclusiva del
// plan premium.
async function requirePremiumKiosk(req, res) {
  const kiosk = await resolveRequestKiosk(req);
  if (!kiosk) {
    res.status(404).json({ error: 'Kiosco no encontrado' });
    return null;
  }
  if (String(kiosk.customer?.plan || '').toUpperCase() !== 'PREMIUM') {
    res.status(403).json({ error: 'Esta función es exclusiva del plan premium' });
    return null;
  }
  return kiosk;
}

// Muchos productos (sobre todo del catálogo global) no tienen un código de
// barra real cargado. Para poder imprimir su etiqueta se les genera uno
// interno (prefijo "20", reservado por convención para uso interno/no
// comercial) y queda guardado para que la próxima vez sea el mismo código.
function generateInternalBarcodeCandidate() {
  let code = '20';
  for (let i = 0; i < 10; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function generateUniqueBarcode() {
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = generateInternalBarcodeCandidate();
    const exists = await prisma.product.findUnique({ where: { barcode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un código de barras único');
}

const productInclude = {
  subcategory: { include: { category: true } },
  supplier: { select: { id: true, name: true } },
};

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInt(value) {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function normalizeSearchTerm(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeLimit(value, fallback = 10) {
  const parsed = toInt(value);
  if (!parsed || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

function normalizePage(value) {
  const parsed = toInt(value);
  return !parsed || parsed < 1 ? 1 : parsed;
}

function buildSearchWhere(search) {
  const term = normalizeSearchTerm(search);
  if (!term) return undefined;

  const numericLike = /^[0-9\-\s.]+$/.test(term);
  // Postgres, a diferencia de SQLite, distingue mayúsculas/minúsculas en
  // `contains` por defecto — sin `mode: 'insensitive'` buscar "coca" no
  // encontraba "Coca Cola".
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { id: { startsWith: term } },
      { barcode: numericLike ? { startsWith: term } : { contains: term, mode: 'insensitive' } },
      { sku: numericLike ? { startsWith: term } : { contains: term, mode: 'insensitive' } },
    ],
  };
}

function normalizeProductKey(product) {
  return String(product?.name || '').trim().toLowerCase();
}

function dedupeProductsByName(products) {
  const seen = new Map();
  for (const product of products) {
    const key = normalizeProductKey(product);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, product);
    }
  }
  return Array.from(seen.values());
}

function buildCatalogAccessWhere(customerId) {
  return {
    active: true,
    OR: [{ customerId }, { customerId: null }],
  };
}

// Combina un where existente (que puede tener su propio `OR`) con el
// filtro de búsqueda sin que uno pise la clave `OR` del otro: usar
// Object.assign acá dejaba pasar productos de otros clientes al buscar.
function applySearchWhere(where, searchWhere) {
  if (!searchWhere) return where;
  if (where.OR) {
    const { OR, ...rest } = where;
    return { ...rest, AND: [{ OR }, searchWhere] };
  }
  return { ...where, ...searchWhere };
}

// `deriveStockFromPacks` solo en el alta: "cantidad de packs" describe la
// carga inicial. Antes también se usaba al editar, y como packCount queda
// guardado con el valor de la primera carga, editar cualquier cosa de un
// producto por pack (por ejemplo el precio) volvía a poner el stock en
// packUnits × packCount y borraba todo lo vendido o recibido desde entonces.
function computeProductValues(body, { deriveStockFromPacks = false } = {}) {
  const loadMode = body.loadMode === 'unit' ? 'unit' : 'pack';
  const packPrice = toNumber(body.packPrice);
  const packUnits = toInt(body.packUnits);
  const packCount = toInt(body.packCount);
  const unitCost = toNumber(body.costPrice);
  const stock = toInt(body.stock);
  const salePrice = toNumber(body.salePrice);

  if (loadMode === 'unit') {
    return { loadMode, packPrice: undefined, packUnits: undefined, packCount: undefined, unitCost, stock, salePrice };
  }

  const resolvedPackPrice = packPrice !== undefined ? packPrice : unitCost;
  const resolvedPackUnits = packUnits;
  const derivedUnitCost = resolvedPackPrice !== undefined && resolvedPackUnits ? resolvedPackPrice / resolvedPackUnits : unitCost;
  const resolvedStock = stock === undefined && deriveStockFromPacks && packUnits !== undefined && packCount !== undefined
    ? packUnits * packCount
    : stock;

  return { loadMode, packPrice: resolvedPackPrice, packUnits: resolvedPackUnits, packCount, unitCost: derivedUnitCost, stock: resolvedStock, salePrice };
}

function validateProductValues(values, minStock) {
  if (values.stock !== undefined && values.stock < 0) return 'El stock no puede ser negativo';
  if (minStock !== undefined && minStock < 0) return 'El stock mínimo no puede ser negativo';
  if (values.salePrice !== undefined && values.salePrice < 0) return 'El precio de venta no puede ser negativo';
  if (values.unitCost !== undefined && values.unitCost < 0) return 'El costo no puede ser negativo';
  if (values.packUnits !== undefined && values.packUnits <= 0) return 'Las unidades por pack tienen que ser mayores a cero';
  return null;
}

// GET /api/products
productsRouter.get('/', async (req, res, next) => {
  try {
    const { search, status, subcategoryId, supplierId, isCustom, page, limit } = req.query;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.json({ products: [], total: 0, page: 1, limit: normalizeLimit(limit), totalPages: 0 });
    }

    const stockView = req.query.stockView === '1' || req.query.stockView === 'true';
    const addedOnly = req.query.added === '1' || req.query.added === 'true' || req.query.agregados === '1' || req.query.agregados === 'true';
    const includeGlobal = req.query.global === '1' || req.query.includeGlobal === 'true';
    const dedupeGlobal = req.query.dedupe !== 'false';
    const searchWhere = buildSearchWhere(search);
    const usePagination = page !== undefined || limit !== undefined;

    if (stockView) {
      let where = buildCatalogAccessWhere(kiosk.customerId);
      if (searchWhere) where = applySearchWhere(where, searchWhere);
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (supplierId) where.supplierId = supplierId;
      if (isCustom === 'true') where.isCustom = true;
      if (isCustom === 'false') where.isCustom = false;
      // "Agregados a mi stock" también se resuelve en SQL (antes se traía TODO
      // el catálogo global — miles de productos — a memoria y se filtraba acá
      // con .filter(), en cada visita a Stock).
      if (addedOnly) {
        where = {
          AND: [
            where,
            { OR: [{ customerId: kiosk.customerId }, { kioskProducts: { some: { kioskId: kiosk.id } } } ] },
          ],
        };
      }

      if (usePagination) {
        const pageNumber = normalizePage(page);
        const pageSize = normalizeLimit(limit);
        const [total, products] = await Promise.all([
          prisma.product.count({ where }),
          prisma.product.findMany({
            where,
            include: buildProductInclude(kiosk.id),
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: (pageNumber - 1) * pageSize,
            take: pageSize,
          }),
        ]);
        res.json({
          products: products.map(mapStockViewProduct),
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        });
        return;
      }

      const allProducts = await prisma.product.findMany({
        where,
        include: buildProductInclude(kiosk.id),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      res.json(allProducts.map(mapStockViewProduct));
      return;
    }

    if (includeGlobal) {
      let where = buildCatalogAccessWhere(kiosk.customerId);
      if (searchWhere) where = applySearchWhere(where, searchWhere);
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (supplierId) where.supplierId = supplierId;
      if (isCustom === 'true') where.isCustom = true;
      if (isCustom === 'false') where.isCustom = false;

      const allProducts = await prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const listProducts = dedupeGlobal ? dedupeProductsByName(allProducts) : allProducts;

      if (usePagination) {
        const pageNumber = normalizePage(page);
        const pageSize = normalizeLimit(limit);
        const total = listProducts.length;
        const products = listProducts.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

        const enriched = products.map((p) => ({
          ...p,
          stockStatus: getStockStatus(p.stock, p.minStock),
        }));

        res.json({
          products: enriched,
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        });
        return;
      }

      const enriched = listProducts.map((p) => ({
        ...p,
        stockStatus: getStockStatus(p.stock, p.minStock),
      }));

      res.json(enriched);
      return;
    }

    let where = {
      active: true,
      OR: [
        { kioskProducts: { some: { kioskId: kiosk.id } } },
        { customerId: kiosk.customerId, kioskProducts: { none: {} } },
      ],
    };
    if (searchWhere) where = applySearchWhere(where, searchWhere);
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (supplierId) where.supplierId = supplierId;
    if (isCustom === 'true') where.isCustom = true;
    if (isCustom === 'false') where.isCustom = false;

    if (usePagination) {
      const pageNumber = normalizePage(page);
      const pageSize = normalizeLimit(limit);
      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: buildProductInclude(kiosk.id),
          orderBy: { name: 'asc' },
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const enriched = products.map((p) => {
        const merged = mergeProductInventory(p);
        return { ...merged, stockStatus: getStockStatus(merged.stock, merged.minStock) };
      });

      res.json({
        products: enriched,
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      });
      return;
    }

    const products = await prisma.product.findMany({
      where,
      include: buildProductInclude(kiosk.id),
      orderBy: { name: 'asc' },
    });

    const enriched = products.map((p) => {
      const merged = mergeProductInventory(p);
      return { ...merged, stockStatus: getStockStatus(merged.stock, merged.minStock) };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/prices  — lista de precios simplificada
productsRouter.get('/prices', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.json([]);
    const includeGlobal = req.query.global === '1' || req.query.includeGlobal === 'true';
    const where = includeGlobal ? buildCatalogAccessWhere(kiosk.customerId) : { active: true, kioskProducts: { some: { kioskId: kiosk.id } } };
    if (!includeGlobal) {
      where.OR = [
        { kioskProducts: { some: { kioskId: kiosk.id } } },
        { customerId: kiosk.customerId, kioskProducts: { none: {} } },
      ];
      delete where.kioskProducts;
    }

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        barcode: true,
        packPrice: true,
        packUnits: true,
        packCount: true,
        costPrice: true,
        salePrice: true,
        subcategory: { select: { name: true, category: { select: { name: true } } } },
        kioskProducts: {
          where: { kioskId: kiosk.id },
          select: { id: true, stock: true, minStock: true, price: true, cost: true },
        },
      },
      orderBy: [
        { subcategory: { category: { name: 'asc' } } },
        { name: 'asc' },
      ],
    });
    res.json(products.map((product) => mergeProductInventory(product)));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
productsRouter.get('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });

    const product = await prisma.product.findFirstOrThrow({
      where: {
        id: req.params.id,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: buildProductInclude(kiosk.id),
    });
      res.json(mergeProductInventory(product));
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/clone-to-kiosk
// A pesar del nombre, esto YA NO clona el producto: agrega un producto del
// catálogo global (o ya propio) al stock de este kiosco creando/actualizando
// su KioskProduct. Antes clonaba el producto entero como "propio" (isCustom)
// cada vez que un kiosco lo agregaba, lo que lo hacía aparecer como Propio en
// vez de Global y duplicaba el catálogo global un producto isCustom por cada
// kiosco que lo sumaba a su stock.
productsRouter.post('/:id/clone-to-kiosk', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Kiosco no encontrado' });
    }

    const source = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: buildProductInclude(kiosk.id),
    });

    if (!source) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const inventory = {
      stock: toInt(req.body.stock) ?? 0,
      minStock: req.body.minStock !== undefined ? (toInt(req.body.minStock) ?? 0) : (source.minStock ?? 0),
      price: req.body.price !== undefined ? toNumber(req.body.price) ?? null : (source.salePrice ?? null),
      cost: req.body.cost !== undefined ? toNumber(req.body.cost) ?? null : (source.costPrice ?? null),
    };
    const inventoryError = validateProductValues(
      { stock: inventory.stock, salePrice: inventory.price ?? undefined, unitCost: inventory.cost ?? undefined },
      inventory.minStock,
    );
    if (inventoryError) return res.status(400).json({ error: inventoryError });

    await upsertKioskInventory(prisma, kiosk.id, source.id, inventory);

    const updated = await prisma.product.findUnique({
      where: { id: source.id },
      include: buildProductInclude(kiosk.id),
    });

    res.status(201).json(mergeProductInventory(updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/products
// Desde una sucursal solo se crean productos PROPIOS del cliente. Antes el
// body decidía `isCustom` y hasta `customerId`: si en el formulario se elegía
// un producto del catálogo y después se tocaba "Cambiar", el form quedaba con
// isCustom:false y se creaba un producto GLOBAL (visible para todos los
// negocios, sin precio y sin stock en la sucursal que lo cargó); y mandando
// otro customerId se podía crear un producto a nombre de otro cliente. El
// catálogo global se carga con el seed (db:seed:catalog), no desde la app.
productsRouter.post('/', async (req, res, next) => {
  try {
    const { barcode, sku, subcategoryId, supplierId, expiresAt, description } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(400).json({ error: 'No hay kiosko configurado' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre del producto es obligatorio' });

    const values = computeProductValues(req.body, { deriveStockFromPacks: true });
    const minStock = toInt(req.body.minStock);
    const valuesError = validateProductValues(values, minStock);
    if (valuesError) return res.status(400).json({ error: valuesError });

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, kioskId: kiosk.id }, select: { id: true } });
      if (!supplier) return res.status(400).json({ error: 'El proveedor no pertenece a esta sucursal' });
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name,
          barcode: barcode || null,
          sku: sku || null,
          loadMode: values.loadMode,
          subcategoryId: subcategoryId || null,
          supplierId: supplierId || null,
          basePrice: values.packPrice ?? null,
          baseCost: values.unitCost ?? null,
          packPrice: values.packPrice ?? null,
          packUnits: values.packUnits ?? null,
          packCount: values.packCount ?? null,
          costPrice: values.unitCost ?? null,
          salePrice: values.salePrice ?? null,
          stock: values.stock ?? 0,
          minStock: minStock || 0,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          description,
          isCustom: true,
          customerId: kiosk.customerId,
        },
      });

      await upsertKioskInventory(tx, kiosk.id, created.id, {
        stock: values.stock ?? 0,
        minStock: minStock || 0,
        price: values.salePrice ?? null,
        cost: values.unitCost ?? null,
      });

      return tx.product.findUnique({
        where: { id: created.id },
        include: buildProductInclude(kiosk.id),
      });
    });

    res.status(201).json(mergeProductInventory(product));
  } catch (err) {
    next(err);
  }
});

// Mucho del catálogo global se importó con loadMode "pack" (el default del
// schema) pero sin datos de pack (packPrice/packUnits/packCount en null). El
// formulario del frontend deriva el modo real a partir de esos datos
// (mapProductToForm), así que para un producto en ese estado siempre calcula
// "unit" al editarlo aunque en la base diga "pack". Comparamos acá con el
// mismo criterio para no disparar un clon innecesario por ese desfasaje.
function effectiveLoadMode(product) {
  return (product.packPrice && product.packUnits && product.packCount) ? 'pack' : 'unit';
}

// Campos del catálogo compartido: si alguno de estos cambia en un producto
// global hace falta clonarlo (si no, se corrompería para el resto de los
// clientes). Precio de venta, stock y mínimo NO están acá porque esos ya
// viven en KioskProduct (por-kiosco) y editarlos no debería convertir un
// producto global en "propio".
function sharedProductFieldsChanged(existing, values, body) {
  const currentExpiresAt = existing.expiresAt ? new Date(existing.expiresAt).getTime() : null;
  // Un campo que no viene en el body no cambió. Antes un PUT parcial (por ejemplo
  // solo { stock }) tomaba como cambios el loadMode 'pack' por defecto, los packs
  // y el vencimiento ausentes, y clonaba el producto global como propio.
  const incoming = {
    name: body.name !== undefined ? body.name : existing.name,
    barcode: body.barcode !== undefined ? (body.barcode || null) : existing.barcode,
    sku: body.sku !== undefined ? (body.sku || null) : existing.sku,
    loadMode: body.loadMode !== undefined ? values.loadMode : effectiveLoadMode(existing),
    subcategoryId: body.subcategoryId !== undefined ? (body.subcategoryId || null) : existing.subcategoryId,
    supplierId: body.supplierId !== undefined ? (body.supplierId || null) : existing.supplierId,
    packPrice: body.packPrice !== undefined || body.costPrice !== undefined ? (values.packPrice ?? null) : existing.packPrice,
    packUnits: body.packUnits !== undefined ? (values.packUnits ?? null) : existing.packUnits,
    packCount: body.packCount !== undefined ? (values.packCount ?? null) : existing.packCount,
    description: body.description !== undefined ? (body.description || null) : existing.description,
    expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt).getTime() : null) : currentExpiresAt,
  };

  return (
    incoming.name !== existing.name ||
    incoming.barcode !== existing.barcode ||
    incoming.sku !== existing.sku ||
    incoming.loadMode !== effectiveLoadMode(existing) ||
    incoming.subcategoryId !== existing.subcategoryId ||
    incoming.supplierId !== existing.supplierId ||
    Number(incoming.packPrice ?? 0) !== Number(existing.packPrice ?? 0) ||
    Number(incoming.packUnits ?? 0) !== Number(existing.packUnits ?? 0) ||
    Number(incoming.packCount ?? 0) !== Number(existing.packCount ?? 0) ||
    incoming.description !== existing.description ||
    incoming.expiresAt !== currentExpiresAt
  );
}

// PUT /api/products/:id
productsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, barcode, sku, subcategoryId, supplierId, minStock, expiresAt, description } = req.body;
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { customerId: kiosk.customerId },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      select: {
        id: true, customerId: true, name: true, barcode: true, sku: true, loadMode: true,
        subcategoryId: true, supplierId: true, packPrice: true, packUnits: true, packCount: true,
        description: true, expiresAt: true,
        kioskProducts: { where: { kioskId: kiosk.id }, select: { stock: true, minStock: true, price: true, cost: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
    const values = computeProductValues(req.body);
    const valuesError = validateProductValues(values, toInt(minStock));
    if (valuesError) return res.status(400).json({ error: valuesError });
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del producto es obligatorio' });
    }
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, kioskId: kiosk.id }, select: { id: true } });
      if (!supplier) return res.status(400).json({ error: 'El proveedor no pertenece a esta sucursal' });
    }
    const currentInventory = existing.kioskProducts[0] || null;

    // Un producto del catálogo global (customerId null) es compartido por todos
    // los clientes. Antes esta ruta lo pisaba directo con prisma.product.update,
    // así que "editar" un producto global desde un kiosco (p. ej. ponerle precio
    // o proveedor propio) corrompía el catálogo para el resto de los clientes.
    // Si cambia algo del catálogo compartido, se clona como producto propio de
    // este cliente en vez de tocar el original. Si solo cambió precio/stock
    // (que ya son por-kiosco), no hace falta clonar nada.
    const isGlobalProduct = existing.customerId === null;
    const needsClone = isGlobalProduct && sharedProductFieldsChanged(existing, values, req.body);

    const sharedData = {
      name: name !== undefined ? String(name).trim() : undefined,
      barcode: barcode !== undefined ? barcode || null : undefined,
      sku: sku !== undefined ? sku || null : undefined,
      loadMode: values.loadMode,
      subcategoryId: subcategoryId !== undefined ? subcategoryId || null : undefined,
      supplierId: supplierId !== undefined ? supplierId || null : undefined,
      basePrice: values.packPrice ?? null,
      baseCost: values.unitCost,
      packPrice: values.packPrice ?? null,
      packUnits: values.packUnits ?? null,
      packCount: values.packCount ?? null,
      costPrice: values.unitCost,
      salePrice: values.salePrice,
      minStock: minStock !== undefined ? toInt(minStock) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      description,
    };

    let productId = existing.id;

    // Si el front no manda `stock` (no se tocó en el formulario), no se pisa:
    // así una venta hecha mientras el formulario estaba abierto no se pierde.
    let inventoryData = {
      stock: values.stock,
      minStock: sharedData.minStock,
      price: values.salePrice,
      cost: values.unitCost,
    };

    const updatedProduct = await prisma.$transaction(async (tx) => {
      if (needsClone) {
        // barcode y sku son únicos en toda la base: la copia no puede repetir
        // los del global (antes fallaba con 409 "Ya existe un registro con ese
        // valor único" al editar, p. ej., el proveedor de un global con SKU).
        const clonedBarcode = sharedData.barcode !== undefined && sharedData.barcode !== existing.barcode ? sharedData.barcode : null;
        const clonedSku = sharedData.sku !== undefined && sharedData.sku !== existing.sku ? sharedData.sku : null;
        const cloned = await tx.product.create({
          data: {
            ...sharedData,
            name: sharedData.name ?? existing.name,
            barcode: clonedBarcode,
            sku: clonedSku,
            subcategoryId: sharedData.subcategoryId ?? null,
            supplierId: sharedData.supplierId ?? null,
            minStock: sharedData.minStock ?? 0,
            stock: 0,
            isCustom: true,
            customerId: kiosk.customerId,
            active: true,
          },
        });
        productId = cloned.id;

        // La copia hereda el inventario que la sucursal tenía del global. Antes
        // se borraba el KioskProduct del global y la copia arrancaba con el
        // stock que mandara el form (0 si no venía): se perdía el stock.
        inventoryData = {
          stock: inventoryData.stock ?? currentInventory?.stock ?? 0,
          minStock: inventoryData.minStock ?? currentInventory?.minStock ?? 0,
          price: inventoryData.price ?? currentInventory?.price ?? null,
          cost: inventoryData.cost ?? currentInventory?.cost ?? null,
        };

        // Ya no hace falta la referencia al producto global en el stock de este
        // kiosco: a partir de ahora usa su propia copia. El original global
        // queda intacto para el resto de los clientes.
        await tx.kioskProduct.deleteMany({ where: { kioskId: kiosk.id, productId: existing.id } });
      } else if (!isGlobalProduct) {
        await tx.product.update({
          where: { id: req.params.id },
          data: { ...sharedData, isCustom: true, customerId: kiosk.customerId },
        });
      }
      // else: es un producto global y no cambió nada del catálogo compartido —
      // no se toca el Product, solo el KioskProduct de este kiosco más abajo.

      await upsertKioskInventory(tx, kiosk.id, productId, inventoryData);

      return tx.product.findUnique({
        where: { id: productId },
        include: buildProductInclude(kiosk.id),
      });
    });

    res.json(mergeProductInventory(updatedProduct));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        OR: [{ customerId: null }, { kioskProducts: { some: { kioskId: kiosk.id } } }],
      },
      select: {
        isCustom: true,
        customerId: true,
        kioskProducts: { where: { kioskId: kiosk.id }, select: { id: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.kioskProducts?.length) {
      await prisma.kioskProduct.deleteMany({ where: { kioskId: kiosk.id, productId: req.params.id } });
    }

    if (product.isCustom && product.customerId === kiosk.customerId) {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { active: false },
      });
      return res.status(204).end();
    }

    if (product.kioskProducts?.length) {
      return res.status(204).end();
    }

    // Producto global del catálogo compartido: no tiene inventario en este
    // kiosco, así que no hay nada que quitar y no debe desactivarse para
    // el resto de los clientes.
    return res.status(404).json({ error: 'Producto no encontrado' });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/barcode/:code
productsRouter.get('/barcode/:code', async (req, res, next) => {
  try {
    const kiosk = await resolveRequestKiosk(req);
    if (!kiosk) return res.status(404).json({ error: 'Producto no encontrado' });

    const product = await prisma.product.findFirst({
      where: {
        barcode: req.params.code,
        active: true,
        OR: [
          { customerId: null },
          { kioskProducts: { some: { kioskId: kiosk.id } } },
        ],
      },
      include: buildProductInclude(kiosk.id),
    });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    // Con el stock/precio/costo de la sucursal: antes devolvía el Product
    // crudo, con los campos legados (en un global, precio null y stock 0).
    res.json(mergeProductInventory(product));
  } catch (err) {
    next(err);
  }
});

// POST /api/products/barcode-labels  (solo plan premium)
// Prepara las etiquetas para imprimir: si al producto le falta el código de
// barra se le genera y se guarda, y se marca su KioskProduct como impreso
// para que no vuelva a aparecer como pendiente.
productsRouter.post('/barcode-labels', async (req, res, next) => {
  try {
    const kiosk = await requirePremiumKiosk(req, res);
    if (!kiosk) return;

    const productIds = Array.isArray(req.body.productIds)
      ? [...new Set(req.body.productIds.filter((id) => typeof id === 'string' && id))]
      : [];
    if (!productIds.length) {
      return res.status(400).json({ error: 'Elegí al menos un producto' });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        OR: [{ customerId: kiosk.customerId }, { customerId: null }],
      },
      include: { kioskProducts: { where: { kioskId: kiosk.id } } },
    });

    const labels = [];
    for (const product of products) {
      const inventory = product.kioskProducts[0];
      // Solo se imprime lo que realmente está en el stock de este kiosco.
      if (!inventory) continue;

      let barcode = product.barcode;
      if (!barcode) {
        barcode = await generateUniqueBarcode();
        await prisma.product.update({ where: { id: product.id }, data: { barcode } });
      }

      await prisma.kioskProduct.update({ where: { id: inventory.id }, data: { barcodePrinted: true } });

      labels.push({
        id: product.id,
        name: product.name,
        barcode,
        salePrice: inventory.price ?? product.salePrice ?? null,
      });
    }

    res.json({ labels });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id/barcode-printed  (solo plan premium)
// Marca manualmente un producto como impreso o pendiente, para corregir sin
// tener que generar el PDF de nuevo (por ejemplo si se perdió la etiqueta).
productsRouter.patch('/:id/barcode-printed', async (req, res, next) => {
  try {
    const kiosk = await requirePremiumKiosk(req, res);
    if (!kiosk) return;

    const printed = req.body.printed === true || req.body.printed === 'true';
    const inventory = await prisma.kioskProduct.findFirst({
      where: { kioskId: kiosk.id, productId: req.params.id },
    });
    if (!inventory) {
      return res.status(404).json({ error: 'Producto no encontrado en el stock de este kiosco' });
    }

    const updated = await prisma.kioskProduct.update({
      where: { id: inventory.id },
      data: { barcodePrinted: printed },
    });
    res.json({ id: req.params.id, barcodePrinted: updated.barcodePrinted });
  } catch (err) {
    next(err);
  }
});
