# Documentación — Kiosco App (Vexko)

Índice de toda la documentación del proyecto. La documentación de setup local
y arranque rápido vive en el [README.md](../README.md) de la raíz; acá va todo
lo demás: estructura de datos, decisiones de producto, deploy y lo que queda
pendiente para futuras releases.

El contexto de trabajo y el **registro de cambios** de cada actualización están en
[`CLAUDE.md`](../CLAUDE.md) (raíz del repo).

| Documento | Contenido |
|---|---|
| [DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md) | Estructura de la base de datos: los 24 modelos de Prisma por dominio, relaciones, reglas de borrado, historial de migraciones y observaciones conocidas. |
| [SUSCRIPCIONES.md](SUSCRIPCIONES.md) | Suscripción mensual a VEXKO por cliente: ciclo (vencimiento, 10 días de gracia, bloqueo), aviso y bloqueo en la app, gestión de pagos en el panel admin, WhatsApp de contacto y precios de planes (landing), y alta en producción. |
| [MULTIBUSINESS.md](MULTIBUSINESS.md) | Diseño multi-tenant: Customer → Kiosk → cuenta/empleados, roles, cómo se aíslan los datos, catálogo global vs. productos propios, y planes (BASE / INTERMEDIO / PREMIUM). |
| [API_ENDPOINTS.md](API_ENDPOINTS.md) | Todos los endpoints REST por router, con parámetros, plan requerido y reglas de negocio. |
| [CLIENTES_FIADO_PUNTOS.md](CLIENTES_FIADO_PUNTOS.md) | Feature PREMIUM: clientes finales, sistema de puntos, cupones de descuento con código y fiado. Flujos y limitaciones conocidas. |
| [GUIA_DEPLOY.md](GUIA_DEPLOY.md) | Guía paso a paso de deploy a producción (setup inicial del VPS + auto-deploy con GitHub Actions + avisos sobre migraciones). |
| [MODO_OSCURO.md](MODO_OSCURO.md) | Modo claro/oscuro de la app: cómo funciona (`dark.css` + `useAppTheme`), qué hacer para que una pantalla nueva se vea bien en oscuro y qué queda afuera. |

## Convención

Cuando se agregue un documento nuevo acá, sumarlo también a esta tabla. Usar
nombres en mayúsculas con guión bajo (`ASI_COMO_LOS_DEMAS.md`) para mantener
consistencia con los ya existentes.

Cada documento lleva arriba una línea **"Última revisión: <fecha>"**. Al cambiar
algo que un documento describe (schema, endpoints, planes, flujos), actualizarlo
en el mismo cambio, cambiar esa fecha y anotarlo en el registro de `CLAUDE.md`.

Para features pendientes o ideas para futuras releases que todavía no se
implementan, documentar acá el alcance y las
decisiones a tomar, no el código en sí — el código se escribe cuando se
retoma el trabajo.
