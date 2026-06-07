CUIDADO: Cambios en producción

Este archivo resume pasos seguros y checklist para tocar lógica que afecta stock/pedidos en producción.

Pasos rápidos:
- Hacer backup de la DB (`prisma/backup-prod-db.sh` o `.ps1`).
- Probar cambios en una copia de la DB localmente.
- Añadir un `--dry-run` antes de borrar o reasignar datos.
- Hacer despliegue en horas de baja actividad.

Checklist antes de deploy:
- [ ] Backup creado
- [ ] PR con cambios revisado
- [ ] Tests manuales básicos: crear pedido, recibir pedido, verificar stock y proveedor
- [ ] Revisar referencias a `productId` y `supplierId`
