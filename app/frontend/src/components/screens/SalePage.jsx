// src/components/screens/SalePage.jsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, X, Plus, Minus, CircleDollarSign, CreditCard, Repeat2, Landmark, PackagePlus, ScanSearch, UserRound, Ticket } from 'lucide-react';
import { api } from '../../lib/api.js';
import { unwrapProductsResponse } from '../../lib/response.js';
import { PageHeader, fmt } from '../ui/index.jsx';
import { useAuthStore } from '../../store/authStore.js';

const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD', 'MIXED'];
const PAYMENT_LABELS = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  MIXED: 'Mixto',
};
const PAYMENT_ICONS = {
  CASH: CircleDollarSign,
  TRANSFER: Landmark,
  CARD: CreditCard,
  MIXED: Repeat2,
};

export default function SalePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Clientes/puntos es una función exclusiva del plan premium (mismo
  // criterio que el sidebar en AppLayout.jsx).
  const kioskPlan = useAuthStore((s) => s.user?.kiosk?.customer?.plan);
  const canUseClients = String(kioskPlan || '').toUpperCase() === 'PREMIUM';
  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState('CASH');
  const [cashAmount, setCashAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [redemptionCode, setRedemptionCode] = useState('');

  const searchParam = new URLSearchParams(location.search).get('search') || '';

  const searchTerm = search.trim();
  const clientTerm = clientSearch.trim();

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['products-search', searchTerm],
    queryFn: () => api.get('/products', { params: { search: searchTerm } }).then((r) => unwrapProductsResponse(r.data)),
    enabled: searchTerm.length >= 1,
  });

  const hasGlobalMatch = products.some((product) => !product.isCustom);

  useEffect(() => {
    if (searchParam && search !== searchParam) {
      setSearch(searchParam);
    }
  }, [searchParam, search]);

  const { data: clientResults = [] } = useQuery({
    queryKey: ['clients-search', clientTerm],
    queryFn: () => api.get('/clients', { params: { search: clientTerm } }).then((r) => r.data.clients),
    enabled: canUseClients && clientTerm.length > 2,
    select: (d) => d.slice(0, 5),
  });

  // Se trae el detalle completo recién al elegir un cliente puntual, para
  // saber si tiene algún código de descuento generado y pendiente de usar.
  const { data: selectedClientDetail } = useQuery({
    queryKey: ['client', selectedClient?.id],
    queryFn: () => api.get(`/clients/${selectedClient.id}`).then((r) => r.data),
    enabled: canUseClients && !!selectedClient,
  });
  const pendingRedemptions = (selectedClientDetail?.redemptions || []).filter((r) => r.status === 'PENDING');
  const trimmedRedemptionCode = redemptionCode.trim();
  const matchedRedemption = trimmedRedemptionCode
    ? pendingRedemptions.find((r) => r.code === trimmedRedemptionCode)
    : null;

  const { mutate: createSale, isPending } = useMutation({
    mutationFn: (body) => api.post('/sales', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Venta registrada');
      setCart([]);
      setSearch('');
      setPayment('CASH');
      setCashAmount('');
      setTransferAmount('');
      setCardAmount('');
      setSelectedClient(null);
      setClientSearch('');
      setRedemptionCode('');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      // El stock cambió: sin esto, Stock y el buscador de esta misma pantalla
      // seguían mostrando las unidades de antes de la venta (hasta 30 s).
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      navigate('/historial');
    },
  });

  const subtotal = cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
  const discountAmount = matchedRedemption ? Math.round(subtotal * (matchedRedemption.discount / 100) * 100) / 100 : 0;
  const total = subtotal - discountAmount;
  // Sin costo cargado (null) el margen daba NaN; se toma como costo 0.
  const margin = cart.reduce((sum, item) => sum + (item.salePrice - (item.costPrice ?? 0)) * item.quantity, 0) - discountAmount;
  const marginPct = total > 0 ? Math.round((margin / total) * 100) : 0;

  // El carrito no deja pasar del stock disponible: antes se podía sumar de
  // más y recién al confirmar el backend rechazaba toda la venta.
  function addToCart(product) {
    if (product.salePrice == null) {
      toast.error(`${product.name} no tiene precio de venta cargado`);
      return;
    }
    const existing = cart.find((i) => i.id === product.id);
    if ((existing?.quantity ?? 0) + 1 > (product.stock ?? 0)) {
      toast.error(`No hay más stock de ${product.name}`);
      return;
    }
    setCart((prev) => {
      if (prev.some((i) => i.id === product.id)) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setSearch('');
  }

  function updateQty(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (item && delta > 0 && item.quantity + delta > (item.stock ?? 0)) {
      toast.error(`No hay más stock de ${item.name}`);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
    );
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function createCustomProduct() {
    navigate(`/stock/nuevo?name=${encodeURIComponent(searchTerm)}&custom=1&return=/venta`);
  }

  function handleConfirm() {
    if (!cart.length) return toast.error('Agregá al menos un producto');
    if (trimmedRedemptionCode && !matchedRedemption) {
      return toast.error('Ese código de descuento no es válido para este cliente');
    }

    if (payment === 'MIXED') {
      const mixedTotal = [cashAmount, transferAmount, cardAmount].reduce(
        (sum, value) => sum + (parseFloat(value || 0) || 0),
        0,
      );
      if (Math.abs(mixedTotal - total) > 0.01) {
        return toast.error('En pago mixto, la suma de los medios debe coincidir con el total');
      }
    }

    // Los parciales solo se mandan en pago mixto: si se habían tipeado en
    // "Mixto" y después se elegía "Efectivo", viajaban igual y el backend
    // guardaba ese parcial como el efectivo de la venta (y la caja daba mal).
    const isMixed = payment === 'MIXED';
    createSale({
      items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
      paymentMethod: payment,
      cashAmount: isMixed && cashAmount ? parseFloat(cashAmount) : undefined,
      transferAmount: isMixed && transferAmount ? parseFloat(transferAmount) : undefined,
      cardAmount: isMixed && cardAmount ? parseFloat(cardAmount) : undefined,
      clientId: selectedClient?.id,
      redemptionCode: matchedRedemption ? matchedRedemption.code : undefined,
    });
  }

  const paymentLabel = (method) => {
    const Icon = PAYMENT_ICONS[method];
    return (
      <span className="inline-flex items-center justify-center gap-1">
        <Icon size={14} />
        {PAYMENT_LABELS[method]}
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Registrar venta" subtitle={todayLabel} />
      <div className="flex flex-col lg:flex-row flex-1 gap-5 p-4 md:p-6 overflow-y-auto lg:overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-4 lg:overflow-y-auto">
          <div className="card">
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-navy text-white flex items-center justify-center flex-shrink-0">
                    <Search size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-700 text-brand-sidebar">Buscar producto</div>
                    <div className="text-xs text-gray-500 mb-3">Escribí una letra o parte del nombre para encontrar productos del catálogo global.</div>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o ID"
                        className="field-input input-with-icon pr-4 py-3 rounded-xl bg-white"
                        autoFocus
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-2 rounded-md bg-slate-50 p-3 border border-dashed border-slate-200">
                      Tip: Si no encontrás tu producto, escribí el nombre y vas a ver la opción "Agregar producto" para crearlo en tu kiosco.
                    </div>
                  </div>
                </div>
              </div>

              {searchTerm.length >= 1 && (
                <div className="mt-3 space-y-2">
                  {isFetching && <p className="text-xs text-gray-400 py-2">Buscando...</p>}
                  {products.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="min-w-0">
                        <div className="text-sm font-600 text-gray-800 truncate flex items-center gap-2">
                          <ScanSearch size={14} className="text-gray-400 flex-shrink-0" />
                          <span>{p.name}</span>
                          {p.isCustom && <span className="text-[10px] uppercase tracking-wide bg-brand-greenBg text-green-700 px-2 py-0.5 rounded-full">Propio</span>}
                          <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{p.loadMode === 'unit' ? 'Unidad' : 'Pack'}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          <span className={`font-700 ${p.stock <= p.minStock ? 'text-red-600' : 'text-green-700'}`}>
                            {p.stock} u. disponibles
                          </span>
                          <span>{fmt(p.salePrice)} c/u</span>
                        </div>
                      </div>
                      <button
                        onClick={() => addToCart(p)}
                        disabled={(p.stock ?? 0) <= 0 || p.salePrice == null}
                        className="btn-green text-sm px-3 py-1.5 disabled:opacity-40"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {!isFetching && searchTerm.length >= 1 && products.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-700 text-brand-sidebar">No existe en el catálogo global</div>
                        <div className="text-xs text-gray-500">Podés crear un producto propio para usarlo en tus ventas.</div>
                      </div>
                      <button onClick={createCustomProduct} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                        <PackagePlus size={14} />
                        Agregar producto
                      </button>
                    </div>
                  )}
                  {!isFetching && searchTerm.length >= 1 && products.length > 0 && !hasGlobalMatch && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex items-center justify-between gap-3 mt-3">
                      <div>
                        <div className="text-sm font-700 text-brand-sidebar">No está en el catálogo global</div>
                        <div className="text-xs text-gray-500">Crealo como producto propio para guardarlo aparte.</div>
                      </div>
                      <button onClick={createCustomProduct} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                        <PackagePlus size={14} />
                        Agregar producto
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Items en la venta</h3>
              <span className="text-xs text-gray-400">{cart.length} productos</span>
            </div>
            {cart.length === 0 ? (
              <p className="text-center text-sm text-gray-300 py-8">Agregá productos usando el buscador</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Producto</th>
                    <th className="th text-center">Cant.</th>
                    <th className="th">Precio unit.</th>
                    <th className="th">Subtotal</th>
                    <th className="th w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="td font-500 min-w-[220px]">
                        <div className="flex flex-col">
                          <span className="truncate">{item.name}</span>
                          <span className="text-xs text-gray-400 mt-0.5">ID: {item.id}</span>
                        </div>
                      </td>
                      <td className="td w-32 text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="font-700 text-sm w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            className="w-8 h-8 rounded-md bg-brand-navy flex items-center justify-center text-white hover:bg-brand-navyLight"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="td w-36 text-right">{fmt(item.salePrice)}</td>
                      <td className="td w-36 text-right font-700">{fmt(item.salePrice * item.quantity)}</td>
                      <td className="td w-12 text-center">
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600" aria-label="Eliminar item">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
          <div className="card flex-1 overflow-y-auto">
            <div className="card-header">
              <h3 className="card-title">Resumen</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2 pb-3 border-b border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                {matchedRedemption && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Descuento ({matchedRedemption.discount}%)</span>
                    <span>-{fmt(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-800">
                  <span>TOTAL</span>
                  <span>{fmt(total)}</span>
                </div>
              </div>

              {canUseClients && (
              <>
              <div>
                <div className="field-label mb-2">Cliente (opcional)</div>
                {selectedClient ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-greenBg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserRound size={14} className="text-green-700 flex-shrink-0" />
                      <span className="text-sm font-700 text-green-800 truncate">{selectedClient.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedClient(null); setRedemptionCode(''); }}
                      className="text-green-700 hover:text-green-900 flex-shrink-0"
                      aria-label="Quitar cliente"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente por nombre o teléfono..."
                      className="field-input text-sm"
                    />
                    {clientTerm.length > 2 && clientResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                        {clientResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{c.name}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {clientTerm.length > 2 && clientResults.length === 0 && (
                      <div className="text-xs text-gray-400 mt-1">Sin resultados — la venta se registra sin cliente</div>
                    )}
                  </div>
                )}
              </div>

              {selectedClient && pendingRedemptions.length > 0 && (
                <div>
                  <div className="field-label mb-2 flex items-center gap-1.5">
                    <Ticket size={13} />
                    Código de descuento
                  </div>
                  <input
                    value={redemptionCode}
                    onChange={(e) => setRedemptionCode(e.target.value)}
                    placeholder="Pedile el código al cliente"
                    className={`field-input text-sm ${matchedRedemption ? 'border-green-400' : trimmedRedemptionCode ? 'border-red-400' : ''}`}
                  />
                  {matchedRedemption ? (
                    <div className="text-xs text-green-700 mt-1">¡Código válido! Se aplica {matchedRedemption.discount}% de descuento.</div>
                  ) : trimmedRedemptionCode ? (
                    <div className="text-xs text-red-500 mt-1">Código inválido o no pertenece a este cliente.</div>
                  ) : (
                    <div className="text-xs text-gray-400 mt-1">Este cliente tiene {pendingRedemptions.length} código{pendingRedemptions.length === 1 ? '' : 's'} de descuento sin usar.</div>
                  )}
                </div>
              )}
              </>
              )}

              <div>
                <div className="field-label mb-2">Medio de pago</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      onClick={() => setPayment(method)}
                      className={`py-2.5 px-2 rounded-lg text-xs font-700 border-2 transition-all ${
                        payment === method
                          ? 'bg-brand-navy text-white border-brand-navy'
                          : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      {paymentLabel(method)}
                    </button>
                  ))}
                </div>
              </div>


              {payment === 'MIXED' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="field-group">
                      <label className="field-label">Efectivo</label>
                      <input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="field-input" />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Transferencia</label>
                      <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="field-input" />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Tarjeta</label>
                      <input type="number" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} className="field-input" />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total parciales</span>
                    <span className={`font-700 ${Math.abs((parseFloat(cashAmount || 0) + parseFloat(transferAmount || 0) + parseFloat(cardAmount || 0)) - total) <= 0.01 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmt((parseFloat(cashAmount || 0) + parseFloat(transferAmount || 0) + parseFloat(cardAmount || 0)))}
                    </span>
                  </div>
                </div>
              )}


              {cart.length > 0 && (
                <div className="bg-brand-greenBg rounded-lg px-3 py-2 text-xs text-green-800 font-500">
                  Ganás {fmt(margin)} en esta venta ({marginPct}% de margen)
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={isPending || cart.length === 0}
                className="btn-primary w-full py-3 text-base font-800 disabled:opacity-50"
              >
                {isPending ? 'Registrando...' : 'Confirmar venta'}
              </button>
              <button
                onClick={() => {
                  setCart([]);
                    setSearch('');
                    setClientSearch('');
                    setSelectedClient(null);
                }}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
