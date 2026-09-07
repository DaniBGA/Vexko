import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Clock3, CircleCheckBig, ChevronLeft, ChevronRight,
  Users, UserPlus, KeyRound, Eye, EyeOff, Wand2, Copy, Lock, Check, ArrowLeft, Pencil, Trash2, FileDown,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { PageHeader, Spinner, EmptyState, fmt } from '../ui/index.jsx';
import { downloadPdfReport } from '../../lib/pdf.js';
import { useAuthStore } from '../../store/authStore.js';

const NAVY = '#1c2050';
const GREEN = '#4caf82';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiada`);
  } catch {
    toast.error('No se pudo copiar, anotala a mano');
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

// Cuatro casilleros grandes para escribir un PIN de 4 números, en vez de un
// campo de texto común — más fácil de entender de un vistazo y de tipear.
function PinBoxes({ value, onChange, showDigits, autoFocus }) {
  const refs = useRef([]);

  function setDigit(i, raw) {
    const d = raw.replace(/\D/g, '').slice(-1);
    const chars = value.split('');
    chars[i] = d;
    const joined = chars.join('').slice(0, 4);
    onChange(joined);
    if (d && i < 3) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          autoFocus={autoFocus && i === 0}
          type={showDigits ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-14 h-16 text-center text-2xl font-800 rounded-2xl border-2 border-slate-200 focus:outline-none"
          style={{ color: NAVY, borderColor: value[i] ? GREEN : undefined }}
        />
      ))}
    </div>
  );
}

/* ================= Panel de empleados (crear / cambiar clave) ================= */
function EmployeesPanel({ employees, isLoadingEmployees, onChanged }) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPin, setEditPin] = useState('');
  const [showEditPin, setShowEditPin] = useState(false);
  const [justSet, setJustSet] = useState(null); // { name, pin } — para mostrar y copiar

  const verifyMutation = useMutation({
    mutationFn: (pwd) => api.post('/employees/verify-password', { password: pwd }).then((r) => r.data),
    onSuccess: () => {
      setUnlocked(true);
    },
    onError: () => {
      toast.error('Esa no es la contraseña de la cuenta');
    },
  });

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/employees', body).then((r) => r.data),
    onSuccess: (_data, variables) => {
      toast.success('Empleado agregado');
      setJustSet({ name: variables.name, pin: variables.pin });
      setShowAdd(false);
      setNewName('');
      setNewPin('');
      setShowNewPin(false);
      onChanged();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'No se pudo agregar');
    },
  });

  const updatePinMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/employees/${id}`, body).then((r) => r.data),
    onSuccess: (_data, variables) => {
      toast.success('Clave actualizada');
      setJustSet({ name: variables.employeeName, pin: variables.body.pin });
      setEditingId(null);
      setEditPin('');
      setShowEditPin(false);
      onChanged();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'No se pudo actualizar');
    },
  });

  function handleUnlock(e) {
    e.preventDefault();
    if (!password.trim()) return;
    verifyMutation.mutate(password);
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error('Ingresá el nombre del empleado');
      return;
    }
    if (newPin.length !== 4) {
      toast.error('La clave tiene que ser de 4 números');
      return;
    }
    createMutation.mutate({ password, name: newName, pin: newPin });
  }

  function handleUpdatePin(employee) {
    if (editPin.length !== 4) {
      toast.error('La clave tiene que ser de 4 números');
      return;
    }
    updatePinMutation.mutate({ id: employee.id, body: { password, pin: editPin }, employeeName: employee.name });
  }

  if (!unlocked) {
    return (
      <div className="p-5 space-y-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto" style={{ background: '#eef0f7' }}>
          <Lock size={22} style={{ color: NAVY }} />
        </div>
        <p className="text-sm text-gray-500 text-center">
          Para agregar o cambiar la clave de un empleado, primero escribí la contraseña con la que iniciás sesión.
        </p>
        <form onSubmit={handleUnlock} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input text-center text-lg py-3"
            placeholder="Tu contraseña"
            autoFocus
          />
          <button
            type="submit"
            disabled={verifyMutation.isPending || !password.trim()}
            className="w-full rounded-xl text-white font-800 text-base py-3 disabled:opacity-60"
            style={{ background: NAVY }}
          >
            {verifyMutation.isPending ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {justSet && (
        <div className="rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: GREEN, background: '#f7fdfa' }}>
          <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Clave de {justSet.name}</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xl font-800 tracking-[0.3em]" style={{ color: NAVY }}>{justSet.pin}</div>
            <CopyButton value={justSet.pin} label="Clave" />
          </div>
          <div className="text-xs text-gray-500">Anotala o compartisela al empleado. Con esto va a poder abrir la caja.</div>
          <button type="button" onClick={() => setJustSet(null)} className="text-xs font-700" style={{ color: NAVY }}>
            Listo, ocultar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm font-700 text-gray-700">
          {employees.length === 0 ? 'Todavía no hay empleados' : `${employees.length} empleado${employees.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {isLoadingEmployees ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-700 text-gray-900">{employee.name}</div>
                {editingId !== employee.id && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(employee.id); setEditPin(''); setShowEditPin(false); }}
                    className="inline-flex items-center gap-1.5 text-xs font-700 rounded-full px-3 py-1.5"
                    style={{ background: '#eef0f7', color: NAVY }}
                  >
                    <KeyRound size={12} /> Cambiar clave
                  </button>
                )}
              </div>

              {editingId === employee.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-center gap-2">
                    <PinBoxes value={editPin} onChange={setEditPin} showDigits={showEditPin} autoFocus />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEditPin((v) => !v)}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-700"
                    style={{ color: NAVY }}
                  >
                    {showEditPin ? <EyeOff size={13} /> : <Eye size={13} />} {showEditPin ? 'Ocultar' : 'Mostrar'} números
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPin(generatePin())}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-700"
                    style={{ color: NAVY }}
                  >
                    <Wand2 size={13} /> Generar una clave nueva
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditPin(''); }}
                      className="flex-1 rounded-xl font-700 text-sm py-2.5 border border-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdatePin(employee)}
                      disabled={updatePinMutation.isPending}
                      className="flex-1 rounded-xl text-white font-800 text-sm py-2.5 disabled:opacity-60"
                      style={{ background: GREEN }}
                    >
                      {updatePinMutation.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!showAdd ? (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl font-800 text-sm py-3 border-2"
          style={{ borderColor: NAVY, color: NAVY }}
        >
          <UserPlus size={16} /> Agregar empleado
        </button>
      ) : (
        <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="field-group">
            <label className="field-label text-sm">Nombre del empleado</label>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="field-input" placeholder="Ej: Rocío" />
          </div>
          <div className="field-group">
            <label className="field-label text-sm text-center block">Clave de 4 números</label>
            <PinBoxes value={newPin} onChange={setNewPin} showDigits={showNewPin} />
          </div>
          <button type="button" onClick={() => setShowNewPin((v) => !v)} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-700" style={{ color: NAVY }}>
            {showNewPin ? <EyeOff size={13} /> : <Eye size={13} />} {showNewPin ? 'Ocultar' : 'Mostrar'} números
          </button>
          <button type="button" onClick={() => setNewPin(generatePin())} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-700" style={{ color: NAVY }}>
            <Wand2 size={13} /> Generar una clave fácil
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setNewName(''); setNewPin(''); }} className="flex-1 rounded-xl font-700 text-sm py-2.5 border border-slate-200 bg-white">
              Cancelar
            </button>
            <button type="submit" disabled={createMutation.isPending} className="flex-1 rounded-xl text-white font-800 text-sm py-2.5 disabled:opacity-60" style={{ background: GREEN }}>
              {createMutation.isPending ? 'Guardando...' : 'Crear'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ================= Editar un turno de caja ================= */
function EditRegisterModal({ register, employees, onClose, onSave, isSaving }) {
  const [openingAmount, setOpeningAmount] = useState(String(register.openingAmount ?? ''));
  const [actualAmount, setActualAmount] = useState(register.actualAmount != null ? String(register.actualAmount) : '');
  const [employeeId, setEmployeeId] = useState(register.employee?.id || '');
  const [notes, setNotes] = useState(register.notes || '');
  const isClosed = register.status === 'CLOSED';

  function handleSubmit(e) {
    e.preventDefault();
    const body = {
      openingAmount: Number(openingAmount || 0),
      notes,
      employeeId: employeeId || null,
    };
    if (isClosed) {
      body.actualAmount = Number(actualAmount || 0);
    }
    onSave(body);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-sm font-700 text-brand-sidebar">Editar turno de caja</div>
            <div className="text-xs text-gray-400">{formatDateTime(register.openedAt)}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <span className="text-3xl leading-none font-700">×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-gray-500">
            Usá esto para corregir un monto mal cargado o un empleado equivocado, o para dejar en cero un turno que se abrió sin querer.
          </div>

          <div className="field-group">
            <label className="field-label">Empleado</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="field-input">
              <option value="">Sin empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">Monto de apertura</label>
            <input type="number" min="0" step="0.01" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} className="field-input" />
          </div>

          {isClosed && (
            <div className="field-group">
              <label className="field-label">Efectivo contado (cierre)</label>
              <input type="number" min="0" step="0.01" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} className="field-input" />
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field-input resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={isSaving} className="btn-primary disabled:opacity-60">
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================= Página principal ================= */
export default function CashRegisterPage() {
  const queryClient = useQueryClient();
  const kioskName = useAuthStore((s) => s.user?.kiosk?.name);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('10000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyLimit = 8;

  // Paso a paso para abrir la caja cuando hay empleados cargados.
  const [openStage, setOpenStage] = useState('employee'); // 'employee' | 'pin' | 'amount'
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [openPin, setOpenPin] = useState('');
  const [showOpenPin, setShowOpenPin] = useState(false);
  const [editingRegister, setEditingRegister] = useState(null);

  const { data: currentRegister, isLoading: loadingCurrent } = useQuery({
    queryKey: ['cash-register-current'],
    queryFn: () => api.get('/cash-registers/current').then((r) => r.data),
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['cash-register-history', historyPage],
    queryFn: () => api.get('/cash-registers', { params: { page: historyPage, limit: historyLimit } }).then((r) => r.data),
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then((r) => r.data),
  });

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) || null;

  const { mutate: openRegister, isPending: isOpening } = useMutation({
    mutationFn: (body) => api.post('/cash-registers/open', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Caja abierta');
      setOpeningNotes('');
      setOpenStage('employee');
      setSelectedEmployeeId('');
      setOpenPin('');
      setShowOpenPin(false);
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'No se pudo abrir la caja');
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

  const { mutate: editRegister, isPending: isEditingRegister } = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/cash-registers/${id}`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Turno actualizado');
      setEditingRegister(null);
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'No se pudo actualizar');
    },
  });

  const { mutate: deleteRegister } = useMutation({
    mutationFn: (id) => api.delete(`/cash-registers/${id}`),
    onSuccess: () => {
      toast.success('Turno borrado');
      queryClient.invalidateQueries({ queryKey: ['cash-register-current'] });
      queryClient.invalidateQueries({ queryKey: ['cash-register-history'] });
    },
  });

  function handleDeleteRegister(register) {
    const when = formatDateTime(register.openedAt);
    if (!window.confirm(`¿Borrar el turno de caja del ${when}? Esta acción no se puede deshacer.`)) {
      return;
    }
    deleteRegister(register.id);
  }

  async function handleExportPdf() {
    setIsExportingPdf(true);
    try {
      const { data: full } = await api.get('/cash-registers', { params: { all: 1 } });
      const registers = full.registers || [];
      const rows = registers.map((register) => [
        formatDateTime(register.openedAt),
        register.employee?.name || '—',
        formatDateTime(register.closedAt),
        register.expectedCashBeforeClose != null ? fmt(register.expectedCashBeforeClose) : '—',
        register.actualAmount != null ? fmt(register.actualAmount) : '—',
        register.difference != null ? fmt(register.difference) : '—',
        register.status === 'OPEN' ? 'Abierta' : 'Cerrada',
      ]);
      const closedRegisters = registers.filter((r) => r.status === 'CLOSED');
      const totalDifference = closedRegisters.reduce((sum, r) => sum + parseFloat(r.difference || 0), 0);
      downloadPdfReport({
        title: 'Historial de caja',
        subtitle: 'Todos los turnos registrados',
        kioskName,
        meta: [`Total de turnos: ${registers.length}`],
        columns: ['Apertura', 'Empleado', 'Cierre', 'Esperado', 'Contado', 'Diferencia', 'Estado'],
        rows,
        summary: [['Diferencia acumulada (turnos cerrados)', fmt(totalDifference)]],
        filename: `historial-caja-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch {
      toast.error('No se pudo generar el PDF');
    } finally {
      setIsExportingPdf(false);
    }
  }

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

  function submitOpenAmount(e) {
    e.preventDefault();
    const body = { openingAmount: Number(openingAmount || 0), notes: openingNotes };
    if (employees.length > 0) {
      body.employeeId = selectedEmployeeId;
      body.pin = openPin;
    }
    openRegister(body);
  }

  function handleEmployeesChanged() {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  }

  const needsEmployeeStep = employees.length > 0;

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
              <div className="text-sm text-gray-500 mt-1">
                {currentRegister?.employee ? `Abierta por ${currentRegister.employee.name}` : 'La caja se abre y cierra desde esta pantalla'}
              </div>
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
                    {currentRegister.employee && (
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
                        <div className="text-xs uppercase tracking-[0.08em] text-gray-400 font-700">Empleado a cargo</div>
                        <div className="text-lg font-800 text-brand-sidebar mt-2 flex items-center gap-2">
                          <Users size={18} className="text-brand-green" /> {currentRegister.employee.name}
                        </div>
                      </div>
                    )}
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
                      <div className="text-lg font-800 mt-1">Cierre de caja</div>
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
                  {!needsEmployeeStep && (
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
                      Abrí la caja para registrar el efectivo inicial del turno. Después vas a poder cerrarla con el efectivo contado.
                    </div>
                  )}

                  {needsEmployeeStep && openStage === 'employee' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-lg font-800 text-gray-900 text-center">¿Quién abre la caja?</h4>
                        <p className="text-sm text-gray-500 text-center mt-1">Tocá tu nombre para continuar</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {employees.map((employee) => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => { setSelectedEmployeeId(employee.id); setOpenPin(''); setOpenStage('pin'); }}
                            className="rounded-2xl border-2 border-slate-200 hover:border-brand-green p-5 flex items-center gap-3 transition-colors"
                          >
                            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#eef0f7' }}>
                              <Users size={20} style={{ color: NAVY }} />
                            </div>
                            <div className="font-800 text-base text-gray-900">{employee.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {needsEmployeeStep && openStage === 'pin' && selectedEmployee && (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setOpenStage('employee')}
                        className="inline-flex items-center gap-1.5 text-sm font-700"
                        style={{ color: NAVY }}
                      >
                        <ArrowLeft size={14} /> Volver
                      </button>
                      <div>
                        <h4 className="text-lg font-800 text-gray-900 text-center">Hola, {selectedEmployee.name}</h4>
                        <p className="text-sm text-gray-500 text-center mt-1">Escribí tu clave de 4 números</p>
                      </div>
                      <PinBoxes value={openPin} onChange={setOpenPin} showDigits={showOpenPin} autoFocus />
                      <button
                        type="button"
                        onClick={() => setShowOpenPin((v) => !v)}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-700"
                        style={{ color: NAVY }}
                      >
                        {showOpenPin ? <EyeOff size={13} /> : <Eye size={13} />} {showOpenPin ? 'Ocultar' : 'Mostrar'} números
                      </button>
                      <button
                        type="button"
                        onClick={() => openPin.length === 4 && setOpenStage('amount')}
                        disabled={openPin.length !== 4}
                        className="w-full rounded-xl text-white font-800 text-base py-3.5 disabled:opacity-60"
                        style={{ background: GREEN }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  )}

                  {(!needsEmployeeStep || openStage === 'amount') && (
                    <div className="space-y-4">
                      {needsEmployeeStep && (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenStage('pin')}
                            className="inline-flex items-center gap-1.5 text-sm font-700"
                            style={{ color: NAVY }}
                          >
                            <ArrowLeft size={14} /> Volver
                          </button>
                          <div className="rounded-2xl border p-3 flex items-center gap-3" style={{ background: '#e8f8ee', borderColor: '#cdeedd' }}>
                            <Check size={18} style={{ color: '#2e7d32' }} />
                            <div className="text-sm text-gray-700">Abriendo como <strong>{selectedEmployee?.name}</strong></div>
                          </div>
                        </>
                      )}
                      <form onSubmit={submitOpenAmount} className="space-y-4">
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
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Historial de cierres</h3>
                  <span className="text-xs text-gray-400">Tocá el lápiz para corregir un turno o el tacho para borrarlo</span>
                </div>
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
                          {['Apertura', 'Empleado', 'Cierre', 'Efectivo esperado', 'Contado', 'Dif.', 'Estado', ''].map((header) => <th key={header} className="th">{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {historyRegisters.map((register) => (
                          <tr key={register.id} className="hover:bg-gray-50 transition-colors">
                            <td className="td text-gray-500">{formatDateTime(register.openedAt)}</td>
                            <td className="td text-gray-700 font-600">{register.employee?.name || '—'}</td>
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
                            <td className="td text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingRegister(register)}
                                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-gray-600 hover:bg-slate-50"
                                  title="Editar turno"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRegister(register)}
                                  className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                                  title="Borrar turno"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
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
            <div className="card overflow-hidden">
              <div className="card-header">
                <h3 className="card-title">Empleados</h3>
                <span className="text-xs text-gray-400">Quién puede abrir la caja</span>
              </div>
              <EmployeesPanel employees={employees} isLoadingEmployees={loadingEmployees} onChanged={handleEmployeesChanged} />
            </div>

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

      {editingRegister && (
        <EditRegisterModal
          register={editingRegister}
          employees={employees}
          isSaving={isEditingRegister}
          onClose={() => setEditingRegister(null)}
          onSave={(body) => editRegister({ id: editingRegister.id, body })}
        />
      )}
    </div>
  );
}
