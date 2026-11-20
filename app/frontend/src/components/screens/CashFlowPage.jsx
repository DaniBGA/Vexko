import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Banknote, FileDown, Landmark } from 'lucide-react';
import { PageHeader, fmt } from '../ui/index.jsx';
import { api } from '../../lib/api.js';
import { downloadPdfReport } from '../../lib/pdf.js';
import { useAuthStore } from '../../store/authStore.js';

// "¿Salió de la caja?": un gasto pagado por transferencia o débito (alquiler,
// servicios) cuenta en los resultados del mes, pero no se resta del efectivo
// esperado del arqueo. Antes todo gasto se restaba de la caja.
const PAID_FROM_OPTIONS = [
  { value: true, label: 'Sí, de la caja', hint: 'Efectivo del cajón', icon: Banknote },
  { value: false, label: 'No, por fuera', hint: 'Transferencia, débito...', icon: Landmark },
];

const CATEGORIES = [
  { value: 'Alquiler', label: 'Alquiler' },
  { value: 'Empleados', label: 'Empleados' },
  { value: 'Servicios', label: 'Servicios' },
];

// La API guarda description = "Categoría — concepto" (o solo la categoría si no
// hay concepto). Antes la pantalla adivinaba la categoría partiendo ese texto:
// un gasto sin concepto, o una compra a proveedor ("Compra a proveedor: X"),
// mostraba "EXPENSE" como categoría.
function splitFlowDescription(flow) {
  const description = flow.description || '';
  const category = flow.category || (description.includes(' — ') ? description.split(' — ')[0] : null);
  let concept = description;
  if (category && description === category) concept = '';
  else if (category && description.startsWith(`${category} — `)) concept = description.slice(category.length + 3);
  return { category: category || 'Otro', concept };
}

export default function CashFlowPage() {
  const queryClient = useQueryClient();
  const kioskName = useAuthStore((s) => s.user?.kiosk?.name);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [category, setCategory] = useState('Alquiler');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [paidFromCash, setPaidFromCash] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', 'month', page],
    queryFn: () => api.get('/cashflow', { params: { period: 'month', page, limit } }).then((r) => r.data),
  });

  const [editingId, setEditingId] = useState(null);

  // Antes "Limpiar" ponía la categoría en 'ALQUILER', que no existe en la lista.
  function resetForm() {
    setAmount(''); setDescription(''); setDate(''); setCategory('Alquiler'); setPaidFromCash(true);
  }

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/cashflow', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Gasto registrado');
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
      resetForm();
    },
    onError: (err) => toast.error('Error guardando gasto'),
  });

  function handleAdd(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return toast.error('Ingresá un monto válido');
    if (editingId) {
      // update
      api.put(`/cashflow/${editingId}`, { amount: Number(amount), concept: description || null, category, date: date || null, paidFromCash })
        .then(() => {
          toast.success('Gasto actualizado');
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
          queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
          queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
          setEditingId(null);
          resetForm();
        }).catch(() => toast.error('Error actualizando gasto'));
      return;
    }

    addMutation.mutate({ type: 'EXPENSE', amount: Number(amount), concept: description || null, category, date: date || null, paidFromCash });
  }

  function handleEdit(flow) {
    const { category: parsedCategory, concept: parsedConcept } = splitFlowDescription(flow);
    setEditingId(flow.id);
    setCategory(parsedCategory);
    setAmount(String(flow.amount));
    setDescription(parsedConcept);
    setDate(new Date(flow.createdAt).toISOString().slice(0,10));
    setPaidFromCash(flow.paidFromCash !== false);
  }

  function handleDelete(id) {
    if (!confirm('Confirmar borrado de gasto?')) return;
    api.delete(`/cashflow/${id}`).then(() => {
      toast.success('Gasto eliminado');
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    }).catch(() => toast.error('Error borrando gasto'));
  }

  async function handleExportPdf() {
    setIsExportingPdf(true);
    try {
      const { data: full } = await api.get('/cashflow', { params: { period: 'month', all: 1 } });
      const flows = full.flows || [];
      const rows = flows.map((f) => {
        const { category: displayCategory, concept: displayConcept } = splitFlowDescription(f);
        return [
          new Date(f.createdAt).toLocaleDateString('es-AR'),
          displayCategory,
          displayConcept || '—',
          f.paidFromCash === false ? 'Por fuera' : 'Caja',
          fmt(f.amount),
        ];
      });

      downloadPdfReport({
        title: 'Gastos del mes',
        subtitle: new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' }),
        kioskName,
        meta: [`Total de gastos: ${flows.length}`],
        columns: ['Fecha', 'Categoría', 'Descripción', 'Salió de', 'Monto'],
        rows,
        summary: [
          ['Pagado con la caja', fmt(full.totals?.expenseFromCash || 0)],
          ['Pagado por fuera de la caja', fmt(full.totals?.expenseOutsideCash || 0)],
          ['Total gastado', fmt(full.totals?.expense || 0)],
        ],
        filename: `gastos-${new Date().toISOString().slice(0, 7)}.pdf`,
      });
    } catch {
      toast.error('No se pudo generar el PDF');
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Gastos" />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Registrar gasto</h3></div>
          <div className="p-5 space-y-3">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="field-group">
                <label className="field-label">Categoría</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input">
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  {!CATEGORIES.some((c) => c.value === category) && <option value={category}>{category}</option>}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Monto *</label>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="field-input" />
              </div>
              <div className="field-group">
                <label className="field-label">Descripción</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
              </div>
              <div className="field-group">
                <label className="field-label">¿Salió de la caja?</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAID_FROM_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setPaidFromCash(value)}
                      aria-pressed={paidFromCash === value}
                      className={`rounded-lg border-2 px-3 py-2 text-left transition ${
                        paidFromCash === value
                          ? 'border-brand-navy bg-brand-navy text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-700"><Icon size={15} />{label}</span>
                      <span className={`block text-xs mt-0.5 ${paidFromCash === value ? 'text-slate-300' : 'text-gray-500'}`}>{hint}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  {paidFromCash
                    ? 'Se descuenta del efectivo esperado al cerrar la caja.'
                    : 'Cuenta en los resultados del mes, pero no toca el arqueo de la caja.'}
                </p>
              </div>
              <div className="field-group">
                <label className="field-label">Fecha (opcional)</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input" />
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-primary" type="submit" disabled={addMutation.isPending}>{addMutation.isPending ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Registrar gasto'}</button>
                <button type="button" onClick={() => { setEditingId(null); resetForm(); }} className="btn-outline">Limpiar</button>
              </div>
            </form>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="card-title">Gastos del mes</h3>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="btn-outline inline-flex items-center gap-2 text-xs px-3 py-1.5 disabled:opacity-60"
            >
              <FileDown size={13} />
              {isExportingPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
          </div>
          <div className="p-5">
            {isLoading ? <div>Cargando...</div> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Fecha</th>
                        <th className="th">Categoría</th>
                        <th className="th">Descripción</th>
                        <th className="th">Salió de</th>
                        <th className="th text-right">Monto</th>
                        <th className="th w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.flows || []).map((f) => {
                        const { category: displayCategory, concept: displayConcept } = splitFlowDescription(f);
                        return (
                          <tr key={f.id} className="hover:bg-gray-50">
                            <td className="td">{new Date(f.createdAt).toLocaleDateString()}</td>
                            <td className="td">{displayCategory}</td>
                            <td className="td text-gray-600">{displayConcept || '—'}</td>
                            <td className="td">
                              {f.paidFromCash === false
                                ? <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap bg-slate-100 text-slate-700"><Landmark size={12} />Por fuera</span>
                                : <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap bg-green-100 text-green-700"><Banknote size={12} />Caja</span>}
                            </td>
                            <td className="td text-right font-700">{fmt(f.amount)}</td>
                            <td className="td text-right">
                              <div className="inline-flex gap-2">
                                <button onClick={() => handleEdit(f)} className="text-blue-600 hover:underline text-sm">Editar</button>
                                <button onClick={() => handleDelete(f.id)} className="text-red-600 hover:underline text-sm">Borrar</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {(data?.total || 0) > 0 && (
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span className="text-gray-500">Total del mes: <strong className="text-gray-800">{fmt(data?.totals?.expense || 0)}</strong></span>
                    <span className="text-gray-500">De la caja: <strong className="text-gray-800">{fmt(data?.totals?.expenseFromCash || 0)}</strong></span>
                    <span className="text-gray-500">Por fuera: <strong className="text-gray-800">{fmt(data?.totals?.expenseOutsideCash || 0)}</strong></span>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm text-gray-500">
                    {(data?.total || 0) === 0
                      ? 'No hay gastos para mostrar'
                      : `Mostrando página ${data?.page || page} de ${data?.totalPages || 1}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-outline disabled:opacity-50"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="btn-outline disabled:opacity-50"
                      onClick={() => setPage((current) => Math.min(data?.totalPages || current, current + 1))}
                      disabled={!data?.totalPages || page >= data.totalPages}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
