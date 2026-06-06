import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { unwrapProductsResponse } from '../../lib/response.js';
import { fmt } from '../ui/index.jsx';

const EMPTY_FORM = {
  name: '',
  sku: '',
  loadMode: 'pack',
  subcategoryId: '',
  supplierId: '',
  packPrice: '',
  packUnits: '',
  packCount: '',
  unitCost: '',
  unitStock: '',
  salePrice: '',
  salePriceMode: 'numeric',
  salePercent: '',
  minStock: '',
  expiresAt: '',
  description: '',
};

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value);
}

function mapProductToForm(product) {
  const packPrice = product.packPrice ?? product.basePrice ?? '';
  const packUnits = product.packUnits ?? '';
  const packCount = product.packCount ?? '';
  const unitCost = packPrice && packUnits ? Number(packPrice) / Number(packUnits) : product.costPrice ?? '';
  const salePrice = product.salePrice ?? '';
  const salePercent = unitCost && salePrice
    ? Math.max(0, Math.round(((Number(salePrice) / Number(unitCost)) - 1) * 100))
    : '';
  const loadMode = product.packPrice && product.packUnits && product.packCount ? 'pack' : 'unit';

  return {
    name: product.name || '',
    sku: product.sku || product.barcode || '',
    loadMode,
    subcategoryId: product.subcategoryId || '',
    supplierId: product.supplierId || '',
    packPrice: toStringOrEmpty(packPrice),
    packUnits: toStringOrEmpty(packUnits),
    packCount: toStringOrEmpty(packCount),
    unitCost: toStringOrEmpty(product.costPrice ?? unitCost),
    unitStock: toStringOrEmpty(product.stock),
    salePrice: toStringOrEmpty(salePrice),
    salePriceMode: 'numeric',
    salePercent: toStringOrEmpty(salePercent),
    minStock: toStringOrEmpty(product.minStock),
    expiresAt: product.expiresAt ? product.expiresAt.split('T')[0] : '',
    description: product.description || '',
  };
}

export default function StockProductModal({ open, onClose, defaultSearch = '' }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(defaultSearch);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, name: defaultSearch });

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearch(defaultSearch);
    setSelectedCatalogProduct(null);
    setForm({ ...EMPTY_FORM, name: defaultSearch });
  }, [open, defaultSearch]);

  const catalogSearchTerm = search.trim();
  const { data: catalogProducts = [], isFetching } = useQuery({
    queryKey: ['stock-global-catalog', catalogSearchTerm],
    queryFn: () => api.get('/products', { params: { global: 1, search: catalogSearchTerm || undefined, limit: 12 } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
    enabled: open,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers').then((r) => r.data),
    enabled: open,
  });

  const allSubcategories = useMemo(
    () => categories.flatMap((category) => category.subcategories.map((subcategory) => ({ value: subcategory.id, label: `${category.name} › ${subcategory.name}` }))),
    [categories]
  );

  useEffect(() => {
    if (!selectedCatalogProduct) {
      return;
    }

    setForm((current) => ({
      ...current,
      ...mapProductToForm(selectedCatalogProduct),
      name: selectedCatalogProduct.name || current.name,
      sku: selectedCatalogProduct.sku || selectedCatalogProduct.barcode || current.sku,
    }));
  }, [selectedCatalogProduct]);

  const { mutate: saveProduct, isPending } = useMutation({
    mutationFn: (data) => {
      if (selectedCatalogProduct) {
        return api.post(`/products/${selectedCatalogProduct.id}/clone-to-kiosk`, {
          stock: data.stock,
          minStock: data.minStock,
          price: data.salePrice,
        }).then((r) => r.data);
      }

      return api.post('/products', data).then((r) => r.data);
    },
    onSuccess: () => {
      toast.success('Producto agregado al stock');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['stock-global-catalog'] });
      onClose();
    },
  });

  const usingPackMode = form.loadMode === 'pack';
  const packPrice = toNumber(form.packPrice);
  const packUnits = toNumber(form.packUnits);
  const packCount = toNumber(form.packCount);
  const unitCost = usingPackMode ? (packUnits > 0 ? packPrice / packUnits : 0) : toNumber(form.unitCost);
  const stockUnits = usingPackMode ? (packUnits * packCount) : toNumber(form.unitStock);
  const salePriceFromPercentage = unitCost > 0 && form.salePercent !== ''
    ? unitCost * (1 + toNumber(form.salePercent) / 100)
    : 0;
  const salePriceValue = form.salePriceMode === 'percentage' ? salePriceFromPercentage : toNumber(form.salePrice);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Completá el nombre');
      return;
    }

    if (usingPackMode) {
      if (!packPrice || !packUnits || !packCount) {
        toast.error('Completá precio por pack, unidades por pack y cantidad de packs');
        return;
      }
    } else {
      if (form.unitCost === '') {
        toast.error('Completá el precio por unidad');
        return;
      }
      if (form.unitStock === '') {
        toast.error('Completá el stock en unidades');
        return;
      }
    }

    if (!salePriceValue) {
      toast.error('Completá el precio de venta');
      return;
    }

    saveProduct({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      loadMode: form.loadMode,
      subcategoryId: form.subcategoryId || null,
      supplierId: form.supplierId || null,
      packPrice: usingPackMode ? packPrice : null,
      packUnits: usingPackMode ? Math.trunc(packUnits) : null,
      packCount: usingPackMode ? Math.trunc(packCount) : null,
      costPrice: unitCost,
      salePrice: salePriceValue,
      stock: stockUnits,
      minStock: toNumber(form.minStock),
      expiresAt: form.expiresAt || null,
      description: form.description,
      isCustom: true,
    });
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/55 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-sm font-700 text-brand-sidebar">Agregar productos al stock</div>
            <div className="text-xs text-gray-400">Buscá en el catálogo global, elegí un producto o creá uno nuevo desde el mismo modal.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] flex-1 min-h-0">
          <div className="border-r border-gray-100 bg-slate-50 flex flex-col min-h-0">
            <div className="p-5 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto global..."
                  className="field-input input-with-icon w-full"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {isFetching && <div className="text-xs text-gray-400">Buscando en el catálogo...</div>}

              {!isFetching && catalogProducts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                  <div className="text-sm font-700 text-brand-sidebar">No hay resultados en el catálogo</div>
                  <div className="text-xs text-gray-500 mt-1">Podés crear el producto como propio y guardarlo en tu stock.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCatalogProduct(null);
                      setForm((current) => ({ ...current, name: catalogSearchTerm || current.name }));
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-700 text-white"
                  >
                    <PackagePlus size={14} />
                    Crear producto
                  </button>
                </div>
              )}

              {catalogProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedCatalogProduct(product)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedCatalogProduct?.id === product.id ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-200 bg-white hover:border-brand-navy/40'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-700 text-gray-800 truncate">{product.name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {product.subcategory?.category?.name || 'Sin categoría'} · {fmt(product.salePrice)}
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-700 text-amber-700">Global</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="border-b border-gray-100 px-5 py-4 bg-white">
              <div className="text-sm font-700 text-brand-sidebar">
                {selectedCatalogProduct ? 'Completar datos del producto' : 'Crear producto propio'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {selectedCatalogProduct ? selectedCatalogProduct.name : 'Escribí los datos y guardalo en tu stock'}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-white">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="field-group sm:col-span-2">
                    <label className="field-label">Nombre *</label>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="field-input" />
                  </div>

                  <div className="field-group">
                    <label className="field-label">ID / SKU</label>
                    <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className="field-input" placeholder="Ej: PAN-001" />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Categoría / Subcategoría</label>
                    <select value={form.subcategoryId} onChange={(e) => set('subcategoryId', e.target.value)} className="field-input">
                      <option value="">Seleccionar...</option>
                      {allSubcategories.map((subcategory) => <option key={subcategory.value} value={subcategory.value}>{subcategory.label}</option>)}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Proveedor</label>
                    <select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)} className="field-input">
                      <option value="">Sin proveedor</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Fecha de vencimiento</label>
                    <input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} className="field-input" />
                  </div>

                  <div className="field-group sm:col-span-2">
                    <label className="field-label">Descripción</label>
                    <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className="field-input resize-none" />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="text-sm font-700 text-brand-sidebar">Modo de carga</div>
                      <div className="text-xs text-gray-400">Podés cargar por pack o por unidad.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-56 max-w-full">
                      <button
                        type="button"
                        onClick={() => set('loadMode', 'pack')}
                        className={`rounded-xl border px-3 py-2 text-sm font-700 ${usingPackMode ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'border-gray-200 bg-white text-gray-600'}`}
                      >
                        Por pack
                      </button>
                      <button
                        type="button"
                        onClick={() => set('loadMode', 'unit')}
                        className={`rounded-xl border px-3 py-2 text-sm font-700 ${!usingPackMode ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'border-gray-200 bg-white text-gray-600'}`}
                      >
                        Por unidad
                      </button>
                    </div>
                  </div>

                  {usingPackMode ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="field-group">
                        <label className="field-label">Precio por pack *</label>
                        <input type="number" min="0" step="0.01" value={form.packPrice} onChange={(e) => set('packPrice', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Unidades del pack *</label>
                        <input type="number" min="1" step="1" value={form.packUnits} onChange={(e) => set('packUnits', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Cantidad de packs *</label>
                        <input type="number" min="0" step="1" value={form.packCount} onChange={(e) => set('packCount', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Precio por unidad</label>
                        <input value={unitCost ? unitCost.toFixed(2) : ''} readOnly className="field-input bg-gray-50" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock en unidades</label>
                        <input value={stockUnits ? stockUnits.toFixed(0) : '0'} readOnly className="field-input bg-gray-50" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock mínimo</label>
                        <input type="number" min="0" step="1" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="field-input" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="field-group">
                        <label className="field-label">Precio por unidad *</label>
                        <input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock en unidades *</label>
                        <input type="number" min="0" step="1" value={form.unitStock} onChange={(e) => set('unitStock', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock mínimo</label>
                        <input type="number" min="0" step="1" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock total</label>
                        <input value={toNumber(form.unitStock)} readOnly className="field-input bg-gray-50" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 p-4">
                  <div className="text-sm font-700 text-brand-sidebar mb-4">Precio de venta</div>
                  <div className="grid grid-cols-2 gap-2 mb-4 max-w-sm">
                    <button
                      type="button"
                      onClick={() => set('salePriceMode', 'numeric')}
                      className={`rounded-xl border px-3 py-2 text-sm font-700 ${form.salePriceMode === 'numeric' ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'border-gray-200 bg-white text-gray-600'}`}
                    >
                      Valor numérico
                    </button>
                    <button
                      type="button"
                      onClick={() => set('salePriceMode', 'percentage')}
                      className={`rounded-xl border px-3 py-2 text-sm font-700 ${form.salePriceMode === 'percentage' ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'border-gray-200 bg-white text-gray-600'}`}
                    >
                      Porcentaje
                    </button>
                  </div>

                  {form.salePriceMode === 'numeric' ? (
                    <div className="field-group max-w-sm">
                      <label className="field-label">Precio de venta *</label>
                      <input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} className="field-input" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                      <div className="field-group">
                        <label className="field-label">Margen % *</label>
                        <input type="number" min="0" step="1" value={form.salePercent} onChange={(e) => set('salePercent', e.target.value)} className="field-input" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Precio de venta calculado</label>
                        <input value={salePriceFromPercentage ? salePriceFromPercentage.toFixed(2) : ''} readOnly className="field-input bg-gray-50" />
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="border-t border-gray-100 bg-white px-6 py-4 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-400">Se guardará como producto propio del cliente y aparecerá en stock.</div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={onClose} className="btn-outline">Cancelar</button>
                <button type="button" onClick={handleSubmit} disabled={isPending} className="btn-primary inline-flex items-center gap-2">
                  <PackagePlus size={14} />
                  {isPending ? 'Guardando...' : 'Guardar producto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
