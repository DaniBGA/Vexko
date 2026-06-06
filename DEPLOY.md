# Guía de Deploy en Hostinger - Plan KVN2

## 📋 Tabla de contenidos

1. [Preparación local](#preparación-local)
2. [Configuración en Hostinger KVN2](#configuración-en-hostinger-kvn2)
3. [Setup inicial del servidor](#setup-inicial-del-servidor)
4. [Deploy de la aplicación](#deploy-de-la-aplicación)
5. [Troubleshooting](#troubleshooting)

---

## 1. Preparación local

### 1.1 Merge de `desarrollo` a `main`

```bash
# Asegúrate de que no hay cambios sin guardar
git status

# Checkout a main
git checkout main

# Trae los cambios más recientes
git pull origin main

# Merge desarrollo a main
git merge desarrollo

# Push a main
git push origin main
```

### 1.2 Verificar `.gitignore`

Asegúrate de que `.gitignore` en la raíz contiene:
```
.env
.env.local
.env.production
node_modules/
app/*/node_modules/
prisma/dev.db*
app/frontend/dist/
app/backend/dist/
```

### 1.3 Variables de entorno para producción

**Crear `.env.production.local` (NO subir a git):**
```env
# Backend
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/prod.db
JWT_SECRET=tu_jwt_secreto_largo_y_seguro_aqui
CORS_ORIGIN=https://vexko.net

# Frontend (en app/frontend/.env.production.local)
VITE_API_URL=https://api.vexko.net
```

---

## 2. Configuración en Hostinger KVN2

### 2.1 Acceder al panel KVN2

1. Ingresa a [Hostinger hPanel](https://hpanel.hostinger.com)
2. Selecciona tu VPS KVN2
3. Abre la terminal/SSH

### 2.2 Crear usuario no-root (recomendado)

```bash
# Como root, crear usuario
adduser vexko
# Añadir al grupo sudo (Debian/Ubuntu)
adduser vexko sudo
# Alternativa equivalente:
# usermod -aG sudo vexko
su - vexko

# Configurar clave SSH (opcional pero recomendado)
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Copiar tu clave pública en ~/.ssh/authorized_keys
```

### 2.3 Actualizar el sistema

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

---

## 3. Setup inicial del servidor

### 3.1 Instalar dependencias del sistema

```bash
# Node.js (versión LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Git
sudo apt install -y git

# Nginx (reverse proxy)
sudo apt install -y nginx

# PM2 (gestor de procesos)
sudo npm install -g pm2

# Certbot para HTTPS (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
```

### 3.2 Clonar repositorio

```bash
cd /home/vexko
git clone https://github.com/tu-usuario/tu-repo.git vexko-app
cd vexko-app

# Checkout a main
git checkout main
```

### 3.3 Instalar dependencias de la app

```bash
# Backend
cd app/backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3.4 Build del frontend

```bash
cd app/frontend
npm run build
```

---

## 4. Deploy de la aplicación

### 4.1 Configurar variables de entorno en servidor

```bash
# Backend
cd /home/vexko/vexko-app/app/backend

# Crear .env (directamente en el servidor)
sudo nano .env
```

**Contenido de `.env` para producción:**
```env
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/prod.db
JWT_SECRET=qwertyuiopasdfghjklzxcvbnm123456
CORS_ORIGIN=https://vexko.net,https://www.vexko.net
```

Ctrl+O, Enter, Ctrl+X para guardar.

### 4.2 Inicializar base de datos

```bash
cd /home/vexko/vexko-app/app/backend

# Generar cliente de Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:deploy

# (Opcional) Ejecutar seed
npm run db:seed
npm run db:seed:catalog
```

### 4.3 Servir frontend con Nginx

```bash
# Copiar archivos de build a directorio de Nginx
sudo mkdir -p /var/www/vexko
sudo cp -r /home/vexko/vexko-app/app/frontend/dist/* /var/www/vexko/
sudo chown -R www-data:www-data /var/www/vexko
```

### 4.4 Configurar Nginx como reverse proxy

```bash
# Crear configuración
sudo nano /etc/nginx/sites-available/vexko
```

**Contenido:**
```nginx
server {
    listen 80;
    server_name vexko.net www.vexko.net;

    # Redirigir HTTP a HTTPS (después de certificado)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vexco.net www.vexko.net;

    # Certificados SSL (se configuran con certbot)
    ssl_certificate /etc/letsencrypt/live/vexko.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vexko.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        root /var/www/vexko;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
    gzip_min_length 1000;
}
```

Guardar: Ctrl+O, Enter, Ctrl+X

```bash
# Habilitar configuración
sudo ln -s /etc/nginx/sites-available/vexko /etc/nginx/sites-enabled/

# Remover sitio por defecto si existe
sudo rm /etc/nginx/sites-enabled/default

# Probar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 4.5 Configurar SSL con Let's Encrypt

```bash
sudo certbot certonly --nginx -d tu-dominio.com -d www.vexco.net

# Seguir las instrucciones del asistente
# (Ingresa tu email, acepta términos, etc)

# Recargar Nginx
sudo systemctl reload nginx
```

### 4.6 Configurar PM2 para el backend

```bash
cd /home/vexko/vexko-app/app/backend

# Iniciar con PM2
pm2 start index.js --name "vexko-backend" --env production

# Hacer que inicie al encender
pm2 startup
sudo pm2 startup

# Guardar estado actual
pm2 save
```

---

## 5. Actualización futura (después de cambios en `main`)

### 5.1 Pull de nuevos cambios

```bash
cd /home/vexko/vexko-app
git pull origin main

# Si hay cambios en backend
cd app/backend
npm install
npm run db:deploy  # Ejecutar migraciones si existen
pm2 restart vexko-backend

# Si hay cambios en frontend
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/vexko/
sudo systemctl reload nginx
```

---

## 6. Monitoreo

### 6.1 Ver logs del backend

```bash
pm2 logs vexko-backend

# O logs específicos
pm2 logs vexko-backend --lines 50
```

### 6.2 Ver estado de procesos

```bash
pm2 status
pm2 monit
```

### 6.3 Revisar logs de Nginx

```bash
# Acceso
sudo tail -f /var/log/nginx/access.log

# Errores
sudo tail -f /var/log/nginx/error.log
```

### 6.4 Configurar auto-renew de SSL

```bash
# Probar renovación
sudo certbot renew --dry-run

# El auto-renew se habilita por defecto con certbot
```

---

## 7. Troubleshooting

### Error: Puerto 3001 en uso

```bash
# Encontrar proceso usando el puerto
sudo lsof -i :3001

# Matar proceso
sudo kill -9 <PID>
```

### Error: Base de datos no existe

```bash
cd app/backend
npm run db:generate
npm run db:deploy
```

### Error: CORS bloqueando

Asegúrate que `CORS_ORIGIN` en `.env` contiene tu dominio:
```env
CORS_ORIGIN=https://tu-dominio.com,https://www.tu-dominio.com
```

Y recarga el backend:
```bash
pm2 restart vexko-backend
```

### Error: SSL no funciona

```bash
# Verificar certificado
sudo certbot certificates

# Renovar manualmente si es necesario
sudo certbot renew --force-renewal

# Recargar Nginx
sudo systemctl reload nginx
```

### Performance lento

```bash
# Aumentar límite de archivos abiertos
ulimit -n 65536

# Ver stats de PM2
pm2 monit

# Aumentar cluster si es necesario
pm2 start index.js -i max --name "vexko-backend"  # Modo cluster
```

---

## 8. Checklist de Deploy

- [ ] `.gitignore` actualizado sin incluir `.env`
- [ ] `main` branch sincronizado con `desarrollo`
- [ ] `.env` creado en servidor (NO en git)
- [ ] Base de datos migrada y seeded
- [ ] Frontend buildeado
- [ ] Nginx configurado
- [ ] SSL certificado instalado
- [ ] PM2 iniciado para backend
- [ ] DNS apuntando a la IP del servidor
- [ ] Tests en producción completados
- [ ] Backup de base de datos configurado

---

## 9. Backup automático (Opcional)

```bash
# Crear script de backup
sudo nano /home/vexko/backup.sh
```

**Contenido:**
```bash
#!/bin/bash
BACKUP_DIR="/home/vexko/backups"
DB_PATH="/home/vexko/vexko-app/app/backend/prisma/prod.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH $BACKUP_DIR/prod.db.$DATE

# Mantener solo últimos 7 días
find $BACKUP_DIR -name "prod.db.*" -mtime +7 -delete
```

```bash
# Hacer ejecutable
sudo chmod +x /home/vexko/backup.sh

# Agregar a crontab (ejecutar diariamente a las 3 AM)
sudo crontab -e
# Agregar línea: 0 3 * * * /home/vexko/backup.sh
```

---

## 10. Mejoras posteriores

- Configurar CDN (CloudFlare gratis)
- Implementar rate limiting en Nginx
- Configurar monitoreo (Sentry, DataDog, etc)
- Automated backups a cloud storage (AWS S3, Backblaze, etc)
- CI/CD pipeline (GitHub Actions, GitLab CI, etc)
- Increase security (fail2ban, UFW firewall, etc)

---

## Soporte

Si encuentras problemas durante el deploy:

1. Revisar logs (`pm2 logs`, `/var/log/nginx/error.log`)
2. Verificar conectividad SSH
3. Confirmar ports abiertos (`sudo ufw status`)
4. Revisar permisos de archivos

¡Éxito en el deploy! 🚀# Guía de Deploy en Hostinger - Plan KVN2

## 📋 Tabla de contenidos

1. [Preparación local](#preparación-local)
2. [Configuración en Hostinger KVN2](#configuración-en-hostinger-kvn2)
3. [Setup inicial del servidor](#setup-inicial-del-servidor)
4. [Deploy de la aplicación](#deploy-de-la-aplicación)
5. [Troubleshooting](#troubleshooting)

---

## 1. Preparación local

### 1.1 Merge de `desarrollo` a `main`

```bash
# Asegúrate de que no hay cambios sin guardar
git status

# Checkout a main
git checkout main

# Trae los cambios más recientes
git pull origin main

# Merge desarrollo a main
git merge desarrollo

# Push a main
git push origin main
```

### 1.2 Verificar `.gitignore`

Asegúrate de que `.gitignore` en la raíz contiene:
```
.env
.env.local
.env.production
node_modules/
app/*/node_modules/
prisma/dev.db*
app/frontend/dist/
app/backend/dist/
```

### 1.3 Variables de entorno para producción

**Crear `.env.production.local` (NO subir a git):**
```env
# Backend
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/prod.db
JWT_SECRET=tu_jwt_secreto_largo_y_seguro_aqui
CORS_ORIGIN=https://tu-dominio.com

# Frontend (en app/frontend/.env.production.local)
VITE_API_URL=https://api.tu-dominio.com
```

---

## 2. Configuración en Hostinger KVN2

### 2.1 Acceder al panel KVN2

1. Ingresa a [Hostinger hPanel](https://hpanel.hostinger.com)
2. Selecciona tu VPS KVN2
3. Abre la terminal/SSH

### 2.2 Crear usuario no-root (recomendado)

```bash
# Como root, crear usuario
adduser vexko
addgroup vexko sudo
su - vexko

# Configurar clave SSH (opcional pero recomendado)
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Copiar tu clave pública en ~/.ssh/authorized_keys
```

### 2.3 Actualizar el sistema

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

---

## 3. Setup inicial del servidor

### 3.1 Instalar dependencias del sistema

```bash
# Node.js (versión LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Git
sudo apt install -y git

# Nginx (reverse proxy)
sudo apt install -y nginx

# PM2 (gestor de procesos)
sudo npm install -g pm2

# Certbot para HTTPS (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
```

### 3.2 Clonar repositorio

```bash
cd /home/vexko
git clone https://github.com/tu-usuario/tu-repo.git vexko-app
cd vexko-app

# Checkout a main
git checkout main
```

### 3.3 Instalar dependencias de la app

```bash
# Backend
cd app/backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3.4 Build del frontend

```bash
cd app/frontend
npm run build
```

---

## 4. Deploy de la aplicación

### 4.1 Configurar variables de entorno en servidor

```bash
# Backend
cd /home/vexko/vexko-app/app/backend

# Crear .env (directamente en el servidor)
sudo nano .env
```

**Contenido de `.env` para producción:**
```env
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/prod.db
JWT_SECRET=tu_jwt_secreto_muy_largo_y_seguro_12345
CORS_ORIGIN=https://tu-dominio.com,https://www.tu-dominio.com
```

Ctrl+O, Enter, Ctrl+X para guardar.

### 4.2 Inicializar base de datos

```bash
cd /home/vexko/vexko-app/app/backend

# Generar cliente de Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:deploy

# (Opcional) Ejecutar seed
npm run db:seed
npm run db:seed:catalog
```

### 4.3 Servir frontend con Nginx

```bash
# Copiar archivos de build a directorio de Nginx
sudo mkdir -p /var/www/vexko
sudo cp -r /home/vexko/vexko-app/app/frontend/dist/* /var/www/vexko/
sudo chown -R www-data:www-data /var/www/vexko
```

### 4.4 Configurar Nginx como reverse proxy

```bash
# Crear configuración
sudo nano /etc/nginx/sites-available/vexko
```

**Contenido:**
```nginx
server {
    listen 80;
    server_name vexko.net www.vexko.net;

    # Redirigir HTTP a HTTPS (después de certificado)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vexko.net www.vexko.net;

    # Certificados SSL (se configuran con certbot)
    ssl_certificate /etc/letsencrypt/live/vexko.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vexko.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        root /var/www/vexko;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://2.25.177.76:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
    gzip_min_length 1000;
}
```

Guardar: Ctrl+O, Enter, Ctrl+X

```bash
# Habilitar configuración
sudo ln -s /etc/nginx/sites-available/vexko /etc/nginx/sites-enabled/

# Remover sitio por defecto si existe
sudo rm /etc/nginx/sites-enabled/default

# Probar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 4.5 Configurar SSL con Let's Encrypt

```bash
sudo certbot certonly --nginx -d tu-dominio.com -d www.tu-dominio.com

# Seguir las instrucciones del asistente
# (Ingresa tu email, acepta términos, etc)

# Recargar Nginx
sudo systemctl reload nginx
```

### 4.6 Configurar PM2 para el backend

```bash
cd /home/vexko/vexko-app/app/backend

# Iniciar con PM2
pm2 start index.js --name "vexko-backend" --env production

# Hacer que inicie al encender
pm2 startup
sudo pm2 startup

# Guardar estado actual
pm2 save
```

---

## 5. Actualización futura (después de cambios en `main`)

### 5.1 Pull de nuevos cambios

```bash
cd /home/vexko/vexko-app
git pull origin main

# Si hay cambios en backend
cd app/backend
npm install
npm run db:deploy  # Ejecutar migraciones si existen
pm2 restart vexko-backend

# Si hay cambios en frontend
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/vexko/
sudo systemctl reload nginx
```

---

## 6. Monitoreo

### 6.1 Ver logs del backend

```bash
pm2 logs vexko-backend

# O logs específicos
pm2 logs vexko-backend --lines 50
```

### 6.2 Ver estado de procesos

```bash
pm2 status
pm2 monit
```

### 6.3 Revisar logs de Nginx

```bash
# Acceso
sudo tail -f /var/log/nginx/access.log

# Errores
sudo tail -f /var/log/nginx/error.log
```

### 6.4 Configurar auto-renew de SSL

```bash
# Probar renovación
sudo systemctl stop nginx
sudo certbot renew --dry-run
sudo systemctl start nginx

# El auto-renew se habilita por defecto con certbot
```

---

## 7. Troubleshooting

### Error: Puerto 3001 en uso

```bash
# Encontrar proceso usando el puerto
sudo lsof -i :3001

# Matar proceso
sudo kill -9 <PID>
```

### Error: Base de datos no existe

```bash
cd app/backend
npm run db:generate
npm run db:deploy
```

### Error: CORS bloqueando

Asegúrate que `CORS_ORIGIN` en `.env` contiene tu dominio:
```env
CORS_ORIGIN=https://tu-dominio.com,https://www.tu-dominio.com
```

Y recarga el backend:
```bash
pm2 restart vexko-backend
```

### Error: SSL no funciona

```bash
# Verificar certificado
sudo certbot certificates

# Renovar manualmente si es necesario
sudo certbot renew --force-renewal

# Recargar Nginx
sudo systemctl reload nginx
```

### Performance lento

```bash
# Aumentar límite de archivos abiertos
ulimit -n 65536

# Ver stats de PM2
pm2 monit

# Aumentar cluster si es necesario
pm2 start index.js -i max --name "vexko-backend"  # Modo cluster
```

---

## 8. Checklist de Deploy

- [ ] `.gitignore` actualizado sin incluir `.env`
- [ ] `main` branch sincronizado con `desarrollo`
- [ ] `.env` creado en servidor (NO en git)
- [ ] Base de datos migrada y seeded
- [ ] Frontend buildeado
- [ ] Nginx configurado
- [ ] SSL certificado instalado
- [ ] PM2 iniciado para backend
- [ ] DNS apuntando a la IP del servidor
- [ ] Tests en producción completados
- [ ] Backup de base de datos configurado

---

## 9. Backup automático (Opcional)

```bash
# Crear script de backup
sudo nano /home/vexko/backup.sh
```

**Contenido:**
```bash
#!/bin/bash
BACKUP_DIR="/home/vexko/backups"
DB_PATH="/home/vexko/vexko-app/app/backend/prisma/prod.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH $BACKUP_DIR/prod.db.$DATE

# Mantener solo últimos 7 días
find $BACKUP_DIR -name "prod.db.*" -mtime +7 -delete
```

```bash
# Hacer ejecutable
sudo chmod +x /home/vexko/backup.sh

# Agregar a crontab (ejecutar diariamente a las 3 AM)
sudo crontab -e
# Agregar línea: 0 3 * * * /home/vexko/backup.sh
```

---

## 10. Mejoras posteriores

- Configurar CDN (CloudFlare gratis)
- Implementar rate limiting en Nginx
- Configurar monitoreo (Sentry, DataDog, etc)
- Automated backups a cloud storage (AWS S3, Backblaze, etc)
- CI/CD pipeline (GitHub Actions, GitLab CI, etc)
- Increase security (fail2ban, UFW firewall, etc)

---

## Soporte

Si encuentras problemas durante el deploy:

1. Revisar logs (`pm2 logs`, `/var/log/nginx/error.log`)
2. Verificar conectividad SSH
3. Confirmar ports abiertos (`sudo ufw status`)
4. Revisar permisos de archivos

¡Éxito en el deploy! 🚀