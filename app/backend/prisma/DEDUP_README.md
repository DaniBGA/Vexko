# Dedupe & Backup — instrucciones rápidas

Precauciones y pasos seguros antes de ejecutar el dedupe de productos.

Requisitos
- Ejecutar desde el directorio `app/backend` (para que las rutas relativas funcionen).
- Tener `node` y `npm` instalados y `node_modules` presentes (`@prisma/client` requerido).
- Tener `sqlite3` disponible en el PATH en el servidor donde vayas a ejecutar los backups.

1) Hacer backup (recomendado siempre)

Bash (Linux server):
```bash
cd /home/vexko/Vexko/app/backend
./prisma/backup-prod-db.sh 
# o especificando ruta de DB y carpeta de backup:
./prisma/backup-prod-db.sh "/home/vexko/Vexko/app/backend/prisma/prisma/prod.db" "/home/vexko/backups"
```

PowerShell (Windows / PowerShell Core):
```powershell
cd E:\Vexus\Desarrollo\Vexko\app\backend
.\prisma\backup-prod-db.ps1 -DbPath ".\prisma\prisma\prod.db" -BackupDir ".\backups"
```

2) Ejecutar dedupe (después del backup)

```bash
cd /home/vexko/Vexko/app/backend
node prisma/dedupe-products.mjs
```

Qué hace `prisma/dedupe-products.mjs`
- Agrupa productos por nombre normalizado (trim + lowercase).
- Para cada grupo con duplicados mantiene el más antiguo y procesa los duplicados:
  - Reasigna `kioskProduct` al producto conservado; si existe fila para ese kiosco la combina sumando `stock` y ajustando `minStock`.
  - Reasigna o elimina entradas en `supplierProduct` para evitar conflictos de unicidad.
  - Reasigna `saleItem` y `purchaseItem` para apuntar al producto conservado.
  - Elimina el registro duplicado de `Product`.

Limitaciones y recomendaciones
- NO ejecutar en producción sin backup y sin probar primero en una copia de la base de datos.
- Si hay otras tablas que referencian `productId` y no están cubiertas (p. ej. integraciones personalizadas), añade sus reasignaciones dentro del script antes de borrar.
- En casos donde ambos productos tengan historial (ventas/compras) se re-asignan referencias; revisa resultados por inconsistencias.
- Si prefieres no reescribir historial, modifica el script para sólo listar duplicados y no eliminar.

Registro y salida
- El script imprime grupos detectados y cada `id` eliminado. Revisa la salida y valida en la DB.

Soporte
- Puedo adaptar el script para: dry-run (simular cambios), exportar un CSV con grupos, o crear un PR con una versión que sólo liste duplicados.
