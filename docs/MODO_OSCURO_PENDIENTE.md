# Modo oscuro — pendiente para una futura release

Este documento es la hoja de ruta para cuando se retome el modo oscuro/claro
(pedido: selector arriba en el topbar, **claro por defecto**). No se implementó
nada todavía — esto es solo el mapa de qué hay que tocar y qué no, para no
tener que re-auditar la app de cero.

---

## 1. Por qué se pospuso

El toggle en sí (botón + guardar preferencia) es trivial. Lo que hace esto un
trabajo grande es que la app **mezcla dos sistemas de estilos**:

- Un set de variables CSS ya definido en
  [`theme.css`](app/frontend/src/styles/theme.css) (`--bg-page`, `--card-bg`,
  `--sidebar-bg`, etc.) que sí se podría "oscurecer" centralizadamente.
- Clases de Tailwind con colores **fijos** (`bg-white`, `text-gray-900`,
  `bg-slate-50`...) escritas directo en 14 de las 21 pantallas, que no leen
  ninguna variable y por lo tanto no van a cambiar solas con el toggle.

Son ~470 apariciones de esas clases repartidas de forma muy despareja (dos
pantallas concentran casi el 40% del total). Por eso conviene hacerlo en capas
y no de un tirón.

---

## 2. Estrategia recomendada (arquitectura)

1. **Tailwind**: agregar `darkMode: 'class'` en
   [`tailwind.config.js`](app/frontend/tailwind.config.js). Así los prefijos
   `dark:` de Tailwind se activan por una clase en el `<html>`, no por el
   `prefers-color-scheme` del sistema operativo (necesario para que el default
   sea claro y el usuario lo pueda forzar, en vez de heredar el modo del SO).
2. **Toggle + persistencia**: hook `useTheme()` (localStorage, clave tipo
   `kiosco-theme`, valores `light`/`dark`, default `light` si no hay nada
   guardado) que aplique/saque la clase `dark` del `<html>`. Vivir en
   `app/frontend/src/lib/` (mismo lugar que `hooks.js`, ya existente).
3. **Botón del toggle**: en el `topbar` de
   [`AppLayout.jsx`](app/frontend/src/components/layout/AppLayout.jsx#L84-L90),
   al lado de la fecha — ícono sol/luna (ya está `lucide-react` instalado, trae
   `Sun`/`Moon`).
4. **Variables oscuras**: en `theme.css`, agregar un bloque
   `:root.dark { --bg-page: ...; --card-bg: ...; ... }` redefiniendo las
   mismas variables que ya existen. Todo lo que en `layout.css`/`components.css`
   ya usa `var(--algo)` se oscurece gratis con esto — es la parte "barata".
5. **Todo lo demás** (las clases Tailwind fijas) hay que migrarlas a mano,
   agregando su contraparte `dark:` clase por clase. Es la parte cara — ver
   sección 4.

> Nota: la sidebar (`.sidebar` en `layout.css`) **ya es oscura por diseño**
> (`--sidebar-bg:#1c2050`) en el modo claro actual — no necesita cambios de
> fondo, solo revisar que siga teniendo contraste suficiente si en algún
> momento se la toca.

---

## 3. Qué NO tocar / dejar afuera del toggle

- **[`LandingPage.jsx`](app/frontend/src/components/screens/LandingPage.jsx)**
  (85 clases fijas) — es la página pública de marketing (`/`), no la app
  logueada. Recomendación: dejarla **siempre en su paleta actual**, no
  meterla en el sistema de tema. Si se le aplica `dark:` igual va a heredar
  la clase `dark` del `<html>` si el usuario la dejó activada desde la app —
  hay que decidir explícitamente si se excluye (ej. forzando `light` al
  montar esa ruta) o se le hace su propio modo oscuro de marketing aparte.
- **PDFs generados** (`lib/pdf.js`, `lib/barcodeLabels.js`) — quedan como
  están. Un PDF para imprimir siempre debe ser blanco/negro, no debe seguir el
  tema de la UI.
- **[`Logo.jsx`](app/frontend/src/components/ui/Logo.jsx)** — es una imagen
  (`logo.png`), no CSS. Si el logo actual no se lee bien sobre fondo oscuro en
  el topbar, hace falta una segunda versión del archivo de imagen, no un
  cambio de código.
- **Toasts** (`react-hot-toast`, configurado en
  [`main.jsx`](app/frontend/src/main.jsx)) — tienen su estilo inline propio,
  hay que revisarlos aparte, no se oscurecen con las variables CSS.

---

## 4. Inventario de archivos a tocar, por capa y prioridad

### Capa 0 — Infraestructura (hacer primero, una sola vez)
| Archivo | Cambio |
|---|---|
| `app/frontend/tailwind.config.js` | agregar `darkMode: 'class'` |
| `app/frontend/src/lib/hooks.js` (o archivo nuevo `theme.js`) | hook `useTheme()` |
| `app/frontend/src/components/layout/AppLayout.jsx` | botón toggle en el topbar |
| `app/frontend/src/styles/theme.css` | bloque `:root.dark { ... }` con las variables oscuras |

### Capa 1 — CSS compartido (alto apalancamiento, bajo esfuerzo)
Estos archivos ya usan `var(--...)` en su mayoría, así que se oscurecen casi
solos apenas esté la Capa 0. Revisar igual los colores fijos que quedaron
sueltos (hex directos, no variables):

| Archivo | Colores fijos a revisar |
|---|---|
| [`layout.css`](app/frontend/src/styles/layout.css) | `#e8eaf0` (borde topbar), `#5a6399`/`#b7c0e6` (texto nav, ya son claros sobre fondo oscuro fijo — probablemente no necesitan cambio) |
| [`components.css`](app/frontend/src/styles/components.css) | `#eee`/`#f5f5f5` (bordes tabla), `#f8f9ff` (fondo header tabla y hover fila), `#888` (kpi-label), `#666`/`#dde`/`#f9faff` (field-label, field-input) |
| [`base.css`](app/frontend/src/styles/base.css) | `background-color:#f8fafc; color:#0f172a` en `body` — **pisa** el `html,body{background:var(--bg-page)...}` de `theme.css` según orden de `@import` en `index.css`; hay que unificar a una sola fuente de verdad antes de tocar nada, si no el toggle no va a funcionar en el body |
| [`auth.css`](app/frontend/src/styles/auth.css) | redefine `.field-input` y `.btn-primary` con `@apply` usando `slate`/`emerald` de Tailwind — **pisa** las versiones de `components.css` por orden de import. Mismo problema: dos definiciones de la misma clase en archivos distintos, hay que decidir cuál es la real antes de dark-mode-ar cualquiera de las dos |

### Capa 2 — Componentes compartidos (alto apalancamiento)
| Archivo | Ocurrencias | Nota |
|---|---|---|
| [`components/ui/index.jsx`](app/frontend/src/components/ui/index.jsx) | 4 | `PageHeader`, `Badge`, `EmptyState` — los usan casi todas las pantallas, así que oscurecer estos 4 lugares beneficia a la app entera de una sola vez. **Empezar por acá después de la Capa 0/1.** |

### Capa 3 — Pantallas con clases fijas (de mayor a menor esfuerzo)
| Pantalla | Ocurrencias |
|---|---|
| [`SupplierDetailPage.jsx`](app/frontend/src/components/screens/SupplierDetailPage.jsx) | 99 |
| [`HistoryPage.jsx`](app/frontend/src/components/screens/HistoryPage.jsx) | 87 |
| [`LandingPage.jsx`](app/frontend/src/components/screens/LandingPage.jsx) | 85 (**excluida**, ver sección 3) |
| [`CashRegisterPage.jsx`](app/frontend/src/components/screens/CashRegisterPage.jsx) | 65 |
| [`AdminPage.jsx`](app/frontend/src/components/screens/AdminPage.jsx) | 48 (panel interno de Grupo Vexus — evaluar si vale la pena o si se deja solo en claro, uso interno) |
| [`ProductFormPage.jsx`](app/frontend/src/components/screens/ProductFormPage.jsx) | 43 |
| [`SalePage.jsx`](app/frontend/src/components/screens/SalePage.jsx) | 32 |
| [`ReportsPage.jsx`](app/frontend/src/components/screens/ReportsPage.jsx) | 32 (+ gráficos `recharts`, ver Capa 4) |
| [`SuppliersPage.jsx`](app/frontend/src/components/screens/SuppliersPage.jsx) | 26 |
| [`StockPage.jsx`](app/frontend/src/components/screens/StockPage.jsx) | 26 |
| [`CatalogPage.jsx`](app/frontend/src/components/screens/CatalogPage.jsx) | 4 |
| [`CashFlowPage.jsx`](app/frontend/src/components/screens/CashFlowPage.jsx) | 3 |
| [`LoginPage.jsx`](app/frontend/src/components/screens/LoginPage.jsx) | 1 |
| [`AdminLoginPage.jsx`](app/frontend/src/components/screens/AdminLoginPage.jsx) | 1 |

Pantallas que **no** aparecen en esta lista (`ClientDetailPage.jsx`,
`ClientsPage.jsx`, `AfipPage.jsx`, `PricesPage.jsx`) ya usan casi
exclusivamente `PageHeader`/clases de `components.css`, así que se benefician
gratis de las Capas 0–2 y no deberían necesitar trabajo propio — confirmar de
todas formas mirándolas en el navegador con el toggle activado.

### Capa 4 — Gráficos (`recharts`, solo en `ReportsPage.jsx`)
Los ejes, grillas, tooltips y leyendas de `recharts` se configuran con colores
por prop (no leen CSS), así que hace falta pasarles el color según el tema
activo desde el componente (ej. `stroke={isDark ? '#334155' : '#e5e7eb'}`).
No alcanza con CSS solo para esta pantalla.

---

## 5. Checklist de implementación sugerido (orden)

1. [ ] Capa 0 — toggle funcional, default claro, persiste en localStorage.
2. [ ] Unificar `base.css` vs `theme.css` (mismo dueño del `background`/`color`
       de `body`) y `components.css` vs `auth.css` (una sola definición de
       `.field-input`/`.btn-primary`) — si no, el toggle se ve inconsistente
       desde el arranque.
3. [ ] Variables oscuras en `theme.css` + limpiar los hex sueltos de la Capa 1.
4. [ ] `components/ui/index.jsx` (Capa 2).
5. [ ] Pantallas de la Capa 3, de mayor a menor uso real (no necesariamente el
       orden de la tabla — priorizar las que el kiosco usa todos los días:
       `SalePage`, `StockPage`, `CashRegisterPage`, `HistoryPage` antes que
       `AdminPage` que es de uso interno).
6. [ ] Gráficos de `ReportsPage.jsx` (Capa 4).
7. [ ] Decidir y aplicar qué pasa con `LandingPage.jsx` (excluir del tema o
       darle su propio dark mode de marketing).
8. [ ] Revisar toasts y cualquier modal/dropdown con `box-shadow` en negro
       fijo (`rgba(0,0,0,...)`) — suelen verse mal sobre fondo oscuro y hay
       que suavizarlos.
9. [ ] Pasada visual completa: recorrer cada pantalla en el navegador con el
       toggle en ambos modos (no alcanza con que compile/no tire error de
       Tailwind — hay que mirarlo).

---

## 6. Estimación

Con la infraestructura ya pensada acá, lo más lento no es el toggle sino
migrar las ~470 clases fijas pantalla por pantalla y verificar cada una
visualmente. Conviene tratarlo como una mini-release en sí misma (varias
sesiones), no como un cambio suelto.
