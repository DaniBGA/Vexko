// src/components/admin/SettingsPanel.jsx
// Configuración global de VEXKO en el panel admin: WhatsApp de contacto (lo
// usan la pantalla de suscripción vencida y el aviso de vencimiento) y precio
// mensual de cada plan (se muestra en la landing y se precarga al registrar
// un pago).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle, Tag } from 'lucide-react';
import { adminApi } from '../../lib/adminApi.js';
import { Spinner } from '../ui/index.jsx';
import { buildWhatsappUrl, formatPlanPrice, formatWhatsappNumber, PUBLIC_SETTINGS_KEY } from '../../lib/publicSettings.js';

const GREEN = '#4caf82';

export const ADMIN_SETTINGS_KEY = ['admin-settings'];

const PLANS = [
  { key: 'BASE', label: 'Base' },
  { key: 'INTERMEDIO', label: 'Intermedio' },
  { key: 'PREMIUM', label: 'Premium' },
];

const toInput = (value) => (value === null || value === undefined ? '' : String(value));

export function useAdminSettings() {
  return useQuery({
    queryKey: ADMIN_SETTINGS_KEY,
    queryFn: () => adminApi.get('/admin/settings').then((r) => r.data),
  });
}

export default function SettingsPanel() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useAdminSettings();
  const [whatsapp, setWhatsapp] = useState('');
  const [prices, setPrices] = useState({ BASE: '', INTERMEDIO: '', PREMIUM: '' });

  useEffect(() => {
    if (!settings) return;
    setWhatsapp(settings.whatsappNumber ? formatWhatsappNumber(settings.whatsappNumber) : '');
    setPrices({
      BASE: toInput(settings.planPrices?.BASE),
      INTERMEDIO: toInput(settings.planPrices?.INTERMEDIO),
      PREMIUM: toInput(settings.planPrices?.PREMIUM),
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: (body) => adminApi.put('/admin/settings', body).then((r) => r.data),
    onSuccess: (data) => {
      toast.success('Configuración guardada');
      queryClient.setQueryData(ADMIN_SETTINGS_KEY, data);
      // La landing y la pantalla de bloqueo leen la configuración pública.
      queryClient.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    for (const plan of PLANS) {
      if (prices[plan.key] !== '' && (!Number.isFinite(Number(prices[plan.key])) || Number(prices[plan.key]) < 0)) {
        return toast.error(`El precio del plan ${plan.label} no es válido`);
      }
    }
    save.mutate({
      whatsappNumber: whatsapp,
      planPrices: Object.fromEntries(PLANS.map((plan) => [plan.key, prices[plan.key] === '' ? null : Number(prices[plan.key])])),
    });
  }

  if (isLoading) return <Spinner />;

  const savedWhatsappUrl = buildWhatsappUrl(settings?.whatsappNumber, 'Prueba de contacto desde el panel de VEXKO');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 font-800 text-gray-900">
          <MessageCircle size={18} style={{ color: GREEN }} /> WhatsApp de contacto
        </div>
        <p className="text-sm text-gray-500">
          Aparece en la pantalla de suscripción vencida ("Contactate por WhatsApp") y en el aviso de vencimiento,
          con un mensaje ya escrito que incluye el nombre del kiosco.
        </p>
        <div className="field-group">
          <label className="field-label">Número (con código de país)</label>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="field-input text-base py-3"
            placeholder="+54 9 249 400 0000"
          />
          <div className="text-xs text-gray-400 mt-1">Sin el 0 de la característica ni el 15. Dejalo vacío para no mostrar WhatsApp.</div>
        </div>
        {savedWhatsappUrl && (
          <a href={savedWhatsappUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-700 underline" style={{ color: GREEN }}>
            Probar el link guardado
          </a>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 font-800 text-gray-900">
          <Tag size={18} style={{ color: GREEN }} /> Precio mensual de cada plan
        </div>
        <p className="text-sm text-gray-500">
          Se muestra en la página principal (sección Planes) y se completa solo como monto al registrar un pago.
          Un plan sin precio aparece como "Próximamente".
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div key={plan.key} className="field-group">
              <label className="field-label">Plan {plan.label}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={prices[plan.key]}
                onChange={(e) => setPrices((current) => ({ ...current, [plan.key]: e.target.value }))}
                className="field-input text-base py-3"
                placeholder="Próximamente"
              />
              {prices[plan.key] !== '' && Number(prices[plan.key]) >= 0 && (
                <div className="text-xs text-gray-500 mt-1">En la landing: {formatPlanPrice(Number(prices[plan.key]))} / mes</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={save.isPending}
        className="w-full rounded-xl text-white font-800 text-base py-4 disabled:opacity-60"
        style={{ background: GREEN }}
      >
        {save.isPending ? 'Guardando...' : 'Guardar configuración'}
      </button>
    </form>
  );
}
