// src/lib/subscription.js
// Helpers de presentación de la suscripción a VEXKO. El estado (ACTIVE,
// WARNING, BLOCKED, EXEMPT) y las fechas los calcula el backend
// (backend/lib/subscription.js); acá solo se muestran.

export const SUBSCRIPTION_STATUS_LABELS = {
  ACTIVE: 'Al día',
  WARNING: 'Por vencer',
  BLOCKED: 'Inhabilitado',
  EXEMPT: 'Exento',
};

export const SUBSCRIPTION_STATUS_STYLES = {
  ACTIVE: { background: '#e8f8ee', color: '#2e7d32' },
  WARNING: { background: '#fff4e0', color: '#b45309' },
  BLOCKED: { background: '#fdecea', color: '#c0392b' },
  EXEMPT: { background: '#eef0f7', color: '#1c2050' },
};

// Las fechas vienen como instantes UTC que representan días de Argentina
// (00:00 AR = 03:00 UTC): se formatean en ese huso para no correrse un día.
export function formatArDate(value, options = { day: '2-digit', month: 'long', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { ...options, timeZone: 'America/Argentina/Buenos_Aires' });
}

// Hoy en Argentina como "YYYY-MM-DD" (valor por defecto del input de fecha).
export function todayArInput() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export function daysLeftLabel(daysLeft) {
  if (daysLeft <= 1) return 'Hoy es el último día';
  return `Quedan ${daysLeft} días`;
}
