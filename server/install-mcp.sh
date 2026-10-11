#!/usr/bin/env bash
# Instala o actualiza el conector MCP de archivos en mcp.orozcoimport.es
# Uso (root): curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/<commit>/server/install-mcp.sh | bash
set -euo pipefail
REPO="orozcoimport66-boop/orozco-infra"
REF="${REF:-main}"
DOMAIN="mcp.orozcoimport.es"
APP=/opt/orozco-mcp
DATA=/var/lib/orozco-mcp

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    ERROR: %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Ejecuta como root."
export DEBIAN_FRONTEND=noninteractive

log "1/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get -y -q install nodejs >/dev/null
fi
ok "Node $(node -v)"

log "2/6 Usuario sin privilegios 'mcp'"
id mcp >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin mcp
mkdir -p "$DATA" /srv/sites
chown -R mcp:mcp "$DATA" /srv/sites
chmod 750 "$DATA"
ok "mcp puede escribir solo en /srv/sites y en $DATA"

log "3/6 Descargando el conector ($REF)"
TMP="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar xz -C "$TMP"
SRC="$(find "$TMP" -maxdepth 2 -type d -name mcp | head -1)"
[ -f "$SRC/server.js" ] || fail "No encuentro mcp/server.js en el repositorio"
mkdir -p "$APP"
cp "$SRC/server.js" "$SRC/package.json" "$SRC/package-lock.json" "$APP/"
cp "$SRC/orozco-mcp.service" /etc/systemd/system/orozco-mcp.service
SITE_TOOL="$(find "$TMP" -maxdepth 3 -path '*/server/oi-site' | head -1)"
[ -n "$SITE_TOOL" ] && install -m 755 "$SITE_TOOL" /usr/local/bin/oi-site
rm -rf "$TMP"
( cd "$APP" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
chown -R root:root "$APP"
ok "Código en $APP"

log "4/6 Código de instalación de un solo uso"
if [ ! -f "$DATA/state.json" ] || ! grep -q '"hash"' "$DATA/state.json"; then
  if [ ! -f "$DATA/setup-code" ]; then
    head -c 4096 /dev/urandom | LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyz' | cut -c1-8 > "$DATA/setup-code"
  fi
  chown mcp:mcp "$DATA/setup-code"; chmod 600 "$DATA/setup-code"
  SETUP="$(cat "$DATA/setup-code")"
else
  SETUP=""
fi

log "5/6 Servicio"
systemctl daemon-reload
systemctl enable orozco-mcp >/dev/null 2>&1
systemctl restart orozco-mcp
sleep 2
curl -fsS http://127.0.0.1:8787/salud >/dev/null || { journalctl -u orozco-mcp -n 20 --no-pager; fail "El servicio no responde"; }
ok "orozco-mcp funcionando"

log "6/6 Publicando $DOMAIN"
oi-site proxy "$DOMAIN" 8787

printf '\n\033[1;32mTODO LISTO.\033[0m Conector en https://%s/mcp\n' "$DOMAIN"
if [ -n "$SETUP" ]; then
  printf '\nCODIGO DE INSTALACION (apuntalo, se usa una vez):\n\n      \033[1;33m%s\033[0m\n\n' "$SETUP"
else
  printf 'La contraseña ya estaba creada; no hace falta código.\n'
fi
