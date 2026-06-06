# 🚀 VEXKO - Deploy a Producción

## Estado: LISTO PARA DEPLOY

Tu aplicación está lista para pasar de desarrollo a producción en Hostinger KVN2.

---

## 📦 Qué se ha creado

### Documentación de Deploy

| Archivo | Propósito | Cuándo leer |
|---------|-----------|------------|
| **DEPLOY_INDEX.md** (este) | Índice y punto de entrada | Primero |
| **GIT_WORKFLOW.md** | Cómo pasar cambios a main | Antes de cada push |
| **DEPLOY.md** | Guía paso a paso Hostinger KVN2 | Para primer deploy |
| **PRODUCTION.md** | Seguridad, performance, monitoreo | Después de primer deploy |
| **pre-deploy-check.sh** | Script de verificación | Siempre antes de push |
| **.gitignore** | Archivos a ignorar en git | Verificado ✓ |

---

## ⚡ Plan de acción (3 días)

### Día 1: Preparación local (1 hora)

```powershell
# 1. Verificar que todo está limpio (Windows)
.\pre-deploy-check-simple.ps1

# 2. Leer GIT_WORKFLOW.md (5 min)

# 3. Pasar cambios a main
git add .
git commit -m "feat: preparar deploy a producción"
.\pre-deploy-check-simple.ps1
git checkout main
git pull origin main
git merge desarrollo
git push origin main
```

> **En Linux/Mac**: Usar `bash pre-deploy-check.sh` en lugar de `.\pre-deploy-check-simple.ps1`

### Día 2: Setup servidor Hostinger (3 horas)

```bash
# Seguir DEPLOY.md secciones 1-4:
# - Acceso SSH a Hostinger
# - Instalar Node, Nginx, PM2
# - Clonar repo y instalar dependencias
# - Inicializar base de datos
```

### Día 3: Poner en línea (2 horas)

```bash
# Seguir DEPLOY.md secciones 5-6:
# - Configurar Nginx como reverse proxy
# - SSL con Let's Encrypt
# - PM2 para mantener backend activo
# - Verificar que funciona
```

### Luego: Mantenimiento

```bash
# Para futuras actualizaciones:
# Seguir GIT_WORKFLOW.md
# Referencia: PRODUCTION.md para issues
```

---

## 🔐 Seguridad: LO MÁS IMPORTANTE

### Antes de cada push:

```bash
# NUNCA hagas push de:
# ❌ .env (variables sensibles)
# ❌ node_modules
# ❌ *.db (bases de datos)
# ❌ Passwords o API keys

# Verificar:
bash pre-deploy-check.sh

# Si falla, NO hacer push
```

---

## 📋 Checklist Pre-Deploy

- [ ] He leído DEPLOY_INDEX.md (este archivo)
- [ ] He ejecutado `bash pre-deploy-check.sh` exitosamente
- [ ] No hay `.env` en git (verificado con `git status`)
- [ ] DEPLOY.md está disponible para leer
- [ ] PRODUCTION.md está disponible para leer
- [ ] Tengo acceso a Hostinger KVN2

---

## 🎯 Próximos pasos

### 1️⃣ Lee esto primero (5 min):
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Entender flujo de git

### 2️⃣ Luego ejecuta (1 hora):
```powershell
# Windows PowerShell:
.\pre-deploy-check-simple.ps1
git checkout main
git merge desarrollo
git push origin main

# Linux/Mac:
# bash pre-deploy-check.sh
```

### 3️⃣ Accede al servidor (15 min):
- Hostinger panel > tu VPS KVN2 > Terminal

### 4️⃣ Sigue el paso a paso (3-4 horas):
- [DEPLOY.md](DEPLOY.md) - Todas las secciones en orden

### 5️⃣ Implementa mejores prácticas (1 hora):
- [PRODUCTION.md](PRODUCTION.md) - Especialmente Seguridad y Backup

---

## 📊 Estructura del proyecto después de deploy

```
/home/vexko/vexko-app/          (Tu código en servidor)
├── app/
│   ├── backend/
│   │   ├── .env                (variables secretas - NO en git)
│   │   ├── index.js
│   │   ├── prisma/
│   │   │   └── prod.db         (base de datos - NO en git)
│   │   └── routes/
│   │
│   └── frontend/
│       ├── dist/               (build compilado)
│       └── src/
│
└── backups/                    (backups diarios de BD)
    ├── prod.db.20240615_030000
    └── prod.db.20240614_030000

/var/www/vexko/                (Frontend servido por Nginx)
├── index.html
├── dist/
│   ├── assets/
│   │   ├── *.js
│   │   └── *.css
│   └── ...

/etc/nginx/sites-available/vexko    (Configuración Nginx)
/etc/letsencrypt/live/tu-dominio/   (Certificados SSL)
```

---

## 🔄 Flujo de actualización típico (después de deploy)

```bash
# En tu máquina local
git add .
git commit -m "feat: descripción"
bash pre-deploy-check.sh
git checkout main && git merge desarrollo && git push origin main

# En el servidor (SSH)
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

## 🆘 Si algo falla

### Durante setup:
1. Ver logs: `pm2 logs vexko-backend`
2. Ver Nginx: `sudo nginx -t`
3. Revisar DEPLOY.md sección "Troubleshooting"

### Después de deploy:
1. Revisar PRODUCTION.md
2. Ejecutar healthcheck: `curl https://tu-dominio.com/api/health`
3. Ver backups: `ls -la /home/vexko/backups/`

---

## 📞 Documentos importantes

### Para referencia rápida:
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Comandos git exactos
- [DEPLOY.md](DEPLOY.md) - Instrucciones paso a paso
- [pre-deploy-check.sh](pre-deploy-check.sh) - Script de seguridad

### Para mantener producción:
- [PRODUCTION.md](PRODUCTION.md) - Seguridad, monitoreo, backups
- [DEPLOY_INDEX.md](DEPLOY_INDEX.md) - Resumen completo

---

## ✅ Tu aplicación incluye

### Backend (Node.js + Express + Prisma)
- ✅ Autenticación con JWT
- ✅ CRUD de productos, ventas, proveedores, clientes
- ✅ Sistema de caja y reportes
- ✅ Multi-kiosco con stock separado
- ✅ Paginación en listados
- ✅ Editar/borrar pedidos (nuevo)

### Frontend (React + Vite + Tailwind)
- ✅ Dashboard de vendedor
- ✅ Gestión de proveedores con modal
- ✅ Tabla de pedidos con acciones
- ✅ Sistema de login seguro
- ✅ Interfaz responsive

### Seguridad
- ✅ CORS configurado
- ✅ Rate limiting
- ✅ Validación de inputs
- ✅ Migraciones seguras de BD
- ✅ Backup automático

---

## 🎓 Comandos que usarás frecuentemente

```bash
# Ver estado de app
pm2 status
pm2 logs vexko-backend

# Controlar app
pm2 restart vexko-backend
pm2 stop vexko-backend
pm2 start vexko-backend

# Ver logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Actualizar código
cd /home/vexko/vexko-app && git pull origin main

# Reiniciar nginx
sudo systemctl reload nginx

# Ver espacio disco
df -h
```

---

## 🚀 ¡LISTO PARA COMENZAR!

### Recomendación de orden:

1. **AHORA**: Lee [GIT_WORKFLOW.md](GIT_WORKFLOW.md) (5 min)
2. **HOY**: Ejecuta `bash pre-deploy-check.sh` y haz merge a main (1 hora)
3. **MAÑANA**: Lee [DEPLOY.md](DEPLOY.md) y comienza setup (3-4 horas)
4. **PASADO**: Termina DEPLOY.md y lee [PRODUCTION.md](PRODUCTION.md)
5. **SIEMPRE**: Usa pre-deploy-check.sh antes de cada push

---

## 💡 Tips finales

- **Backup es tu amigo**: La BD se respalda automáticamente cada 6 horas
- **Logs son tu verdad**: Siempre revisa logs si algo falla
- **SSL es obligatorio**: HTTPS desde el primer día
- **Gradual es mejor**: Empieza en KVN2, escala si es necesario
- **Documentación es oro**: Estos archivos son tu guía

---

**¡Éxito en el deploy! 🎉**

Si tienes preguntas, revisa primero los documentos correspondientes.
