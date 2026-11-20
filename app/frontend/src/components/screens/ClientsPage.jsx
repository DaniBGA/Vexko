import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Phone, Star, ArrowRight, AlertCircle, Settings, Gift } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useDebouncedValue } from '../../lib/hooks.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';

const EMPTY_FORM = { name: '', phone: '' };

function LoyaltyRuleModal({ rule, onClose }) {
  const queryClient = useQueryClient();
  const [amountPerPoint, setAmountPerPoint] = useState(rule ? String(rule.amountPerPoint) : '100');
  const [pointsForDiscount, setPointsForDiscount] = useState(rule ? String(rule.pointsForDiscount) : '10');
  const [discountPercent, setDiscountPercent] = useState(rule ? String(rule.discountPercent) : '10');

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.put('/clients/loyalty/rules', {
      amountPerPoint: parseFloat(amountPerPoint),
      pointsForDiscount: parseInt(pointsForDiscount, 10),
      discountPercent: parseFloat(discountPercent),
    }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Sistema de puntos actualizado');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(amountPerPoint);
    const points = parseInt(pointsForDiscount, 10);
    const percent = parseFloat(discountPercent);
    if (!amount || amount <= 0) return toast.error('Ingresá cuántos pesos gastados equivalen a 1 punto');
    if (!points || points <= 0) return toast.error('Ingresá cuántos puntos hacen falta para el descuento');
    if (!percent || percent <= 0 || percent > 100) return toast.error('El porcentaje de descuento tiene que estar entre 1 y 100');
    save();
  }

  const previewAmount = parseFloat(amountPerPoint) || 0;
  const previewPoints = parseInt(pointsForDiscount, 10) || 0;
  const previewPercent = parseFloat(discountPercent) || 0;
  const canPreview = previewAmount > 0 && previewPoints > 0 && previewPercent > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-sm font-700 text-brand-sidebar">Configurar sistema de puntos</div>
            <div className="text-xs text-gray-400 mt-0.5">Se aplica a todos los clientes de este local</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <span className="text-3xl leading-none font-700">×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="field-group">
            <label className="field-label">Pesos gastados por cada punto</label>
            <input type="number" min="1" step="1" value={amountPerPoint} onChange={(e) => setAmountPerPoint(e.target.value)} className="field-input" autoFocus />
          </div>
          <div className="field-group">
            <label className="field-label">Puntos necesarios para el descuento</label>
            <input type="number" min="1" step="1" value={pointsForDiscount} onChange={(e) => setPointsForDiscount(e.target.value)} className="field-input" />
          </div>
          <div className="field-group">
            <label className="field-label">Porcentaje de descuento al canjear</label>
            <div className="relative">
              <input type="number" min="1" max="100" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className="field-input pr-9" />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-700">%</span>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-greenBg border border-green-200 p-4 text-sm text-green-800">
            {canPreview ? (
              <>
                Tus clientes van a sumar <span className="font-800">1 punto</span> cada <span className="font-800">{fmt(previewAmount)}</span> que gasten.
                {' '}Al juntar <span className="font-800">{previewPoints} puntos</span>, van a poder canjearlos por un <span className="font-800">{previewPercent}%</span> de descuento en su compra.
              </>
            ) : (
              'Completá los tres valores para ver cómo va a funcionar el sistema de puntos.'
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-60">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [openLoyaltyRule, setOpenLoyaltyRule] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const searchTerm = useDebouncedValue(search.trim(), 300);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', searchTerm],
    queryFn: () => api.get('/clients', { params: { search: searchTerm || undefined } }).then((r) => r.data),
  });
  const clients = data?.clients || [];
  const loyaltyRule = data?.loyaltyRule || null;

  const { mutate: createClient, isPending } = useMutation({
    mutationFn: (body) => api.post('/clients', body).then((r) => r.data),
    onSuccess: (client) => {
      toast.success('Cliente creado');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setForm(EMPTY_FORM);
      setOpenCreate(false);
      navigate(`/clientes/${client.id}`);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Completá el nombre');
    if (!form.phone.trim()) return toast.error('Completá el teléfono');
    createClient({ name: form.name.trim(), phone: form.phone.trim() });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Clientes / puntos">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="field-input input-with-icon py-2 text-sm w-64"
          />
        </div>
        <button onClick={() => setOpenCreate(true)} className="btn-primary inline-flex items-center gap-2">
          <Plus size={14} />
          Nuevo cliente
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Sistema de puntos</h3>
            <button onClick={() => setOpenLoyaltyRule(true)} className="btn-outline text-sm px-3 py-1.5 inline-flex items-center gap-2">
              <Settings size={14} />
              {loyaltyRule ? 'Editar' : 'Configurar'}
            </button>
          </div>
          <div className="p-5">
            {loyaltyRule ? (
              <div className="rounded-2xl bg-brand-greenBg border border-green-200 p-4 flex items-start gap-3">
                <Gift size={18} className="text-green-700 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-800">
                  Tus clientes suman <span className="font-800">1 punto</span> cada <span className="font-800">{fmt(loyaltyRule.amountPerPoint)}</span> que gastan.
                  {' '}Al juntar <span className="font-800">{loyaltyRule.pointsForDiscount} puntos</span>, pueden canjearlos por un <span className="font-800">{loyaltyRule.discountPercent}%</span> de descuento.
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-500">
                Todavía no configuraste el sistema de puntos — tus clientes no van a sumar puntos hasta que lo actives.
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Lista de clientes</h3>
            <span className="text-xs text-gray-400">{searchTerm ? `Filtrando por “${searchTerm}”` : `${clients.length} clientes`}</span>
          </div>
          {isLoading ? (
            <Spinner />
          ) : clients.length === 0 ? (
            <EmptyState icon={Star} title="No hay clientes" description="Creá tu primer cliente para empezar a sumar puntos y fiado." />
          ) : (
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => navigate(`/clientes/${client.id}`)}
                  className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-green transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-lg font-800 text-brand-sidebar">{client.name}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <Phone size={12} />
                        {client.phone}
                      </div>
                    </div>
                    {client.debtBalance > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-700 text-red-600">
                        <AlertCircle size={12} />
                        Debe {fmt(client.debtBalance)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Puntos</div>
                      <div className="text-xl font-800 text-brand-sidebar mt-1 flex items-center gap-1">
                        <Star size={14} className="text-amber-400 fill-amber-400" />
                        {client.points}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Total gastado</div>
                      <div className="text-xl font-800 text-brand-sidebar mt-1">{fmt(client.totalSpent)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm font-700 text-brand-sidebar">
                    Ver detalle
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
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="text-sm font-700 text-brand-sidebar">Nuevo cliente</div>
              <button type="button" onClick={() => setOpenCreate(false)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="field-group">
                <label className="field-label">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="field-input" autoFocus />
              </div>
              <div className="field-group">
                <label className="field-label">Teléfono *</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="field-input" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpenCreate(false)} className="btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-60">
                  {isPending ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openLoyaltyRule && <LoyaltyRuleModal rule={loyaltyRule} onClose={() => setOpenLoyaltyRule(false)} />}
    </div>
  );
}
