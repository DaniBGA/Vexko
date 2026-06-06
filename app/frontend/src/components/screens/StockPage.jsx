// src/components/screens/StockPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Badge, Spinner, EmptyState, fmt } from '../ui/index.jsx';
import { Package } from 'lucide-react';

const PAGE_SIZE = 10;

const STATUS_FILTER = [
  { value: '', label: 'Todos' },
  { value: 'critical', label: '🔴 Críticos' },
];

function getStockStatus(product) {
  if (product.stock === 0) return 'OUT';
  if (product.stock <= product.minStock) return 'CRITICAL';
  if (product.stock <= product.minStock * 1.5) return 'ALERT';
  return 'OK';
}

function stockBadge(product) {
  const status = getStockStatus(product);
  if (status === 'OUT') return <Badge variant="low">Sin stock</Badge>;
  if (status === 'CRITICAL') return <Badge variant="low">🔴 Crítico</Badge>;
  if (status === 'ALERT') return <Badge variant="alert">⚠ Alerta</Badge>;
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
  const [globalPage, setGlobalPage] = useState(1);
  const [customPage, setCustomPage] = useState(1);

  const searchTerm = search.trim();

  useEffect(() => {
    setGlobalPage(1);
    setCustomPage(1);
  }, [searchTerm, statusFilter]);

  const globalQuery = useQuery({
    queryKey: ['products', 'global', searchTerm, statusFilter, globalPage],
    queryFn: () => api.get('/products', { params: { search: searchTerm || undefined, status: statusFilter || undefined, isCustom: false, page: globalPage, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  const customQuery = useQuery({
    queryKey: ['products', 'custom', searchTerm, statusFilter, customPage],
    queryFn: () => api.get('/products', { params: { search: searchTerm || undefined, status: statusFilter || undefined, isCustom: true, page: customPage, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  // Top 3 más vendidos (en demo usamos los primeros 3 con más stock como proxy)
  const globalProducts = globalQuery.data?.products ?? [];
  const customProducts = customQuery.data?.products ?? [];
  const globalTotal = globalQuery.data?.total ?? 0;
  const customTotal = customQuery.data?.total ?? 0;
  const globalTotalPages = globalQuery.data?.totalPages ?? 0;
  const customTotalPages = customQuery.data?.totalPages ?? 0;
  const isLoading = globalQuery.isLoading || customQuery.isLoading;
  const top3 = useMemo(() => [...globalProducts].sort((a, b) => b.stock - a.stock).slice(0, 3), [globalProducts]);

  function unitPrice(product) {
    if (product.packPrice && product.packUnits) return Number(product.packPrice) / Number(product.packUnits);
    return product.costPrice ?? 0;
  }

  function Pagination({ page, totalPages, onChange }) {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm">
        <span className="text-gray-500">Página {page} de {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
            className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    );
  }

  function renderRows(rows) {
    if (statusFilter === 'critical') {
      return rows.filter((product) => getStockStatus(product) === 'CRITICAL' || getStockStatus(product) === 'OUT');
    }
    return rows;
  }

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
          Buscar / agregar producto
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Top 3 */}
        {!searchTerm && globalProducts.length > 0 && (
          <div className="bg-brand-navy rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-700 text-sm">Top 3 de esta página</h3>
              <span className="text-slate-400 text-xs">Ordenado por stock dentro de los 10 visibles</span>
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
          <div className="card-header">
            <h3 className="card-title">Productos globales</h3>
            <span className="text-xs text-gray-400">{globalTotal} productos</span>
          </div>
          {globalQuery.isLoading ? (
            <Spinner />
          ) : globalProducts.length === 0 ? (
            <EmptyState icon={Package} title="No hay productos" description="Creá tu primer producto con el botón +" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Producto', 'Categoría', 'Proveedor', 'P. Costo', 'P. Venta', 'Modo', 'P. Unidad', 'Stock', 'Mínimo', 'Venc.', 'Estado', ''].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderRows(globalProducts).map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td font-600 text-brand-sidebar">{p.name}</td>
                        <td className="td text-gray-500">{p.subcategory?.category?.name}</td>
                        <td className="td text-gray-500">{p.supplier?.name || '—'}</td>
                        <td className="td">{fmt(p.costPrice)}</td>
                        <td className="td font-600">{fmt(p.salePrice)}</td>
                        <td className="td text-gray-500">{p.loadMode === 'unit' ? 'Por unidad' : 'Por pack'}</td>
                        <td className="td">{fmt(unitPrice(p))}</td>
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
              <Pagination page={globalPage} totalPages={globalTotalPages} onChange={setGlobalPage} />
            </>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Productos propios</h3>
            <span className="text-xs text-gray-400">{customTotal} productos</span>
          </div>
          {customQuery.isLoading ? (
            <Spinner />
          ) : customProducts.length === 0 ? (
            <EmptyState icon={Package} title="Sin productos propios" description="Los productos creados desde ventas aparecerán acá." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Producto', 'Categoría', 'P. Costo', 'P. Venta', 'Modo', 'P. Unidad', 'Stock', 'Mínimo', ''].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderRows(customProducts).map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td font-600 text-brand-sidebar">{p.name}</td>
                        <td className="td text-gray-500">{p.subcategory?.category?.name || '—'}</td>
                        <td className="td">{fmt(p.costPrice)}</td>
                        <td className="td font-600">{fmt(p.salePrice)}</td>
                        <td className="td text-gray-500">{p.loadMode === 'unit' ? 'Por unidad' : 'Por pack'}</td>
                        <td className="td">{fmt(unitPrice(p))}</td>
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
              <Pagination page={customPage} totalPages={customTotalPages} onChange={setCustomPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
