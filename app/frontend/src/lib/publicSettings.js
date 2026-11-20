// src/lib/publicSettings.js
// Configuración pública de VEXKO (GET /api/public/settings): precios de los
// planes y WhatsApp de contacto, que se editan en el panel admin.
import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const PUBLIC_SETTINGS_KEY = ['public-settings'];

// Con fetch y no con `api`: el interceptor de `api` muestra un toast por cada
// error, y en la landing (visitante sin login) no tiene sentido un "Error de
// conexión" si esto falla — simplemente se muestra "Próximamente".
async function fetchPublicSettings() {
  const res = await fetch(`${API_BASE}/public/settings`);
  if (!res.ok) throw new Error('No se pudo cargar la configuración');
  return res.json();
}

export function usePublicSettings() {
  return useQuery({
    queryKey: PUBLIC_SETTINGS_KEY,
    queryFn: fetchPublicSettings,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function buildWhatsappUrl(number, text) {
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// "5492494000000" → "+54 9 2494000000" (solo para mostrar; el largo del código
// de área varía, así que no se agrupa el resto).
export function formatWhatsappNumber(number) {
  if (!number) return '';
  return number.startsWith('549') ? `+54 9 ${number.slice(3)}` : `+${number}`;
}

export function formatPlanPrice(value) {
  if (value === null || value === undefined) return null;
  return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}
