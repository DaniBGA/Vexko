// src/components/screens/StockPage.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Badge, Spinner, EmptyState, fmt } from '../ui/index.jsx';
import { Package } from 'lucide-react';

const STATUS_FILTER = [
  { value: '', label: 'Todos' },
  { value: 'critical', label: '🔴 Críticos' },
];

function stockBadge(product) {
  if (product.stock === 0) return <Badge variant="low">Sin stock</Badge>;
  if (product.stock <= product.minStock) return <Badge variant="low">🔴 Crítico</Badge>;
  if (product.stock <= product.minStock * 1.5) return <Badge variant="alert">⚠ Alerta</Badge>;
  return <Badge variant="ok">✓ OK</Badge>;
}

function expiryLabel(date) {
  if (!date) return '—';
  const d = new Date(date);
  const diff = Math.ceil((d - Date.now()) / 86400000);
  if (diff < 30) return <span className="text-red-600 font-600">{diff}d</span>;
  if (diff < 90) return <span className="text-amber-600 font-600">{Math.ceil(diff / 30)}m</span>;
  return <span className="text-gray-400">{Math.ceil(diff / 30)}m</span>;
}

export default function StockPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, statusFilter],
    queryFn: () => api.get('/products', { params: { search, status: statusFilter } }).then((r) => r.data),
  });

  // Top 3 más vendidos (en demo usamos los primeros 3 con más stock como proxy)
  const globalProducts = products.filter((product) => !product.isCustom);
  const customProducts = products.filter((product) => product.isCustom);
  const top3 = [...globalProducts].sort((a, b) => b.stock - a.stock).slice(0, 3);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Stock de productos">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="field-input input-with-icon py-2 text-sm w-52"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field-input py-2 text-sm w-40"
        >
          {STATUS_FILTER.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button onClick={() => navigate('/stock/nuevo')} className="btn-primary">
          <Plus size={14} className="inline mr-1" />
          Agregar producto
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Top 3 */}
        {!search && (
          <div className="bg-brand-navy rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-700 text-sm">Top 3 más vendidos del mes</h3>
              <span className="text-slate-400 text-xs">No pueden faltar en stock</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {top3.map((p, i) => (
                <div key={p.id} className="bg-white/10 rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-800 text-sm flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' :
                    i === 1 ? 'bg-gray-300 text-gray-700' :
                    'bg-amber-700 text-amber-100'
                  }`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-white text-xs font-600 leading-tight">{p.name}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{p.stock} u. en stock</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="card">
          {isLoading ? (
            <Spinner />
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="No hay productos" description="Creá tu primer producto con el botón +" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Producto', 'Categoría', 'Proveedor', 'P. Costo', 'P. Venta', 'Stock', 'Mínimo', 'Venc.', 'Estado', ''].map((h) => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="td font-600 text-brand-sidebar">{p.name}</td>
                      <td className="td text-gray-500">{p.subcategory?.category?.name}</td>
                      <td className="td text-gray-500">{p.supplier?.name || '—'}</td>
                      <td className="td">{fmt(p.costPrice)}</td>
                      <td className="td font-600">{fmt(p.salePrice)}</td>
                      <td className={`td font-700 ${p.stock <= p.minStock ? 'text-red-600' : 'text-gray-800'}`}>
                        {p.stock}
                      </td>
                      <td className="td text-gray-400">{p.minStock}</td>
                      <td className="td">{expiryLabel(p.expiresAt)}</td>
                      <td className="td">{stockBadge(p)}</td>
                      <td className="td">
                        <button
                          onClick={() => navigate(`/stock/producto/${p.id}`)}
                          className="btn-outline py-1 px-3 text-xs"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Productos propios</h3>
            <span className="text-xs text-gray-400">{customProducts.length} productos</span>
          </div>
          {customProducts.length === 0 ? (
            <EmptyState icon={Package} title="Sin productos propios" description="Los productos creados desde ventas aparecerán acá." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Producto', 'Categoría', 'P. Costo', 'P. Venta', 'Stock', 'Mínimo', ''].map((h) => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="td font-600 text-brand-sidebar">{p.name}</td>
                      <td className="td text-gray-500">{p.subcategory?.category?.name || '—'}</td>
                      <td className="td">{fmt(p.costPrice)}</td>
                      <td className="td font-600">{fmt(p.salePrice)}</td>
                      <td className="td font-700">{p.stock}</td>
                      <td className="td text-gray-400">{p.minStock}</td>
                      <td className="td">
                        <button
                          onClick={() => navigate(`/stock/producto/${p.id}`)}
                          className="btn-outline py-1 px-3 text-xs"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
