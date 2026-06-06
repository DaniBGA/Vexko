// src/components/screens/ProductFormPage.jsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { PageHeader, Input, fmt } from '../ui/index.jsx';

export default function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id;

  const [form, setForm] = useState({
    name: '', barcode: '', subcategoryId: '', supplierId: '',
    costPrice: '', salePrice: '', stock: '', minStock: '',
    expiresAt: '', description: '',
  });

  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers').then((r) => r.data),
  });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        barcode: product.barcode || '',
        subcategoryId: product.subcategoryId,
        supplierId: product.supplierId || '',
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        stock: product.stock,
        minStock: product.minStock,
        expiresAt: product.expiresAt ? product.expiresAt.split('T')[0] : '',
        description: product.description || '',
      });
    }
  }, [product]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data) => isNew
      ? api.post('/products', data).then((r) => r.data)
      : api.put(`/products/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      toast.success(isNew ? 'Producto creado' : 'Producto actualizado');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/stock');
    },
  });

  const { mutate: deleteProduct } = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      toast.success('Producto eliminado');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/stock');
    },
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const margin = form.costPrice && form.salePrice
    ? Math.round(((form.salePrice - form.costPrice) / form.salePrice) * 100) : 0;

  const allSubcategories = categories.flatMap((c) =>
    c.subcategories.map((s) => ({ value: s.id, label: `${c.name} › ${s.name}` }))
  );

  function handleSubmit(e) {
    e.preventDefault();
    save(form);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title={isNew ? 'Nuevo producto' : 'Editar producto'}>
        {!isNew && (
          <button onClick={() => deleteProduct()} className="btn-danger">Eliminar</button>
        )}
        <button onClick={() => navigate('/stock')} className="btn-outline">Cancelar</button>
        <button onClick={handleSubmit} disabled={isPending} className="btn-primary">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-5">
          {/* Info */}
          <div className="card">
            <div className="card-header"><h3 className="card-title">Información del producto</h3></div>
            <div className="p-5 space-y-4">
              <div className="field-group">
                <label className="field-label">Nombre *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="field-input" />
              </div>
              <div className="field-group">
                <label className="field-label">Código de barras</label>
                <input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} className="field-input" placeholder="Escaneá o escribí" />
              </div>
              <div className="field-group">
                <label className="field-label">Categoría / Subcategoría *</label>
                <select value={form.subcategoryId} onChange={(e) => set('subcategoryId', e.target.value)} required className="field-input">
                  <option value="">Seleccionar...</option>
                  {allSubcategories.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Proveedor</label>
                <select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)} className="field-input">
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Fecha de vencimiento (opcional)</label>
                <input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} className="field-input" />
              </div>
              <div className="field-group">
                <label className="field-label">Descripción (opcional)</label>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="field-input resize-none" />
              </div>
            </div>
          </div>

          {/* Precios y stock */}
          <div className="space-y-5">
            <div className="card">
              <div className="card-header"><h3 className="card-title">Precios</h3></div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group">
                    <label className="field-label">Precio de costo *</label>
                    <input type="number" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} required className="field-input" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Precio de venta *</label>
                    <input type="number" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} required className="field-input" />
                  </div>
                </div>
                {form.costPrice && form.salePrice && (
                  <div className={`rounded-lg px-4 py-3 text-sm font-600 ${margin >= 25 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    Margen: {margin}% — Ganás {fmt(form.salePrice - form.costPrice)} por unidad
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3 className="card-title">Stock</h3></div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group">
                    <label className="field-label">Stock actual</label>
                    <input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="field-input" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Stock mínimo</label>
                    <input type="number" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="field-input" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
