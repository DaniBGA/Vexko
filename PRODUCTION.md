# Mejores prácticas para producción

## 🔒 Seguridad

### 1. Variables de entorno sensibles

**Nunca subir a git:**
- `.env` (cualquier rama)
- `.env.production`
- `.env.*.local`
- Claves privadas SSH
- Credenciales de BD

**Usar en servidor:**
```bash
# Solo crear directamente en servidor
nano /home/vexko/vexko-app/app/backend/.env
```

### 2. JWT Secret robusto

```bash
# Generar un secreto seguro (en local o servidor)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Resultado ejemplo:
# a7f3c9e2b1d4f8a6c3e9b2d5f1a8c3e6b9d2f5a8c1e4b7d0f3a6c9e2b5f8
```

Usa este valor en `JWT_SECRET` del `.env` en servidor.

### 3. CORS configurado

```env
# Permitir solo tu dominio
CORS_ORIGIN=https://tu-dominio.com,https://www.tu-dominio.com
# No: CORS_ORIGIN=*
```

### 4. Base de datos

```bash
# Permisos restringidos para archivo de BD
chmod 600 /home/vexko/vexko-app/app/backend/prisma/prod.db
chmod 600 /home/vexko/vexko-app/app/backend/.env
```

### 5. Firewall (UFW)

```bash
# Habilitar firewall
sudo ufw enable

# Permitir SSH
sudo ufw allow 22

# Permitir HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Verificar reglas
sudo ufw status
```

### 6. Fail2Ban (protección contra ataques de fuerza bruta)

```bash
# Instalar
sudo apt install -y fail2ban

# Configuración básica (ya viene con defaults)
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Ver estado
sudo fail2ban-client status
```

### 7. Headers de seguridad en Nginx

Actualizar `/etc/nginx/sites-available/vexko`:

```nginx
# Agregar dentro del bloque server (port 443):
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

# Habilitar HSTS (force HTTPS)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

Reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📊 Performance

### 1. Compresión Gzip

Ya configurado en DEPLOY.md, pero verifica:

```nginx
gzip on;
gzip_types text/plain text/css text/javascript application/json application/javascript;
gzip_min_length 1000;
gzip_vary on;
gzip_comp_level 6;
```

### 2. Cache de contenido estático

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 3. Límite de rate limiting en Nginx

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

# En location /api
limit_req zone=api_limit burst=20 nodelay;
```

### 4. PM2 con múltiples instancias (clustering)

```bash
# Usar todos los cores disponibles
pm2 start index.js -i max --name "vexko-backend"

# O especificar cantidad
pm2 start index.js -i 4 --name "vexko-backend"

# Monitorear
pm2 monit
```

### 5. CDN para archivos estáticos (CloudFlare Free)

1. Ir a [cloudflare.com](https://cloudflare.com)
2. Agregar sitio
3. Cambiar nameservers en Hostinger
4. Habilitar "Auto Minify" para JS/CSS
5. Habilitar "Rocket Loader" para JS async

---

## 🔄 Migraciones seguras

### Ejecutar migraciones en producción

```bash
cd /home/vexko/vexko-app/app/backend

# 1. Backup primera
cp prisma/prod.db prisma/prod.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. Generar cliente
npm run db:generate

# 3. Ejecutar migraciones
npm run db:deploy

# 4. Reiniciar backend
pm2 restart vexko-backend

# 5. Verificar logs
pm2 logs vexko-backend
```

---

## 📈 Monitoreo y alertas

### 1. PM2 Plus (Opcional - Pago)

```bash
pm2 link <secret_key> <public_key>
```

### 2. Healthcheck endpoint (Recomendado)

En backend, agregar ruta:

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

Verificar en producción:
```bash
curl https://tu-dominio.com/api/health
```

### 3. Script de verificación diaria

```bash
# nano /home/vexko/check_health.sh
#!/bin/bash

RESPONSE=$(curl -s https://tu-dominio.com/api/health)

if echo "$RESPONSE" | grep -q '"status":"ok"'; then
  echo "[$(date)] ✓ App is healthy"
else
  echo "[$(date)] ✗ App is DOWN!"
  pm2 restart vexko-backend
  # Enviar alerta por email/Discord/Slack
fi
```

Agregar a crontab:
```bash
# Ejecutar cada 5 minutos
*/5 * * * * /home/vexko/check_health.sh >> /home/vexko/health_check.log 2>&1
```

---

## 🚀 Deployment Zero-Downtime

### Actualización sin interruptir servicio

```bash
# En /home/vexko/vexko-app

# 1. Pull cambios
git pull origin main

# 2. Instalar dependencias
cd app/backend
npm install

# 3. Aplicar migraciones (sin downtime si usa transacciones)
npm run db:deploy

# 4. PM2 graceful reload (mantiene conexiones vivas)
pm2 gracefulReload vexko-backend

# 5. Frontend (no interrumpe nada)
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/vexko/
sudo systemctl reload nginx
```

---

## 📝 Logs y debugging

### 1. Configurar PM2 con rotación de logs

```bash
pm2 install pm2-logrotate

# Configurar
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
```

### 2. Logs persistentes

```bash
# Backend
pm2 logs vexko-backend > /home/vexko/logs/backend.log 2>&1 &

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### 3. Sentry para error tracking (Recomendado)

```bash
# Backend
npm install --save @sentry/node

# En index.js, agregar al inicio:
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://tuSentryDSN@sentry.io/project",
  environment: "production",
});
```

---

## 🔐 Backup y recuperación

### Backup automático cada 6 horas

```bash
# nano /home/vexko/backup_prod.sh
#!/bin/bash
BACKUP_DIR="/home/vexko/backups"
DB="/home/vexko/vexko-app/app/backend/prisma/prod.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB $BACKUP_DIR/prod.db.$DATE

# Comprimir
gzip $BACKUP_DIR/prod.db.$DATE

# Mantener solo últimos 14 días
find $BACKUP_DIR -name "prod.db.*" -mtime +14 -delete

# Opcional: Subir a S3/Backblaze
# aws s3 cp $BACKUP_DIR/prod.db.$DATE.gz s3://tu-bucket/backups/
```

Agregar a crontab:
```bash
# Cada 6 horas
0 */6 * * * /home/vexko/backup_prod.sh >> /home/vexko/backup.log 2>&1
```

### Restaurar backup

```bash
cd /home/vexko/vexko-app/app/backend

# Detener aplicación
pm2 stop vexko-backend

# Restaurar BD
gunzip -c /home/vexko/backups/prod.db.20240615_120000.gz > prisma/prod.db

# Reiniciar
pm2 start vexko-backend

# Verificar
pm2 logs vexko-backend
```

---

## 🎯 Checklist semanal

- [ ] Verificar logs de errores (`pm2 logs`)
- [ ] Revisar uso de disco (`df -h`)
- [ ] Verificar uso de memoria (`free -m`)
- [ ] Comprobar SSL válido (`sudo certbot certificates`)
- [ ] Revisar backups recientes (`ls -la /home/vexko/backups/`)
- [ ] Probar healthcheck endpoint
- [ ] Verificar CORS funcionando correctamente
- [ ] Revisar últimas migraciones ejecutadas

---

## 🆘 Emergencias

### App crasheó

```bash
# 1. Ver estado
pm2 status

# 2. Ver logs
pm2 logs vexko-backend --lines 100

# 3. Reiniciar
pm2 restart vexko-backend

# 4. Si no funciona, restaurar backup
# (ver sección de Backup)
```

### Disco lleno

```bash
# Ver uso
df -h

# Limpiar logs antiguos
pm2 install pm2-logrotate

# Limpiar cache apt
sudo apt clean
sudo apt autoclean

# Ver qué ocupa espacio
sudo du -sh /home/vexko/*
```

### Base de datos corrupta

```bash
# Restaurar backup más reciente
cd /home/vexko/vexko-app/app/backend
pm2 stop vexko-backend
gunzip -c /home/vexko/backups/prod.db.LATEST.gz > prisma/prod.db
npm run db:generate
pm2 restart vexko-backend
```

---

## 📞 Contactos útiles

- **Hostinger Support:** [hpanel.hostinger.com](https://hpanel.hostinger.com)
- **Let's Encrypt Issues:** Revisar logs de certbot
- **Node.js Docs:** [nodejs.org/docs](https://nodejs.org/docs)
- **Prisma Docs:** [prisma.io/docs](https://prisma.io/docs)
