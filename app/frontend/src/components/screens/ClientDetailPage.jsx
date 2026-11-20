import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Star, Phone, Gift, HandCoins, Plus, ReceiptText, Ticket } from 'lucide-react';
import { api } from '../../lib/api.js';
import { renderBarcodeDataUrl } from '../../lib/barcodeLabels.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DEBT_STATUS_LABEL = { PENDING: 'Pendiente', PARTIAL: 'Pago parcial', PAID: 'Pagada' };
const DEBT_STATUS_CLASS = {
  PENDING: 'bg-red-50 text-red-600',
  PARTIAL: 'bg-amber-50 text-amber-700',
  PAID: 'bg-green-50 text-green-700',
};

function RedemptionCodeCard({ redemption }) {
  const barcodeUrl = useMemo(() => renderBarcodeDataUrl(redemption.code), [redemption.code]);
  return (
    <div className="rounded-2xl bg-white border-2 border-dashed border-green-300 p-4 flex flex-col sm:flex-row items-center gap-4">
      <img src={barcodeUrl} alt={`Código ${redemption.code}`} className="h-16" />
      <div className="flex-1 text-center sm:text-left">
        <div className="text-2xl font-800 text-brand-sidebar tracking-widest font-mono">{redemption.code}</div>
        <div className="text-xs text-gray-500 mt-1">
          Válido por {redemption.discount}% de descuento — presentalo (o dictalo) en la próxima venta de este cliente.
        </div>
      </div>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openDebtModal, setOpenDebtModal] = useState(false);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [payingDebt, setPayingDebt] = useState(null);
  const [payAmount, setPayAmount] = useState('');

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get(`/clients/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['client', id] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const { mutate: redeem, isPending: isRedeeming } = useMutation({
    mutationFn: () => api.post(`/clients/${id}/redeem`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Puntos canjeados');
      invalidate();
    },
  });

  const { mutate: createDebt, isPending: isCreatingDebt } = useMutation({
    mutationFn: (body) => api.post(`/clients/${id}/debts`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Fiado registrado');
      invalidate();
      setOpenDebtModal(false);
      setDebtAmount('');
      setDebtNote('');
    },
  });

  const { mutate: payDebt, isPending: isPaying } = useMutation({
    mutationFn: ({ debtId, amount }) => api.post(`/clients/${id}/debts/${debtId}/payments`, { amount }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Pago registrado');
      invalidate();
      setPayingDebt(null);
      setPayAmount('');
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <PageHeader title="Cliente" />
        <Spinner />
      </div>
    );
  }

  if (!client) return null;

  const pendingDebts = (client.debts || []).filter((d) => d.status !== 'PAID');
  const pendingRedemptions = (client.redemptions || []).filter((r) => r.status === 'PENDING');

  function handleCreateDebt(e) {
    e.preventDefault();
    const amount = parseFloat(debtAmount);
    if (!amount || amount <= 0) return toast.error('Ingresá un monto válido');
    createDebt({ amount, note: debtNote.trim() || undefined });
  }

  function handlePayDebt(e) {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return toast.error('Ingresá un monto válido');
    payDebt({ debtId: payingDebt.id, amount });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title={client.name}>
        <button onClick={() => navigate('/clientes')} className="btn-outline inline-flex items-center gap-2">
          <ArrowLeft size={14} />
          Volver
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Teléfono</div>
              <div className="text-lg font-800 text-brand-sidebar mt-2 flex items-center gap-2"><Phone size={16} className="text-gray-400" />{client.phone}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Puntos</div>
              <div className="text-2xl font-800 text-brand-sidebar mt-2 flex items-center gap-1">
                <Star size={16} className="text-amber-400 fill-amber-400" />
                {client.points}
              </div>
              {client.loyaltyRule && (
                <div className="text-xs text-gray-500 mt-1">
                  {client.pointsToNextRedemption > 0
                    ? `Faltan ${client.pointsToNextRedemption} pts para el próximo descuento`
                    : '¡Puede canjear descuento!'}
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Total gastado</div>
              <div className="text-2xl font-800 text-brand-sidebar mt-2">{fmt(client.totalSpent)}</div>
            </div>
          </div>
          <div className={`card ${client.debtBalance > 0 ? 'border-2 border-red-200' : ''}`}>
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Debe</div>
              <div className={`text-2xl font-800 mt-2 ${client.debtBalance > 0 ? 'text-red-600' : 'text-green-700'}`}>
                {client.debtBalance > 0 ? fmt(client.debtBalance) : 'Sin deuda'}
              </div>
            </div>
          </div>
        </div>

        {client.loyaltyRule && client.pointsToNextRedemption === 0 && (
          <div className="rounded-2xl bg-brand-greenBg border border-green-200 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Gift size={20} className="text-green-700" />
              <div>
                <div className="text-sm font-700 text-green-800">Puede canjear {client.loyaltyRule.pointsForDiscount} puntos por {client.loyaltyRule.discountPercent}% de descuento</div>
                <div className="text-xs text-green-700">Genera un código para usar en la próxima venta de este cliente</div>
              </div>
            </div>
            <button onClick={() => redeem()} disabled={isRedeeming} className="btn-green px-4 py-2 text-sm disabled:opacity-60">
              {isRedeeming ? 'Generando...' : 'Generar código'}
            </button>
          </div>
        )}

        {pendingRedemptions.length > 0 && (
          <div className="card overflow-hidden">
            <div className="card-header">
              <h3 className="card-title">Códigos de descuento pendientes</h3>
              <Ticket size={18} className="text-brand-green" />
            </div>
            <div className="p-5 space-y-3">
              {pendingRedemptions.map((r) => <RedemptionCodeCard key={r.id} redemption={r} />)}
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Fiado</h3>
            <button onClick={() => setOpenDebtModal(true)} className="btn-primary inline-flex items-center gap-2 text-sm px-3 py-1.5">
              <Plus size={14} />
              Dejar fiado
            </button>
          </div>
          {(client.debts || []).length === 0 ? (
            <EmptyState icon={HandCoins} title="Sin fiados" description="Este cliente no tiene deudas registradas." />
          ) : (
            <div className="divide-y divide-gray-100">
              {client.debts.map((debt) => {
                const pending = debt.amount - debt.paidAmount;
                return (
                  <div key={debt.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-700 text-brand-sidebar">{fmt(debt.amount)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-700 ${DEBT_STATUS_CLASS[debt.status]}`}>
                          {DEBT_STATUS_LABEL[debt.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{formatDate(debt.createdAt)}{debt.note ? ` · ${debt.note}` : ''}</div>
                      {debt.paidAmount > 0 && (
                        <div className="text-xs text-gray-500 mt-1">Pagado {fmt(debt.paidAmount)} de {fmt(debt.amount)}</div>
                      )}
                    </div>
                    {debt.status !== 'PAID' && (
                      <button
                        onClick={() => { setPayingDebt(debt); setPayAmount(pending.toFixed(2)); }}
                        className="btn-outline text-sm px-3 py-1.5"
                      >
                        Registrar pago
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Historial de compras</h3>
          </div>
          {(client.sales || []).length === 0 ? (
            <EmptyState icon={ReceiptText} title="Sin compras" description="Todavía no hay ventas registradas a este cliente." />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Fecha</th>
                  <th className="th">Productos</th>
                  <th className="th">Puntos</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {client.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(sale.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{sale.items.map((i) => i.product?.name).join(', ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">+{sale.pointsEarned}</td>
                    <td className="px-4 py-3 text-sm font-700 text-brand-sidebar text-right">{fmt(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openDebtModal && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="text-sm font-700 text-brand-sidebar">Dejar fiado — {client.name}</div>
              <button type="button" onClick={() => setOpenDebtModal(false)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>
            <form onSubmit={handleCreateDebt} className="p-6 space-y-4">
              <div className="field-group">
                <label className="field-label">Monto que se lleva debiendo *</label>
                <input type="number" min="0" step="0.01" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} className="field-input" autoFocus />
              </div>
              <div className="field-group">
                <label className="field-label">Nota (opcional)</label>
                <input value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="Ej: gaseosa y pan" className="field-input" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpenDebtModal(false)} className="btn-outline">Cancelar</button>
                <button type="submit" disabled={isCreatingDebt} className="btn-primary disabled:opacity-60">
                  {isCreatingDebt ? 'Guardando...' : 'Registrar fiado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payingDebt && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="text-sm font-700 text-brand-sidebar">Registrar pago</div>
              <button type="button" onClick={() => setPayingDebt(null)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>
            <form onSubmit={handlePayDebt} className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-gray-600">
                Deuda de {fmt(payingDebt.amount)}{payingDebt.paidAmount > 0 ? ` (ya pagó ${fmt(payingDebt.paidAmount)})` : ''} — pendiente {fmt(payingDebt.amount - payingDebt.paidAmount)}
              </div>
              <div className="field-group">
                <label className="field-label">Monto que paga ahora *</label>
                <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="field-input" autoFocus />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPayingDebt(null)} className="btn-outline">Cancelar</button>
                <button type="submit" disabled={isPaying} className="btn-primary disabled:opacity-60">
                  {isPaying ? 'Guardando...' : 'Registrar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
