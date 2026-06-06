# Guía rápida: Pasar de desarrollo a main (producción)

## Resumen ejecutivo

```bash
# 1. Verificar que .gitignore está correcto
bash pre-deploy-check.sh

# 2. Pasar a main
git checkout main
git pull origin main

# 3. Merge de desarrollo
git merge desarrollo

# 4. Resolver conflictos si hay
# (editar manualmente y luego: git add . && git commit)

# 5. Push a main
git push origin main

# 6. Hacer deploy en Hostinger (ver DEPLOY.md)
```

---

## Paso a paso detallado

### 1. Verificar cambios locales

```bash
# Ver estado actual
git status

# Debería mostrar que todo está "clean" o con cambios que quieres subir
```

### 2. Ejecutar verificación de seguridad

```powershell
# Windows PowerShell:
.\pre-deploy-check-simple.ps1

# Linux/Mac (Bash):
# bash pre-deploy-check.sh

# Debería mostrar: "OK: PRE-DEPLOY CHECK APROBADO"
# Si falla, corregir los errores antes de continuar
```

### 3. Hacer staging de cambios

```bash
# Agregar todos los cambios
git add .

# O si prefieres ser más selectivo
git add app/backend/routes/
git add app/frontend/src/

# Ver lo que se va a commitear
git diff --cached --name-only
```

### 4. Crear commit

```bash
# Commit con mensaje descriptivo
git commit -m "feat: agregar editar/borrar pedidos con paginación"

# Ejemplos de buenos mensajes:
# "feat: nueva funcionalidad X"
# "fix: corregir bug en Y"
# "perf: optimizar consultas de Z"
# "docs: actualizar documentación"
```

### 5. Pasar a main

```bash
# Ver en qué rama estás
git branch

# Cambiar a main
git checkout main

# Traer cambios más recientes de main
git pull origin main
```

### 6. Merge de desarrollo

```bash
# Hacer merge de desarrollo a main
git merge desarrollo

# Si todo está bien, debería decir: "Fast-forward"
# Si hay conflictos, resolverlos manualmente
```

Si hay conflictos:

```bash
# Ver qué archivos tienen conflictos
git status

# Editar los archivos marcados con <<<<<<< HEAD
# Resolver manualmente y guardar

# Marcar como resuelto
git add .

# Completar el merge
git commit -m "Merge: resolver conflictos de desarrollo a main"
```

### 7. Verificar merge

```bash
# Ver cambios en main después del merge
git log --oneline -10

# Debería mostrar los commits de desarrollo
```

### 8. Push a main

```bash
# Enviar cambios a repositorio remoto
git push origin main

# Verificar que se subió
git log --oneline -5 origin/main
```

---

## Verificaciones antes de hacer push

### Checklist

- [ ] `.gitignore` existe y contiene `.env`, `node_modules`, `*.db*`
- [ ] No hay `.env` en cambios staged
- [ ] No hay `node_modules` en cambios staged
- [ ] No hay `*.db` o `*.db-journal` en cambios staged
- [ ] No hay secretos/passwords en el código
- [ ] Todos los conflictos están resueltos
- [ ] El commit tiene mensaje descriptivo
- [ ] Los tests pasan (si existen)

---

## Si algo salió mal

### Deshacer último push

```bash
# Ver último commit
git log --oneline -1

# Si aún no has hecho deploy, puedes forzar:
git reset --hard HEAD~1
git push origin main --force

# Esto borra el commit, úsalo solo si lo hiciste mal
```

### Deshacer merge pero mantener cambios locales

```bash
# Si estás en main y el merge salió mal
git merge --abort

# Vuelve a desarrollo y revisa los cambios
git checkout desarrollo
```

### Ver diferencia entre ramas

```bash
# Ver qué cambios hay en desarrollo que no están en main
git diff main..desarrollo

# Ver qué archivos cambiarán
git diff --name-only main..desarrollo
```

---

## Después del push

### Proceder con deploy en Hostinger

```bash
# En el servidor VPS:
cd /home/vexko/vexko-app
git pull origin main

# Instalar dependencias nuevas
cd app/backend
npm install
npm run db:deploy
pm2 restart vexko-backend

# Frontend
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/vexko/
sudo systemctl reload nginx
```

Ver DEPLOY.md para instrucciones completas.

---

## Tips y trucos

### Ocultar temporalmente cambios

```bash
# Si tienes cambios sin commitear pero quieres cambiar de rama
git stash

# Cambiar de rama
git checkout otra-rama

# Volver tus cambios cuando regreses
git checkout tu-rama
git stash pop
```

### Ver historial completo

```bash
# Ver todos los commits con detalles
git log --graph --oneline --all

# Ver cambios en un archivo específico
git log -p archivo.js
```

---

## SEGURIDAD: Lo MAS importante

Antes de cada push verifica:

```bash
# Revisar los cambios exactos que subirás
git diff --cached

# Buscar accidentales secrets
git diff --cached | grep -i 'password\|secret\|token\|api.*key'

# Ver lista de archivos
git diff --cached --name-only

# Nunca hagas push de:
# .env
# .env.production
# *.db (bases de datos)
# node_modules
# Archivos con passwords/keys
```

Si accidentalmente subiste un secret:

```bash
# Revertir el commit INMEDIATAMENTE
git reset --hard HEAD~1
git push origin main --force

# Cambiar el secret
# Hacer nuevo commit sin el secret
git push origin main

# En producción, revocar/cambiar ese secret
```

---

## Comandos de ayuda

```bash
# Ver ramas disponibles
git branch -a

# Ver qué rama estoy usando
git branch --show-current

# Ver remotes configurados
git remote -v

# Ver cambios sin staged
git diff

# Ver cambios staged
git diff --cached

# Ver historial limpio
git log --oneline -20

# Ver quién hizo cada cambio
git blame archivo.js
```

---

## Flujo típico (resumen para copiar)

```powershell
# Parado en tu rama de desarrollo (Windows PowerShell)
git add .
git commit -m "feat: descripcion del cambio"
.\pre-deploy-check-simple.ps1
git checkout main
git pull origin main
git merge desarrollo
git push origin main

# Listo para deploy en Hostinger!
```
