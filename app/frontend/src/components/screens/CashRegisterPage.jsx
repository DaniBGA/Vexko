import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Clock3, CircleCheckBig, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CashRegisterPage() {
  const queryClient = useQueryClient();
  const [openingAmount, setOpeningAmount] = useState('10000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyLimit = 8;

  const { data: currentRegister, isLoading: loadingCurrent } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: () => api.get('/cash-registers/current').then((r) => r.data),
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['cash-register-history', historyPage],
    queryFn: () => api.get('/cash-registers', { params: { page: historyPage, limit: historyLimit } }).then((r) => r.data),
  });

  const { mutate: openRegister, isPending: isOpening } = useMutation({
    mutationFn: (body) => api.post('/cash-registers/open', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Caja abierta');
      setOpeningNotes('');
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    },
  });

  const { mutate: closeRegister, isPending: isClosing } = useMutation({
    mutationFn: ({ id, body }) => api.post(`/cash-registers/${id}/close`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Caja cerrada');
      setClosingAmount('');
      setClosingNotes('');
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    },
  });

  const historyRegisters = historyData?.registers ?? [];
  const totalHistoryPages = historyData?.totalPages ?? 0;
  const displayRegister = currentRegister || {
    openingAmount: 0,
    cashSales: 0,
    transferSales: 0,
    cardSales: 0,
    expensesTotal: 0,
    expectedCashBeforeClose: 0,
  };

  function handleOpen(e) {
    e.preventDefault();
    openRegister({ openingAmount: Number(openingAmount || 0), notes: openingNotes });
  }

  function handleClose(e) {
    e.preventDefault();
    if (!currentRegister) return;
    closeRegister({
      id: currentRegister.id,
      body: {
        actualAmount: Number(closingAmount || 0),
        notes: closingNotes,
      },
    });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Caja" />

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Estado actual</div>
              <div className="text-3xl font-800 text-brand-sidebar mt-2">
                {currentRegister ? 'Abierta' : 'Cerrada'}
              </div>
              <div className="text-sm text-gray-500 mt-1">La caja se abre y cierra desde esta pantalla</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Apertura</div>
              <div className="text-3xl font-800 text-brand-sidebar mt-2">{fmt(displayRegister.openingAmount)}</div>
              <div className="text-sm text-gray-500 mt-1">Monto inicial del turno</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div className="space-y-6">
            <div className="card overflow-hidden">
              <div className="card-header">
                <h3 className="card-title">Caja activa</h3>
                <span className="text-xs text-gray-400">{currentRegister ? `Abierta desde ${formatDateTime(currentRegister.openedAt)}` : 'Sin caja abierta'}</span>
              </div>

              {loadingCurrent ? (
                <Spinner />
              ) : currentRegister ? (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Apertura</div>
                      <div className="text-lg font-800 text-brand-sidebar mt-2">{fmt(currentRegister.openingAmount)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Inicio</div>
                      <div className="text-lg font-800 text-brand-sidebar mt-2">{formatDateTime(currentRegister.openedAt)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-white border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Efectivo en ventas</div>
                      <div className="text-2xl font-800 text-brand-sidebar mt-2">{fmt(displayRegister.cashSales)}</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Transferencias</div>
                      <div className="text-2xl font-800 text-brand-sidebar mt-2">{fmt(displayRegister.transferSales)}</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Tarjetas</div>
                      <div className="text-2xl font-800 text-brand-sidebar mt-2">{fmt(displayRegister.cardSales)}</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Gastos del turno</div>
                      <div className="text-2xl font-800 text-red-600 mt-2">{fmt(displayRegister.expensesTotal)}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-brand-navy text-white p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.08em] text-slate-300 font-700">Efectivo esperado antes del cierre</div>
                      <div className="text-2xl font-800 mt-1">{fmt(displayRegister.expectedCashBeforeClose)}</div>
                    </div>
                    <div className="text-right text-xs text-slate-300 max-w-40">Incluye apertura + efectivo vendido - egresos del turno</div>
                  </div>

                  <div className="rounded-2xl bg-brand-navy text-white p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.08em] text-slate-300 font-700">Preparada para cierre</div>
                      <div className="text-2xl font-800 mt-1">Cierre de caja</div>
                    </div>
                    <Wallet size={34} className="text-brand-green" />
                  </div>

                  <form onSubmit={handleClose} className="space-y-4">
                    <div className="field-group">
                      <label className="field-label">Efectivo contado</label>
                      <input type="number" min="0" step="0.01" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} className="field-input" placeholder="Ej: 39000" />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Notas del cierre</label>
                      <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} rows={3} className="field-input resize-none" placeholder="Diferencia, observaciones, faltantes..." />
                    </div>
                    <button type="submit" disabled={isClosing || !closingAmount} className="btn-primary w-full disabled:opacity-60">
                      {isClosing ? 'Cerrando...' : 'Cerrar caja'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
                    Abrí la caja para registrar el efectivo inicial del turno. Después vas a poder cerrarla con el efectivo contado.
                  </div>
                  <form onSubmit={handleOpen} className="space-y-4">
                    <div className="field-group">
                      <label className="field-label">Monto de apertura</label>
                      <input type="number" min="0" step="0.01" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} className="field-input" />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Notas opcionales</label>
                      <textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={3} className="field-input resize-none" placeholder="Cambio inicial, observaciones..." />
                    </div>
                    <button type="submit" disabled={isOpening} className="btn-primary w-full disabled:opacity-60">
                      {isOpening ? 'Abriendo...' : 'Abrir caja'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="card-header">
                <h3 className="card-title">Historial de cierres</h3>
                <span className="text-xs text-gray-400">Paginado por registros</span>
              </div>

              {loadingHistory ? (
                <Spinner />
              ) : historyRegisters.length === 0 ? (
                <EmptyState icon={ArrowDownToLine} title="Sin historial" description="Cuando cierres la caja aparecerán acá los registros." />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          {['Apertura', 'Cierre', 'Efectivo esperado', 'Contado', 'Dif.', 'Estado'].map((header) => <th key={header} className="th">{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {historyRegisters.map((register) => (
                          <tr key={register.id} className="hover:bg-gray-50 transition-colors">
                            <td className="td text-gray-500">{formatDateTime(register.openedAt)}</td>
                            <td className="td text-gray-500">{formatDateTime(register.closedAt)}</td>
                            <td className="td font-700">{register.expectedCashBeforeClose != null ? fmt(register.expectedCashBeforeClose) : '—'}</td>
                            <td className="td font-700">{register.actualAmount != null ? fmt(register.actualAmount) : '—'}</td>
                            <td className="td font-700">{register.difference != null ? fmt(register.difference) : '—'}</td>
                            <td className="td">
                              {register.status === 'OPEN' ? (
                                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-700 text-amber-700 inline-flex items-center gap-1"><Clock3 size={12} />Abierta</span>
                              ) : (
                                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-700 text-green-700 inline-flex items-center gap-1"><CircleCheckBig size={12} />Cerrada</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalHistoryPages > 1 && (
                    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm">
                      <span className="text-gray-500">Página {historyPage} de {totalHistoryPages}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={historyPage <= 1}
                          onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                          className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <ChevronLeft size={14} />
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={historyPage >= totalHistoryPages}
                          onClick={() => setHistoryPage((current) => Math.min(totalHistoryPages, current + 1))}
                          className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          Siguiente
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Resumen visual</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Estado</div>
                  <div className="text-xl font-800 text-brand-sidebar mt-2">{currentRegister ? 'Caja abierta' : 'Caja cerrada'}</div>
                </div>
                <div className="rounded-2xl bg-brand-navy text-white p-4">
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-300 font-700">Siguiente paso</div>
                  <div className="text-lg font-800 mt-2">Abrir o cerrar caja según el turno</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Indicaciones</h3>
              </div>
              <div className="p-5 text-sm text-gray-600 space-y-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3">
                  <ArrowUpFromLine size={16} className="text-brand-green mt-0.5" />
                  <div>Al abrir la caja se guarda el monto inicial y queda disponible para el turno actual.</div>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3">
                  <ArrowDownToLine size={16} className="text-brand-sidebar mt-0.5" />
                  <div>Al cerrarla se calcula lo esperado con ventas en efectivo menos egresos del local.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
