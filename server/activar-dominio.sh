#!/usr/bin/env bash
# Activa orozcoimport.es (y www → sin www) en este servidor.
# Uso (root): curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/<commit>/server/activar-dominio.sh | bash -s <commit>
set -euo pipefail
REF="${1:-main}"
RAW="https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/$REF"
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root"; exit 1; }
curl -fsSL "$RAW/server/oi-site" -o /usr/local/bin/oi-site </dev/null
chmod 755 /usr/local/bin/oi-site
[ -f /srv/sites/orozcoimport.es/index.html ] || { echo "ERROR: la web aún no está en /srv/sites/orozcoimport.es"; exit 1; }
oi-site static orozcoimport.es </dev/null
oi-site redirect www.orozcoimport.es https://orozcoimport.es </dev/null
printf '\n\033[1;32mTODO LISTO.\033[0m Ahora cambia el DNS y después ejecuta: systemctl restart caddy\n'
