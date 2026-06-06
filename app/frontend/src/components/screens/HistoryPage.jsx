// src/components/screens/HistoryPage.jsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  Eye,
  Landmark,
  Loader2,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, fmt } from '../ui/index.jsx';

const PAGE_SIZE = 10;

const PAYMENT_META = {
  CASH: { label: 'Efectivo', Icon: CircleDollarSign },
  TRANSFER: { label: 'Transferencia', Icon: Landmark },
  CARD: { label: 'Tarjeta', Icon: CreditCard },
  MIXED: { label: 'Mixto', Icon: Repeat2 },
};

const EMPTY_EDIT_FORM = {
  items: [],
  paymentMethod: 'CASH',
  cashAmount: '',
  transferAmount: '',
  cardAmount: '',
  clientId: '',
};

function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function paymentMetaFor(method) {
  return PAYMENT_META[method] || PAYMENT_META.MIXED;
}

function formatSaleItems(items) {
  return items.map((item) => ({
    productId: item.productId,
    name: item.product?.name || item.productName || 'Producto',
    salePrice: parseFloat(item.product?.salePrice || item.unitPrice || 0),
    costPrice: parseFloat(item.product?.costPrice || 0),
    quantity: item.quantity,
  }));
}

function formatViewSaleItems(items) {
  return items.map((item) => ({
    productId: item.productId,
    name: item.product?.name || item.name || 'Producto',
    salePrice: parseFloat(item.product?.salePrice || item.unitPrice || item.salePrice || 0),
    quantity: item.quantity,
  }));
}

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSearch, setEditSearch] = useState('');
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['sales', page],
    queryFn: () => api.get('/sales', { params: { page, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  const sales = data?.sales || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const currentPage = data?.page || page;
  const totalRevenue = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);

  useEffect(() => {
    if (data?.page && data.page !== page) {
      setPage(data.page);
    }
  }, [data?.page, page]);

  const saleDetailQuery = useQuery({
    queryKey: ['sale-detail', selectedSaleId],
    queryFn: () => api.get(`/sales/${selectedSaleId}`).then((r) => r.data),
    enabled: Boolean(selectedSaleId),
  });

  useEffect(() => {
    if (!saleDetailQuery.data?.id || !selectedSaleId) return;
    setIsEditing(false);
    setEditSearch('');
    setEditForm({
      items: formatSaleItems(saleDetailQuery.data.items || []),
      paymentMethod: saleDetailQuery.data.paymentMethod || 'CASH',
      cashAmount: saleDetailQuery.data.cashAmount ?? '',
      transferAmount: saleDetailQuery.data.transferAmount ?? '',
      cardAmount: saleDetailQuery.data.cardAmount ?? '',
      clientId: saleDetailQuery.data.client?.id || '',
    });
  }, [saleDetailQuery.data?.id, selectedSaleId]);

  const editSearchTerm = editSearch.trim();
  const editProductsQuery = useQuery({
    queryKey: ['sale-edit-products', editSearchTerm],
    queryFn: () => api.get('/products', { params: { search: editSearchTerm } }).then((r) => r.data),
    enabled: isEditing && editSearchTerm.length >= 1,
  });

  const { mutate: updateSale, isPending: isUpdating } = useMutation({
    mutationFn: (body) => api.put(`/sales/${selectedSaleId}`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Venta actualizada');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale-detail', selectedSaleId] });
      closeModal();
    },
  });

  const { mutate: deleteSale, isPending: isDeleting } = useMutation({
    mutationFn: () => api.delete(`/sales/${selectedSaleId}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Venta eliminada');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      closeModal();
    },
  });

  function openSale(saleId) {
    setSelectedSaleId(saleId);
    setIsEditing(false);
    setEditSearch('');
  }

  function closeModal() {
    setSelectedSaleId(null);
    setIsEditing(false);
    setEditSearch('');
    setEditForm(EMPTY_EDIT_FORM);
  }

  function startEditing() {
    if (!saleDetailQuery.data) return;
    setIsEditing(true);
    setEditSearch('');
    setEditForm({
      items: formatSaleItems(saleDetailQuery.data.items || []),
      paymentMethod: saleDetailQuery.data.paymentMethod || 'CASH',
      cashAmount: saleDetailQuery.data.cashAmount ?? '',
      transferAmount: saleDetailQuery.data.transferAmount ?? '',
      cardAmount: saleDetailQuery.data.cardAmount ?? '',
      clientId: saleDetailQuery.data.client?.id || '',
    });
  }

  function addDraftProduct(product) {
    setEditForm((prev) => {
      const existing = prev.items.find((item) => item.productId === product.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((item) => (
            item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
          )),
        };
      }

      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            name: product.name,
            salePrice: parseFloat(product.salePrice || 0),
            costPrice: parseFloat(product.costPrice || 0),
            quantity: 1,
          },
        ],
      };
    });
  }

  function updateDraftQty(productId, delta) {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items
        .map((item) => (
          item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        ))
        .filter(Boolean),
    }));
  }

  function removeDraftItem(productId) {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.productId !== productId),
    }));
  }

  function submitEdit() {
    if (!editForm.items.length) {
      return toast.error('La venta debe tener al menos un producto');
    }

    const total = editForm.items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
    if (editForm.paymentMethod === 'MIXED') {
      const mixedTotal = [editForm.cashAmount, editForm.transferAmount, editForm.cardAmount].reduce(
        (sum, value) => sum + (parseFloat(value || 0) || 0),
        0,
      );
      if (Math.abs(mixedTotal - total) > 0.01) {
        return toast.error('En pago mixto, la suma de los medios debe coincidir con el total');
      }
    }

    updateSale({
      items: editForm.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      paymentMethod: editForm.paymentMethod,
      cashAmount: parseAmount(editForm.cashAmount),
      transferAmount: parseAmount(editForm.transferAmount),
      cardAmount: parseAmount(editForm.cardAmount),
      clientId: editForm.clientId || null,
    });
  }

  function confirmDelete() {
    if (window.confirm('¿Eliminar esta venta? Los productos volverán a stock.')) {
      deleteSale();
    }
  }

  const selectedSale = saleDetailQuery.data;
  const selectedItems = formatViewSaleItems(selectedSale?.items || []);
  const selectedTotal = selectedSale ? parseFloat(selectedSale.total || 0) : 0;
  const selectedMeta = paymentMetaFor(selectedSale?.paymentMethod);
  const modalItems = isEditing ? editForm.items : selectedItems;
  const modalTotal = isEditing
    ? editForm.items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0)
    : selectedTotal;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Historial de ventas" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-700">Aviso importante</div>
            <div>Los datos que superen los 2 meses de antiguedad seran eliminados.</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{total} ventas</h3>
              <p className="text-xs text-gray-400">Se muestran solo los ultimos 2 meses.</p>
            </div>
            <span className="text-sm font-700 text-brand-green">{fmt(totalRevenue)}</span>
          </div>

          {isLoading ? (
            <Spinner />
          ) : sales.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Sin ventas en este período</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Hora/Fecha</th>
                      <th className="th">Productos</th>
                      <th className="th">Pago</th>
                      <th className="th">Cliente</th>
                      <th className="th">Total</th>
                      <th className="th text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => {
                      const meta = paymentMetaFor(sale.paymentMethod);
                      const Icon = meta.Icon;

                      return (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="td text-gray-400 whitespace-nowrap">
                            {format(new Date(sale.createdAt), 'HH:mm · dd/MM', { locale: es })}
                          </td>
                          <td className="td text-sm">
                            <div className="max-w-[360px] truncate">
                              {sale.items.map((item) => item.product.name).join(' + ')}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{sale.items.length} items</div>
                          </td>
                          <td className="td text-xs text-gray-400">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <Icon size={14} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="td text-sm text-gray-400">{sale.client?.name || '—'}</td>
                          <td className="td font-700">{fmt(sale.total)}</td>
                          <td className="td text-right">
                            <button
                              onClick={() => openSale(sale.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-700 text-brand-sidebar hover:bg-gray-50"
                            >
                              <Eye size={15} />
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
                <span>
                  Página {currentPage} de {totalPages} · 10 por página
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage <= 1}
                    className="btn-outline disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((value) => value + 1)}
                    disabled={currentPage >= totalPages}
                    className="btn-outline disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedSaleId && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-sm font-700 text-brand-sidebar">Detalle de venta</div>
                <div className="text-xs text-gray-400">{selectedSale?.id || 'Cargando...'}</div>
              </div>
              <button onClick={closeModal} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {saleDetailQuery.isLoading || saleDetailQuery.isFetching ? (
              <div className="p-10">
                <Spinner />
              </div>
            ) : saleDetailQuery.error ? (
              <div className="p-8 text-sm text-red-600">No se pudo cargar la venta.</div>
            ) : selectedSale ? (
              <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr] overflow-hidden flex-1">
                <div className="overflow-y-auto p-5 space-y-4 border-b lg:border-b-0 lg:border-r border-gray-100">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Fecha</div>
                      <div className="mt-1 text-sm font-700 text-gray-800">
                        {format(new Date(selectedSale.createdAt), 'PPpp', { locale: es })}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Pago</div>
                      <div className="mt-1 text-sm font-700 text-gray-800 inline-flex items-center gap-2">
                        <selectedMeta.Icon size={16} />
                        {selectedMeta.label}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Total</div>
                      <div className="mt-1 text-sm font-700 text-brand-green">{fmt(modalTotal)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <div>
                        <div className="text-sm font-700 text-brand-sidebar">Productos comprados</div>
                        <div className="text-xs text-gray-400">Revisá el detalle antes de editar o eliminar.</div>
                      </div>
                      <div className="text-xs text-gray-400">{modalItems.length} líneas</div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {modalItems.map((item) => (
                        <div key={item.productId} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-700 text-gray-800 truncate">{item.name}</div>
                            <div className="text-xs text-gray-400">ID: {item.productId}</div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 whitespace-nowrap">
                            <span>{item.quantity} u.</span>
                            <span>{fmt(item.salePrice)}</span>
                            <span className="font-700 text-gray-800">{fmt(item.salePrice * item.quantity)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedSale.client && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                      Cliente: <span className="font-700 text-gray-900">{selectedSale.client.name}</span>
                    </div>
                  )}
                </div>

                <div className="relative flex flex-col bg-slate-50 min-h-0">
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-32">
                  {!isEditing ? (
                    <>
                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
                        <div className="text-sm font-700 text-brand-sidebar">Acciones</div>
                        <button
                          onClick={startEditing}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-700 text-white hover:opacity-95"
                        >
                          <Pencil size={16} />
                          Editar compra
                        </button>
                        <button
                          onClick={confirmDelete}
                          disabled={isDeleting}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-700 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          Eliminar compra
                        </button>
                      </div>

                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3 text-sm">
                        <div className="font-700 text-brand-sidebar">Resumen</div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Usuario</span><span className="font-600">{selectedSale.user?.name || '—'}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Cliente</span><span className="font-600">{selectedSale.client?.name || '—'}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Productos</span><span className="font-600">{selectedSale.items.length}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Cambio</span><span className="font-600">{selectedSale.changeGiven == null ? '—' : fmt(selectedSale.changeGiven)}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4">
                        <div className="text-sm font-700 text-brand-sidebar">Editar productos</div>
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <input
                            value={editSearch}
                            onChange={(e) => setEditSearch(e.target.value)}
                            placeholder="Buscar producto para agregar"
                            className="field-input input-with-icon w-full"
                          />
                        </div>
                        {editSearchTerm.length >= 1 && (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {editProductsQuery.isFetching && <div className="text-xs text-gray-400">Buscando...</div>}
                            {(editProductsQuery.data || []).slice(0, 6).map((product) => (
                              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-600 text-gray-800 truncate">{product.name}</div>
                                  <div className="text-xs text-gray-400">{fmt(product.salePrice)} · Stock {product.stock}</div>
                                </div>
                                <button
                                  onClick={() => addDraftProduct(product)}
                                  disabled={product.stock === 0}
                                  className="inline-flex items-center gap-1 rounded-lg bg-brand-green px-3 py-2 text-xs font-700 text-white disabled:opacity-40"
                                >
                                  <PackagePlus size={13} />
                                  Agregar
                                </button>
                              </div>
                            ))}
                            {!editProductsQuery.isFetching && (editProductsQuery.data || []).length === 0 && (
                              <div className="text-xs text-gray-400">No se encontraron resultados.</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-700 text-brand-sidebar">Items en edición</div>
                          <div className="text-xs text-gray-400">{editForm.items.length} líneas</div>
                        </div>
                        <div className="space-y-2">
                          {editForm.items.map((item) => (
                            <div key={item.productId} className="rounded-xl border border-gray-100 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-700 text-gray-800 truncate">{item.name}</div>
                                  <div className="text-xs text-gray-400">{fmt(item.salePrice)} c/u · ID {item.productId}</div>
                                </div>
                                <button
                                  onClick={() => removeDraftItem(item.productId)}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                                  aria-label="Quitar producto"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={() => updateDraftQty(item.productId, -1)}
                                    className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                                    aria-label="Disminuir cantidad"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="min-w-8 text-center font-700 text-sm">{item.quantity}</span>
                                  <button
                                    onClick={() => updateDraftQty(item.productId, 1)}
                                    className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                                    aria-label="Aumentar cantidad"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                                <div className="text-sm font-700 text-gray-800">{fmt(item.salePrice * item.quantity)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4">
                        <div className="text-sm font-700 text-brand-sidebar">Pago</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(PAYMENT_META).map(([method, meta]) => {
                            const Icon = meta.Icon;
                            const active = editForm.paymentMethod === method;
                            return (
                              <button
                                key={method}
                                onClick={() => setEditForm((prev) => ({ ...prev, paymentMethod: method }))}
                                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${active ? 'border-brand-navy bg-brand-navy/5 text-brand-navy' : 'border-gray-200 bg-white text-gray-600'}`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Icon size={15} />
                                  {meta.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {editForm.paymentMethod === 'MIXED' && (
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="field-group">
                              <label className="field-label">Efectivo</label>
                              <input value={editForm.cashAmount} onChange={(e) => setEditForm((prev) => ({ ...prev, cashAmount: e.target.value }))} className="field-input" type="number" min="0" step="0.01" />
                            </div>
                            <div className="field-group">
                              <label className="field-label">Transferencia</label>
                              <input value={editForm.transferAmount} onChange={(e) => setEditForm((prev) => ({ ...prev, transferAmount: e.target.value }))} className="field-input" type="number" min="0" step="0.01" />
                            </div>
                            <div className="field-group">
                              <label className="field-label">Tarjeta</label>
                              <input value={editForm.cardAmount} onChange={(e) => setEditForm((prev) => ({ ...prev, cardAmount: e.target.value }))} className="field-input" type="number" min="0" step="0.01" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between"><span className="text-gray-500">Total nuevo</span><span className="font-700 text-brand-green">{fmt(modalTotal)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Cliente</span><span className="font-600">{selectedSale.client?.name || '—'}</span></div>
                      </div>
                    </div>
                  )}
                  </div>

                  {isEditing && (
                    <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-700 text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={submitEdit}
                          disabled={isUpdating}
                          className="flex-1 rounded-xl bg-brand-navy px-4 py-3 text-sm font-700 text-white hover:opacity-95 disabled:opacity-60"
                        >
                          {isUpdating ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
