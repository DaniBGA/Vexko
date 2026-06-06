// src/components/screens/StockPage.jsx
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Badge, Spinner, EmptyState, fmt } from '../ui/index.jsx';
import { Package } from 'lucide-react';

const PAGE_SIZE = 10;

const PRODUCT_FILTER = [
  { value: '', label: 'Todos' },
  { value: 'added', label: 'Agregados' },
];

function getStockStatus(product) {
  if ((product.stock ?? 0) === 0) return 'OUT';
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
  const [productFilter, setProductFilter] = useState('');
  const [page, setPage] = useState(1);

  const searchTerm = search.trim();

  useEffect(() => {
    setPage(1);
  }, [searchTerm, productFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'stock-view', searchTerm, productFilter, page],
    queryFn: () => api.get('/products', { params: { stockView: 1, added: productFilter === 'added' ? 1 : undefined, search: searchTerm || undefined, page, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  function unitPrice(product) {
    if (product.packPrice && product.packUnits) return Number(product.packPrice) / Number(product.packUnits);
    return product.costPrice ?? 0;
  }

  function Pagination({ currentPage, pages, onChange }) {
    if (pages <= 1) return null;
    return (
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm">
        <span className="text-gray-500">Página {currentPage} de {pages}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onChange(currentPage - 1)}
            className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={currentPage >= pages}
            onClick={() => onChange(currentPage + 1)}
            className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    );
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
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="field-input py-2 text-sm w-40"
        >
          {PRODUCT_FILTER.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button onClick={() => navigate('/catalogo')} className="btn-primary">
          <Plus size={14} className="inline mr-1" />
          Buscar / agregar producto
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Todos los productos</h3>
            <span className="text-xs text-gray-400">{total} productos{productFilter === 'added' ? ' agregados' : ''}</span>
          </div>
          {isLoading ? (
            <Spinner />
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="Sin productos" description="Agregá productos desde el catálogo." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Producto', 'Origen', 'Categoría', 'Proveedor', 'P. Costo', 'P. Venta', 'Modo', 'P. Unidad', 'Stock', 'Mínimo', 'Venc.', 'Estado', ''].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="td font-600 text-brand-sidebar">{p.name}</td>
                        <td className="td text-gray-500">
                          {p.customerId ? <Badge variant="ok">Propio</Badge> : <Badge variant="alert">Global</Badge>}
                        </td>
                        <td className="td text-gray-500">{p.subcategory?.category?.name || '—'}</td>
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
                          {p.kioskInventoryId || p.customerId ? (
                            <button
                              onClick={() => navigate(`/stock/producto/${p.id}`)}
                              className="btn-outline py-1 px-3 text-xs"
                            >
                              Editar
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate(`/stock/nuevo?catalogId=${p.id}`)}
                              className="btn-primary py-1 px-3 text-xs"
                            >
                              Agregar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={page} pages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}