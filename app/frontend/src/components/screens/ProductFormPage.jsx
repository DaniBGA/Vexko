// src/components/screens/ProductFormPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PackagePlus, RotateCcw, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { unwrapProductsResponse } from '../../lib/response.js';
import { PageHeader, fmt } from '../ui/index.jsx';

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
  isCustom: true,
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
    sku: product.sku || '',
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
    isCustom: Boolean(product.isCustom),
  };
}

export default function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = new URLSearchParams(location.search);

  const isNew = !id;
  const customMode = query.get('custom') === '1';
  const catalogId = query.get('catalogId');
  const initialName = query.get('name') || '';
  const returnTo = query.get('return') || '/stock';

  const [modalOpen, setModalOpen] = useState(!isNew);
  const [catalogSearch, setCatalogSearch] = useState(initialName);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, name: initialName, isCustom: customMode || EMPTY_FORM.isCustom });

  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: catalogProduct } = useQuery({
    queryKey: ['catalog-product', catalogId],
    queryFn: () => api.get(`/products/${catalogId}`).then((r) => r.data),
    enabled: isNew && !!catalogId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers').then((r) => r.data),
  });

  const catalogSearchTerm = catalogSearch.trim();
  const { data: catalogProducts = [], isFetching: isSearchingCatalog } = useQuery({
    queryKey: ['catalog-products', catalogSearchTerm],
    queryFn: () => api.get('/products', { params: { search: catalogSearchTerm || undefined, isCustom: false, global: 1, limit: 8 } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: isNew,
  });

  // Detectar duplicados mientras se completa el formulario
  const nameSearch = form.name.trim();
  const skuSearch = form.sku.trim();
  const { data: dupByName = [] } = useQuery({
    queryKey: ['product-dup-name', nameSearch],
    queryFn: () => api.get('/products', { params: { search: nameSearch, isCustom: false, limit: 5 } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: isNew && nameSearch.length >= 3,
    keepPreviousData: true,
  });
  const { data: dupBySku = [] } = useQuery({
    queryKey: ['product-dup-sku', skuSearch],
    queryFn: () => api.get('/products', { params: { search: skuSearch, isCustom: false, limit: 5 } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: isNew && skuSearch.length >= 1,
    keepPreviousData: true,
  });

  const duplicateByName = dupByName && dupByName.find((p) => p.name && p.name.toLowerCase() === nameSearch.toLowerCase());
  const duplicateBySku = dupBySku && dupBySku.find((p) => (p.sku === skuSearch) || (p.barcode === skuSearch));

  useEffect(() => {
    if (product) {
      setForm(mapProductToForm(product));
      setModalOpen(true);
    }
  }, [product]);

  useEffect(() => {
    if (selectedCatalogProduct) {
      setForm((current) => ({
        ...current,
        ...mapProductToForm(selectedCatalogProduct),
        name: selectedCatalogProduct.name || current.name,
        sku: selectedCatalogProduct.sku || selectedCatalogProduct.barcode || current.sku,
        isCustom: true,
      }));
      setModalOpen(true);
    }
  }, [selectedCatalogProduct]);

  useEffect(() => {
    if (catalogProduct) {
      setSelectedCatalogProduct(catalogProduct);
      setForm((current) => ({
        ...current,
        ...mapProductToForm(catalogProduct),
        name: catalogProduct.name || current.name,
        sku: catalogProduct.sku || catalogProduct.barcode || current.sku,
        isCustom: true,
      }));
      setModalOpen(true);
    }
  }, [catalogProduct]);

  const allSubcategories = useMemo(
    () => categories.flatMap((category) => category.subcategories.map((subcategory) => ({ value: subcategory.id, label: `${category.name} › ${subcategory.name}` }))),
    [categories]
  );

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data) => (isNew
      ? api.post('/products', data).then((r) => r.data)
      : api.put(`/products/${id}`, data).then((r) => r.data)),
    onSuccess: () => {
      toast.success(isNew ? 'Producto creado' : 'Producto actualizado');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      if (customMode) {
        navigate(`${returnTo}?search=${encodeURIComponent(form.name)}`);
        return;
      }
      navigate(form.isCustom ? '/stock' : `/catalogo?search=${encodeURIComponent(form.name)}`);
    },
  });

  const { mutate: removeFromCommerce, isPending: isRemoving } = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      toast.success('Producto quitado de productos propios');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      navigate('/stock');
    },
  });

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const usingPackMode = form.loadMode === 'pack';
  const packPrice = toNumber(form.packPrice);
  const packUnits = toNumber(form.packUnits);
  const packCount = toNumber(form.packCount);
  const unitCost = usingPackMode
    ? (packUnits > 0 ? packPrice / packUnits : 0)
    : toNumber(form.unitCost);
  const stockUnits = usingPackMode ? (packUnits * packCount) : toNumber(form.unitStock);
  const salePriceFromPercentage = unitCost > 0 && form.salePercent !== ''
    ? unitCost * (1 + toNumber(form.salePercent) / 100)
    : 0;
  const salePriceValue = form.salePriceMode === 'percentage'
    ? salePriceFromPercentage
    : toNumber(form.salePrice);
  const margin = unitCost > 0 && salePriceValue > 0
    ? Math.round(((salePriceValue - unitCost) / salePriceValue) * 100)
    : 0;

  function handleSubmit(e) {
    e.preventDefault();

    if (!form.name.trim()) return toast.error('Completá el nombre');
    if (usingPackMode) {
      if (!packPrice || !packUnits || !packCount) {
        return toast.error('Completá precio por pack, unidades por pack y cantidad de packs');
      }
    } else {
      if (form.unitCost === '') {
        return toast.error('Completá el precio por unidad');
      }
      if (form.unitStock === '') {
        return toast.error('Completá el stock en unidades');
      }
    }
    if (!salePriceValue) {
      return toast.error('Completá el precio de venta');
    }

    save({
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
      isCustom: form.isCustom,
    });
  }

  function closeModal() {
    setModalOpen(false);
    if (!id) {
      setSelectedCatalogProduct(null);
      return;
    }

    navigate('/stock');
  }

  const modal = (isNew || id) ? (
    <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-sm font-700 text-brand-sidebar">
              {isNew ? (selectedCatalogProduct ? 'Agregar al comercio' : 'Crear producto') : 'Editar producto'}
            </div>
            <div className="text-xs text-gray-400">
              {isNew
                ? (selectedCatalogProduct ? selectedCatalogProduct.name : 'Completá los datos para guardar el producto')
                : (product?.name || 'Completá los datos del producto')}
            </div>
          </div>
          <button type="button" onClick={closeModal} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <span className="text-3xl leading-none font-700">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Información del producto</h3>
                <span className="text-xs text-gray-400">{form.isCustom ? 'Producto propio' : 'Catálogo global'}</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="field-group">
                  <label className="field-label">ID del producto</label>
                  <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className="field-input" placeholder="Ej: PAN-001" />
                  {duplicateBySku && (
                    <div className="mt-2 rounded-md bg-amber-50 border border-amber-100 p-2 text-amber-800 text-sm">
                      Existe un producto en el catálogo global con ese ID: <strong>{duplicateBySku.name}</strong>. <button type="button" onClick={() => setSelectedCatalogProduct(duplicateBySku)} className="underline ml-2">Cargar</button>
                    </div>
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label">Nombre *</label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="field-input" />
                  {duplicateByName && (
                    <div className="mt-2 rounded-md bg-amber-50 border border-amber-100 p-2 text-amber-800 text-sm">
                      Existe un producto en el catálogo global con el mismo nombre: <strong>{duplicateByName.name}</strong>. <button type="button" onClick={() => setSelectedCatalogProduct(duplicateByName)} className="underline ml-2">Cargar</button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                </div>
                <div className="field-group">
                  <label className="field-label">Fecha de vencimiento (opcional)</label>
                  <input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label">Descripción (opcional)</label>
                  <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className="field-input resize-none" />
                </div>
                <div className="field-group">
                  <label className="field-label">Tipo de producto</label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.isCustom}
                      onChange={(e) => set('isCustom', e.target.checked)}
                    />
                    Producto propio
                  </label>
                </div>
                
              </div>
            </div>

            <div className="space-y-5">
              {usingPackMode ? (
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Precio y pack</h3></div>
                  <div className="px-5 pt-3">
                    <div className="grid grid-cols-2 gap-2 max-w-xs">
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
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="field-group">
                        <label className="field-label">Stock en unidades</label>
                        <input value={stockUnits ? stockUnits.toFixed(0) : '0'} readOnly className="field-input bg-gray-50" />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Stock mínimo</label>
                        <input type="number" min="0" step="1" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="field-input" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Precio y stock por unidad</h3></div>
                  <div className="px-5 pt-3">
                    <div className="grid grid-cols-2 gap-2 max-w-xs">
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
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
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
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header"><h3 className="card-title">Precio de venta</h3></div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
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
                    <div className="field-group">
                      <label className="field-label">Precio de venta *</label>
                      <input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} className="field-input" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
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

                  <div className={`rounded-lg px-4 py-3 text-sm font-600 ${margin >= 25 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    Margen estimado: {margin}% — Ganás {salePriceValue > unitCost ? fmt(salePriceValue - unitCost) : '$ 0,00'} por unidad
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="border-t border-gray-100 bg-white px-6 py-4 flex items-center justify-between gap-3">
          <div>
            {!isNew && (
              <button
                type="button"
                onClick={() => removeFromCommerce()}
                disabled={isRemoving}
                className="inline-flex items-center rounded-xl bg-red-600 px-4 py-2 text-sm font-700 text-white shadow-md hover:bg-red-700 disabled:opacity-60"
              >
                {isRemoving ? 'Quitando...' : product?.isCustom ? 'Quitar de propios' : 'Quitar de stock'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={closeModal} className="btn-outline">Cancelar</button>
            <button type="button" onClick={handleSubmit} disabled={isPending} className="btn-primary">
              {isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!isNew) {
    return modalOpen ? modal : null;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Buscar o crear producto">
        <button onClick={() => navigate('/stock')} className="btn-outline">Cancelar</button>
        <button onClick={handleSubmit} disabled={isPending} className="btn-primary">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Catálogo global</h3>
              <p className="text-xs text-gray-400">Buscá el producto en la lista global. Si no existe, crealo como producto propio.</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="relative max-w-xl">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Buscar por nombre o ID en el catálogo global"
                className="field-input input-with-icon w-full"
              />
            </div>

            <div className="space-y-3">
              {isSearchingCatalog && <div className="text-xs text-gray-400">Buscando en catálogo...</div>}
              {(catalogProducts || []).slice(0, 8).map((productItem) => (
                  <div key={productItem.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-700 text-gray-800 truncate">{productItem.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {productItem.subcategory?.category?.name || 'Sin categoría'} · {fmt(productItem.salePrice)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCatalogProduct(productItem);
                        setModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-700 text-white"
                    >
                      <PackagePlus size={14} />
                      Agregar al comercio
                    </button>
                  </div>
                ))}

              {!isSearchingCatalog && catalogProducts.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-700 text-brand-sidebar">No está en el catálogo global</div>
                      <div className="text-xs text-gray-500">Crealo como producto propio para guardarlo con tus datos.</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCatalogProduct(null);
                        setForm((current) => ({ ...current, name: catalogSearchTerm || current.name, isCustom: true }));
                        setModalOpen(true);
                      }}
                      className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                    >
                      <RotateCcw size={14} />
                      Crear producto
                    </button>
                  </div>
              )}
            </div>

            {selectedCatalogProduct && (
              <div className="rounded-2xl border border-brand-navy/20 bg-brand-navy/5 p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-700 text-brand-sidebar">Usando como base</div>
                  <div className="text-xs text-gray-500">{selectedCatalogProduct.name}</div>
                </div>
                <button onClick={() => setSelectedCatalogProduct(null)} className="btn-outline">Cambiar</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && modal}
    </div>
  );
}
