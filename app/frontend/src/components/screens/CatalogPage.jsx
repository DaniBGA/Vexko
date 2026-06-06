import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, PackagePlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';

const PAGE_SIZE = 12;

export default function CatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const incomingSearch = params.get('search');
    if (incomingSearch !== null) {
      setSearch(incomingSearch);
    }
  }, [location.search]);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', search, page],
    queryFn: () => api.get('/products', { params: { global: 1, search: search || undefined, page, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 0;

  function unitPrice(p) {
    if (p.packPrice && p.packUnits) return Number(p.packPrice) / Number(p.packUnits);
    return p.costPrice ?? 0;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Catálogo global">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en catálogo..." className="field-input input-with-icon py-2 text-sm w-64" />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? <Spinner /> : products.length === 0 ? (
          <div className="space-y-4">
            <EmptyState icon={PackagePlus} title="No hay resultados" description="Probá otra búsqueda" />
            {search.trim().length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => navigate(`/stock/nuevo?custom=1&name=${encodeURIComponent(search)}`)} className="btn-primary">
                  <PackagePlus size={14} className="inline mr-2" />
                  Crear producto propio
                </button>
                <button onClick={() => navigate('/stock/nuevo')} className="btn-outline">Crear producto vacío</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-4">
              {products.map((p) => (
                <div key={p.id} className="p-4 bg-white rounded-lg shadow-sm">
                  <div className="font-600 mb-2">{p.name}</div>
                  <div className="text-xs text-gray-500 mb-2">{p.subcategory?.category?.name}</div>
                  <div className="text-sm font-700 mb-2">{fmt(p.salePrice)}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/stock/nuevo?catalogId=${p.id}`)} className="btn-primary px-3 py-1 text-sm">Agregar al kiosco</button>
                    <button onClick={() => navigate(`/stock/producto/${p.id}`)} className="btn-outline px-3 py-1 text-sm">Ver</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-500">Página {page} de {totalPages}</div>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-outline px-3 py-1 text-sm">Anterior</button>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-outline px-3 py-1 text-sm">Siguiente</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
