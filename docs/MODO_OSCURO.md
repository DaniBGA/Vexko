# Modo oscuro

**Estado:** implementado en `develop` (25-oct-2026), sin commitear.
**Última revisión:** 25 de octubre de 2026.

La app logueada tiene un botón sol/luna en el topbar (al lado de la fecha) que
cambia entre modo claro y oscuro. **Claro por defecto.** La elección se guarda en
el navegador (`localStorage`, clave `vexko-theme`): es por dispositivo, no por
cuenta.

| Pieza | Dónde |
|---|---|
| Hook y persistencia | [`lib/theme.js`](../app/frontend/src/lib/theme.js) → `useAppTheme()` |
| Botón | topbar de [`AppLayout.jsx`](../app/frontend/src/components/layout/AppLayout.jsx) |
| Colores oscuros | [`styles/dark.css`](../app/frontend/src/styles/dark.css) (último `@import` de `index.css`) |
| Variables para estilos inline | [`styles/theme.css`](../app/frontend/src/styles/theme.css) (`--navy-text`, `--navy-solid`, `--soft-navy-bg`, `--ok-bg`...) |
| Logo | [`Logo.jsx`](../app/frontend/src/components/ui/Logo.jsx): `onDark` usa `images/logo-vexko-claro.png` |

---

## 1. Cómo funciona

- `useAppTheme()` pone la clase `dark` en `<html>` **solo mientras `AppLayout` está
  montado**. Al salir de la app se saca: la landing, los logins, el panel admin y
  la pantalla de bloqueo por suscripción quedan siempre con su paleta propia.
- Las pantallas usan clases de Tailwind con colores fijos (`bg-white`,
  `text-gray-500`, `border-slate-200`...), unas 500 en total. En vez de agregarles
  `dark:` una por una, **`dark.css` redefine cada clase usada** bajo `html.dark`.
  Así el markup no cambió y la regla queda en un solo archivo.
- Bordes sin color (`border`, `border-b`): se oscurecen con una regla
  `:where(html.dark *)` de especificidad 0, para que cualquier `border-*`
  explícito siga ganando.
- Inputs, selects y textareas tienen fondo oscuro genérico (también pisa el blanco
  de `@tailwindcss/forms`). `color-scheme: dark` oscurece scrollbars y el
  selector de fecha nativo.
- Toasts: `className: 'app-toast'` en `main.jsx`, oscurecidos en `dark.css`.
- `tailwind.config.js` tiene `darkMode: 'class'`: si algún día se prefiere `dark:`
  en el markup, usa la misma clase.

## 2. Reglas para código nuevo (si no, en oscuro se ve claro)

1. **Clase de color de Tailwind que todavía no se use en la app** (por ejemplo,
   `bg-sky-50` o `text-purple-700`): agregar su versión oscura en `dark.css`.
   Para ver cuáles hay, buscar el patrón `(bg|text|border)-(color)-(tono)` en
   `components/screens` y compararlo con `dark.css`.
2. **Colores inline** (`style={{ color: '#...' }}`): no usar hex fijos, usar las
   variables de `theme.css` (`var(--navy-text)`, `var(--ok-bg)`...), que tienen
   su valor oscuro en `dark.css`. `CashRegisterPage` es el ejemplo: su constante
   `NAVY` es `var(--navy-text)`.
3. **Texto claro sobre fondo navy** (`bg-brand-navy` + `text-white` /
   `text-slate-300`): no hace falta nada; `text-slate-300` no se remapea a
   propósito porque en la app solo se usa sobre navy.
4. Cuerpos de pantalla con scroll (`flex-1 overflow-y-auto bg-slate-50`) toman el
   fondo de la página en oscuro.

## 3. Fuera del modo oscuro (a propósito)

- **Landing, logins, panel admin y pantalla de bloqueo**: no están dentro de
  `AppLayout`, así que nunca reciben la clase `dark`. Los logins ya tienen fondo
  oscuro y usan el logo claro.
- **PDFs y etiquetas** (`lib/pdf.js`, `lib/barcodeLabels.js`): siempre blanco y negro.

## 4. Verificación (25-oct-2026)

Se recorrieron en Chromium headless, con datos (caja abierta, ventas en efectivo,
mixtas y por transferencia, cliente con cupón y fiado parcial, proveedor con pedido):
todas las pantallas de la sucursal y sus modales (editar turno, dejar fiado y
cobrar deuda, nuevo proveedor, nuevo pedido, pedido recibido, nuevo cliente, regla
de puntos, registrar pago de fiado, detalle y edición de venta), más el cierre de
caja. Un script midió el contraste de cada texto contra su fondo y buscó superficies
blancas en oscuro: no quedó ninguna, y lo único con contraste bajo es blanco sobre
el verde de la marca (igual que en claro). También el cambio claro ↔ oscuro desde
el botón, y que al cerrar sesión el login vuelve sin la clase `dark`.

### Pendiente

- Al recargar con el modo oscuro activo, la app arranca en claro durante un
  instante, hasta que se monta `AppLayout`.
