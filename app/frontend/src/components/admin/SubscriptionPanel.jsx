// src/components/admin/SubscriptionPanel.jsx
// Gestión de la suscripción mensual de un cliente desde el panel admin:
// estado, registrar pagos, historial y marcarlo como exento.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarCheck, Trash2 } from 'lucide-react';
import { adminApi } from '../../lib/adminApi.js';
import { fmt } from '../ui/index.jsx';
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_STYLES,
  daysLeftLabel,
  formatArDate,
  todayArInput,
} from '../../lib/subscription.js';
import { useAdminSettings } from './SettingsPanel.jsx';

const NAVY = '#1c2050';
const GREEN = '#4caf82';

export function SubscriptionBadge({ subscription }) {
  if (!subscription) return null;
  const label = subscription.status === 'WARNING'
    ? `${SUBSCRIPTION_STATUS_LABELS.WARNING} · ${subscription.daysLeft} d`
    : SUBSCRIPTION_STATUS_LABELS[subscription.status];
  return (
    <span
      className="text-[10px] font-800 uppercase tracking-wide rounded-full px-2 py-0.5"
      style={SUBSCRIPTION_STATUS_STYLES[subscription.status]}
    >
      {label}
    </span>
  );
}

function statusDescription(subscription) {
  switch (subscription.status) {
    case 'ACTIVE':
      return `Al día. La cuota vence el ${formatArDate(subscription.dueDate)} (faltan ${subscription.daysUntilDue} días).`;
    case 'WARNING':
      return `La cuota venció el ${formatArDate(subscription.dueDate)}. ${daysLeftLabel(subscription.daysLeft)} de gracia: si no paga, se inhabilita el ${formatArDate(subscription.blockDate)}. Las sucursales ven un aviso cada vez que abren la app.`;
    case 'BLOCKED':
      return `Inhabilitado desde el ${formatArDate(subscription.blockDate)}. Sus sucursales no pueden usar el sistema hasta que se registre un pago.`;
    case 'EXEMPT':
      return 'Exento: no se le cobra la suscripción, nunca se avisa ni se inhabilita.';
    default:
      return '';
  }
}

export default function SubscriptionPanel({ customer }) {
  const queryClient = useQueryClient();
  const subscription = customer.subscription;
  const payments = customer.subscriptionPayments || [];
  const [paidAt, setPaidAt] = useState(todayArInput());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // El monto arranca con el precio del plan del cliente (Configuración),
  // editable por si pagó otro importe (promo, ajuste, etc.).
  const { data: settings } = useAdminSettings();
  const planPrice = settings?.planPrices?.[customer.plan] ?? null;
  const planPriceInput = planPrice === null ? '' : String(planPrice);
  useEffect(() => {
    setAmount((current) => (current === '' ? planPriceInput : current));
  }, [planPriceInput]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });

  const registerPayment = useMutation({
    mutationFn: (body) => adminApi.post(`/admin/customers/${customer.id}/payments`, body).then((r) => r.data),
    onSuccess: (data) => {
      const next = data.customer.subscription;
      toast.success(next.status === 'ACTIVE'
        ? `Pago registrado. Próximo vencimiento: ${formatArDate(next.dueDate)}`
        : 'Pago registrado');
      setAmount(planPriceInput);
      setNote('');
      setPaidAt(todayArInput());
      invalidate();
    },
  });

  const deletePayment = useMutation({
    mutationFn: (paymentId) => adminApi.delete(`/admin/customers/${customer.id}/payments/${paymentId}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Pago borrado');
      invalidate();
    },
  });

  const toggleExempt = useMutation({
    mutationFn: (subscriptionExempt) => adminApi.patch(`/admin/customers/${customer.id}`, { subscriptionExempt }).then((r) => r.data),
    onSuccess: (_, subscriptionExempt) => {
      toast.success(subscriptionExempt ? 'Marcado como exento' : 'Vuelve a cobrarse la suscripción');
      invalidate();
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!paidAt) return toast.error('Elegí la fecha del pago');
    if (paidAt > todayArInput()) return toast.error('La fecha de pago no puede ser futura');
    registerPayment.mutate({ paidAt, amount: amount === '' ? undefined : Number(amount), note: note.trim() || undefined });
  }

  function handleDelete(payment) {
    if (!window.confirm(`¿Borrar el pago del ${formatArDate(payment.paidAt)}? El vencimiento se va a recalcular con el pago anterior.`)) return;
    deletePayment.mutate(payment.id);
  }

  return (
    <div className="px-4 py-4 bg-white border-t border-slate-200 space-y-4">
      <div className="rounded-xl border p-3 text-sm" style={{ ...SUBSCRIPTION_STATUS_STYLES[subscription.status], borderColor: 'transparent' }}>
        <div className="font-800 mb-0.5">Suscripción: {SUBSCRIPTION_STATUS_LABELS[subscription.status]}</div>
        <div>{statusDescription(subscription)}</div>
      </div>

      <div className="text-xs text-gray-500">
        {subscription.lastPaymentAt
          ? <>Último pago: <strong className="text-gray-800">{formatArDate(subscription.lastPaymentAt)}</strong></>
          : <>Sin pagos registrados: el ciclo cuenta desde el <strong className="text-gray-800">{formatArDate(subscription.anchorAt)}</strong> (alta de la suscripción).</>}
      </div>

      {!subscription.exempt && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="font-800 text-sm text-gray-900 flex items-center gap-2">
            <CalendarCheck size={16} style={{ color: GREEN }} /> Registrar pago de la cuota
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="field-group">
              <label className="field-label">Fecha del pago</label>
              <input type="date" value={paidAt} max={todayArInput()} onChange={(e) => setPaidAt(e.target.value)} className="field-input" />
            </div>
            <div className="field-group">
              <label className="field-label">{planPrice !== null ? 'Monto (precio del plan)' : 'Monto (opcional)'}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="field-input" placeholder="$" />
            </div>
            <div className="field-group">
              <label className="field-label">Nota (opcional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input" placeholder="Ej: transferencia" />
            </div>
          </div>
          <p className="text-xs text-gray-500">El próximo vencimiento queda un mes después de la fecha del pago.</p>
          <button
            type="submit"
            disabled={registerPayment.isPending}
            className="rounded-xl text-white font-800 text-sm px-4 py-2.5 disabled:opacity-60"
            style={{ background: GREEN }}
          >
            {registerPayment.isPending ? 'Guardando...' : 'Registrar pago'}
          </button>
        </form>
      )}

      <div>
        <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700 mb-2">Pagos registrados</div>
        {payments.length === 0 ? (
          <div className="text-sm text-gray-500">Todavía no hay pagos registrados.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {payments.map((payment) => (
              <div key={payment.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-700 text-gray-900">{formatArDate(payment.paidAt)}</span>
                  {payment.amount != null && <span className="text-gray-600"> · {fmt(payment.amount)}</span>}
                  {payment.note && <span className="text-gray-400"> · {payment.note}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(payment)}
                  disabled={deletePayment.isPending}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-60"
                  title="Borrar pago (cargado por error)"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={subscription.exempt}
          disabled={toggleExempt.isPending}
          onChange={(e) => toggleExempt.mutate(e.target.checked)}
          className="mt-0.5 w-4 h-4"
        />
        <span>
          <span className="font-700" style={{ color: NAVY }}>No cobrarle la suscripción (exento)</span>
          <span className="block text-xs text-gray-500">Para cuentas de prueba o internas: nunca ven el aviso ni se inhabilitan.</span>
        </span>
      </label>
    </div>
  );
}
