// src/components/screens/SalePage.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, X, Plus, Minus, UserPlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, fmt } from '../ui/index.jsx';

const PAYMENT = ['CASH', 'CARD', 'MIXED'];
const PAYMENT_LABEL = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', MIXED: '⚡ Mixto' };

export default function SalePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  // Buscar productos
  const { data: products = [], isFetching } = useQuery({
    queryKey: ['products-search', search],
    queryFn: () => api.get('/products', { params: { search } }).then((r) => r.data),
    enabled: search.length > 1,
  });

  // Buscar cliente
  const { data: clientResults = [] } = useQuery({
    queryKey: ['clients-search', clientSearch],
    queryFn: () => api.get('/clients', { params: { search: clientSearch } }).then((r) => r.data.clients),
    enabled: clientSearch.length > 2,
    select: (d) => d.slice(0, 5),
  });

  // Crear venta
  const { mutate: createSale, isPending } = useMutation({
    mutationFn: (body) => api.post('/sales', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('¡Venta registrada!');
      setCart([]);
      setSearch('');
      setPayment('CASH');
      setCashReceived('');
      setSelectedClient(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      navigate('/historial');
    },
  });

  const total = cart.reduce((s, i) => s + i.salePrice * i.quantity, 0);
  const change = payment === 'CASH' && cashReceived ? parseFloat(cashReceived) - total : null;
  const margin = cart.reduce((s, i) => s + (i.salePrice - i.costPrice) * i.quantity, 0);
  const marginPct = total > 0 ? Math.round((margin / total) * 100) : 0;

  // Calcular puntos que ganaría
  const pointsWould = selectedClient ? Math.floor(total / 100) : 0;

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...product, quantity: 1 }];
    });
    setSearch('');
  }

  function updateQty(id, delta) {
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
    );
  }

  function removeItem(id) { setCart((prev) => prev.filter((i) => i.id !== id)); }

  function handleConfirm() {
    if (!cart.length) return toast.error('Agregá al menos un producto');
    createSale({
      items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
      paymentMethod: payment,
      cashReceived: cashReceived ? parseFloat(cashReceived) : undefined,
      cashAmount: cashAmount ? parseFloat(cashAmount) : undefined,
      cardAmount: cardAmount ? parseFloat(cardAmount) : undefined,
      clientId: selectedClient?.id,
    });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Nueva venta" />
      <div className="flex flex-1 gap-5 p-6 overflow-hidden">

        {/* ── Izquierda: búsqueda + carrito ── */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto">

          {/* Buscador */}
          <div className="card">
            <div className="p-5">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o código de barras..."
                  className="field-input pl-9"
                  autoFocus
                />
              </div>

              {/* Resultados */}
              {search.length > 1 && (
                <div className="mt-3 space-y-2">
                  {isFetching && <p className="text-xs text-gray-400 py-2">Buscando...</p>}
                  {products.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div>
                        <div className="text-sm font-600 text-gray-800">{p.name}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={`text-xs font-700 ${p.stock <= p.minStock ? 'text-red-600' : 'text-green-700'}`}>
                            {p.stock} u. disponibles
                          </span>
                          <span className="text-xs text-gray-400">{fmt(p.salePrice)} c/u</span>
                        </div>
                      </div>
                      <button
                        onClick={() => addToCart(p)}
                        disabled={p.stock === 0}
                        className="btn-green text-sm px-3 py-1.5 disabled:opacity-40"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {!isFetching && search.length > 1 && products.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">No se encontraron productos</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Carrito */}
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
                      <td className="td font-500">{item.name}</td>
                      <td className="td">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                            <Minus size={10} />
                          </button>
                          <span className="font-700 text-sm min-w-[20px] text-center">{item.quantity}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded-md bg-brand-navy flex items-center justify-center text-white hover:bg-brand-navyLight">
                            <Plus size={10} />
                          </button>
                        </div>
                      </td>
                      <td className="td">{fmt(item.salePrice)}</td>
                      <td className="td font-700">{fmt(item.salePrice * item.quantity)}</td>
                      <td className="td">
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
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

        {/* ── Derecha: resumen y pago ── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4">
          <div className="card flex-1 overflow-y-auto">
            <div className="card-header">
              <h3 className="card-title">Resumen</h3>
            </div>
            <div className="p-5 space-y-4">
              {/* Totales */}
              <div className="space-y-2 pb-3 border-b border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{fmt(total)}</span>
                </div>
                <div className="flex justify-between text-base font-800">
                  <span>TOTAL</span>
                  <span>{fmt(total)}</span>
                </div>
              </div>

              {/* Medio de pago */}
              <div>
                <div className="field-label mb-2">Medio de pago</div>
                <div className="flex gap-2">
                  {PAYMENT.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPayment(p)}
                      className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-700 border-2 transition-all ${
                        payment === p
                          ? 'bg-brand-navy text-white border-brand-navy'
                          : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      {PAYMENT_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Efectivo */}
              {payment === 'CASH' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="field-group">
                    <label className="field-label">Recibido del cliente</label>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="Ej: 1000"
                      className="field-input"
                    />
                  </div>
                  {change !== null && change >= 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Vuelto</span>
                      <span className="font-800 text-green-700 text-base">{fmt(change)}</span>
                    </div>
                  )}
                  {change !== null && change < 0 && (
                    <p className="text-xs text-red-600">El monto recibido es menor al total</p>
                  )}
                </div>
              )}

              {/* Mixto */}
              {payment === 'MIXED' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="field-group">
                      <label className="field-label">Efectivo</label>
                      <input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="field-input" />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Tarjeta</label>
                      <input type="number" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} className="field-input" />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total parciales</span>
                    <span className={`font-700 ${
                      (parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0)) === total ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {fmt((parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0)))}
                    </span>
                  </div>
                </div>
              )}

              {/* Fidelización */}
              <div className="border-t border-gray-100 pt-3">
                <div className="field-label mb-2">Cliente con puntos (opcional)</div>
                {!selectedClient ? (
                  <div className="relative">
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="🔍 Teléfono o nombre..."
                      className="field-input text-xs"
                    />
                    {clientResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                        {clientResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            <span className="font-600">{c.name}</span>
                            <span className="text-gray-400 ml-2">· {c.points} pts</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-brand-greenBg rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-700 text-brand-sidebar">{selectedClient.name}</div>
                      <div className="text-xs text-green-700 mt-0.5">
                        {selectedClient.points} pts · +{pointsWould} pts con esta compra
                      </div>
                    </div>
                    <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Margen */}
              {cart.length > 0 && (
                <div className="bg-brand-greenBg rounded-lg px-3 py-2 text-xs text-green-800 font-500">
                  Ganás {fmt(margin)} en esta venta ({marginPct}% de margen)
                </div>
              )}

              {/* Confirmar */}
              <button
                onClick={handleConfirm}
                disabled={isPending || cart.length === 0}
                className="btn-primary w-full py-3 text-base font-800"
              >
                {isPending ? 'Registrando...' : '✓ Confirmar venta'}
              </button>
              <button
                onClick={() => { setCart([]); setSelectedClient(null); }}
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
