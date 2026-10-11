#!/usr/bin/env bash
# Instala o actualiza n8n (Docker) en n8n.orozcoimport.es
# Uso (root): curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/<commit>/server/install-n8n.sh | bash
set -euo pipefail
DOMAIN="n8n.orozcoimport.es"
DIR=/opt/n8n
DATA=/var/lib/n8n

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    ERROR: %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Ejecuta como root."
export DEBIAN_FRONTEND=noninteractive

log "1/4 Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -q
  apt-get -y -q install docker.io docker-compose-v2 >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1
ok "$(docker --version | cut -d, -f1)"

log "2/4 Configuración"
mkdir -p "$DIR" "$DATA"
chown -R 1000:1000 "$DATA"   # usuario 'node' dentro del contenedor
if [ ! -f "$DIR/.env" ]; then
  KEY="$(head -c 4096 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-40)"
  printf 'N8N_ENCRYPTION_KEY=%s\n' "$KEY" > "$DIR/.env"
  chmod 600 "$DIR/.env"
fi
cat > "$DIR/compose.yml" <<EOF
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:stable
    restart: unless-stopped
    ports:
      - "127.0.0.1:5678:5678"
    env_file: .env
    environment:
      - N8N_HOST=$DOMAIN
      - N8N_PROTOCOL=https
      - N8N_PORT=5678
      - WEBHOOK_URL=https://$DOMAIN/
      - N8N_EDITOR_BASE_URL=https://$DOMAIN/
      - N8N_PROXY_HOPS=1
      - GENERIC_TIMEZONE=Europe/Madrid
      - TZ=Europe/Madrid
      - N8N_DIAGNOSTICS_ENABLED=false
      - N8N_PERSONALIZATION_ENABLED=false
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_RUNNERS_ENABLED=true
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=336
      - EXECUTIONS_DATA_PRUNE_MAX_COUNT=5000
    volumes:
      - $DATA:/home/node/.n8n
EOF
ok "Datos en $DATA (incluidos en las copias de Hetzner)"

log "3/4 Arrancando n8n (la primera vez descarga la imagen, 1-3 min)"
cd "$DIR"
docker compose pull -q
docker compose up -d
for i in $(seq 1 60); do
  curl -fsS http://127.0.0.1:5678/healthz >/dev/null 2>&1 && break
  sleep 3
done
curl -fsS http://127.0.0.1:5678/healthz >/dev/null 2>&1 || { docker compose logs --tail 30; fail "n8n no responde"; }
ok "n8n $(docker compose exec -T n8n n8n --version 2>/dev/null | tail -1) funcionando"

log "4/4 Publicando $DOMAIN"
oi-site proxy "$DOMAIN" 5678

printf '\n\033[1;32mTODO LISTO.\033[0m Abre https://%s y crea el usuario administrador.\n' "$DOMAIN"
