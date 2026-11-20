// src/lib/subscription.js
// Reglas de la suscripción mensual a VEXKO (por cliente / Customer):
//
//   último pago ──── 1 mes ────► vencimiento ── 10 días de gracia ──► inhabilitado
//                     ACTIVE         WARNING (pop-up al abrir la app)    BLOCKED
//
// Ej.: pagó el 1/10 → vence el 1/11 → del 1/11 al 10/11 se avisa ("te quedan
// N días") → desde el 11/11 la app queda inhabilitada hasta que pague. El
// ciclo siguiente arranca en la fecha del nuevo pago.
//
// Todo se calcula por DÍA calendario en hora de Argentina (UTC-3, sin horario
// de verano), no en el huso del servidor: el VPS corre en UTC y, si no, a
// las 21 h de Argentina ya se contaría el día siguiente.

export const GRACE_DAYS = 10;
export const SUBSCRIPTION_SELECT = {
  subscriptionStartedAt: true,
  lastPaymentAt: true,
  subscriptionExempt: true,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina = UTC-3

function arDateParts(date) {
  const shifted = new Date(new Date(date).getTime() - AR_OFFSET_MS);
  return [shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()];
}

// 00:00 de ese día en Argentina, como instante UTC (= 03:00 UTC).
function arMidnight(year, month, day) {
  return new Date(Date.UTC(year, month, day) + AR_OFFSET_MS);
}

// Suma un mes respetando el fin de mes: el 31/1 vence el 28/2 (o 29), no el
// 3/3 como haría Date#setMonth.
function addOneMonth([year, month, day]) {
  const target = new Date(Date.UTC(year, month + 1, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return [y, m, Math.min(day, lastDay)];
}

// "YYYY-MM-DD" (input type="date") → mediodía de ese día en Argentina, así
// el día no se corre por husos horarios al guardarlo ni al leerlo.
export function parseArDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12) + AR_OFFSET_MS);
  return arDateParts(date)[2] === d ? date : null; // descarta fechas como 31/02
}

export function isAfterTodayAr(date, now = new Date()) {
  return arMidnight(...arDateParts(date)) > arMidnight(...arDateParts(now));
}

export function getSubscriptionStatus(customer, now = new Date()) {
  if (!customer) return null;

  const anchorAt = customer.lastPaymentAt || customer.subscriptionStartedAt;
  const dueDate = arMidnight(...addOneMonth(arDateParts(anchorAt)));
  const blockDate = new Date(dueDate.getTime() + GRACE_DAYS * DAY_MS);
  // Último día en que todavía se puede usar la app (el anterior al bloqueo).
  const lastDay = new Date(blockDate.getTime() - DAY_MS);
  const today = arMidnight(...arDateParts(now));

  const base = {
    exempt: Boolean(customer.subscriptionExempt),
    lastPaymentAt: customer.lastPaymentAt || null,
    anchorAt,
    dueDate,
    lastDay,
    blockDate,
    graceDays: GRACE_DAYS,
  };

  if (customer.subscriptionExempt) {
    return { ...base, status: 'EXEMPT', daysLeft: null };
  }
  if (now < dueDate) {
    return { ...base, status: 'ACTIVE', daysUntilDue: Math.round((dueDate - today) / DAY_MS), daysLeft: null };
  }
  if (now < blockDate) {
    // 10 el día del vencimiento, 1 el último día antes del bloqueo.
    return { ...base, status: 'WARNING', daysLeft: Math.round((blockDate - today) / DAY_MS) };
  }
  return { ...base, status: 'BLOCKED', daysLeft: 0, daysOverdue: Math.round((today - blockDate) / DAY_MS) + 1 };
}

// Agrega `subscription` (estado calculado) al customer de la sucursal, para
// las respuestas de login y /me.
export function withSubscription(kiosk) {
  if (!kiosk?.customer) return kiosk;
  return { ...kiosk, customer: { ...kiosk.customer, subscription: getSubscriptionStatus(kiosk.customer) } };
}
