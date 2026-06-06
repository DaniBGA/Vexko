import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Phone, Mail, MapPin, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, EmptyState } from '../ui/index.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EMPTY_FORM = { name: '', phone: '', email: '', address: '' };

export default function SuppliersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const searchTerm = search.trim();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', searchTerm],
    queryFn: () => api.get('/suppliers', { params: { search: searchTerm || undefined } }).then((r) => r.data),
  });

  const { mutate: createSupplier, isPending } = useMutation({
    mutationFn: (body) => api.post('/suppliers', body).then((r) => r.data),
    onSuccess: (supplier) => {
      toast.success('Proveedor creado');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setForm(EMPTY_FORM);
      setOpenCreate(false);
      navigate(`/proveedores/${supplier.id}`);
    },
  });

  const stats = useMemo(() => {
    const total = suppliers.length;
    const todayOrders = suppliers.filter((supplier) => supplier.lastOrderToday).length;
    const totalOrders = suppliers.reduce((sum, supplier) => sum + (supplier._count?.purchases || 0), 0);
    return { total, todayOrders, totalOrders };
  }, [suppliers]);

  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Completá el nombre del proveedor');
      return;
    }
    createSupplier(form);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Proveedores">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor..."
            className="field-input input-with-icon py-2 text-sm w-64"
          />
        </div>
        <button onClick={() => setOpenCreate(true)} className="btn-primary inline-flex items-center gap-2">
          <Plus size={14} />
          Nuevo proveedor
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Proveedores del local</div>
              <div className="text-3xl font-800 text-brand-sidebar mt-2">{stats.total}</div>
              <div className="text-sm text-gray-500 mt-1">Todos quedan asociados a este kiosco</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Pedidos de hoy</div>
              <div className="text-3xl font-800 text-brand-sidebar mt-2">{stats.todayOrders}</div>
              <div className="text-sm text-gray-500 mt-1">Solo muestra aviso si el último pedido fue hoy</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Pedidos cargados</div>
              <div className="text-3xl font-800 text-brand-sidebar mt-2">{stats.totalOrders}</div>
              <div className="text-sm text-gray-500 mt-1">Pedidos guardados entre todos los proveedores</div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Lista de proveedores</h3>
            <span className="text-xs text-gray-400">{searchTerm ? `Filtrando por “${searchTerm}”` : 'Vista local del kiosco'}</span>
          </div>
          {isLoading ? (
            <Spinner />
          ) : suppliers.length === 0 ? (
            <EmptyState icon={MapPin} title="No hay proveedores" description="Creá tu primer proveedor del local para empezar a pedir mercadería." />
          ) : (
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => navigate(`/proveedores/${supplier.id}`)}
                  className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-green transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-lg font-800 text-brand-sidebar">{supplier.name}</div>
                      <div className="text-xs text-gray-400 mt-1">Proveedor propio del local</div>
                    </div>
                    {supplier.lastOrderToday && (
                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-700 text-green-700">Pedido hoy</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" />{supplier.phone || 'Sin teléfono'}</div>
                    <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400" />{supplier.email || 'Sin email'}</div>
                    <div className="flex items-center gap-2 sm:col-span-2"><MapPin size={14} className="text-gray-400" />{supplier.address || 'Sin dirección'}</div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Último pedido</div>
                      <div className="text-sm font-700 text-brand-sidebar mt-1">
                        {supplier.lastOrderAt ? formatDate(supplier.lastOrderAt) : 'Sin pedidos todavía'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Pedidos</div>
                      <div className="text-sm font-800 text-brand-sidebar mt-1">{supplier._count?.purchases || 0}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm font-700 text-brand-sidebar">
                    Ver detalle y pedidos
                    <ArrowRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {openCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-sm font-700 text-brand-sidebar">Nuevo proveedor</div>
                <div className="text-xs text-gray-400">Queda asociado a este local, no como proveedor global.</div>
              </div>
              <button type="button" onClick={() => setOpenCreate(false)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="field-group">
                  <label className="field-label">Nombre *</label>
                  <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label">Teléfono</label>
                  <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input value={form.email} onChange={(e) => handleChange('email', e.target.value)} className="field-input" />
                </div>
                <div className="field-group md:col-span-2">
                  <label className="field-label">Dirección</label>
                  <input value={form.address} onChange={(e) => handleChange('address', e.target.value)} className="field-input" />
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
                Los pedidos que cargues desde este proveedor se van a registrar con estado pendiente hasta que marques <span className="font-700 text-brand-sidebar">pedido recibido</span>.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpenCreate(false)} className="btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-60">
                  {isPending ? 'Guardando...' : 'Guardar proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
