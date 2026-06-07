import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Search, X, Package, Clock3, CircleCheckBig, ChevronLeft, ChevronRight, Edit, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { unwrapProductsResponse } from '../../lib/response.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CARD', label: 'Tarjeta' },
];

function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDeliveryDate(value, month = 'short') {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: '2-digit', month, year: 'numeric' }).format(new Date(value));
}

function productPackPrice(product) {
  if (product.packPrice && product.packUnits) return Number(product.packPrice);
  return null;
}

function productUnitPrice(product) {
  if (product.loadMode === 'pack' && product.packPrice && product.packUnits) return Number(product.packPrice) / Number(product.packUnits);
  return Number(product.costPrice || 0);
}

function getPackUnits(product) {
  return Number(product.packUnits || 1);
}

function getItemTotalUnits(item) {
  const packUnits = getItemPackUnits(item);
  if (item.product.loadMode === 'pack') {
    return (item.packQuantity * packUnits) + item.unitQuantity;
  }

  return item.unitQuantity;
}

function getItemPackUnits(item) {
  const override = item.packUnitsOverride !== null && item.packUnitsOverride !== undefined ? Number(item.packUnitsOverride) : null;
  if (override !== null && Number.isFinite(override) && override > 0) {
    return override;
  }

  return getPackUnits(item.product);
}

function getItemEffectiveUnitCost(item) {
  const explicitUnit = item.unitCostOverride !== null && item.unitCostOverride !== undefined ? Number(item.unitCostOverride) : null;
  const explicitPack = item.packPriceOverride !== null && item.packPriceOverride !== undefined ? Number(item.packPriceOverride) : null;

  if (explicitUnit !== null) return explicitUnit;
  if (explicitPack !== null && item.product.loadMode === 'pack') {
    const packUnits = getItemPackUnits(item);
    if (packUnits > 0) {
      return explicitPack / packUnits;
    }
  }

  return productUnitPrice(item.product);
}

function getItemEffectivePackPrice(item) {
  const explicitPack = item.packPriceOverride !== null && item.packPriceOverride !== undefined ? Number(item.packPriceOverride) : null;
  if (explicitPack !== null) return explicitPack;

  if (item.product.loadMode === 'pack' && item.product.packPrice) {
    return Number(item.product.packPrice);
  }

  return null;
}

function mapPurchaseItemToEditor(item) {
  const packUnits = Number(item.packUnits || item.product.packUnits || 1);
  const totalUnits = Number(item.quantity || 0);
  const isPackMode = item.product.loadMode === 'pack';

  return {
    product: item.product,
    unitQuantity: isPackMode ? totalUnits % packUnits : totalUnits,
    packQuantity: isPackMode ? Math.floor(totalUnits / packUnits) : 0,
    unitCostOverride: item.unitCost !== null && item.unitCost !== undefined ? Number(item.unitCost) : null,
    packPriceOverride: item.packPrice !== null && item.packPrice !== undefined ? Number(item.packPrice) : null,
    packUnitsOverride: item.packUnits !== null && item.packUnits !== undefined ? Number(item.packUnits) : null,
  };
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersLimit = 8;
  const [openOrderModal, setOpenOrderModal] = useState(false);
  const [openReceiveModal, setOpenReceiveModal] = useState(null);
  const [openEditModal, setOpenEditModal] = useState(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');

  const searchTerm = productSearch.trim();

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id, ordersPage],
    queryFn: () => api.get(`/suppliers/${id}`, { params: { page: ordersPage, limit: ordersLimit } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['supplier-order-products', searchTerm],
    queryFn: () => api.get('/products', { params: { stockView: 1, search: searchTerm || undefined } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: (openOrderModal || Boolean(openEditModal)) && searchTerm.length >= 1,
  });

  useEffect(() => {
    if (!openEditModal) return;
    setOrderNotes(openEditModal.notes || '');
    setDeliveryDate(openEditModal.deliveryDate ? openEditModal.deliveryDate.split('T')[0] : '');
    setPaymentMethod(openEditModal.paymentMethod || 'CASH');
    setItems((openEditModal.items || []).map(mapPurchaseItemToEditor));
    setProductSearch('');
  }, [openEditModal]);

  const { mutate: createOrder, isPending: isCreatingOrder } = useMutation({
    mutationFn: (body) => api.post(`/suppliers/${id}/orders`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Pedido guardado');
      setOpenOrderModal(false);
      setItems([]);
      setOrderNotes('');
      setDeliveryDate('');
      setPaymentMethod('CASH');
      setProductSearch('');
      setOrdersPage(1);
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });

  const { mutate: receiveOrder, isPending: isReceiving } = useMutation({
    mutationFn: (purchaseId) => api.post(`/suppliers/${id}/orders/${purchaseId}/receive`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Pedido recibido y stock actualizado');
      setOpenReceiveModal(null);
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const { mutate: updateOrder, isPending: isUpdatingOrder } = useMutation({
    mutationFn: (body) => api.put(`/suppliers/${id}/orders/${openEditModal.id}`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Pedido actualizado');
      setOpenEditModal(null);
      setOrderNotes('');
      setDeliveryDate('');
      setPaymentMethod('CASH');
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const { mutate: deleteOrder, isPending: isDeletingOrder } = useMutation({
    mutationFn: (purchaseId) => api.delete(`/suppliers/${id}/orders/${purchaseId}`),
    onSuccess: () => {
      toast.success('Pedido eliminado');
      setOrdersPage(1);
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'No se pudo eliminar el pedido');
    },
  });

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return [];
    const seen = new Set();
    return products.filter((product) => {
      if (product.active === false) return false;
      const key = String(product.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [products, searchTerm]);

  function addItem(product) {
    setItems((current) => {
      const found = current.find((item) => item.product.id === product.id);
      if (found) {
        return current.map((item) => {
          if (item.product.id !== product.id) return item;
          if (product.loadMode === 'pack') {
            return { ...item, packQuantity: item.packQuantity + 1 };
          }

          return { ...item, unitQuantity: item.unitQuantity + 1 };
        });
      }

      return [...current, {
        product,
        unitQuantity: product.loadMode === 'pack' ? 0 : 1,
        packQuantity: product.loadMode === 'pack' ? 1 : 0,
        unitCostOverride: null,
        packPriceOverride: null,
        packUnitsOverride: null,
      }];
    });
  }

  function updateItemUnitCost(productId, value) {
    setItems((current) => current.map((item) => (item.product.id === productId ? { ...item, unitCostOverride: value === '' ? null : Number(value) } : item)));
  }

  function updateItemPackPrice(productId, value) {
    setItems((current) => current.map((item) => (item.product.id === productId ? { ...item, packPriceOverride: value === '' ? null : Number(value) } : item)));
  }

  function updateItemPackUnits(productId, value) {
    setItems((current) => current.map((item) => (item.product.id === productId ? { ...item, packUnitsOverride: value === '' ? null : Number(value) } : item)));
  }

  function updateUnitQty(productId, delta) {
    setItems((current) => current
      .map((item) => (item.product.id === productId ? { ...item, unitQuantity: Math.max(0, item.unitQuantity + delta) } : item)));
  }

  function updatePackQty(productId, delta) {
    setItems((current) => current
      .map((item) => (item.product.id === productId ? { ...item, packQuantity: Math.max(0, item.packQuantity + delta) } : item)));
  }

  function removeItem(productId) {
    setItems((current) => current.filter((item) => item.product.id !== productId));
  }

  function submitOrder(e) {
    e.preventDefault();
    if (!items.length) {
      toast.error('Agregá al menos un producto al pedido');
      return;
    }

    if (items.some((item) => getItemTotalUnits(item) <= 0)) {
      toast.error('Cada producto debe tener al menos una unidad o un pack');
      return;
    }

    createOrder({
      notes: orderNotes,
      deliveryDate: deliveryDate || null,
      paymentMethod,
      items: items.map((item) => {
        const totalUnits = getItemTotalUnits(item);
        const unitCost = getItemEffectiveUnitCost(item);
        return {
          productId: item.product.id,
          quantity: totalUnits,
          unitCost,
          packPrice: item.packPriceOverride ?? null,
          packUnits: item.packUnitsOverride ?? null,
        };
      }),
    });
  }

  function submitEditOrder(e) {
    e.preventDefault();
    if (!items.length) {
      toast.error('Agregá al menos un producto al pedido');
      return;
    }

    if (items.some((item) => getItemTotalUnits(item) <= 0)) {
      toast.error('Cada producto debe tener al menos una unidad o un pack');
      return;
    }

    updateOrder({
      notes: orderNotes,
      deliveryDate: deliveryDate || null,
      paymentMethod,
      items: items.map((item) => {
        const totalUnits = getItemTotalUnits(item);
        const unitCost = getItemEffectiveUnitCost(item);
        return {
          productId: item.product.id,
          quantity: totalUnits,
          unitCost,
          packPrice: item.packPriceOverride ?? null,
          packUnits: item.packUnitsOverride ?? null,
        };
      }),
    });
  }

  function openEditModalForOrder(purchase) {
    setOpenEditModal(purchase);
    setOrderNotes(purchase.notes || '');
    setDeliveryDate(purchase.deliveryDate ? purchase.deliveryDate.split('T')[0] : '');
    setPaymentMethod(purchase.paymentMethod);
  }

  function closeEditModal() {
    setOpenEditModal(null);
    setOrderNotes('');
    setDeliveryDate('');
    setPaymentMethod('CASH');
  }

  const orderTotal = items.reduce((sum, item) => sum + getItemEffectiveUnitCost(item) * getItemTotalUnits(item), 0);
  const latestPurchase = supplier?.purchases?.[0];
  const totalOrdersPages = supplier?.totalPages || 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title={supplier?.name ? `Proveedor · ${supplier.name}` : 'Proveedor'}>
        <button onClick={() => navigate('/proveedores')} className="btn-outline inline-flex items-center gap-2">
          <ArrowLeft size={14} />
          Volver
        </button>
        <button onClick={() => setOpenOrderModal(true)} className="btn-primary inline-flex items-center gap-2">
          <Plus size={14} />
          Nuevo pedido
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
        {isLoading ? (
          <Spinner />
        ) : !supplier ? (
          <EmptyState icon={Package} title="Proveedor no encontrado" description="Volvé a la lista para seleccionar otro proveedor." />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="card lg:col-span-2">
                <div className="card-header">
                  <h3 className="card-title">Datos del proveedor</h3>
                  <span className="text-xs text-gray-400">Proveedor del local</span>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="field-label mb-2">Teléfono</div>
                    <div className="text-gray-700">{supplier.phone || 'Sin teléfono'}</div>
                  </div>
                  <div>
                    <div className="field-label mb-2">Email</div>
                    <div className="text-gray-700">{supplier.email || 'Sin email'}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="field-label mb-2">Dirección</div>
                    <div className="text-gray-700">{supplier.address || 'Sin dirección'}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Resumen</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Productos asociados</div>
                    <div className="text-3xl font-800 text-brand-sidebar mt-2">{supplier._count?.products || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Pedidos realizados</div>
                    <div className="text-3xl font-800 text-brand-sidebar mt-2">{supplier._count?.purchases || 0}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Último pedido</div>
                    <div className="text-sm font-700 text-brand-sidebar mt-1">{latestPurchase ? formatDateTime(latestPurchase.createdAt) : 'Sin pedidos'}</div>
                    <div className="mt-2 text-xs text-gray-500">
                      {supplier.lastOrderToday ? 'Viene hoy' : 'No hay aviso si no tiene pedido hoy'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="card-header">
                <h3 className="card-title">Pedidos del proveedor</h3>
                <span className="text-xs text-gray-400">Marcá el pedido recibido para sumar stock</span>
              </div>

              {supplier.purchases?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        {['Fecha', 'Entrega', 'Estado', 'Pago', 'Total', 'Ítems', ''].map((header) => <th key={header} className="th">{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {supplier.purchases.map((purchase) => (
                        <tr key={purchase.id} className="hover:bg-gray-50 transition-colors">
                          <td className="td text-gray-600">{formatDateTime(purchase.createdAt)}</td>
                          <td className="td text-gray-600">{formatDeliveryDate(purchase.deliveryDate, 'short')}</td>
                          <td className="td">
                            {purchase.status === 'RECEIVED' ? (
                              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-700 text-green-700 inline-flex items-center gap-1"><CircleCheckBig size={12} />Recibido</span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-700 text-amber-700 inline-flex items-center gap-1"><Clock3 size={12} />Pendiente</span>
                            )}
                          </td>
                          <td className="td">
                            <span className={`rounded-full px-3 py-1 text-xs font-700 inline-flex items-center gap-1 ${purchase.paymentMethod === 'CASH' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                              {purchase.paymentMethod === 'CASH' ? 'Efectivo' : purchase.paymentMethod === 'TRANSFER' ? 'Transferencia' : 'Tarjeta'}
                            </span>
                          </td>
                          <td className="td font-700">{fmt(purchase.totalAmount)}</td>
                          <td className="td text-gray-500">{purchase.items?.length || 0}</td>
                          <td className="td text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModalForOrder(purchase)}
                                disabled={purchase.status === 'RECEIVED'}
                                className={`btn-outline py-1 px-2 text-xs inline-flex items-center gap-1 ${purchase.status === 'RECEIVED' ? 'opacity-50 cursor-default' : ''}`}
                              >
                                <Edit size={12} />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('¿Estás seguro de que querés eliminar este pedido?')) {
                                    deleteOrder(purchase.id);
                                  }
                                }}
                                className="btn-outline py-1 px-2 text-xs text-red-600 inline-flex items-center gap-1"
                              >
                                <Trash2 size={12} />
                                Borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => purchase.status !== 'RECEIVED' && setOpenReceiveModal(purchase)}
                                disabled={purchase.status === 'RECEIVED'}
                                className={`btn-outline py-1 px-3 text-xs ${purchase.status === 'RECEIVED' ? 'opacity-60 cursor-default' : ''}`}
                              >
                                {purchase.status === 'RECEIVED' ? 'Recibido' : 'pedido recibido'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Package} title="Sin pedidos" description="Todavía no cargaste pedidos para este proveedor." />
              )}

              {totalOrdersPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm">
                  <span className="text-gray-500">Página {ordersPage} de {totalOrdersPages}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={ordersPage <= 1}
                      onClick={() => setOrdersPage((current) => Math.max(1, current - 1))}
                      className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <ChevronLeft size={14} />
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={ordersPage >= totalOrdersPages}
                      onClick={() => setOrdersPage((current) => Math.min(totalOrdersPages, current + 1))}
                      className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      Siguiente
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {openOrderModal && supplier && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-sm font-700 text-brand-sidebar">Nuevo pedido</div>
                <div className="text-xs text-gray-400">Elegí productos del catálogo global o propios del local.</div>
              </div>
              <button type="button" onClick={() => setOpenOrderModal(false)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>

            <form onSubmit={submitOrder} className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-0 min-h-0">
                <div className="border-r border-gray-100 p-5 overflow-y-auto space-y-4 min-h-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o ID..."
                    className="field-input input-with-icon py-2 pl-9 text-sm w-full"
                  />
                </div>

                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
                  Cada producto del pedido muestra su ID, categoría, modo de carga, precio por pack, precio por unidad y stock actual para que puedas cargarlo como en el formulario de producto.
                </div>

                {searchTerm.length >= 1 && filteredProducts.length === 0 ? (
                  <EmptyState icon={Search} title="Sin resultados" description="Probá con otro nombre o ID de producto." />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addItem(product)}
                        className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-green hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-800 text-brand-sidebar">{product.name}</div>
                            <div className="text-xs text-gray-400 mt-1">ID: {product.id}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {product.isCustom ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-700 text-green-700">Propio</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-700 text-slate-700">Global</span>}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-700 text-slate-700">{product.loadMode === 'unit' ? 'Unidad' : 'Pack'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-gray-600">
                          <div><span className="text-gray-400 block">Categoría</span>{product.subcategory?.category?.name || 'Sin categoría'}</div>
                          <div><span className="text-gray-400 block">Subcategoría</span>{product.subcategory?.name || '—'}</div>
                          <div><span className="text-gray-400 block">Precio por pack</span>{product.packPrice ? fmt(product.packPrice) : '—'}</div>
                          <div><span className="text-gray-400 block">Unidades por pack</span>{product.packUnits || '—'}</div>
                          <div><span className="text-gray-400 block">Precio por unidad</span>{fmt(productUnitPrice(product))}</div>
                          <div><span className="text-gray-400 block">Stock actual</span>{product.stock}</div>
                        </div>

                        <div className="mt-4 text-sm font-700 text-brand-sidebar">Agregar al pedido</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

                <div className="p-5 overflow-hidden bg-slate-50 min-h-0 flex flex-col">
                  <div className="card h-full min-h-[74vh] flex flex-col overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">Pedido armado</h3>
                      <span className="text-xs text-gray-400">{items.length} productos</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                      {items.length === 0 ? (
                        <EmptyState icon={Package} title="Todavía no agregaste productos" description="Buscá productos a la izquierda y sumalos al pedido." />
                      ) : (
                        <div className="space-y-3">
                          {items.map((item) => (
                            <div key={item.product.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <div className="font-800 text-brand-sidebar">{item.product.name}</div>
                                  <div className="text-xs text-gray-400 mt-1">ID: {item.product.id}</div>
                                </div>
                                <button type="button" onClick={() => removeItem(item.product.id)} className="text-gray-400 hover:text-red-500">
                                  <X size={16} />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                <div><span className="text-gray-400 block">Categoría</span>{item.product.subcategory?.category?.name || 'Sin categoría'}</div>
                                <div><span className="text-gray-400 block">Modo</span>{item.product.loadMode === 'unit' ? 'Por unidad' : 'Por pack'}</div>
                                <div><span className="text-gray-400 block">Precio pack</span>{item.product.packPrice ? fmt(item.product.packPrice) : '—'}</div>
                                <div><span className="text-gray-400 block">Precio unidad</span>{fmt(productUnitPrice(item.product))}</div>
                              </div>
                              {item.product.loadMode === 'pack' ? (
                                <div className="mt-4 space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Packs</div>
                                      <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1 w-full justify-between">
                                        <button type="button" onClick={() => updatePackQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                        <span className="min-w-8 text-center font-700">{item.packQuantity}</span>
                                        <button type="button" onClick={() => updatePackQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Unidades sueltas</div>
                                      <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1 w-full justify-between">
                                        <button type="button" onClick={() => updateUnitQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                        <span className="min-w-8 text-center font-700">{item.unitQuantity}</span>
                                        <button type="button" onClick={() => updateUnitQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>{item.packQuantity} pack{item.packQuantity === 1 ? '' : 's'} de {getItemPackUnits(item)} unidad{getItemPackUnits(item) === 1 ? '' : 'es'} + {item.unitQuantity} unidad{item.unitQuantity === 1 ? '' : 'es'}</span>
                                    <span>{getItemTotalUnits(item)} unidades totales</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between mt-4">
                                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1">
                                    <button type="button" onClick={() => updateUnitQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                    <span className="min-w-8 text-center font-700">{item.unitQuantity}</span>
                                    <button type="button" onClick={() => updateUnitQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                  </div>
                                  <div className="text-sm font-800 text-brand-sidebar">{fmt((item.unitCostOverride ?? productUnitPrice(item.product)) * item.unitQuantity)}</div>
                                </div>
                              )}
                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Precio unidad (override)</div>
                                  <input type="number" step="0.01" value={item.unitCostOverride ?? ''} onChange={(e) => updateItemUnitCost(item.product.id, e.target.value)} className="field-input" />
                                </div>
                                {item.product.loadMode === 'pack' && (
                                  <>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Precio pack (override)</div>
                                      <input type="number" step="0.01" value={item.packPriceOverride ?? ''} onChange={(e) => updateItemPackPrice(item.product.id, e.target.value)} className="field-input" />
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Unidades por pack</div>
                                      <input type="number" min="1" step="1" value={item.packUnitsOverride ?? ''} onChange={(e) => updateItemPackUnits(item.product.id, e.target.value)} className="field-input" />
                                    </div>
                                  </>
                                )}
                              </div>
                              {item.product.loadMode === 'pack' && (
                                <div className="mt-3 text-sm font-800 text-brand-sidebar text-right">{fmt(getItemEffectiveUnitCost(item) * getItemTotalUnits(item))}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-100 bg-white p-5 space-y-4">
                      <div className="rounded-2xl bg-brand-navy text-white p-4 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-slate-300 font-700">Total estimado</div>
                          <div className="text-2xl font-800 mt-1">{fmt(orderTotal)}</div>
                        </div>
                        <div className="text-xs text-slate-300 text-right max-w-40">Si lo pagás en efectivo, se descuenta de la caja al guardar el pedido.</div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr_0.8fr] gap-3">
                        <div className="field-group">
                          <label className="field-label">Día de entrega del proveedor</label>
                          <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="field-input"
                          />
                        </div>

                        <div className="field-group">
                          <label className="field-label">Notas del pedido</label>
                          <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} className="field-input resize-none" />
                        </div>

                        <div className="field-group">
                          <label className="field-label">Método de pago</label>
                          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input">
                            {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setOpenOrderModal(false)} className="btn-outline">Cancelar</button>
                        <button type="submit" disabled={isCreatingOrder} className="btn-primary disabled:opacity-60">{isCreatingOrder ? 'Guardando...' : 'Guardar pedido'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {openReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-sm font-700 text-brand-sidebar">Pedido recibido</div>
                <div className="text-xs text-gray-400">Revisá los productos antes de sumar el stock.</div>
              </div>
              <button type="button" onClick={() => setOpenReceiveModal(null)} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card"><div className="card-body"><div className="text-xs uppercase text-gray-400 font-700">Proveedor</div><div className="text-lg font-800 text-brand-sidebar mt-2">{supplier?.name}</div></div></div>
                <div className="card"><div className="card-body"><div className="text-xs uppercase text-gray-400 font-700">Fecha del pedido</div><div className="text-lg font-800 text-brand-sidebar mt-2">{formatDateTime(openReceiveModal.createdAt)}</div></div></div>
                  <div className="card"><div className="card-body"><div className="text-xs uppercase text-gray-400 font-700">Fecha de entrega</div><div className="text-lg font-800 text-brand-sidebar mt-2">{formatDeliveryDate(openReceiveModal.deliveryDate, 'long')}</div></div></div>
                <div className="card"><div className="card-body"><div className="text-xs uppercase text-gray-400 font-700">Total</div><div className="text-lg font-800 text-brand-sidebar mt-2">{fmt(openReceiveModal.totalAmount)}</div></div></div>
              </div>

              <div className="card overflow-hidden">
                <div className="card-header">
                  <h3 className="card-title">Productos del pedido</h3>
                  <span className="text-xs text-gray-400">Se agregarán al stock al confirmar</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        {['Producto', 'ID', 'Categoría', 'Modo', 'Pack', 'P. pack', 'P. unidad', 'Stock actual', 'Cantidad', 'Stock nuevo'].map((header) => <th key={header} className="th">{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {openReceiveModal.items.map((item) => {
                        const product = item.product;
                        const nextStock = (product.stock || 0) + item.quantity;
                        const packUnits = item.packUnits ?? getItemPackUnits({ ...item, product });
                        const packPrice = item.packPrice ?? getItemEffectivePackPrice(item);
                        const packCount = product.loadMode === 'pack' ? Math.floor(item.quantity / packUnits) : 0;
                        const looseUnits = product.loadMode === 'pack' ? item.quantity % packUnits : item.quantity;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="td font-700 text-brand-sidebar">{product.name}</td>
                            <td className="td text-gray-500">{product.id}</td>
                            <td className="td text-gray-500">{product.subcategory?.category?.name || 'Sin categoría'}</td>
                            <td className="td text-gray-500">{product.loadMode === 'unit' ? 'Unidad' : 'Pack'}</td>
                            <td className="td text-gray-500">{product.loadMode === 'pack' ? `${packUnits} u.` : '—'}</td>
                            <td className="td">{packPrice ? fmt(packPrice) : '—'}</td>
                            <td className="td">{fmt(getItemEffectiveUnitCost(item))}</td>
                            <td className="td">{product.stock}</td>
                            <td className="td font-700">{item.quantity}</td>
                            <td className="td font-700 text-green-700">
                              {nextStock}
                              {product.loadMode === 'pack' && (
                                <div className="mt-1 text-[11px] font-600 text-gray-500">
                                  {packCount > 0 ? `${packCount} pack${packCount === 1 ? '' : 's'}` : '0 packs'}
                                  {looseUnits > 0 ? ` + ${looseUnits} unidad${looseUnits === 1 ? '' : 'es'}` : ''}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-5 py-4 flex justify-end gap-3 bg-white">
              <button type="button" onClick={() => setOpenReceiveModal(null)} className="btn-outline">Cancelar</button>
              <button type="button" onClick={() => receiveOrder(openReceiveModal.id)} disabled={isReceiving} className="btn-primary disabled:opacity-60">
                {isReceiving ? 'Procesando...' : 'pedido recibido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openEditModal && supplier && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-sm font-700 text-brand-sidebar">Editar pedido</div>
                <div className="text-xs text-gray-400">Agregá o quitá productos y guardá los cambios del pedido.</div>
              </div>
              <button type="button" onClick={closeEditModal} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-3xl leading-none font-700">×</span>
              </button>
            </div>

            <form onSubmit={submitEditOrder} className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-0 min-h-0">
                <div className="border-r border-gray-100 bg-slate-50 flex flex-col min-h-0">
                  <div className="p-5 border-b border-gray-100 bg-white space-y-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Buscar producto por nombre o ID..."
                        className="field-input input-with-icon w-full"
                      />
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
                      Buscá un producto y agregalo al pedido. Si ya estaba cargado, se suma una línea más del mismo producto.
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {searchTerm.length >= 1 && filteredProducts.length === 0 ? (
                      <EmptyState icon={Search} title="Sin resultados" description="Probá con otro nombre o ID de producto." />
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {filteredProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => addItem(product)}
                            className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-green hover:shadow-sm transition-all"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-800 text-brand-sidebar">{product.name}</div>
                                <div className="text-xs text-gray-400 mt-1">ID: {product.id}</div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {product.isCustom ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-700 text-green-700">Propio</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-700 text-slate-700">Global</span>}
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-700 text-slate-700">{product.loadMode === 'unit' ? 'Unidad' : 'Pack'}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-gray-600">
                              <div><span className="text-gray-400 block">Categoría</span>{product.subcategory?.category?.name || 'Sin categoría'}</div>
                              <div><span className="text-gray-400 block">Subcategoría</span>{product.subcategory?.name || '—'}</div>
                              <div><span className="text-gray-400 block">Precio pack</span>{product.packPrice ? fmt(product.packPrice) : '—'}</div>
                              <div><span className="text-gray-400 block">Precio unidad</span>{fmt(productUnitPrice(product))}</div>
                            </div>

                            <div className="mt-4 text-sm font-700 text-brand-sidebar">Agregar al pedido</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col min-h-0 bg-slate-50">
                  <div className="card h-full min-h-[74vh] flex flex-col overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">Pedido editado</h3>
                      <span className="text-xs text-gray-400">{items.length} productos</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
                      {items.length === 0 ? (
                        <EmptyState icon={Package} title="Todavía no agregaste productos" description="Buscá productos a la izquierda y sumalos al pedido." />
                      ) : (
                        <div className="space-y-3">
                          {items.map((item) => (
                            <div key={item.product.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <div className="font-800 text-brand-sidebar">{item.product.name}</div>
                                  <div className="text-xs text-gray-400 mt-1">ID: {item.product.id}</div>
                                </div>
                                <button type="button" onClick={() => removeItem(item.product.id)} className="text-gray-400 hover:text-red-500">
                                  <X size={16} />
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                <div><span className="text-gray-400 block">Categoría</span>{item.product.subcategory?.category?.name || 'Sin categoría'}</div>
                                <div><span className="text-gray-400 block">Modo</span>{item.product.loadMode === 'unit' ? 'Por unidad' : 'Por pack'}</div>
                                <div><span className="text-gray-400 block">Precio pack</span>{item.product.packPrice ? fmt(item.product.packPrice) : '—'}</div>
                                <div><span className="text-gray-400 block">Precio unidad</span>{fmt(productUnitPrice(item.product))}</div>
                              </div>

                              {item.product.loadMode === 'pack' ? (
                                <div className="mt-4 space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Packs</div>
                                      <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1 w-full justify-between">
                                        <button type="button" onClick={() => updatePackQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                        <span className="min-w-8 text-center font-700">{item.packQuantity}</span>
                                        <button type="button" onClick={() => updatePackQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Unidades sueltas</div>
                                      <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1 w-full justify-between">
                                        <button type="button" onClick={() => updateUnitQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                        <span className="min-w-8 text-center font-700">{item.unitQuantity}</span>
                                        <button type="button" onClick={() => updateUnitQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>{item.packQuantity} pack{item.packQuantity === 1 ? '' : 's'} de {getItemPackUnits(item)} unidad{getItemPackUnits(item) === 1 ? '' : 'es'} + {item.unitQuantity} unidad{item.unitQuantity === 1 ? '' : 'es'}</span>
                                    <span>{getItemTotalUnits(item)} unidades totales</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 flex items-center justify-between">
                                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1">
                                    <button type="button" onClick={() => updateUnitQty(item.product.id, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">-</button>
                                    <span className="min-w-8 text-center font-700">{item.unitQuantity}</span>
                                    <button type="button" onClick={() => updateUnitQty(item.product.id, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200">+</button>
                                  </div>
                                  <div className="text-sm font-800 text-brand-sidebar">{fmt(getItemEffectiveUnitCost(item) * getItemTotalUnits(item))}</div>
                                </div>
                              )}

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Precio unidad (override)</div>
                                  <input type="number" step="0.01" value={item.unitCostOverride ?? ''} onChange={(e) => updateItemUnitCost(item.product.id, e.target.value)} className="field-input" />
                                </div>
                                {item.product.loadMode === 'pack' && (
                                  <>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Precio pack (override)</div>
                                      <input type="number" step="0.01" value={item.packPriceOverride ?? ''} onChange={(e) => updateItemPackPrice(item.product.id, e.target.value)} className="field-input" />
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Unidades por pack</div>
                                      <input type="number" min="1" step="1" value={item.packUnitsOverride ?? ''} onChange={(e) => updateItemPackUnits(item.product.id, e.target.value)} className="field-input" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 bg-white p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr_0.8fr] gap-3">
                  <div className="field-group">
                    <label className="field-label">Fecha de entrega</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="field-input"
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Notas</label>
                    <textarea
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Notas sobre el pedido..."
                      className="field-input min-h-24 resize-none"
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Método de pago</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input">
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeEditModal} className="btn-outline">Cancelar</button>
                  <button type="submit" disabled={isUpdatingOrder} className="btn-primary disabled:opacity-60">
                    {isUpdatingOrder ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
