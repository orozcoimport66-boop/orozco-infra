#!/usr/bin/env bash
# Restablece la contraseña del conector MCP (orozco-mcp) cuando se ha olvidado.
# Borra la contraseña guardada (y las sesiones de Claude), crea un código de un solo uso y reinicia el conector.
# Después, en Claude: Conectar → escribir el código que muestra este script → elegir contraseña nueva (mínimo 12).
# Uso (root, consola de Hetzner):
#   curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/main/server/reset-clave-mcp.sh | bash
set -euo pipefail
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Ejecuta como root."
DATA=/var/lib/orozco-mcp
STATE="$DATA/state.json"
[ -d "$DATA" ] || die "No existe $DATA"

systemctl stop orozco-mcp
if [ -f "$STATE" ]; then
  cp -p "$STATE" "$STATE.$(date +%Y%m%d-%H%M%S).antes-reset"
  # Sin contraseña ni sesiones: el conector pedirá el código de instalación
  node -e 'const fs=require("fs");const f=process.argv[1];const s=JSON.parse(fs.readFileSync(f,"utf8"));s.password=null;s.access={};s.refresh={};fs.writeFileSync(f,JSON.stringify(s,null,1),{mode:0o600})' "$STATE"
  chown mcp:mcp "$STATE"
fi
head -c 4096 /dev/urandom | LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyz' | cut -c1-8 > "$DATA/setup-code"
chown mcp:mcp "$DATA/setup-code"; chmod 600 "$DATA/setup-code"
systemctl start orozco-mcp
sleep 2
curl -fsS http://127.0.0.1:8787/salud >/dev/null || { journalctl -u orozco-mcp -n 20 --no-pager; die "El conector no responde"; }

printf '\n\033[1;32mLISTO.\033[0m En Claude: Ajustes → Conectores → Servidor Orozco → Conectar.\n'
printf 'Te pedirá este CÓDIGO (se usa una vez) y una contraseña nueva de al menos 12 caracteres:\n\n      \033[1;33m%s\033[0m\n\n' "$(cat "$DATA/setup-code")"
printf 'Guarda la contraseña nueva en el gestor de contraseñas.\n'
