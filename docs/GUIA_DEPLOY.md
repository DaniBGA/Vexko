# Guía de deploy — Kiosco App en Hostinger KVM2

Esta guía cubre dos cosas separadas:

1. **Setup inicial del servidor** (se hace una sola vez).
2. **Auto-deploy**: cómo queda armado para que un `git push` a `main` actualice sola la producción, usando `deploy.sh` + GitHub Actions.

Los archivos involucrados, todos en la raíz del repo:

| Archivo | Para qué es |
|---|---|
| `deploy.sh` | Script que hace el deploy real: backup de la base, instala dependencias, migra, compila el frontend, reinicia el backend con PM2, recarga Nginx, y verifica que todo haya quedado arriba. |
| `app/backend/ecosystem.config.cjs` | Config de PM2. Corre el backend en modo **cluster con 2 instancias** (aprovecha los 2 vCPU del KVM2 — con 1 sola instancia la mitad del servidor queda ociosa sin importar cuántos kioscos usen la app). |
| `nginx.conf` | Sirve el frontend compilado y hace de proxy hacia el backend en `/api`. |
| `.github/workflows/deploy.yml` | Dispara `deploy.sh` en el VPS por SSH cada vez que hacés push a `main`. |

---

## 0. Antes de arrancar

- Cuenta de Hostinger con el plan **KVM 2** ya contratado y el VPS creado (Ubuntu 22.04 o 24.04).
- Un dominio (o subdominio) apuntando por DNS a la IP del VPS — un registro `A` para `tu-dominio.com` y otro para `www.tu-dominio.com`. Sin esto no vas a poder pedir el certificado SSL.
- Acceso SSH al VPS como `root` (Hostinger te lo da en el panel al crear el servidor).

---

## 1. Setup inicial del servidor (una sola vez)

### 1.1 Conectarse y crear un usuario de deploy (no usar `root` para todo)

```bash
ssh root@<IP_DEL_VPS>

adduser deploy
usermod -aG sudo deploy
su - deploy
```

A partir de acá, todo lo que sigue se corre como el usuario `deploy`, no como `root`. Es más seguro: si algún día se compromete una clave, el daño queda acotado.

### 1.2 Instalar Node, PostgreSQL, Nginx y PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs nginx postgresql postgresql-contrib git
sudo npm install -g pm2
node --version   # debería dar v20.x
```

### 1.3 Crear la base de datos

```bash
sudo -u postgres psql -c "CREATE USER kiosco WITH PASSWORD 'ELEGÍ_UNA_CONTRASEÑA_FUERTE_ACÁ';"
sudo -u postgres psql -c "CREATE DATABASE kiosco_prod OWNER kiosco;"
```

Guardá esa contraseña, la vas a necesitar en el `.env` del paso 1.5.

### 1.4 Clonar el repo

```bash
sudo mkdir -p /var/www/kiosco-app
sudo chown deploy:deploy /var/www/kiosco-app
git clone https://github.com/DaniBGA/Vexko.git /var/www/kiosco-app
cd /var/www/kiosco-app
```

### 1.5 Variables de entorno de producción

```bash
cp app/backend/.env.example app/backend/.env
nano app/backend/.env
```

Completar con valores **reales de producción**, distintos a los de desarrollo:

```
DATABASE_URL="postgresql://kiosco:LA_CONTRASEÑA_DEL_PASO_1.3@localhost:5432/kiosco_prod"
JWT_SECRET="generá uno nuevo — ver comando abajo, NUNCA reutilices el de dev"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=production
FRONTEND_URL="https://tu-dominio.com"
```

Para generar un `JWT_SECRET` fuerte:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
cp app/frontend/.env.example app/frontend/.env
```

El frontend por defecto pega a `/api` (ruta relativa), que es justo lo que necesita al quedar detrás de Nginx en el mismo dominio — normalmente no hace falta tocar nada acá.

### 1.6 Primer deploy manual (build + migraciones + seed)

```bash
cd /var/www/kiosco-app/app/backend
npm ci --omit=dev
npx prisma migrate deploy
npx prisma generate
npx prisma db seed        # SOLO la primera vez, carga datos de ejemplo — salteá esto si no lo querés

cd /var/www/kiosco-app/app/frontend
npm ci
npm run build
```

### 1.7 Levantar el backend con PM2 por primera vez

```bash
cd /var/www/kiosco-app/app/backend
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup                 # imprime un comando — copialo y correlo (necesita sudo)
```

`pm2 startup` es lo que hace que PM2 vuelva a levantar la app sola si el VPS se reinicia.

### 1.8 Nginx

```bash
sudo cp /var/www/kiosco-app/nginx.conf /etc/nginx/sites-available/kiosco
sudo nano /etc/nginx/sites-available/kiosco   # reemplazar "tu-dominio.com" por tu dominio real
sudo ln -s /etc/nginx/sites-available/kiosco /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default    # saca el site "Welcome to nginx" de default
sudo nginx -t && sudo systemctl reload nginx
```

En este punto, entrando a `http://tu-dominio.com` ya debería verse la app (sin SSL todavía).

### 1.9 SSL con Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Certbot edita `nginx.conf` solo para agregar el bloque de HTTPS y configura la renovación automática — no hace falta tocar nada más.

### 1.10 Permiso para que el deploy recargue Nginx sin pedir contraseña

`deploy.sh` corre `sudo nginx -t` y `sudo systemctl reload nginx` — como el auto-deploy corre sin que nadie esté mirando una terminal, el usuario `deploy` necesita poder hacer *eso puntualmente* sin que le pida contraseña (nunca des sudo sin contraseña para *todo*, solo para estos dos comandos):

```bash
sudo visudo -f /etc/sudoers.d/kiosco-deploy
```

Contenido:

```
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
```

Guardar y salir. Verificar que no rompiste el archivo de sudoers:

```bash
sudo visudo -c
```

---

## 2. Auto-deploy: que un `git push` actualice la producción sola

### 2.1 Generar una clave SSH dedicada para el deploy

**Desde tu máquina local** (no en el VPS):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kiosco_deploy -N ""
```

Esto crea `~/.ssh/kiosco_deploy` (privada) y `~/.ssh/kiosco_deploy.pub` (pública).

### 2.2 Autorizar esa clave en el VPS

```bash
cat ~/.ssh/kiosco_deploy.pub | ssh deploy@<IP_DEL_VPS> "cat >> ~/.ssh/authorized_keys"
```

### 2.3 Cargar los secrets en GitHub

En GitHub: **el repo → Settings → Secrets and variables → Actions → New repository secret**. Crear estos 4:

| Nombre | Valor |
|---|---|
| `VPS_HOST` | La IP (o dominio) del VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | El contenido completo de `~/.ssh/kiosco_deploy` (la privada, `cat ~/.ssh/kiosco_deploy`) |
| `VPS_PORT` | `22` (o el puerto SSH que uses, si lo cambiaste) |

**Nunca subas la clave privada al repo.** Solo va como secret de GitHub.

### 2.4 Listo — probar

```bash
git add .
git commit -m "deploy: setup inicial de auto-deploy"
git push origin main
```

En GitHub, pestaña **Actions**, vas a ver correr el workflow "Deploy a producción". Si algo falla, el log completo queda ahí — incluye toda la salida de `deploy.sh` (backup, migraciones, build, PM2, health check).

De acá en adelante: **cada push a `main` deploya solo.** Si alguna vez necesitás re-deployar sin un commit nuevo (por ejemplo después de cambiar algo a mano en el servidor), lo disparás manual desde la pestaña Actions → "Run workflow".

---

## 3. Día a día

### Deploys normales
No hacés nada especial — `git push origin main` y el resto es automático.

### Deploy manual (sin pasar por GitHub Actions)
Si estás conectado por SSH y querés forzar un deploy ahí mismo:

```bash
ssh deploy@<IP_DEL_VPS>
cd /var/www/kiosco-app
./deploy.sh
```

### Monitoreo básico

```bash
pm2 status                  # ver si las 2 instancias están "online"
pm2 logs kiosco-api         # logs en vivo (Ctrl+C para salir)
pm2 monit                   # CPU/memoria en vivo
```

### Backups
`deploy.sh` hace un backup de la base **antes de cada deploy** (antes de migrar), en `/var/backups/kiosco-app/`, y se queda solo con los últimos 14. Si querés backups regulares aunque no deployes seguido, agregá un cron aparte:

```bash
crontab -e
# todos los días a las 3am
0 3 * * * pg_dump "$(grep DATABASE_URL /var/www/kiosco-app/app/backend/.env | cut -d= -f2- | tr -d '\"')" | gzip > /var/backups/kiosco-app/diario_$(date +\%Y\%m\%d).sql.gz
```

### Rollback (si un deploy rompió algo)

1. **Volver el código atrás:**
   ```bash
   cd /var/www/kiosco-app
   git log --oneline -5        # ubicar el commit bueno anterior
   git checkout <hash_del_commit_bueno>
   SKIP_GIT_PULL=1 ./deploy.sh
   git checkout main           # importante: volver a main para no quedar en "detached HEAD"
   ```
2. **Si además la migración rompió datos**, restaurar el backup de antes del deploy problemático:
   ```bash
   gunzip -c /var/backups/kiosco-app/kiosco_<fecha>.sql.gz | psql "$DATABASE_URL"
   ```
   (Esto sobreescribe la base actual — asegurate de que sea el backup correcto antes de correrlo.)

---

## 4. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El workflow de GitHub Actions falla en el paso SSH | Secret mal cargado, o la clave pública no está en `authorized_keys` del VPS | Revisar los 4 secrets, repetir 2.2 |
| `deploy.sh` falla en "Backend: instalando dependencias" | `package-lock.json` desactualizado respecto a `package.json` | Correr `npm install` (no `ci`) una vez a mano, commitear el lock actualizado |
| `deploy.sh` falla en el health check final | El backend no pudo levantar — revisar `pm2 logs kiosco-api` | Suele ser `.env` mal configurado o una migración que falló a mitad de camino |
| `nginx -t` falla | Error de sintaxis en `nginx.conf`, o el dominio no coincide | `sudo nginx -t` muestra la línea exacta del error |
| La app carga pero pide login en loop / CORS error | `FRONTEND_URL` en `app/backend/.env` no coincide con el dominio real | Corregir y `pm2 reload ecosystem.config.cjs --env production` |
| Puerto 3001 ocupado al levantar PM2 | Quedó un proceso viejo corriendo | `pm2 delete kiosco-api` y volver a `pm2 start` |
