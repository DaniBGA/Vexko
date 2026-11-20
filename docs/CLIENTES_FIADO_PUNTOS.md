# Clientes, puntos, cupones y fiado

**Plan:** PREMIUM. **Estado:** implementado en `develop` (sep-2026), con correcciones del
24-oct-2026. Todavía sin commitear.
**Última revisión:** 24 de octubre de 2026.

Funciones para los clientes finales de cada sucursal: sumar puntos por compras,
canjearlos por un cupón de descuento y llevar la cuenta de lo que se dejó "fiado".
Todo es **por sucursal**: un cliente cargado en la Sucursal Centro no existe en la
Sucursal Norte.

| Pieza | Dónde |
|---|---|
| Modelos | `Client`, `LoyaltyRule`, `PointRedemption`, `ClientDebt`, `ClientDebtPayment` ([DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md#6-clientes-finales-puntos-y-fiado--plan-premium)) |
| API | [`routes/clients.js`](../app/backend/routes/clients.js) y `POST/PUT/DELETE /api/sales` en [`routes/sales.js`](../app/backend/routes/sales.js) |
| Pantallas | `ClientsPage.jsx` (`/clientes`), `ClientDetailPage.jsx` (`/clientes/:id`), bloque de cliente y cupón en `SalePage.jsx`, tarjeta "Fiado de clientes" en `CashRegisterPage.jsx` |

---

## 1. Sistema de puntos

La regla se configura en `/clientes` → "Sistema de puntos" (`LoyaltyRuleModal`):

| Campo | Significado | Ejemplo (seed) |
|---|---|---|
| `amountPerPoint` | Pesos gastados por cada punto | 100 → $100 = 1 punto |
| `pointsForDiscount` | Puntos necesarios para canjear | 50 |
| `discountPercent` | % de descuento del cupón (1–100) | 10 % |

- Hay **una regla activa por sucursal**. Guardar una nueva desactiva la anterior (queda historial).
- Hasta sep-2026 el descuento era un **monto fijo** (`discountAmount`); ahora es un **porcentaje**.
- Al registrar una venta con cliente, `pointsEarned` se calcula sobre el **total pagado** (ya con descuento).
- `Client.totalSpent` suma el total de **toda** venta con cliente, dé puntos o no (hasta oct-2026
  solo sumaba si la venta daba puntos, pero borrarla sí restaba).
- Los puntos y el total gastado no se editan a mano: `PUT /clients/:id` solo acepta nombre y teléfono.

## 2. Canje → cupón con código

Canjear ya no descuenta nada en el momento: genera un cupón para la próxima compra.

```
/clientes/:id → "Canjear puntos"
   POST /api/clients/:id/redeem
   ├─ valida que tenga puntos suficientes (si no: "Faltan N puntos para canjear")
   ├─ resta pointsForDiscount del saldo con updateMany(points >= pointsForDiscount):
   │  con doble clic sale un solo cupón y el saldo nunca queda negativo
   └─ crea PointRedemption { code: "9XXXXXXX", discount: <%>, status: PENDING }

El detalle del cliente muestra los "Códigos de descuento pendientes" con el número y
el código de barras (CODE128, renderBarcodeDataUrl de lib/barcodeLabels.js), para
dárselo al cliente.

Próxima compra (/venta):
   1. el cajero elige al cliente (buscador, ≥3 caracteres)
   2. si tiene cupones pendientes, aparece el campo "Código de descuento"
   3. el cliente dicta el código (o se escanea) → se valida en vivo contra sus cupones
   4. se ve "Descuento (X%)" en el resumen y el TOTAL ya descontado
   5. POST /api/sales con { clientId, redemptionCode }
      → el backend vuelve a validar y marca el cupón USED dentro de la transacción
```

Reglas:

- El código es de **8 dígitos y empieza con `9`** (los códigos internos de productos usan el prefijo `20`).
- Solo lo puede usar **el cliente al que se le generó**; si se manda sin `clientId` o con otro cliente → 400.
- Un cupón `USED` no se puede volver a usar. Dos ventas simultáneas con el mismo código: gana una
  (`updateMany` con `status: 'PENDING'` en el `where`).
- **Editar** una venta con cupón mantiene el mismo % sobre el nuevo subtotal (el Historial también
  lo considera al mostrar el total y validar el pago mixto). No se le puede cambiar el cliente.
- El % se acota a 0–100 al aplicarlo (una regla migrada de monto fijo no deja totales negativos).
- **Borrar** una venta con cupón lo devuelve a `PENDING` (no se pierde por una corrección).
- `PointRedemption.discount` guarda el **porcentaje** vigente al momento del canje: cambiar la regla
  después no afecta los cupones ya emitidos.
- `Sale.discountAmount` guarda el monto en pesos descontado; `Sale.total` ya viene neto.

## 3. Fiado (deudas de clientes)

Cuando un cliente se lleva mercadería y paga después.

**Dejar fiado** — desde la tarjeta "Fiado de clientes" en `/caja` (`LeaveDebtModal`) o desde
el detalle del cliente:
`POST /api/clients/:id/debts { amount, note? }` → `ClientDebt` en `PENDING`.

**Cobrar fiado** — desde `/caja` (`CollectDebtModal`: elegir cliente → elegir **qué deuda**
paga → monto) o desde el detalle del cliente:
`POST /api/clients/:id/debts/:debtId/payments { amount }`

- Permite pagos parciales: `PENDING` → `PARTIAL` → `PAID` (con tolerancia de $0,01).
- El pago no puede superar lo pendiente de **esa** deuda. Dos pagos simultáneos no pueden
  pagarla de más: se actualiza con bloqueo optimista sobre `paidAmount` (el segundo recibe 409).
- Cada deuda es una fila propia (no un saldo único) para tener historial de qué se saldó y cuándo.
- `debtBalance` (saldo total adeudado) se calcula al vuelo en `GET /clients` (una sola query
  para toda la sucursal, sin N+1) y en `GET /clients/:id`.

## 4. Limitaciones conocidas / decisiones pendientes

- **El fiado no toca la caja ni el stock.** Registrar un fiado no crea una venta (no descuenta
  stock, no suma a reportes) y cobrarlo no genera un `CashFlow` ni entra en el efectivo esperado
  del arqueo. Si el cliente paga en efectivo, el arqueo va a dar sobrante. A definir: ¿el cobro
  debería registrarse como ingreso del turno? ¿el fiado debería salir de una venta real con
  medio de pago "Fiado"?
- **El plan PREMIUM solo se valida en el frontend** para estas funciones; las rutas de
  `/api/clients` responden a cualquier plan.
- Las migraciones de este feature asumen datos de prueba: el rename `discountAmount → discountPercent`
  conserva el valor viejo (un "$500" pasaría a ser "500 %") y `PointRedemption.code` se agrega
  `NOT NULL` sin backfill. **Antes de deployar a producción** revisar si hay filas en
  `LoyaltyRule`/`PointRedemption` (ver [GUIA_DEPLOY.md](GUIA_DEPLOY.md#antes-de-deployar-migraciones-de-clientesfiadopuntos-sep-2026)).
