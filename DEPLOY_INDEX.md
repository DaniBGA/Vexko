# Documentación de Deploy - Índice

## Archivos creados para producción

### 1. **GIT_WORKFLOW.md** - Guía rápida Git
**Propósito**: Pasos exactos para pasar cambios de `desarrollo` a `main`

**Contiene**:
- Resumen ejecutivo (5 comandos principales)
- Paso a paso detallado (8 pasos con ejemplos)
- Checklist de seguridad
- Cómo deshacer cambios si algo falla
- Flujo típico para copiar/pegar

**Cuándo usar**: Antes de hacer `git push`

---

### 2. **DEPLOY.md** - Guía completa de deploy en Hostinger KVN2
**Propósito**: Instrucciones paso a paso para poner la app en producción

**Contiene**:
1. Preparación local (merge de ramas, .gitignore)
2. Configuración en Hostinger (acceso SSH, crear usuario)
3. Setup del servidor (instalar Node, Nginx, PM2, SSL)
4. Deploy de la aplicación (variables .env, migraciones BD, build frontend)
5. Configuración Nginx (reverse proxy, SSL con Let's Encrypt)
6. Monitoreo y logs
7. Troubleshooting para problemas comunes
8. Checklist final

**Secciones importantes**:
- Setup inicial del servidor (2 horas aprox)
- Configuración Nginx + SSL (15 minutos)
- PM2 para mantener backend activo (10 minutos)
- Actualización futura de cambios (5 minutos)

**Cuándo usar**: Primera vez que haces deploy + cada vez que actualizas código

---

### 3. **PRODUCTION.md** - Mejores prácticas de producción
**Propósito**: Cómo mantener la app segura, rápida y confiable

**Contiene**:
- Seguridad: Firewall, SSL, Headers, Fail2Ban, JWT secret robusto
- Performance: Gzip, Cache, Rate limiting, Clustering PM2, CDN
- Migraciones de BD de forma segura
- Monitoreo y alertas (healthcheck, logs, Sentry)
- Deployment sin downtime (graceful reload)
- Backup automático cada 6 horas
- Checklist semanal de mantenimiento
- Procedimientos de emergencia

**Secciones críticas**:
- Seguridad (especialmente variables de entorno)
- Backup automático
- Monitoreo (para detectar problemas)

**Cuándo usar**: Después de primer deploy + referencia constante

---

### 4. **pre-deploy-check-simple.ps1** (Windows) o **pre-deploy-check.sh** (Linux/Mac) - Script de verificación
**Propósito**: Verificar automáticamente que no hay archivos sensibles

**Verifica**:
- No hay `.env` en cambios
- `.gitignore` está configurado
- No hay `node_modules` en cambios
- No hay archivos `.db` en cambios
- Resumen de archivos a ser commiteados

**Cuándo usar**: Siempre antes de `git push origin main`

**Uso**:
```powershell
# Windows (RECOMENDADO - funciona sin problemas)
.\pre-deploy-check-simple.ps1

# Linux/Mac
bash pre-deploy-check.sh
```

---

### 5. **.gitignore** - Archivo global
**Propósito**: Asegurar que archivos sensibles nunca suban a git

**Contiene**:
- `.env` (variables de entorno)
- `node_modules/` (dependencias)
- `dist/` (build outputs)
- `*.db*` (bases de datos)
- Archivos temporales, logs, IDE, OS

**Validado**: Incluye `.env`, `node_modules`, `*.db*`

---

## Flujo recomendado para deploy

### Primera vez (Setup inicial)

1. **Preparación local**:
   - Asegúrate que `.gitignore` existe
   - Ejecuta `.\pre-deploy-check-simple.ps1` (Windows) o `bash pre-deploy-check.sh` (Linux/Mac)
   - Merge `desarrollo` → `main` con `git merge desarrollo`
   - Push: `git push origin main`

2. **Seguir DEPLOY.md**:
   - Secciones 1-3: Preparación y acceso a servidor
   - Secciones 4-5: Instalar dependencias y servir app
   - Sección 6: Configurar Nginx y SSL
   - Sección 7: Monitoreo básico

3. **Leer PRODUCTION.md**:
   - Especialmente secciones de Seguridad y Backup
   - Implementar healthcheck (sección "Monitoreo")
   - Configurar backup automático (sección "Backup")

### Después (Actualizaciones)

```bash
# Local
git add .
git commit -m "feat: descripcion"
bash pre-deploy-check.sh
git checkout main
git merge desarrollo
git push origin main

# Servidor
cd /home/vexko/vexko-app
git pull origin main

cd app/backend
npm install
npm run db:deploy  # si hay migraciones
pm2 restart vexko-backend

cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/vexko/
```

---

## Checklist de seguridad antes de deploy

- [ ] Leído GIT_WORKFLOW.md
- [ ] Ejecutado `.\pre-deploy-check-simple.ps1` (Windows) o `bash pre-deploy-check.sh` (Linux/Mac) sin errores
- [ ] `.env` NO está en git (revisar con `git status`)
- [ ] `node_modules` NO está en git
- [ ] No hay secretos/passwords en código commiteado
- [ ] .gitignore contiene `.env`, `node_modules`, `*.db*`
- [ ] JWT_SECRET es string largo y seguro (32+ caracteres)
- [ ] CORS_ORIGIN es tu dominio real, NO `*`
- [ ] Leído PRODUCTION.md sección "Seguridad"

---

## Archivos del workspace importante

**No subir a git (están en .gitignore)**:
- `app/backend/.env` (tu secreto local)
- `app/backend/prisma/dev.db` y `.db-journal`
- `app/frontend/node_modules`
- `app/backend/node_modules`

**SÍ subir a git**:
- Todos los `*.js`, `*.jsx`, `*.json` (excepto .env)
- `schema.prisma` (estructura BD)
- `package.json` y `package-lock.json`
- Migraciones en `prisma/migrations/`
- Documentación (.md)

---

## Variables de entorno (.env) - NO en git

**Backend** (`app/backend/.env`):
```env
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/prod.db
JWT_SECRET=tu_jwt_muy_largo_y_seguro_aqui
CORS_ORIGIN=https://tu-dominio.com
```

**Frontend** (`app/frontend/.env.production`):
```env
VITE_API_URL=https://api.tu-dominio.com
```

---

## Comandos de referencia rápida

```powershell
# Windows (RECOMENDADO):
.\pre-deploy-check-simple.ps1

# Linux/Mac:
# bash pre-deploy-check.sh

# Ver cambios a ser commiteados
git diff --cached --name-only

# Merge seguro
git checkout main && git pull origin main && git merge desarrollo && git push origin main

# Deploy rápido en servidor
git pull origin main && cd app/backend && npm install && npm run db:deploy && pm2 restart vexko-backend && cd ../frontend && npm install && npm run build && sudo cp -r dist/* /var/www/vexko/

# Ver logs
pm2 logs vexko-backend
sudo tail -f /var/log/nginx/error.log

# Restaurar backup
gunzip -c /home/vexko/backups/prod.db.FECHA.gz > app/backend/prisma/prod.db
```

---

## Cronograma típico

**Día 1**:
- Mañana: Leer DEPLOY.md secciones 1-2
- Tarde: Setup servidor Hostinger (seguir DEPLOY.md secciones 3-4)
- Noche: Verificar conectividad

**Día 2**:
- Mañana: Nginx + SSL (DEPLOY.md secciones 5-6)
- Tarde: PM2 y primeros tests
- Noche: Leer PRODUCTION.md

**Día 3 en adelante**:
- Usar GIT_WORKFLOW.md para actualizaciones
- Referencia constante a PRODUCTION.md para issues

---

## Soporte y troubleshooting

**Si DEPLOY.md no da la solución**:
1. Ver logs: `pm2 logs vexko-backend`
2. Ver configuración: `sudo nginx -t`
3. Revisar permisos: `ls -la /var/www/vexko`
4. Ver BD: `sqlite3 app/backend/prisma/prod.db ".tables"`

**Si PRODUCTION.md no cubre tu caso**:
1. Google: "[error específico] Node.js Nginx"
2. Ver Hostinger docs: https://hpanel.hostinger.com
3. Revisar logs de Nginx: `/var/log/nginx/error.log`

---

**¡Listo para deploy!** 🚀

Sigue GIT_WORKFLOW.md → luego DEPLOY.md → implementa PRODUCTION.md para mantener.
