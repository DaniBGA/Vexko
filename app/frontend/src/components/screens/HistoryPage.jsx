// src/components/screens/HistoryPage.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, fmt } from '../ui/index.jsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CircleDollarSign, Landmark, CreditCard, Repeat2 } from 'lucide-react';

const PERIODS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week',  label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

export default function HistoryPage() {
  const [period, setPeriod] = useState('today');
  const { data, isLoading } = useQuery({
    queryKey: ['sales', period],
    queryFn: () => api.get('/sales', { params: { period } }).then((r) => r.data),
  });
  const sales = data?.sales || [];
  const totalRevenue = sales.reduce((s, sale) => s + parseFloat(sale.total), 0);

  const paymentMeta = {
    CASH: { label: 'Efectivo', Icon: CircleDollarSign },
    TRANSFER: { label: 'Transferencia', Icon: Landmark },
    CARD: { label: 'Tarjeta', Icon: CreditCard },
    MIXED: { label: 'Mixto', Icon: Repeat2 },
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Historial de ventas">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-600 transition-all ${period === p.value ? 'bg-white shadow text-brand-navy' : 'text-gray-500'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{sales.length} ventas</h3>
            <span className="text-sm font-700 text-brand-green">{fmt(totalRevenue)}</span>
          </div>
          {isLoading ? <Spinner /> : (
            <table className="w-full">
              <thead><tr>
                <th className="th">Hora/Fecha</th>
                <th className="th">Productos</th>
                <th className="th">Pago</th>
                <th className="th">Cliente</th>
                <th className="th">Total</th>
              </tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="td text-gray-400 whitespace-nowrap">
                      {format(new Date(s.createdAt), 'HH:mm · dd/MM', { locale: es })}
                    </td>
                    <td className="td text-sm">
                      {s.items.map((i) => i.product.name).join(' + ')}
                    </td>
                    <td className="td text-xs text-gray-400">
                      {(() => {
                        const meta = paymentMeta[s.paymentMethod] || paymentMeta.MIXED;
                        const Icon = meta.Icon;
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Icon size={14} />
                            {meta.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="td text-sm text-gray-400">{s.client?.name || '—'}</td>
                    <td className="td font-700">{fmt(s.total)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={5} className="td text-center text-gray-300 py-8">Sin ventas en este período</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
