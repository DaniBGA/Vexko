import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Shield, Store, Trash2, Building2, KeyRound, Check, Power, ArrowLeft,
  PlusCircle, ListChecks, Copy, Eye, EyeOff, Wand2, PartyPopper, ListTree, Wallet, Settings,
} from 'lucide-react';
import { useAdminAuthStore } from '../../store/adminAuthStore.js';
import { adminApi } from '../../lib/adminApi.js';
import { PageHeader, Spinner, EmptyState } from '../ui/index.jsx';
import SubscriptionPanel, { SubscriptionBadge } from '../admin/SubscriptionPanel.jsx';
import SettingsPanel from '../admin/SettingsPanel.jsx';

const NAVY = '#1c2050';
const GREEN = '#4caf82';

const PLAN_LABELS = { BASE: 'Base', INTERMEDIO: 'Intermedio', PREMIUM: 'Premium' };
const PLAN_CHOICES = [
  { value: 'BASE', label: 'Base', desc: 'Venta, stock y caja' },
  { value: 'INTERMEDIO', label: 'Intermedio', desc: 'Todo lo de Base + historial, gastos, resultados y proveedores' },
  { value: 'PREMIUM', label: 'Premium', desc: 'Todo lo de Intermedio + clientes y puntos' },
];
const PASSWORD_WORDS = ['Sol', 'Luna', 'Rio', 'Mar', 'Cielo', 'Flor', 'Nube', 'Pino', 'Trigo', 'Estrella'];

function buildEmail(kiosk) {
  const customerSlug = String(kiosk.customer?.name || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const kioskSlug = String(kiosk.name || 'sucursal').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${customerSlug}-${kioskSlug}-${kiosk.id.slice(0, 6)}@vexus.local`;
}

function generateSimplePassword() {
  const word = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}${digits}`;
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error('No se pudo copiar, seleccionalo con el mouse');
  }
}

function CopyButton({ value, label }) {
  return (
    <button
      type="button"
      onClick={() => copyText(value, label)}
      className="inline-flex items-center gap-1.5 text-xs font-700 rounded-lg px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 flex-shrink-0"
      style={{ color: NAVY }}
    >
      <Copy size={13} /> Copiar
    </button>
  );
}

/* Big numbered progress bar — informational only, no clicking to jump around */
function ProgressBar({ step }) {
  const labels = ['Kiosco', 'Sucursal', 'Cuenta'];
  return (
    <div className="flex items-center mb-8">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'pending';
        return (
          <div key={label} className={`flex items-center ${i < labels.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center font-800 text-lg"
                style={{
                  background: state === 'pending' ? '#eef0f7' : state === 'done' ? GREEN : NAVY,
                  color: state === 'pending' ? '#9ca3af' : '#fff',
                }}
              >
                {state === 'done' ? <Check size={20} /> : n}
              </div>
              <span className={`text-xs font-700 ${state === 'pending' ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className="flex-1 h-1.5 mx-2 rounded-full" style={{ background: n < step ? GREEN : '#eef0f7', marginBottom: 20 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Big, tappable choice card used everywhere instead of dropdowns */
function ChoiceCard({ selected, onClick, icon: Icon, title, subtitle, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border-2 p-5 flex items-center gap-4 transition"
      style={{ borderColor: selected ? GREEN : '#e5e7eb', background: selected ? '#e8f8ee' : '#fff' }}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: selected ? GREEN : '#eef0f7' }}>
          <Icon size={22} color={selected ? '#fff' : NAVY} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-800 text-gray-900 text-base">{title}</div>
        {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
      </div>
      {right}
      {selected && <Check size={22} style={{ color: GREEN }} className="flex-shrink-0" />}
    </button>
  );
}

function BackLink({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-700 mb-2" style={{ color: NAVY }}>
      <ArrowLeft size={15} /> {children}
    </button>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const user = useAdminAuthStore((s) => s.user);

  const [tab, setTab] = useState('wizard'); // 'wizard' | 'manage' | 'settings'
  const [uiStep, setUiStep] = useState(1);
  const [step1Choice, setStep1Choice] = useState(null); // null | 'new' | 'existing'
  const [step2Choice, setStep2Choice] = useState(null); // null | 'new' | 'existing'
  const [justCreated, setJustCreated] = useState(null);

  const [selectedKioskId, setSelectedKioskId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPlan, setCustomerPlan] = useState('BASE');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [showCustomerExtra, setShowCustomerExtra] = useState(false);
  const [kioskName, setKioskName] = useState('');
  const [kioskAddress, setKioskAddress] = useState('');
  const [kioskPhone, setKioskPhone] = useState('');
  const [showKioskExtra, setShowKioskExtra] = useState(false);
  const [kioskActive, setKioskActive] = useState(true);
  const [email, setEmail] = useState('');
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [openSubscriptionId, setOpenSubscriptionId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-kiosks'],
    queryFn: () => adminApi.get('/admin/kiosks').then((r) => r.data),
  });

  const customers = data?.customers || [];
  const kiosks = useMemo(() => customers.flatMap((customer) => customer.kiosks.map((kiosk) => ({ ...kiosk, customer }))), [customers]);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;
  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === selectedKioskId) || null;
  // Cobranzas que requieren atención (se muestran arriba de "Ver mis kioscos").
  const warningCustomers = customers.filter((c) => c.subscription?.status === 'WARNING');
  const blockedCustomers = customers.filter((c) => c.subscription?.status === 'BLOCKED');

  useEffect(() => {
    if (selectedCustomerId && !customers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId('');
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (selectedKioskId && !kiosks.some((k) => k.id === selectedKioskId)) {
      setSelectedKioskId('');
    }
  }, [kiosks, selectedKioskId]);

  useEffect(() => {
    setStep2Choice(null);
  }, [selectedCustomerId]);

  useEffect(() => {
    if (selectedKiosk) {
      setEmail(buildEmail(selectedKiosk));
      setName(selectedKiosk.name);
      setPassword('');
      setShowPassword(false);
      setShowEmailEdit(false);
      setJustCreated(null);
      setShowPasswordChange(false);
      setNewPassword('');
      setShowNewPassword(false);
    }
    // Depend on the id (not the object) so a background refetch — which returns a
    // new object reference for the same kiosk — doesn't reset the form/success screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKioskId]);

  const createAccountMutation = useMutation({
    mutationFn: ({ id, body }) => adminApi.post(`/admin/kiosks/${id}/account`, body).then((r) => r.data),
    onSuccess: (_data, variables) => {
      toast.success('¡Cuenta creada!');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setJustCreated({ mode: 'created', email: variables.body.email, password: variables.body.password, name: variables.body.name });
      setPassword('');
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: ({ id, body }) => adminApi.patch(`/admin/kiosks/${id}/account`, body).then((r) => r.data),
    onSuccess: (data, variables) => {
      toast.success('¡Contraseña actualizada!');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setJustCreated({ mode: 'updated', email: data.user.email, password: variables.body.password, name: data.user.name });
      setShowPasswordChange(false);
      setNewPassword('');
    },
  });

  const createKioskMutation = useMutation({
    mutationFn: (body) => adminApi.post('/admin/kiosks', body).then((r) => r.data),
    onSuccess: (data) => {
      toast.success('Sucursal creada');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setSelectedKioskId(data.kiosk.id);
      setUiStep(3);
      setKioskName('');
      setKioskAddress('');
      setKioskPhone('');
      setShowKioskExtra(false);
      setKioskActive(true);
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: (body) => adminApi.post('/admin/customers', body).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setSelectedCustomerId(data.customer.id);
      setSelectedKioskId('');
      setUiStep(2);
      setCustomerName('');
      setCustomerPlan('BASE');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerAddress('');
      setShowCustomerExtra(false);
      toast.success(data.existing ? 'Ese kiosco ya estaba cargado, lo seleccionamos' : '¡Kiosco creado!');
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (id) => adminApi.delete(`/admin/customers/${id}`).then((r) => r.data),
    onSuccess: (_, customerId) => {
      toast.success('Cliente borrado');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      if (selectedCustomerId === customerId) {
        setSelectedCustomerId('');
        setUiStep(1);
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
        setUiStep(2);
      }
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => adminApi.patch(`/admin/kiosks/${id}`, { active }).then((r) => r.data),
    onSuccess: (_, { active }) => {
      toast.success(active ? 'Sucursal activada' : 'Sucursal desactivada');
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
    },
  });

  function resetWizard() {
    setSelectedCustomerId('');
    setSelectedKioskId('');
    setStep1Choice(null);
    setStep2Choice(null);
    setJustCreated(null);
    setUiStep(1);
  }

  function addAnotherKiosk() {
    setSelectedKioskId('');
    setStep2Choice('new');
    setJustCreated(null);
    setUiStep(2);
  }

  function pickExistingCustomer(customer) {
    setSelectedCustomerId(customer.id);
    setSelectedKioskId('');
    setUiStep(2);
  }

  function pickExistingKiosk(kiosk, customer) {
    setSelectedCustomerId(customer.id);
    setSelectedKioskId(kiosk.id);
    setUiStep(3);
  }

  function goToAccountStep(kiosk, customer) {
    setTab('wizard');
    setSelectedCustomerId(customer.id);
    setSelectedKioskId(kiosk.id);
    setUiStep(3);
  }

  function handleCreateCustomer(e) {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Ingresá el nombre del kiosco');
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
      toast.error('Elegí un kiosco primero');
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
    if (!window.confirm(`¿Borrar el kiosco "${customer.name}"? Se eliminarán también sus sucursales si no tienen movimientos.`)) {
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

  function handleToggleActive(kiosk) {
    toggleActiveMutation.mutate({ id: kiosk.id, active: !kiosk.active });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedKiosk) return;
    if (!password.trim()) {
      toast.error('Ponele una contraseña a la cuenta');
      return;
    }

    createAccountMutation.mutate({
      id: selectedKiosk.id,
      body: { email, password, name },
    });
  }

  function handleUpdatePassword(e) {
    e.preventDefault();
    if (!selectedKiosk?.user) return;
    if (!newPassword.trim()) {
      toast.error('Escribí la contraseña nueva');
      return;
    }

    updatePasswordMutation.mutate({
      id: selectedKiosk.id,
      body: { password: newPassword },
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
      <PageHeader title="Admin" subtitle="Cargá kioscos nuevos paso a paso, o administrá los que ya cargaste" />

      {/* Selector de sección — grande y simple */}
      <div className="px-6 pt-5">
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setTab('wizard')}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-800 transition"
            style={tab === 'wizard' ? { background: NAVY, color: '#fff' } : { color: '#6b7280' }}
          >
            <PlusCircle size={17} /> Cargar un kiosco
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-800 transition"
            style={tab === 'manage' ? { background: NAVY, color: '#fff' } : { color: '#6b7280' }}
          >
            <ListTree size={17} /> Ver mis kioscos {kiosks.length > 0 && `(${kiosks.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-800 transition"
            style={tab === 'settings' ? { background: NAVY, color: '#fff' } : { color: '#6b7280' }}
          >
            <Settings size={17} /> Configuración
          </button>
        </div>
      </div>

      {tab === 'settings' ? (
        <div className="p-6 max-w-2xl w-full mx-auto">
          <SettingsPanel />
        </div>
      ) : tab === 'wizard' ? (
        <div className="p-6 max-w-2xl w-full mx-auto">
          <div className="card p-6 sm:p-8">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <ProgressBar step={uiStep} />

                {/* ============ PASO 1 ============ */}
                {uiStep === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-800 text-gray-900">¿Qué kiosco vas a cargar?</h2>
                      <p className="text-sm text-gray-500 mt-1">Es el negocio dueño de una o más sucursales.</p>
                    </div>

                    {step1Choice === null && (
                      <div className="space-y-3">
                        <ChoiceCard
                          icon={PlusCircle}
                          title="Es un kiosco nuevo"
                          subtitle="Todavía no lo cargamos al sistema"
                          onClick={() => setStep1Choice('new')}
                        />
                        {customers.length > 0 && (
                          <ChoiceCard
                            icon={ListChecks}
                            title="Ya lo cargué antes"
                            subtitle="Quiero agregarle una sucursal o una cuenta"
                            onClick={() => setStep1Choice('existing')}
                          />
                        )}
                      </div>
                    )}

                    {step1Choice === 'existing' && (
                      <div className="space-y-3">
                        <BackLink onClick={() => setStep1Choice(null)}>Volver</BackLink>
                        {customers.map((customer) => (
                          <ChoiceCard
                            key={customer.id}
                            icon={Building2}
                            title={customer.name}
                            subtitle={`Plan ${PLAN_LABELS[customer.plan] || customer.plan} · ${customer.kiosks.length} sucursal${customer.kiosks.length === 1 ? '' : 'es'}`}
                            onClick={() => pickExistingCustomer(customer)}
                          />
                        ))}
                      </div>
                    )}

                    {step1Choice === 'new' && (
                      <div className="space-y-5">
                        {customers.length > 0 && <BackLink onClick={() => setStep1Choice(null)}>Volver</BackLink>}
                        <form onSubmit={handleCreateCustomer} className="space-y-5">
                          <div className="field-group">
                            <label className="field-label text-sm">Nombre del kiosco</label>
                            <input
                              autoFocus
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              className="field-input text-base py-3"
                              placeholder="Ej: Kiosco Pepe"
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label text-sm">Plan de suscripción</label>
                            <div className="space-y-2.5 mt-1">
                              {PLAN_CHOICES.map((plan) => (
                                <ChoiceCard
                                  key={plan.value}
                                  selected={customerPlan === plan.value}
                                  title={plan.label}
                                  subtitle={plan.desc}
                                  onClick={() => setCustomerPlan(plan.value)}
                                />
                              ))}
                            </div>
                          </div>

                          {!showCustomerExtra ? (
                            <button
                              type="button"
                              onClick={() => setShowCustomerExtra(true)}
                              className="text-sm font-700"
                              style={{ color: NAVY }}
                            >
                              + Agregar teléfono, email o dirección (no es necesario)
                            </button>
                          ) : (
                            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="field-group">
                                <label className="field-label">Teléfono</label>
                                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="field-input" placeholder="Opcional" />
                              </div>
                              <div className="field-group">
                                <label className="field-label">Email</label>
                                <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="field-input" placeholder="Opcional" />
                              </div>
                              <div className="field-group">
                                <label className="field-label">Dirección</label>
                                <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="field-input" placeholder="Opcional" />
                              </div>
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full rounded-xl text-white font-800 text-base py-4 transition disabled:opacity-60"
                            style={{ background: GREEN }}
                            disabled={createCustomerMutation.isPending}
                          >
                            {createCustomerMutation.isPending ? 'Guardando...' : 'Siguiente →'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}

                {/* ============ PASO 2 ============ */}
                {uiStep === 2 && (
                  <div className="space-y-5">
                    {!selectedCustomer ? (
                      <EmptyState icon={Building2} title="Elegí un kiosco" description="Volvé al paso 1 para elegir o crear un kiosco." />
                    ) : (
                      <>
                        <BackLink onClick={() => setUiStep(1)}>Volver</BackLink>
                        <div>
                          <h2 className="text-xl font-800 text-gray-900">Sucursal de {selectedCustomer.name}</h2>
                          <p className="text-sm text-gray-500 mt-1">Cada local físico tiene su propia caja, stock y cuenta para entrar.</p>
                        </div>

                        {selectedCustomer.kiosks.length > 0 && step2Choice === null && (
                          <div className="space-y-3">
                            <ChoiceCard
                              icon={PlusCircle}
                              title="Agregar una sucursal nueva"
                              onClick={() => setStep2Choice('new')}
                            />
                            <ChoiceCard
                              icon={ListChecks}
                              title="Usar una sucursal que ya cargué"
                              subtitle={`${selectedCustomer.kiosks.length} sucursal${selectedCustomer.kiosks.length === 1 ? '' : 'es'} cargada${selectedCustomer.kiosks.length === 1 ? '' : 's'}`}
                              onClick={() => setStep2Choice('existing')}
                            />
                          </div>
                        )}

                        {selectedCustomer.kiosks.length > 0 && step2Choice === 'existing' && (
                          <div className="space-y-3">
                            <BackLink onClick={() => setStep2Choice(null)}>Volver</BackLink>
                            {selectedCustomer.kiosks.map((kiosk) => (
                              <ChoiceCard
                                key={kiosk.id}
                                icon={Store}
                                title={kiosk.name}
                                subtitle={kiosk.user ? `Ya tiene cuenta (${kiosk.user.email})` : 'Todavía sin cuenta'}
                                onClick={() => pickExistingKiosk(kiosk, selectedCustomer)}
                              />
                            ))}
                          </div>
                        )}

                        {(selectedCustomer.kiosks.length === 0 || step2Choice === 'new') && (
                          <div className="space-y-5">
                            {selectedCustomer.kiosks.length > 0 && <BackLink onClick={() => setStep2Choice(null)}>Volver</BackLink>}
                            <form onSubmit={handleCreateKiosk} className="space-y-5">
                              <div className="field-group">
                                <label className="field-label text-sm">Nombre de la sucursal</label>
                                <input
                                  autoFocus
                                  value={kioskName}
                                  onChange={(e) => setKioskName(e.target.value)}
                                  className="field-input text-base py-3"
                                  placeholder="Ej: Sucursal Centro"
                                />
                              </div>

                              {!showKioskExtra ? (
                                <button type="button" onClick={() => setShowKioskExtra(true)} className="text-sm font-700" style={{ color: NAVY }}>
                                  + Agregar dirección o teléfono (no es necesario)
                                </button>
                              ) : (
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <div className="field-group">
                                    <label className="field-label">Dirección</label>
                                    <input value={kioskAddress} onChange={(e) => setKioskAddress(e.target.value)} className="field-input" placeholder="Opcional" />
                                  </div>
                                  <div className="field-group">
                                    <label className="field-label">Teléfono</label>
                                    <input value={kioskPhone} onChange={(e) => setKioskPhone(e.target.value)} className="field-input" placeholder="Opcional" />
                                  </div>
                                </div>
                              )}

                              <label
                                className="flex items-start gap-3 text-sm text-gray-700 rounded-2xl border-2 p-4"
                                style={{ borderColor: kioskActive ? GREEN : '#e5e7eb', background: kioskActive ? '#e8f8ee' : '#fff' }}
                              >
                                <input type="checkbox" checked={kioskActive} onChange={(e) => setKioskActive(e.target.checked)} className="mt-0.5 w-5 h-5" />
                                <span>
                                  <span className="font-800 text-base text-gray-900">Dejar la sucursal activa</span>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    Recomendado. Si la desactivás, la cuenta que crees en el paso siguiente no va a poder entrar hasta que la actives (lo podés hacer después en "Ver mis kioscos").
                                  </div>
                                </span>
                              </label>

                              <button
                                type="submit"
                                className="w-full rounded-xl text-white font-800 text-base py-4 transition disabled:opacity-60"
                                style={{ background: GREEN }}
                                disabled={createKioskMutation.isPending}
                              >
                                {createKioskMutation.isPending ? 'Creando...' : 'Siguiente →'}
                              </button>
                            </form>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ============ PASO 3 ============ */}
                {uiStep === 3 && (
                  <div className="space-y-5">
                    {!selectedKiosk ? (
                      <EmptyState icon={Store} title="Elegí una sucursal" description="Volvé al paso 2 para crear o elegir una sucursal." />
                    ) : justCreated ? (
                      <div className="space-y-5 text-center">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#e8f8ee' }}>
                          <PartyPopper size={30} style={{ color: GREEN }} />
                        </div>
                        <div>
                          <h2 className="text-xl font-800 text-gray-900">
                            {justCreated.mode === 'updated' ? '¡Contraseña actualizada!' : '¡Listo, la cuenta ya está creada!'}
                          </h2>
                          <p className="text-sm text-gray-500 mt-1">
                            {justCreated.mode === 'updated'
                              ? 'La contraseña anterior dejó de funcionar. Pasale estos datos actualizados a la persona que usa esta sucursal.'
                              : 'Anotá o copiá estos datos y pasáselos a la persona que va a usar esta sucursal.'}
                          </p>
                        </div>

                        <div className="rounded-2xl border-2 p-5 text-left space-y-4" style={{ borderColor: GREEN, background: '#f7fdfa' }}>
                          <div>
                            <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700 mb-1">Usuario para entrar</div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-800 text-base text-gray-900 break-all">{justCreated.email}</div>
                              <CopyButton value={justCreated.email} label="Usuario" />
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700 mb-1">Contraseña</div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-800 text-base text-gray-900">{justCreated.password}</div>
                              <CopyButton value={justCreated.password} label="Contraseña" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <button
                            type="button"
                            onClick={addAnotherKiosk}
                            className="w-full rounded-xl text-white font-800 text-base py-4"
                            style={{ background: NAVY }}
                          >
                            Cargar otra sucursal para {selectedCustomer?.name}
                          </button>
                          <button
                            type="button"
                            onClick={resetWizard}
                            className="w-full rounded-xl font-800 text-base py-4 border-2"
                            style={{ borderColor: '#e5e7eb', color: NAVY }}
                          >
                            Cargar un kiosco nuevo
                          </button>
                        </div>
                      </div>
                    ) : selectedKiosk.user ? (
                      <div className="space-y-4">
                        <BackLink onClick={() => setUiStep(2)}>Volver</BackLink>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1">
                          <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Sucursal</div>
                          <div className="text-lg font-800" style={{ color: NAVY }}>{selectedKiosk.name}</div>
                          <div className="text-sm text-gray-500">{selectedKiosk.customer?.name}</div>
                        </div>
                        <div className="rounded-2xl border p-5 flex items-start gap-3" style={{ background: '#e8f8ee', borderColor: '#cdeedd' }}>
                          <Check size={20} style={{ color: '#2e7d32' }} className="flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-gray-700">
                            Esta sucursal ya tiene una cuenta creada:
                            <div className="font-800 text-base text-gray-900 mt-1">{selectedKiosk.user.email}</div>
                          </div>
                        </div>

                        {!showPasswordChange ? (
                          <button
                            type="button"
                            onClick={() => setShowPasswordChange(true)}
                            className="w-full rounded-xl font-800 text-base py-4 border-2 inline-flex items-center justify-center gap-2"
                            style={{ borderColor: NAVY, color: NAVY }}
                          >
                            <KeyRound size={17} /> Cambiar la contraseña
                          </button>
                        ) : (
                          <form onSubmit={handleUpdatePassword} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm text-gray-600">
                              Le vas a poner una contraseña nueva a esta cuenta. La anterior deja de funcionar apenas la guardes.
                            </p>

                            <div className="field-group">
                              <label className="field-label text-sm">Contraseña nueva</label>
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  type={showNewPassword ? 'text' : 'password'}
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  className="field-input text-base py-3"
                                  placeholder="Escribila o generá una"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowNewPassword((v) => !v)}
                                  className="flex-shrink-0 rounded-xl border border-slate-200 p-3 bg-white"
                                  title={showNewPassword ? 'Ocultar' : 'Mostrar'}
                                >
                                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPassword(generateSimplePassword());
                                  setShowNewPassword(true);
                                }}
                                className="inline-flex items-center gap-1.5 text-sm font-700 mt-2"
                                style={{ color: NAVY }}
                              >
                                <Wand2 size={15} /> Generar una contraseña fácil
                              </button>
                            </div>

                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowPasswordChange(false);
                                  setNewPassword('');
                                }}
                                className="flex-1 rounded-xl font-800 text-base py-3 border-2 bg-white"
                                style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                className="flex-1 rounded-xl text-white font-800 text-base py-3 disabled:opacity-60"
                                style={{ background: GREEN }}
                                disabled={updatePasswordMutation.isPending}
                              >
                                {updatePasswordMutation.isPending ? 'Guardando...' : 'Guardar'}
                              </button>
                            </div>
                          </form>
                        )}

                        <button type="button" onClick={addAnotherKiosk} className="w-full rounded-xl text-white font-800 text-base py-4" style={{ background: NAVY }}>
                          Cargar otra sucursal
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <BackLink onClick={() => setUiStep(2)}>Volver</BackLink>
                        <div>
                          <h2 className="text-xl font-800 text-gray-900">Cuenta para entrar al sistema</h2>
                          <p className="text-sm text-gray-500 mt-1">Con esto la persona a cargo de la sucursal va a poder iniciar sesión todos los días.</p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1">
                          <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Sucursal</div>
                          <div className="text-lg font-800" style={{ color: NAVY }}>{selectedKiosk.name}</div>
                          {!selectedKiosk.active && (
                            <div className="text-xs rounded-lg bg-amber-50 text-amber-700 px-2 py-1.5 mt-1">
                              Está inactiva: la cuenta se va a crear igual, pero no va a poder entrar hasta que la actives en "Ver mis kioscos".
                            </div>
                          )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                          <div className="field-group">
                            <label className="field-label text-sm">Nombre de la persona (o de la sucursal)</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} className="field-input text-base py-3" />
                          </div>

                          {!showEmailEdit ? (
                            <div className="text-sm text-gray-500 rounded-xl bg-slate-50 border border-slate-200 p-3">
                              Van a entrar con el usuario <strong className="text-gray-800 break-all">{email}</strong>.{' '}
                              <button type="button" onClick={() => setShowEmailEdit(true)} className="font-700 underline" style={{ color: NAVY }}>
                                Cambiarlo
                              </button>
                            </div>
                          ) : (
                            <div className="field-group">
                              <label className="field-label">Usuario (email)</label>
                              <input value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" />
                            </div>
                          )}

                          <div className="field-group">
                            <label className="field-label text-sm">Contraseña</label>
                            <div className="flex items-center gap-2">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="field-input text-base py-3"
                                placeholder="Escribila o generá una"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="flex-shrink-0 rounded-xl border border-slate-200 p-3"
                                title={showPassword ? 'Ocultar' : 'Mostrar'}
                              >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPassword(generateSimplePassword());
                                setShowPassword(true);
                              }}
                              className="inline-flex items-center gap-1.5 text-sm font-700 mt-2"
                              style={{ color: NAVY }}
                            >
                              <Wand2 size={15} /> Generar una contraseña fácil
                            </button>
                          </div>

                          <button
                            type="submit"
                            className="w-full rounded-xl text-white font-800 text-base py-4 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                            style={{ background: GREEN }}
                            disabled={createAccountMutation.isPending}
                          >
                            <KeyRound size={17} />
                            {createAccountMutation.isPending ? 'Creando...' : 'Crear cuenta'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* ============ VER Y ADMINISTRAR ============ */
        <div className="p-6 max-w-3xl w-full mx-auto">
          <div className="card overflow-hidden">
            <div className="card-header">
              <h3 className="font-800 text-gray-900">Mis kioscos</h3>
              <span className="text-xs text-gray-400">Activá, desactivá o borrá lo que ya cargaste</span>
            </div>

            <div className="p-5">
              {(warningCustomers.length > 0 || blockedCustomers.length > 0) && (
                <div className="mb-4 space-y-2">
                  {blockedCustomers.length > 0 && (
                    <div className="rounded-xl px-4 py-3 text-sm font-700" style={{ background: '#fdecea', color: '#c0392b' }}>
                      {blockedCustomers.length} inhabilitado{blockedCustomers.length === 1 ? '' : 's'} por falta de pago: {blockedCustomers.map((c) => c.name).join(', ')}
                    </div>
                  )}
                  {warningCustomers.length > 0 && (
                    <div className="rounded-xl px-4 py-3 text-sm font-700" style={{ background: '#fff4e0', color: '#b45309' }}>
                      {warningCustomers.length} con la cuota vencida, en los días de gracia: {warningCustomers.map((c) => `${c.name} (${c.subscription.daysLeft} d)`).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {isLoading ? (
                <Spinner />
              ) : customers.length === 0 ? (
                <EmptyState icon={Store} title="Todavía no cargaste nada" description="Andá a 'Cargar un kiosco' para empezar." />
              ) : (
                <div className="space-y-4">
                  {customers.map((customer) => (
                    <div key={customer.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-800 text-gray-900">{customer.name}</div>
                            <span className="text-[10px] font-800 uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: '#e8f8ee', color: '#2e7d32' }}>
                              {PLAN_LABELS[customer.plan] || customer.plan}
                            </span>
                            <SubscriptionBadge subscription={customer.subscription} />
                          </div>
                          <div className="text-xs text-gray-500">{customer.kiosks.length} sucursal{customer.kiosks.length === 1 ? '' : 'es'}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setOpenSubscriptionId((current) => (current === customer.id ? null : customer.id))}
                            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-800"
                            style={openSubscriptionId === customer.id ? { background: NAVY, color: '#fff' } : { background: '#eef0f7', color: NAVY }}
                          >
                            <Wallet size={14} />
                            Suscripción
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomer(customer)}
                            disabled={deleteCustomerMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-700 text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            Borrar
                          </button>
                        </div>
                      </div>

                      {openSubscriptionId === customer.id && customer.subscription && (
                        <SubscriptionPanel customer={customer} />
                      )}

                      <div className="divide-y divide-slate-200">
                        {customer.kiosks.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 bg-white">
                            Sin sucursales todavía.{' '}
                            <button
                              type="button"
                              className="font-700 underline"
                              style={{ color: NAVY }}
                              onClick={() => {
                                setTab('wizard');
                                pickExistingCustomer(customer);
                              }}
                            >
                              Cargarle una
                            </button>
                          </div>
                        ) : customer.kiosks.map((kiosk) => {
                          const hasAccount = Boolean(kiosk.user);
                          return (
                            <div key={kiosk.id} className="w-full px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                              <div className="min-w-0">
                                <div className="font-700 text-gray-900 truncate">{kiosk.name}</div>
                                <div className="text-xs text-gray-500">{kiosk.address || 'Sin dirección'} · {kiosk.phone || 'Sin teléfono'}</div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(kiosk)}
                                  disabled={toggleActiveMutation.isPending}
                                  title={kiosk.active ? 'Tocá para desactivarla' : 'Tocá para activarla'}
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-700 disabled:opacity-60"
                                  style={kiosk.active ? { background: '#e8f8ee', color: '#2e7d32' } : { background: '#fdecea', color: '#c0392b' }}
                                >
                                  <Power size={12} />
                                  {kiosk.active ? 'Activa' : 'Inactiva'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => goToAccountStep(kiosk, customer)}
                                  className="inline-flex items-center gap-1.5 text-xs font-800 rounded-full px-2.5 py-1"
                                  style={hasAccount ? { background: '#eef0f7', color: NAVY } : { background: NAVY, color: '#fff' }}
                                >
                                  {hasAccount ? (
                                    <>
                                      <KeyRound size={12} /> Cambiar contraseña
                                    </>
                                  ) : (
                                    'Cargar cuenta'
                                  )}
                                </button>
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
        </div>
      )}
    </div>
  );
}
