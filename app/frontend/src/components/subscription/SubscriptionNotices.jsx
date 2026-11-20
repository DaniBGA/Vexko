// src/components/subscription/SubscriptionNotices.jsx
// Avisos de la suscripción a VEXKO para las sucursales:
// - SubscriptionWarningModal: pop-up durante los 10 días de gracia, cada vez
//   que se abre la app.
// - SubscriptionBlockedPage: pantalla completa cuando pasaron los 10 días; el
//   backend ya rechaza todo con 402, esto solo explica qué pasa y cómo seguir.
import { useState } from 'react';
import { AlertTriangle, Lock, MessageCircle, RefreshCw } from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { useAuthStore } from '../../store/authStore.js';
import { daysLeftLabel, formatArDate } from '../../lib/subscription.js';
import { buildWhatsappUrl, formatWhatsappNumber, usePublicSettings } from '../../lib/publicSettings.js';

const WHATSAPP_GREEN = '#25d366';

function useKioskName() {
  return useAuthStore((s) => s.user?.kiosk?.customer?.name || s.user?.kiosk?.name || '');
}

// Link a WhatsApp con el mensaje ya escrito (con el nombre del kiosco, para
// que en Grupo Vexus sepan de quién es el pago). El número se configura en el
// panel admin → Configuración; si todavía no se cargó, no se muestra.
function WhatsappButton({ text, children, className = '' }) {
  const { data: settings } = usePublicSettings();
  const url = buildWhatsappUrl(settings?.whatsappNumber, text);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl text-white font-800 transition hover:opacity-90 ${className}`}
      style={{ background: WHATSAPP_GREEN }}
    >
      <MessageCircle size={18} />
      {children}
    </a>
  );
}

export function SubscriptionWarningModal({ subscription, onClose }) {
  const kioskName = useKioskName();
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" role="alertdialog" aria-labelledby="subscription-warning-title">
        <div className="p-6 space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-amber-600" />
          </div>
          <div>
            <h2 id="subscription-warning-title" className="text-lg font-800 text-gray-900">
              Tu suscripción a VEXKO está por vencer
            </h2>
            <div className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-800 text-amber-700">
              {daysLeftLabel(subscription.daysLeft)}
            </div>
          </div>
          <p className="text-sm text-gray-600">
            La cuota mensual venció el <strong>{formatArDate(subscription.dueDate)}</strong>. Podés seguir usando el
            sistema hasta el <strong>{formatArDate(subscription.lastDay)}</strong> inclusive; si para entonces no se
            registró el pago, desde el <strong>{formatArDate(subscription.blockDate)}</strong> la aplicación se va a
            inhabilitar hasta que se regularice.
          </p>
        </div>
        <div className="border-t border-gray-100 px-6 py-4 space-y-2">
          <WhatsappButton
            className="w-full py-3 text-base"
            text={`Hola, soy de ${kioskName || 'mi kiosco'}. Quiero pagar la cuota de la suscripción a VEXKO.`}
          >
            Pagar por WhatsApp
          </WhatsappButton>
          <button type="button" onClick={onClose} className="btn-primary w-full py-3 text-base">Entendido</button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionBlockedPage({ subscription }) {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);
  const kioskName = useKioskName();
  const { data: settings } = usePublicSettings();
  const [checking, setChecking] = useState(false);

  // Vuelve a consultar /auth/me: si desde el panel admin ya se registró el
  // pago, el estado deja de ser BLOCKED y la app vuelve a mostrarse sola.
  async function retry() {
    setChecking(true);
    await fetchMe();
    setChecking(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 space-y-5 text-center">
          <Logo className="h-9 mx-auto" />
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Lock size={30} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-800 text-gray-900">La suscripción a VEXKO está vencida</h1>
            {kioskName && <div className="text-sm text-gray-500 mt-1">{kioskName}</div>}
          </div>
          <p className="text-sm text-gray-600">
            La cuota mensual venció el <strong>{formatArDate(subscription.dueDate)}</strong> y pasaron los{' '}
            {subscription.graceDays} días de gracia sin registrarse el pago, así que el sistema quedó inhabilitado.
            Tus datos están guardados: apenas se regularice el pago vas a poder seguir usándolo como siempre.
          </p>
          {settings?.whatsappNumber ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 font-600">
                Contactate por WhatsApp con Grupo Vexus para abonar la cuota:
              </p>
              <WhatsappButton
                className="w-full py-3.5 text-base"
                text={`Hola, soy de ${kioskName || 'mi kiosco'}. Mi suscripción a VEXKO está vencida y quiero regularizar el pago.`}
              >
                Escribir por WhatsApp
              </WhatsappButton>
              <div className="text-xs text-gray-500">
                {formatWhatsappNumber(settings.whatsappNumber)} · Cuando te confirmen el pago, tocá "Ya pagué, volver a entrar".
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-600">
              Comunicate con <strong>Grupo Vexus</strong> para abonar la cuota. Cuando te confirmen el pago, tocá
              "Ya pagué, volver a entrar".
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-8 py-5 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={logout} className="btn-outline flex-1 py-3">Cerrar sesión</button>
          <button
            type="button"
            onClick={retry}
            disabled={checking}
            className="btn-primary flex-1 py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Verificando...' : 'Ya pagué, volver a entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
