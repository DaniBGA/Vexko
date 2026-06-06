import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Shield, Store, Trash2 } from 'lucide-react';
import { useAdminAuthStore } from '../../store/adminAuthStore.js';
import { adminApi } from '../../lib/adminApi.js';
import { PageHeader, Spinner, EmptyState } from '../ui/index.jsx';

function buildEmail(kiosk) {
  const customerSlug = String(kiosk.customer?.name || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const kioskSlug = String(kiosk.name || 'sucursal').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${customerSlug}-${kioskSlug}-${kiosk.id.slice(0, 6)}@vexus.local`;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const user = useAdminAuthStore((s) => s.user);
  const [selectedKioskId, setSelectedKioskId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPlan, setCustomerPlan] = useState('BASE');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [kioskName, setKioskName] = useState('');
  const [kioskAddress, setKioskAddress] = useState('');
  const [kioskPhone, setKioskPhone] = useState('');
  const [kioskActive, setKioskActive] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-kiosks'],
    queryFn: () => adminApi.get('/admin/kiosks').then((r) => r.data),
  });

  const customers = data?.customers || [];
  const kiosks = useMemo(() => customers.flatMap((customer) => customer.kiosks.map((kiosk) => ({ ...kiosk, customer }))), [customers]);
  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === selectedKioskId) || kiosks[0] || null;

  useEffect(() => {
    if (customers.length === 0) {
      if (selectedCustomerId) {
        setSelectedCustomerId('');
      }
      return;
    }

    if (!customers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (kiosks.length === 0) {
      if (selectedKioskId) {
        setSelectedKioskId('');
      }
      return;
    }

    if (!kiosks.some((kiosk) => kiosk.id === selectedKioskId)) {
      setSelectedKioskId(kiosks[0].id);
    }
  }, [kiosks, selectedKioskId]);

  useEffect(() => {
    if (selectedKiosk) {
      setEmail(buildEmail(selectedKiosk));
      setName(selectedKiosk.name);
      setPassword('');
    }
  }, [selectedKiosk]);

  const createAccountMutation = useMutation({
    mutationFn: ({ id, body }) => adminApi.post(`/admin/kiosks/${id}/account`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Cuenta creada');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setPassword('');
    },
  });

  const createKioskMutation = useMutation({
    mutationFn: (body) => adminApi.post('/admin/kiosks', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Sucursal creada');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setKioskName('');
      setKioskAddress('');
      setKioskPhone('');
      setKioskActive(false);
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: (body) => adminApi.post('/admin/customers', body).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setSelectedCustomerId(data.customer.id);
      setCustomerName('');
      setCustomerPlan('BASE');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerAddress('');
      toast.success(data.existing ? 'Cliente existente seleccionado' : 'Cliente creado');
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (id) => adminApi.delete(`/admin/customers/${id}`).then((r) => r.data),
    onSuccess: (_, customerId) => {
      toast.success('Cliente borrado');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      if (selectedCustomerId === customerId) {
        setSelectedCustomerId('');
      }
      if (selectedKiosk && selectedKiosk.customer?.id === customerId) {
        setSelectedKioskId('');
      }
    },
  });

  const deleteKioskMutation = useMutation({
    mutationFn: (id) => adminApi.delete(`/admin/kiosks/${id}`).then((r) => r.data),
    onSuccess: (_, kioskId) => {
      toast.success('Sucursal borrada');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      if (selectedKioskId === kioskId) {
        setSelectedKioskId('');
      }
    },
  });

  function handleCreateCustomer(e) {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Ingresá el nombre del cliente');
      return;
    }

    createCustomerMutation.mutate({
      name: customerName,
      plan: customerPlan,
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress,
    });
  }

  function handleCreateKiosk(e) {
    e.preventDefault();
    if (!selectedCustomerId) {
      toast.error('Seleccioná un cliente');
      return;
    }
    if (!kioskName.trim()) {
      toast.error('Ingresá el nombre de la sucursal');
      return;
    }

    createKioskMutation.mutate({
      customerId: selectedCustomerId,
      name: kioskName,
      address: kioskAddress,
      phone: kioskPhone,
      active: kioskActive,
    });
  }

  function handleDeleteCustomer(customer) {
    if (!window.confirm(`¿Borrar el cliente "${customer.name}"? Se eliminarán también sus sucursales si no tienen movimientos.`)) {
      return;
    }

    deleteCustomerMutation.mutate(customer.id);
  }

  function handleDeleteKiosk(kiosk) {
    if (!window.confirm(`¿Borrar la sucursal "${kiosk.name}"?`)) {
      return;
    }

    deleteKioskMutation.mutate(kiosk.id);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedKiosk) return;
    if (!password.trim()) {
      toast.error('Ingresá una contraseña');
      return;
    }

    createAccountMutation.mutate({
      id: selectedKiosk.id,
      body: { email, password, name },
    });
  }

  if (user && user.role !== 'OWNER') {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <PageHeader title="Admin" subtitle="Solo para el dueño" />
        <div className="p-6">
          <EmptyState icon={Shield} title="Acceso restringido" description="Esta sección está disponible solo para el dueño del sistema." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Admin" subtitle="Cuentas por sucursal" />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Clientes y sucursales</h3>
            <span className="text-xs text-gray-400">Seleccioná la sucursal exacta a la que querés darle acceso</span>
          </div>

          <div className="p-5">
            {isLoading ? (
              <Spinner />
            ) : customers.length === 0 ? (
              <EmptyState icon={Store} title="No hay clientes" description="Primero necesitás crear un cliente para empezar a cargar sucursales." />
            ) : (
              <div className="space-y-4">
                {customers.map((customer) => (
                  <div key={customer.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-700 text-gray-900">{customer.name}</div>
                        <div className="text-xs text-gray-500">{customer.kiosks.length} sucursal{customer.kiosks.length === 1 ? '' : 'es'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomer(customer)}
                        disabled={deleteCustomerMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-700 text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        Borrar cliente
                      </button>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {customer.kiosks.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 bg-white">
                          Este cliente no tiene sucursales todavía.
                        </div>
                      ) : customer.kiosks.map((kiosk) => {
                        const hasAccount = Boolean(kiosk.user);
                        const isActive = kiosk.active;
                        return (
                          <div key={kiosk.id} className={`w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 ${selectedKiosk?.id === kiosk.id ? 'bg-white' : 'bg-white'}`}>
                            <button type="button" className="flex-1 text-left" onClick={() => setSelectedKioskId(kiosk.id)}>
                              <div>
                                <div className="font-600 text-gray-900">{kiosk.name}</div>
                                <div className="text-xs text-gray-500">{kiosk.address || 'Sin dirección'} · {kiosk.phone || 'Sin teléfono'}</div>
                                <div className="text-xs mt-1">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {isActive ? 'Activa' : 'Inactiva'}
                                  </span>
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className={`text-sm font-600 ${hasAccount ? 'text-green-700' : 'text-amber-700'}`}>{hasAccount ? 'Cuenta activa' : 'Sin cuenta'}</div>
                                <div className="text-xs text-gray-500">{hasAccount ? kiosk.user.email : 'Listo para crear'}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteKiosk(kiosk)}
                                disabled={deleteKioskMutation.isPending}
                                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50 disabled:opacity-60"
                                title="Borrar sucursal"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">Cliente</h3>
            <span className="text-xs text-gray-400">Elegí uno existente o creá uno nuevo acá mismo</span>
          </div>

          <div className="p-5 border-b border-slate-200 space-y-5">
            <div className="field-group">
              <label className="field-label">Cliente existente</label>
              <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="field-input">
                <option value="">Seleccionar cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Crear cliente nuevo</div>
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div className="field-group">
                  <label className="field-label">Nombre</label>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="field-input" placeholder="Kiosco Pepe" />
                </div>

                <div className="field-group">
                  <label className="field-label">Plan</label>
                  <select value={customerPlan} onChange={(e) => setCustomerPlan(e.target.value)} className="field-input">
                    <option value="BASE">Global</option>
                    <option value="INTERMEDIO">Intermedio</option>
                    <option value="PREMIUM">Premium</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="field-input" placeholder="Opcional" />
                </div>

                <div className="field-group">
                  <label className="field-label">Teléfono</label>
                  <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="field-input" placeholder="Opcional" />
                </div>

                <div className="field-group">
                  <label className="field-label">Dirección</label>
                  <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="field-input" placeholder="Opcional" />
                </div>

                <button type="submit" className="btn-secondary w-full" disabled={createCustomerMutation.isPending}>
                  {createCustomerMutation.isPending ? 'Guardando...' : 'Crear cliente y seleccionarlo'}
                </button>
              </form>
            </div>
          </div>

          <div className="card-header">
            <h3 className="card-title">Crear sucursal</h3>
            <span className="text-xs text-gray-400">Podés dejarla inactiva y darle el nombre que quieras</span>
          </div>

          <div className="p-5 border-b border-slate-200">
            <form onSubmit={handleCreateKiosk} className="space-y-4">
              <div className="field-group">
                <label className="field-label">Cliente</label>
                <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="field-input">
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Nombre de la sucursal</label>
                <input value={kioskName} onChange={(e) => setKioskName(e.target.value)} className="field-input" placeholder="kiosco pepe, sucursal 2" />
              </div>

              <div className="field-group">
                <label className="field-label">Dirección</label>
                <input value={kioskAddress} onChange={(e) => setKioskAddress(e.target.value)} className="field-input" placeholder="Opcional" />
              </div>

              <div className="field-group">
                <label className="field-label">Teléfono</label>
                <input value={kioskPhone} onChange={(e) => setKioskPhone(e.target.value)} className="field-input" placeholder="Opcional" />
              </div>

              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input type="checkbox" checked={kioskActive} onChange={(e) => setKioskActive(e.target.checked)} />
                Sucursal activa
              </label>

              <button type="submit" className="btn-primary w-full" disabled={createKioskMutation.isPending || customers.length === 0}>
                {createKioskMutation.isPending ? 'Creando...' : 'Crear sucursal'}
              </button>
            </form>
          </div>

          <div className="card-header">
            <h3 className="card-title">Crear cuenta</h3>
            <span className="text-xs text-gray-400">La cuenta queda asociada a una sucursal puntual</span>
          </div>

          <div className="p-5">
            {selectedKiosk ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Sucursal seleccionada</div>
                  <div className="text-lg font-700 text-brand-sidebar">{selectedKiosk.name}</div>
                  <div className="text-sm text-gray-500">{selectedKiosk.customer?.name || 'Cliente'}</div>
                  <div className="text-sm text-gray-500">{selectedKiosk.address || 'Sin dirección'}</div>
                </div>

                <div className="field-group">
                  <label className="field-label">Nombre de acceso</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="field-input" />
                </div>

                <div className="field-group">
                  <label className="field-label">Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" />
                </div>

                <div className="field-group">
                  <label className="field-label">Contraseña temporal</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" placeholder="Asigná una contraseña" />
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4 text-sm text-gray-600">
                  La cuenta queda vinculada a esa sucursal y podrá entrar al sistema con esos datos.
                </div>

                <button type="submit" className="btn-primary w-full" disabled={createAccountMutation.isPending}>
                  {createAccountMutation.isPending ? 'Creando...' : 'Crear cuenta'}
                </button>
              </form>
            ) : (
              <EmptyState icon={Store} title="Seleccioná una sucursal" description="Elegí una sucursal para cargarle una cuenta de acceso." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}