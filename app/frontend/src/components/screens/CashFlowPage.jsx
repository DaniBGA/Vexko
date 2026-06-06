import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PageHeader, fmt } from '../ui/index.jsx';
import { api } from '../../lib/api.js';

const CATEGORIES = [
  { value: 'Alquiler', label: 'Alquiler' },
  { value: 'Empleados', label: 'Empleados' },
  { value: 'Servicios', label: 'Servicios' },
];

export default function CashFlowPage() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('ALQUILER');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', 'month'],
    queryFn: () => api.get('/cashflow', { params: { period: 'month' } }).then((r) => r.data),
  });

  const [editingId, setEditingId] = useState(null);

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/cashflow', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Gasto registrado');
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      setAmount(''); setDescription(''); setDate(''); setCategory('ALQUILER');
    },
    onError: (err) => toast.error('Error guardando gasto'),
  });

  function handleAdd(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return toast.error('Ingresá un monto válido');
    if (editingId) {
      // update
      api.put(`/cashflow/${editingId}`, { amount: Number(amount), concept: description || null, category, date: date || null })
        .then(() => {
          toast.success('Gasto actualizado');
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
          setEditingId(null);
          setAmount(''); setDescription(''); setDate(''); setCategory('Alquiler');
        }).catch(() => toast.error('Error actualizando gasto'));
      return;
    }

    addMutation.mutate({ type: 'EXPENSE', amount: Number(amount), concept: description || null, category, date: date || null });
  }

  function handleEdit(flow) {
    // parse description into category and concept if possible
    let parsedCategory = 'Alquiler';
    let parsedConcept = '';
    if (flow.description) {
      const parts = flow.description.split(' — ');
      if (parts.length === 1) parsedConcept = parts[0];
      else {
        parsedCategory = parts[0];
        parsedConcept = parts.slice(1).join(' — ');
      }
    }
    setEditingId(flow.id);
    setCategory(parsedCategory);
    setAmount(String(flow.amount));
    setDescription(parsedConcept || '');
    setDate(new Date(flow.createdAt).toISOString().slice(0,10));
  }

  function handleDelete(id) {
    if (!confirm('Confirmar borrado de gasto?')) return;
    api.delete(`/cashflow/${id}`).then(() => {
      toast.success('Gasto eliminado');
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    }).catch(() => toast.error('Error borrando gasto'));
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
                <label className="field-label">Fecha (opcional)</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input" />
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-primary" type="submit" disabled={addMutation.isLoading}>{addMutation.isLoading ? 'Guardando...' : 'Registrar gasto'}</button>
                <button type="button" onClick={() => { setAmount(''); setDescription(''); setDate(''); setCategory('ALQUILER'); }} className="btn-outline">Limpiar</button>
              </div>
            </form>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Gastos del mes</h3></div>
          <div className="p-5">
            {isLoading ? <div>Cargando...</div> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Fecha</th>
                      <th className="th">Categoría</th>
                      <th className="th">Descripción</th>
                      <th className="th text-right">Monto</th>
                      <th className="th w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.flows || []).map((f) => {
                      let displayCategory = f.type;
                      let displayConcept = f.description || '';
                      if (f.description) {
                        const parts = f.description.split(' — ');
                        if (parts.length > 1) {
                          displayCategory = parts[0];
                          displayConcept = parts.slice(1).join(' — ');
                        } else displayConcept = parts[0];
                      }
                      return (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="td">{new Date(f.createdAt).toLocaleDateString()}</td>
                          <td className="td">{displayCategory}</td>
                          <td className="td text-gray-600">{displayConcept || '—'}</td>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
