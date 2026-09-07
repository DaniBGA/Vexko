# Documentación — Kiosco App

Índice de toda la documentación del proyecto. La documentación de setup local
y arranque rápido vive en el [README.md](../README.md) de la raíz; acá va todo
lo demás: estructura de datos, decisiones de producto, deploy y lo que queda
pendiente para futuras releases.

| Documento | Contenido |
|---|---|
| [DATABASE_STRUCTURE.md](DATABASE_STRUCTURE.md) | Estructura de la base de datos: modelos de Prisma, relaciones entre entidades. |
| [MULTIBUSINESS.md](MULTIBUSINESS.md) | Diseño multi-tenant: Customer → Kiosk → cuentas, y cómo se separan los datos entre clientes/sucursales. |
| [GUIA_DEPLOY.md](GUIA_DEPLOY.md) | Guía paso a paso de deploy a producción (setup inicial del VPS + auto-deploy con GitHub Actions). |
| [MODO_OSCURO_PENDIENTE.md](MODO_OSCURO_PENDIENTE.md) | Pendiente para una futura release: hoja de ruta para implementar el modo oscuro/claro. |

## Convención

Cuando se agregue un documento nuevo acá, sumarlo también a esta tabla. Usar
nombres en mayúsculas con guión bajo (`ASI_COMO_LOS_DEMAS.md`) para mantener
consistencia con los ya existentes.

Para features pendientes o ideas para futuras releases que todavía no se
implementan (como `MODO_OSCURO_PENDIENTE.md`), documentar acá el alcance y las
decisiones a tomar, no el código en sí — el código se escribe cuando se
retoma el trabajo.
