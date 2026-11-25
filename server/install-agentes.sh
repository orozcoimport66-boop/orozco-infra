#!/usr/bin/env bash
# Instala o actualiza el motor de agentes (Claude) en el servidor.
# Uso (root): curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/<commit>/server/install-agentes.sh | bash -s <commit>
# La primera vez pide dos claves (no se ven al escribirlas) y las guarda en /etc/orozco-agentes/env (solo root y el servicio).
set -euo pipefail
REPO="orozcoimport66-boop/orozco-infra"
REF="${1:-${REF:-main}}"
APP=/opt/orozco-agentes
DATA=/var/lib/orozco-agentes
CONF=/etc/orozco-agentes
SUPABASE_URL="https://lhtequkigdilfldnugco.supabase.co"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    ERROR: %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Ejecuta como root."
export DEBIAN_FRONTEND=noninteractive

log "1/6 Node.js"
command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || fail "Falta Node 20 o superior (lo instala install-mcp.sh)"
ok "Node $(node -v)"

log "2/6 Usuario sin privilegios 'agentes'"
id agentes >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin agentes
mkdir -p "$DATA/trabajo" "$CONF"
chown -R agentes:agentes "$DATA"; chmod 750 "$DATA"
ok "agentes solo puede escribir en $DATA"

log "3/6 Claves"
if [ ! -f "$CONF/env" ]; then
  [ -r /dev/tty ] || fail "Ejecuta el script desde una terminal para poder escribir las claves"
  printf '    Pega la clave de la API de Anthropic (motor-agentes-orozco) y pulsa Enter: '
  read -rs ANTH </dev/tty; echo
  printf '    Pega la clave secreta de Supabase (service_role o sb_secret_...) y pulsa Enter: '
  read -rs SUPK </dev/tty; echo
  case "$ANTH" in sk-ant-*) ;; *) fail "La clave de Anthropic no empieza por sk-ant-" ;; esac
  [ "${#SUPK}" -gt 40 ] || fail "La clave de Supabase parece incompleta"
  umask 077
  printf 'ANTHROPIC_API_KEY=%s\nSUPABASE_URL=%s\nSUPABASE_SERVICE_KEY=%s\n' "$ANTH" "$SUPABASE_URL" "$SUPK" > "$CONF/env"
  unset ANTH SUPK
fi
chown root:agentes "$CONF/env"; chmod 640 "$CONF/env"; chmod 750 "$CONF"; chown root:agentes "$CONF"
ok "Claves en $CONF/env (no se muestran)"

log "4/6 Descargando el motor ($REF)"
TMP="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar xz -C "$TMP"
SRC="$(find "$TMP" -maxdepth 2 -type d -name agentes | head -1)"
[ -f "$SRC/motor.mjs" ] || fail "No encuentro agentes/motor.mjs en el repositorio"
mkdir -p "$APP"
cp "$SRC/motor.mjs" "$SRC/package.json" "$SRC/package-lock.json" "$APP/"
cp "$SRC/orozco-agentes.service" /etc/systemd/system/orozco-agentes.service
rm -rf "$TMP"
( cd "$APP" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
chown -R root:root "$APP"
ok "Código en $APP"

log "5/6 Comprobando las claves"
set -a; . "$CONF/env"; set +a
AUTH=(); case "$SUPABASE_SERVICE_KEY" in eyJ*) AUTH=(-H "Authorization: Bearer $SUPABASE_SERVICE_KEY") ;; esac
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $SUPABASE_SERVICE_KEY" "${AUTH[@]}" "$SUPABASE_URL/rest/v1/agentes?select=id&limit=1")
[ "$code" = "200" ] || fail "Supabase responde $code con esa clave. Borra $CONF/env y vuelve a ejecutar el script."
code=$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models)
[ "$code" = "200" ] || fail "Anthropic responde $code con esa clave. Borra $CONF/env y vuelve a ejecutar el script."
unset ANTHROPIC_API_KEY SUPABASE_SERVICE_KEY
ok "Las dos claves funcionan"

log "6/6 Servicio"
systemctl daemon-reload
systemctl enable orozco-agentes >/dev/null 2>&1
systemctl restart orozco-agentes
sleep 4
curl -fsS http://127.0.0.1:8790/salud >/dev/null || { journalctl -u orozco-agentes -n 30 --no-pager; fail "El motor no responde"; }
ok "Motor funcionando"
free -m | awk 'NR==2{printf "    Memoria: %s MB usados de %s MB\n", $3, $2}'
printf '\n\033[1;32mTODO LISTO.\033[0m\n'
