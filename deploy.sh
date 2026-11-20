#!/usr/bin/env bash
# deploy.sh — Deploy de Kiosco App en el VPS de producción (Hostinger KVM2).
#
# Se puede correr:
#   - A mano, ya logueado en el VPS:           ./deploy.sh
#   - Disparado automáticamente por GitHub Actions al hacer push a main
#     (ver .github/workflows/deploy.yml y docs/GUIA_DEPLOY.md).
#
# Precauciones que toma:
#   - set -euo pipefail: corta ante el primer error, nunca deja el server
#     en un estado a medio actualizar sin que se note.
#   - Backup de la base de datos ANTES de aplicar migraciones.
#   - Health check al final: si el backend no responde después de reiniciar,
#     el script termina con error (revisá `pm2 logs kiosco-api`).
#   - No hace nada destructivo: nunca borra datos, solo agrega backups.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kiosco-app}"
BACKEND_DIR="$APP_DIR/app/backend"
FRONTEND_DIR="$APP_DIR/app/frontend"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/kiosco-app}"
LOG_FILE="${LOG_FILE:-/var/log/kiosco-deploy.log}"
HEALTH_URL="http://127.0.0.1:3001/api/health"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$(dirname "$LOG_FILE")"
log "=== Iniciando deploy ==="

[ -d "$APP_DIR" ] || fail "No existe $APP_DIR. Revisá docs/GUIA_DEPLOY.md, paso de setup inicial."
cd "$APP_DIR"

# Si lo dispara GitHub Actions, el código ya se actualizó antes de llamar a
# este script (con rsync/scp). Corriendo a mano, actualiza con git pull.
if [ "${SKIP_GIT_PULL:-0}" != "1" ]; then
  log "Actualizando código (git pull origin main)..."
  git pull origin main
fi

[ -f "$BACKEND_DIR/.env" ] || fail "Falta $BACKEND_DIR/.env — copialo de .env.example y completá los valores reales antes de desplegar."

# ── Node con parches de seguridad, antes de tocar nada ─────────────────────
# Node 20 (lo que instalaba la guía) está fuera de soporte desde abr-2026 y no
# recibió los parches del security release del 21-oct-2026 (Brotli RCE, TLS, DNS).
log "Verificando la versión de Node ($(node -v 2>/dev/null || echo 'no instalado'))..."
node "$BACKEND_DIR/scripts/check-node.js" \
  || fail "Node sin parches de seguridad. Actualizalo antes de deployar: docs/GUIA_DEPLOY.md, sección 'Actualizar Node en el VPS'."

# ── Backup de la base ANTES de tocar nada ───────────────────────────────────
log "Backup de la base de datos..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/kiosco_$(date +%Y%m%d_%H%M%S).sql.gz"
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | cut -d '=' -f2- | tr -d '"')
[ -n "$DATABASE_URL" ] || fail "No se pudo leer DATABASE_URL de $BACKEND_DIR/.env"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
log "Backup guardado en $BACKUP_FILE"
# Se guardan los últimos 14 backups (uno por deploy, no debería acumular
# más que eso en un uso normal) y se borran los más viejos.
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

# ── Backend ──────────────────────────────────────────────────────────────────
log "Backend: instalando dependencias..."
cd "$BACKEND_DIR"
npm ci --omit=dev

log "Backend: aplicando migraciones..."
npx prisma migrate deploy

log "Backend: generando Prisma Client..."
npx prisma generate

# ── Frontend ─────────────────────────────────────────────────────────────────
log "Frontend: instalando dependencias..."
cd "$FRONTEND_DIR"
npm ci

log "Frontend: compilando build de producción..."
npm run build

# ── Reiniciar backend con PM2 (cluster, sin downtime) ───────────────────────
log "Reiniciando backend con PM2..."
cd "$BACKEND_DIR"
if pm2 describe kiosco-api > /dev/null 2>&1; then
  # --update-env: sin esto PM2 sigue con las variables de la primera vez que se
  # levantó (por ejemplo, no toma HOST=127.0.0.1 agregado después).
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

# ── Nginx (solo recarga si la config es válida) ─────────────────────────────
if command -v nginx > /dev/null 2>&1; then
  log "Verificando y recargando Nginx..."
  sudo nginx -t
  sudo systemctl reload nginx
fi

# ── Health check ─────────────────────────────────────────────────────────────
log "Esperando a que el backend responda..."
for i in $(seq 1 10); do
  if curl -sf "$HEALTH_URL" > /dev/null; then
    log "Backend respondió OK."
    log "=== Deploy completado con éxito ==="
    exit 0
  fi
  sleep 2
done

fail "El backend no respondió en $HEALTH_URL después del deploy. Revisá 'pm2 logs kiosco-api'. El backup de antes de migrar está en $BACKUP_FILE por si hay que volver atrás (ver docs/GUIA_DEPLOY.md, sección Rollback)."
