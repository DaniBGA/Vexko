# Suscripción mensual a VEXKO

**Estado:** implementado en `develop` (25-oct-2026), sin commitear.
**Última revisión:** 25 de octubre de 2026.

VEXKO se cobra por suscripción mensual **por cliente** (`Customer`, lo que el panel admin
llama "kiosco"). El estado de la suscripción alcanza a **todas** las sucursales de ese cliente.
Los pagos se registran a mano desde el panel admin; no hay cobro automático.

| Pieza | Dónde |
|---|---|
| Reglas y fechas | [`app/backend/lib/subscription.js`](../app/backend/lib/subscription.js) |
| Bloqueo | `requireAuth` en [`middleware/auth.js`](../app/backend/middleware/auth.js) |
| Datos | `Customer.subscriptionStartedAt / lastPaymentAt / subscriptionExempt` + modelo `SubscriptionPayment` ([DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md)) |
| API admin | `GET /api/admin/kiosks`, `POST/DELETE /api/admin/customers/:id/payments`, `PATCH /api/admin/customers/:id`, `GET/PUT /api/admin/settings` ([API_ENDPOINTS.md](API_ENDPOINTS.md)) |
| API pública | `GET /api/public/settings` (WhatsApp y precios, sin login) |
| Panel admin | `components/admin/SubscriptionPanel.jsx` (botón "Suscripción" en "Ver mis kioscos") y `components/admin/SettingsPanel.jsx` (pestaña "Configuración") |
| Configuración | modelo `AppSettings` + [`app/backend/lib/settings.js`](../app/backend/lib/settings.js) |
| Sucursales | `components/subscription/SubscriptionNotices.jsx`: pop-up de aviso y pantalla de bloqueo |

---

## 1. Ciclo

```
último pago ──── 1 mes ────► vencimiento ──── 10 días de gracia ────► inhabilitado
   ACTIVE                     WARNING (pop-up cada vez que se abre)     BLOCKED (día 11)
```

Ejemplo: pagó el **1/10** → vence el **1/11** → del **1/11 al 10/11** cada vez que se abre
la app aparece el aviso ("Quedan N días", "Hoy es el último día") → desde el **11/11** la app
queda inhabilitada hasta que se registre un pago. El ciclo siguiente se cuenta desde la fecha
de **ese** pago (no desde el vencimiento anterior).

| Estado | Cuándo | Qué ve la sucursal |
|---|---|---|
| `ACTIVE` | antes del vencimiento | nada |
| `WARNING` | del vencimiento hasta el día 10 de gracia inclusive | pop-up al abrir la app (se cierra con "Entendido" hasta la próxima apertura) |
| `BLOCKED` | desde el día 11 | pantalla "La suscripción a VEXKO está vencida" en vez de la app |
| `EXEMPT` | cliente marcado como exento | nada, nunca se bloquea |

Reglas de fecha:

- Todo se cuenta por **día calendario en hora de Argentina** (UTC-3), no en el huso del
  servidor. El VPS corre en UTC: sin esto, a las 21 h de Argentina ya se contaba el día siguiente.
- "1 mes" respeta el fin de mes: un pago del 31/1 vence el 28/2 (o el 29), no el 3/3.
- Base del ciclo = `lastPaymentAt` (fecha del pago más reciente) o, si todavía no hay pagos,
  `subscriptionStartedAt` (el alta del cliente).
- "Abrir la app" = cada carga de la página o cada login: el aviso vive en `AppLayout`, que se
  monta una vez por apertura.

## 2. Bloqueo

El bloqueo está en el **backend**, no solo en la pantalla:

- `requireAuth` calcula el estado en cada request de una sucursal. Si es `BLOCKED`, responde
  **402** `{ code: 'SUBSCRIPTION_BLOCKED', error, subscription }` en todas las rutas **salvo**
  `/api/auth/*`.
- El login y `/api/auth/me` siguen funcionando y devuelven `kiosk.customer.subscription`. Así el
  front sabe que tiene que mostrar la pantalla de bloqueo y no un error.
- En el front, el interceptor de `lib/api.js` convierte el 402 en el evento
  `vexko:subscription-blocked`, sin toast y sin cerrar la sesión. `App.jsx` escucha ese evento
  y refresca `/me`, y `PrivateRoute` muestra `SubscriptionBlockedPage`. Si la suscripción
  vence con la app abierta, la siguiente acción ya lleva a esa pantalla.
- La pantalla de bloqueo dice **"Contactate por WhatsApp con Grupo Vexus"**, con un botón que
  abre `wa.me/<número>` y un mensaje ya escrito con el nombre del kiosco ("Hola, soy de X. Mi
  suscripción a VEXKO está vencida y quiero regularizar el pago."). El aviso de vencimiento tiene
  también un botón "Pagar por WhatsApp". El número se configura en el panel; si no hay número
  cargado, se muestra el texto genérico "Comunicate con Grupo Vexus" y no aparece el botón. El
  número se lee de `GET /api/public/settings`, que no pasa por `requireAuth`, así que una
  sucursal bloqueada lo puede leer.
- La pantalla de bloqueo tiene "Ya pagué, volver a entrar": vuelve a consultar `/me` y, si el
  pago ya se registró en el panel, la app vuelve sola (el token sigue siendo el mismo).
- No afecta al panel admin (la cuenta `OWNER` no tiene sucursal) ni a los otros clientes.
- Es independiente del `Kiosk.active` manual: desactivar una sucursal cierra la sesión (401);
  la suscripción vencida bloquea pero mantiene la sesión.

## 3. Panel admin

En **"Ver mis kioscos"** cada cliente muestra un badge (Al día / Por vencer · N d /
Inhabilitado / Exento). Arriba aparece un resumen de los clientes inhabilitados y de los que
están en días de gracia. El botón **"Suscripción"** abre:

- el estado con las fechas (vencimiento, día de bloqueo);
- **Registrar pago**: fecha (por defecto hoy, no se permiten fechas futuras), monto (se completa
  solo con el precio del plan del cliente, editable) y nota opcional. El próximo vencimiento
  queda a un mes de esa fecha;
- el historial de los últimos 12 pagos, con un botón para borrar un pago cargado por error (el
  vencimiento se recalcula con el pago anterior);
- **"No cobrarle la suscripción (exento)"**: para cuentas de prueba o internas.

`lastPaymentAt` es el `paidAt` más reciente y se recalcula al cargar o borrar un pago. Por eso
cargar un pago viejo (con una fecha anterior al último) no mueve el vencimiento.

### Pestaña "Configuración"

Configuración global, guardada en una sola fila de `AppSettings`:

| Campo | Se usa en |
|---|---|
| **WhatsApp de contacto** | Botón de la pantalla de bloqueo y del aviso de vencimiento. Se carga con código de país (`+54 9 249 400 0000`) y se guarda solo con dígitos (`5492494000000`). El formato local con 0 y 15 se rechaza porque `wa.me` no lo entiende. Vacío = no se muestra WhatsApp |
| **Precio mensual por plan** (Base, Intermedio, Premium) | Sección "Planes" de la **landing** (`$ 15.000 / mes por kiosco`) y monto precargado al registrar un pago. Vacío = la landing muestra "Próximamente / precio en definición" |

La landing lee los precios de `GET /api/public/settings` cada vez que se abre, así que un cambio
en el panel se ve apenas alguien abre o recarga la landing. Si alguien ya la tenía abierta, se
actualiza al volver a la pestaña después de 5 minutos (`staleTime` de React Query). Mientras no
haya ningún precio cargado, la sección mantiene el texto "Los precios se están definiendo durante
la beta".

## 4. Alta en producción

La migración `20261025120000_customer_subscriptions` le pone `subscriptionStartedAt` = **el
momento del deploy** a todos los clientes existentes, así nadie queda bloqueado al deployar
(con `createdAt`, cualquier cliente de hace más de 1 mes y 10 días quedaba inhabilitado en el
acto). **Después del deploy**: registrar el último pago real de cada cliente, o marcarlo exento.
Si no, todos vencen al mes del deploy. Ver [GUIA_DEPLOY.md](GUIA_DEPLOY.md).

## 5. Limitaciones / decisiones pendientes

- Un pago = un mes. No hay pagos por adelantado de varios meses (se podría agregar un campo
  "meses" al pago).
- El monto del pago se precarga con el precio del plan, pero no se obliga a que coincida.
- Los botones "Sumarme a la beta" de la landing abren el WhatsApp configurado (con el plan en el
  mensaje). Si no hay número cargado, vuelven al mail `hola@kioscoapp.com`.
- La regla de bloqueo no tiene override puntual (por ejemplo, "dale 3 días más"): hoy se resuelve
  registrando un pago o marcándolo exento temporalmente.
